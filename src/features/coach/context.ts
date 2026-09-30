import type {
  CoachMemoryItem,
  DailyCheckIn,
  DayOverride,
  FoodEntry,
  FoodProduct,
  NutritionTarget,
  PlanAdjustment,
  ReadinessResult,
  UserProfile,
  WeightEntry,
  WorkoutPlan,
  WorkoutSession,
} from '@/types';
import { GOAL_LABEL } from '@/features/nutrition/targets';
import { remaining, sumMacros } from '@/features/nutrition/status';
import { reviewCalories } from '@/features/nutrition/adaptive';
import { weeklyRate, weightTrend } from '@/features/progress/weightTrend';
import { adherence, progressRows, sessionVolume, setsByGroup } from '@/features/training/analytics';
import { resolveToday, MODE_LABEL } from '@/features/training/today';
import { EQUIPMENT_LABEL, GROUP_LABEL, getExercise } from '@/data/exercises';
import { LOCAL_FOODS } from '@/data/foods';
import { addDays, formatHours, today, WEEKDAYS_SHORT, toISODate } from '@/utils/date';
import { LEVEL_LABEL } from '@/features/training/planGenerator';
import { workingSets } from '@/features/training/progression';

/**
 * Структурированный контекст для AI Coach.
 * Архитектура памяти: сырые данные остаются на устройстве; модели уходят
 *  1) агрегаты за 7/30 дней (посчитаны программно),
 *  2) последние сообщения диалога + сжатое резюме старых,
 *  3) долговременная память (устойчивые факты о пользователе).
 */
