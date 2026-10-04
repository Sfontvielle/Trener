import type { ExperienceLevel, GoalType, Sex } from '@/types';
import type { Basis } from '@/features/science/sources';
import { KCAL_PER_KG } from '@/features/science/calories';

/**
 * Темп цели — пресеты вместо «голого» процента.
 *
 * Набор (Iraki 2019: ~0,25–0,5% массы тела в неделю, медленнее для продвинутых; Helms 2023: большой профицит
 * у тренированных даёт больше жира без дополнительного выигрыша в силе/мышцах; Slater 2019 — профицит нужен, но
 * его «оптимальный» размер неизвестен). Значения по уровням — ЭВРИСТИКА RYNJI в пределах этих диапазонов.
 * Сушка (Helms 2014: 0,5–1% массы в неделю для сохранения мышц).
 * Пресеты — стартовая точка: дальше темп сверяется с реальным трендом веса, талией и силовыми.
 * Никаких «гарантий»: результат зависит от сна, питания, тренировок и индивидуальных особенностей.
 */
export type PresetId = 'conservative' | 'balanced' | 'fast';

export interface GoalPreset {
  id: PresetId;
  label: string;
  ratePct: number;
  kgPerWeek: number;
  kgPerMonth: number;
  /** Приблизительный профицит/дефицит для такого темпа, ккал/день (7700 ккал/кг — грубое приближение) */
  kcalPerDay: number;
  note: string;
}

const BULK: Record<ExperienceLevel, [number, number, number]> = {
  beginner: [0.3, 0.5, 0.75],
  intermediate: [0.2, 0.35, 0.5],
  advanced: [0.1, 0.25, 0.35],
};
const CUT: [number, number, number] = [0.5, 0.75, 1.0];

const LABEL: Record<PresetId, string> = { conservative: 'Консервативный', balanced: 'Сбалансированный', fast: 'Более быстрый' };

export const PRESET_BASIS: Basis = { kind: 'heuristic', sources: ['iraki2019', 'helms2023', 'slater2019', 'helms2014', 'ashwell2012'], note: 'диапазоны темпа — из обзоров; разбивка по уровням и выбор пресета — правила RYNJI' };

const r2 = (x: number) => Math.round(x * 100) / 100;

export function goalPresets(goal: GoalType, level: ExperienceLevel, weightKg: number): GoalPreset[] {
  if (goal !== 'bulk' && goal !== 'cut') return [];
  const rates = goal === 'bulk' ? BULK[level] : CUT;
  const ids: PresetId[] = ['conservative', 'balanced', 'fast'];
  return ids.map((id, k) => {
    const ratePct = rates[k];
    const kgw = (weightKg * ratePct) / 100;
    const note =
      goal === 'bulk'
        ? id === 'conservative'
          ? 'Меньше лишнего жира, медленнее растёт вес. Подходит, если важна форма или опыт большой.'
          : id === 'balanced'
            ? 'Разумный компромисс между скоростью и качеством набора для вашего опыта.'
            : 'Повышенный риск лишнего жира: вес растёт быстрее, чем обычно успевают расти мышцы.'
        : id === 'conservative'
          ? 'Легче переносится, лучше сохраняются силовые.'
          : id === 'balanced'
            ? 'Типичный темп сушки с сохранением мышц.'
            : 'Быстрее, но выше риск потери мышц, голода и падения силовых.';
    return { id, label: goal === 'bulk' && id === 'fast' ? 'Более быстрый набор' : LABEL[id], ratePct, kgPerWeek: r2(kgw), kgPerMonth: r2(kgw * 4.3), kcalPerDay: Math.round((kgw * KCAL_PER_KG) / 7 / 10) * 10, note };
  });
}

/**
 * Рекомендуемый пресет: зависит от массы/состава (ИМТ, талия/рост ≥0,5 — Ashwell 2012), опыта, цели и истории
 * (талия уже росла быстро на наборе → консервативный). «Более быстрый» никогда не предлагается по умолчанию.
 */
