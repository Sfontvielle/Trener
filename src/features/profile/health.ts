import type { BodyArea, HealthProfile, LimitationSeverity, MovementRestriction, TrainingLimitation, UserProfile } from '@/types';

/**
 * Здоровье и особенности пользователя → правила для всей системы.
 *
 * Пользователь пишет обычным языком («правое плечо не любит жим над головой», «протрузия L5»,
 * «врач запретил осевую нагрузку»). Здесь текст превращается в ограничения ДВИЖЕНИЙ (не диагнозы):
 * генератор плана, подбор замен, тренировка дня и тренер получают их через getPrefs() — поэтому
 * указанная травма не может «потеряться» ни в одном модуле.
 *
 * Чего здесь нет намеренно: диагнозов, противопоказаний «из головы», лекарств. При неясном или
 * серьёзном состоянии приложение просит согласовать нагрузку с врачом/физиотерапевтом.
 */

export const EMPTY_HEALTH: HealthProfile = { injuries: '', chronic: '', painfulMovements: '', medical: '', allergies: [], intolerances: [], forbiddenFoods: [], other: '' };

/** Профиль здоровья с миграцией: старое поле «Ограничения и травмы» становится «Травмами» */
export function healthOf(p: Pick<UserProfile, 'health' | 'limitations'>): HealthProfile {
  const h = p.health;
  if (!h) return { ...EMPTY_HEALTH, injuries: p.limitations ?? '' };
  return { ...EMPTY_HEALTH, ...h, allergies: h.allergies ?? [], intolerances: h.intolerances ?? [], forbiddenFoods: h.forbiddenFoods ?? [] };
}

export function hasHealthInfo(h: HealthProfile): boolean {
  return !!(h.injuries.trim() || h.chronic.trim() || h.painfulMovements.trim() || h.medical.trim() || h.other.trim() || h.allergies.length || h.intolerances.length || h.forbiddenFoods.length);
}

const n = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

const AREA_RE: [BodyArea, RegExp][] = [
  ['shoulder', /плеч|ротатор|манжет|импинджмент|ключиц|надост/],
  ['lower_back', /поясниц|(^|[^а-я])спин|позвоночн|протруз|остеохондроз|радикулит|ишиас|люмбаго|седалищн|(^|[^а-я])l[1-5]|крестц|межпозвон/],
  ['knee', /колен|мениск|крестообраз|надколен|пателл/],
  ['elbow', /локт|эпикондил/],
  ['wrist', /запяст|кист[ьиея]|туннельн/],
  ['hip', /тазобедрен|тбс|коксартроз|бедренн\S* сустав/],
  ['neck', /(^|[^а-я])ше[яиюй]([^а-я]|$)|шейн/],
];

const MOVE_RE: [MovementRestriction, RegExp][] = [
  ['overhead_press', /над голов|армейск|жим\S* стоя|жим\S* вверх|вертикальн\S* жим/],
  ['barbell_bench', /жим\S* (штанги )?лежа|жим лежа/],
  ['deep_chest_stretch', /брусь|разведени|растяжени\S* груд/],
  ['hanging', /(^|[^а-я])вис|подтягив|турник/],
  ['upright_row', /к подбородк/],
  ['heavy_axial', /осев|штанг\S* на плеч|присед\S* со штанг/],
  ['hip_hinge', /станов|от пола|наклон\S* с вес|румынск|гуд ?монинг/],
  ['bent_over', /в наклоне/],
  ['spinal_flexion', /скручиван|подъем корпус/],
  ['spinal_rotation', /поворот\S* корпус|ротаци/],
  ['deep_knee_flexion', /присед|глубок\S* сгиб/],
  ['lunges', /выпад|болгарск/],
  ['knee_extension', /разгибани\S* ног/],
  ['elbow_extension', /французск|разгибани\S* (рук|локт)|трицепс/],
  ['elbow_flexion', /сгибани\S* рук|бицепс/],
  ['wrist_extension', /упор на ладон|отжиман|планк/],
  ['hip_flexion', /подъем\S* ног/],
  ['neck_load', /шраг/],
];

