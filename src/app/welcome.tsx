import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { colors, space, themed } from '@/theme';
import { Screen } from '@/components/Screen';
import { Button, T } from '@/components/ui';
import { Ambient, FadeIn } from '@/components/motion';
import { BrandMark } from '@/components/BrandMark';
import { useAccount } from '@/stores/account';
import { entryRoute } from '@/features/account/route';
import { BRAND } from '@/config/brand';

/**
 * Приветствие — только при первом запуске (до анкеты). Знак RYNJI собирается с двойным импульсом,
 * после него — два предложения и «Начать»: дальше вход через Apple ID или сразу анкета.
 */
export default function Welcome() {
  const [ready, setReady] = useState(false);

  const start = () => {
    const acc = useAccount.getState();
    acc.setWelcomeSeen();
    const next = entryRoute({ hasProfile: false, welcomeSeen: true, linked: !!acc.apple, authSkipped: acc.authSkipped });
    router.replace(next === 'auth' ? '/auth' : '/onboarding');
  };

  return (
    <Screen scroll={false}>
      <Ambient tone="calm" height={560} />
      <View style={styles.center}>
        <BrandMark size={150} animate onDone={() => setReady(true)} />
        <T v="caption" style={styles.brand} color={colors.textDim}>
          {BRAND}
        </T>
      </View>
      <View style={styles.bottom}>
        {ready ? (
          <>
            <FadeIn from={16} style={{ gap: space.md }}>
              <T v="display" accessibilityRole="header">
                Тренировки под твои цели.
              </T>
              <T v="bodyDim" style={{ fontSize: 18, lineHeight: 25 }}>
                Персональная программа, питание и восстановление — в одной системе.
              </T>
            </FadeIn>
            <FadeIn delay={260} from={12}>
              <Button title="Начать" size="lg" live onPress={start} />
            </FadeIn>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = themed({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  brand: { marginTop: -space.xl, letterSpacing: 6 },
  bottom: { gap: space.xl, minHeight: 220, justifyContent: 'flex-end' },
});
