/**
 * Куда вести при запуске. Существующие пользователи (есть локальный профиль) попадают сразу в приложение —
 * ни приветствие, ни вход их не блокируют; привязать Apple ID можно в Профиле.
 *   нет профиля: приветствие (один раз) → вход через Apple или «без входа» → анкета.
 */
export type EntryRoute = 'app' | 'welcome' | 'auth' | 'onboarding';

export function entryRoute(s: { hasProfile: boolean; welcomeSeen: boolean; linked: boolean; authSkipped: boolean }): EntryRoute {
  if (s.hasProfile) return 'app';
  if (!s.welcomeSeen) return 'welcome';
  if (!s.linked && !s.authSkipped) return 'auth';
  return 'onboarding';
}

/** Экраны, которые доступны без профиля (остальное — после анкеты) */
export const PRE_PROFILE_ROUTES: EntryRoute[] = ['welcome', 'auth', 'onboarding'];

/** Имя для анкеты — только то, что пользователь сам дал Apple; ничего не выдумываем */
export function nameFromApple(givenName?: string | null, familyName?: string | null): string {
  return [givenName, familyName].map((x) => (x ?? '').trim()).filter(Boolean)[0] ?? '';
}
