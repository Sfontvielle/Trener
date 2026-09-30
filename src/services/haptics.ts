import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useProfile } from '@/stores/profile';

/**
 * Единая точка тактильной обратной связи. На web — no-op.
 * Если нужно заменить реализацию (например, на Core Haptics-паттерны) — меняется только этот файл.
 */
function enabled(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? useProfile.getState().settings.haptics : false;
}

function safe(fn: () => Promise<void>) {
  if (!enabled()) return;
  fn().catch(() => undefined);
}

export const haptic = {
  tap: () => safe(() => Haptics.selectionAsync()),
  light: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  setDone: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  timerStart: () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  timerEnd: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  record: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  success: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
