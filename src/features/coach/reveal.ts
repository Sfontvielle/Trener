/**
 * Ответ тренера «печатается» как у живого человека (R1): сначала короткая пауза с индикатором набора,
 * потом текст появляется словами. Длинный ответ ускоряется — показ целиком не дольше ~6 с.
 * Чистые функции: тайминги и границы слов, без React.
 */

/** Пауза «думает» перед первым словом, мс: дольше для длинных ответов, но не больше 1,6 с */
export function thinkMs(len: number): number {
  return Math.round(Math.min(1600, Math.max(600, 450 + len * 1.5)));
}

/** Сколько длится показ всего текста, мс: ~60 знаков/с, от 1,2 до 6 с */
export function revealMs(len: number): number {
  return Math.round(Math.min(6000, Math.max(1200, (len / 60) * 1000)));
}

/**
 * Границы показа: после каждого слова (вместе с пробелами и переносами). Разметку **жирного** не рвём —
 * внутри неё граница переносится на закрывающие звёздочки, чтобы не мигали «**».
 */
export function wordStops(text: string): number[] {
  const out: number[] = [];
  const re = /\S+\s*/g;
  let m: RegExpExecArray | null;
  let bold = false;
  while ((m = re.exec(text))) {
    const end = m.index + m[0].length;
    const stars = (m[0].match(/\*\*/g) ?? []).length;
    if (stars % 2) bold = !bold;
    if (!bold) out.push(end);
  }
  if (!out.length || out[out.length - 1] !== text.length) out.push(text.length);
  return out;
}

/** Показанная часть текста к моменту t (мс от начала показа) */
export function revealedAt(text: string, stops: number[], t: number, total = revealMs(text.length)): string {
  if (t <= 0) return '';
  if (t >= total) return text;
  const k = Math.min(stops.length - 1, Math.floor((t / total) * stops.length));
  return text.slice(0, stops[k]);
}
