import type { CoachAction, CoachMessage } from '@/types';
import { useProfile } from '@/stores/profile';
import { usePlan } from '@/stores/plan';
import { useWorkouts } from '@/stores/workouts';
import { useBody } from '@/stores/body';
import { useNutrition } from '@/stores/nutrition';
import { useCheckins } from '@/stores/checkins';
import { useCoach } from '@/stores/coach';
import { readinessFor } from '@/features/recovery/derive';
import { resolveToday } from '@/features/training/today';
import { applyCalorieDelta } from '@/features/profile/applyProfile';
import { askCoach, CoachApiError, coachErrorText, summarizeConversation, type CoachApiAction } from '@/services/coachApi';
import { buildCoachContext } from './context';
import { detectSafety, safetyReply } from './safety';
import { localInsights } from './insights';
import { offlineAnswer } from './offline';
import { today } from '@/utils/date';
import { uid } from '@/utils/id';
import { LOCAL_FOODS } from '@/data/foods';

function snapshot() {
  const profile = useProfile.getState().profile!;
  const ps = usePlan.getState();
  const ws = useWorkouts.getState();
  const nut = useNutrition.getState();
  const checkins = useCheckins.getState().byDate;
  const d = today();
  const readiness = readinessFor(d, checkins, ws.sessions);
  const todayW = resolveToday({ date: d, plan: ps.plan, sessions: ws.sessions, override: ps.overrides[d], readiness });
  return { profile, ps, ws, nut, checkins, readiness, todayW, weights: useBody.getState().weights, memory: useCoach.getState().memory };
}

export function currentContext(): string {
  const s = snapshot();
  return buildCoachContext({
    profile: s.profile,
    plan: s.ps.plan,
    target: s.ps.target,
    overrides: s.ps.overrides,
    adjustments: s.ps.adjustments,
    sessions: s.ws.sessions,
    weights: s.weights,
    entries: s.nut.entries,
    products: s.nut.products,
    recent: s.nut.recent,
    checkins: s.checkins,
    readiness: s.readiness,
    memory: s.memory,
  });
}

export function currentLocalInsights() {
  const s = snapshot();
  return localInsights({
    profile: s.profile,
    todayW: s.todayW,
    checkin: s.checkins[today()],
    readiness: s.readiness,
    sessions: s.ws.sessions,
    entries: s.nut.entries,
    target: s.ps.target,
    weights: s.weights,
    adjustments: s.ps.adjustments,
    plan: s.ps.plan,
  });
}

function mapActions(list: CoachApiAction[]): CoachAction[] {
  const out: CoachAction[] = [];
  const plan = usePlan.getState().plan;
  for (const a of list) {
    if (a.type === 'swap_today' && a.templateId && !plan?.templates.some((t) => t.id === a.templateId)) continue;
    if (a.type === 'adjust_calories' && (!a.deltaKcal || Math.abs(a.deltaKcal) > 400)) continue;
    out.push({
      id: uid('act_'),
      type: a.type,
      label: a.label || 'Применить',
      params: {
        mode: a.mode ?? undefined,
        volumeFactor: a.volumeFactor ?? undefined,
        rirDelta: a.rirDelta ?? undefined,
        templateId: a.type === 'swap_today' ? a.templateId : undefined,
        deltaKcal: a.deltaKcal ?? undefined,
        reason: a.reason,
      },
    });
  }
  return out;
}

const MODE_DEFAULTS = { reduced: [0.85, 0], light: [0.7, 1], recovery: [0.5, 2], rest: [0, 0] } as const;

/** Применение предложенного изменения: план реально меняется */
export function applyCoachAction(messageId: string, action: CoachAction): string {
  const d = today();
  const ps = usePlan.getState();
  const reason = action.params.reason || action.label;
  if (action.type === 'set_day_mode') {
    const mode = action.params.mode ?? 'reduced';
    const def = mode === 'normal' ? [1, 0] : MODE_DEFAULTS[mode as keyof typeof MODE_DEFAULTS];
    ps.setOverride({
      date: d,
      mode,
      volumeFactor: mode === 'rest' ? undefined : action.params.volumeFactor ?? def[0],
      rirDelta: action.params.rirDelta ?? def[1],
      templateId: mode === 'rest' ? null : ps.overrides[d]?.templateId,
      reason,
      source: 'coach',
      createdAt: Date.now(),
    });
    ps.addAdjustment({ kind: 'day_override', summary: `Сегодня: ${action.label}`, source: 'coach' });
  } else if (action.type === 'swap_today') {
    ps.setOverride({ date: d, templateId: action.params.templateId ?? null, mode: action.params.templateId ? 'normal' : 'rest', reason, source: 'coach', createdAt: Date.now() });
    ps.addAdjustment({ kind: 'day_override', summary: `Сегодня: ${action.label}`, source: 'coach' });
  } else if (action.type === 'adjust_calories' && action.params.deltaKcal) {
    applyCalorieDelta(action.params.deltaKcal, reason, 'coach');
  }
  const coach = useCoach.getState();
  const msg = coach.messages.find((m) => m.id === messageId);
  if (msg?.actions) coach.patchMessage(messageId, { actions: msg.actions.map((a) => (a.id === action.id ? { ...a, applied: true } : a)) });
  return reason;
}

