import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, themed } from '@/theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Icon, T, type IconName } from '@/components/ui';
import { TAB_BAR_HEIGHT } from '@/components/Screen';
import { useWorkouts } from '@/stores/workouts';
import { haptic } from '@/services/haptics';
import { GlassSurface } from '@/components/Glass';

type MciName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
/** Значки контурные 24 pt; выбранная вкладка — основным цветом текста с полосой акцента сверху */
const TABS: Record<string, { label: string; icon: IconName | MciName; mci?: boolean }> = {
  index: { label: 'Сегодня', icon: 'home-outline' },
  training: { label: 'Тренировки', icon: 'barbell-outline' },
  nutrition: { label: 'Питание', icon: 'silverware-fork-knife', mci: true },
  progress: { label: 'Прогресс', icon: 'stats-chart-outline' },
  profile: { label: 'Профиль', icon: 'person-outline' },
};

/**
 * Своя нижняя панель: пять равных вкладок. SDK 58: панель получает состояние вкладок,
 * emitter (событие tabPress) и navigateToTab — без объекта navigation.
 */
function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const hasActive = useWorkouts((s) => !!s.active);
  const focusedKey = state.routes[state.index]?.key;
  // Порядок — как объявлены вкладки ниже (TABS); маршрут без описания в TABS не показываем
  const routes = Object.keys(TABS)
    .map((name) => state.routes.find((r) => r.name === name))
    .filter((r): r is (typeof state.routes)[number] => !!r);
  const item = (r: (typeof state.routes)[number]) => {
    const meta = TABS[r.name];
    const focused = focusedKey === r.key;
    return (
      <Pressable
        key={r.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        aria-selected={focused}
        accessibilityLabel={r.name === 'training' && hasActive ? `${meta.label}, идёт тренировка` : meta.label}
        onPress={() => {
          const ev = emitter.emit({ type: 'tabPress', target: r.key, canPreventDefault: true });
          if (!focused && !ev.defaultPrevented) {
            haptic.tap();
            navigateToTab(r.key);
          }
        }}
        style={styles.item}
      >
        {/* Выбранная вкладка: цвет основного текста и полоса акцента 2 pt над значком (дизайн-система §9 BottomTabBar) */}
        <View style={[styles.mark, focused && { backgroundColor: colors.accent }]} />
        <View>
          {meta.mci ? <MaterialCommunityIcons name={meta.icon as MciName} size={24} color={focused ? colors.text : colors.muted} /> : <Icon name={meta.icon as IconName} size={24} color={focused ? colors.text : colors.muted} />}
          {/* Идёт тренировка — точка на вкладке «Тренировки» */}
          {r.name === 'training' && hasActive ? <View style={styles.dot} testID="active-workout-dot" /> : null}
        </View>
        <T v="caption" maxFontSizeMultiplier={1.2} color={focused ? colors.text : colors.muted} style={{ lineHeight: 14, fontWeight: focused ? '600' : '500' }} numberOfLines={1}>
          {meta.label}
        </T>
      </Pressable>
    );
  };
  return (
    // iOS 26 — «жидкое стекло», иначе полупрозрачная панель в цветах темы. Пять равных вкладок, без «+» по центру:
    // начать или запланировать тренировку — «+» в правом верхнем углу вкладки «Тренировки»
    <GlassSurface style={[styles.bar, { height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]} fallback={colors.tabBar} testID="tab-bar">
      {routes.map((r) => item(r))}
    </GlassSurface>
  );
}

export default function TabsLayout() {
  return (
    <>
      <Tabs tabBar={(p: BottomTabBarProps) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } } as any}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="training" />
        <Tabs.Screen name="nutrition" />
        <Tabs.Screen name="progress" />
        <Tabs.Screen name="profile" />
      </Tabs>
    </>
  );
}

const styles = themed({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderStrong,
  },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', gap: 3, paddingTop: 10 },
  mark: { position: 'absolute', top: 0, width: 24, height: 2, borderRadius: 1, backgroundColor: 'transparent' },
  dot: { position: 'absolute', top: -2, right: -6, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.bg },
});
