import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { colors, space, themed } from '@/theme';
import { IconButton, T, type IconName } from '../ui';

export type HeaderAction = { icon: IconName; label: string; onPress: () => void; testID?: string };

/**
 * Шапка вкладки или экрана (дизайн-система §9 AppHeader).
 * Вкладка: крупный заголовок title1 слева, до двух круглых кнопок 44×44 справа.
 * Экран стека (back): «‹» и заголовок title2 в одну строку; длинный заголовок ужимается, а не выталкивает кнопки.
 */
export function AppHeader({
  title,
  subtitle,
  back,
  onBack,
  actions = [],
  style,
}: {
  title: string;
  subtitle?: string;
  /** Экран стека: показать «Назад» и заголовок title2 */
  back?: boolean;
  onBack?: () => void;
  /** Не больше двух действий — остальное уходит в меню экрана */
  actions?: HeaderAction[];
  style?: StyleProp<ViewStyle>;
}) {
  const shown = actions.slice(0, 2);
  return (
    <View style={[styles.row, style]}>
      {back ? (
        <IconButton
          name="chevron-back"
          label="Назад"
          bg="transparent"
          onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
          style={{ marginLeft: -10 }}
        />
      ) : null}
      <View style={styles.titles}>
        <T v={back ? 'title2' : 'title1'} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {title}
        </T>
        {subtitle ? (
          <T v="footnote" numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {shown.map((a) => (
        <IconButton key={a.label} name={a.icon} label={a.label} testID={a.testID} onPress={a.onPress} bg={colors.surface2} size={22} style={styles.action} />
      ))}
    </View>
  );
}

const styles = themed({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 52, marginBottom: space.xs },
  titles: { flex: 1, minWidth: 0 },
  action: { flexShrink: 0 },
});
