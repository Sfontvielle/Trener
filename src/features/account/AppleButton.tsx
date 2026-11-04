import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { appleModule } from '@/services/appleAuth';

/**
 * Системная кнопка «Вход с Apple» (ASAuthorizationAppleIDButton, тип SIGN_IN): цвета и текст — только из вариантов Apple,
 * так требует App Store. Модуль подключается лениво и только на iOS (services/appleAuth).
 */
export function AppleButton({ onPress, dark, style }: { onPress: () => void; dark: boolean; style?: StyleProp<ViewStyle> }) {
  const m = appleModule();
  if (!m) return null;
  return (
    <m.AppleAuthenticationButton
      buttonType={m.AppleAuthenticationButtonType.SIGN_IN}
      buttonStyle={dark ? m.AppleAuthenticationButtonStyle.WHITE : m.AppleAuthenticationButtonStyle.BLACK}
      cornerRadius={16}
      onPress={onPress}
      style={[{ height: 56, alignSelf: 'stretch' }, style]}
    />
  );
}
