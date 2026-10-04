import type { BodyMetric, DailyCheckIn, Exercise, GoalType, GymSetup, ISODate, LabReport, WeightEntry, WorkoutPlan, WorkoutSession } from '@/types';
import type { HealthDay } from '@/features/health/model';
import { healthGate, newLabChanges, type HealthSignal } from '@/features/health/monitor';
import { regressionKgPerWeek } from '@/features/science/maintenance';
import { waistTrend } from '@/features/science/bodyTrend';
import { measurementDue } from '@/features/progress/reminders';
import { getExercise } from '@/data/exercises';
import { historyFor, recommend } from '@/features/training/progression';
import { addDays, formatDayShort, formatHours, startOfWeek } from '@/utils/date';
import { fmtKg } from './types';

/**
 * Coach Alerts — только важное, с приоритетом, максимум 3 на экране.
 * Здоровье (срочные и «к врачу» сигналы) всегда выше прогресса.
 */
export type AlertLevel = 'urgent' | 'warning' | 'info' | 'positive';
export type AlertTarget = 'labs' | 'measure' | 'weight' | 'health' | 'workout' | 'weekly' | 'checkin';

export interface CoachAlert {
  id: string;
  level: AlertLevel;
  priority: number;
  title: string;
  text: string;
  data: string[];
  target?: AlertTarget;
}

export const MAX_ALERTS = 3;

