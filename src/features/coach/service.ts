import { router } from 'expo-router';
import type { CoachAction, CoachMessage, KnowledgeSource, PlannedExercise, VolumeMuscle } from '@/types';
import { KB_SOURCES, pubmedSearchUrl } from './local/kbSources';
import { searchReviews } from '@/services/knowledge';
import { useProfile } from '@/stores/profile';
import { usePlan } from '@/stores/plan';
import { useWorkouts } from '@/stores/workouts';
import { useBody } from '@/stores/body';
import { useNutrition } from '@/stores/nutrition';
import { useCheckins } from '@/stores/checkins';
import { useCoach } from '@/stores/coach';
import { useHealth } from '@/stores/health';
import { useJournal } from '@/stores/journal';
import { healthContext } from '@/features/health/model';
import { readinessFor } from '@/features/recovery/derive';
import { resolveToday } from '@/features/training/today';
import { applyCalorieDelta, applyProfile } from '@/features/profile/applyProfile';
import { excludeExercise, getPrefs, toggleFavorite, withPrefs } from '@/features/training/engine/prefs';
import { estimateMinutes } from '@/features/training/engine/time';
import { DEFAULT_SETS, makeWorkoutExercise } from '@/features/training/session';
import { applyDeload } from '@/features/training/deloadActions';
import { openGenerated, startExercises, startTodayPlanned } from '@/features/training/actions';
import { getExercise } from '@/data/exercises';
import { actionKey, applyToExercises, validateAction, validateActions, type ActionContext } from './actions';
import { askCoach, coachBaseUrl, CoachApiError, coachErrorText, summarizeConversation, type CoachApiAction } from '@/services/coachApi';
import { buildCoachContext } from './context';
import { decisionsContext } from './decisions/context';
import { currentAlerts, currentCoachToday } from './brief';
import { currentHealthSignals } from '@/features/health/current';
import { useLabs } from '@/stores/labs';
import { useEnhanced } from '@/stores/enhanced';
import { detectSafety, safetyReply } from './safety';
import { localInsights } from './insights';
import { localCoach } from './local/engine';
import { extractFacts } from './local/memory';
import { addDays, today } from '@/utils/date';
import { uid } from '@/utils/id';
import { LOCAL_FOODS } from '@/data/foods';

function snapshot() {
  const profile = useProfile.getState().profile!;
  const ps = usePlan.getState();
  const ws = useWorkouts.getState();
  const nut = useNutrition.getState();
  const checkins = useCheckins.getState().byDate;
  const d = today();
  const readiness = readinessFor(d, checkins, ws.sessions, useHealth.getState().days);
  const todayW = resolveToday({ date: d, plan: ps.plan, sessions: ws.sessions, override: ps.overrides[d], readiness });
  return { profile, ps, ws, nut, checkins, readiness, todayW, weights: useBody.getState().weights, memory: useCoach.getState().memory };
}

export function currentContext(): string {
  const s = snapshot();
  const extra = decisionsContext({ coach: currentCoachToday(), alerts: currentAlerts(), signals: currentHealthSignals(), labs: useLabs.getState().reports, enhanced: useEnhanced.getState().enabled });
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
    advice: useCoach.getState().advice,
    rejected: useCoach.getState().rejected,
    active: s.ws.active,
    notes: useJournal.getState().notes.filter((n) => n.date === today()).map((n) => `${new Date(n.at).toTimeString().slice(0, 5)} ${n.text}`),
    health: healthContext(useHealth.getState().days, today()),
  }) + extra;
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
    checkins: s.checkins,
    overrides: s.ps.overrides,
    lastBackupAt: useProfile.getState().settings.lastBackupAt,
    advice: useCoach.getState().advice,
    readinessHistory: readinessHistory(14),
    metrics: useBody.getState().metrics,
  });
}

/** Готовность за прошлые дни (без сегодняшнего) — личная «норма» для сравнения */
export function readinessHistory(days: number): number[] {
  const ws = useWorkouts.getState();
  const checkins = useCheckins.getState().byDate;
  const hd = useHealth.getState().days;
  const out: number[] = [];
  for (let i = 1; i <= days; i++) {
    const r = readinessFor(addDays(today(), -i), checkins, ws.sessions, hd);
    if (r) out.push(r.score);
  }
  return out;
}

