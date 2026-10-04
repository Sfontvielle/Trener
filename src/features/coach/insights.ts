import { addDays, daysBetween, formatHours, today, weekdayIndex } from '@/utils/date';
import type { AdviceRecord } from '@/stores/coach';
import { analyzeProgram, type ProgramProposal } from '@/features/training/adaptPlan';
import { getPrefs } from '@/features/training/engine/prefs';
import { checkAllowed } from '@/features/training/engine/scoring';
import { substitutesFor } from '@/features/training/engine/substitute';
import { healthTraining } from '@/features/profile/health';
import type { BodyMetric, CoachAction, DailyCheckIn, FoodEntry, NutritionTarget, ReadinessResult, UserProfile, WeightEntry, WorkoutPlan, WorkoutSession, PlanAdjustment } from '@/types';
import { adherence } from '@/features/training/analytics';
import { checkDeload } from '@/features/training/deload';
import { lastWeekSummary } from '@/features/progress/weekly';
import type { TodayWorkout } from '@/features/training/today';
import { getExercise } from '@/data/exercises';
import { historyFor, recommend } from '@/features/training/progression';
import { remaining, sumMacros } from '@/features/nutrition/status';
import { reviewCalories } from '@/features/nutrition/adaptive';
import { fmtWeight } from '@/utils/format';
import { BRAND } from '@/config/brand';

/**
 * Программные наблюдения дня — используются как офлайн-инсайт на главной и как fallback,
 * если AI недоступен. Все цифры — из расчётов, без генерации.
 */
export interface LocalInsight {
  text: string;
  priority: number;
  kind: 'safety' | 'recovery' | 'progression' | 'nutrition' | 'weight' | 'general' | 'plan' | 'health';
  /** Стабильный ключ совета — для учёта реакции пользователя («понятно» / «не согласен») */
  key?: string;
  /** Существенное изменение программы — применяется только после подтверждения */
  proposal?: ProgramProposal;
  /** Конкретное действие (замена упражнения и т.п.) — тоже только по кнопке */
  action?: CoachAction;
}

