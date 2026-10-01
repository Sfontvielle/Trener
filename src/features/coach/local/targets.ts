import type { Exercise, ExerciseCategory, MovementPattern, MuscleSlug, TrainingPreferences, UserProfile } from '@/types';
import { EXERCISES, getExercise, makeCustomExercise } from '@/data/exercises';
import { checkAllowed } from '@/features/training/engine/scoring';
import { uid } from '@/utils/id';
import { keyHit } from './text';

/**
 * Целевые зоны мышц: «хочу упражнение на верх груди / низ пресса / ширину спины».
 * Для каждой зоны — упражнения в порядке эффективности (по биомеханике и данным ЭМГ/гипертрофии),
 * диапазоны повторов и короткое объяснение. Тренер отбирает доступные пользователю (оборудование,
 * исключения, ограничения) и собирает из них готовую мини-тренировку.
 */
export interface MuscleTarget {
  id: string;
  label: string;
  keys: string[];
  /** id упражнений по убыванию приоритета */
  ids: string[];
  /** Почему именно так (1–2 фразы) */
  why: string;
  reps: [number, number];
}

export const TARGETS: MuscleTarget[] = [
  // Грудь
  { id: 'upper_chest', label: 'Верх груди', keys: ['верх груд', 'верхн груд', 'верхняя часть груд', 'ключичн', 'верхний пучок груд'], ids: ['incline_db_press', 'incline_bench_press', 'incline_db_fly', 'decline_push_up', 'cable_crossover', 'smith_bench_press'], why: 'Ключичная часть грудной включается сильнее при наклоне скамьи 15–30° и движении рук снизу вверх. Больше 45° — работа уходит в передние дельты.', reps: [6, 12] },
  { id: 'lower_chest', label: 'Низ груди', keys: ['низ груд', 'нижн груд', 'нижняя часть груд', 'нижний пучок груд'], ids: ['chest_dip', 'decline_bench_press', 'cable_crossover', 'incline_push_up', 'machine_chest_press'], why: 'Нижнюю (брюшную) часть грудной лучше всего нагружают жимы и сведения сверху вниз: брусья с наклоном корпуса вперёд, жим с отрицательным наклоном, кроссовер от верхних блоков.', reps: [8, 12] },
  { id: 'mid_chest', label: 'Середина и объём груди', keys: ['середин груд', 'внутрен груд', 'объем груд', 'масса груд', 'накачать груд', 'грудь', 'грудные', 'грудных', 'груди'], ids: ['bench_press', 'db_bench_press', 'machine_chest_press', 'pec_deck', 'cable_crossover', 'db_fly', 'push_up'], why: 'Основа массы груди — тяжёлые жимы в 6–10 повторов плюс сведения в растянутой позиции. «Внутреннюю часть» отдельно не изолировать: растёт вся мышца, форма зависит от генетики.', reps: [6, 12] },
  // Спина
  { id: 'lats', label: 'Ширина спины (широчайшие)', keys: ['ширин спин', 'широчайш', 'шире спин', 'v-силуэт', 'в силуэт', 'крыль'], ids: ['pull_up', 'lat_pulldown', 'close_grip_pulldown', 'straight_arm_pulldown', 'db_pullover', 'chin_up', 'assisted_pull_up', 'db_row'], why: 'Широчайшие работают, когда локоть идёт вниз к бедру: подтягивания и тяги сверху, пуловер прямыми руками. Тяни локтями, а не кистями, с полной растяжкой вверху.', reps: [6, 12] },
  { id: 'mid_back', label: 'Толщина спины (середина, ромбовидные)', keys: ['толщин спин', 'середин спин', 'ромбовид', 'тяги к поясу', 'толстая спина'], ids: ['barbell_row', 'chest_supported_row', 'seated_cable_row', 'tbar_row', 'machine_row', 'db_row', 'inverted_row', 'face_pull'], why: 'Толщину дают горизонтальные тяги с полным сведением лопаток и паузой 1 с в сокращении. Тяги с упором грудью снимают нагрузку с поясницы.', reps: [8, 12] },
  { id: 'traps', label: 'Трапеции', keys: ['трапец', 'шею накач', 'капюшон'], ids: ['shrug', 'db_shrug', 'face_pull', 'upright_row'], why: 'Верх трапеций — шраги (вверх и чуть назад, без вращения плечами), середину и низ — тяги к лицу и тяги с широким сведением лопаток.', reps: [10, 15] },
  { id: 'lower_back', label: 'Поясница (разгибатели спины)', keys: ['поясниц', 'разгибател спин', 'низ спин', 'нижн спин'], ids: ['back_extension', 'romanian_deadlift', 'superman', 'good_morning', 'db_rdl'], why: 'Разгибатели держат корпус во всех тяжёлых движениях. Гиперэкстензия и румынская тяга с нейтральной спиной — безопасная основа; без рывков и переразгибания.', reps: [10, 15] },
  // Плечи
  { id: 'side_delts', label: 'Средняя дельта (ширина плеч)', keys: ['средн дельт', 'боков дельт', 'ширин плеч', 'широкие плеч', 'круглые плеч', 'средний пучок'], ids: ['cable_lateral_raise', 'lateral_raise', 'machine_shoulder_press', 'upright_row', 'seated_db_press'], why: 'Ширину плеч даёт именно средняя дельта: махи в стороны (на блоке — нагрузка по всей амплитуде), локоть чуть выше кисти, без раскачки. Ей нужен объём: 10–20 повторов, много подходов в неделю.', reps: [12, 20] },
  { id: 'front_delts', label: 'Передняя дельта', keys: ['передн дельт', 'передний пучок'], ids: ['ohp', 'seated_db_press', 'arnold_press', 'machine_shoulder_press', 'front_raise'], why: 'Передняя дельта уже много работает во всех жимах груди, отдельно ей обычно хватает одного жима над головой.', reps: [6, 12] },
  { id: 'rear_delts', label: 'Задняя дельта', keys: ['задн дельт', 'задний пучок', 'задние дельт'], ids: ['reverse_pec_deck', 'rear_delt_fly', 'face_pull', 'band_pull_apart'], why: 'Задняя дельта отвечает за «объём сбоку и сзади» и здоровье плеч. Тяни руки в стороны-назад, не сводя лопатки до конца — иначе работает спина.', reps: [12, 20] },
  // Руки
  { id: 'biceps_long', label: 'Пик бицепса (длинная головка)', keys: ['пик бицепс', 'длинн головк бицепс', 'высота бицепс'], ids: ['incline_db_curl', 'cable_curl', 'barbell_curl', 'db_curl'], why: 'Длинная головка сильнее растягивается, когда плечо отведено назад — сгибания на наклонной скамье и на блоке из-за спины. Высоту «пика» во многом задаёт генетика, но объём головки растёт.', reps: [8, 15] },
  { id: 'biceps_short', label: 'Ширина бицепса (короткая головка)', keys: ['коротк головк бицепс', 'ширин бицепс', 'бицепс', 'бицуха', 'руки накач', 'накачать руки'], ids: ['preacher_curl', 'ez_curl', 'concentration_curl', 'barbell_curl', 'hammer_curl', 'db_curl'], why: 'Короткую головку нагружают сгибания с руками перед корпусом — скамья Скотта, концентрированные. Для объёма руки обязательно добавь брахиалис (молотки).', reps: [8, 15] },
  { id: 'brachialis', label: 'Брахиалис и плечелучевая (толщина руки)', keys: ['брахиал', 'плечелуч', 'толщин рук', 'молотк'], ids: ['hammer_curl', 'reverse_curl', 'cable_curl'], why: 'Брахиалис лежит под бицепсом и «выталкивает» его — молотки и обратный хват дают толщину руки сбоку.', reps: [10, 15] },
  { id: 'triceps_long', label: 'Длинная головка трицепса (масса трицепса)', keys: ['длинн головк трицепс', 'масса трицепс', 'объем трицепс', 'трицепс', 'трехглав'], ids: ['overhead_cable_ext', 'db_overhead_ext', 'skullcrusher', 'close_grip_bench', 'triceps_dip', 'rope_pushdown'], why: 'Длинная головка — самая большая часть трицепса и растёт лучше всего в растянутой позиции: разгибания из-за головы. Плюс тяжёлый жим узким хватом.', reps: [8, 15] },
  { id: 'triceps_lateral', label: 'Латеральная головка трицепса («подкова»)', keys: ['латерал головк', 'подков', 'внешн головк трицепс'], ids: ['rope_pushdown', 'triceps_pushdown', 'triceps_dip', 'close_grip_bench', 'db_kickback'], why: '«Подкову» лучше всего видно от разгибаний на блоке и отжиманий на брусьях; разводи канат внизу и держи локти неподвижно.', reps: [10, 15] },
  { id: 'forearms', label: 'Предплечья и хват', keys: ['предплеч', 'хват', 'запясть'], ids: ['reverse_curl', 'wrist_curl', 'reverse_wrist_curl', 'hammer_curl', 'shrug'], why: 'Сгибатели — сгибания запястий, разгибатели — обратный хват. Хват растёт и от тяжёлых тяг без лямок.', reps: [12, 20] },
  // Ноги
  { id: 'quads', label: 'Квадрицепс', keys: ['квадрицепс', 'передн бедр', 'перед бедр', 'квадр'], ids: ['hack_squat', 'back_squat', 'front_squat', 'leg_press', 'bulgarian_split_squat', 'leg_extension', 'goblet_squat'], why: 'Квадрицепс растёт от глубоких приседаний с колеями вперёд (гакк, фронтальный, жим ногами с низкой постановкой) и разгибаний — особенно с нагрузкой в растянутом положении.', reps: [6, 15] },
  { id: 'vmo', label: 'Внутренняя головка квадрицепса («капля»)', keys: ['капл', 'внутренн головк', 'медиальн', 'над колен'], ids: ['leg_extension', 'hack_squat', 'front_squat', 'bulgarian_split_squat'], why: '«Каплю» изолировать нельзя, но она хорошо видна при полной амплитуде: глубокие приседания и полное выпрямление в разгибаниях с паузой.', reps: [10, 15] },
  { id: 'hamstrings', label: 'Бицепс бедра (задняя поверхность)', keys: ['бицепс бедр', 'задн бедр', 'задняя поверхн', 'бицуха бедр', 'хамстринг'], ids: ['romanian_deadlift', 'seated_leg_curl', 'lying_leg_curl', 'nordic_curl', 'db_rdl', 'good_morning'], why: 'Нужны оба типа движений: наклон (румынская тяга) и сгибание (сидя — лучше растягивает и сильнее растит). Сгибания сидя — один из лучших выборов.', reps: [8, 12] },
  { id: 'glutes', label: 'Ягодицы', keys: ['ягодиц', 'попа', 'попу', 'попы', 'булк', 'ягодичн', 'большая ягодичная'], ids: ['hip_thrust', 'bulgarian_split_squat', 'romanian_deadlift', 'walking_lunge', 'cable_kickback', 'glute_bridge', 'step_up'], why: 'Большая ягодичная лучше всего растёт от выпадов и болгарских (растяжение под нагрузкой), румынской тяги и ягодичного моста (пиковое сокращение). Комбинируй оба типа.', reps: [8, 15] },
  { id: 'glute_med', label: 'Средняя ягодичная (верх и бока ягодиц)', keys: ['средн ягодич', 'верх ягодиц', 'бок ягодиц', 'малая ягодич', 'ушки', 'галифе'], ids: ['abductor_machine', 'cable_kickback', 'single_leg_bridge', 'bulgarian_split_squat', 'side_plank'], why: 'Средняя ягодичная отводит бедро в сторону: разведение ног в тренажёре (корпус чуть вперёд), отведения на блоке. Она же стабилизирует колено в выпадах.', reps: [12, 20] },
  { id: 'adductors', label: 'Внутренняя поверхность бедра', keys: ['внутрен бедр', 'внутренн поверхн', 'приводящ', 'аддуктор'], ids: ['adductor_machine', 'goblet_squat', 'bulgarian_split_squat', 'leg_press'], why: 'Приводящие — крупная группа, хорошо работают в широких глубоких приседаниях и сведении ног в тренажёре. «Сжечь жир» с внутренней стороны упражнениями нельзя — только общий дефицит.', reps: [10, 15] },
  { id: 'calves', label: 'Икры', keys: ['икр', 'голен', 'камбаловид'], ids: ['standing_calf_raise', 'seated_calf_raise', 'leg_press_calf', 'db_calf_raise'], why: 'Икроножная работает на прямых ногах (стоя), камбаловидная — на согнутых (сидя). Главное — пауза 1–2 с внизу в растяжении и полная амплитуда, без пружинящих повторов.', reps: [10, 20] },
  // Пресс
  { id: 'lower_abs', label: 'Низ пресса', keys: ['низ пресс', 'нижн пресс', 'нижний пресс', 'нижние кубик'], ids: ['hanging_leg_raise', 'reverse_crunch', 'dead_bug', 'ab_wheel'], why: 'Прямая мышца живота — одна, но при подъёмах таза (а не просто ног) сильнее работает её нижняя часть. Подкручивай таз к рёбрам. Кубики видны при низком % жира — это питание.', reps: [10, 15] },
  { id: 'upper_abs', label: 'Верх пресса и кубики', keys: ['верх пресс', 'кубик', 'пресс', 'живот накач', 'прямая мышца живот'], ids: ['cable_crunch', 'crunch', 'ab_wheel', 'hanging_leg_raise', 'plank'], why: 'Пресс растёт как другие мышцы — от нагрузки: скручивания на блоке с весом в 8–15 повторов полезнее сотни лёгких. Видимость кубиков — около 10–12% жира у мужчин и 16–20% у женщин.', reps: [8, 15] },
  { id: 'obliques', label: 'Косые мышцы и кор', keys: ['косые', 'косых', 'бока талии', 'талия', 'мышц кора', 'мышцы кора', 'укрепить кор', 'стабилизац'], ids: ['pallof_press', 'side_plank', 'russian_twist', 'dead_bug', 'hanging_leg_raise'], why: 'Для тонкой талии косые не нагружают тяжёлыми наклонами; лучше антивращение (паллоф-пресс) и боковая планка — сильный кор без «расширения» талии.', reps: [10, 15] },
];

