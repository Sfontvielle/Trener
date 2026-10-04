import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, PanResponder, Pressable, StyleSheet, View, useWindowDimensions, type PanResponderGestureState } from 'react-native';
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

  // Ref читается только внутри обработчиков жеста, не во время рендера
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() => {
    const release = (_e: unknown, g: PanResponderGestureState) => {
      if (live.current.closing) return;
      if (g.dx > live.current.w * 0.3 || (g.vx > 0.5 && g.dx > 20)) {
        live.current.closing = true;
        Animated.timing(drag, { toValue: live.current.w, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => live.current.onClose());
      } else Animated.spring(drag, { toValue: 0, velocity: g.vx, damping: 26, stiffness: 300, overshootClamping: true, useNativeDriver: true }).start();
    };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) => g.dx > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dx)),
      onPanResponderRelease: release,
      onPanResponderTerminate: release,
      onPanResponderTerminationRequest: () => false,
    });
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
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay, opacity: dim }]}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Закрыть список" />
      </Animated.View>
      <Animated.View {...pan.panHandlers} style={[styles.panel, { width: panelW, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8, transform: [{ translateX }, { translateX: drag }] }]}>
        <View style={styles.head}>
          <View style={{ flex: 1 }}>
            <T v="h2" numberOfLines={2}>
              {title}
            </T>
            {subtitle ? <T v="small">{subtitle}</T> : null}
          </View>
          <IconButton name="close" label="Закрыть" onPress={onClose} size={20} style={{ width: 36, height: 36 }} />
        </View>
        <View style={{ flex: 1 }}>{children}</View>
        {footer ? <View style={{ paddingTop: space.sm }}>{footer}</View> : null}
      </Animated.View>
    </Modal>
  );
}

const styles = themed({
  panel: { position: 'absolute', right: 0, top: 0, bottom: 0, backgroundColor: colors.surface, borderLeftWidth: 1, borderColor: colors.border, paddingHorizontal: space.lg },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm, marginBottom: space.md },
});
