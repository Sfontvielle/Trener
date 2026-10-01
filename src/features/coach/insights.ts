import { daysBetween, formatHours, today, weekdayIndex } from '@/utils/date';
import type { DailyCheckIn, FoodEntry, NutritionTarget, ReadinessResult, UserProfile, WeightEntry, WorkoutPlan, WorkoutSession, PlanAdjustment } from '@/types';
import { adherence } from '@/features/training/analytics';
import { checkDeload } from '@/features/training/deload';
import { lastWeekSummary } from '@/features/progress/weekly';
import type { TodayWorkout } from '@/features/training/today';
import { getExercise } from '@/data/exercises';
import { historyFor, recommend } from '@/features/training/progression';
import { remaining, sumMacros } from '@/features/nutrition/status';
import { reviewCalories } from '@/features/nutrition/adaptive';
import { fmtWeight } from '@/utils/format';

/**
 * Программные наблюдения дня — используются как офлайн-инсайт на главной и как fallback,
 * если AI недоступен. Все цифры — из расчётов, без генерации.
 */
export interface LocalInsight {
  text: string;
  priority: number;
  kind: 'safety' | 'recovery' | 'progression' | 'nutrition' | 'weight' | 'general';
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

  if (todayW.kind === 'workout' && todayW.template && (!r || r.band === 'go')) {
    for (const pe of todayW.template.exercises.slice(0, 3)) {
      const ex = getExercise(pe.exerciseId);
      if (!ex) continue;
      const h = historyFor(ex.id, args.sessions, 3);
      if (!h.length) continue;
      const rec = recommend({ exercise: ex, plannedSets: pe.sets, repMin: pe.repMin, repMax: pe.repMax, targetRir: pe.targetRir, history: h, band: r?.band });
      if (rec.action === 'increase') {
        out.push({ kind: 'progression', priority: 80, text: `${ex.name}: прошлый раз верх диапазона с запасом. Сегодня пробуем ${fmtWeight(rec.weight)} кг (+${fmtWeight(ex.increment)}).` });
        break;
      }
      if (rec.action === 'decrease') {
        out.push({ kind: 'progression', priority: 75, text: `${ex.name}: две тренировки ниже диапазона. Снижаем до ${fmtWeight(rec.weight)} кг и набираем повторы заново.` });
        break;
      }
    }
  }

  if (args.target) {
    const rev = reviewCalories({ profile: args.profile, weights: args.weights, entries: args.entries, adjustments: args.adjustments, targetKcal: args.target.kcal });
    if (rev.status === 'adjust') out.push({ kind: 'weight', priority: 70, text: `${rev.headline}: ${rev.detail}` });

    const todayEntries = args.entries.filter((e) => e.date === d);
    const rem = remaining(args.target, sumMacros(todayEntries));
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

  // Понедельник — автоматические итоги прошлой недели
  if (weekdayIndex(d) === 0) {
    const w = lastWeekSummary({ sessions: args.sessions, plan: args.plan ?? null, entries: args.entries, target: args.target, weights: args.weights, checkins: args.checkins ?? {} });
    if (w) out.push({ kind: 'general', priority: 50, text: `Итоги недели: ${w.headline}. Подробнее — в «Прогрессе».` });
  }

  // Резервная копия: данные хранятся только на телефоне
  const doneCount = args.sessions.filter((x) => x.status === 'completed').length;
  if (doneCount >= 8 && (!args.lastBackupAt || Date.now() - args.lastBackupAt > 30 * 86400000)) {
    out.push({ kind: 'general', priority: 15, text: `У тебя ${doneCount} тренировок в истории, а копии нет уже давно. Профиль → «Сохранить резервную копию».` });
  }

  const lastW = args.weights[args.weights.length - 1];
  if (!lastW || daysBetween(lastW.date, d) >= 5) out.push({ kind: 'weight', priority: 30, text: 'Взвесься утром натощак — без свежих замеров FORM не сможет точно корректировать калории.' });

  if (!c) out.push({ kind: 'general', priority: 40, text: 'Пройди утренний чек-ин (4 вопроса) — FORM подстроит объём тренировки под твоё состояние.' });

  if (todayW.kind === 'rest' && todayW.nextWorkout) out.push({ kind: 'general', priority: 20, text: `Сегодня отдых. Следующая — ${todayW.nextWorkout.template.name}. Добери белок и 8+ тыс. шагов.` });
  if (todayW.kind === 'done') out.push({ kind: 'general', priority: 20, text: 'Тренировка сделана. Теперь восстановление: белок, углеводы после тренировки и сон 7+ часов.' });

  return out.sort((a, b) => b.priority - a.priority);
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
