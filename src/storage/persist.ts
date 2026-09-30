import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, type PersistOptions } from 'zustand/middleware';

/**
 * Локальное хранилище FORM.
 * Каждая сущность — отдельный ключ AsyncStorage (`form.<name>.v<version>`), а не один большой JSON.
 * Слой изолирован: для перехода на SQLite (expo-sqlite) достаточно заменить `storage` на
 * адаптер с тем же интерфейсом getItem/setItem/removeItem — сторы и экраны не меняются.
 */
export const STORAGE_PREFIX = 'form.';

const safeStorage = {
  getItem: async (name: string) => {
    try {
      return await AsyncStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: async (name: string, value: string) => {
    try {
      await AsyncStorage.setItem(name, value);
    } catch (e) {
      console.warn('[FORM] storage write failed', name, e);
    }
  },
  removeItem: async (name: string) => {
    try {
      await AsyncStorage.removeItem(name);
    } catch {
      /* noop */
    }
  },
};

export function persistOptions<S, P = Partial<S>>(name: string, version: number, partialize?: (s: S) => P): PersistOptions<S, P> {
  return {
    name: `${STORAGE_PREFIX}${name}`,
    version,
    storage: createJSONStorage(() => safeStorage),
    partialize: partialize as ((s: S) => P) | undefined,
  } as PersistOptions<S, P>;
}

export async function clearAllData(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(STORAGE_PREFIX)));
  } catch {
    /* noop */
  }
}
