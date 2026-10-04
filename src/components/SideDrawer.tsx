import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space, themed } from '@/theme';
import { IconButton, T } from './ui';

/**
 * Выдвижная боковая панель справа (навигация по тренировке).
 * Закрывается тапом по фону, крестиком или свайпом вправо — палец ведёт панель, порог ~30% ширины
 * или быстрый бросок. Обработчики жеста создаются один раз (экран под панелью перерисовывается каждую секунду).
 */
export function SideDrawer({ visible, onClose, title, subtitle, children, footer }: { visible: boolean; onClose: () => void; title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelW = Math.min(380, Math.round(width * 0.86));
  const [mounted, setMounted] = useState(visible);
  const [anim] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.Value(0));
  const live = useRef({ onClose, w: panelW, closing: false });
  useEffect(() => {
    live.current.onClose = onClose;
    live.current.w = panelW;
  }, [onClose, panelW]);

  // Нативный жест (react-native-gesture-handler): активируется только движением ВПРАВО (≥8 pt),
  // вертикальное движение его отменяет. Список внутри — ScrollView из gesture-handler (DrawerScroll),
  // поэтому свайп вправо и прокрутка списка не мешают друг другу.
  // Если свайп начат на прокручиваемом списке — работают оба жеста; вертикальное движение отменяет свайп.
  // Ref читается только внутри обработчиков жеста, не во время рендера
  // eslint-disable-next-line react-hooks/refs
  const [gestures] = useState(() => {
    const st = { active: false };
    const native = Gesture.Native();
    const pan = Gesture.Pan()
      .runOnJS(true)
      .activeOffsetX(8)
      .failOffsetY([-14, 14])
      .simultaneousWithExternalGesture(native)
      .onStart(() => {
        st.active = !live.current.closing;
        if (st.active) drag.stopAnimation();
      })
      .onUpdate((e) => {
        if (st.active) drag.setValue(Math.max(0, e.translationX));
      })
      .onEnd((e) => {
        if (!st.active) return;
        st.active = false;
        const dx = Math.max(0, e.translationX);
        const vx = e.velocityX / 1000;
        if (dx > live.current.w * 0.3 || (vx > 0.4 && dx > 16)) {
          live.current.closing = true;
          const left = live.current.w - dx;
          Animated.timing(drag, { toValue: live.current.w, duration: Math.max(90, Math.min(220, left / Math.max(0.8, vx))), easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => live.current.onClose());
        } else Animated.spring(drag, { toValue: 0, velocity: vx, damping: 26, stiffness: 300, overshootClamping: true, useNativeDriver: true }).start();
      })
      .onFinalize(() => {
        if (st.active) {
          st.active = false;
          Animated.spring(drag, { toValue: 0, damping: 26, stiffness: 300, overshootClamping: true, useNativeDriver: true }).start();
        }
      });
    return { pan, native };
  });

  if (visible && !mounted) setMounted(true);
  useEffect(() => {
    if (visible) {
      live.current.closing = false;
      drag.setValue(0);
      Animated.timing(anim, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      live.current.closing = true;
      Animated.timing(anim, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible, anim, drag, mounted]);

  if (!mounted) return null;
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [panelW, 0] });
  const dim = Animated.multiply(anim, drag.interpolate({ inputRange: [0, panelW], outputRange: [1, 0], extrapolate: 'clamp' }));
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: dim }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Закрыть список" />
      </Animated.View>
      <GestureDetector gesture={gestures.pan}>
      <Animated.View style={[styles.panel, { width: panelW, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8, transform: [{ translateX }, { translateX: drag }] }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <T v="h2" numberOfLines={2}>
              {title}
            </T>
            {subtitle ? <T v="small">{subtitle}</T> : null}
          </View>
          <IconButton name="close" label="Закрыть" onPress={onClose} size={20} style={{ width: 36, height: 36 }} />
        </View>
        <NativeCtx.Provider value={gestures.native}>
          <View style={{ flex: 1 }}>{children}</View>
        </NativeCtx.Provider>
        {footer ? <View style={{ paddingTop: space.sm }}>{footer}</View> : null}
      </Animated.View>
      </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = themed({
  panel: { position: 'absolute', right: 0, top: 0, bottom: 0, backgroundColor: colors.surface, borderLeftWidth: 1, borderColor: colors.border, paddingHorizontal: space.lg },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: space.md },
});

// Веб: браузер отменял горизонтальный свайп по списку (pointercancel), считая его прокруткой страницы.
// У прокрутки шторки браузеру разрешена только вертикаль; горизонталь достаётся жесту закрытия.
if (Platform.OS === 'web' && typeof document !== 'undefined' && !document.getElementById('rynji-drawer-css')) {
  const st = document.createElement('style');
  st.id = 'rynji-drawer-css';
  st.textContent = '[data-drawer-scroll], [data-drawer-scroll] * { touch-action: pan-y !important; }';
  document.head.appendChild(st);
}

/** Прокрутка внутри шторки: одновременно со свайпом закрытия (общий нативный жест через контекст) */
const NativeCtx = createContext<ReturnType<typeof Gesture.Native> | null>(null);
export function DrawerScroll(props: React.ComponentProps<typeof ScrollView>) {
  const native = useContext(NativeCtx);
  if (!native) return <ScrollView {...props} />;
  return (
    <GestureDetector gesture={native}>
      {/* dataSet → data-drawer-scroll в DOM; CSS-правило ниже (только веб) */}
      <ScrollView {...props} {...({ dataSet: { drawerScroll: '1' } } as object)} />
    </GestureDetector>
  );
}
