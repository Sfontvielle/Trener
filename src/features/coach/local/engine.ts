import type { CoachAction, CoachMemoryItem, DailyCheckIn, Exercise, FoodEntry, FoodProduct, NutritionTarget, PlanAdjustment, ReadinessResult, UserProfile, WeightEntry, WorkoutPlan, WorkoutSession } from '@/types';
import type { TodayWorkout } from '@/features/training/today';
import type { LocalInsight } from '../insights';
import type { HealthContext } from '@/features/health/model';
import { EXERCISES, getExercise, GROUP_LABEL } from '@/data/exercises';
import { getPrefs } from '@/features/training/engine/prefs';
import { substitutesFor } from '@/features/training/engine/substitute';
import { progressStatus } from '@/features/training/engine/scoring';
import { historyFor, recommend } from '@/features/training/progression';
import { reviewCalories } from '@/features/nutrition/adaptive';
import { lastWeekSummary } from '@/features/progress/weekly';
import { offlineAnswer } from '../offline';
import { detectSafety, isGeneralQuestion, safetyReply } from '../safety';
import { KB, MED_NOTE, type KbEntry } from './kb';
import { PHARMA_DOSE_RE, PHARMA_REFUSAL } from './kbPharma';
import { buildCustomExercise, customNameFrom, exercisesForTarget, findTarget, similarBuiltIn, type MuscleTarget } from './targets';
import { relevantMemory } from './memory';
import { labsReply, readLabs } from './labs';
import { MODE_LABEL } from '@/features/training/today';
import { fmtWeight } from '@/utils/format';
import { DEFAULT_SETS } from '@/features/training/session';
import { analyzeProgram, splitFitText } from '@/features/training/adaptPlan';
import { uid } from '@/utils/id';
import { keyHit, norm } from './text';
import { formatHours } from '@/utils/date';
import { BRAND } from '@/config/brand';

export { keyHit, norm };

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
  /** Что тренер помнит о человеке (факты из прошлых разговоров и профиля) */
  memory?: CoachMemoryItem[];
  /** Предыдущий вопрос — для уточнений «а сколько подходов?» */
  previousQuestion?: string;
}

export interface LocalReply {
  text: string;
  actions: CoachAction[];
  /** Какая ветка ответила (для тестов и отладки) */
  intent: string;
  safety?: boolean;
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
  for (const [alias, id] of ALIASES) if (keyHit(n, alias)) return getExercise(id, customs);
  return undefined;
}

// ── База знаний: поиск ─────────────────────────────────────────────────────
export function kbMatch(q: string): { entry: KbEntry; score: number } | undefined {
  const n = norm(q);
  let best: { entry: KbEntry; score: number } | undefined;
  for (const e of KB) {
    if (e.any && !e.any.some((k) => keyHit(n, k))) continue;
    let score = 0;
    for (const k of e.keys) if (keyHit(n, k)) score += k.includes(' ') ? 2.5 + 0.3 * (k.split(' ').length - 1) : 1.5 + Math.min(1, k.length / 8);
    if (score > 0 && (!best || score > best.score)) best = { entry: e, score };
  }
  return best;
}

const has = (n: string, re: RegExp) => re.test(n);

/** Рекомендация веса на следующую тренировку по истории */
function nextTarget(ex: Exercise, c: LocalCtx, repMin: number, repMax: number, sets: number): { text: string; weight: number } {
  const hist = historyFor(ex.id, c.sessions, 6);
  if (!hist.length) return { text: ex.bodyweight ? 'свой вес' : 'подбери вес с запасом 2–3 повтора', weight: 0 };
  const rec = recommend({ exercise: ex, plannedSets: sets, repMin, repMax, targetRir: 2, rirDelta: 0, history: hist, band: c.readiness?.band, volumeFactor: 1 });
  return { text: rec.weight ? `${fmtWeight(rec.weight)} кг` : 'свой вес', weight: rec.weight };
}

