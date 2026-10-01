import { usePlan } from '@/stores/plan';
import { addDays, today } from '@/utils/date';
import { DELOAD_FACTOR, DELOAD_RIR, deloadDates } from './deload';

/** Применение/отмена разгрузочной недели (меняет план дня на ближайшие 7 дней) */
export function applyDeload(): number {
  const ps = usePlan.getState();
  if (!ps.plan) return 0;
  const dates = deloadDates(ps.plan);
  for (const date of dates) {
    ps.setOverride({
      date,
      mode: 'deload',
      volumeFactor: DELOAD_FACTOR,
      rirDelta: DELOAD_RIR,
      reason: 'Разгрузочная неделя: −40% подходов, запас 3–4 повтора, веса без повышения',
      source: 'user',
      createdAt: Date.now(),
    });
  }
  ps.addAdjustment({ kind: 'deload', summary: `Разгрузочная неделя (${dates.length} трен.)`, source: 'user' });
  return dates.length;
}

export function cancelDeload() {
  const ps = usePlan.getState();
  const ref = today();
  for (let i = 0; i < 7; i++) {
    const d = addDays(ref, i);
    if (ps.overrides[d]?.mode === 'deload') ps.clearOverride(d);
  }
  const weekAgo = Date.now() - 7 * 86400000;
  usePlan.setState((s) => ({ adjustments: s.adjustments.filter((a) => !(a.kind === 'deload' && a.createdAt > weekAgo)) }));
}
