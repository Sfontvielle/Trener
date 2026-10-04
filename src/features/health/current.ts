import { useBody } from '@/stores/body';
import { useEnhanced } from '@/stores/enhanced';
import { useHealth } from '@/stores/health';
import { useLabs } from '@/stores/labs';
import { useProfile } from '@/stores/profile';
import { healthGate, healthMonitor, type HealthGate, type HealthSignal } from './monitor';

/** Текущие сигналы здоровья из сторов (для сервисов, не для чистой логики) */
export function currentHealthSignals(): HealthSignal[] {
  const en = useEnhanced.getState();
  return healthMonitor({
    enhanced: en.enabled,
    bp: en.bp,
    health: useHealth.getState().days,
    labs: useLabs.getState().reports,
    weights: useBody.getState().weights,
    metrics: useBody.getState().metrics,
    sex: useProfile.getState().profile?.sex,
  });
}

export function currentHealthGate(): HealthGate {
  return healthGate(currentHealthSignals());
}

/** Причина для recommend({ noIncrease }) — или undefined */
export function noIncreaseReason(): string | undefined {
  return currentHealthGate().blockIncrease ? 'есть показатели здоровья, которые стоит обсудить с врачом.' : undefined;
}