/** Контекст для валидации действий: сегодняшние упражнения — из активной тренировки или плана дня */
export function actionContext(): ActionContext {
  const s = snapshot();
  const active = s.ws.active;
  const todayExercises: PlannedExercise[] = active
    ? active.exercises.map((we) => ({ exerciseId: we.exerciseId, sets: we.plannedSets, repMin: we.repMin, repMax: we.repMax, targetRir: we.targetRir, restSec: we.restSec }))
    : s.todayW.template?.exercises ?? [];
  return { profile: s.profile, plan: s.ps.plan, todayExercises, sessions: s.ws.sessions, customs: s.ws.customExercises, rejected: useCoach.getState().rejected };
}

const num = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: string | null | undefined) => (typeof v === 'string' && v ? v : undefined);

function mapActions(list: CoachApiAction[]): CoachAction[] {
  const mapped: CoachAction[] = list.map((a) => ({
    id: uid('act_'),
    type: a.type,
    label: a.label || 'Применить',
    params: {
      mode: a.mode ?? undefined,
      volumeFactor: num(a.volumeFactor),
      rirDelta: num(a.rirDelta),
      templateId: a.type === 'swap_today' || a.type === 'reschedule_workout' ? str(a.templateId) ?? null : undefined,
      deltaKcal: num(a.deltaKcal),
      reason: a.reason,
      exerciseId: str(a.exerciseId),
      toExerciseId: str(a.toExerciseId),
      scope: a.scope ?? undefined,
      sets: num(a.sets),
      repMin: num(a.repMin),
      repMax: num(a.repMax),
      weightKg: num(a.weightKg),
      restSec: num(a.restSec),
      order: Array.isArray(a.order) ? a.order : undefined,
      muscle: (str(a.muscle ?? undefined) as VolumeMuscle | undefined) ?? undefined,
      deltaSets: num(a.deltaSets),
      split: a.split ?? undefined,
      minutes: num(a.minutes),
    },
  }));
  // Модель предлагает — приложение проверяет. Недопустимые действия видны, но без кнопки «Применить»
  return validateActions(mapped, actionContext());
}

const MODE_DEFAULTS = { reduced: [0.85, 0], light: [0.7, 1], recovery: [0.5, 2], rest: [0, 0], deload: [0.6, 3] } as const;

function markAction(messageId: string, actionId: string, patch: Partial<CoachAction>) {
  const coach = useCoach.getState();
  const msg = coach.messages.find((m) => m.id === messageId);
  if (msg?.actions) coach.patchMessage(messageId, { actions: msg.actions.map((a) => (a.id === actionId ? { ...a, ...patch } : a)) });
}

/** «Не менять» / «Больше не предлагать эту замену» */
export function declineCoachAction(messageId: string, action: CoachAction, forever = false) {
  if (forever) useCoach.getState().addRejected(actionKey(action));
  markAction(messageId, action.id, { declined: true });
}

