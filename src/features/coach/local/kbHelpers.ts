import type { KbCtx, KbEntry, KbTopic } from './kb';

/** Короткая запись статьи базы знаний */
export function kb(id: string, topic: KbTopic, title: string, keys: string[], text: string | ((c: KbCtx) => string), o: { any?: string[]; medical?: boolean } = {}): KbEntry {
  return { id, topic, title, keys, any: o.any, medical: o.medical, answer: typeof text === 'string' ? () => text : text };
}

export const r10 = (n: number) => Math.round(n / 10) * 10;
