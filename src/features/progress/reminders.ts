import type { BodyMetric, ISODate, WeightEntry } from '@/types';
import { daysBetween } from '@/utils/date';

/**
 * Когда пора обновить замер — без ежедневных требований и навязчивых окон.
 * Частота (ЭВРИСТИКА RYNJI, согласована с тем, как быстро меняется показатель и насколько он шумный):
 *  • вес — часто: напоминаем, если нет взвешивания 3+ дня (для тренда нужно 3–4 в неделю);
 *  • талия — раз в неделю: напоминаем через 7+ дней;
 *  • грудь / рука / бедро / бёдра — раз в 4 недели (меняются медленно, частые замеры — шум).
 * Возвращается не больше одного напоминания — самое важное.
 */
export type MeasureKind = 'weight' | BodyMetric['kind'];
export interface MeasureReminder {
  kind: MeasureKind;
  text: string;
  daysSince: number | null;
}

const EVERY: Partial<Record<MeasureKind, number>> = { weight: 3, waist: 7, chest: 28, arm: 28, thigh: 28, hips: 28 };
const NAME: Partial<Record<MeasureKind, string>> = { waist: 'талии', chest: 'груди', arm: 'руки', thigh: 'бедра', hips: 'бёдер (таза)' };

export function measurementDue(weights: WeightEntry[], metrics: BodyMetric[], ref: ISODate): MeasureReminder | null {
  const last = (k: MeasureKind) => {
    const dates = k === 'weight' ? weights.map((w) => w.date) : metrics.filter((m) => m.kind === k).map((m) => m.date);
    return dates.length ? dates.sort()[dates.length - 1] : null;
  };
  const lw = last('weight');
  const dw = lw ? daysBetween(lw, ref) : null;
  if (dw === null || dw >= EVERY.weight!) return { kind: 'weight', daysSince: dw, text: dw === null ? 'Взвесьтесь утром — с этого начнётся тренд веса' : `Нет взвешиваний ${dw} дн. — взвесьтесь утром` };
  const lt = last('waist');
  const dt = lt ? daysBetween(lt, ref) : null;
  // Талию напоминаем, когда уже есть привычка взвешиваться (не засыпаем новичка всем сразу)
  if (weights.length >= 3 && (dt === null || dt >= EVERY.waist!)) return { kind: 'waist', daysSince: dt, text: 'Пора обновить замер талии' };
  // Обхваты — только тем, кто их уже ведёт
  for (const k of ['chest', 'arm', 'thigh', 'hips'] as const) {
    const l = last(k);
    if (l && daysBetween(l, ref) >= EVERY[k]!) return { kind: k, daysSince: daysBetween(l, ref), text: `Пора обновить замер ${NAME[k]}` };
  }
  return null;
}
