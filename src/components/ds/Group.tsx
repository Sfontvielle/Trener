import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, space, themed } from '@/theme';
import { elevation, Icon, T, type IconName } from '../ui';

/**
 * Сгруппированный список (как в «Настройках» iOS): одна поверхность radius 16, строки разделены
 * волосяной линией с отступом слева. Заменяет ряды одинаковых отдельных карточек.
 */
export function Group({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View testID={testID} style={[styles.group, elevation(), style]}>
      {rows.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <View style={styles.sep} /> : null}
          {c}
        </React.Fragment>
      ))}
    </View>
  );
}

/** Строка списка: значок, название и пояснение слева, значение справа, «›» если ведёт дальше. Минимум 48 pt */
export function ListRow({
  title,
  subtitle,
  value,
  icon,
  iconColor,
  onPress,
  chevron = !!onPress,
  testID,
  accessibilityLabel,
  right,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  icon?: IconName;
  /** Цвет значка — только для данных (приём пищи, нутриент), иначе вторичный текст */
  iconColor?: string;
  onPress?: () => void;
  chevron?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  right?: React.ReactNode;
}) {
  const body = (
    <>
      {icon ? <Icon name={icon} size={22} color={iconColor ?? colors.textDim} /> : null}
      <View style={styles.texts}>
        <T v="body" numberOfLines={2}>
          {title}
        </T>
        {subtitle ? (
          <T v="footnote" numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {value ? (
        // При крупном шрифте значение переносится, а не выталкивает «›» за край
        <T v="body" color={colors.textDim} style={{ fontVariant: ['tabular-nums'], flexShrink: 1, maxWidth: '62%', textAlign: 'right' }}>
          {value}
        </T>
      ) : null}
      {right}
      {chevron ? <Icon name="chevron-forward" size={16} color={colors.muted} /> : null}
    </>
  );
  const label = accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ');
  if (onPress) {
    return (
      <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surface2 }]}>
        {body}
      </Pressable>
    );
  }
  return (
    <View testID={testID} accessible accessibilityLabel={label} style={styles.row}>
      {body}
    </View>
  );
}

const styles = themed({
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden' },
  sep: { height: 0.5, marginLeft: space.md, backgroundColor: colors.borderStrong },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 48, paddingVertical: space.sm, paddingHorizontal: space.md },
  texts: { flex: 1, minWidth: 0, gap: 2 },
});
