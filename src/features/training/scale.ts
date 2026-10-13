/**
 * Объём тренировки по готовности: множитель применяется к тренировке целиком, а не к каждому упражнению.
 * Раньше 2 подхода × 0,85 округлялись обратно в 2 — «объём 85%» на деле ничего не менял.
 * Снижение: подходы убираются по одному у упражнения с наибольшим числом подходов (при равенстве — у более
 * позднего, обычно изолирующего), минимум 1 подход на упражнение. Повышение: добавляются ранним упражнениям.
 */
export function scaleSets(sets: number[], factor: number): number[] {
  const out = sets.map((n) => Math.max(1, Math.round(n)));
  if (!out.length || !Number.isFinite(factor) || Math.abs(factor - 1) < 1e-9) return out;
  const total = out.reduce((a, b) => a + b, 0);
  const target = Math.max(out.length, Math.round(total * factor));
  let diff = target - total;
  while (diff < 0) {
    let k = -1;
    for (let i = out.length - 1; i >= 0; i--) if (out[i] > 1 && (k < 0 || out[i] > out[k])) k = i;
    if (k < 0) break;
    out[k]--;
    diff++;
  }
  while (diff > 0) {
    let k = 0;
    for (let i = 1; i < out.length; i++) if (out[i] < out[k]) k = i;
    out[k]++;
    diff--;
  }
  return out;
}