export interface CoachInputs {
  profile: UserProfile;
  plan: WorkoutPlan | null;
  target: NutritionTarget | null;
  overrides: Record<string, DayOverride>;
  adjustments: PlanAdjustment[];
  sessions: WorkoutSession[];
  weights: WeightEntry[];
  entries: FoodEntry[];
  products: Record<string, FoodProduct>;
  recent: string[];
  checkins: Record<string, DailyCheckIn>;
  readiness?: ReadinessResult;
  memory: CoachMemoryItem[];
  now?: Date;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

export function buildCoachContext(i: CoachInputs): string {
  const now = i.now ?? new Date();
  const d = today();
  const p = i.profile;
  const L: string[] = [];
  const sec = (t: string) => L.push(`\n## ${t}`);

  L.push(`Сейчас: ${d}, ${WEEKDAYS_SHORT[(now.getDay() + 6) % 7]}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);

  sec('USER PROFILE');
  L.push(`${p.name}, ${p.sex === 'male' ? 'муж' : 'жен'}, ${p.age} лет, рост ${p.heightCm} см, вес (профиль) ${p.weightKg} кг`);
  L.push(`Уровень: ${LEVEL_LABEL[p.level]}, стаж ${p.trainingYears} г.; ${p.daysPerWeek} трен/нед по ~${p.sessionMinutes} мин; место: ${p.location === 'gym' ? 'зал' : 'дом'}`);
  L.push(`Оборудование: ${p.equipment.map((e) => EQUIPMENT_LABEL[e]).join(', ') || '—'}`);
  L.push(`Ограничения/травмы: ${p.limitations || 'нет'}`);
  const WORK = { desk: 'сидячая', mixed: 'смешанная', physical: 'физическая' } as const;
  const TIME = { morning: 'утром', day: 'днём', evening: 'вечером', any: 'в разное время' } as const;
  L.push(`Шаги ~${p.stepsPerDay}/день, работа: ${WORK[p.workStyle]}, предпочитает тренироваться ${TIME[p.preferredTime]}`);
  L.push(`Любит: ${p.likedFoods.join(', ') || '—'}; не любит: ${p.dislikedFoods.join(', ') || '—'}; ограничения питания: ${p.dietRestrictions.join(', ') || 'нет'}`);

  sec('GOAL');
  L.push(`${GOAL_LABEL[p.goal]}${p.goal === 'bulk' || p.goal === 'cut' ? `, темп ${p.ratePctPerWeek}% массы/нед` : ''}`);

  sec('CURRENT PLAN');
  if (i.target) L.push(`Питание: ${i.target.kcal} ккал, Б ${i.target.protein} / Ж ${i.target.fat} / У ${i.target.carbs}; TDEE ~${i.target.tdee} (${i.target.source === 'adaptive' ? 'адаптивный' : 'по формуле'}), поправка ${i.target.adjustmentKcal} ккал`);
  if (i.plan) {
    L.push(`Сплит: ${i.plan.splitLabel}, ${i.plan.daysPerWeek}×/нед, цель объёма ${i.plan.weeklySetsTarget[0]}–${i.plan.weeklySetsTarget[1]} подходов/нед на группу`);
    L.push(`Расписание: ${i.plan.schedule.map((t, idx) => `${WEEKDAYS_SHORT[idx]}=${t ? i.plan!.templates.find((x) => x.id === t)?.name : 'отдых'}`).join(', ')}`);
    L.push('templates:');
    for (const t of i.plan.templates) {
      L.push(`- id=${t.id} «${t.name}» (${t.focus}), ~${t.estMinutes} мин: ${t.exercises.map((e) => `${getExercise(e.exerciseId)?.name ?? e.exerciseId} ${e.sets}×${e.repMin}-${e.repMax}`).join('; ')}`);
    }
  }
  const todayW = resolveToday({ date: d, plan: i.plan, sessions: i.sessions, override: i.overrides[d], readiness: i.readiness });
  sec('TODAY');
  if (todayW.kind === 'workout') L.push(`По плану: ${todayW.template!.name} (${todayW.template!.focus}), режим: ${MODE_LABEL[todayW.mode]}, ~${todayW.estMinutes} мин, ${todayW.totalSets} подходов${todayW.reason ? `; причина: ${todayW.reason}` : ''}`);
  else if (todayW.kind === 'done') L.push(`Тренировка сегодня уже выполнена: ${todayW.completedSession?.name}`);
  else if (todayW.kind === 'rest') L.push(`День отдыха${todayW.reason ? ` (${todayW.reason})` : ''}. Следующая: ${todayW.nextWorkout ? `${todayW.nextWorkout.template.name} ${todayW.nextWorkout.date}` : '—'}`);
  if (i.overrides[d]) L.push(`Изменение на сегодня: ${i.overrides[d].reason} (источник: ${i.overrides[d].source})`);

  sec('READINESS / SLEEP');
  const c = i.checkins[d];
  if (c && i.readiness) {
    L.push(`Чек-ин сегодня: сон ${formatHours(c.sleepHours)} (качество ${c.sleepQuality}/5), энергия ${c.energy}/5, стресс ${c.stress}/5, мышечная усталость ${c.soreness}/5${c.pain ? `, БОЛЬ: ${c.painNote || 'да'}` : ''}${c.hrvMs ? `, HRV ${c.hrvMs}` : ''}${c.restingHr ? `, пульс покоя ${c.restingHr}` : ''}`);
    L.push(`Readiness ${i.readiness.score}/100 → ${i.readiness.headline}. Факторы: ${i.readiness.factors.slice(0, 4).map((f) => `${f.label} ${f.detail} (${f.impact > 0 ? '+' : ''}${f.impact})`).join('; ')}`);
  } else L.push('Чек-ин сегодня не пройден.');
  const sleep7 = Object.values(i.checkins).filter((x) => x.date > addDays(d, -7));
  if (sleep7.length) L.push(`Сон за 7 дней: в среднем ${formatHours(sleep7.reduce((a, x) => a + x.sleepHours, 0) / sleep7.length)} (${sleep7.length} отметок)`);

  sec('LAST 7 DAYS — TRAINING');
  const done = i.sessions.filter((s) => s.status === 'completed').sort((a, b) => b.startedAt - a.startedAt);
  const last7 = done.filter((s) => s.date > addDays(d, -7));
  if (!last7.length) L.push('Тренировок не было.');
  for (const s of last7) {
    const v = sessionVolume(s);
    const ex = s.exercises
      .map((we) => {
        const ws = workingSets(we.sets);
        if (!ws.length) return null;
        const hard = ws.filter((x) => x.feel === 'hard' || (x.rir !== undefined && x.rir <= 0)).length;
        return `${getExercise(we.exerciseId)?.name ?? we.exerciseId}: ${ws.map((x) => (x.weight ? `${x.weight}×${x.reps}` : `${x.reps}`)).join(', ')}${hard ? ` (тяжело: ${hard})` : ''} [план ${we.plannedSets}×${we.repMin}-${we.repMax}]`;
      })
      .filter(Boolean);
    L.push(`- ${s.date} ${s.name}: ${v.sets} подх., ${v.durationMin} мин${s.sessionRpe ? `, RPE сессии ${s.sessionRpe}` : ''}. ${ex.join(' | ')}`);
  }
  const vol7 = setsByGroup(i.sessions, addDays(d, -6), d);
  L.push(`Объём за 7 дней (подходы): ${Object.entries(vol7).map(([g, n]) => `${GROUP_LABEL[g]} ${r1(n as number)}`).join(', ') || '—'}`);

  sec('LAST 30 DAYS');
  const adh = adherence(i.sessions, i.plan, 28);
  L.push(`Тренировок за 28 дн: ${adh.workoutsDone} из ${adh.workoutsPlanned} по плану; выполнение плана ${adh.pct ?? '—'}% (подходы ${adh.done}/${adh.planned})`);
  const rows = progressRows(i.sessions, [], 60).slice(0, 8);
  if (rows.length) L.push(`Прогресс в упражнениях (первый → лучший, 60 дн): ${rows.map((r) => `${r.name} ${r.from} → ${r.to} (${r.gainPct >= 0 ? '+' : ''}${r.gainPct}% e1RM)`).join('; ')}`);

  sec('WEIGHT TREND');
  const tr = weightTrend(i.weights);
  if (tr.length) {
    const last = tr[tr.length - 1];
    const rate = weeklyRate(tr, 21);
    L.push(`Тренд ${r1(last.trend)} кг (последнее взвешивание ${i.weights[i.weights.length - 1].kg} кг, ${i.weights[i.weights.length - 1].date}); темп ${rate ? `${rate.kgPerWeek > 0 ? '+' : ''}${rate.kgPerWeek.toFixed(2)} кг/нед за ${rate.days} дн` : 'недостаточно данных'}`);
  } else L.push('Взвешиваний нет.');
  if (i.target) {
    const rev = reviewCalories({ profile: p, weights: i.weights, entries: i.entries, adjustments: i.adjustments, targetKcal: i.target.kcal });
    L.push(`Анализ калорий: ${rev.headline}. ${rev.detail}`);
  }
  const lastAdj = i.adjustments.slice(0, 3);
  if (lastAdj.length) L.push(`Последние изменения плана: ${lastAdj.map((a) => `${toISODate(new Date(a.createdAt))} ${a.summary}`).join('; ')}`);

  sec('NUTRITION TODAY');
  const todayEntries = i.entries.filter((e) => e.date === d);
  const eaten = sumMacros(todayEntries);
  if (i.target) {
    const rem = remaining(i.target, eaten);
    L.push(`Съедено: ${Math.round(eaten.kcal)} ккал, Б ${r1(eaten.protein)} Ж ${r1(eaten.fat)} У ${r1(eaten.carbs)}`);
    L.push(`Осталось: ${Math.round(rem.kcal)} ккал, Б ${r1(rem.protein)} Ж ${r1(rem.fat)} У ${r1(rem.carbs)} (отрицательное = перебор)`);
  }
  L.push(`Продукты сегодня: ${todayEntries.map((e) => `${e.name} ${e.grams} г`).join('; ') || 'ничего не записано'}`);
  const days7 = new Map<string, number>();
  for (const e of i.entries) if (e.date > addDays(d, -7) && e.date < d) days7.set(e.date, (days7.get(e.date) ?? 0) + e.macros.kcal);
  if (days7.size) L.push(`Среднее за ${days7.size} дн с записями: ${Math.round([...days7.values()].reduce((a, b) => a + b, 0) / days7.size)} ккал`);

  sec('FOODS — продукты на 100 г (используй для расчётов)');
  const ids = new Set<string>(i.recent.slice(0, 20));
  const liked = LOCAL_FOODS.filter((f) => p.likedFoods.some((l) => l && f.name.toLowerCase().includes(l.toLowerCase().slice(0, Math.max(3, l.length - 2)))));
  liked.forEach((f) => ids.add(f.id));
  ['local:chicken_breast', 'local:rice_cooked', 'local:cottage_5', 'local:egg', 'local:buckwheat_cooked', 'local:oats_dry', 'local:banana', 'local:greek_yogurt', 'local:turkey_breast', 'local:potato_boiled', 'local:veg_mix', 'local:bread_rye'].forEach((x) => ids.add(x));
  for (const id of [...ids].slice(0, 32)) {
    const f = i.products[id] ?? LOCAL_FOODS.find((x) => x.id === id);
    if (!f) continue;
    L.push(`- ${f.name}${f.brand ? ` (${f.brand})` : ''}: ${f.per100.kcal} ккал, Б ${f.per100.protein} Ж ${f.per100.fat} У ${f.per100.carbs}${i.recent.includes(id) ? ' [ест регулярно]' : ''}`);
  }

  return L.join('\n');
}

export function memoryLines(memory: CoachMemoryItem[]): string[] {
  return memory.map((m) => m.text);
}
