import React, { memo, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import { colors, currentTheme, radius, space, type, TOUCH, themed } from '@/theme';
import { haptic } from '@/services/haptics';
import { Tap, prefersReducedMotion } from './motion';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color = colors.text, style }: { name: IconName; size?: number; color?: string; style?: StyleProp<TextStyle> }) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}

type Variant = keyof typeof type;

/**
 * Динамический шрифт iOS: текст растёт вместе с системной настройкой размера. Предел роста зависит от роли:
 * основной текст — до ×1,6 (читаемость важнее), заголовки уже крупные — до ×1,2–1,35, чтобы не ломать вёрстку.
 */
export const MAX_SCALE: Record<Variant, number> = {
  display: 1.3, hero: 1.3, title1: 1.4, h1: 1.4, title2: 1.5, h2: 1.5, headline: 1.6, h3: 1.6, metric: 1.5, num: 1.3,
  body: 2, bodyStrong: 2, bodyDim: 2, callout: 2, small: 2, footnote: 2, caption: 2, mono: 1.6,
} as Record<Variant, number>;

/** Минимальный размер текста в приложении (дизайн-система §3) */
const MIN_FONT = 12;

/**
 * Правила шкалы поверх ручных стилей экранов: не мельче 12 pt и без сверхжирного 800 (максимум — 700).
 * Пока экраны не переведены на новые стили, это убирает подписи 10–11 pt и «кричащие» начертания везде сразу.
 */
function normalize(st: TextStyle): TextStyle {
  let out = st;
  if (typeof st.fontSize === 'number' && st.fontSize < MIN_FONT) {
    out = { ...out, fontSize: MIN_FONT, ...(typeof st.lineHeight === 'number' && st.lineHeight < MIN_FONT + 4 ? { lineHeight: MIN_FONT + 4 } : null) };
  }
  if (st.fontWeight === '800') out = { ...out, fontWeight: '700' };
  return out;
}

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
  // Свой предел роста (например, подписи таб-бара) важнее предела по роли текста
  const max = rest.maxFontSizeMultiplier ?? MAX_SCALE[v] ?? 1.4;
  const flat = normalize(StyleSheet.flatten([type[v] as TextStyle, color ? { color } : null, style]) ?? {});
  return (
    <Text {...rest} style={SIM_SCALE > 1 ? simulate(flat, Math.min(SIM_SCALE, max)) : flat} maxFontSizeMultiplier={max}>
      {children}
    </Text>
  );
}

/** Мягкая тень поверхностей в светлой теме (в тёмной уровни различаются только заливкой) */
export const LIGHT_SHADOW = '0px 8px 24px rgba(14,20,27,0.08)';
export const elevation = () => (currentTheme().scheme === 'light' ? { boxShadow: LIGHT_SHADOW } : null);

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
  // Без рамок: карточка отделяется заливкой (в светлой теме — ещё и мягкой тенью). Цветная рамка — только у опасного
  const toneStyle = tone === 'danger' ? { borderWidth: 1, borderColor: colors.dangerLine } : tone === 'flat' ? { backgroundColor: colors.surface2 } : elevation();
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
  testID?: string;
}) {
  // Одна главная кнопка — акцентная; остальные — спокойная заливка без рамок («outline» выглядит как «secondary»).
  // Без свечений и бликов: главное действие выделено цветом и размером (дизайн-система §6, §9)
  const bg = variant === 'primary' ? colors.accent : variant === 'secondary' || variant === 'outline' ? colors.surface3 : variant === 'danger' ? colors.dangerDim : 'transparent';
  const fg = variant === 'primary' ? colors.onAccent : variant === 'danger' ? colors.danger : variant === 'ghost' ? colors.textDim : colors.text;
  // Высоты: главное действие 52, обычная 48, мини 38 (область нажатия добирается hitSlop до 50)
  const h = size === 'lg' ? 52 : size === 'sm' ? 38 : 48;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      hitSlop={size === 'sm' ? 6 : 0}
      scaleTo={0.97}
      style={[
        styles.btn,
        // minHeight: длинный текст (например «Далее: Тяга горизонтального блока…») переносится, а не обрезается
        { backgroundColor: bg, minHeight: h, paddingHorizontal: size === 'sm' ? 12 : 20 },
        full && { alignSelf: 'stretch' },
        (disabled || loading) && { opacity: 0.4 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === 'sm' ? 16 : 20} color={fg} /> : null}
          <T v="bodyStrong" color={fg} numberOfLines={2} style={{ fontSize: size === 'lg' ? 17 : size === 'sm' ? 15 : 16, lineHeight: size === 'sm' ? 20 : 22, textAlign: 'center', flexShrink: 1 }}>
            {title}
          </T>
        </>
      )}
    </Tap>
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
  testID,
}: {
  name: IconName;
  onPress: () => void;
  size?: number;
  color?: string;
  bg?: string;
  label: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
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
  // Чип — скруглённый прямоугольник 8 pt; выбранный — контрастный (как выбор в iOS), акцент остаётся для действия
  return (
    <Tap
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      hitSlop={4}
      scaleTo={0.96}
      style={[styles.chip, active && styles.chipActive, style]}
    >
      {icon ? <Icon name={icon} size={16} color={active ? colors.bg : colors.textDim} /> : null}
      <T v="callout" numberOfLines={2} color={active ? colors.bg : colors.text} style={{ fontWeight: '500', flexShrink: 1 }}>
        {label}
      </T>
    </Tap>
  );
}

