import React, { memo, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
  type ScrollViewInstance,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space, type, TOUCH, themed } from '@/theme';
import { haptic } from '@/services/haptics';
import { CtaGlow, Sheen, Tap, prefersReducedMotion } from './motion';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color = colors.text, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}

type Variant = keyof typeof type;

/**
 * Динамический шрифт iOS: текст растёт вместе с системной настройкой размера. Предел роста зависит от роли:
 * основной текст — до ×1,6 (читаемость важнее), заголовки уже крупные — до ×1,2–1,35, чтобы не ломать вёрстку.
 */
export const MAX_SCALE: Record<Variant, number> = { hero: 1.12, display: 1.2, h1: 1.2, h2: 1.35, h3: 1.35, body: 1.6, bodyDim: 1.6, small: 1.6, caption: 1.5, num: 1.3 } as Record<Variant, number>;

// Веб-проверка вёрстки при крупном шрифте: localStorage 'rynji.fontScale' = 1.5 (имитация настройки iPhone)
const SIM_SCALE = (() => {
  try {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return 1;
    const v = parseFloat(localStorage.getItem('rynji.fontScale') ?? '');
    return Number.isFinite(v) && v > 1 ? v : 1;
  } catch {
    return 1;
  }
})();

function simulate(st: TextStyle, k: number): TextStyle {
  return { ...st, ...(st.fontSize ? { fontSize: st.fontSize * k } : null), ...(st.lineHeight ? { lineHeight: st.lineHeight * k } : null) };
}

export function T({ v = 'body', color, style, children, ...rest }: TextProps & { v?: Variant; color?: string }) {
  const max = MAX_SCALE[v] ?? 1.4;
  const st: StyleProp<TextStyle> = [type[v] as TextStyle, color ? { color } : null, style];
  return (
    <Text {...rest} style={SIM_SCALE > 1 ? simulate(StyleSheet.flatten(st) ?? {}, Math.min(SIM_SCALE, max)) : st} maxFontSizeMultiplier={max}>
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
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  tone?: 'default' | 'accent' | 'warning' | 'danger' | 'flat';
}) {
  // Без рамок: карточка отделяется заливкой. Цветная рамка — только у опасного (здоровье), остальное — содержимым
  const toneStyle = tone === 'danger' ? { borderWidth: 1, borderColor: colors.dangerLine } : tone === 'flat' ? { backgroundColor: colors.surface2 } : null;
  if (onPress) {
    return (
      <Tap accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} testID={testID} scaleTo={0.985} style={[styles.card, toneStyle, style]}>
        {children}
      </Tap>
    );
  }
  return (
    <View testID={testID} style={[styles.card, toneStyle, style]}>
      {children}
    </View>
  );
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
  live,
  testID,
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
  /** Главное действие экрана: мягкое свечение под кнопкой и редкий блик */
  live?: boolean;
  testID?: string;
}) {
  // Одна главная кнопка — лаймовая; остальные — спокойная заливка без рамок («outline» выглядит как «secondary»)
  const bg = variant === 'primary' ? colors.accent : variant === 'secondary' || variant === 'outline' ? colors.surface3 : variant === 'danger' ? colors.dangerDim : 'transparent';
  const fg = variant === 'primary' ? colors.onAccent : variant === 'danger' ? colors.danger : variant === 'ghost' ? colors.textDim : colors.text;
  const h = size === 'lg' ? 56 : size === 'sm' ? 38 : 50;
  const glowing = !!live && variant === 'primary' && !disabled && !loading;
  const btn = (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        if (glowing) haptic.light();
        else haptic.tap();
        onPress?.();
      }}
      hitSlop={size === 'sm' ? 6 : 0}
      scaleTo={size === 'lg' ? 0.97 : 0.95}
      style={[
        styles.btn,
        // minHeight: длинный текст (например «Далее: Тяга горизонтального блока…») переносится, а не обрезается
        { backgroundColor: bg, minHeight: h, paddingVertical: 6, paddingHorizontal: size === 'sm' ? 14 : 20 },
        full && { alignSelf: 'stretch' },
        (disabled || loading) && { opacity: 0.45 },
        glowing ? styles.btnLive : style,
      ]}
    >
      {glowing ? <Sheen /> : null}
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 19} color={fg} /> : null}
          <Text numberOfLines={2} style={[styles.btnText, { color: fg, fontSize: size === 'sm' ? 15 : 17, textAlign: 'center', flexShrink: 1 }]}>
            {title}
          </Text>
        </>
      )}
    </Tap>
  );
  if (!glowing) return btn;
  // Свечение живёт под кнопкой: внешние отступы и размеры — у обёртки
  return (
    <View style={[{ alignSelf: 'stretch' }, style]}>
      <CtaGlow />
      {btn}
    </View>
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
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      disabled={disabled}
      hitSlop={6}
      scaleTo={0.9}
      style={[styles.iconBtn, { backgroundColor: bg }, disabled && { opacity: 0.35 }, style]}
    >
      <Icon name={name} size={size} color={color} />
    </Tap>
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
    <Tap
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      scaleTo={0.94}
      style={[styles.chip, active && styles.chipActive, style]}
    >
      {icon ? <Icon name={icon} size={15} color={active ? colors.bg : colors.textDim} /> : null}
      <Text numberOfLines={1} style={[styles.chipText, active && { color: colors.bg }]}>
        {label}
      </Text>
    </Tap>
  );
}

