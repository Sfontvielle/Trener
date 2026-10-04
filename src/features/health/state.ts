import type { HealthAvailability } from '@/services/health';
import { BRAND } from '@/config/brand';

/**
 * Состояние подключения Apple Health для UI — чистая функция (тестируется без устройства).
 * Никакого «успеха» без данных: «Подключено» — только если синхронизация прошла и данные пришли.
 */
export type HealthUiState =
  | { kind: 'connected'; lastSyncAt: number }
  | { kind: 'no_permission'; text: string }
  | { kind: 'unavailable'; reason: string; detail?: string }
  | { kind: 'error'; text: string; detail: string }
  | { kind: 'not_connected' };

export function healthUiState(a: { av: HealthAvailability; enabled: boolean; lastSyncAt: number | null; lastError: string | null; hasData: boolean; loadError?: string | null }): HealthUiState {
  if (a.av === 'unsupported') return { kind: 'unavailable', reason: `Apple Health работает только в приложении ${BRAND} на iPhone.` };
  if (a.av === 'expo_go') return { kind: 'unavailable', reason: `Открыто в Expo Go — в нём нет нативного модуля HealthKit. Нужна сборка ${BRAND} (EAS development build).`, detail: a.loadError ?? undefined };
  if (a.av === 'module_missing')
    return { kind: 'unavailable', reason: `Модуль HealthKit не найден в этой сборке. Скорее всего, сборка сделана до подключения Apple Health — нужна новая нативная сборка (eas build).`, detail: a.loadError ?? undefined };
  if (a.av === 'unavailable') return { kind: 'unavailable', reason: 'На этом устройстве Apple Health недоступен (например, iPad без приложения «Здоровье»).' };
  if (!a.enabled) return { kind: 'not_connected' };
  if (a.lastError) return { kind: 'error', text: 'Ошибка подключения', detail: a.lastError };
  if (a.lastSyncAt && !a.hasData)
    return { kind: 'no_permission', text: `Данных нет. iOS не сообщает приложениям об отказе в чтении — проверь: «Здоровье» → профиль → Приложения → ${BRAND} → включи нужные категории.` };
  if (a.lastSyncAt) return { kind: 'connected', lastSyncAt: a.lastSyncAt };
  return { kind: 'not_connected' };
}