/**
 * Переключатель разделов (дизайн-система §9 SegmentedControl).
 * До ~40 знаков — капсула на подложке: ширина сегмента по подписи, остаток делится поровну; при крупном шрифте подпись переносится,
 * а не обрезается. Длиннее — ряд отдельных «пилюль» с прокруткой (как фильтры в iOS).
 */
export function Segmented<K extends string>({ items, value, onChange, style, bleed = 0 }: { items: { key: K; label: string; a11y?: string }[]; value: K; onChange: (k: K) => void; style?: StyleProp<ViewStyle>; bleed?: number }) {
  const scroll = items.length > 5 || items.reduce((a, it) => a + it.label.length, 0) > 40;
  const light = currentTheme().scheme === 'light';
  // Подложка выбранного сегмента переезжает к новому за 180 мс; при «Уменьшении движения» — сразу на месте
  const [ind] = useState(() => ({ x: new Animated.Value(0), y: new Animated.Value(0), w: new Animated.Value(0), h: new Animated.Value(0), o: new Animated.Value(0) }));
  // Прокручиваемый ряд держит выбранную «пилюлю» в поле зрения (переход по ссылке, смена вкладки)
  const ref = useRef<ScrollViewInstance>(null);
  const geo = useRef({ view: 0, content: 0, shown: '', placed: '', items: {} as Record<string, { x: number; y: number; w: number; h: number }> });
  const place = () => {
    const g = geo.current;
    const it = g.items[value];
    const sig = it ? `${value}:${it.x}:${it.y}:${it.w}:${it.h}` : '';
    if (!it || g.placed === sig) return;
    const first = !g.placed;
    g.placed = sig;
    // Высота и вертикаль меняются только при переносе подписей — без анимации
    ind.y.setValue(it.y);
    ind.h.setValue(it.h);
    if (first || prefersReducedMotion()) {
      ind.x.setValue(it.x);
      ind.w.setValue(it.w);
      ind.o.setValue(1);
      return;
    }
    const t = { duration: 180, easing: Easing.inOut(Easing.quad), useNativeDriver: false };
    Animated.parallel([Animated.timing(ind.x, { toValue: it.x, ...t }), Animated.timing(ind.w, { toValue: it.w, ...t })]).start();
  };
  const reveal = () => {
    place();
    const g = geo.current;
    const it = g.items[value];
    if (!scroll || !it || !g.view || !g.content || g.shown === value) return;
    g.shown = value;
    const x = Math.max(0, Math.min(it.x + it.w / 2 - g.view / 2, g.content - g.view));
    ref.current?.scrollTo({ x, animated: !prefersReducedMotion() });
  };
  useEffect(reveal);
  const indicator = (
    <Animated.View
      pointerEvents="none"
      style={[styles.segIndicator, { backgroundColor: light ? colors.surface : colors.surface3 }, light && { boxShadow: '0px 1px 4px rgba(14,20,27,0.12)' }, { left: ind.x, top: ind.y, width: ind.w, height: ind.h, opacity: ind.o }]}
    />
  );
  const pills = items.map((it) => {
    const active = it.key === value;
    return (
      <Pressable
        key={it.key}
        onLayout={(e) => {
          const l = e.nativeEvent.layout;
          geo.current.items[it.key] = { x: l.x, y: l.y, w: l.width, h: l.height };
          reveal();
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={it.a11y ?? it.label}
        onPress={() => {
          if (!active) haptic.tap();
          onChange(it.key);
        }}
        style={({ pressed }) => [styles.segItem, scroll ? styles.segPill : styles.segFlex, pressed && !active && { opacity: 0.6 }]}
      >
        <T v="callout" numberOfLines={scroll ? 1 : 2} color={active ? colors.text : colors.textDim} style={{ fontWeight: '600', textAlign: 'center' }}>
          {it.label}
        </T>
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
        contentContainerStyle={[styles.segRow, bleed ? { paddingHorizontal: bleed } : null]}
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

/** Заголовок секции: headline слева, необязательное текстовое действие справа (SectionHeader из дизайн-системы) */
export function SectionTitle({ title, action, onAction, style }: { title: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.section, style]}>
      <T v="headline" accessibilityRole="header" style={{ flexShrink: 1 }}>
        {title}
      </T>
      {action ? (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button" accessibilityLabel={action}>
          <T v="callout" style={{ fontWeight: '600' }}>
            {action}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Пустое состояние: что здесь будет и одно действие */
export function EmptyState({ icon, title, text, action, onAction, style }: { icon: IconName; title: string; text?: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.empty, style]}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={28} color={colors.textDim} />
      </View>
      <T v="headline" style={{ textAlign: 'center' }}>
        {title}
      </T>
      {text ? (
        <T v="callout" style={{ textAlign: 'center', maxWidth: 320 }}>
          {text}
        </T>
      ) : null}
      {action ? <Button title={action} onPress={onAction} variant="secondary" style={{ marginTop: space.xs, minWidth: 180 }} /> : null}
    </View>
  );
}

export function Banner({ icon = 'information-circle', text, tone = 'info', action, onAction }: { icon?: IconName; text: string; tone?: 'info' | 'warning' | 'danger' | 'accent'; action?: string; onAction?: () => void }) {
  const c = tone === 'warning' ? colors.warning : tone === 'danger' ? colors.danger : tone === 'accent' ? colors.accent : colors.textDim;
  const bg = tone === 'warning' ? colors.warningDim : tone === 'danger' ? colors.dangerDim : tone === 'accent' ? colors.accentDim : colors.surface2;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Icon name={icon} size={20} color={c} />
      <T v="callout" color={tone === 'info' ? colors.textDim : colors.text} style={{ flex: 1 }}>
        {text}
      </T>
      {action ? (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button" style={{ flexShrink: 1, maxWidth: '45%' }}>
          <T v="callout" color={tone === 'info' ? colors.text : c} style={{ fontWeight: '600' }} numberOfLines={1} adjustsFontSizeToFit>
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

/** Скелетон для состояний загрузки: плашка по форме будущей строки; при «Уменьшении движения» — без мерцания */
export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | `${number}%`; style?: StyleProp<ViewStyle> }) {
  const a = useState(() => new Animated.Value(1))[0];
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const loop = Animated.loop(Animated.sequence([Animated.timing(a, { toValue: 0.55, duration: 800, useNativeDriver: true }), Animated.timing(a, { toValue: 1, duration: 800, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View accessibilityLabel="Загрузка" style={[{ height, width, borderRadius: radius.xs, backgroundColor: colors.surface2, opacity: a }, style]} />;
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
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
  },
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
    minHeight: 36,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.xs,
    backgroundColor: colors.surface2,
  },
  // Выбранный чип — контрастный (как выбор в iOS), акцент остаётся для главного действия экрана
  chipActive: { backgroundColor: colors.text },
  // Капсула на подложке; выбранный сегмент — светлее (в светлой теме — белый с тенью)
  seg: { flexDirection: 'row', alignItems: 'stretch', padding: 3, borderRadius: radius.pill, backgroundColor: colors.surface2 },
  segRow: { flexDirection: 'row', gap: 6 },
  segItem: { minHeight: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 4 },
  // Ширина по подписи, свободное место — поровну: длинная подпись не рвётся посреди слова
  segFlex: { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' },
  segPill: { minHeight: 36, paddingHorizontal: 16 },
  segIndicator: { position: 'absolute', borderRadius: radius.pill },
  section: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space.sm, marginTop: space.xl, marginBottom: space.xs },
  empty: { alignItems: 'center', gap: space.xs, paddingVertical: space.xxl, paddingHorizontal: space.lg },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  banner: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.md },
});
