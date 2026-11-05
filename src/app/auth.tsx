import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { colors, currentTheme, space } from '@/theme';
import { Screen } from '@/components/Screen';
import { Button, T } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { AppleButton } from '@/features/account/AppleButton';
import { useAppleLink } from '@/features/account/useAppleLink';
import { useAccount } from '@/stores/account';

/**
 * Вход перед анкетой: «Вход с Apple» или «Продолжить без входа» (решение владельца, раунд 1 — вход можно пропустить).
 * Без входа данные так же хранятся на iPhone; Apple ID можно привязать позже в профиле.
 */
export default function Auth() {
  const { available, busy, link } = useAppleLink();
  const signIn = async () => {
    if (await link()) router.replace('/onboarding');
  };

  const skip = () => {
    useAccount.getState().skipAuth();
    router.replace('/onboarding');
  };

  return (
    <Screen scroll={false}>
      <FadeIn from={12} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <T v="display" accessibilityRole="header" style={{ textAlign: 'center' }}>
            Вход
          </T>
          <T v="callout" color={colors.textDim} style={{ textAlign: 'center', marginTop: space.xs }}>
            Данные хранятся на этом iPhone. Войти можно и позже — в профиле.
          </T>
        </View>
        <View style={{ gap: space.md }}>
          {available === null ? (
            <ActivityIndicator color={colors.accent} style={{ height: 56 }} />
          ) : available ? (
            <View accessibilityState={{ busy }} style={busy ? { opacity: 0.5 } : null} pointerEvents={busy ? 'none' : 'auto'}>
              <AppleButton dark={currentTheme().scheme === 'dark'} onPress={signIn} />
            </View>
          ) : null}
          <Button title="Продолжить без входа" variant="ghost" size="lg" onPress={skip} testID="auth-skip" />
        </View>
      </FadeIn>
    </Screen>
  );
}
