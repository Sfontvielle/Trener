import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router } from 'expo-router';
import { colors, currentTheme, radius, space, themed } from '@/theme';
import { Screen } from '@/components/Screen';
import { Button, Icon, T, type IconName } from '@/components/ui';
import { Ambient, FadeIn } from '@/components/motion';
import { BrandMark } from '@/components/BrandMark';
import { AppleButton } from '@/features/account/AppleButton';
import { useAppleLink } from '@/features/account/useAppleLink';
import { useAccount } from '@/stores/account';

/**
 * Вход перед анкетой: Apple ID привязывает локальный профиль к аккаунту. Без сервера и без облака —
 * честно говорим, что данные пока только на этом iPhone. Можно продолжить без входа и привязать позже в Профиле.
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
    <Screen>
      <Ambient tone="calm" height={460} />
      <FadeIn from={12} style={{ gap: space.xl }}>
        <View style={{ alignItems: 'center', marginTop: -space.lg, marginBottom: -space.xl }}>
          <BrandMark size={84} />
        </View>
        <View style={{ gap: space.sm }}>
          <T v="h1" accessibilityRole="header">
            Вход
          </T>
          <T v="bodyDim">Войди через Apple ID — профиль будет привязан к твоему аккаунту. Затем короткая анкета: по ней соберём программу и питание.</T>
        </View>
        <View style={styles.facts}>
          <Fact icon="lock-closed-outline" text="Apple не передаёт нам пароль. Почту можно скрыть — решаешь ты." />
          <Fact icon="phone-portrait-outline" text="Данные пока хранятся только на этом iPhone." />
          <Fact icon="cloud-offline-outline" text="Резервная копия в iCloud появится отдельным обновлением — сейчас синхронизации нет." />
        </View>
        <View style={{ gap: space.md }}>
          {available === null ? (
            <ActivityIndicator color={colors.accent} style={{ height: 56 }} />
          ) : available ? (
            <View accessibilityState={{ busy }} style={busy ? { opacity: 0.5 } : null} pointerEvents={busy ? 'none' : 'auto'}>
              <AppleButton dark={currentTheme().scheme === 'dark'} onPress={signIn} />
            </View>
          ) : (
            <T v="small" style={{ textAlign: 'center' }}>
              Вход через Apple доступен в приложении на iPhone.
            </T>
          )}
          <Button title="Продолжить без входа" variant="secondary" size="lg" onPress={skip} />
        </View>
      </FadeIn>
    </Screen>
  );
}

function Fact({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={18} color={colors.textDim} />
      <T v="small" style={{ flex: 1 }}>
        {text}
      </T>
    </View>
  );
}

const styles = themed({
  facts: { gap: 12, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface },
  fact: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
});