/** Движение без названной зоны → какую зону оно нагружает */
const MOVE_AREA: Record<MovementRestriction, BodyArea> = {
  overhead_press: 'shoulder', barbell_bench: 'shoulder', deep_chest_stretch: 'shoulder', hanging: 'shoulder', upright_row: 'shoulder',
  heavy_axial: 'lower_back', hip_hinge: 'lower_back', bent_over: 'lower_back', spinal_flexion: 'lower_back', spinal_rotation: 'lower_back',
  deep_knee_flexion: 'knee', lunges: 'knee', knee_extension: 'knee', elbow_extension: 'elbow', elbow_flexion: 'elbow', wrist_extension: 'wrist', hip_flexion: 'hip', neck_load: 'neck',
};

/** Если зона названа без движений — самые типичные провокаторы этой зоны (консервативно, без «всего подряд») */
export const AREA_DEFAULT_MOVES: Record<BodyArea, MovementRestriction[]> = {
  shoulder: ['overhead_press', 'upright_row', 'deep_chest_stretch'],
  lower_back: ['heavy_axial', 'hip_hinge', 'bent_over'],
  knee: ['deep_knee_flexion', 'lunges'],
  elbow: ['elbow_extension'],
  wrist: ['wrist_extension'],
  hip: ['deep_knee_flexion', 'lunges'],
  neck: ['neck_load', 'heavy_axial'],
};

const NEGATION = /(в порядке|без травм|не беспоко|не болит|нет травм|здоров|^\s*нет\s*$|^\s*-\s*$)/;
const SEVERE = /(сильн|остр|нельзя|операц|запрещ|не могу|разрыв|перелом|после травм\S* недавн)/;
const MILD = /(немного|слегка|иногда|бывает|чуть|небольш|дискомфорт|не любит)/;

const rank: Record<LimitationSeverity, number> = { mild: 0, moderate: 1, severe: 2 };

/** Разбор текста в ограничения по зонам. source=doctor — запрет специалиста (всегда строгий) */
export function parseLimitText(text: string, source: 'user' | 'doctor' = 'user'): TrainingLimitation[] {
  const byArea = new Map<BodyArea, TrainingLimitation>();
  for (const raw of text.split(/[\n;.!]+/)) {
    const c = n(raw).trim();
    if (c.length < 3 || NEGATION.test(c)) continue;
    const areas = AREA_RE.filter(([, re]) => re.test(c)).map(([a]) => a);
    const moves = MOVE_RE.filter(([, re]) => re.test(c)).map(([m]) => m);
    // Паховая/пупочная грыжа — не позвоночник (учитывается флагом ниже)
    if (/пахов|пупочн|живот/.test(c)) {
      const i = areas.indexOf('lower_back');
      if (i >= 0 && !/поясниц|позвоночн|спин/.test(c)) areas.splice(i, 1);
    }
    const targets = areas.length ? areas : [...new Set(moves.map((m) => MOVE_AREA[m]))];
    if (!targets.length) continue;
    let severity: LimitationSeverity = SEVERE.test(c) ? 'severe' : MILD.test(c) ? 'mild' : 'moderate';
    if (source === 'doctor' && severity === 'mild') severity = 'moderate';
    for (const area of targets) {
      const own = moves.filter((m) => MOVE_AREA[m] === area || areas.includes(area));
      const movements = own.length ? own : AREA_DEFAULT_MOVES[area];
      const prev = byArea.get(area);
      const note = raw.trim().slice(0, 90);
      if (!prev) {
        byArea.set(area, { id: `auto_${area}`, area, movements: [...movements], severity, note, source, createdAt: 0 });
      } else {
        prev.movements = [...new Set([...prev.movements, ...movements])];
        if (rank[severity] > rank[prev.severity]) prev.severity = severity;
        if (!prev.note?.includes(note)) prev.note = `${prev.note}; ${note}`.slice(0, 160);
      }
    }
  }
  return [...byArea.values()];
}