export function localInsights(args: {
  profile: UserProfile;
  todayW: TodayWorkout;
  checkin?: DailyCheckIn;
  readiness?: ReadinessResult;
  sessions: WorkoutSession[];
  entries: FoodEntry[];
  target: NutritionTarget | null;
  weights: WeightEntry[];
  adjustments: PlanAdjustment[];
  plan?: WorkoutPlan | null;
  checkins?: Record<string, DailyCheckIn>;
  overrides?: Record<string, { mode?: string }>;
  lastBackupAt?: number;
  hour?: number;
  /** Реакция на прошлые советы: отклонённые сегодня не повторяются, частые отказы понижают приоритет */
  advice?: AdviceRecord[];
  readinessHistory?: number[];
  metrics?: BodyMetric[];
}): LocalInsight[] {
  const out: LocalInsight[] = [];
  const d = today();
  const hour = args.hour ?? new Date().getHours();
  const { checkin: c, readiness: r, todayW } = args;

  if (c?.pain) out.push({ kind: 'safety', priority: 100, text: `Отмечена боль${c.painNote ? ` (${c.painNote})` : ''}. Исключи движения, которые её вызывают; если боль острая или повторяется — к врачу.` });

  if (r && c && r.band !== 'go') {
    const parts: string[] = [];
    if (c.sleepHours < 6.5) parts.push(`сон ${formatHours(c.sleepHours)}`);
    if (c.soreness >= 4) parts.push('сильная крепатура');
    if (c.energy <= 2) parts.push('мало энергии');
    if (c.stress >= 4) parts.push('высокий стресс');
    const what = parts.length ? `${capitalize(parts.join(', '))}. ` : '';
    const act = r.band === 'reduce' ? 'Сегодня −15% подходов, веса без повышения.' : r.band === 'light' ? 'Сегодня −30% объёма и запас 3 повтора.' : 'Сегодня только лёгкая восстановительная работа или отдых.';
    out.push({ kind: 'recovery', priority: 90, text: `${what}${act}` });
  }

  // Готовность ниже обычной для ЭТОГО человека (по его же истории), даже если формально «по плану»
  const hist = (args.readinessHistory ?? []).filter((x) => x > 0);
  if (r && hist.length >= 5) {
    const usual = hist.reduce((a, b) => a + b, 0) / hist.length;
    if (r.score <= usual - 10) out.push({ kind: 'recovery', key: 'readiness_below_usual', priority: 85, text: `Сегодня восстановление хуже обычного (${r.score} при твоих обычных ~${Math.round(usual)}), поэтому нагрузку не увеличиваем — веса как в прошлый раз.` });
  }

  // Конфликт упражнения дня с ограничением (свой шаблон, перенос, изменение дня)
  if (todayW.kind === 'workout' && todayW.template) {
    const prefs = getPrefs(args.profile);
    for (const pe of todayW.template.exercises) {
      const ex = getExercise(pe.exerciseId);
      if (!ex) continue;
      const ok = checkAllowed(ex, args.profile, prefs);
      if (ok.ok || ok.reason === 'нет оборудования') continue;
      const alt = substitutesFor(ex.id, args.profile, prefs, [], 1)[0];
      out.push({
        kind: 'health',
        key: `conflict_${ex.id}`,
        priority: 95,
        text: `С учётом ограничения (${ok.reason}) «${ex.name}» лучше заменить${alt ? ` на «${alt.name}»` : ''}.`,
        action: alt ? { id: `ins_${ex.id}`, type: 'replace_exercise', label: `Заменить на «${alt.name}»`, params: { exerciseId: ex.id, toExerciseId: alt.id, scope: 'today', reason: ok.reason } } : undefined,
      });
      break;
    }
  }

  if (todayW.kind === 'workout' && todayW.template && (!r || r.band === 'go')) {
    for (const pe of todayW.template.exercises.slice(0, 3)) {
      const ex = getExercise(pe.exerciseId);
      if (!ex) continue;
      const h = historyFor(ex.id, args.sessions, 3);
      if (!h.length) continue;
      const rec = recommend({ exercise: ex, plannedSets: pe.sets, repMin: pe.repMin, repMax: pe.repMax, targetRir: pe.targetRir, history: h, band: r?.band });
      if (rec.action === 'increase') {
        const twice = h.length >= 2 && h.slice(0, 2).every((x) => x.sets.every((st) => st.reps >= pe.repMax));
        out.push({ kind: 'progression', key: `prog_${ex.id}`, priority: 80, text: twice ? `${ex.name}: на двух прошлых тренировках ты выполнил верхнюю границу повторений — сегодня можно увеличить рабочий вес до ${fmtWeight(rec.weight)} кг.` : `${ex.name}: прошлый раз верх диапазона с запасом. Сегодня пробуем ${fmtWeight(rec.weight)} кг (+${fmtWeight(ex.increment)}).` });
        break;
      }
      if (rec.action === 'decrease') {
        out.push({ kind: 'progression', priority: 75, text: `${ex.name}: две тренировки ниже диапазона. Снижаем до ${fmtWeight(rec.weight)} кг и набираем повторы заново.` });
        break;
      }
    }
  }

  if (args.target) {
    const rev = reviewCalories({ profile: args.profile, weights: args.weights, entries: args.entries, adjustments: args.adjustments, targetKcal: args.target.kcal, sessions: args.sessions, metrics: args.metrics });
    if (rev.status === 'adjust') out.push({ kind: 'weight', priority: 70, text: `${rev.headline}: ${rev.detail}` });

    const todayEntries = args.entries.filter((e) => e.date === d);
    const rem = remaining(args.target, sumMacros(todayEntries));
    // Белок несколько дней подряд ниже цели (по дням, где питание записывалось)
    const days = [1, 2, 3].map((i) => addDays(d, -i));
    const logged = days.map((day) => args.entries.filter((e) => e.date === day)).filter((list) => list.reduce((a, e) => a + e.macros.kcal, 0) > 600);
    const lowP = logged.filter((list) => sumMacros(list).protein < args.target!.protein * 0.85);
    if (logged.length >= 2 && lowP.length >= 2) {
      const avgP = Math.round(logged.reduce((a, list) => a + sumMacros(list).protein, 0) / logged.length);
      out.push({ kind: 'nutrition', key: 'protein_low_days', priority: 68, text: `Последние ${lowP.length === 3 ? 'три' : 'несколько'} дня белок ниже цели: в среднем ${avgP} из ${args.target.protein} г. Добавь в каждый приём белковый продукт — творог, яйца, курицу или протеин.` });
    }
    if (hour >= 17 && rem.protein > 40) out.push({ kind: 'nutrition', priority: 60, text: `До нормы белка ещё ${Math.round(rem.protein)} г. Вечером выгоднее творог, курица или скир — без лишнего жира.` });
    if (rem.fat < -10) out.push({ kind: 'nutrition', priority: 55, text: `Жиры уже выше плана на ${Math.round(-rem.fat)} г — до конца дня без орехов, масла и сыра.` });
  }

  // Систематическое невыполнение плана (≥2 недели истории)
  if (args.plan) {
    const firstSession = args.sessions.filter((x) => x.status === 'completed').sort((a, b) => a.startedAt - b.startedAt)[0];
    if (firstSession && daysBetween(firstSession.date, d) >= 14) {
      const a = adherence(args.sessions, args.plan, 21);
      if (a.pct !== null && a.pct < 70) {
        const missed = a.workoutsPlanned - a.workoutsDone;
        out.push({
          kind: 'general',
          priority: 65,
          text: missed >= 2
            ? `За 3 недели выполнено ${a.pct}% плана (${a.workoutsDone}/${a.workoutsPlanned} тренировок). Реалистичнее ${Math.max(2, args.plan.daysPerWeek - 1)} тренировки в неделю — поменяй в профиле, план перестроится.`
            : `За 3 недели выполнено ${a.pct}% запланированных подходов. Если не хватает времени — сократим объём, а не будем недоделывать.`,
        });
      }
    }
  }

  if (args.plan) {
    const dl = checkDeload({ plan: args.plan, sessions: args.sessions, checkins: args.checkins ?? {}, adjustments: args.adjustments, overrides: args.overrides ?? {} });
    if (dl.suggest) out.push({ kind: 'progression', priority: 72, text: `Пора разгрузиться: ${dl.reasons[0].toLowerCase()}. Включи разгрузочную неделю во вкладке «Тренировки».` });
  }

  // Адаптация программы по фактическим данным (пропуски, восстановление, застой, «слишком легко»)
  if (args.plan && args.checkins) {
    const avgReady = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : null;
    const props = analyzeProgram({ profile: args.profile, plan: args.plan, sessions: args.sessions, checkins: args.checkins, readinessAvg: avgReady });
    const p = props[0];
    if (p) out.push({ kind: 'plan', key: `program_${p.id}`, priority: 66, text: `Предложение по программе: ${p.title}. ${p.why[0]}`, proposal: p });
  }

  // Особенности здоровья, требующие согласования с врачом — напоминаем раз в неделю
  const ht = healthTraining(args.profile);
  if (ht.clearance && weekdayIndex(d) === 2) out.push({ kind: 'health', key: 'clearance', priority: 35, text: 'В профиле здоровья есть особенности, при которых интенсивность стоит согласовать с врачом. При боли, головокружении или одышке на тренировке — остановись.' });

  // Понедельник — автоматические итоги прошлой недели
  if (weekdayIndex(d) === 0) {
    const w = lastWeekSummary({ sessions: args.sessions, plan: args.plan ?? null, entries: args.entries, target: args.target, weights: args.weights, checkins: args.checkins ?? {} });
    if (w) out.push({ kind: 'general', priority: 50, text: `Итоги недели: ${w.headline}. Подробнее — в «Прогрессе».` });
  }

  // Резервная копия: данные хранятся только на телефоне
  const doneCount = args.sessions.filter((x) => x.status === 'completed').length;
  if (doneCount >= 8 && (!args.lastBackupAt || Date.now() - args.lastBackupAt > 30 * 86400000)) {
    out.push({ kind: 'general', priority: 15, text: `У тебя ${doneCount} тренировок в истории, а файл с данными ещё не экспортирован. Чтобы перенести историю на новый телефон — Профиль → Данные и конфиденциальность → «Экспортировать».` });
  }

  const lastW = args.weights[args.weights.length - 1];
  if (!lastW || daysBetween(lastW.date, d) >= 5) out.push({ kind: 'weight', priority: 30, text: `Взвесься утром натощак — без свежих замеров ${BRAND} не сможет точно корректировать калории.` });

  if (!c) out.push({ kind: 'general', priority: 40, text: `Пройди утренний чек-ин (4 вопроса) — ${BRAND} подстроит объём тренировки под твоё состояние.` });

  if (todayW.kind === 'rest' && todayW.nextWorkout) out.push({ kind: 'general', priority: 20, text: `Сегодня отдых. Следующая — ${todayW.nextWorkout.template.name}. Добери белок и 8+ тыс. шагов.` });
  if (todayW.kind === 'done') out.push({ kind: 'general', priority: 20, text: 'Тренировка сделана. Теперь восстановление: белок, углеводы после тренировки и сон 7+ часов.' });

  // Реакция на советы: «понятно/не согласен» сегодня — не повторять; частые отказы — ниже приоритет
  const adv = args.advice ?? [];
  const since = addDays(d, -14);
  return out
    .filter((i) => !i.key || !adv.some((a) => a.key === i.key && a.date === d))
    .map((i) => {
      if (!i.key || i.kind === 'safety' || i.kind === 'health') return i;
      const dismissed = adv.filter((a) => a.key === i.key && a.status === 'dismissed' && a.date >= since).length;
      return dismissed >= 2 ? { ...i, priority: i.priority - 25 * (dismissed - 1) } : i;
    })
    .sort((a, b) => b.priority - a.priority);
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
