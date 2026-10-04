import type { SplitPreference, SplitType, TrainingPreferences, UserProfile, VolumeMuscle, WorkoutSession } from '@/types';
import { addDays, today } from '@/utils/date';
import { VM_ACC, VOLUME_MUSCLES } from './muscles';
import { weeklyTargets } from './volume';
import type { RecoveryEstimate } from './recovery';
import { BRAND } from '@/config/brand';

export const SPLIT_LABEL: Record<SplitType, string> = {
  fullbody: 'Всё тело',
  upper_lower: 'Верх / Низ',
  upper_lower_full: 'Верх / Низ / Всё тело',
  torso_limbs: 'Торс / Конечности',
  ppl: 'Жим / Тяга / Ноги',
  ul_ppl: 'Верх / Низ + Жим / Тяга / Ноги',
  ppl_x2: 'Жим / Тяга / Ноги × 2',
  bro: 'Сплит по группам',
};

export const SPLIT_PREF_LABEL: Record<SplitPreference, string> = {
  auto: `Пусть ${BRAND} выбирает`,
  fullbody: 'Всё тело',
  upper_lower: 'Верх / Низ',
  torso_limbs: 'Торс / Конечности',
  ppl: 'Жим / Тяга / Ноги',
  ul_ppl: 'Верх / Низ + Жим / Тяга / Ноги',
  bro: 'По группам мышц',
  custom: 'Свой (правлю шаблоны сам)',
};

const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'тренировка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'тренировки' : 'тренировок');
const times = (f: number) => `${f.toFixed(1).replace('.0', '').replace('.', ',')}× в неделю`;

/** Средняя фактическая частота за последние 4 недели (если история достаточна) */
export function actualFrequency(sessions: WorkoutSession[], ref = today()): number | null {
  const from = addDays(ref, -28);
  const done = sessions.filter((s) => s.status === 'completed' && s.date > from);
  const first = sessions.filter((s) => s.status === 'completed').map((s) => s.date).sort()[0];
  if (!first || first > addDays(ref, -21)) return null;
  return done.length / 4;
}

interface SplitSpec {
  days: [number, number];
  ideal: number[];
  /** Сколько раз в неделю тренируется типичная мышца */
  freq: (d: number) => number;
  /** Тяжёлых базовых за сессию (разминочные подходы, системная усталость) */
  compounds: number;
  /** Есть отдельный день ног (уязвим, если ограничения сужают упражнения на ноги) */
  legDay: boolean;
}

const SPECS: Record<SplitType, SplitSpec> = {
  fullbody: { days: [1, 5], ideal: [2, 3], freq: (d) => d, compounds: 4, legDay: false },
  upper_lower: { days: [2, 6], ideal: [4], freq: (d) => d / 2, compounds: 2.5, legDay: false },
  upper_lower_full: { days: [3, 3], ideal: [3], freq: () => 2, compounds: 3, legDay: false },
  torso_limbs: { days: [2, 6], ideal: [4], freq: (d) => d / 2, compounds: 2.5, legDay: false },
  ppl: { days: [3, 5], ideal: [3], freq: (d) => d / 3, compounds: 2, legDay: true },
  ul_ppl: { days: [5, 5], ideal: [5], freq: () => 2, compounds: 2.2, legDay: true },
  ppl_x2: { days: [6, 6], ideal: [6], freq: () => 2, compounds: 2, legDay: true },
  bro: { days: [4, 6], ideal: [5], freq: (d) => Math.max(1, d / 5), compounds: 1.5, legDay: true },
};

export interface SplitCandidate {
  split: SplitType;
  score: number;
  pros: string[];
  cons: string[];
  estMinutes: number;
  freq: number;
}

export interface SplitDecision {
  split: SplitType;
  reasons: string[];
  auto: boolean;
  candidates: SplitCandidate[];
}

const BIG: VolumeMuscle[] = ['chest', 'lats', 'upper_back', 'quads', 'hamstrings'];

/**
 * Оценка одного варианта под конкретного пользователя. Учитывает: дни и длительность, частоту на мышцу,
 * объём на мышцу за сессию (больше ~10 прямых подходов — «мусорный» объём), системную усталость от базовых,
 * уровень, приоритетные мышцы, стиль подходов (2 подхода → больше упражнений), восстановление,
 * ограничения и оборудование.
 */