/** Найти зону мышц в вопросе (длинные ключи первыми) */
export function findTarget(n: string): MuscleTarget | undefined {
  let best: { t: MuscleTarget; len: number } | undefined;
  for (const t of TARGETS) for (const k of t.keys) if (keyHit(n, k) && (!best || k.length > best.len)) best = { t, len: k.length };
  return best?.t;
}

/** Упражнения зоны, доступные пользователю (оборудование, исключения, ограничения) */
export function exercisesForTarget(t: MuscleTarget, profile: UserProfile, prefs: TrainingPreferences, customs: Exercise[] = [], n = 4): { ex: Exercise; blocked?: string }[] {
  const out: { ex: Exercise; blocked?: string }[] = [];
  const blocked: { ex: Exercise; blocked?: string }[] = [];
  for (const id of t.ids) {
    const ex = getExercise(id, customs);
    if (!ex) continue;
    const r = checkAllowed(ex, profile, prefs);
    if (r.ok) out.push({ ex });
    else blocked.push({ ex, blocked: r.reason });
  }
  return [...out.slice(0, n), ...blocked.slice(0, 2)];
}

// ── Создание своего упражнения по описанию ───────────────────────────────────

const CAT_WORDS: [RegExp, ExerciseCategory, MuscleSlug[]][] = [
  [/груд/, 'chest', ['chest']],
  [/спин|широчайш|тяг/, 'back', ['upper-back']],
  [/плеч|дельт|мах/, 'shoulders', ['deltoids']],
  [/трицепс|разгибан/, 'triceps', ['triceps']],
  [/бицепс|сгибан рук|молот/, 'biceps', ['biceps']],
  [/ягодиц|попа|мост/, 'glutes', ['gluteal']],
  [/икр|носк/, 'calves', ['calves']],
  [/пресс|живот|скруч|кор/, 'abs', ['abs']],
  [/предплеч|запяст/, 'forearms', ['forearm']],
  [/бицепс бедр|задн бедр|сгибан ног/, 'legs', ['hamstring']],
  [/ног|присед|квадр|выпад|бедр/, 'legs', ['quadriceps', 'gluteal']],
];