export type HealthFlag = 'hypertension' | 'cardiac' | 'diabetes' | 'asthma' | 'pregnancy' | 'osteoporosis' | 'abdominal_hernia' | 'varicose';

const FLAG_RE: [HealthFlag, RegExp][] = [
  ['hypertension', /гипертон|высок\S* давлен|давлени\S* повыш/],
  ['cardiac', /сердц|аритми|ишеми|инфаркт|стенокард|кардиомиопат|порок/],
  ['diabetes', /диабет/],
  ['asthma', /астм/],
  ['pregnancy', /беремен/],
  ['osteoporosis', /остеопор/],
  ['abdominal_hernia', /пахов\S* грыж|пупочн\S* грыж|грыж\S* живот|диастаз/],
  ['varicose', /варикоз|тромб/],
];

export const FLAG_LABEL: Record<HealthFlag, string> = {
  hypertension: 'повышенное давление',
  cardiac: 'сердце',
  diabetes: 'диабет',
  asthma: 'астма',
  pregnancy: 'беременность',
  osteoporosis: 'остеопороз',
  abdominal_hernia: 'грыжа/диастаз живота',
  varicose: 'варикоз/тромбоз',
};

export function healthFlags(h: HealthProfile): HealthFlag[] {
  const text = n([h.injuries, h.chronic, h.medical, h.other, h.painfulMovements].join(' \n '));
  return FLAG_RE.filter(([, re]) => re.test(text)).map(([f]) => f);
}

/** Как особенности здоровья меняют тренировки (консервативно; без «лечения») */
export interface HealthTraining {
  limitations: TrainingLimitation[];
  excludedMovements: MovementRestriction[];
  /** Минимальный запас повторов: без работы до отказа и натуживания */
  minRir: number;
  /** Множитель объёма (1 — без изменений) */
  volumeFactor: number;
  /** Рекомендовать согласовать нагрузку со специалистом */
  clearance: boolean;
  flags: HealthFlag[];
  notes: string[];
}

export function healthTraining(p: Pick<UserProfile, 'health' | 'limitations'>): HealthTraining {
  const h = healthOf(p);
  const flags = healthFlags(h);
  const limitations = mergeLimits([...parseLimitText([h.injuries, h.chronic, h.painfulMovements, h.other].join('\n'), 'user'), ...parseLimitText(h.medical, 'doctor')]);
  const excluded = new Set<MovementRestriction>();
  const notes: string[] = [];
  let minRir = 0;
  let volumeFactor = 1;
  if (flags.includes('hypertension') || flags.includes('cardiac')) {
    minRir = 2;
    notes.push(`Указано: ${flags.includes('cardiac') ? 'сердце' : 'повышенное давление'} — без отказа и задержки дыхания, запас ≥2 повтора`);
  }
  if (flags.includes('cardiac')) volumeFactor = Math.min(volumeFactor, 0.85);
  if (flags.includes('abdominal_hernia')) {
    excluded.add('heavy_axial');
    minRir = Math.max(minRir, 2);
    notes.push('Указана грыжа/диастаз живота — без тяжёлой осевой нагрузки и натуживания');
  }
  if (flags.includes('pregnancy')) {
    excluded.add('heavy_axial');
    excluded.add('spinal_flexion');
    minRir = Math.max(minRir, 3);
    volumeFactor = Math.min(volumeFactor, 0.8);
    notes.push('Беременность — умеренная нагрузка, без скручиваний и осевой нагрузки, режим согласуй с врачом');
  }
  if (flags.includes('osteoporosis')) {
    excluded.add('spinal_flexion');
    excluded.add('spinal_rotation');
    notes.push('Остеопороз — без скручиваний и поворотов корпуса с весом');
  }
  const clearance = flags.some((f) => f === 'cardiac' || f === 'pregnancy') || !!h.medical.trim();
  if (limitations.length) notes.push(`Ограничения из профиля: ${limitations.map((l) => AREA_TEXT[l.area]).join(', ')}`);
  return { limitations, excludedMovements: [...excluded], minRir, volumeFactor, clearance, flags, notes };
}

