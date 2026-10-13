import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, themed } from '@/theme';
import { Icon, T, type IconName } from '@/components/ui';
import { TAB_BAR_HEIGHT } from '@/components/Screen';
import { TrainingHub } from '@/features/training/TrainingHub';
import { useUi } from '@/stores/ui';
import { useWorkouts } from '@/stores/workouts';
import { haptic } from '@/services/haptics';
import { GlassSurface } from '@/components/Glass';

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: 'Сегодня', icon: 'home-outline', iconActive: 'home' },
  training: { label: 'Тренировки', icon: 'barbell-outline', iconActive: 'barbell' },
  nutrition: { label: 'Питание', icon: 'nutrition-outline', iconActive: 'nutrition' },
  progress: { label: 'Прогресс', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
};

function TabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  const openHub = useUi((s) => s.openHub);
  const hasActive = useWorkouts((s) => !!s.active);
  const routes = state.routes as { key: string; name: string }[];
  const item = (r: { key: string; name: string }, idx: number) => {
    const meta = TABS[r.name];
    if (!meta) return null;
    const focused = state.index === idx;
    return (
      <Pressable
        key={r.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={meta.label}
        onPress={() => {
          const ev = navigation.emit({ type: 'tabPress', target: r.key, canPreventDefault: true });
          if (!focused && !ev.defaultPrevented) {
            haptic.tap();
            navigation.navigate(r.name);
          }
        }}
        style={styles.item}
      >
        <Icon name={focused ? meta.iconActive : meta.icon} size={23} color={focused ? colors.text : colors.muted} />
        <T v="small" style={{ fontSize: 10.5, fontWeight: '700', color: focused ? colors.text : colors.muted }} numberOfLines={1}>
          {meta.label}
        </T>
      </Pressable>
    );
  };
  return (
    // iOS 26 — «жидкое стекло», иначе полупрозрачная панель в цветах темы
    <GlassSurface style={[styles.bar, { height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]} fallback={colors.tabBar} testID="tab-bar">
      {routes.slice(0, 2).map((r, i) => item(r, i))}
      <View style={styles.centerWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Тренировка: начать, сгенерировать или собрать"
          onPress={() => {
            haptic.light();
            openHub();
          }}
          style={({ pressed }) => [styles.plus, pressed && { transform: [{ scale: 0.94 }] }]}
        >
          <Icon name="add" size={30} color={colors.text} />
          {hasActive ? <View style={styles.dot} /> : null}
        </Pressable>
      </View>
      {routes.slice(2).map((r, i) => item(r, i + 2))}
    </GlassSurface>
  );
}

export default function TabsLayout() {
  return (
    <>
      <Tabs tabBar={(p: any) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } } as any}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="training" />
        <Tabs.Screen name="nutrition" />
        <Tabs.Screen name="progress" />
      </Tabs>
      <TrainingHub />
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
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, paddingTop: 6 },
  centerWrap: { width: 76, alignItems: 'center' },
  // «+» — спокойная кнопка: лайм на экране принадлежит главному действию, а не меню
  plus: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  dot: { position: 'absolute', top: 4, right: 4, width: 11, height: 11, borderRadius: 6, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.surface3 },
});
