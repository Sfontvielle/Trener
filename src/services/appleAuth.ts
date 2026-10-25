import { Platform } from 'react-native';
import type { AppleLink } from '@/stores/account';

/**
 * Вход через Apple ID (expo-apple-authentication). Модуль подключается только на iOS — в вебе и тестах его нет.
 * Сервера у RYNJI нет: identityToken не отправляется никуда, сохраняется только идентификатор пользователя
 * для привязки локального профиля.
 */
export type AppleModule = typeof import('expo-apple-authentication');

let mod: AppleModule | null | undefined;
export function appleModule(): AppleModule | null {
  if (mod !== undefined) return mod;
  if (Platform.OS !== 'ios') return (mod = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-apple-authentication') as AppleModule;
  } catch {
    mod = null;
  }
  return mod;
}

export async function appleAvailable(): Promise<boolean> {
  const m = appleModule();
  if (!m) return false;
  try {
    return await m.isAvailableAsync();
  } catch {
    return false;
  }
}

export class AppleCanceled extends Error {}

/** Вход: null — недоступно; AppleCanceled — пользователь закрыл окно */
export async function signInWithApple(): Promise<AppleLink | null> {
  const m = appleModule();
  if (!m) return null;
  try {
    const c = await m.signInAsync({ requestedScopes: [m.AppleAuthenticationScope.FULL_NAME, m.AppleAuthenticationScope.EMAIL] });
    return {
      userId: c.user,
      email: c.email ?? undefined,
      givenName: c.fullName?.givenName ?? undefined,
      familyName: c.fullName?.familyName ?? undefined,
      linkedAt: Date.now(),
    };
  } catch (e: unknown) {
    if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') throw new AppleCanceled('canceled');
    throw e;
  }
}

/** Отозван ли доступ (пользователь удалил приложение из «Входа с Apple» в настройках) */
export async function appleCredentialState(userId: string): Promise<'authorized' | 'revoked' | 'unknown'> {
  const m = appleModule();
  if (!m) return 'unknown';
  try {
    const st = await m.getCredentialStateAsync(userId);
    if (st === m.AppleAuthenticationCredentialState.AUTHORIZED) return 'authorized';
    if (st === m.AppleAuthenticationCredentialState.REVOKED) return 'revoked';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