/** Недельные средние сна (чек-ин → Apple Health) за n полных недель до текущей; null — мало ночей */
export function weeklySleep(ref: ISODate, checkins: Record<string, DailyCheckIn>, health: Record<string, HealthDay>, weeks = 3): (number | null)[] {
  const start = startOfWeek(ref);
  const out: (number | null)[] = [];
  for (let w = weeks; w >= 1; w--) {
    const from = addDays(start, -7 * w);
    const vals: number[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(from, i);
      const v = checkins[d]?.sleepHours ?? health[d]?.sleepHours;
      if (v) vals.push(v);
    }
    out.push(vals.length >= 3 ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
  }
  return out;
}

export function coachAlerts(args: {
  ref: ISODate;
  goal: GoalType;
  targetKgPerWeek: number;
  bodyWeightKg: number;
  weights: WeightEntry[];
  metrics: BodyMetric[];
  sessions: WorkoutSession[];
  plan: WorkoutPlan | null;
  checkins: Record<string, DailyCheckIn>;
  health: Record<string, HealthDay>;
  labs: LabReport[];
  signals: HealthSignal[];
  customs?: Exercise[];
  gym?: GymSetup;
  /** Ключи, которые пользователь скрыл сегодня */
  dismissed?: string[];
}): CoachAlert[] {
  const { ref } = args;
  const out: CoachAlert[] = [];
  const gate = healthGate(args.signals);

  // 1. Здоровье
  for (const s of args.signals) {
    if (s.level === 'info') continue;
    out.push({ id: `h_${s.id}`, level: s.level === 'urgent' ? 'urgent' : 'warning', priority: s.level === 'urgent' ? 100 : s.level === 'doctor' ? 90 : 60, title: s.title, text: s.text, data: s.data, target: s.id.startsWith('lab') ? 'labs' : 'health' });
  }

  // 2. Вес быстрее цели 2 недели подряд (регрессия за 14 дней, ≥5 взвешиваний)
  const r14 = regressionKgPerWeek(args.weights, addDays(ref, -14), ref);
  if (r14 && r14.n >= 5 && r14.span >= 10 && (args.goal === 'bulk' || args.goal === 'cut')) {
    const t = args.targetKgPerWeek;
    const tol = Math.max(0.1, Math.abs(t) * 0.5, args.bodyWeightKg * 0.0012);
    const kg = (x: number) => `${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(2).replace('.', ',')} кг/нед`;
    if (args.goal === 'bulk' && r14.kgPerWeek > t + tol) out.push({ id: 'weight_fast', level: 'warning', priority: 70, title: 'Вес растёт быстрее цели', text: `2 недели вес растёт на ${kg(r14.kgPerWeek)} при цели ${kg(t)}. Лишний профицит в основном уходит в жир — в отчёте недели будет предложение снизить калории на 100–150.`, data: [`${r14.n} взвешиваний за 14 дней`], target: 'weekly' });
    if (args.goal === 'cut' && r14.kgPerWeek < t - tol) out.push({ id: 'weight_fast', level: 'warning', priority: 70, title: 'Вес уходит быстрее цели', text: `2 недели вес снижается на ${kg(r14.kgPerWeek)} при цели ${kg(t)} — растёт риск потери мышц.`, data: [`${r14.n} взвешиваний за 14 дней`], target: 'weekly' });
  }

  // 3. Талия растёт быстрее обычного: за 4 недели ≥0,3 см/нед и минимум вдвое быстрее, чем за прошлые 3 месяца
  const wRecent = waistTrend(args.metrics, ref, 28);
  const wLong = waistTrend(args.metrics, addDays(ref, -28), 90);
  if (wRecent && wRecent.days >= 14 && wRecent.cmPerWeek >= 0.3 && (!wLong || wRecent.cmPerWeek >= Math.max(0.15, wLong.cmPerWeek * 2))) {
    out.push({ id: 'waist_fast', level: 'warning', priority: 65, title: 'Талия растёт быстрее обычного', text: `+${String(wRecent.changeCm).replace('.', ',')} см за ${Math.round(wRecent.days / 7)} нед.${wLong ? ` (обычно ${wLong.cmPerWeek >= 0 ? '+' : ''}${String(wLong.cmPerWeek).replace('.', ',')} см/нед)` : ''}. Если вес растёт тоже — набор, возможно, слишком быстрый.`, data: [`${wRecent.samples} замеров талии`], target: 'measure' });
  }

  // 4. Пора измерить талию
  const due = measurementDue(args.weights, args.metrics, ref);
  if (due && due.kind === 'waist') out.push({ id: 'waist_due', level: 'info', priority: 30, title: 'Пора измерить талию', text: due.daysSince === null ? 'Талия раз в неделю помогает понять, за счёт чего меняется вес.' : `Последний замер ${due.daysSince} дн. назад. 10 секунд — и тренер увидит, за счёт чего меняется вес.`, data: [], target: 'measure' });

  // 5. Верх диапазона 2 раза подряд → можно увеличить (если здоровье позволяет)
  if (args.plan && !gate.blockIncrease) {
    const seen = new Set<string>();
    for (const t of args.plan.templates) {
      for (const pe of t.exercises) {
        if (seen.has(pe.exerciseId)) continue;
        seen.add(pe.exerciseId);
        const ex = getExercise(pe.exerciseId, args.customs ?? []);
        if (!ex || ex.bodyweight) continue;
        const h = historyFor(ex.id, args.sessions, 3);
        if (h.length < 2 || h[0].date < addDays(ref, -14)) continue;
        const twice = h.slice(0, 2).every((x) => x.sets.length > 0 && x.sets.every((s) => s.reps >= pe.repMax));
        if (!twice) continue;
        const rec = recommend({ exercise: ex, plannedSets: pe.sets, repMin: pe.repMin, repMax: pe.repMax, targetRir: pe.targetRir, history: h, gym: args.gym });
        if (rec.action !== 'increase') continue;
        const top = Math.max(...h[0].sets.map((s) => s.weight));
        out.push({ id: `top_${ex.id}`, level: 'positive', priority: 50, title: `${ex.name}: можно увеличить вес`, text: `Две тренировки подряд верх диапазона (${pe.repMax} повт.) на ${fmtKg(top)} кг. В следующий раз — ${fmtKg(rec.weight)} кг.`, data: h.slice(0, 2).map((x) => `${formatDayShort(x.date)}: ${x.sets.map((s) => s.reps).join('/')}`), target: 'workout' });
        break;
      }
      if (out.some((a) => a.id.startsWith('top_'))) break;
    }
  }

  // 6. Сон ухудшается 3 недели подряд (каждая неделя ниже предыдущей, суммарно ≥30 мин)
  const ws = weeklySleep(ref, args.checkins, args.health, 3);
  if (ws.every((x): x is number => x !== null) && ws[0] > ws[1] && ws[1] > ws[2] && ws[0] - ws[2] >= 0.5) {
    out.push({ id: 'sleep_down', level: 'warning', priority: 55, title: 'Сон ухудшается 3 недели', text: `В среднем ${ws.map((x) => formatHours(x)).join(' → ')} ч. Недосып снижает восстановление и прогресс — тренер не будет повышать объём, пока сон не вернётся.`, data: ['средние по неделям: чек-ин и Apple Health'], target: 'checkin' });
  }

  // 7. Новые анализы с изменениями ≥3 показателей
  const nl = newLabChanges(args.labs, ref);
  if (nl && nl.changed >= 3) out.push({ id: 'labs_changed', level: 'info', priority: 75, title: `Новые анализы: изменились ${nl.changed} показателя`, text: `${nl.names.join(', ')}${nl.changed > 3 ? ' и др.' : ''}. Посмотрите «Что изменилось с прошлого анализа».`, data: [`анализ от ${formatDayShort(nl.date)}`], target: 'labs' });

  const hidden = new Set(args.dismissed ?? []);
  return out
    .filter((a) => !hidden.has(a.id) || a.level === 'urgent')
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_ALERTS);
}
