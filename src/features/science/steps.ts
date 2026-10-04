import type { ISODate } from '@/types';
import type { HealthDay } from '@/features/health/model';
import { addDays, today } from '@/utils/date';
import type { Basis } from './sources';

/**
 * Персональная цель шагов.
 *
 * Научная часть: польза для здоровья растёт с числом шагов и выходит на плато примерно
 * на 6–8 тыс. (60+ лет) и 8–10 тыс. (моложе 60) — Paluch 2022; заметная польза уже с ~7 тыс. —
 * Ding 2025. Шаги — это часть бытовой активности (NEAT) и расхода энергии, а не средство «сжечь жир
 * в конкретном месте»: локально управлять распределением жира невозможно.
 *
 * Эвристика RYNJI (постепенность):
 *  • база — медиана шагов за последние 14–28 дней (нужно ≥7 дней с данными), иначе — со слов пользователя;
 *  • если база ниже ориентира пользы — цель = база + ~10% (не меньше +500, не больше +1500), с округлением до 500;
 *  • если база уже выше ориентира — цель = база: не просим ходить меньше привычного;
 *  • не меньше 4000 и не больше 15000 по умолчанию (крайние значения — решение человека).
 */
export interface StepGoal {
  target: number;
  baseline: number;
  source: 'health' | 'profile';
  daysOfData: number;
  /** Ориентир пользы для возраста */
  benefitRange: [number, number];
  reason: string;
  basis: Basis;
}

const round500 = (x: number) => Math.round(x / 500) * 500;

export function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

export function stepGoal(args: { age: number; profileSteps: number; health?: Record<string, HealthDay>; ref?: ISODate }): StepGoal {
  const ref = args.ref ?? today();
  const benefit: [number, number] = args.age >= 60 ? [6000, 8000] : [8000, 10000];
  const vals: number[] = [];
  for (let i = 1; i <= 28; i++) {
    const d = args.health?.[addDays(ref, -i)];
    if (d?.steps !== undefined && d.steps > 300) vals.push(d.steps);
  }
  const fromHealth = vals.length >= 7;
  const baseline = Math.round(fromHealth ? median(vals) : args.profileSteps);
  const basis: Basis = { kind: 'heuristic', sources: ['paluch2022', 'ding2025', 'who2020'], note: 'ориентир пользы — из метаанализов; темп повышения ~10% — правило RYNJI' };
  let target: number;
  let reason: string;
  if (baseline >= benefit[0]) {
    target = Math.min(15000, Math.max(round500(baseline), benefit[0]));
    reason = `Ты обычно проходишь ~${fmt(baseline)} — это уже в зоне пользы (${fmt(benefit[0])}–${fmt(benefit[1])}). Держим привычный уровень.`;
  } else {
    target = Math.max(4000, round500(Math.min(baseline + 1500, Math.max(baseline + 500, baseline * 1.1))));
    reason = `Обычно ~${fmt(baseline)} шагов. Повышаем постепенно (+~10%) к ориентиру ${fmt(benefit[0])}–${fmt(benefit[1])}.`;
  }
  if (!fromHealth) reason += ' База — со слов в профиле; с Apple Health цель станет точнее.';
  return { target, baseline, source: fromHealth ? 'health' : 'profile', daysOfData: vals.length, benefitRange: benefit, reason, basis };
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('ru-RU');
}
