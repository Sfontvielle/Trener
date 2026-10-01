import type { SplitPreference, SplitType, TrainingPreferences, UserProfile, WorkoutSession } from '@/types';
import { addDays, today } from '@/utils/date';
import { VM_ACC } from './muscles';

export const SPLIT_LABEL: Record<SplitType, string> = {
  fullbody: 'Full Body',
  upper_lower: 'Верх / Низ',
  upper_lower_full: 'Верх / Низ / Всё тело',
  ppl: 'Push / Pull / Legs',
  ul_ppl: 'Верх / Низ + PPL',
  ppl_x2: 'PPL × 2',
};

export const SPLIT_PREF_LABEL: Record<SplitPreference, string> = {
  auto: 'Пусть FORM выбирает',
  fullbody: 'Full Body',
  upper_lower: 'Upper / Lower',
  ppl: 'Push / Pull / Legs',
  ul_ppl: 'Upper / Lower + PPL',
  custom: 'Свой (правлю шаблоны сам)',
};

const plural = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'тренировка' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'тренировки' : 'тренировок');

/** Средняя фактическая частота за последние 4 недели (если история достаточна) */
export function actualFrequency(sessions: WorkoutSession[], ref = today()): number | null {
  const from = addDays(ref, -28);
  const done = sessions.filter((s) => s.status === 'completed' && s.date > from);
  const first = sessions.filter((s) => s.status === 'completed').map((s) => s.date).sort()[0];
  if (!first || first > addDays(ref, -21)) return null;
  return done.length / 4;
}

/**
 * Выбор сплита. Явный выбор пользователя всегда главнее; в режиме «авто» FORM учитывает
 * дни, уровень, цель, длительность сессии, приоритетные мышцы и фактическую частоту тренировок.
 * Full Body — один из вариантов (2–3 дня, новички, короткие сессии), а не значение по умолчанию.
 */
export function chooseSplit(p: UserProfile, prefs: TrainingPreferences, sessions: WorkoutSession[] = []): { split: SplitType; reasons: string[]; auto: boolean } {
  const pref = prefs.preferredSplit;
  const d = p.daysPerWeek;
  const reasons: string[] = [];

  if (pref !== 'auto' && pref !== 'custom') {
    const split: SplitType = pref === 'ppl' && d >= 6 ? 'ppl_x2' : pref;
    reasons.push(`Ты выбрал формат ${SPLIT_LABEL[pref === 'ppl' ? 'ppl' : pref]}`);
    if (pref === 'upper_lower' && d === 2) reasons.push('При 2 днях каждая группа получает 1 тренировку в неделю — объём собран в эти дни');
    if (pref === 'upper_lower' && d === 3) reasons.push('3 дня: Верх и Низ чередуются, каждая неделя начинается со следующего дня ротации');
    if (pref === 'ppl' && d < 3) reasons.push('PPL рассчитан на 3+ дня — при меньшем числе дней дни идут по ротации');
    if (pref === 'ppl' && d >= 3 && d < 6) reasons.push(`${d} ${plural(d)} в неделю: Push, Pull, Legs идут по кругу`);
    if (pref === 'ul_ppl' && d !== 5) reasons.push('Верх/Низ + PPL рассчитан на 5 дней — дни идут по ротации');
    if (pref === 'fullbody' && d >= 5) reasons.push('Full Body 5+ раз в неделю — объём каждой сессии будет небольшим');
    if (pref === 'upper_lower' && d >= 4) reasons.push(`${d} ${plural(d)} в неделю: каждая группа — 2 раза в неделю`);
    if (pref === 'fullbody' && d >= 2 && d <= 4) reasons.push(`${d} ${plural(d)} в неделю: каждая группа — ${d} раза в неделю небольшими порциями`);
    reasons.push(`Сессии ~${p.sessionMinutes} мин — подходы распределены от недельной цели по каждой мышце`);
    if (prefs.priorityMuscles.length) reasons.push(`Приоритет: ${prefs.priorityMuscles.map((m) => VM_ACC[m]).join(', ')}`);
    return { split, reasons, auto: false };
  }

  // Фактическая частота: если стабильно тренируешься реже плана — сплит под реальность
  const actual = actualFrequency(sessions);
  let eff = d;
  if (actual !== null && actual < d - 0.8) {
    eff = Math.max(2, Math.round(actual));
    reasons.push(`Фактически ты тренируешься ~${actual.toFixed(1).replace('.', ',')} раза в неделю — сплит рассчитан так, чтобы ни одна группа не выпадала`);
  } else {
    reasons.push(`Ты тренируешься ${d} раз${d >= 2 && d <= 4 ? 'а' : ''} в неделю`);
  }

  let split: SplitType;
  if (eff <= 2) {
    split = 'fullbody';
    reasons.push('При 2 тренировках Full Body даёт каждой мышце 2 стимула в неделю');
  } else if (eff === 3) {
    if (p.level === 'advanced' && p.sessionMinutes >= 60) {
      split = 'ppl';
      reasons.push('Продвинутый уровень: больше объёма на группу за сессию');
    } else if (p.level === 'intermediate' && p.sessionMinutes >= 60) {
      split = 'upper_lower_full';
      reasons.push('Средний уровень и сессии 60+ мин: Верх/Низ/Всё тело — частота ~1,5–2 раза в неделю и больше объёма на сессию');
    } else {
      split = 'fullbody';
      reasons.push(p.level === 'beginner' ? 'Новичку важны частота и регулярная отработка базовых движений' : 'Короткие сессии — Full Body эффективнее распределяет объём');
    }
  } else if (eff === 4) {
    split = 'upper_lower';
    reasons.push('Каждая мышечная группа получает 2 тренировки в неделю');
  } else if (eff === 5) {
    split = 'ul_ppl';
    reasons.push('Верх/Низ + Push/Pull/Legs: частота ~2 раза в неделю и разные акценты');
  } else {
    split = 'ppl_x2';
    reasons.push('6 дней: каждая группа дважды в неделю, сессии не перегружены');
  }

  if (p.goal === 'bulk' || p.goal === 'recomp') reasons.push('Цель — рост мышц: важны частота ~2 раза в неделю и достаточный объём');
  if (p.goal === 'cut') reasons.push('Сушка: объём немного снижен, чтобы восстанавливаться в дефиците');
  reasons.push(`Сессии ~${p.sessionMinutes} мин — объём распределён так, чтобы уложиться`);
  if (prefs.priorityMuscles.length) reasons.push(`Приоритет: ${prefs.priorityMuscles.map((m) => VM_ACC[m]).join(', ')} — больше подходов и раньше в тренировке`);
  return { split, reasons, auto: true };
}
