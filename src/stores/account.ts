import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistOptions } from '@/storage/persist';

/**
 * Аккаунт и первый запуск. Данные пользователя по-прежнему хранятся локально (профиль, тренировки, питание);
 * вход через Apple ID только привязывает этот локальный профиль к идентификатору Apple. Облачной копии пока нет —
 * её не имитируем (iCloud — отдельный этап).
 */
export interface AppleLink {
  /** Стабильный идентификатор пользователя Apple для приложений одного разработчика */
  userId: string;
  /** Apple отдаёт имя и почту только при первом входе — сохраняем сразу */
  email?: string;
  givenName?: string;
  familyName?: string;
  linkedAt: number;
}

interface AccountState {
  /** Приветствие уже показано (больше не показываем при обычных запусках) */
  welcomeSeen: boolean;
  apple: AppleLink | null;
  /** Вход пропущен: старые установки (раньше была кнопка «Продолжить без входа») и dev-сборки без Apple ID; привязать — в Профиле */
  authSkipped: boolean;
  setWelcomeSeen: () => void;
  linkApple: (a: AppleLink) => void;
  unlinkApple: () => void;
  skipAuth: () => void;
  reset: () => void;
}

export const useAccount = create<AccountState>()(
  persist(
    (set) => ({
      welcomeSeen: false,
      apple: null,
      authSkipped: false,
      setWelcomeSeen: () => set({ welcomeSeen: true }),
      linkApple: (a) => set({ apple: a, authSkipped: false }),
      unlinkApple: () => set({ apple: null }),
      skipAuth: () => set({ authSkipped: true }),
      reset: () => set({ welcomeSeen: false, apple: null, authSkipped: false }),
    }),
    persistOptions<AccountState>('account', 1, (s) => ({ welcomeSeen: s.welcomeSeen, apple: s.apple, authSkipped: s.authSkipped }) as AccountState),
  ),
);
