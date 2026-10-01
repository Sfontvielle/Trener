import React, { memo, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, type, TOUCH, themed } from '@/theme';
import { haptic } from '@/services/haptics';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color = colors.text, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}

type Variant = keyof typeof type;

export function T({ v = 'body', color, style, children, ...rest }: TextProps & { v?: Variant; color?: string }) {
  return (
    <Text {...rest} style={[type[v] as TextStyle, color ? { color } : null, style]} maxFontSizeMultiplier={1.3}>
      {children}
    </Text>
  );
}

export const Card = memo(function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
  tone = 'default',
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  tone?: 'default' | 'accent' | 'warning' | 'danger' | 'flat';
}) {
  const toneStyle =
    tone === 'accent'
      ? { borderColor: colors.accentLine, backgroundColor: colors.surface }
      : tone === 'warning'
        ? { borderColor: colors.warningLine, backgroundColor: colors.surface }
        : tone === 'danger'
          ? { borderColor: colors.dangerLine, backgroundColor: colors.surface }
          : tone === 'flat'
            ? { borderColor: 'transparent', backgroundColor: colors.surface2 }
            : null;
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [styles.card, toneStyle, style, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, toneStyle, style]}>{children}</View>;
});

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  loading,
  style,
  full,
  accessibilityLabel,
}: {
  title: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
  accessibilityLabel?: string;
}) {
  const bg =
    variant === 'primary' ? colors.accent : variant === 'secondary' ? colors.surface3 : variant === 'danger' ? colors.dangerDim : 'transparent';
  const fg = variant === 'primary' ? colors.onAccent : variant === 'danger' ? colors.danger : variant === 'ghost' ? colors.textDim : colors.text;
  const h = size === 'lg' ? 56 : size === 'sm' ? 36 : 48;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      disabled={disabled || loading}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      hitSlop={size === 'sm' ? 6 : 0}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, height: h, paddingHorizontal: size === 'sm' ? 14 : 20 },
        variant === 'outline' && { borderWidth: 1, borderColor: colors.borderStrong },
        full && { alignSelf: 'stretch' },
        (disabled || loading) && { opacity: 0.45 },
        pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 19} color={fg} /> : null}
          <Text numberOfLines={1} style={[styles.btnText, { color: fg, fontSize: size === 'sm' ? 14 : size === 'lg' ? 17 : 16 }]}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  name,
  onPress,
  size = 22,
  color = colors.text,
  bg = colors.surface2,
  label,
  style,
  disabled,
}: {
  name: IconName;
  onPress: () => void;
  size?: number;
  color?: string;
  bg?: string;
  label: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [styles.iconBtn, { backgroundColor: bg }, disabled && { opacity: 0.35 }, pressed && { opacity: 0.7 }, style]}
    >
      <Icon name={name} size={size} color={color} />
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
  icon,
  style,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && { opacity: 0.8 }, style]}
    >
      {icon ? <Icon name={icon} size={15} color={active ? colors.onAccent : colors.textDim} /> : null}
      <Text numberOfLines={1} style={[styles.chipText, active && { color: colors.onAccent }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Segmented<K extends string>({ items, value, onChange, style }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.seg, style]} accessibilityRole="tablist">
      {items.map((it) => {
        const active = it.key === value;
        return (
          <Pressable
            key={it.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) haptic.tap();
              onChange(it.key);
            }}
            style={[styles.segItem, active && styles.segItemActive]}
          >
            <Text numberOfLines={1} style={[styles.segText, active && { color: colors.text }]}>
              {it.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.section, style]}>
      <T v="caption">{title}</T>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <T v="small" color={colors.accent} style={{ fontWeight: '700' }}>
            {action}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ icon, title, text, action, onAction, style }: { icon: IconName; title: string; text?: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.empty, style]}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={26} color={colors.accent} />
      </View>
      <T v="h3" style={{ textAlign: 'center' }}>
        {title}
      </T>
      {text ? (
        <T v="small" style={{ textAlign: 'center', maxWidth: 300 }}>
          {text}
        </T>
      ) : null}
      {action ? <Button title={action} onPress={onAction} size="sm" style={{ marginTop: 6 }} /> : null}
    </View>
  );
}

export function Banner({ icon = 'information-circle', text, tone = 'info', action, onAction }: { icon?: IconName; text: string; tone?: 'info' | 'warning' | 'danger' | 'accent'; action?: string; onAction?: () => void }) {
  const c = tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : tone === 'accent' ? colors.accent : colors.textDim;
  const bg = tone === 'warning' ? colors.warningDim : tone === 'danger' ? colors.dangerDim : tone === 'accent' ? colors.accentDim : colors.surface2;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Icon name={icon} size={18} color={c} />
      <T v="small" color={tone === 'info' ? colors.textDim : colors.text} style={{ flex: 1 }}>
        {text}
      </T>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <T v="small" color={c} style={{ fontWeight: '800' }}>
            {action}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }, style]} />;
}

/** Скелетон для состояний загрузки */
export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const a = useState(() => new Animated.Value(0.4))[0];
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(a, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(a, { toValue: 0.4, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={[{ height, width, borderRadius: 8, backgroundColor: colors.surface3, opacity: a }, style]} />;
}

export function Stat({ label, value, unit, sub, color, style }: { label: string; value: string; unit?: string; sub?: string; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 2 }, style]}>
      <T v="caption" numberOfLines={1}>
        {label}
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <T v="num" style={{ fontSize: 20, color: color ?? colors.text }} numberOfLines={1}>
          {value}
        </T>
        {unit ? <T v="small">{unit}</T> : null}
      </View>
      {sub ? (
        <T v="small" numberOfLines={1} style={{ fontSize: 12 }}>
          {sub}
        </T>
      ) : null}
    </View>
  );
}

const styles = themed({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  btn: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnText: { fontWeight: '800', letterSpacing: -0.2 },
  iconBtn: {
    width: TOUCH,
    height: TOUCH,
    borderRadius: TOUCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textDim, fontWeight: '700', fontSize: 14 },
  seg: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segItem: { flex: 1, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segItemActive: { backgroundColor: colors.surface3 },
  segText: { color: colors.muted, fontWeight: '700', fontSize: 14 },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.xl, marginBottom: space.sm },
  empty: { alignItems: 'center', gap: 8, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md },
});