const AREA_TEXT: Record<BodyArea, string> = { lower_back: 'поясница', shoulder: 'плечо', knee: 'колено', elbow: 'локоть', wrist: 'запястье', hip: 'тазобедренный', neck: 'шея' };

function mergeLimits(list: TrainingLimitation[]): TrainingLimitation[] {
  const m = new Map<BodyArea, TrainingLimitation>();
  for (const l of list) {
    const p = m.get(l.area);
    if (!p) m.set(l.area, { ...l, movements: [...l.movements] });
    else {
      p.movements = [...new Set([...p.movements, ...l.movements])];
      if (rank[l.severity] > rank[p.severity]) p.severity = l.severity;
      if (l.source === 'doctor') p.source = 'doctor';
      p.note = [p.note, l.note].filter(Boolean).join('; ').slice(0, 160);
    }
  }
  return [...m.values()];
}

// ── Питание ──────────────────────────────────────────────────────────────────

export interface FoodAvoidance {
  /** Слова, по которым продукт исключается из подбора */
  words: string[];
  /** Аллергены — показываются как предупреждение при ручном добавлении */
  allergyWords: string[];
  /** Ограничения-категории (как в профиле питания) */
  restrictions: string[];
}

export function foodAvoidance(p: Pick<UserProfile, 'health' | 'limitations' | 'dislikedFoods' | 'dietRestrictions'>): FoodAvoidance {
  const h = healthOf(p);
  const restrictions = new Set(p.dietRestrictions);
  const all = [...h.allergies, ...h.intolerances, ...h.forbiddenFoods];
  for (const x of all.map(n)) {
    if (/лактоз|молок|молоч/.test(x)) restrictions.add('lactose');
    if (/глютен|целиак|пшениц/.test(x)) restrictions.add('gluten');
    if (/рыб|морепрод/.test(x)) restrictions.add('no_fish');
  }
  return { words: [...p.dislikedFoods, ...all], allergyWords: [...h.allergies, ...h.intolerances], restrictions: [...restrictions] };
}

/** Слово-аллерген в названии продукта (по основе слова: «орехи» ловит «орех», «арахис» — отдельно) */
export function allergenIn(name: string, words: string[]): string | undefined {
  const t = n(name);
  return words.find((w) => {
    const s = n(w).trim();
    if (s.length < 3) return false;
    const stem = s.slice(0, Math.max(3, s.length - 2));
    if (t.includes(stem)) return true;
    if (/орех/.test(s) && /арахис|миндал|фундук|кешью|грецк|фисташ/.test(t)) return true;
    if (/яйц|яиц/.test(s) && /яйц|яиц|омлет|майонез/.test(t)) return true;
    if (/молок|молоч|лактоз/.test(s) && /молок|творог|сыр|кефир|йогурт|скир|сливк|сметан|сыворот|протеин сыворот/.test(t)) return true;
    return false;
  });
}

/** Краткая сводка для тренера и экранов */
export function healthSummary(h: HealthProfile): string[] {
  const out: string[] = [];
  if (h.injuries.trim()) out.push(`Травмы: ${h.injuries.trim()}`);
  if (h.chronic.trim()) out.push(`Хронические ограничения: ${h.chronic.trim()}`);
  if (h.painfulMovements.trim()) out.push(`Болезненные движения: ${h.painfulMovements.trim()}`);
  if (h.medical.trim()) out.push(`Ограничения от врача: ${h.medical.trim()}`);
  if (h.allergies.length) out.push(`Аллергии: ${h.allergies.join(', ')}`);
  if (h.intolerances.length) out.push(`Непереносимости: ${h.intolerances.join(', ')}`);
  if (h.forbiddenFoods.length) out.push(`Запрещённые продукты: ${h.forbiddenFoods.join(', ')}`);
  if (h.other.trim()) out.push(`Другое: ${h.other.trim()}`);
  return out;
}
