import type { Basis } from '@/features/science/sources';

/**
 * Решение тренера RYNJI. Любая рекомендация отвечает на четыре вопроса:
 *  • что сделать (what) — конкретно, с числами;
 *  • почему (why) — простыми словами;
 *  • на каких данных (data) — даты тренировок, средние, окна наблюдения;
 *  • насколько уверен (confidence + confidenceNote) — честно, в том числе «низкая, пока исходная формула».
 * Все числа считает детерминированный код; LLM (если подключён) только переформулирует и объясняет.
 */
export type Confidence = 'low' | 'medium' | 'high';

export const CONFIDENCE_LABEL: Record<Confidence, string> = { low: 'низкая', medium: 'средняя', high: 'высокая' };

export type DecisionArea = 'training' | 'nutrition' | 'recovery' | 'body' | 'health' | 'schedule' | 'activity';

export interface Decision {
  id: string;
  area: DecisionArea;
  what: string;
  why: string;
  data: string[];
  confidence: Confidence;
  confidenceNote: string;
  basis: Basis;
}

export interface Rated {
  level: Confidence;
  note: string;
}

/** «Уверенность: низкая — недостаточно истории, пока исходная формула» */
export function confidenceText(c: Pick<Decision, 'confidence' | 'confidenceNote'>): string {
  return `Уверенность: ${CONFIDENCE_LABEL[c.confidence]} — ${c.confidenceNote}`;
}

export const fmtKg = (x: number) => String(Math.round(x * 100) / 100).replace('.', ',');
export const fmtInt = (x: number) => Math.round(x).toLocaleString('ru-RU');
export const signed = (x: number, digits = 1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x).toFixed(digits).replace('.', ',')}`;
