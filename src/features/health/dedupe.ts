/**
 * Защита от дублей Apple Health. HealthKit хранит записи iPhone, Apple Watch и сторонних приложений;
 * просто складывать samples нельзя.
 *  • Шаги/активная энергия — основной путь: агрегированная статистика HealthKit (statistics query, cumulativeSum):
 *    HealthKit сам убирает пересечения источников. Если статистики нет — fallback: берём МАКСИМУМ по источникам
 *    за день, а не сумму (iPhone и Watch считают одни и те же шаги).
 *  • Сон — объединение пересекающихся интервалов «спал» от всех источников.
 *  • Тренировки — одна и та же тренировка из двух приложений (Watch + Strava) пересекается по времени ≥50%:
 *    оставляем одну (с энергией; при равенстве — более длинную).
 *  • Вес — несколько взвешиваний за день → самое раннее (утреннее, натощак).
 */

export function mergedMinutes(ivs: [number, number][]): number {
  const s = [...ivs].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const iv of s) {
    if (!cur || iv[0] > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [iv[0], iv[1]];
    } else cur[1] = Math.max(cur[1], iv[1]);
  }
  if (cur) total += cur[1] - cur[0];
  return total / 60000;
}

export interface WorkoutSample {
  start: number;
  minutes: number;
  kcal?: number;
  strength: boolean;
  source?: string;
}

export function dedupeWorkouts<T extends WorkoutSample>(list: T[]): T[] {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out: T[] = [];
  for (const w of sorted) {
    const end = w.start + w.minutes * 60000;
    const dupIdx = out.findIndex((o) => {
      const oEnd = o.start + o.minutes * 60000;
      const overlap = Math.min(end, oEnd) - Math.max(w.start, o.start);
      const shorter = Math.min(w.minutes, o.minutes) * 60000;
      return shorter > 0 && overlap >= shorter * 0.5;
    });
    if (dupIdx < 0) out.push(w);
    else {
      const o = out[dupIdx];
      const better = (w.kcal ?? 0) > 0 && !(o.kcal ?? 0) ? w : (o.kcal ?? 0) > 0 && !(w.kcal ?? 0) ? o : w.minutes > o.minutes ? w : o;
      out[dupIdx] = { ...better, strength: o.strength || w.strength };
    }
  }
  return out;
}

/** Самое раннее взвешивание дня */
export function pickDailyWeight(samples: { at: number; kg: number }[]): number | undefined {
  if (!samples.length) return undefined;
  return [...samples].sort((a, b) => a.at - b.at)[0].kg;
}

/** Fallback для шагов без статистики HealthKit: максимум по источникам за день, не сумма */
export function stepsFromSources(samples: { source: string; count: number }[]): number {
  const by = new Map<string, number>();
  for (const s of samples) by.set(s.source, (by.get(s.source) ?? 0) + s.count);
  return by.size ? Math.max(...by.values()) : 0;
}