/** Изменение состава тренировки: в активной сессии — сразу, иначе — только на сегодня (override) или в шаблонах плана */
function applyExerciseChange(action: CoachAction) {
  const p = action.params;
  const d = today();
  const ws = useWorkouts.getState();
  const ps = usePlan.getState();
  const active = ws.active;
  if (p.scope !== 'plan' && active && (action.type === 'reorder_exercises' || active.exercises.some((we) => we.exerciseId === p.exerciseId))) {
    const ctx = { sessions: ws.sessions, customs: ws.customExercises, volumeFactor: 1, rirDelta: 0, gym: useProfile.getState().settings.gym };
    ws.patchActive((s) => {
      if (action.type === 'reorder_exercises') {
        const rest = [...s.exercises];
        const order = (p.order ?? []).map((id) => rest.splice(rest.findIndex((x) => x.exerciseId === id), 1)[0]).filter(Boolean);
        return { ...s, exercises: [...order, ...rest] };
      }
      return {
        ...s,
        exercises: s.exercises.map((we) => {
          if (we.exerciseId !== p.exerciseId) return we;
          const pe: PlannedExercise = { exerciseId: we.exerciseId, sets: we.plannedSets, repMin: we.repMin, repMax: we.repMax, targetRir: we.targetRir, restSec: we.restSec };
          const next = applyToExercises([pe], action)[0];
          // Сделанные подходы сохраняются; меняются только будущие
          if (action.type === 'replace_exercise') return makeWorkoutExercise(next, ctx) ?? we;
          const doneSets = we.sets.filter((x) => x.done);
          let sets = we.sets;
          if (action.type === 'change_sets') {
            const todo = we.sets.filter((x) => !x.done);
            const need = Math.max(0, next.sets - doneSets.length);
            const tmpl = todo[0] ?? we.sets[we.sets.length - 1];
            sets = [...doneSets, ...todo.slice(0, need), ...Array.from({ length: Math.max(0, need - todo.length) }, () => ({ id: uid('s_'), weight: tmpl?.weight ?? 0, reps: tmpl?.reps ?? next.repMin, done: false }))];
          }
          if (action.type === 'change_target_weight' && p.weightKg !== undefined) sets = sets.map((x) => (x.done ? x : { ...x, weight: p.weightKg! }));
          return { ...we, plannedSets: next.sets, repMin: next.repMin, repMax: next.repMax, restSec: next.restSec, sets };
        }),
      };
    });
    return;
  }
  if (p.scope === 'plan' && ps.plan) {
    for (const t of ps.plan.templates) {
      if (!t.exercises.some((x) => x.exerciseId === p.exerciseId)) continue;
      const exercises = applyToExercises(t.exercises, action);
      ps.updateTemplate({ ...t, exercises, estMinutes: estimateMinutes(exercises, ws.customExercises) });
    }
    ps.addAdjustment({ kind: 'volume', summary: `План: ${action.label}`, source: 'coach' });
    return;
  }
  const readiness = readinessFor(d, useCheckins.getState().byDate, ws.sessions, useHealth.getState().days);
  const tw = resolveToday({ date: d, plan: ps.plan, sessions: ws.sessions, override: ps.overrides[d], readiness });
  if (!tw.template) return;
  const cur = ps.overrides[d];
  ps.setOverride({ ...(cur ?? { date: d, source: 'coach' as const, createdAt: Date.now() }), date: d, templateId: tw.template.id, exercises: applyToExercises(tw.template.exercises, action), reason: action.params.reason || action.label, source: 'coach' });
  ps.addAdjustment({ kind: 'day_override', summary: `Сегодня: ${action.label}`, source: 'coach' });
}

/**
 * Применение подтверждённого пользователем действия. Перед применением — повторная валидация:
 * за время между ответом и нажатием состояние могло измениться (упражнение исключено, тренировка завершена).
 */
