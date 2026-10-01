import { useHealth } from '@/stores/health';
import { useBody } from '@/stores/body';
import { fetchHealthDays, healthAvailability, requestHealthAccess } from '@/services/health';

/**
 * Синхронизация Apple Health → FORM. Вызывается при подключении, по кнопке и автоматически при
 * открытии приложения (не чаще раза в 30 минут). Ошибки не ломают приложение — только статус.
 */
export async function syncHealth(): Promise<{ ok: boolean; days: number; message: string }> {
  const av = healthAvailability();
  if (av !== 'available') return { ok: false, days: 0, message: av === 'needs_dev_build' ? 'Apple Health доступен в сборке FORM, не в Expo Go' : 'Apple Health недоступен на этом устройстве' };
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
    return { ok: true, days: withData, message: withData ? `Синхронизировано: ${withData} дн. с данными` : 'Данных нет — проверь доступ в приложении «Здоровье»' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ошибка чтения Apple Health';
    useHealth.getState().setError(msg);
    return { ok: false, days: 0, message: msg };
  }
}

export async function connectHealth(): Promise<{ ok: boolean; message: string }> {
  const av = healthAvailability();
  if (av !== 'available') return { ok: false, message: av === 'needs_dev_build' ? 'Нужна сборка FORM (EAS development build): в Expo Go Apple Health недоступен' : 'Apple Health доступен только на iPhone' };
  const granted = await requestHealthAccess();
  if (!granted) return { ok: false, message: 'Доступ не выдан. FORM продолжит работать с ручным чек-ином' };
  useHealth.getState().setEnabled(true);
  const r = await syncHealth();
  return { ok: r.ok, message: r.message };
}

const AUTO_INTERVAL = 30 * 60_000;

export function maybeAutoSync() {
  const h = useHealth.getState();
  if (!h.enabled) return;
  if (h.lastSyncAt && Date.now() - h.lastSyncAt < AUTO_INTERVAL) return;
  void syncHealth();
}
