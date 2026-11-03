import type { Macros } from '@/types';
import { fmtValue } from '@/utils/format';

export interface RemainderOption {
  items: { name: string; grams: number }[];
  kcal: number;
  protein: number;
}

export interface RemainderHint {
  tone: 'info' | 'warning';
  title: string;
  text?: string;
}

/** Перебор калорий, после которого стоит сказать об этом (меньше — обычный разброс дня) */
export const OVER_KCAL = 150;
/** Недобор белка, о котором есть смысл напомнить */
export const LOW_PROTEIN_G = 25;
/** С какой доли пищевого дня (7:00–22:00) напоминать о недоборе: утром всё ещё впереди */
export const REMIND_FROM = 0.4;

/**
 * Подсказка тренера по остатку дня в дневнике (SCREEN_BLUEPRINTS §9): одна фраза — и только когда есть что сказать.
 * Перебор калорий — без «отработай» и урезания завтра. Заметный недобор белка ближе к вечеру — сколько осталось
 * и один вариант из базы продуктов, если он есть. Ничего не записывает сама.
 */
export function remainderHint(args: { target: Macros; eaten: Macros; entries: number; progress: number; option?: RemainderOption | null }): RemainderHint | null {
  const { target, eaten } = args;
  if (!args.entries || target.kcal <= 0) return null;
  const over = Math.round(eaten.kcal - target.kcal);
  if (over > OVER_KCAL) {
    return { tone: 'warning', title: `Калорий на ${fmtValue(over)} больше цели.`, text: 'Один день ничего не ломает: завтра — по плану, без урезания.' };
  }
  const leftP = Math.round(target.protein - eaten.protein);
  const leftK = Math.round(target.kcal - eaten.kcal);
  if (args.progress < REMIND_FROM || leftP < LOW_PROTEIN_G || leftK < OVER_KCAL) return null;
  const o = args.option;
  const text = o && o.items.length ? `Например, ${o.items.map((i) => `${i.name.toLowerCase()} ${fmtValue(i.grams)} г`).join(' и ')}: ≈ ${fmtValue(o.kcal)} ккал и ${fmtValue(o.protein)} г белка.` : undefined;
  return { tone: 'info', title: `Осталось ${fmtValue(leftP)} г белка и ${fmtValue(leftK)} ккал.`, text };
}