export function applyCoachAction(messageId: string, action: CoachAction): { ok: boolean; message: string } {
  const v = validateAction(action, actionContext());
  if (!v.ok) {
    markAction(messageId, action.id, { invalid: v.reason });
    return { ok: false, message: `Не применено: ${v.reason}` };
  }
  const d = today();
  const ps = usePlan.getState();
  const p = action.params;
  const reason = p.reason || action.label;
  const profile = useProfile.getState().profile!;
  let message = 'План изменён';
  switch (action.type) {
    case 'set_day_mode': {
      const mode = p.mode ?? 'reduced';
      const def = mode === 'normal' ? [1, 0] : MODE_DEFAULTS[mode as keyof typeof MODE_DEFAULTS];
      ps.setOverride({ ...ps.overrides[d], date: d, mode, volumeFactor: mode === 'rest' ? undefined : p.volumeFactor ?? def[0], rirDelta: p.rirDelta ?? def[1], templateId: mode === 'rest' ? null : ps.overrides[d]?.templateId, reason, source: 'coach', createdAt: Date.now() });
      ps.addAdjustment({ kind: 'day_override', summary: `Сегодня: ${action.label}`, source: 'coach' });
      break;
    }
    case 'swap_today':
    case 'reschedule_workout':
      ps.setOverride({ date: d, templateId: p.templateId ?? null, mode: p.templateId ? 'normal' : 'rest', reason, source: 'coach', createdAt: Date.now() });
      ps.addAdjustment({ kind: 'day_override', summary: `Сегодня: ${action.label}`, source: 'coach' });
      break;
    case 'reduce_today_volume':
    case 'increase_today_volume': {
      const vf = p.volumeFactor ?? (action.type === 'reduce_today_volume' ? 0.85 : 1.1);
      ps.setOverride({ ...ps.overrides[d], date: d, mode: vf < 1 ? 'reduced' : 'normal', volumeFactor: vf, rirDelta: p.rirDelta ?? 0, reason, source: 'coach', createdAt: Date.now() });
      ps.addAdjustment({ kind: 'day_override', summary: `Сегодня: ${action.label}`, source: 'coach' });
      break;
    }
    case 'adjust_calories':
      applyCalorieDelta(p.deltaKcal!, reason, 'coach');
      message = 'Калории изменены';
      break;
    case 'replace_exercise':
    case 'change_sets':
    case 'change_rep_range':
    case 'change_rest_time':
    case 'change_target_weight':
    case 'reorder_exercises':
      applyExerciseChange(action);
      message = 'Тренировка изменена';
      break;
    case 'exclude_exercise':
      applyProfile(excludeExercise(profile, p.exerciseId!, 'user', { note: reason }));
      message = 'Упражнение исключено, план обновлён';
      break;
    case 'favorite_exercise':
      if (!getPrefs(profile).preferredExercises.includes(p.exerciseId!)) applyProfile(toggleFavorite(profile, p.exerciseId!));
      message = 'Добавлено в избранное';
      break;
    case 'change_split':
      applyProfile(withPrefs(profile, { preferredSplit: p.split! }));
      message = 'Сплит изменён, план перестроен';
      break;
    case 'adjust_weekly_volume': {
      const prefs = getPrefs(profile);
      const cur = prefs.volumeAdjust[p.muscle!] ?? 0;
      applyProfile(withPrefs(profile, { volumeAdjust: { ...prefs.volumeAdjust, [p.muscle!]: cur + p.deltaSets! } }));
      message = 'Недельный объём изменён';
      break;
    }
    case 'apply_deload':
      applyDeload();
      message = 'Разгрузочная неделя запланирована';
      break;
    case 'generate_workout':
      openGenerated(p.minutes ?? profile.sessionMinutes, 'auto');
      message = 'Тренировка сгенерирована';
      break;
    case 'suggest_meal':
      message = 'Ок';
      break;
    case 'start_today':
      startTodayPlanned();
      message = 'Тренировка начата';
      break;
    case 'start_custom_workout':
      startExercises(p.exerciseIds!, { name: p.name, sets: p.sets, repMin: p.repMin, repMax: p.repMax });
      message = 'Тренировка начата';
      break;
    case 'add_to_plan': {
      const t = ps.plan!.templates.find((x) => x.id === p.templateId)!;
      const ex = getExercise(p.exerciseId!, useWorkouts.getState().customExercises)!;
      ps.updateTemplate({ ...t, exercises: [...t.exercises, { exerciseId: ex.id, sets: p.sets ?? DEFAULT_SETS, repMin: p.repMin ?? ex.defaultReps[0], repMax: p.repMax ?? ex.defaultReps[1], targetRir: 1, restSec: ex.mechanic === 'compound' ? 120 : 75, why: p.reason ? `Добавлено тренером: ${p.reason}` : 'Добавлено тренером' }] });
      ps.addAdjustment({ kind: 'plan_rebuild', summary: `«${ex.name}» добавлено в ${t.name}`, source: 'coach' });
      message = `Добавлено в ${t.name}`;
      break;
    }
    case 'create_exercise':
      useWorkouts.getState().addCustomExercise({ ...p.exercise!, custom: true });
      router.push({ pathname: '/exercise/[id]', params: { id: p.exercise!.id } });
      message = `«${p.exercise!.name}» в библиотеке → «Мои»`;
      break;
  }
  markAction(messageId, action.id, { applied: true });
  return { ok: true, message };
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
  const previousQuestion = [...coach.messages].reverse().find((m) => m.role === 'user')?.text;
  coach.addMessage({ role: 'user', text });
  // Тренер помнит, что человек рассказал о себе (здоровье, травмы, питание, цели, рекорды)
  for (const f of extractFacts(text, today())) useCoach.getState().addMemory(f.text, f.category, 'user');

  // 1) Безопасность — локально и мгновенно
  const level = detectSafety(text);
  if (level !== 'none') {
    const d = today();
    usePlan.getState().setOverride({ date: d, templateId: null, mode: 'rest', reason: level === 'emergency' ? 'Тревожные симптомы — тренировка отменена' : 'Сообщение о травме/сильной боли — нагрузка отменена', source: 'coach', createdAt: Date.now() });
    useCoach.getState().addMemory(`${d}: сообщал о ${level === 'emergency' ? 'тревожных симптомах' : 'травме/сильной боли'} — «${text.slice(0, 80)}»`, 'injury', 'coach');
    return useCoach.getState().addMessage({ role: 'assistant', text: safetyReply(level), safety: true });
  }

  // Тренер работает на устройстве — сразу, без настройки
  if (!coachBaseUrl()) {
    const r = localReply(text, previousQuestion);
    const kbId = /kb:([a-z_0-9]+)/.exec(r.intent)?.[1];
    const msg = useCoach.getState().addMessage({ role: 'assistant', text: r.text, actions: validateActions(r.actions, actionContext()), safety: r.safety, sources: kbId ? knownSources(kbId) : undefined });
    if (kbId) void refreshSources(msg.id, kbId);
    return msg;
  }
  const context = currentContext();
  try {
    const r = await askCoach({ history, context, question: text, summary: coach.summary, memory: coach.memory.map((m) => m.text), mode: 'chat' });
    for (const m of r.memory) useCoach.getState().addMemory(m.text, m.category, 'coach');
    const msg = useCoach.getState().addMessage({ role: 'assistant', text: r.reply, actions: mapActions(r.actions), safety: r.safety });
    void maybeSummarize();
    return msg;
  } catch (e) {
    // Сервер недоступен — отвечает тренер на устройстве
    const r = localReply(text, previousQuestion);
    const rateLimited = e instanceof CoachApiError && e.kind === 'rate_limited';
    return useCoach.getState().addMessage({ role: 'assistant', text: rateLimited ? coachErrorText(e) : r.text, actions: validateActions(r.actions, actionContext()), offline: true });
  }
}