const EQ_WORDS: [RegExp, Exercise['equipment'][number]][] = [
  [/штанг|гриф/, 'barbell'],
  [/гантел/, 'dumbbell'],
  [/гир/, 'kettlebell'],
  [/блок|кроссовер|канат/, 'cable'],
  [/тренаж|машин/, 'machine'],
  [/смит/, 'smith'],
  [/резин|эспандер/, 'band'],
  [/турник|брус/, 'pullupbar'],
  [/скамь/, 'bench'],
];

function patternFor(n: string, cat: ExerciseCategory): MovementPattern {
  if (/присед/.test(n)) return 'squat';
  if (/выпад|зашаг/.test(n)) return 'lunge';
  if (/румын|станов|наклон/.test(n) && cat !== 'back') return 'hinge';
  if (/подтяг|верхн.*блок|пуловер/.test(n)) return 'v_pull';
  if (/тяг/.test(n)) return 'h_pull';
  if (/жим.*(стоя|сидя|над голов)|армейск/.test(n)) return 'v_push';
  if (/жим|отжим/.test(n)) return cat === 'triceps' ? 'tri_ext' : 'h_push';
  if (/развед|сведен|бабочк/.test(n)) return cat === 'shoulders' ? 'rear_delt' : 'fly';
  if (/мах/.test(n)) return 'lateral';
  if (/шраг/.test(n)) return 'shrug';
  const byCat: Partial<Record<ExerciseCategory, MovementPattern>> = { biceps: 'curl', triceps: 'tri_ext', glutes: 'glute', calves: 'calf', abs: 'core', forearms: 'grip', legs: 'squat', chest: 'h_push', back: 'h_pull', shoulders: 'lateral' };
  return byCat[cat] ?? 'core';
}