/** «Что мне сегодня делать?» — полный план дня: тренировка с весами, питание, восстановление. Чек-ин не обязателен. */
function todayAnswer(c: LocalCtx): LocalReply {
  const t = c.todayW;
  const actions: CoachAction[] = [];
  const out: string[] = [];
  if (t.kind === 'workout' && t.template) {
    out.push(`**Сегодня — ${t.template.name}** (${t.template.focus.toLowerCase()}): ~${t.estMinutes} мин, ${t.totalSets} рабочих подходов${t.mode !== 'normal' ? `, режим «${MODE_LABEL[t.mode].toLowerCase()}»` : ''}.`);
    if (t.reason) out.push(t.reason);
    const lines = t.template.exercises.slice(0, 9).map((pe, i) => {
      const ex = getExercise(pe.exerciseId, c.customs);
      if (!ex) return '';
      const sets = Math.max(1, Math.round(pe.sets * t.volumeFactor));
      const w = pe.targetWeight ? `${fmtWeight(pe.targetWeight)} кг` : nextTarget(ex, c, pe.repMin, pe.repMax, sets).text;
      return `${i + 1}. ${ex.name} — ${sets}×${pe.repMin}–${pe.repMax}, ${w}`;
    });
    out.push(lines.filter(Boolean).join('\n'));
    if (c.readiness) {
      out.push(`Готовность ${c.readiness.score}/100 — ${c.readiness.headline.toLowerCase()}.`);
      const worst = c.readiness.factors.filter((f) => f.impact < -2).slice(0, 2);
      if (worst.length) out.push(`Снижает: ${worst.map((f) => `${f.label.toLowerCase()} (${f.detail})`).join(', ')}.`);
    } else {
      out.push('Если плохо спал, устал или что-то болит — напиши, и я облегчу тренировку.');
    }
    if (c.health?.hrvDeltaPct !== undefined && c.health.hrvDeltaPct <= -15) out.push(`HRV на ${-c.health.hrvDeltaPct}% ниже твоей нормы — сегодня без рекордов.`);
    actions.push({ id: uid('act_'), type: 'start_today', label: 'Начать тренировку', params: {} });
    if (t.mode === 'normal') actions.push({ id: uid('act_'), type: 'set_day_mode', label: 'Облегчить сегодня (−25%)', params: { mode: 'reduced', volumeFactor: 0.75, rirDelta: 1, reason: 'Облегчено по просьбе' } });
  } else if (t.kind === 'done') {
    out.push(`Тренировка сегодня уже сделана${t.completedSession ? ` (${t.completedSession.name})` : ''} ✓ Теперь главное — восстановление: белок, углеводы в ближайшие часы, сон 7–9 ч.`);
  } else if (t.kind === 'rest') {
    out.push(`**Сегодня по плану отдых.**${t.nextWorkout ? ` Следующая тренировка — ${t.nextWorkout.template.name} (${t.nextWorkout.template.focus.toLowerCase()}).` : ''}`);
    out.push('Что сделать для прогресса: 8–10 тыс. шагов, 10 минут мобильности, белок по норме и лечь вовремя. Хочется потренироваться — могу собрать короткую тренировку на отстающие мышцы.');
    actions.push({ id: uid('act_'), type: 'generate_workout', label: 'Тренировка вне плана (40 мин)', params: { minutes: 40 } });
  } else {
    out.push('Плана пока нет — заполни профиль, и я составлю программу.');
  }
  // Питание на сегодня
  if (c.target) {
    const food = offlineAnswer({ question: 'что поесть', profile: c.profile, target: c.target, entries: c.entries, recentProducts: c.recentProducts, todayW: c.todayW, readiness: c.readiness, insights: [] });
    out.push(`**Питание:** ${food.text}`);
  }
  // Помню о проблемах
  const recentInjury = (c.memory ?? []).filter((m) => m.category === 'injury' && Date.now() - m.createdAt < 21 * 86400000).slice(-1)[0];
  if (recentInjury) out.push(`Помню: «${recentInjury.text.replace(/^\d{4}-\d{2}-\d{2}: /, '')}». Если ещё беспокоит — скажи, заменю упражнения на эту зону.`);
  return { text: out.join('\n\n'), actions, intent: 'today' };
}

