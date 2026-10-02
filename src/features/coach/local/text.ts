/** Нормализация текста вопроса: нижний регистр, «ё» → «е», без пунктуации */
export function norm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"“”.,!?;:()]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── Совпадение ключа с текстом ─────────────────────────────────────────────
/**
 * Ключ из одного слова — подстрока («белк» ⊂ «белка»). Ключ из нескольких основ — последовательность слов,
 * каждое начинается с основы: «ширин спин» ⊂ «ширину спины», «низк тестостерон» ⊂ «низкий тестостерон».
 */
export function keyHit(n: string, key: string): boolean {
  if (!key.includes(' ')) return n.includes(key);
  if (n.includes(key)) return true;
  const toks = key.split(' ').filter(Boolean);
  const words = n.split(' ');
  outer: for (let i = 0; i + toks.length <= words.length; i++) {
    for (let j = 0; j < toks.length; j++) if (!words[i + j].startsWith(toks[j])) continue outer;
    return true;
  }
  return false;
}
