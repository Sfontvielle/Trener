import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GH, GestureRoot, SafeDetector } from './gestures';
import { useModalPresence } from './useModalPresence';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, themed } from '@/theme';
import { IconButton, T } from './ui';
import { KeyboardScrollProvider, useKeyboardAwareScroll } from './keyboard';
import { prefersReducedMotion } from './motion';

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
  const [anim] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.Value(0));
  const [boxH, setBoxH] = useState(0);
  const [contentH, setContentH] = useState(0);
  const canScroll = contentH > boxH + 1;
  const { scrollRef, rootRef, pad, ensure, onScroll: onKbScroll } = useKeyboardAwareScroll();
  const [sheetH, setSheetH] = useState(height * 0.5);

  // Актуальные значения для обработчиков жеста, которые создаются один раз
  const live = useRef({ onClose, sheetH: height * 0.5, atTop: true, closing: false, y: 0, t: 0, vy: 0 });
  useEffect(() => {
    live.current.onClose = onClose;
  }, [onClose]);

  // На телефоне — PanResponder с перехватом (capture) движения вниз: шапка тянет всегда, содержимое — когда его
  // прокрутка у верха, поэтому UIScrollView не забирает касание. В вебе — gesture-handler. В обоих случаях:
  //  • pan активируется только при движении ВНИЗ (≥6 pt) и работает одновременно со скроллом содержимого;
  //  • лист тянется, только если содержимое прокручено к самому верху (иначе это обычная прокрутка);
  //  • лист следует за пальцем 1:1, отпускание — по расстоянию или скорости броска, без прыжков.
  // Ref читается только внутри обработчиков жеста, не во время рендера
  // eslint-disable-next-line react-hooks/refs
  const [gestures] = useState(() => {
    const st = { active: false };
    const move = (dy: number) => drag.setValue(dy >= 0 ? dy : -Math.min(28, Math.sqrt(-dy) * 3));
    const back = (vy = 0) => Animated.spring(drag, { toValue: 0, velocity: vy, damping: 26, stiffness: 300, mass: 0.9, overshootClamping: true, useNativeDriver: true }).start();
    /** Отпускание: закрыть по расстоянию или броску, иначе плавно вернуть. vy — px/ms; force — закрыть без проверок */
    const finish = (dy: number, vy: number, force = false) => {
      const h = Math.max(200, live.current.sheetH);
      const far = dy > Math.min(160, h * 0.3);
      const flick = vy > 0.55 && dy > 24;
      if (force || far || flick) {
        live.current.closing = true;
        const rest = Math.max(0, h + 40 - dy);
        const duration = Math.max(120, Math.min(260, rest / Math.max(1.4, vy * 1.6)));
        Animated.timing(drag, { toValue: h + 40, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => live.current.onClose());
      } else back(vy);
    };

    if (!GH) {
      // Запасной режим без нативных жестов: PanResponder. Шапка тянет всегда, весь лист — когда содержимое у верха.
      const make = (always: boolean) => {
        const want = (_: unknown, g: { dx: number; dy: number }) => !live.current.closing && g.dy > 6 && g.dy > Math.abs(g.dx) * 1.2 && (always || live.current.atTop);
        return PanResponder.create({
          onMoveShouldSetPanResponderCapture: want,
          onMoveShouldSetPanResponder: want,
          onPanResponderGrant: () => drag.stopAnimation(),
          onPanResponderMove: (_, g) => move(g.dy),
          onPanResponderRelease: (_, g) => finish(g.dy, g.vy),
          onPanResponderTerminate: () => back(),
          onPanResponderTerminationRequest: () => false,
        });
      };
      return { native: undefined, pan: undefined, head: make(true).panHandlers, body: make(false).panHandlers, finish };
    }
    const { Gesture } = GH;
    // runOnJS(true) у ВСЕХ жестов, включая Native: иначе gesture-handler переключается на Reanimated
    const native = Gesture.Native().runOnJS(true);
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetY(6)
      .failOffsetX([-24, 24])
      .simultaneousWithExternalGesture(native)
      .onStart(() => {
        st.active = !live.current.closing && live.current.atTop;
        if (st.active) drag.stopAnimation();
      })
      .onUpdate((e) => {
        if (st.active) move(e.translationY);
      })
      .onEnd((e) => {
        if (!st.active) return;
        st.active = false;
        finish(e.translationY, e.velocityY / 1000);
      })
      .onFinalize(() => {
        if (st.active) {
          st.active = false;
          back();
        }
      });
    return { native, pan, head: undefined, body: undefined, finish };
  });

  const { mounted, shown, onDismiss } = useModalPresence(
    visible,
    () => {
      live.current.closing = false;
      live.current.atTop = true;
      drag.setValue(0);
      // Дизайн-система §6: пружина damping 26 / stiffness 260 (≈280 мс); при «Уменьшении движения» — проявление 120 мс
      if (prefersReducedMotion()) Animated.timing(anim, { toValue: 1, duration: 120, useNativeDriver: true }).start();
      else Animated.spring(anim, { toValue: 1, damping: 26, stiffness: 260, mass: 0.9, overshootClamping: true, useNativeDriver: true }).start();
    },
    (done) => {
      live.current.closing = true;
      Animated.timing(anim, { toValue: 0, duration: prefersReducedMotion() ? 120 : 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => done());
    },
  );

  if (!mounted) return null;
  // «Уменьшение движения»: лист не выезжает, а проявляется на месте
  const calm = prefersReducedMotion();
  const translateY = calm ? 0 : anim.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });
  // Фон светлеет по мере того, как лист уводят вниз
  const dim = Animated.multiply(anim, drag.interpolate({ inputRange: [0, Math.max(200, sheetH)], outputRange: [1, 0.15], extrapolate: 'clamp' }));
  const maxH = Math.max(240, (height - pad) * maxHeightPct - (pad ? insets.top : 0));

  // На iPhone (без gesture-handler) длинную шторку закрывает сама прокрутка, как в системных листах iOS:
  // тянешь содержимое вниз от верха и отпускаешь дальше порога или броском — лист уезжает. Нативная прокрутка
  // забирает касание раньше PanResponder, поэтому тянуть «за содержимое» через PanResponder в длинных листах нельзя
  const pullToClose = !GH && scroll && canScroll;
  const body = scroll ? (
    <SafeDetector gesture={gestures.native}>
    <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      bounces={pullToClose}
      alwaysBounceVertical={pullToClose}
      overScrollMode="never"
      scrollEnabled={canScroll || pad > 0}
      onScrollEndDrag={(e) => {
        const l = live.current;
        if (!pullToClose || l.closing) return;
        // y < 0 — содержимое оттянуто вниз за верхний край. Скорость считаем сами по onScroll (pt/мс, вниз —
        // отрицательная): знак velocity в событии на разных архитектурах RN не совпадает
        const y = e.nativeEvent.contentOffset.y;
        const fresh = Date.now() - l.t < 80;
        const down = fresh ? -l.vy : 0;
        if (y < -70 || (y < -16 && down > 0.6)) {
          drag.setValue(-y);
          gestures.finish(-y, down, true);
        }
      }}
      onLayout={(e) => setBoxH(e.nativeEvent.layout.height)}
      onContentSizeChange={(_w, h) => setContentH(h)}
      onScroll={(e) => {
        const l = live.current;
        const y = e.nativeEvent.contentOffset.y;
        const now = Date.now();
        if (now > l.t) l.vy = (y - l.y) / (now - l.t);
        l.y = y;
        l.t = now;
        l.atTop = y <= 2;
        onKbScroll(e);
      }}
      contentContainerStyle={{ paddingBottom: footer || pad ? space.md : insets.bottom + space.lg }}
      showsVerticalScrollIndicator={false}
    >
      <KeyboardScrollProvider ensure={ensure}>{children}</KeyboardScrollProvider>
    </ScrollView>
    </SafeDetector>
  ) : (
    <View style={{ paddingBottom: footer || pad ? space.sm : insets.bottom + space.lg, flexShrink: 1 }}>{children}</View>
  );

  return (
    <Modal visible={shown} onDismiss={onDismiss} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <GestureRoot style={{ flex: 1 }}>
      <View ref={rootRef} style={{ flex: 1, paddingBottom: pad }}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: dim }]}>
          <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Закрыть" />
        </Animated.View>
        <View style={{ flex: 1 }} pointerEvents="box-none" />
        <SafeDetector gesture={gestures.pan}>
        <Animated.View
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            live.current.sheetH = h;
            setSheetH(h);
          }}
          style={[styles.sheet, { maxHeight: maxH, opacity: calm ? anim : 1, transform: [{ translateY }, { translateY: drag }] }]}
          {...(pullToClose ? undefined : gestures.body)}
        >
          <View {...gestures.head}>
          <View style={styles.grabZone}>
            <View style={styles.grabber} />
          </View>
          {title ? (
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <T v="title2" accessibilityRole="header" numberOfLines={2}>
                  {title}
                </T>
                {subtitle ? (
                  <T v="callout" style={{ marginTop: 2 }}>
                    {subtitle}
                  </T>
                ) : null}
              </View>
              <IconButton name="close" label="Закрыть" onPress={onClose} size={20} style={{ width: 36, height: 36 }} />
            </View>
          ) : null}
          </View>
          {body}
          {footer ? <View style={{ paddingTop: space.sm, paddingBottom: pad ? space.md : insets.bottom + space.md }}>{footer}</View> : null}
        </Animated.View>
        </SafeDetector>
      </View>
      </GestureRoot>
    </Modal>
  );
}

const styles = themed({
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.lg,
    borderBottomWidth: 0,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  grabZone: { paddingTop: 8, paddingBottom: 12, marginHorizontal: -space.lg, alignItems: 'center' },
  grabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: space.md },
});
