import type { CoachAction, DailyCheckIn, Exercise, FoodEntry, FoodProduct, NutritionTarget, PlanAdjustment, ReadinessResult, UserProfile, WeightEntry, WorkoutPlan, WorkoutSession } from '@/types';
import type { TodayWorkout } from '@/features/training/today';
import type { LocalInsight } from '../insights';
import type { HealthContext } from '@/features/health/model';
import { EXERCISES, getExercise } from '@/data/exercises';
import { getPrefs } from '@/features/training/engine/prefs';
import { substitutesFor } from '@/features/training/engine/substitute';
import { progressStatus } from '@/features/training/engine/scoring';
import { historyFor, recommend } from '@/features/training/progression';
import { reviewCalories } from '@/features/nutrition/adaptive';
import { lastWeekSummary } from '@/features/progress/weekly';
import { offlineAnswer } from '../offline';
import { detectSafety, safetyReply } from '../safety';
import { KB, MED_NOTE, type KbEntry } from './kb';
import { uid } from '@/utils/id';
import { formatHours } from '@/utils/date';

/**
 * FORM Coach на устройстве: без сервера и настройки.
 * 1) безопасность (красные флаги) — всегда первой;
 * 2) личные намерения с данными: упражнение (замена / техника / вес), еда сейчас, тренировка сегодня,
 *    почему стоит вес, итоги недели, боль в зоне;
 * 3) база знаний (тренировки, питание, восстановление, добавки, медицина) с подстановкой твоих чисел;
 * 4) иначе — главное по твоим данным на сегодня и подсказка, о чём спросить.
 */
export interface LocalCtx {
  question: string;
  profile: UserProfile;
  target: NutritionTarget | null;
  entries: FoodEntry[];
  recentProducts: FoodProduct[];
  todayW: TodayWorkout;
  readiness?: ReadinessResult;
  insights: LocalInsight[];
  sessions: WorkoutSession[];
  weights: WeightEntry[];
  adjustments: PlanAdjustment[];
  plan: WorkoutPlan | null;
  checkins: Record<string, DailyCheckIn>;
  health?: HealthContext;
  customs?: Exercise[];
}

export interface LocalReply {
  text: string;
  actions: CoachAction[];
  /** Какая ветка ответила (для тестов и отладки) */
  intent: string;
  safety?: boolean;
}

export function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”.,!?;:()]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Упражнения в вопросе ────────────────────────────────────────────────────
const ALIASES: [string, string][] = [
  ['жим лежа', 'bench_press'],
  ['жим штанги лежа', 'bench_press'],
  ['жим гантел', 'db_bench_press'],
  ['жим стоя', 'ohp'],
  ['армейск', 'ohp'],
  ['жим над голов', 'ohp'],
  ['становая', 'deadlift'],
  ['станова', 'deadlift'],
  ['румынск', 'romanian_deadlift'],
  ['присед', 'back_squat'],
  ['жим ног', 'leg_press'],
  ['подтягив', 'pull_up'],
  ['верхн блок', 'lat_pulldown'],
  ['тяга блока', 'lat_pulldown'],
  ['тяга штанги в наклон', 'barbell_row'],
  ['тяга в наклон', 'barbell_row'],
  ['выпад', 'walking_lunge'],
  ['болгарск', 'bulgarian_split_squat'],
  ['ягодичный мост', 'hip_thrust'],
  ['хип траст', 'hip_thrust'],
  ['махи', 'lateral_raise'],
  ['бицепс', 'barbell_curl'],
  ['молот', 'hammer_curl'],
  ['француз', 'skullcrusher'],
  ['брусья', 'chest_dip'],
  ['отжиман', 'push_up'],
  ['разгибания ног', 'leg_extension'],
  ['сгибания ног', 'lying_leg_curl'],
  ['икр', 'standing_calf_raise'],
  ['планк', 'plank'],
];

export function findExercise(q: string, customs: Exercise[] = []): Exercise | undefined {
  const n = norm(q);
  // Точное название (длинные — первыми, чтобы «жим гантелей на наклонной» побеждал «жим гантелей»)
  const all = [...EXERCISES, ...customs].sort((a, b) => b.name.length - a.name.length);
  const byName = all.find((e) => n.includes(norm(e.name)));
  if (byName) return byName;
  for (const [alias, id] of ALIASES) if (n.includes(alias)) return getExercise(id, customs);
  return undefined;
}

