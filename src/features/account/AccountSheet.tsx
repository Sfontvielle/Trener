import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors, currentTheme, radius, space, themed } from '@/theme';
import { Sheet } from '@/components/Sheet';
import { Button, Icon, T } from '@/components/ui';
import { confirm, toast } from '@/components/Dialog';
import { useAccount } from '@/stores/account';
import { formatDayShort, toISODate } from '@/utils/date';
import { AppleButton } from './AppleButton';
import { useAppleLink } from './useAppleLink';

/** Строка «Аккаунт» в Профиле: что сейчас привязано */
export function accountSummary(apple: { email?: string } | null): string {
  return apple ? `Apple ID${apple.email ? ` · ${apple.email}` : ''}` : 'Без входа · данные на этом iPhone';
}

/**
 * Профиль → Аккаунт: привязать или отвязать Apple ID. Привязка не переносит и не удаляет данные —
 * они остаются на устройстве. Синхронизации пока нет, и мы так и пишем.
 */
export function AccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const apple = useAccount((s) => s.apple);
  const { available, busy, link } = useAppleLink();

  return (
    <Sheet visible={visible} onClose={onClose} title="Аккаунт">
      <View style={{ gap: space.md }} testID="account-sheet">
        {apple ? (
          <View style={styles.card}>
            <View style={styles.icon}>
              <Icon name="logo-apple" size={22} color={colors.text} />
            </View>
            <View style={{ flex: 1 }}>
              <T v="h3">Вход через Apple ID</T>
              <T v="small">
                {apple.email ?? 'Почта скрыта'} · с {formatDayShort(toISODate(new Date(apple.linkedAt)))}
              </T>
            </View>
          </View>
        ) : (
          <T v="bodyDim">Войди через Apple ID — текущий профиль и вся история будут привязаны к твоему аккаунту. Ничего не удаляется и не переносится.</T>
        )}
        <T v="small">Данные хранятся только на этом iPhone. Резервная копия в iCloud появится отдельным обновлением — сейчас синхронизации нет. Перенести данные вручную можно в «Данные и конфиденциальность».</T>
        {apple ? (
          <Button
            title="Отвязать Apple ID"
            variant="secondary"
            onPress={() =>
              confirm('Отвязать Apple ID?', 'Данные останутся на этом iPhone. Привязать снова можно в любой момент.', 'Отвязать', () => {
                useAccount.getState().unlinkApple();
                toast('Apple ID отвязан', 'checkmark');
              })
            }
          />
        ) : available === null ? (
          <ActivityIndicator color={colors.accent} style={{ height: 56 }} />
        ) : available ? (
          <View style={busy ? { opacity: 0.5 } : null} pointerEvents={busy ? 'none' : 'auto'}>
            <AppleButton
              dark={currentTheme().scheme === 'dark'}
              onPress={async () => {
                if (await link()) toast('Профиль привязан к Apple ID', 'checkmark');
              }}
            />
          </View>
        ) : (
          <T v="small" style={{ textAlign: 'center' }}>
            Вход через Apple доступен в приложении на iPhone.
          </T>
        )}
      </View>
    </Sheet>
  );
}

const styles = themed({
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
});
