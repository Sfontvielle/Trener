import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, themed } from '@/theme';
import { IconButton, T } from './ui';

/**
 * Нижний лист (bottom sheet) в стиле iOS: затемнение, выезд снизу, закрытие по тапу на фон, крестику
 * или свайпом вниз (когда содержимое прокручено к началу).
 * Работает одинаково на iPhone и в web-превью.
 */
/** Прокручено ли содержимое листа к началу (ключ — анимация перетаскивания листа) */
const SCROLL_TOP = new WeakMap<object, boolean>();

export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  scroll = true,
  maxHeightPct = 0.88,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  scroll?: boolean;
  maxHeightPct?: number;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const anim = useState(() => new Animated.Value(0))[0];
  const drag = useState(() => new Animated.Value(0))[0];
  const [boxH, setBoxH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const canScroll = contentH > boxH + 1;

  // Закрытие свайпом: лист уезжает вниз с той же скоростью, что и палец, потом onClose
  const pan = useMemo(() => {
    const release = (_e: unknown, g: { dy: number; vy: number }) => {
      if (g.dy > 90 || g.vy > 0.7) {
        Animated.timing(drag, { toValue: height, duration: Math.max(140, Math.min(260, ((height - g.dy) / Math.max(1.2, g.vy)) * 0.6)), easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => onClose());
      } else Animated.spring(drag, { toValue: 0, damping: 22, stiffness: 260, mass: 0.8, useNativeDriver: true }).start();
    };
    const common = {
      onPanResponderMove: (_e: unknown, g: { dy: number }) => drag.setValue(g.dy > 0 ? g.dy : g.dy / 6),
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
      onPanResponderTerminationRequest: () => false,
    };
    return {
      // Шапка и «ручка» — всегда тянут лист
      handle: PanResponder.create({ onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 2, ...common }),
      // Содержимое — только вниз и только когда прокрутка у верха
      body: PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_e, g) => (SCROLL_TOP.get(drag) ?? true) && g.dy > 8 && g.dy > Math.abs(g.dx) * 1.4,
        ...common,
      }),
    };
  }, [drag, onClose, height]);

  // Монтируем сразу при открытии (во время рендера, без лишнего прохода эффекта)
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      drag.setValue(0);
      SCROLL_TOP.set(drag, true);
      Animated.spring(anim, { toValue: 1, damping: 26, stiffness: 240, mass: 0.9, useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(anim, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible, anim, drag, mounted]);

  if (!mounted) return null;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });
  // Фон светлеет по мере того, как лист уводят вниз
  const dim = Animated.multiply(anim, drag.interpolate({ inputRange: [0, height * 0.6], outputRange: [1, 0], extrapolate: 'clamp' }));

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      bounces={false}
      overScrollMode="never"
      scrollEnabled={canScroll}
      onLayout={(e) => setBoxH(e.nativeEvent.layout.height)}
      onContentSizeChange={(_w, h) => setContentH(h)}
      onScroll={(e) => {
        SCROLL_TOP.set(drag, e.nativeEvent.contentOffset.y <= 2);
      }}
      contentContainerStyle={{ paddingBottom: footer ? space.md : insets.bottom + space.lg }} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={{ paddingBottom: footer ? 0 : insets.bottom + space.lg, flexShrink: 1 }}>{children}</View>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: dim }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Закрыть" />
        </Animated.View>
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        <Animated.View {...pan.body.panHandlers} style={[styles.sheet, { maxHeight: height * maxHeightPct, transform: [{ translateY }, { translateY: drag }] }]}>
          <View {...pan.handle.panHandlers} style={styles.grabZone}>
            <View style={styles.grabber} />
          </View>
          {title ? (
            <View {...pan.handle.panHandlers} style={styles.header}>
              <View style={{ flex: 1 }}>
                <T v="h2" numberOfLines={2}>
                  {title}
                </T>
                {subtitle ? (
                  <T v="small" style={{ marginTop: 2 }}>
                    {subtitle}
                  </T>
                ) : null}
              </View>
              <IconButton name="close" label="Закрыть" onPress={onClose} size={20} style={{ width: 36, height: 36 }} />
            </View>
          ) : null}
          {body}
          {footer ? <View style={{ paddingTop: space.sm, paddingBottom: insets.bottom + space.md }}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themed({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  grabZone: { paddingTop: 8, paddingBottom: 10, marginHorizontal: -space.lg, alignItems: 'center' },
  grabber: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: space.md },
});