// ── База знаний: поиск ─────────────────────────────────────────────────────
export function kbMatch(q: string): { entry: KbEntry; score: number } | undefined {
  const n = norm(q);
  let best: { entry: KbEntry; score: number } | undefined;
  for (const e of KB) {
    if (e.any && !e.any.some((k) => n.includes(k))) continue;
    let score = 0;
    for (const k of e.keys) if (n.includes(k)) score += k.includes(' ') ? 2.5 : 1.5 + Math.min(1, k.length / 8);
    if (score > 0 && (!best || score > best.score)) best = { entry: e, score };
  }
  return best;
}

const has = (n: string, re: RegExp) => re.test(n);

export function localCoach(c: LocalCtx): LocalReply {
  const q = c.question;
  const n = norm(q);
  const prefs = getPrefs(c.profile);
  const actions: CoachAction[] = [];

  // 1. Безопасность
  const level = detectSafety(q);
  if (level !== 'none') return { text: safetyReply(level), actions: [], intent: 'safety', safety: true };

  const kbCtx = { weightKg: c.profile.weightKg, goal: c.profile.goal, proteinG: c.target?.protein, kcal: c.target?.kcal, level: c.profile.level };
  const kb = kbMatch(q);
  const withKb = (text: string, intent: string, minScore = 3): LocalReply => {
    if (kb && kb.score >= minScore && !text.includes(kb.entry.title)) {
      const extra = kb.entry.answer(kbCtx);
      return { text: `${text}\n\n${extra}${kb.entry.medical ? `\n\n${MED_NOTE}` : ''}`, actions, intent };
    }
    return { text, actions, intent };
  };

  // 2a. Конкретное упражнение
  const ex = findExercise(q, c.customs);
  if (ex) {
    const todayPe = c.todayW.template?.exercises.find((pe) => pe.exerciseId === ex.id);
    if (has(n, /замен|вместо|аналог|не нрав|нет тренаж|занят/)) {
      const subs = substitutesFor(ex.id, c.profile, prefs, c.customs ?? [], 4);
      if (!subs.length) return { text: `Для «${ex.name}» нет подходящих замен с твоим оборудованием и ограничениями. Можно взять похожее движение с другим оборудованием или изменить ограничения в Профиль → Предпочтения.`, actions, intent: 'exercise_sub' };
      if (todayPe) actions.push({ id: uid('act_'), type: 'replace_exercise', label: `Заменить на ${subs[0].name}`.slice(0, 40), params: { exerciseId: ex.id, toExerciseId: subs[0].id, scope: 'today', reason: 'Та же мышца и движение' } });
      return {
        text: `Замены для «${ex.name}» (та же мышца и тип движения, с учётом твоих ограничений и оборудования):\n${subs.map((s, i) => `${i + 1}. ${s.name}`).join('\n')}\n\nЛучше всего — «${subs[0].name}». Рабочий вес подберётся за 1–2 тренировки. Если упражнение вызывает дискомфорт — отметь это в тренировке (••• → Дискомфорт), FORM перестанет его предлагать.`,
        actions,
        intent: 'exercise_sub',
      };
    }
    if (has(n, /техник|как делать|как выполн|правильно|ошибк/)) {
      return { text: `**${ex.name}** — как выполнять:\n${ex.cues.map((x) => `• ${x}`).join('\n')}${ex.mistakes.length ? `\n\nЧастые ошибки:\n${ex.mistakes.map((x) => `• ${x}`).join('\n')}` : ''}\n\nАнимация фаз — кнопка «Техника» на экране упражнения.`, actions, intent: 'exercise_tech' };
    }
    // Вес / прогресс / плато
    const hist = historyFor(ex.id, c.sessions, 6);
    if (!hist.length) {
      return { text: `По «${ex.name}» у тебя ещё нет истории. Первая тренировка: подбери вес, с которым ${todayPe ? todayPe.repMax : ex.defaultReps[1]} повторов оставляют 2–3 в запасе — дальше FORM будет вести прогрессию сам.`, actions, intent: 'exercise_progress' };
    }
    const st = progressStatus(ex.id, c.sessions);
    const rec = recommend({ exercise: ex, plannedSets: todayPe?.sets ?? 3, repMin: todayPe?.repMin ?? ex.defaultReps[0], repMax: todayPe?.repMax ?? ex.defaultReps[1], targetRir: todayPe?.targetRir ?? 2, rirDelta: 0, history: hist, band: c.readiness?.band, volumeFactor: 1 });
    const last = hist[0];
    const lines = [
      `**${ex.name}**: прошлый раз ${last.sets.map((s) => (s.weight ? `${s.weight}×${s.reps}` : `${s.reps}`)).join(', ')}.`,
      `Следующая цель — **${rec.weight ? `${rec.weight} кг` : 'свой вес'} × ${rec.repMin}–${rec.repMax}**. ${rec.rationale}`,
      st.status === 'progressing' ? `Прогресс есть (${st.from} → ${st.to} кг) — так держать.` : st.status === 'plateau' ? `${st.sessions} тренировок без прироста — это плато. Варианты: разгрузочная неделя, смена варианта упражнения на 4–6 недель (замены — спроси «чем заменить ${ex.name.toLowerCase()}»), проверить сон и калории.` : '',
    ].filter(Boolean);
    return withKb(lines.join(' '), 'exercise_progress', 99);
  }

  // 2b. Боль/дискомфорт с упражнениями сегодня — замены (+ медицинская справка по зоне)
  if (has(n, /болит|боль|дискомфорт|тянет|ноет|заменить|замена/) && c.todayW.kind === 'workout') {
    const off = offlineAnswer({ question: q, profile: c.profile, target: c.target, entries: c.entries, recentProducts: c.recentProducts, todayW: c.todayW, readiness: c.readiness, insights: c.insights });
    actions.push(...off.actions);
    const med = kb?.entry.medical ? `\n\n${kb.entry.answer(kbCtx)}\n\n${MED_NOTE}` : '';
    return { text: `${off.text}${med}`, actions, intent: 'pain_today' };
  }

  // 2c. Почему стоит / не меняется вес
  if (has(n, /вес сто|вес не|не худ|не набира|не уход|плато.*вес|вес.*плато|почему вес/)) {
    if (c.target) {
      const rev = reviewCalories({ profile: c.profile, weights: c.weights, entries: c.entries, adjustments: c.adjustments, targetKcal: c.target.kcal });
      if (rev.status === 'adjust' && rev.deltaKcal) actions.push({ id: uid('act_'), type: 'adjust_calories', label: `${rev.deltaKcal > 0 ? '+' : ''}${rev.deltaKcal} ккал в день`, params: { deltaKcal: rev.deltaKcal, reason: rev.headline } });
      return withKb(`**${rev.headline}.** ${rev.detail}`, 'weight_trend', 4);
    }
  }

  // 2d. Итоги недели
  if (has(n, /недел|итог|как я прош|разбер/)) {
    const w = lastWeekSummary({ sessions: c.sessions, plan: c.plan, entries: c.entries, target: c.target, weights: c.weights, checkins: c.checkins });
    if (w) {
      const parts = [
        `Тренировок ${w.workouts}${w.planned ? ` из ${w.planned}` : ''}, рабочих подходов ${w.sets}.`,
        w.avgKcal ? `Калории в среднем ${w.avgKcal}${c.target ? ` при цели ${c.target.kcal}` : ''}, белок в норме ${w.proteinDays} из ${w.loggedDays} дней.` : 'Питание почти не записывалось — без этого FORM не может точно скорректировать калории.',
        w.weightDelta !== null ? `Вес ${w.weightDelta >= 0 ? '+' : ''}${w.weightDelta.toFixed(1).replace('.', ',')} кг за неделю.` : '',
        w.avgSleep ? `Сон в среднем ${formatHours(w.avgSleep)}.` : '',
      ].filter(Boolean);
      const advice = w.planned && w.workouts < w.planned ? 'Главное на эту неделю — не пропускать: короткая тренировка лучше никакой.' : w.loggedDays && w.proteinDays < w.loggedDays * 0.7 ? 'Главное на эту неделю — белок: добавь по 1 белковому продукту в 2 приёма пищи.' : 'Неделя ровная — продолжаем по плану.';
      return { text: `${parts.join(' ')}\n\n${advice}`, actions, intent: 'week' };
    }
    // Прошлой недели ещё нет — разбираем текущую
    const since = Date.now() - 7 * 86400000;
    const recent = c.sessions.filter((s) => (s.finishedAt ?? s.startedAt) >= since);
    const sets = recent.reduce((a, s) => a + s.exercises.reduce((b, e) => b + e.sets.filter((x) => x.done).length, 0), 0);
    const days = new Set(c.entries.filter((e) => e.createdAt >= since).map((e) => e.date)).size;
    return {
      text: `Полной недели данных ещё нет, поэтому смотрю последние 7 дней: тренировок ${recent.length}${c.profile.daysPerWeek ? ` из ${c.profile.daysPerWeek} запланированных` : ''}, рабочих подходов ${sets}, питание записано в ${days} из 7 дней.\n\n${recent.length < (c.profile.daysPerWeek ?? 3) ? 'Главное сейчас — закрепить регулярность: проведи тренировки по плану, даже короткие (есть режим «30 минут»).' : 'Регулярность хорошая — продолжаем по плану.'} ${days < 5 ? 'Записывай еду хотя бы 5 дней из 7 — тогда через неделю FORM точно скажет, нужно ли менять калории.' : ''}\n\nПолный разбор с весом, сном и белком появится в понедельник.`.trim(),
      actions,
      intent: 'week',
    };
  }

  // 2e. Еда «сейчас» (а не общий вопрос про белок)
  const foodNow = has(n, /поесть|съесть|перекус|что есть|чем добрать|добрать|ужин|обед|завтрак|что приготов/) && !(kb && kb.score >= 4 && kb.entry.topic !== 'nutrition');
  // 2f. Тренировка сегодня
  const illness = /болею|болен|болеть|заболе|температур|простуд|насморк|грипп|ковид|кашел|кашл|горло|орви/;
  const trainToday = has(n, /сегодня|какая тренир|что за тренир|как тренир|тренироваться/) && !has(n, illness) && !(kb && kb.entry.medical && kb.score >= 2.5);
  if (foodNow || trainToday) {
    const off = offlineAnswer({ question: q, profile: c.profile, target: c.target, entries: c.entries, recentProducts: c.recentProducts, todayW: c.todayW, readiness: c.readiness, insights: c.insights });
    actions.push(...off.actions);
    let text = off.text;
    if (trainToday && c.readiness) {
      const worst = c.readiness.factors.filter((f) => f.impact < -2).slice(0, 2);
      if (worst.length) text += ` Что снижает готовность: ${worst.map((f) => `${f.label.toLowerCase()} (${f.detail})`).join(', ')}.`;
    }
    if (trainToday && c.health?.hrvDeltaPct !== undefined && c.health.hrvDeltaPct <= -15) text += ` HRV на ${-c.health.hrvDeltaPct}% ниже твоей базы — сегодня без рекордов.`;
    return withKb(text, foodNow ? 'food_now' : 'train_today', 4.5);
  }

  // 3. База знаний
  if (kb && kb.score >= 1.5) {
    const text = kb.entry.answer(kbCtx);
    return { text: kb.entry.medical ? `${text}\n\n${MED_NOTE}` : text, actions, intent: `kb:${kb.entry.id}` };
  }

  // 4. Нет точного совпадения — главное по данным + подсказка
  const top = c.insights.slice(0, 2).map((i) => i.text);
  return {
    text: `${top.length ? `${top.join(' ')}\n\n` : ''}Могу подробно ответить про: тренировку на сегодня, любое упражнение (вес, техника, замена), питание и что съесть сейчас, белок и калории, почему стоит вес, сон и восстановление, боль и травмы, добавки. Например: «чем заменить присед», «сколько мне белка», «болит колено».`,
    actions,
    intent: 'fallback',
  };
}