function scoreSplit(split: SplitType, d: number, p: UserProfile, prefs: TrainingPreferences, targets: Record<VolumeMuscle, number>, rec: RecoveryEstimate | undefined, legsRestricted: boolean): SplitCandidate | null {
  const spec = SPECS[split];
  if (d < spec.days[0] || d > spec.days[1]) return null;
  const pros: string[] = [];
  const cons: string[] = [];
  let s = 100;
  const f = spec.freq(d);
  const capacity = rec?.capacity ?? 0;

  // Время сессии: подходы + разминка + переходы между упражнениями
  const weekly = VOLUME_MUSCLES.reduce((a, m) => a + targets[m], 0);
  const perSession = weekly / d;
  const maxSets = prefs.setStyle === 2 ? 2 : prefs.setStyle === 3 ? 3 : 4;
  const exercises = VOLUME_MUSCLES.reduce((a, m) => {
    const perHit = targets[m] / f;
    return a + (perHit < 1.5 ? 0 : Math.ceil(perHit / maxSets)) * (f / d);
  }, 0);
  const est = Math.round(7 + perSession * 2.1 + spec.compounds * 3 + exercises * 1.1);
  const over = est - p.sessionMinutes;
  if (over > 8) {
    s -= over * 0.7;
    cons.push(`для недельного объёма тренировка выходила бы ~${est} мин (у тебя ${p.sessionMinutes})`);
  } else pros.push(`объём помещается в ${p.sessionMinutes} мин`);
  if (exercises > 9) {
    s -= (exercises - 9) * 2;
    cons.push(`~${Math.round(exercises)} упражнений за сессию`);
  }

  // Частота на мышцу
  if (f < 1.5) {
    s -= (1.5 - f) * 30;
    cons.push(`каждая мышца ~${times(f)} — для роста лучше ≥2`);
  } else if (f >= 1.8 && f <= 3) pros.push(`мышцы тренируются ~${times(f)}`);
  if (f > 3) {
    const k = capacity > 0.3 ? 0.5 : 1;
    s -= (f - 3) * 10 * k;
    cons.push(`каждая мышца ${times(f)} — мало времени на восстановление`);
  }

  // Объём на мышцу за сессию
  const worst = Math.max(...BIG.map((m) => targets[m] / f));
  const cap = capacity < -0.2 ? 8 : 10;
  if (worst > cap) {
    s -= (worst - cap) * 2.5;
    cons.push(`до ${Math.round(worst)} подходов на одну мышцу за раз — часть объёма «впустую»`);
  } else if (f >= 1.8) pros.push('недельный объём распределяется без перегруза одной сессии');

  // Системная усталость: присед + тяга + жим каждую тренировку тяжелее переносить с опытом
  if (split === 'fullbody' && d >= 3 && p.level !== 'beginner') {
    const pen = capacity > 0.3 ? 3 : capacity < -0.2 ? 9 : 6;
    s -= pen;
    cons.push('тяжёлые базовые для всего тела в каждой тренировке');
  }

  // Уровень
  if (p.level === 'beginner') {
    if (split === 'fullbody') {
      s += 12;
      pros.push('новичку важна частая отработка базовых движений');
    } else if (split === 'upper_lower' || split === 'upper_lower_full') s += 3;
    else s -= 6;
  } else if (p.level === 'advanced' && split !== 'fullbody') s += 3;

  // Дни: идеальное совпадение
  if (spec.ideal.includes(d)) pros.push(`рассчитан на ${d} ${plural(d)} в неделю`);
  else s -= 6;

  // Приоритетные мышцы: нужна частота ≥2
  for (const m of prefs.priorityMuscles) {
    if (f < 1.8) {
      s -= 6;
      cons.push(`приоритет (${VM_ACC[m]}) получает мало частоты`);
    }
  }
  if (split === 'torso_limbs' && prefs.priorityMuscles.some((m) => m === 'biceps' || m === 'triceps')) {
    s += 4;
    pros.push('руки в отдельный день — свежие на изоляции');
  }
  if (prefs.priorityMuscles.length && f >= 1.8 && f <= 3) pros.push('приоритетные группы — 2+ раза в неделю');

  // Ограничения и оборудование
  if (spec.legDay && legsRestricted) {
    s -= 5;
    cons.push('ограничения сужают выбор упражнений для отдельного дня ног');
  }
  if (p.location === 'home' && p.equipment.length <= 4 && split === 'fullbody') {
    s += 4;
    pros.push('с ограниченным оборудованием проще повторять движения чаще');
  }
  if (p.goal === 'cut' && f > 3) s -= 3;

  // Восстановление: высокое — частота переносится легче; низкое — меньше частоты
  if (capacity > 0.3 && f >= 2) {
    s += 3;
    pros.push('хорошее восстановление позволяет частые тренировки');
  }
  if (capacity < -0.2 && f > 2.5) s -= 5;

  return { split, score: Math.round(s), pros, cons, estMinutes: est, freq: Math.round(f * 10) / 10 };
}

