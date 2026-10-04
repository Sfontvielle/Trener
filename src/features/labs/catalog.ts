/**
 * Канонический каталог показателей анализов.
 *
 * Разные лаборатории (Инвитро, Хеликс, Гемотест, KDL, CMD, Ситилаб и др.) называют одно и то же по-разному:
 * «АЛТ», «АлАТ», «Аланинаминотрансфераза», «ALT»… Каталог сводит их к одному id, чтобы строить историю.
 * Парсер НЕ привязан к конкретному бренду — он ищет названия из каталога в любой строке бланка.
 *
 * units: альтернативная единица → множитель к канонической (value_canon = value × k). Только однозначные
 * пересчёты (например, тестостерон нг/дл → нмоль/л × 0,0347). Если единица неизвестна — значение хранится
 * как есть и в графике не смешивается с другими единицами.
 *
 * serious: ограниченный набор порогов с медицинскими основаниями (см. docs/SCIENCE.md, раздел «Анализы»).
 * Это НЕ диагноз: при срабатывании RYNJI пишет «рекомендуется обсудить с врачом» / «обратитесь к врачу».
 * fallbackRef — общий ориентир ТОЛЬКО когда в бланке нет референса (подписывается как «ориентир», не «норма лаборатории»).
 */
export type LabCategory = 'cbc' | 'lipids' | 'liver' | 'kidney' | 'glucose' | 'iron' | 'hormones' | 'thyroid' | 'other';

export const CATEGORY_LABEL: Record<LabCategory, string> = {
  cbc: 'Общий анализ крови',
  lipids: 'Липиды',
  liver: 'Печёночные',
  kidney: 'Почечные',
  glucose: 'Глюкоза / HbA1c',
  iron: 'Железо',
  hormones: 'Гормоны',
  thyroid: 'Щитовидная железа',
  other: 'Другие',
};

export const CATEGORY_ORDER: LabCategory[] = ['cbc', 'lipids', 'liver', 'kidney', 'glucose', 'iron', 'hormones', 'thyroid', 'other'];

export interface Serious {
  /** Абсолютный порог в канонической единице */
  above?: number;
  below?: number;
  /** Кратность верхней границы референса лаборатории (например, 3 × ВГН для АЛТ) */
  aboveUln?: number;
  level: 'doctor' | 'urgent';
  text: string;
}

export interface Biomarker {
  id: string;
  name: string;
  category: LabCategory;
  /** Каноническая единица (в нормализованном виде, см. normalizeUnit) */
  unit: string;
  aliases: string[];
  /** Если в названии есть эти слова — это другой показатель */
  exclude?: string[];
  units?: Record<string, number>;
  /** Показатель в процентах: изменение — в процентных пунктах */
  percent?: boolean;
  fallbackRef?: { male: [number, number]; female: [number, number] };
  serious?: Serious[];
  /** Особенно важен для мониторинга в режиме Enhanced */
  enhancedWatch?: boolean;
}

const B = (b: Biomarker) => b;