export function Segmented<K extends string>({ items, value, onChange, style, bleed = 0, fit = false }: { items: { key: K; label: string }[]; value: K; onChange: (k: K) => void; style?: StyleProp<ViewStyle>; bleed?: number; fit?: boolean }) {
  // Длинные подписи — «пилюли» по ширине текста с прокруткой (как в iOS), короткие — поровну на всю ширину;
  // fit — все пилюли в одну строку без прокрутки, ширина пропорциональна подписи (три раздела вкладки)
  const scroll = !fit && items.reduce((a, it) => a + it.label.length, 0) > 26;
  // Подложка выбранной «пилюли» плавно переезжает к новой (пружина), а не перескакивает
  const [ind] = useState(() => ({ x: new Animated.Value(0), w: new Animated.Value(0), o: new Animated.Value(0) }));
  // Прокручиваемый ряд держит выбранную «пилюлю» в поле зрения (переход по ссылке, смена вкладки)
  const ref = useRef<ScrollViewInstance>(null);
  const geo = useRef({ view: 0, content: 0, shown: '', placed: '', items: {} as Record<string, { x: number; w: number }> });
  const place = () => {
    const g = geo.current;
    const it = g.items[value];
    if (!it || g.placed === `${value}:${it.x}:${it.w}`) return;
    const first = !g.placed;
    g.placed = `${value}:${it.x}:${it.w}`;
    if (first || prefersReducedMotion()) {
      ind.x.setValue(it.x);
      ind.w.setValue(it.w);
      ind.o.setValue(1);
      return;
    }
    Animated.parallel([
      Animated.spring(ind.x, { toValue: it.x, useNativeDriver: false, speed: 18, bounciness: 5 }),
      Animated.spring(ind.w, { toValue: it.w, useNativeDriver: false, speed: 18, bounciness: 5 }),
    ]).start();
  };
  const reveal = () => {
    place();
    const g = geo.current;
    const it = g.items[value];
    if (!scroll || !it || !g.view || !g.content || g.shown === value) return;
    g.shown = value;
    const x = Math.max(0, Math.min(it.x + it.w / 2 - g.view / 2, g.content - g.view));
    ref.current?.scrollTo({ x, animated: true });
  };
  useEffect(reveal);
  const indicator = <Animated.View pointerEvents="none" style={[styles.segIndicator, { left: ind.x, width: ind.w, opacity: ind.o }]} />;
  const pills = items.map((it) => {
    const active = it.key === value;
    return (
      <Pressable
        key={it.key}
        onLayout={(e) => {
          geo.current.items[it.key] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
          reveal();
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        onPress={() => {
          if (!active) haptic.tap();
          onChange(it.key);
        }}
        style={({ pressed }) => [styles.segItem, scroll ? { paddingHorizontal: 16 } : fit ? { flexGrow: it.label.length + 4, flexBasis: 0, paddingHorizontal: 4 } : { flex: 1 }, pressed && !active && { opacity: 0.6 }]}
      >
        <Text numberOfLines={1} style={[styles.segText, active && { color: colors.text }]}>
          {it.label}
        </Text>
      </Pressable>
    );
  });
  if (scroll) {
    return (
      // bleed — прокрутка до краёв экрана поверх отступа родителя (как ряды «пилюль» в iOS)
      <ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e) => {
          geo.current.view = e.nativeEvent.layout.width;
          reveal();
        }}
        onContentSizeChange={(w) => {
          geo.current.content = w;
          reveal();
        }}
        style={[style, bleed ? { marginHorizontal: -bleed } : null]}
        contentContainerStyle={[styles.seg, bleed ? { paddingHorizontal: bleed } : null]}
        accessibilityRole="tablist"
      >
        {indicator}
        {pills}
      </ScrollView>
    );
  }
  return (
    <View style={[styles.seg, style]} accessibilityRole="tablist">
      {indicator}
      {pills}
    </View>
  );
}

export function SectionTitle({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.section, style]}>
      <T v="caption">{title}</T>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button">
          <T v="small" color={colors.text} style={{ fontWeight: '600' }}>
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
        <Pressable onPress={onAction} hitSlop={10} accessibilityRole="button" style={{ flexShrink: 1, maxWidth: '45%' }}>
          <T v="small" color={tone === 'info' ? colors.text : c} style={{ fontWeight: '700' }} numberOfLines={1} adjustsFontSizeToFit>
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
    padding: space.lg,
  },
  btn: {
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  btnText: { fontWeight: '700', letterSpacing: -0.2 },
  btnLive: { overflow: 'hidden', alignSelf: 'stretch' },
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
    height: 38,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  // Выбранная «пилюля» — светлая (как выбор в iOS), лайм остаётся для главного действия экрана
  chipActive: { backgroundColor: colors.text },
  chipText: { color: colors.textDim, fontWeight: '600', fontSize: 15 },
  // Переключатель — отдельные «пилюли» без общей подложки и рамки; выбранная — светлее
  seg: { flexDirection: 'row', gap: 6 },
  segItem: { height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  segIndicator: { position: 'absolute', top: 0, height: 38, borderRadius: radius.pill, backgroundColor: colors.surface3 },
  segText: { color: colors.textDim, fontWeight: '600', fontSize: 15 },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.xl, marginBottom: space.md },
  empty: { alignItems: 'center', gap: 10, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.md },
});