/**
 * Split Decision Engine. Явный выбор пользователя всегда главнее (но сравнение с остальными сохраняется);
 * в режиме «авто» побеждает вариант с лучшей оценкой — Full Body лишь один из кандидатов.
 */
export function chooseSplit(p: UserProfile, prefs: TrainingPreferences, sessions: WorkoutSession[] = [], rec?: RecoveryEstimate, opts: { legsRestricted?: boolean } = {}): SplitDecision {
  const pref = prefs.preferredSplit;
  const d = p.daysPerWeek;
  const reasons: string[] = [];

  // Фактическая частота: если стабильно тренируешься реже плана — сплит под реальность
  const actual = actualFrequency(sessions);
  let eff = d;
  if (pref === 'auto' && actual !== null && actual < d - 0.8) {
    eff = Math.max(2, Math.round(actual));
    reasons.push(`Фактически ты тренируешься ~${actual.toFixed(1).replace('.', ',')} раза в неделю — сплит рассчитан так, чтобы ни одна группа не выпадала`);
  } else reasons.push(`${d} ${plural(d)} в неделю по ~${p.sessionMinutes} мин`);

  const targets = weeklyTargets(p, prefs, rec?.factor ?? 1);
  const candidates = (Object.keys(SPECS) as SplitType[])
    .map((s) => scoreSplit(s, eff, p, prefs, targets, rec, !!opts.legsRestricted))
    .filter((x): x is SplitCandidate => !!x)
    .sort((a, b) => b.score - a.score);

  let split: SplitType;
  let auto = true;
  if (pref !== 'auto' && pref !== 'custom') {
    auto = false;
    split = pref === 'ppl' && d >= 6 ? 'ppl_x2' : pref;
    reasons.unshift(`Выбран формат ${SPLIT_PREF_LABEL[pref]}`);
    if (!candidates.some((c) => c.split === split)) {
      const c = scoreSplit(split, Math.min(Math.max(d, SPECS[split].days[0]), SPECS[split].days[1]), p, prefs, targets, rec, !!opts.legsRestricted);
      if (c) candidates.push({ ...c, cons: [`рассчитан на ${SPECS[split].days[0]}–${SPECS[split].days[1]} дней — дни идут по ротации`, ...c.cons] });
    }
  } else split = candidates[0]?.split ?? 'fullbody';

  const chosen = candidates.find((c) => c.split === split);
  if (chosen) reasons.push(...chosen.pros.slice(0, 4));
  if (p.goal === 'bulk' || p.goal === 'recomp') reasons.push('Цель — рост мышц: частота ~2 раза в неделю и достаточный объём');
  if (p.goal === 'cut') reasons.push('Сушка: объём немного снижен, чтобы восстанавливаться в дефиците');
  if (rec && rec.level !== 'normal') reasons.push(rec.level === 'high' ? `Восстановление хорошее (${rec.reasons.slice(0, 2).join(', ')})` : `Восстановление снижено (${rec.reasons.slice(0, 2).join(', ')}) — объём и частота умереннее`);
  if (prefs.priorityMuscles.length) reasons.push(`Приоритет: ${prefs.priorityMuscles.map((m) => VM_ACC[m]).join(', ')} — больше подходов и раньше в тренировке`);
  return { split, reasons: [...new Set(reasons)], auto, candidates };
}

/** «Почему не X?» — сравнение выбранного варианта с другим, понятными словами */
export function compareSplits(decision: SplitDecision, other: SplitType): { chosen?: SplitCandidate; other?: SplitCandidate; summary: string } {
  const chosen = decision.candidates.find((c) => c.split === decision.split);
  const o = decision.candidates.find((c) => c.split === other);
  if (!o) return { chosen, summary: `${SPLIT_LABEL[other]} не подходит под ${decision.candidates.length ? 'твоё число дней' : 'текущие параметры'}.` };
  const better = (chosen?.score ?? 0) >= o.score;
  return { chosen, other: o, summary: better ? `${SPLIT_LABEL[decision.split]} лучше подходит: ${(o.cons[0] ?? 'меньше плюсов при тех же днях').replace(/^./, (c) => c.toLowerCase())}.` : `${SPLIT_LABEL[other]} по данным подходит не хуже — можно выбрать его вручную.` };
}