/** «Хочу упражнения на верх груди» → готовая мини-тренировка под человека + кнопки */
function targetAnswer(t: MuscleTarget, c: LocalCtx): LocalReply {
  const prefs = getPrefs(c.profile);
  const list = exercisesForTarget(t, c.profile, prefs, c.customs, 4);
  const ok = list.filter((x) => !x.blocked).map((x) => x.ex);
  const blocked = list.filter((x) => x.blocked);
  const actions: CoachAction[] = [];
  if (!ok.length) {
    return { text: `Для зоны «${t.label}» сейчас нет подходящих упражнений с твоим оборудованием и ограничениями${blocked.length ? ` (не предлагаю: ${blocked.map((b) => `${b.ex.name} — ${b.blocked}`).join('; ')})` : ''}. Измени оборудование в профиле или напиши «создай упражнение …».`, actions, intent: 'target' };
  }
  const pick = ok.slice(0, ok.length >= 4 ? 4 : ok.length);
  const lines = pick.map((ex, i) => {
    const [lo, hi] = ex.mechanic === 'compound' ? [Math.max(5, t.reps[0]), Math.min(12, Math.max(8, t.reps[1] - 3))] : [Math.max(10, t.reps[0]), Math.max(15, t.reps[1])];
    const sets = i === 0 ? 4 : 3;
    return `${i + 1}. **${ex.name}** — ${sets}×${lo}–${hi}, ${nextTarget(ex, c, lo, hi, sets).text}. ${ex.cues[0] ?? ''}`;
  });
  const text = [
    `**${t.label}** — тренировка под тебя (с учётом оборудования и исключений):`,
    lines.join('\n'),
    t.why,
    'Отдых: базовые 2–3 мин, изоляция 60–90 с. Последний подход каждого упражнения — с запасом 0–1 повтор.',
    blocked.length ? `Не предлагаю: ${blocked.map((b) => `${b.ex.name} (${b.blocked})`).join('; ')}.` : '',
  ].filter(Boolean).join('\n\n');
  actions.push({ id: uid('act_'), type: 'start_custom_workout', label: 'Начать эту тренировку', params: { exerciseIds: pick.map((e) => e.id), name: t.label, sets: DEFAULT_SETS } });
  // В план: в тренировку, где уже работает эта группа мышц и упражнения ещё нет
  const grp = pick[0].groups.primary[0];
  const tpl = c.plan?.templates.find((x) => x.muscles.includes(grp) && !x.exercises.some((e) => e.exerciseId === pick[0].id)) ?? c.plan?.templates.find((x) => !x.exercises.some((e) => e.exerciseId === pick[0].id));
  if (tpl) actions.push({ id: uid('act_'), type: 'add_to_plan', label: `Добавить в план (${tpl.name})`.slice(0, 40), params: { templateId: tpl.id, exerciseId: pick[0].id, sets: DEFAULT_SETS, repMin: pick[0].defaultReps[0], repMax: pick[0].defaultReps[1], reason: t.label } });
  return { text, actions, intent: 'target' };
}

