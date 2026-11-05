import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, View } from 'react-native';
import { colors, currentTheme, space, themed } from '@/theme';
import { haptic } from '@/services/haptics';
import { prefersReducedMotion } from '../motion';
import { Icon, T } from '../ui';

const REVEAL = 88;

/**
 * Строка со свайпом влево для удаления (как в iOS): потянул — открылась красная кнопка «Удалить»; дотянул дальше
 * половины ширины — удаляется сразу. Работает на PanResponder (без gesture-handler — см. gestures.tsx).
 * Для VoiceOver — действие «Удалить» в ротаторе.
 */
export function SwipeRow({ children, onDelete, deleteLabel = 'Удалить', a11yLabel, testID, bg }: { children: React.ReactNode; onDelete: () => void; deleteLabel?: string; /** Полное название действия для VoiceOver («Удалить подход 2»); на кнопке — короткое deleteLabel */ a11yLabel?: string; testID?: string; /** Фон строки (по умолчанию — карточка) */ bg?: string }) {
  const [x] = useState(() => new Animated.Value(0));
  const st = useRef({ open: false, width: 360, onDelete });
  useEffect(() => {
    st.current.onDelete = onDelete;
  }, [onDelete]);
  const settle = (to: number, done?: () => void) => {
    st.current.open = to !== 0;
    if (prefersReducedMotion()) {
      x.setValue(to);
      done?.();
      return;
    }
    Animated.timing(x, { toValue: to, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => done?.());
  };
  const remove = () => {
    haptic.warning();
    settle(-st.current.width, () => {
      st.current.onDelete();
      x.setValue(0);
      st.current.open = false;
    });
  };
  // Ref читается только внутри обработчиков жеста, не во время рендера
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        const base = st.current.open ? -REVEAL : 0;
        x.setValue(Math.min(0, base + g.dx));
      },
      onPanResponderRelease: (_, g) => {
        const pos = (st.current.open ? -REVEAL : 0) + g.dx;
        if (pos < -st.current.width * 0.5) remove();
        else if (pos < -REVEAL / 2 || g.vx < -0.6) settle(-REVEAL);
        else settle(0);
      },
      // Начатый свайп строки не отдаём: иначе его перехватывает внешний горизонтальный жест экрана
      // (на тренировке — листание упражнений), и строка возвращается на место
      onPanResponderTerminationRequest: () => false,
      onPanResponderTerminate: () => settle(st.current.open ? -REVEAL : 0),
    }),
  );
  // Текст на красном: тёмный в тёмной теме, белый в светлой (контраст ≥ 4,5)
  const fg = currentTheme().scheme === 'light' ? colors.surface : colors.bg;
  return (
    <View
      testID={testID}
      style={styles.wrap}
      onLayout={(e) => (st.current.width = e.nativeEvent.layout.width)}
      accessibilityActions={[{ name: 'delete', label: a11yLabel ?? deleteLabel }]}
      onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && onDelete()}
    >
      <Pressable accessibilityRole="button" accessibilityLabel={a11yLabel ?? deleteLabel} onPress={remove} style={styles.action}>
        <Icon name="trash-outline" size={20} color={fg} />
        <T v="footnote" color={fg} style={{ fontWeight: '600' }}>
          {deleteLabel}
        </T>
      </Pressable>
      <Animated.View style={[styles.front, bg ? { backgroundColor: bg } : null, { transform: [{ translateX: x }] }]} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = themed({
  wrap: { overflow: 'hidden' },
  action: { position: 'absolute', right: 0, top: 0, bottom: 0, width: REVEAL, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: colors.danger, paddingHorizontal: space.xs },
  front: { backgroundColor: colors.surface },
});