export const BIOMARKERS: Biomarker[] = [
  // ── Общий анализ крови
  B({ id: 'hgb', name: 'Гемоглобин', category: 'cbc', unit: 'г/л', aliases: ['гемоглобин', 'hgb', 'hb', 'hemoglobin', 'haemoglobin'], exclude: ['гликир', 'среднее', 'средняя', 'mch', 'в эритроците', 'a1c', 'hba1c', 'концентрац'], units: { 'г/дл': 10 }, fallbackRef: { male: [130, 170], female: [120, 150] }, enhancedWatch: true }),
  B({ id: 'hct', name: 'Гематокрит', category: 'cbc', unit: '%', aliases: ['гематокрит', 'hct', 'ht', 'hematocrit', 'haematocrit'], units: { 'л/л': 100 }, percent: true, fallbackRef: { male: [40, 50], female: [36, 46] }, enhancedWatch: true,
    serious: [{ above: 54, level: 'doctor', text: 'Гематокрит выше 54% — значение, при котором клинические рекомендации требуют врачебной оценки (повышается вязкость крови и риск тромбозов). Обсудите результат с врачом.' }] }),
  B({ id: 'rbc', name: 'Эритроциты', category: 'cbc', unit: '10^12/л', aliases: ['эритроциты', 'rbc', 'red blood cells', 'erythrocytes'], exclude: ['средн', 'распредел', 'ширина', 'соэ', 'оседан'], fallbackRef: { male: [4.3, 5.7], female: [3.8, 5.1] }, enhancedWatch: true }),
  B({ id: 'wbc', name: 'Лейкоциты', category: 'cbc', unit: '10^9/л', aliases: ['лейкоциты', 'wbc', 'white blood cells', 'leukocytes'], fallbackRef: { male: [4, 9], female: [4, 9] } }),
  B({ id: 'plt', name: 'Тромбоциты', category: 'cbc', unit: '10^9/л', aliases: ['тромбоциты', 'plt', 'platelets'], exclude: ['средн', 'тромбокрит'], fallbackRef: { male: [150, 400], female: [150, 400] } }),
  B({ id: 'mcv', name: 'Средний объём эритроцита (MCV)', category: 'cbc', unit: 'фл', aliases: ['mcv', 'средний объем эритроцит'] }),
  B({ id: 'mch', name: 'Среднее содержание Hb в эритроците (MCH)', category: 'cbc', unit: 'пг', aliases: ['mch', 'среднее содержание гемоглобина'], exclude: ['mchc', 'концентрац'] }),
  B({ id: 'mchc', name: 'Средняя концентрация Hb в эритроците (MCHC)', category: 'cbc', unit: 'г/л', aliases: ['mchc', 'средняя концентрация гемоглобина'] }),
  B({ id: 'esr', name: 'СОЭ', category: 'cbc', unit: 'мм/ч', aliases: ['соэ', 'скорость оседания эритроцитов', 'esr'] }),

  // ── Липиды
  B({ id: 'chol', name: 'Холестерин общий', category: 'lipids', unit: 'ммоль/л', aliases: ['холестерин общий', 'общий холестерин', 'холестерин', 'cholesterol', 'chol'], exclude: ['лпнп', 'лпвп', 'ldl', 'hdl', 'не-лпвп', 'нелпвп', 'non-hdl', 'лпонп'], units: { 'мг/дл': 0.02586 }, enhancedWatch: true }),
  B({ id: 'ldl', name: 'ЛПНП (LDL)', category: 'lipids', unit: 'ммоль/л', aliases: ['холестерин лпнп', 'холестерин-лпнп', 'лпнп', 'ldl', 'липопротеины низкой плотности'], exclude: ['не-лпвп', 'non-hdl'], units: { 'мг/дл': 0.02586 }, enhancedWatch: true,
    serious: [{ above: 4.9, level: 'doctor', text: 'ЛПНП ≥ 4,9 ммоль/л — уровень, который рекомендации по дислипидемиям относят к выраженной гиперхолестеринемии. Рекомендуется обсудить результат с врачом.' }] }),
  B({ id: 'hdl', name: 'ЛПВП (HDL)', category: 'lipids', unit: 'ммоль/л', aliases: ['холестерин лпвп', 'холестерин-лпвп', 'лпвп', 'hdl', 'липопротеины высокой плотности'], exclude: ['не-лпвп', 'нелпвп', 'non-hdl', 'не лпвп'], units: { 'мг/дл': 0.02586 }, enhancedWatch: true }),
  B({ id: 'tg', name: 'Триглицериды', category: 'lipids', unit: 'ммоль/л', aliases: ['триглицериды', 'tg', 'trig', 'triglycerides'], units: { 'мг/дл': 0.01129 }, enhancedWatch: true }),

  // ── Печёночные
  B({ id: 'alt', name: 'АЛТ', category: 'liver', unit: 'ед/л', aliases: ['аланинаминотрансфераза', 'алат', 'алт', 'alt', 'alat', 'гпт', 'alanine aminotransferase'], enhancedWatch: true,
    serious: [{ aboveUln: 3, level: 'doctor', text: 'АЛТ выше трёх верхних границ нормы — существенное повышение. Рекомендуется обсудить результат с врачом (после интенсивной силовой тренировки возможен и мышечный вклад — повтор после 5–7 дней без тяжёлых нагрузок).' }] }),
  B({ id: 'ast', name: 'АСТ', category: 'liver', unit: 'ед/л', aliases: ['аспартатаминотрансфераза', 'асат', 'аст', 'ast', 'asat', 'гот', 'aspartate aminotransferase'], enhancedWatch: true,
    serious: [{ aboveUln: 3, level: 'doctor', text: 'АСТ выше трёх верхних границ нормы. АСТ много и в мышцах, поэтому после тяжёлой тренировки возможен мышечный вклад; повторите анализ после отдыха и обсудите с врачом.' }] }),
  B({ id: 'ggt', name: 'ГГТ', category: 'liver', unit: 'ед/л', aliases: ['гамма-глутамилтрансфераза', 'гамма-гт', 'ггт', 'ggt', 'гамма глутамилтранспептидаза'], enhancedWatch: true }),
  B({ id: 'alp', name: 'Щелочная фосфатаза', category: 'liver', unit: 'ед/л', aliases: ['щелочная фосфатаза', 'alp', 'щф', 'alkaline phosphatase'] }),
  B({ id: 'bili', name: 'Билирубин общий', category: 'liver', unit: 'мкмоль/л', aliases: ['билирубин общий', 'общий билирубин', 'билирубин', 'total bilirubin', 'bilirubin'], exclude: ['прям', 'непрям', 'связан', 'свобод'], units: { 'мг/дл': 17.1 }, enhancedWatch: true }),

  // ── Почечные
  B({ id: 'creat', name: 'Креатинин', category: 'kidney', unit: 'мкмоль/л', aliases: ['креатинин', 'creatinine', 'crea'], exclude: ['киназ', 'клиренс', 'в моче'], units: { 'мг/дл': 88.4 }, enhancedWatch: true }),
  B({ id: 'egfr', name: 'СКФ (eGFR)', category: 'kidney', unit: 'мл/мин/1,73м2', aliases: ['скф', 'egfr', 'скорость клубочковой фильтрации', 'ckd-epi'], enhancedWatch: true,
    serious: [{ below: 60, level: 'doctor', text: 'Расчётная СКФ ниже 60 мл/мин/1,73 м² — значение, при котором рекомендуют оценку функции почек врачом (у мускулистых людей расчёт по креатинину может занижать СКФ — врач может назначить цистатин C).' }] }),
  B({ id: 'urea', name: 'Мочевина', category: 'kidney', unit: 'ммоль/л', aliases: ['мочевина', 'urea', 'bun'] }),
  B({ id: 'cysc', name: 'Цистатин C', category: 'kidney', unit: 'мг/л', aliases: ['цистатин с', 'цистатин c', 'cystatin'] }),
  B({ id: 'uric', name: 'Мочевая кислота', category: 'kidney', unit: 'мкмоль/л', aliases: ['мочевая кислота', 'uric acid'] }),

  // ── Глюкоза
  B({ id: 'glu', name: 'Глюкоза', category: 'glucose', unit: 'ммоль/л', aliases: ['глюкоза', 'glucose', 'glu'], exclude: ['в моче', 'толерант'], units: { 'мг/дл': 0.0555 },
    serious: [{ above: 7.0, level: 'doctor', text: 'Глюкоза натощак ≥ 7,0 ммоль/л — значение, требующее врачебной оценки (при повторном подтверждении — диагностический критерий нарушения углеводного обмена). Обсудите результат с врачом.' }] }),
  B({ id: 'hba1c', name: 'Гликированный гемоглобин (HbA1c)', category: 'glucose', unit: '%', aliases: ['гликированный гемоглобин', 'гликозилированный гемоглобин', 'hba1c', 'a1c'], percent: true,
    serious: [{ above: 6.5, level: 'doctor', text: 'HbA1c ≥ 6,5% — значение, требующее врачебной оценки. Обсудите результат с врачом.' }] }),
  B({ id: 'insulin', name: 'Инсулин', category: 'glucose', unit: 'мкед/мл', aliases: ['инсулин', 'insulin'], exclude: ['индекс', 'homa', 'антител'] }),

  // ── Железо
  B({ id: 'ferritin', name: 'Ферритин', category: 'iron', unit: 'мкг/л', aliases: ['ферритин', 'ferritin'], units: { 'нг/мл': 1 } }),
  B({ id: 'iron', name: 'Железо сывороточное', category: 'iron', unit: 'мкмоль/л', aliases: ['железо сывороточное', 'сывороточное железо', 'железо', 'iron', 'fe'], exclude: ['ферритин', 'трансферрин', 'связывающ', 'насыщ'] }),
  B({ id: 'tsat', name: 'Насыщение трансферрина', category: 'iron', unit: '%', aliases: ['насыщение трансферрина', 'коэффициент насыщения трансферрина', 'tsat'], percent: true }),

  // ── Гормоны
  B({ id: 'testo', name: 'Тестостерон общий', category: 'hormones', unit: 'нмоль/л', aliases: ['тестостерон общий', 'общий тестостерон', 'тестостерон', 'testosterone'], exclude: ['свобод', 'free', 'биодоступ', 'индекс'], units: { 'нг/дл': 0.0347, 'нг/мл': 3.467 }, enhancedWatch: true }),
  B({ id: 'ftesto', name: 'Тестостерон свободный', category: 'hormones', unit: 'пг/мл', aliases: ['тестостерон свободный', 'свободный тестостерон', 'free testosterone'], exclude: ['индекс'] }),
  B({ id: 'shbg', name: 'ГСПГ (SHBG)', category: 'hormones', unit: 'нмоль/л', aliases: ['гспг', 'shbg', 'глобулин, связывающий половые гормоны', 'глобулин связывающий половые гормоны'], enhancedWatch: true }),
  B({ id: 'e2', name: 'Эстрадиол', category: 'hormones', unit: 'пмоль/л', aliases: ['эстрадиол', 'estradiol', 'e2'], units: { 'пг/мл': 3.671 }, enhancedWatch: true }),
  B({ id: 'lh', name: 'ЛГ', category: 'hormones', unit: 'мед/мл', aliases: ['лютеинизирующий гормон', 'лг', 'lh'], units: { 'ме/л': 1, 'мме/мл': 1 }, enhancedWatch: true }),
  B({ id: 'fsh', name: 'ФСГ', category: 'hormones', unit: 'мед/мл', aliases: ['фолликулостимулирующий гормон', 'фсг', 'fsh'], units: { 'ме/л': 1, 'мме/мл': 1 }, enhancedWatch: true }),
  B({ id: 'prl', name: 'Пролактин', category: 'hormones', unit: 'мед/л', aliases: ['пролактин', 'prolactin', 'prl'], exclude: ['макропролактин'], units: { 'нг/мл': 21.2, 'мкме/мл': 1 }, enhancedWatch: true }),
  B({ id: 'psa', name: 'ПСА общий', category: 'hormones', unit: 'нг/мл', aliases: ['пса общий', 'простатспецифический антиген общий', 'простатический специфический антиген', 'пса', 'psa'], exclude: ['свобод', 'free'], enhancedWatch: true }),
  B({ id: 'cortisol', name: 'Кортизол', category: 'hormones', unit: 'нмоль/л', aliases: ['кортизол', 'cortisol'], exclude: ['в слюне', 'в моче'] }),
  B({ id: 'igf1', name: 'ИФР-1 (соматомедин С)', category: 'hormones', unit: 'нг/мл', aliases: ['соматомедин', 'ифр-1', 'igf-1', 'igf1', 'инсулиноподобный фактор роста'] }),

  // ── Щитовидная железа
  B({ id: 'tsh', name: 'ТТГ', category: 'thyroid', unit: 'мед/л', aliases: ['тиреотропный гормон', 'ттг', 'tsh', 'thyroid stimulating hormone'], units: { 'мкме/мл': 1, 'мме/л': 1 } }),
  B({ id: 'ft4', name: 'Т4 свободный', category: 'thyroid', unit: 'пмоль/л', aliases: ['т4 свободный', 'свободный т4', 'тироксин свободный', 'свободный тироксин', 'ft4', 'free t4'], units: { 'нг/дл': 12.87 } }),
  B({ id: 'ft3', name: 'Т3 свободный', category: 'thyroid', unit: 'пмоль/л', aliases: ['т3 свободный', 'свободный т3', 'трийодтиронин свободный', 'ft3', 'free t3'] }),

  // ── Другие
  B({ id: 'vitd', name: 'Витамин D (25-OH)', category: 'other', unit: 'нг/мл', aliases: ['25-oh витамин d', '25-он витамин d', '25-гидроксивитамин d', 'витамин d', 'витамин д', 'vitamin d', '25(oh)d'], units: { 'нмоль/л': 0.4 } }),
  B({ id: 'ck', name: 'КФК', category: 'other', unit: 'ед/л', aliases: ['креатинкиназа', 'кфк', 'ck', 'кк общая'], exclude: ['mb', 'мв'] }),
  B({ id: 'k', name: 'Калий', category: 'other', unit: 'ммоль/л', aliases: ['калий', 'potassium'],
    serious: [
      { above: 6.0, level: 'urgent', text: 'Калий ≥ 6,0 ммоль/л — потенциально опасное значение (может влиять на ритм сердца). Обратитесь к врачу в ближайшее время; при слабости или перебоях в сердце — за неотложной помощью. Иногда это артефакт взятия крови — врач решит, нужен ли повтор.' },
      { below: 3.0, level: 'urgent', text: 'Калий < 3,0 ммоль/л — потенциально опасное значение. Обратитесь к врачу в ближайшее время.' },
    ] }),
  B({ id: 'na', name: 'Натрий', category: 'other', unit: 'ммоль/л', aliases: ['натрий', 'sodium'] }),
  B({ id: 'crp', name: 'С-реактивный белок', category: 'other', unit: 'мг/л', aliases: ['с-реактивный белок', 'c-реактивный белок', 'срб', 'crp'] }),
  B({ id: 'b12', name: 'Витамин B12', category: 'other', unit: 'пг/мл', aliases: ['витамин b12', 'витамин в12', 'цианокобаламин', 'b12'], units: { 'пмоль/л': 1 / 0.738 } }),
  B({ id: 'ca', name: 'Кальций общий', category: 'other', unit: 'ммоль/л', aliases: ['кальций общий', 'кальций', 'calcium'], exclude: ['ионизир'] }),
  B({ id: 'mg', name: 'Магний', category: 'other', unit: 'ммоль/л', aliases: ['магний', 'magnesium'] }),
];

export const BIOMARKER_BY_ID: Record<string, Biomarker> = Object.fromEntries(BIOMARKERS.map((b) => [b.id, b]));

export function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    // латиница, похожая на кириллицу, в названиях часто перемешана
    .replace(/[(),:;«»"']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasWord(hay: string, needle: string): boolean {
  const i = hay.indexOf(needle);
  if (i < 0) return false;
  const before = i === 0 ? ' ' : hay[i - 1];
  const after = hay[i + needle.length] ?? ' ';
  const isL = (c: string) => /[a-zа-я0-9]/.test(c);
  return !isL(before) && !isL(after);
}

/** Сопоставить название из бланка с каноническим показателем: самое длинное совпадение псевдонима */
export function matchMarker(rawName: string): Biomarker | undefined {
  const n = ` ${normName(rawName)} `;
  let best: { b: Biomarker; len: number } | undefined;
  for (const b of BIOMARKERS) {
    if (b.exclude?.some((x) => n.includes(x))) continue;
    for (const a of b.aliases) {
      if (a.length > (best?.len ?? 0) && hasWord(n, a)) best = { b, len: a.length };
    }
  }
  return best?.b;
}
