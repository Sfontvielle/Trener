import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';
import type { PersistOptions, PersistStorage, StorageValue } from 'zustand/middleware';
import { BRAND } from '@/config/brand';

/**
 * Локальное хранилище RYNJI. Префикс ключей `form.` исторический — не меняется, иначе пропадут сохранённые данные.
 * Каждая сущность — отдельный ключ AsyncStorage (`form.<name>.v<version>`), а не один большой JSON.
 * Слой изолирован: для перехода на SQLite (expo-sqlite) достаточно заменить `storage` на
 * адаптер с тем же интерфейсом getItem/setItem/removeItem — сторы и экраны не меняются.
 */
export const STORAGE_PREFIX = 'form.';

/**
 * Запись на диск — отложенная и одна на ключ: при частых изменениях (отметка подхода, ввод веса, вода) состояние
 * сериализуется не на каждое изменение, а один раз через WRITE_DELAY мс после последнего. На длинной истории
 * (сотни тренировок) это убирает подтормаживания. При сворачивании приложения / закрытии страницы всё
 * несохранённое записывается сразу (flushStorage).
 */
const WRITE_DELAY = 250;
const pending = new Map<string, StorageValue<unknown>>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function writeOne(name: string, value: StorageValue<unknown>) {
  try {
    await AsyncStorage.setItem(name, JSON.stringify(value));
  } catch (e) {
    console.warn(`[${BRAND}] storage write failed`, name, e);
  }
}

export async function flushStorage(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  const items = [...pending.entries()];
  pending.clear();
  await Promise.all(items.map(([k, v]) => writeOne(k, v)));
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void flushStorage(), WRITE_DELAY);
}

let flushHooked = false;
function hookFlush() {
  if (flushHooked) return;
  flushHooked = true;
  try {
    AppState.addEventListener('change', (st) => {
      if (st !== 'active') void flushStorage();
    });
  } catch {
    /* noop */
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => void flushStorage());
    window.addEventListener('beforeunload', () => void flushStorage());
  }
}

const storage: PersistStorage<unknown> = {
  getItem: async (name) => {
    // Несохранённое ещё значение — источник истины
    if (pending.has(name)) return pending.get(name)!;
    try {
      const raw = await AsyncStorage.getItem(name);
      return raw ? (JSON.parse(raw) as StorageValue<unknown>) : null;
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    hookFlush();
    pending.set(name, value);
    schedule();
  },
  removeItem: async (name) => {
    pending.delete(name);
    try {
      await AsyncStorage.removeItem(name);
    } catch {
      /* noop */
    }
  },
};

/**
 * Версия схемы: при повышении `version` ОБЯЗАТЕЛЬНО передать `migrate`, иначе zustand отбросит сохранённые данные.
 * Новые поля добавляются как необязательные; старые записи нормализуются в migrate (на диске) и в
 * функциях чтения (например, sleepMinutesOf) — так открываются и старые резервные копии.
 */
export function persistOptions<S, P = Partial<S>>(name: string, version: number, partialize?: (s: S) => P, migrate?: (persisted: unknown, fromVersion: number) => P): PersistOptions<S, P> {
  return {
    name: `${STORAGE_PREFIX}${name}`,
    version,
    storage: storage as PersistStorage<P>,
    partialize: partialize as ((s: S) => P) | undefined,
    ...(migrate ? { migrate } : {}),
  } as PersistOptions<S, P>;
}

export async function clearAllData(): Promise<void> {
  pending.clear();
  if (timer) clearTimeout(timer);
  timer = null;
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(STORAGE_PREFIX)));
  } catch {
    /* noop */
  }
}
