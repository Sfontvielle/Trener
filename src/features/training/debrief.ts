import type { Exercise, WorkoutSession } from '@/types';
import { getExercise } from '@/data/exercises';
import { historyFor, isPersonalRecord, workingSets } from './progression';
import { sessionVolume } from './analytics';

/**
 * Разбор завершённой тренировки (FORM Coach, без сети): объём к прошлой такой же тренировке,
 * рекорды, где прогресс, где подходы были тяжелее нормы и что из этого следует.
 */
export interface Debrief {
  minutes: number;
  sets: number;
  tonnage: number;
  volumeDeltaPct: number | null;
  prs: string[];
  lines: string[];
}

const kg = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

export function workoutDebrief(s: WorkoutSession, all: WorkoutSession[], customs: Exercise[] = []): Debrief {
  const v = sessionVolume(s);
  const before = all.filter((x) => x.status === 'completed' && x.id !== s.id && (x.finishedAt ?? x.startedAt) < s.startedAt);
  // Сравнение с прошлой тренировкой того же шаблона (или с тем же названием)
  const prev = [...before].reverse().find((x) => (s.templateId && x.templateId === s.templateId) || x.name === s.name);
  const pv = prev ? sessionVolume(prev) : null;
  const volumeDeltaPct = pv && pv.tonnage > 0 && v.tonnage > 0 ? Math.round(((v.tonnage - pv.tonnage) / pv.tonnage) * 100) : null;

  const prs: string[] = [];
  const up: string[] = [];
  const heavy: string[] = [];
  for (const we of s.exercises) {
    const ex = getExercise(we.exerciseId, customs);
    const ws = workingSets(we.sets);
    if (!ex || !ws.length) continue;
    const hist = historyFor(ex.id, before, 6);
    const best = ws.filter((x) => isPersonalRecord(ex, x, hist)).sort((a, b) => b.weight - a.weight)[0];
    if (best) prs.push(`${ex.name} ${best.weight ? `${kg(best.weight)} × ${best.reps}` : `${best.reps} повт.`}`);
    const lastTop = hist[0] ? Math.max(...hist[0].sets.map((x) => x.weight)) : 0;
    const top = Math.max(...ws.map((x) => x.weight));
    if (lastTop > 0 && top > lastTop) up.push(`${ex.name} (+${kg(top - lastTop)} кг)`);
    // Два последних подхода тяжелее нормы: «тяжело»/RIR 0 или ниже нижней границы повторов
    const tail = ws.slice(-2);
    if (tail.length === 2 && tail.every((x) => x.feel === 'hard' || (x.rir !== undefined && x.rir <= 0) || x.reps < we.repMin)) heavy.push(ex.name);
  }

  const lines: string[] = [];
  if (up.length) lines.push(`${up.slice(0, 2).join(', ')} — прогресс.`);
  if (heavy.length) lines.push(`Последние подходы в «${heavy.slice(0, 2).join('», «')}» были тяжелее нормы — в следующий раз вес там не повышаю.`);
  if (!up.length && !heavy.length && v.sets) lines.push('Ровная рабочая тренировка — продолжаем по плану.');
  if (volumeDeltaPct !== null && Math.abs(volumeDeltaPct) >= 3) lines.push(`Тоннаж ${volumeDeltaPct > 0 ? '+' : ''}${volumeDeltaPct}% к прошлой такой же тренировке.`);
  return { minutes: v.durationMin, sets: v.sets, tonnage: Math.round(v.tonnage), volumeDeltaPct, prs, lines };
}
