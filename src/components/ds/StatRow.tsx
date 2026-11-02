import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, space, themed } from '@/theme';
import { fmtDelta, fmtValue } from '@/utils/format';
import { Icon, T, type IconName } from '../ui';
import { statLabel } from './logic';

/**
 * Число с подписью в строке (дизайн-система §9 StatRow): подпись слева, справа число metric и единица,
 * необязательная дельта. Тон дельты задаёт экран: рост веса — не всегда «хорошо».
 * При крупном шрифте число уходит под подпись, а не обрезается.
 */
export function StatRow({
  label,
  value,
  unit,
  digits = 0,
  delta,
  deltaTone = 'neutral',
  icon,
  dot,
  onPress,
  testID,
  style,
}: {
  label: string;
  /** Число или готовая строка («—», «5:30») */
  value: number | string;
  unit?: string;
  digits?: number;
  delta?: number;
  deltaTone?: 'good' | 'bad' | 'neutral';
  icon?: IconName;
  /** Цветная метка данных (белки, жиры…): цвет — только у данных */
  dot?: string;
  onPress?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const shown = typeof value === 'number' ? fmtValue(value, digits) : value;
  const d = delta === undefined || !Number.isFinite(delta) ? null : fmtDelta(delta, digits);
  const dc = deltaTone === 'good' ? colors.accent : deltaTone === 'bad' ? colors.warning : colors.textDim;
  const body = (
    <>
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : icon ? <Icon name={icon} size={22} color={colors.textDim} /> : null}
      <T v="body" style={styles.label}>
        {label}
      </T>
      <View style={styles.right}>
        <T v="metric" numberOfLines={1}>
          {shown}
        </T>
        {unit ? <T v="footnote">{unit}</T> : null}
        {d ? (
          <T v="footnote" color={dc} style={{ fontVariant: ['tabular-nums'] }}>
            {d}
          </T>
        ) : null}
      </View>
      {onPress ? <Icon name="chevron-forward" size={16} color={colors.muted} /> : null}
    </>
  );
  const a11y = statLabel(label, shown, unit, d ? `изменение ${d}` : undefined);
  if (onPress) {
    return (
      <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }, style]}>
        {body}
      </Pressable>
    );
  }
  return (
    <View testID={testID} accessible accessibilityLabel={a11y} style={[styles.row, style]}>
      {body}
    </View>
  );
}

const styles = themed({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm, minHeight: 48, paddingVertical: space.sm, paddingHorizontal: space.md },
  label: { flexGrow: 1, flexShrink: 1, flexBasis: 120 },
  right: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexShrink: 0, marginLeft: 'auto' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
