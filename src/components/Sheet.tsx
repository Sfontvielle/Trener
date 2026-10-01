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
  // Где прокрутка содержимого: свайп вниз закрывает лист, только если контент у верха
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_e, g) => (SCROLL_TOP.get(drag) ?? true) && g.dy > 10 && g.dy > Math.abs(g.dx) * 1.6,
        onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_e, g) => {
          if (g.dy > 110 || g.vy > 0.9) {
            onClose();
            Animated.timing(drag, { toValue: 0, duration: 0, delay: 260, useNativeDriver: true }).start();
          } else Animated.spring(drag, { toValue: 0, friction: 8, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, friction: 8, useNativeDriver: true }).start(),
      }),
    [drag, onClose],
  );

  // Монтируем сразу при открытии (во время рендера, без лишнего прохода эффекта)
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      Animated.timing(anim, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(anim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible, anim, mounted]);

  if (!mounted) return null;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [height * 0.6, 0] });

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={32}
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
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: anim }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Закрыть" />
        </Animated.View>
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        <Animated.View {...pan.panHandlers} style={[styles.sheet, { maxHeight: height * maxHeightPct, transform: [{ translateY }, { translateY: drag }] }]}>
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.header}>
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
  grabber: { alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, marginTop: 8, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: space.md },
});