/** Название из запроса: «создай упражнение жим гантелей на полу» → «Жим гантелей на полу» */
export function customNameFrom(q: string): string | null {
  const m = q.match(/(?:создай|добавь|сделай|запиши)\s+(?:мне\s+)?(?:сво[её]\s+|новое\s+)?упражнени[ея]\s*[:«"-]?\s*([^»"\n.?!]{3,60})/i);
  if (!m) return null;
  const name = m[1].trim().replace(/\s+/g, ' ');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function buildCustomExercise(name: string): Exercise {
  const n = name.toLowerCase().replace(/ё/g, 'е');
  // Группа по словам; если не названа — по типу движения (жим → грудь, жим стоя → плечи, тяга → спина…)
  const cat =
    CAT_WORDS.find(([re]) => re.test(n)) ??
    (/жим.*(стоя|сидя|над голов)|армейск/.test(n)
      ? CAT_WORDS.find(([, c]) => c === 'shoulders')
      : /жим|отжим|развед/.test(n)
        ? CAT_WORDS.find(([, c]) => c === 'chest')
        : /тяг|подтяг/.test(n)
          ? CAT_WORDS.find(([, c]) => c === 'back')
          : /присед|выпад/.test(n)
            ? CAT_WORDS.find(([re]) => re.source.startsWith('ног'))
            : undefined);
  const category = cat?.[1] ?? 'fullbody';
  const equipment = EQ_WORDS.filter(([re]) => re.test(n)).map(([, e]) => e);
  const pattern = patternFor(n, category);
  const compound = ['squat', 'lunge', 'hinge', 'v_pull', 'h_pull', 'v_push', 'h_push'].includes(pattern);
  return makeCustomExercise({
    id: uid('cx_'),
    name,
    category,
    pattern,
    compound,
    equipment: equipment.length ? equipment : ['bodyweight'],
    primary: cat?.[2] ?? ['abs'],
    reps: compound ? [6, 12] : [10, 15],
    cues: ['Начни с лёгкого веса и отработай амплитуду без боли.', 'Контролируй опускание 2–3 секунды.', 'Подбери вес так, чтобы в запасе оставалось 1–3 повтора.'],
    mistakes: ['Рывки и читинг', 'Неполная амплитуда'],
  });
}

/** Похожие встроенные упражнения (чтобы не плодить дубли) */
export function similarBuiltIn(name: string): Exercise | undefined {
  const n = name.toLowerCase().replace(/ё/g, 'е');
  return EXERCISES.find((e) => e.name.toLowerCase().replace(/ё/g, 'е') === n);
}