const HISTORY_WINDOW = 16;
const SUMMARIZE_AFTER = 30;

async function maybeSummarize() {
  const c = useCoach.getState();
  const unsummarized = c.messages.filter((m) => m.createdAt > c.summarizedUntil && !m.error);
  if (unsummarized.length < SUMMARIZE_AFTER) return;
  const old = unsummarized.slice(0, unsummarized.length - HISTORY_WINDOW);
  try {
    const summary = await summarizeConversation(old.map((m) => ({ role: m.role, text: m.text })), c.summary);
    useCoach.getState().setSummary(summary, old[old.length - 1].createdAt);
  } catch {
    /* резюме необязательно — повторим позже */
  }
}

export async function sendCoachMessage(text: string): Promise<CoachMessage> {
  const coach = useCoach.getState();
  const history = coach.messages.filter((m) => !m.error && !m.safety).slice(-HISTORY_WINDOW).map((m) => ({ role: m.role, text: m.text }));
  coach.addMessage({ role: 'user', text });

  // 1) Безопасность — локально и мгновенно
  const level = detectSafety(text);
  if (level !== 'none') {
    const d = today();
    usePlan.getState().setOverride({ date: d, templateId: null, mode: 'rest', reason: level === 'emergency' ? 'Тревожные симптомы — тренировка отменена' : 'Сообщение о травме/сильной боли — нагрузка отменена', source: 'coach', createdAt: Date.now() });
    useCoach.getState().addMemory(`${d}: сообщал о ${level === 'emergency' ? 'тревожных симптомах' : 'травме/сильной боли'} — «${text.slice(0, 80)}»`, 'injury', 'coach');
    return useCoach.getState().addMessage({ role: 'assistant', text: safetyReply(level), safety: true });
  }

  const context = currentContext();
  try {
    const r = await askCoach({ history, context, question: text, summary: coach.summary, memory: coach.memory.map((m) => m.text), mode: 'chat' });
    for (const m of r.memory) useCoach.getState().addMemory(m.text, m.category, 'coach');
    const msg = useCoach.getState().addMessage({ role: 'assistant', text: r.reply, actions: mapActions(r.actions), safety: r.safety });
    void maybeSummarize();
    return msg;
  } catch (e) {
    const s = snapshot();
    const recentProducts = s.nut.recent.map((id) => s.nut.products[id] ?? LOCAL_FOODS.find((f) => f.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
    const off = offlineAnswer({ question: text, profile: s.profile, target: s.ps.target, entries: s.nut.entries, recentProducts, todayW: s.todayW, readiness: s.readiness, insights: currentLocalInsights() });
    const note = coachErrorText(e);
    const rateLimited = e instanceof CoachApiError && e.kind === 'rate_limited';
    return useCoach.getState().addMessage({ role: 'assistant', text: rateLimited ? note : `${note}\n\n${off.text}`, actions: off.actions, offline: true });
  }
}

/** Инсайт дня для главной: AI, если доступен, иначе — программный. Кэшируется по ключу входных данных. */
export async function refreshDailyInsight(key: string): Promise<void> {
  const d = today();
  const cur = useCoach.getState().insight;
  if (cur && cur.date === d && cur.key === key && cur.source === 'ai') return;
  const local = currentLocalInsights()[0];
  if (local) useCoach.getState().setInsight({ date: d, key, text: local.text, source: 'local', createdAt: Date.now() });
  if (local?.kind === 'safety') return;
  try {
    const coach = useCoach.getState();
    const r = await askCoach({ history: [], context: currentContext(), summary: coach.summary, memory: coach.memory.map((m) => m.text), mode: 'insight' });
    useCoach.getState().setInsight({ date: d, key, text: r.reply.slice(0, 240), source: 'ai', createdAt: Date.now() });
  } catch {
    /* остаётся локальный инсайт */
  }
}
