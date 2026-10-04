import { useHealth } from '@/stores/health';
import { useBody } from '@/stores/body';
import { fetchHealthDays, healthAvailability, healthLoadError, logHealthError, requestHealthAccess } from '@/services/health';
import { BRAND } from '@/config/brand';

/**
 * Синхронизация Apple Health → RYNJI. Вызывается при подключении, по кнопке и автоматически при
 * открытии приложения (не чаще раза в 30 минут). Ошибки не ломают приложение: текст ошибки сохраняется
 * в сторе (для «Подробнее») и пишется в лог.
 */
function unavailableMessage(): string {
  const av = healthAvailability();
  if (av === 'expo_go') return `Apple Health недоступен в Expo Go — нужна сборка ${BRAND}`;
  if (av === 'module_missing') return `Модуль HealthKit отсутствует в сборке — нужна новая нативная сборка${healthLoadError() ? ` (${healthLoadError()})` : ''}`;
  if (av === 'unavailable') return 'Apple Health недоступен на этом устройстве';
  return 'Apple Health доступен только на iPhone';
}

export async function syncHealth(): Promise<{ ok: boolean; days: number; message: string }> {
  if (healthAvailability() !== 'available') return { ok: false, days: 0, message: unavailableMessage() };
  try {
    const days = await fetchHealthDays(21);
    const at = Date.now();
    useHealth.getState().applySync(days, at);
    // Вес из Health — только в дни без ручного взвешивания (ручная запись главнее)
    const body = useBody.getState();
    for (const d of days) {
      if (d.weightKg && !body.weights.some((w) => w.date === d.date)) body.addWeight(d.date, d.weightKg);
    }
    const withData = days.filter((d) => d.sleepHours || d.steps || d.restingHr || d.hrvMs).length;
    return { ok: withData > 0, days: withData, message: withData ? `Синхронизировано: ${withData} дн. с данными` : 'Данных нет — проверь доступ в приложении «Здоровье»' };
  } catch (e) {
    logHealthError('sync', e);
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    useHealth.getState().setError(msg);
    return { ok: false, days: 0, message: 'Ошибка чтения Apple Health' };
  }
}

export async function connectHealth(): Promise<{ ok: boolean; message: string }> {
  if (healthAvailability() !== 'available') return { ok: false, message: unavailableMessage() };
  useHealth.getState().setError(null);
  const r = await requestHealthAccess();
  if (r.error) {
    useHealth.getState().setEnabled(true);
    useHealth.getState().setError(r.error);
    return { ok: false, message: 'Ошибка подключения — нажми «Подробнее»' };
  }
  if (!r.ok) return { ok: false, message: `Доступ не выдан. ${BRAND} продолжит работать с ручным чек-ином` };
  useHealth.getState().setEnabled(true);
  const s = await syncHealth();
  return { ok: s.ok, message: s.message };
}

const AUTO_INTERVAL = 30 * 60_000;

export function maybeAutoSync() {
  const h = useHealth.getState();
  if (!h.enabled) return;
  if (h.lastSyncAt && Date.now() - h.lastSyncAt < AUTO_INTERVAL) return;
  void syncHealth();
}
