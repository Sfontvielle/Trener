import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, Skeleton, T, elevation } from '../ui';

/** Ошибка загрузки: что случилось, как исправить и «Повторить» (дизайн-система §8) */
export function ErrorState({
  title = 'Не удалось загрузить',
  text,
  onRetry,
  retryLabel = 'Повторить',
  style,
  testID,
}: {
  title?: string;
  /** Причина и что сделать: «Нет сети — проверь подключение» */
  text?: string;
  onRetry?: () => void;
  retryLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View testID={testID} accessibilityRole="alert" style={[styles.box, style]}>
      <View style={styles.icon}>
        <Icon name="alert-circle-outline" size={28} color={colors.warning} />
      </View>
      <T v="headline" style={{ textAlign: 'center' }}>
        {title}
      </T>
      {text ? (
        <T v="callout" style={{ textAlign: 'center', maxWidth: 320 }}>
          {text}
        </T>
      ) : null}
      {onRetry ? <Button title={retryLabel} icon="refresh" variant="secondary" onPress={onRetry} style={{ marginTop: space.xs, minWidth: 180 }} /> : null}
    </View>
  );
}

/** Ожидание: плашки по форме будущих строк сгруппированного списка (спиннер — только внутри кнопки) */
export function LoadingSkeleton({ rows = 3, style }: { rows?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessibilityLabel="Загрузка" accessibilityState={{ busy: true }} style={[styles.group, elevation(), style]}>
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row}>
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton height={14} width={i % 2 ? '52%' : '68%'} />
            <Skeleton height={12} width="36%" />
          </View>
          <Skeleton height={14} width={44} />
        </View>
      ))}
    </View>
  );
}

const styles = themed({
  box: { alignItems: 'center', gap: space.xs, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  icon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.warningDim, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 56, paddingVertical: space.sm, paddingHorizontal: space.md },
});
