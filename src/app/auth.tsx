import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { colors, currentTheme, space } from '@/theme';
import { Screen } from '@/components/Screen';
import { Button, T } from '@/components/ui';
import { Ambient, FadeIn } from '@/components/motion';
import { AppleButton } from '@/features/account/AppleButton';
import { useAppleLink } from '@/features/account/useAppleLink';
import { useAccount } from '@/stores/account';

/**
 * Вход перед анкетой — только Apple ID (решение владельца продукта; ТЗ 2.1). Уже существующие профили сюда не попадают.
 * Без входа можно только в dev-сборке там, где Apple ID недоступен (веб, Android, симулятор без Apple ID) — для разработки
 * и автотестов; в сборке для iPhone этой кнопки нет.
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
      <Ambient tone="calm" height={460} />
      <FadeIn from={12} style={{ flex: 1 }}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <T v="display" accessibilityRole="header" style={{ textAlign: 'center' }}>
            Вход
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
          {__DEV__ && available === false ? <Button title="Без входа (только разработка)" variant="secondary" size="lg" onPress={skip} /> : null}
        </View>
      </FadeIn>
    </Screen>
  );
}
