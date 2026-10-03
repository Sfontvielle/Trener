import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type PanResponderGestureState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, themed } from '@/theme';
import { IconButton, T } from './ui';
import { KeyboardScrollProvider, useKeyboardAwareScroll } from './keyboard';

/**
 * Нижний лист (bottom sheet) в стиле iOS: затемнение, выезд снизу, закрытие по тапу на фон, крестику
 * или свайпом вниз.
 *
 * Жест:
 *  • лист следует за пальцем 1:1, вверх — лёгкое «резиновое» сопротивление;
 *  • закрывается, если протянут на ~30% высоты (не больше 160 pt) или брошен вниз с заметной скоростью;
 *  • иначе плавно возвращается без перелёта выше исходного положения;
 *  • шапка тянет всегда, содержимое — только когда его прокрутка у самого верха (нет конфликта со скроллом).
 * Обработчики жеста создаются один раз: экран под листом может перерисовываться каждую секунду
 * (таймер тренировки), и смена обработчиков посреди жеста раньше «сбрасывала» лист вверх.
 */
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
  const [anim] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.Value(0));
  const [boxH, setBoxH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const canScroll = contentH > boxH + 1;
  const { scrollRef, rootRef, pad, ensure, onScroll: onKbScroll } = useKeyboardAwareScroll();
  const [sheetH, setSheetH] = useState(height * 0.5);

  // Актуальные значения для обработчиков жеста, которые создаются один раз
  const live = useRef({ onClose, sheetH: height * 0.5, atTop: true, closing: false });
  useEffect(() => {
    live.current.onClose = onClose;
  }, [onClose]);

  // Ref читается только внутри обработчиков жеста, не во время рендера
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    const move = (_e: unknown, g: PanResponderGestureState) => {
      if (live.current.closing) return;
      drag.setValue(g.dy >= 0 ? g.dy : -Math.min(28, Math.sqrt(-g.dy) * 3));
    };
    const release = (_e: unknown, g: PanResponderGestureState) => {
      if (live.current.closing) return;
      const h = Math.max(200, live.current.sheetH);
      const far = g.dy > Math.min(160, h * 0.3);
      const flick = g.vy > 0.55 && g.dy > 24;
      if (far || flick) {
        live.current.closing = true;
        const rest = Math.max(0, h + 40 - g.dy);
        const duration = Math.max(120, Math.min(260, rest / Math.max(1.4, g.vy * 1.6)));
        Animated.timing(drag, { toValue: h + 40, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => live.current.onClose());
      } else {
        Animated.spring(drag, { toValue: 0, velocity: g.vy, damping: 26, stiffness: 300, mass: 0.9, overshootClamping: true, useNativeDriver: true }).start();
      }
    };
    const common = {
      onPanResponderMove: move,
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
    };
    return {
      // Шапка и «ручка» — всегда тянут лист (небольшой порог, чтобы тап по крестику оставался тапом)
      handle: PanResponder.create({ onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 3 && Math.abs(g.dy) > Math.abs(g.dx), ...common }),
      // Содержимое — только вниз, только когда прокрутка у верха; перехватываем раньше ScrollView
      body: PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_e, g) => live.current.atTop && g.dy > 6 && g.dy > Math.abs(g.dx) * 1.3,
        ...common,
      }),
    };
  });

  // Монтируем сразу при открытии (во время рендера, без лишнего прохода эффекта)
  if (visible && !mounted) setMounted(true);

  useEffect(() => {
    if (visible) {
      live.current.closing = false;
      live.current.atTop = true;
      drag.setValue(0);
      Animated.spring(anim, { toValue: 1, damping: 26, stiffness: 240, mass: 0.9, overshootClamping: true, useNativeDriver: true }).start();
    } else if (mounted) {
      live.current.closing = true;
      Animated.timing(anim, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible, anim, drag, mounted]);

  if (!mounted) return null;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });
  // Фон светлеет по мере того, как лист уводят вниз
  const dim = Animated.multiply(anim, drag.interpolate({ inputRange: [0, Math.max(200, sheetH)], outputRange: [1, 0.15], extrapolate: 'clamp' }));
  const maxH = Math.max(240, (height - pad) * maxHeightPct - (pad ? insets.top : 0));

  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      bounces={false}
      overScrollMode="never"
      scrollEnabled={canScroll || pad > 0}
      onLayout={(e) => setBoxH(e.nativeEvent.layout.height)}
      onContentSizeChange={(_w, h) => setContentH(h)}
      onScroll={(e) => {
        live.current.atTop = e.nativeEvent.contentOffset.y <= 2;
        onKbScroll(e);
      }}
      contentContainerStyle={{ paddingBottom: footer || pad ? space.md : insets.bottom + space.lg }}
      showsVerticalScrollIndicator={false}
    >
      <KeyboardScrollProvider ensure={ensure}>{children}</KeyboardScrollProvider>
    </ScrollView>
  ) : (
    <View style={{ paddingBottom: footer || pad ? space.sm : insets.bottom + space.lg, flexShrink: 1 }}>{children}</View>
  );

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View ref={rootRef} style={{ flex: 1, paddingBottom: pad }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: dim }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Закрыть" />
        </Animated.View>
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        <Animated.View
          {...pan.body.panHandlers}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            live.current.sheetH = h;
            setSheetH(h);
          }}
          style={[styles.sheet, { maxHeight: maxH, transform: [{ translateY }, { translateY: drag }] }]}
        >
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
          {footer ? <View style={{ paddingTop: space.sm, paddingBottom: pad ? space.md : insets.bottom + space.md }}>{footer}</View> : null}
        </Animated.View>
      </View>
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
  grabZone: { paddingTop: 8, paddingBottom: 12, marginHorizontal: -space.lg, alignItems: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: space.md },
});
