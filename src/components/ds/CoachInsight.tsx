import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, themed } from '@/theme';
import { Icon, T, elevation } from '../ui';

/**
 * Один совет тренера (дизайн-система §9 CoachInsight): источник, 1–2 предложения, «Почему так?» и одно действие.
 * Цвет — только у срочного (danger) и предупреждения (warning); обычный совет нейтральный.
 */
export function CoachInsight({
  source,
  title,
  text,
  tone = 'info',
  more = 0,
  onOpen,
  onWhy,
  action,
  testID,
  style,
}: {
  source: string;
  title: string;
  text?: string;
  tone?: 'info' | 'warning' | 'urgent';
  /** Сколько ещё сигналов в общем списке */
  more?: number;
  onOpen?: () => void;
  onWhy?: () => void;
  action?: { label: string; onPress: () => void; testID?: string };
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = tone === 'urgent' ? colors.danger : tone === 'warning' ? colors.warning : colors.textDim;
  return (
    <View style={[styles.card, elevation(), tone === 'urgent' && { borderWidth: 1, borderColor: colors.dangerLine }, style]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Совет ${source}: ${title}${text ? `. ${text}` : ''}${more ? `. И ещё ${more}` : ''}`} onPress={onOpen} disabled={!onOpen} style={({ pressed }) => [{ gap: space.xs }, pressed && { opacity: 0.7 }]} testID={testID}>
        <View style={styles.src}>
          <Icon name={tone === 'info' ? 'sparkles-outline' : 'alert-circle-outline'} size={16} color={c} />
          <T v="footnote" color={c}>
            {source}
            {more ? ` · ещё ${more}` : ''}
          </T>
        </View>
        <T v="body">
          {title}
          {text ? <T v="body" color={colors.textDim}>{` ${text}`}</T> : null}
        </T>
      </Pressable>
      {onWhy || action ? (
        <View style={styles.actions}>
          {onWhy ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Почему так?" onPress={onWhy} hitSlop={10}>
              <T v="callout">Почему так?</T>
            </Pressable>
          ) : (
            <View />
          )}
          {action ? (
            <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} hitSlop={10} testID={action.testID}>
              <T v="callout" color={colors.accent} style={{ fontWeight: '600' }}>
                {action.label}
              </T>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = themed({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  src: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
});
