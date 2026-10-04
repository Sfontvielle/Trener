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
import { foodAvoidance, healthOf, healthSummary, healthTraining } from '@/features/profile/health';
import { GOAL_LABEL } from '@/features/nutrition/targets';
import { remaining, sumMacros } from '@/features/nutrition/status';
import { reviewCalories } from '@/features/nutrition/adaptive';
import { weeklyRate, weightTrend } from '@/features/progress/weightTrend';
import { adherence, progressRows, sessionVolume, setsByGroup } from '@/features/training/analytics';
import { resolveToday, MODE_LABEL } from '@/features/training/today';
import { EQUIPMENT_LABEL, GROUP_LABEL, getExercise } from '@/data/exercises';
import { LOCAL_FOODS } from '@/data/foods';
import { addDays, formatHours, today, WEEKDAYS_SHORT, toISODate } from '@/utils/date';
import { LEVEL_LABEL, planVolume } from '@/features/training/planGenerator';
import { historyFor, workingSets } from '@/features/training/progression';
import { checkDeload, isDeloadActive } from '@/features/training/deload';
import { getPrefs } from '@/features/training/engine/prefs';
import { AREA_LABEL, RESTRICTION_LABEL } from '@/features/training/engine/restrictions';
import { SPLIT_PREF_LABEL } from '@/features/training/engine/split';
import { doneFineVolume, weeklyTargets } from '@/features/training/engine/volume';
import { VM_LABEL, VOLUME_MUSCLES } from '@/features/training/engine/muscles';
import { substitutesFor } from '@/features/training/engine/substitute';
import { BRAND } from '@/config/brand';

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
  /** Реакция пользователя на прошлые советы */
  advice?: { key: string; date: string; text: string; status: 'accepted' | 'dismissed' }[];
  /** Ключи предложений, от которых пользователь отказался навсегда */
  rejected?: string[];
  /** Заметки пользователя за сегодня (дневник) */
  notes?: string[];
  /** Apple Health за сегодня и отклонения от персональной базы */
  health?: { sleepHours?: number; steps?: number; restingHr?: number; rhrDelta?: number; hrvMs?: number; hrvDeltaPct?: number; activeKcal?: number };
  /** Идущая сейчас тренировка */
  active?: WorkoutSession | null;
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
  const hp = healthOf(p);
  const hs = healthSummary(hp);
  L.push(hs.length ? `Здоровье (со слов пользователя, НЕ диагноз): ${hs.join(' | ')}` : 'Здоровье: особенностей не указано');
  const ht = healthTraining(p);
  if (ht.notes.length) L.push(`Правила из профиля здоровья (приложение применяет автоматически): ${ht.notes.join('; ')}${ht.clearance ? '; рекомендовано согласовать нагрузку с врачом' : ''}`);
  const WORK = { desk: 'сидячая', mixed: 'смешанная', physical: 'физическая' } as const;
  const TIME = { morning: 'утром', day: 'днём', evening: 'вечером', any: 'в разное время' } as const;
  L.push(`Шаги ~${p.stepsPerDay}/день, работа: ${WORK[p.workStyle]}, предпочитает тренироваться ${TIME[p.preferredTime]}`);
  const fa = foodAvoidance(p);
  L.push(`Любит: ${p.likedFoods.join(', ') || '—'}; не любит/исключить: ${fa.words.join(', ') || '—'}; ограничения питания: ${fa.restrictions.join(', ') || 'нет'}`);

  sec('GOAL');
  L.push(`${GOAL_LABEL[p.goal]}${p.goal === 'bulk' || p.goal === 'cut' ? `, темп ${p.ratePctPerWeek}% массы/нед` : ''}`);

  sec('CURRENT PLAN');
  if (i.target) L.push(`Питание: ${i.target.kcal} ккал, Б ${i.target.protein} / Ж ${i.target.fat} / У ${i.target.carbs}; TDEE ~${i.target.tdee} (${i.target.source === 'adaptive' ? 'адаптивный' : 'по формуле'}), поправка ${i.target.adjustmentKcal} ккал`);
  if (i.plan) {
    L.push(`Сплит: ${i.plan.splitLabel}, ${i.plan.daysPerWeek}×/нед, цель объёма ${i.plan.weeklySetsTarget[0]}–${i.plan.weeklySetsTarget[1]} подходов/нед на группу`);
    L.push(`Расписание: ${i.plan.schedule.map((t, idx) => `${WEEKDAYS_SHORT[idx]}=${t ? i.plan!.templates.find((x) => x.id === t)?.name : 'отдых'}`).join(', ')}`);
    L.push('templates:');
    for (const t of i.plan.templates) {
      L.push(`- id=${t.id} «${t.name}» (${t.focus}), ~${t.estMinutes} мин: ${t.exercises.map((e) => `${getExercise(e.exerciseId)?.name ?? e.exerciseId} [${e.exerciseId}] ${e.sets}×${e.repMin}-${e.repMax}`).join('; ')}`);
    }
  }
  // Предпочтения и ограничения — модель обязана их соблюдать (приложение всё равно проверит действие)
  const prefs = getPrefs(p);
  sec('TRAINING PREFERENCES & LIMITATIONS');
  L.push(`Сплит: ${SPLIT_PREF_LABEL[prefs.preferredSplit]}${i.plan?.splitChoice?.reasons.length ? ` (${BRAND}: ${i.plan.splitChoice.reasons.slice(0, 3).join('; ')})` : ''}`);
  L.push(`Восстановление (тренировочный контекст): ${prefs.recoveryProfile === 'enhanced' ? 'пользователь указал повышенное' : prefs.recoveryProfile === 'standard' ? 'стандартное' : 'определяется по данным'}${i.plan?.recovery ? `; оценка ${BRAND}: ${i.plan.recovery.level}, объём ×${i.plan.recovery.factor}` : ''}`);
  L.push(`Подходы: ${prefs.setStyle === 'auto' ? `решает ${BRAND}` : `${prefs.setStyle} в упражнении`}; повторы: ${prefs.repStyle}`);
  if (prefs.priorityMuscles.length) L.push(`Приоритетные группы: ${prefs.priorityMuscles.map((m) => VM_LABEL[m]).join(', ')}`);
  if (prefs.lowPriorityMuscles.length) L.push(`Низкий приоритет: ${prefs.lowPriorityMuscles.map((m) => VM_LABEL[m]).join(', ')}`);
  const nameId = (id: string) => `${getExercise(id)?.name ?? id} [${id}]`;
  L.push(`Исключено (НИКОГДА не предлагать): ${prefs.excluded.map((e) => `${nameId(e.exerciseId)}${e.reason === 'discomfort' ? ` — дискомфорт${e.area ? ` (${AREA_LABEL[e.area]})` : ''}` : e.reason === 'doctor' ? ' — запрет специалиста' : ''}`).join('; ') || '—'}`);
  if (prefs.excludedMovements.length) L.push(`Исключённые движения: ${prefs.excludedMovements.map((m) => RESTRICTION_LABEL[m]).join(', ')}`);
  L.push(`Не нравится: ${prefs.dislikedExercises.map(nameId).join('; ') || '—'}`);
  L.push(`Избранное: ${prefs.preferredExercises.map(nameId).join('; ') || '—'}`);
  for (const l of prefs.limitations) {
    L.push(`Ограничение: ${AREA_LABEL[l.area]}, ${l.severity === 'severe' ? 'сильный дискомфорт' : l.severity === 'moderate' ? 'умеренный' : 'лёгкий'}${l.source === 'doctor' ? ', рекомендация специалиста' : ''}; движения: ${l.movements.map((m) => RESTRICTION_LABEL[m].toLowerCase()).join(', ') || '—'}${l.note ? `; «${l.note}»` : ''}`);
  }
  if (i.rejected?.length) L.push(`Пользователь отказался (не предлагать снова): ${i.rejected.join(', ')}`);

  sec('WEEKLY VOLUME by muscle (прямые подходы: сделано за 7 дн / план / цель)');
  const tg = weeklyTargets(p, prefs, i.plan?.recovery?.factor ?? 1);
  const done7 = doneFineVolume(i.sessions, addDays(d, -6), d);
  const planned = i.plan ? planVolume(i.plan) : null;
  L.push(VOLUME_MUSCLES.filter((m) => tg[m] > 0).map((m) => `${VM_LABEL[m]} ${Math.round(done7[m])}/${planned ? Math.round(planned[m]) : '—'}/${tg[m]}`).join(', '));
  if (i.plan?.notes?.length) L.push(`Заметки плана: ${i.plan.notes.slice(0, 4).join(' | ')}`);

  const todayW = resolveToday({ date: d, plan: i.plan, sessions: i.sessions, override: i.overrides[d], readiness: i.readiness });
  sec('TODAY');
  if (todayW.kind === 'workout') L.push(`По плану: ${todayW.template!.name} (${todayW.template!.focus}), режим: ${MODE_LABEL[todayW.mode]}, ~${todayW.estMinutes} мин, ${todayW.totalSets} подходов${todayW.reason ? `; причина: ${todayW.reason}` : ''}`);
  else if (todayW.kind === 'done') L.push(`Тренировка сегодня уже выполнена: ${todayW.completedSession?.name}`);
  else if (todayW.kind === 'rest') L.push(`День отдыха${todayW.reason ? ` (${todayW.reason})` : ''}. Следующая: ${todayW.nextWorkout ? `${todayW.nextWorkout.template.name} ${todayW.nextWorkout.date}` : '—'}`);
  if (i.overrides[d]) L.push(`Изменение на сегодня: ${i.overrides[d].reason} (источник: ${i.overrides[d].source})`);
  // Упражнения сегодня: id, план, прошлый результат и допустимые замены (уже отфильтрованы ограничениями)
  const todayList = i.active
    ? i.active.exercises.map((we) => ({ id: we.exerciseId, plan: `${we.plannedSets}×${we.repMin}-${we.repMax}, отдых ${we.restSec}с`, done: workingSets(we.sets).map((x) => `${x.weight}×${x.reps}${x.rir !== undefined ? ` RIR${x.rir}` : ''}`).join(', ') }))
    : todayW.kind === 'workout'
      ? todayW.template!.exercises.map((e) => ({ id: e.exerciseId, plan: `${e.sets}×${e.repMin}-${e.repMax}, отдых ${e.restSec}с`, done: '' }))
      : [];
  if (todayList.length) {
    L.push(i.active ? `Идёт тренировка «${i.active.name}»:` : 'Упражнения сегодня:');
    for (const x of todayList) {
      const last = historyFor(x.id, i.sessions, 1)[0];
      const subs = substitutesFor(x.id, p, prefs, [], 3).map((e) => `${e.name} [${e.id}]`).join(', ');
      L.push(`- ${nameId(x.id)}: ${x.plan}${x.done ? `; сделано: ${x.done}` : ''}${last ? `; прошлый раз ${last.date}: ${workingSets(last.sets).map((st) => `${st.weight}×${st.reps}`).join(', ')}` : ''}${subs ? `; допустимые замены: ${subs}` : ''}`);
    }
  }

  if (i.notes?.length) {
    sec('TODAY NOTES (дневник пользователя)');
    for (const n of i.notes) L.push(`- ${n}`);
  }
  if (i.health) {
    const h = i.health;
    sec('APPLE HEALTH (сегодня, база — личная)');
    L.push([h.sleepHours ? `сон ${formatHours(h.sleepHours)}` : '', h.steps ? `шаги ${h.steps}` : '', h.restingHr ? `пульс покоя ${h.restingHr}${h.rhrDelta !== undefined ? ` (${h.rhrDelta >= 0 ? '+' : ''}${h.rhrDelta} к базе 14 дн)` : ''}` : '', h.hrvMs ? `HRV ${h.hrvMs} мс${h.hrvDeltaPct !== undefined ? ` (${h.hrvDeltaPct >= 0 ? '+' : ''}${h.hrvDeltaPct}% к базе 21 дн)` : ''}` : '', h.activeKcal ? `активные ккал ${h.activeKcal}` : ''].filter(Boolean).join('; ') || 'нет данных');
  }

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
        const hard = ws.filter((x) => x.feel === 'hard' || x.feel === 'max' || (x.rir !== undefined && x.rir <= 0)).length;
        return `${getExercise(we.exerciseId)?.name ?? we.exerciseId}: ${ws.map((x) => (x.weight ? `${x.weight}×${x.reps}` : `${x.reps}`)).join(', ')}${hard ? ` (тяжело: ${hard})` : ''} [план ${we.plannedSets}×${we.repMin}-${we.repMax}]`;
      })
      .filter(Boolean);
    L.push(`- ${s.date} ${s.name}: ${v.sets} подх., ${v.durationMin} мин${s.sessionRpe ? `, RPE сессии ${s.sessionRpe}` : ''}. ${ex.join(' | ')}`);
  }
  const vol7 = setsByGroup(i.sessions, addDays(d, -6), d);
  L.push(`Объём за 7 дней (подходы): ${Object.entries(vol7).map(([g, n]) => `${GROUP_LABEL[g]} ${r1(n as number)}`).join(', ') || '—'}`);

  if (isDeloadActive(i.overrides)) L.push('Сейчас идёт разгрузочная неделя (объём ×0.6, RIR +2).');
  else {
    const dl = checkDeload({ plan: i.plan, sessions: i.sessions, checkins: i.checkins, adjustments: i.adjustments, overrides: i.overrides });
    if (dl.reasons.length) L.push(`Сигналы для разгрузки: ${dl.reasons.join('; ')}${dl.suggest ? ' → рекомендована разгрузочная неделя' : ''}`);
  }

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

  if (i.advice?.length) {
    sec('ADVICE HISTORY — реакция на прошлые советы (не повторяй отклонённое без новых данных)');
    for (const a of i.advice.slice(-12)) L.push(`- ${a.date} ${a.status === 'accepted' ? 'принял' : 'отклонил'}: ${a.text.slice(0, 120)}`);
  }

  return L.join('\n');
}

export function memoryLines(memory: CoachMemoryItem[]): string[] {
  return memory.map((m) => m.text);
}