export function localCoach(c: LocalCtx): LocalReply {
  const q = c.question;
  const n = norm(q);
  const prefs = getPrefs(c.profile);
  const actions: CoachAction[] = [];
  const memory = c.memory ?? [];

  // 1. Безопасность. Общие вопросы («можно ли тренироваться при аритмии») — не тревога, а справка
  const level = detectSafety(q);
  const general = isGeneralQuestion(q);
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

  // 1а. Явное уточнение к прошлому вопросу: «а если дома?», «а сколько подходов?»
  if (c.previousQuestion && /^(а|и|тогда|еще)\s/.test(n)) {
    const r = localCoach({ ...c, question: `${c.previousQuestion} ${q}`, previousQuestion: undefined });
    if (r.intent !== 'fallback' && r.intent !== 'greeting') return { ...r, intent: `followup:${r.intent}` };
  }

  // 2. Приветствие
  if (/^(привет|здравств|добр(ый|ое|ого)|хай|хеллоу|ку|йо)(\s|$)/.test(n) && n.split(' ').length <= 4) {
    return { text: `Привет${c.profile.name ? `, ${c.profile.name}` : ''}! Я твой тренер в ${BRAND} — работаю прямо на телефоне. Спроси, например: «что мне сегодня делать», «упражнения на верх груди», «чем заменить присед», «что поесть», «какие анализы сдать», «болит плечо при жиме».`, actions, intent: 'greeting' };
  }

  // 2а. Память: «что ты обо мне помнишь»
  if (has(n, /(что ты (обо мне )?(помнишь|знаешь)|что ты запомнил|мои проблемы|что я тебе говорил)/)) {
    if (!memory.length) return { text: 'Пока я ничего о тебе не запомнил. Рассказывай: травмы, диагнозы, лекарства, что не ешь, цели и режим — я учту это во всех ответах и тренировках. Список фактов можно править в Профиль → «Память тренера».', actions, intent: 'memory' };
    const by = (cat: CoachMemoryItem['category'][]) => memory.filter((m) => cat.includes(m.category)).map((m) => `• ${m.text}`);
    const blocks = [
      ['Здоровье и травмы', by(['health', 'injury'])],
      ['Питание', by(['food'])],
      ['Цели и режим', by(['preference', 'schedule'])],
      ['Тренировки', by(['training', 'other'])],
    ].filter(([, l]) => (l as string[]).length).map(([t, l]) => `**${t}:**\n${(l as string[]).slice(-8).join('\n')}`);
    return { text: `Вот что я помню о тебе:\n\n${blocks.join('\n\n')}\n\nУчитываю это в ответах. Исправить или удалить — Профиль → «Память тренера».`, actions, intent: 'memory' };
  }

  // 3. Фармакология: никаких схем и доз
  if (has(n, PHARMA_DOSE_RE) && has(n, /(стероид|анабол|тестостерон|нандрол|тренбол|станоз|оксандр|метан|болденон|примоболан|мастерон|гормон\S* рост|гр |инсулин|кленбут|клен|сарм|остарин|лигандрол|пептид|т3|тироксин|днф|диуретик|курс|химия|фарм)/)) {
    return { text: `${PHARMA_REFUSAL}\n\n${KB.find((e) => e.id === 'aas_monitoring')!.answer(kbCtx)}\n\n${MED_NOTE}`, actions, intent: 'pharma_refusal' };
  }

  // 3а. Результаты анализов с числами: «ттг 5.2, ферритин 18»
  const labs = readLabs(q, c.profile.sex === 'female' ? 'female' : 'male');
  if (labs.length) return { text: `${labsReply(labs, c.profile.sex === 'female' ? 'female' : 'male')}\n\n${MED_NOTE}`, actions, intent: 'labs' };

  // 4. Создать своё упражнение
  const customName = customNameFrom(q);
  if (customName) {
    const same = similarBuiltIn(customName) ?? (c.customs ?? []).find((e) => norm(e.name) === norm(customName));
    if (same) return { text: `«${same.name}» уже есть в библиотеке. Открой его в Тренировки → Библиотека или нажми «Начать».`, actions: [{ id: uid('act_'), type: 'start_custom_workout', label: `Начать: ${same.name}`.slice(0, 40), params: { exerciseIds: [same.id], name: same.name } }], intent: 'create_exercise' };
    const ex = buildCustomExercise(customName);
    actions.push({ id: uid('act_'), type: 'create_exercise', label: 'Создать упражнение', params: { exercise: ex } });
    return {
      text: `Создам упражнение **«${ex.name}»**: группа — ${ex.category === 'fullbody' ? 'всё тело' : ex.groups.primary.map((g) => GROUP_LABEL[g] ?? g).join(', ').toLowerCase()}, ${ex.mechanic === 'compound' ? 'базовое' : 'изолирующее'}, ${ex.defaultReps[0]}–${ex.defaultReps[1]} повторов. Оно появится в Библиотеке (раздел «Мои»), его можно ставить в любую тренировку, а прогрессию веса ${BRAND} будет вести так же, как для встроенных.\n\nЕсли группа мышц определилась неверно — уточни, например: «создай упражнение жим гантелей на полу на грудь».`,
      actions,
      intent: 'create_exercise',
    };
  }

  // 5. Конкретное упражнение. По сокращению («присед», «бицепс») — только если вопрос про само упражнение
  const exAny = findExercise(q, c.customs);
  const exactName = !!exAny && n.includes(norm(exAny.name));
  const aboutExercise = /замен|вместо|аналог|техник|как делать|как выполн|правильно|вес|сколько ставить|прогресс|плато|не раст|сколько жать|сколько присед/;
  const pain = /болит|боль|ноет|тянет|дискомфорт|хруст/;
  const ex = exAny && !has(n, pain) && (exactName || has(n, aboutExercise) || !(kb && kb.score >= 2.5)) && !(has(n, /сколько подходов|сколько раз в неделю/) && !exactName) ? exAny : undefined;
  const target = findTarget(n);
  const buildWords = /(упражнен|тренировк|прокач|накач|подбери|составь|собери|хочу|как растить|как увеличить|программ|комплекс|чем качать|что делать для|на )/;
  if (target && has(n, buildWords) && !has(n, /сколько подходов|сколько раз в неделю|как часто/) && !(ex && has(n, /замен|вместо|техник|как делать|как выполн|вес|сколько ставить/))) return targetAnswer(target, c);

  if (ex) {
    const todayPe = c.todayW.template?.exercises.find((pe) => pe.exerciseId === ex.id);
    if (has(n, /замен|вместо|аналог|не нрав|нет тренаж|занят/)) {
      const subs = substitutesFor(ex.id, c.profile, prefs, c.customs ?? [], 4);
      if (!subs.length) return { text: `Для «${ex.name}» нет подходящих замен с твоим оборудованием и ограничениями. Можно взять похожее движение с другим оборудованием или изменить ограничения в Профиль → Предпочтения.`, actions, intent: 'exercise_sub' };
      if (todayPe) actions.push({ id: uid('act_'), type: 'replace_exercise', label: `Заменить на ${subs[0].name}`.slice(0, 40), params: { exerciseId: ex.id, toExerciseId: subs[0].id, scope: 'today', reason: 'Та же мышца и движение' } });
      return {
        text: `Замены для «${ex.name}» (та же мышца и тип движения, с учётом твоих ограничений и оборудования):\n${subs.map((s, i) => `${i + 1}. ${s.name}`).join('\n')}\n\nЛучше всего — «${subs[0].name}». Рабочий вес подберётся за 1–2 тренировки. Если упражнение вызывает дискомфорт — отметь это в тренировке (••• → Дискомфорт), ${BRAND} перестанет его предлагать.`,
        actions,
        intent: 'exercise_sub',
      };
    }
    if (has(n, /техник|как делать|как выполн|правильно|ошибк/)) {
      return { text: `**${ex.name}** — как выполнять:\n${ex.cues.map((x) => `• ${x}`).join('\n')}${ex.mistakes.length ? `\n\nЧастые ошибки:\n${ex.mistakes.map((x) => `• ${x}`).join('\n')}` : ''}\n\nКартинка и фазы движения — кнопка «Техника» на экране упражнения.`, actions, intent: 'exercise_tech' };
    }
    const hist = historyFor(ex.id, c.sessions, 6);
    if (!hist.length) {
      actions.push({ id: uid('act_'), type: 'start_custom_workout', label: `Тренировать: ${ex.name}`.slice(0, 40), params: { exerciseIds: [ex.id], name: ex.name } });
      return { text: `По «${ex.name}» у тебя ещё нет истории. Первая тренировка: подбери вес, с которым ${todayPe ? todayPe.repMax : ex.defaultReps[1]} повторов оставляют 2–3 в запасе — дальше ${BRAND} будет вести прогрессию сам.\n\n${ex.cues.slice(0, 2).map((x) => `• ${x}`).join('\n')}`, actions, intent: 'exercise_progress' };
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
  if (target && has(n, /(как|что|чем)/)) return targetAnswer(target, c);

  // 6. Боль/дискомфорт с упражнениями сегодня — замены (+ медицинская справка по зоне)
  if (has(n, /болит|боль|дискомфорт|тянет|ноет|заменить|замена/) && c.todayW.kind === 'workout' && !general) {
    const off = offlineAnswer({ question: q, profile: c.profile, target: c.target, entries: c.entries, recentProducts: c.recentProducts, todayW: c.todayW, readiness: c.readiness, insights: c.insights });
    actions.push(...off.actions);
    const med = kb?.entry.medical ? `\n\n${kb.entry.answer(kbCtx)}\n\n${MED_NOTE}` : '';
    return { text: `${off.text}${med}`, actions, intent: 'pain_today' };
  }

  // 7. Почему стоит / не меняется вес
  if (has(n, /вес сто|вес не|не худ|не набира|не уход|плато.*вес|вес.*плато|почему вес/)) {
    if (c.target) {
      const rev = reviewCalories({ profile: c.profile, weights: c.weights, entries: c.entries, adjustments: c.adjustments, targetKcal: c.target.kcal });
      if (rev.status === 'adjust' && rev.deltaKcal) actions.push({ id: uid('act_'), type: 'adjust_calories', label: `${rev.deltaKcal > 0 ? '+' : ''}${rev.deltaKcal} ккал в день`, params: { deltaKcal: rev.deltaKcal, reason: rev.headline } });
      return withKb(`**${rev.headline}.** ${rev.detail}`, 'weight_trend', 4);
    }
  }

  // 8. Итоги недели
  if (has(n, /(разбер|итог|как (прошла|я провел|у меня) (неделя|прошла)|моя неделя|мою неделю|за неделю|прошл\S* недел)/) && !(kb && kb.score >= 2.5)) {
    const w = lastWeekSummary({ sessions: c.sessions, plan: c.plan, entries: c.entries, target: c.target, weights: c.weights, checkins: c.checkins });
    if (w) {
      const parts = [
        `Тренировок ${w.workouts}${w.planned ? ` из ${w.planned}` : ''}, рабочих подходов ${w.sets}.`,
        w.avgKcal ? `Калории в среднем ${w.avgKcal}${c.target ? ` при цели ${c.target.kcal}` : ''}, белок в норме ${w.proteinDays} из ${w.loggedDays} дней.` : `Питание почти не записывалось — без этого ${BRAND} не может точно скорректировать калории.`,
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
      text: `Полной недели данных ещё нет, поэтому смотрю последние 7 дней: тренировок ${recent.length}${c.profile.daysPerWeek ? ` из ${c.profile.daysPerWeek} запланированных` : ''}, рабочих подходов ${sets}, питание записано в ${days} из 7 дней.\n\n${recent.length < (c.profile.daysPerWeek ?? 3) ? 'Главное сейчас — закрепить регулярность: проведи тренировки по плану, даже короткие (есть режим «30 минут»).' : 'Регулярность хорошая — продолжаем по плану.'} ${days < 5 ? `Записывай еду хотя бы 5 дней из 7 — тогда через неделю ${BRAND} точно скажет, нужно ли менять калории.` : ''}\n\nПолный разбор с весом, сном и белком появится в понедельник.`.trim(),
      actions,
      intent: 'week',
    };
  }

  // 9. Еда «сейчас»
  const illness = /болею|болен|болеть|заболе|температур|простуд|насморк|грипп|ковид|кашел|кашл|горло|орви/;
  const foodNow = has(n, /поесть|съесть|перекус|что есть|чем добрать|добрать|ужин|обед|завтрак|что приготов|что мне есть/) && !(kb && ((kb.score >= 4 && kb.entry.topic !== 'nutrition') || (kb.entry.medical && kb.score >= 1.5)));
  if (foodNow) {
    const off = offlineAnswer({ question: 'что поесть', profile: c.profile, target: c.target, entries: c.entries, recentProducts: c.recentProducts, todayW: c.todayW, readiness: c.readiness, insights: c.insights });
    actions.push(...off.actions);
    const dislikes = memory.filter((m) => m.category === 'food').slice(-3);
    return withKb(`${off.text}${dislikes.length ? `\n\nУчитываю: ${dislikes.map((m) => m.text.replace(/^Питание: /, '').toLowerCase()).join('; ')}.` : ''}`, 'food_now', 4.5);
  }

  // 9б. Программа: «подходит ли мне сплит», «что поменять в программе», «почему фулбади»
  if (c.plan && has(n, /(программ|сплит|full ?body|фулбади|всё тело|все тело|верх.?низ|жим.?тяга|ppl|структур)/) && has(n, /(подход|поменя|смени|измени|почему|какой|лучше|советуеш|выбрал|адапт|перестро)/)) {
    const props = analyzeProgram({ profile: c.profile, plan: c.plan, sessions: c.sessions, checkins: c.checkins });
    const lines = [`**Сейчас: ${c.plan.splitLabel}, ${c.plan.daysPerWeek} дн/нед.** ${splitFitText(c.plan.split, c.plan.daysPerWeek)}`];
    if (c.plan.splitChoice?.reasons.length) lines.push(`Почему он выбран для тебя: ${c.plan.splitChoice.reasons.slice(0, 3).join('; ')}.`);
    if (props.length) {
      const p = props[0];
      lines.push(`**Что я бы изменил:** ${p.title}.\n${p.why.map((x) => `• ${x}`).join('\n')}${p.splitWhy ? `\n\n${p.splitWhy}` : ''}`);
      if (p.change.split) actions.push({ id: uid('act_'), type: 'change_split', label: `Перейти: ${p.title}`.slice(0, 48), params: { split: p.change.split, reason: p.why[0] } });
      else lines.push('Применить можно на главной («Тренер советует») или в «Отчёте недели» — без твоего подтверждения программа не меняется.');
    } else {
      lines.push('По твоим данным менять структуру сейчас не нужно: тренировки выполняются, восстановление и прогресс в норме. Я сам предложу изменение, если появятся пропуски, застой или признаки плохого восстановления.');
    }
    return { text: lines.join('\n\n'), actions, intent: 'program' };
  }

  // 10. План на сегодня: «что мне сегодня делать», «какая тренировка», «как сегодня тренироваться»
  const todayQ =
    has(n, /(что (мне )?сегодня делать|что (у меня )?сегодня|план на сегодня|какая (сегодня )?тренировк|что за тренировк|как (мне )?сегодня тренир|что по плану|чем (мне )?сегодня заняться|тренировка на сегодня|сегодня трениров|можно (ли )?сегодня тренироваться)/) ||
    (has(n, /^(что (мне )?делать|как (мне )?тренироваться|чем заняться)( сегодня)?$/) && !(kb && kb.score >= 1.5));
  if (todayQ && !has(n, illness) && !general && !(kb && kb.entry.medical && kb.score >= 1.5)) return todayAnswer(c);

  // 11. База знаний (+ что я помню о тебе по этой теме)
  if (kb && kb.score >= 1.5) {
    let text = kb.entry.answer(kbCtx);
    const mem = relevantMemory(memory.filter((m) => ['health', 'injury', 'food', 'preference'].includes(m.category)), q, kb.entry.keys).slice(-2);
    if (mem.length) text = `Учитываю, что ты рассказывал: ${mem.map((m) => `«${m.text.replace(/^(Здоровье|Питание|Цель|Принимает\/лечение): /, '')}»`).join(', ')}.\n\n${text}`;
    return { text: kb.entry.medical ? `${text}\n\n${MED_NOTE}` : text, actions, intent: `kb:${kb.entry.id}` };
  }

  // 12. Уточнение к прошлому вопросу («а сколько подходов?», «а если дома?»)
  if (c.previousQuestion && n.split(' ').length <= 3) {
    const r = localCoach({ ...c, question: `${c.previousQuestion} ${q}`, previousQuestion: undefined });
    if (r.intent !== 'fallback') return { ...r, intent: `followup:${r.intent}` };
  }

  // 13. Нет точного совпадения
  const top = c.insights.slice(0, 2).map((i) => i.text);
  return {
    text: `${top.length ? `${top.join(' ')}\n\n` : ''}Не до конца понял вопрос. Я разбираюсь в тренировках (план на сегодня, техника, замены, программы на любую мышцу, подготовка к соревнованиям), питании и диетологии, восстановлении, анализах и гормонах, травмах и рисках препаратов. Например: «что мне сегодня делать», «упражнения на верх груди», «создай упражнение жим гантелей на полу», «какие анализы сдать», «болит плечо при жиме», «что ты обо мне помнишь».`,
    actions,
    intent: 'fallback',
  };
}
