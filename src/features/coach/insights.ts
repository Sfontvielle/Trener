import type { DailyCheckIn, FoodEntry, NutritionTarget, ReadinessResult, UserProfile, WeightEntry, WorkoutSession, PlanAdjustment } from '@/types';
import type { TodayWorkout } from '@/features/training/today';
import { getExercise } from '@/data/exercises';
import { historyFor, recommend } from '@/features/training/progression';
import { remaining, sumMacros } from '@/features/nutrition/status';
import { reviewCalories } from '@/features/nutrition/adaptive';
import { daysBetween, formatHours, today } from '@/utils/date';
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