const KNOWLEDGE_TTL = 30 * 86400000;

/** Проверенные первоисточники темы + то, что уже находили в PubMed (кэш на устройстве) */
function knownSources(kbId: string): KnowledgeSource[] | undefined {
  const meta = KB_SOURCES[kbId];
  if (!meta) return undefined;
  const cached = useCoach.getState().knowledge[kbId]?.sources ?? [];
  const list = [...(meta.refs ?? []), ...cached];
  const seen = new Set<string>();
  const out = list.filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true))).slice(0, 4);
  return out.length ? out : meta.en ? [{ title: 'Научные обзоры по теме', org: 'PubMed', url: pubmedSearchUrl(meta.en) }] : undefined;
}

/** Если есть интернет и кэш устарел — дополняем ответ свежими обзорами и сохраняем их локально */
async function refreshSources(messageId: string, kbId: string) {
  const meta = KB_SOURCES[kbId];
  if (!meta?.en) return;
  const cached = useCoach.getState().knowledge[kbId];
  if (cached && Date.now() - cached.at < KNOWLEDGE_TTL) return;
  try {
    const found = await searchReviews(meta.en, 2);
    useCoach.getState().cacheKnowledge(kbId, found);
    const next = knownSources(kbId);
    if (next) useCoach.getState().patchMessage(messageId, { sources: next });
  } catch {
    /* без сети — остаются проверенные первоисточники */
  }
}

/** Ответ тренера на устройстве по всем данным пользователя */
export function localReply(question: string, previousQuestion?: string) {
  const s = snapshot();
  const recentProducts = s.nut.recent.map((id) => s.nut.products[id] ?? LOCAL_FOODS.find((f) => f.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  return localCoach({
    question,
    profile: s.profile,
    target: s.ps.target,
    entries: s.nut.entries,
    recentProducts,
    todayW: s.todayW,
    readiness: s.readiness,
    insights: currentLocalInsights(),
    sessions: s.ws.sessions,
    weights: s.weights,
    adjustments: s.ps.adjustments,
    plan: s.ps.plan,
    checkins: s.checkins,
    health: healthContext(useHealth.getState().days, today()),
    customs: s.ws.customExercises,
    memory: useCoach.getState().memory,
    previousQuestion,
    coach: currentCoachToday(),
  });
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