export function recommendedPreset(args: { goal: GoalType; level: ExperienceLevel; sex: Sex; heightCm: number; weightKg: number; waistCm?: number; waistPerKg?: number | null }): { id: PresetId; why: string } {
  const bmi = args.weightKg / (args.heightCm / 100) ** 2;
  const whtr = args.waistCm ? args.waistCm / args.heightCm : undefined;
  if (args.goal === 'bulk') {
    if (args.waistPerKg !== undefined && args.waistPerKg !== null && args.waistPerKg >= 1) return { id: 'conservative', why: 'На прошлом наборе талия росла быстро относительно веса — лучше медленнее.' };
    if (whtr !== undefined && whtr >= 0.5) return { id: 'conservative', why: `Отношение талии к росту ${whtr.toFixed(2).replace('.', ',')} (≥0,5 — повышенный кардиометаболический риск): набор лучше вести медленно.` };
    if (bmi >= 27) return { id: 'conservative', why: `ИМТ ${bmi.toFixed(1).replace('.', ',')}: при большей массе быстрый набор чаще идёт в жир.` };
    if (args.level === 'advanced') return { id: 'conservative', why: 'У продвинутых мышцы растут медленно — большой профицит в основном уходит в жир (Helms 2023).' };
    return { id: 'balanced', why: args.level === 'beginner' ? 'Новички растут быстрее всего — умеренный профицит это использует без лишнего жира.' : 'Для среднего опыта — умеренный темп.' };
  }
  if (args.goal === 'cut') {
    if (bmi >= 30 || (whtr !== undefined && whtr >= 0.6)) return { id: 'balanced', why: 'При большем запасе жира умеренно быстрый темп обычно переносится хорошо.' };
    if (args.level === 'advanced' || bmi < 23) return { id: 'conservative', why: 'Чем меньше жира и больше опыт, тем медленнее стоит сушиться, чтобы сохранить мышцы (Helms 2014).' };
    return { id: 'balanced', why: 'Типичный темп для сохранения мышц.' };
  }
  return { id: 'balanced', why: '' };
}

export function presetForRate(goal: GoalType, level: ExperienceLevel, ratePct: number): PresetId | null {
  const rates = goal === 'bulk' ? BULK[level] : goal === 'cut' ? CUT : null;
  if (!rates) return null;
  const k = rates.findIndex((r) => Math.abs(r - ratePct) < 0.001);
  return k < 0 ? null : (['conservative', 'balanced', 'fast'] as const)[k];
}

/**
 * Предупреждение о слишком агрессивном темпе — не запрет, а объяснение последствий.
 * Набор: выше «сбалансированного» для опыта — повышенный риск лишнего жира; выше «быстрого» — сильное предупреждение.
 */
export function rateWarning(goal: GoalType, level: ExperienceLevel, ratePct: number, weightKg: number): { level: 'caution' | 'strong'; text: string } | null {
  const kgw = (weightKg * ratePct) / 100;
  const kg = `${kgw.toFixed(2).replace('.', ',')} кг/нед`;
  if (goal === 'bulk') {
    const [, bal, fast] = BULK[level];
    if (ratePct > fast + 0.001) return { level: 'strong', text: `Темп ${String(ratePct).replace('.', ',')}% (≈${kg}) заметно выше, чем обычно успевают расти мышцы при вашем опыте (до ~${String(fast).replace('.', ',')}%/нед). Скорее всего, большая часть прибавки будет жиром и водой; вернуть форму потом дольше. Решение за вами — RYNJI будет следить за талией и предложит замедлиться, если она растёт быстро.` };
    if (ratePct > bal + 0.001) return { level: 'caution', text: `Темп ≈${kg} — повышенный риск лишнего жира. Сила и мышцы при большом профиците у тренированных растут не быстрее, чем при умеренном (Helms 2023).` };
  }
  if (goal === 'cut' && ratePct > CUT[2] + 0.001) return { level: 'strong', text: `Темп ≈${kg} быстрее 1% массы в неделю: выше риск потери мышц, падения силовых, голода и плохого сна (Helms 2014).` };
  return null;
}
