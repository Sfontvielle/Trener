import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, AppState, Platform, View } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SystemUI from 'expo-system-ui';
import { colors } from '@/theme';
import { useHydrated } from '@/stores/hydration';
import { useProfile } from '@/stores/profile';
import { DialogHost, useDialog } from '@/components/Dialog';
import { ErrorBoundaryView } from '@/components/ErrorBoundaryView';
import { configureNotifications, syncReminders } from '@/services/notifications';
import { usePlan } from '@/stores/plan';
import { useWorkouts } from '@/stores/workouts';
import { useThemeKey } from '@/hooks/useThemeKey';
import { consumePendingRoute } from '@/features/settings/themeNav';
import { maybeAutoSync } from '@/features/health/sync';

export { ErrorBoundaryView as ErrorBoundary };

configureNotifications();

/** Вопрос о незавершённой тренировке уже задан в этом запуске */
let resumeAsked = false;

function Gate() {
  const hydrated = useHydrated();
  const profile = useProfile((s) => s.profile);
  const segments = useSegments();
  const settings = useProfile((s) => s.settings);
  const plan = usePlan((s) => s.plan);

  // Напоминания всегда соответствуют текущему плану (смена расписания → перепланирование)
  const reminderKey = JSON.stringify([settings.morningReminder, settings.morningTime, settings.trainingReminder, settings.trainingTime, plan?.schedule, plan?.templates.map((t) => t.name)]);
  const hasProfile = !!profile;
  useEffect(() => {
    if (hydrated && hasProfile) void syncReminders(useProfile.getState().settings, usePlan.getState().plan);
  }, [hydrated, hasProfile, reminderKey]);

  useEffect(() => {
    if (!hydrated) return;
    const inOnboarding = segments[0] === 'onboarding';
    if (!profile && !inOnboarding) router.replace('/onboarding');
    if (profile && inOnboarding) router.replace('/');
  }, [hydrated, profile, segments]);

  // После смены темы навигатор перемонтируется — возвращаем пользователя туда, где он был
  useEffect(() => {
    if (!hydrated) return;
    const r = consumePendingRoute();
    // Навигатор только что смонтирован — даём ему время, и не роняем приложение, если переход не удался
    if (r)
      setTimeout(() => {
        try {
          router.push(r as never);
        } catch {
          /* остаёмся на главной */
        }
      }, 350);
  }, [hydrated]);

  // Apple Health: синхронизация при запуске и возвращении в приложение (не чаще раза в 30 мин)
  useEffect(() => {
    if (!hydrated) return;
    maybeAutoSync();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && maybeAutoSync());
    return () => sub.remove();
  }, [hydrated]);

  // Незавершённая тренировка после перезапуска / выгрузки приложения: спрашиваем один раз за запуск
  // (флаг модульный: перемонтирование дерева при смене темы — не новый запуск)
  useEffect(() => {
    if (!hydrated || !profile || resumeAsked) return;
    resumeAsked = true;
    const active = useWorkouts.getState().active;
    if (!active || segments.join('/').includes('workout')) return;
    const done = active.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
    useDialog.getState().show('У тебя есть незавершённая тренировка', `«${active.name}» · выполнено подходов: ${done}. Всё сохранено.`, [
      { text: 'Продолжить', onPress: () => router.push('/workout/active') },
      { text: 'Завершить и сохранить', style: 'cancel', onPress: () => { useWorkouts.getState().finish({}); } },
      { text: 'Удалить', style: 'destructive', onPress: () => useWorkouts.getState().discard() },
    ]);
  }, [hydrated, profile, segments]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: Platform.OS === 'ios' ? 'default' : 'fade',
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      <Stack.Screen name="checkin" options={{ presentation: 'modal' }} />
      <Stack.Screen name="weight" options={{ presentation: 'modal' }} />
      <Stack.Screen name="food/add" options={{ presentation: 'modal' }} />
      <Stack.Screen name="food/scan" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="workout/active" options={{ gestureEnabled: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const theme = useThemeKey();
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => undefined);
  }, [theme.key]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider key={theme.key} style={{ backgroundColor: colors.bg }}>
        <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
        <Gate />
        <DialogHost />
      </SafeAreaProvider>
      <ThemeFade themeKey={theme.key} />
    </View>
  );
}

/** Мягкий переход при смене темы: фон прежней темы плавно растворяется поверх перекрашенного экрана */
function ThemeFade({ themeKey }: { themeKey: string }) {
  const [st, setSt] = useState({ key: themeKey, bg: colors.bg, overlay: null as string | null, n: 0 });
  const [o] = useState(() => new Animated.Value(0));
  if (st.key !== themeKey) setSt({ key: themeKey, bg: colors.bg, overlay: st.bg, n: st.n + 1 });
  useEffect(() => {
    if (!st.n) return;
    o.setValue(1);
    Animated.timing(o, { toValue: 0, duration: 380, useNativeDriver: true }).start();
  }, [st.n, o]);
  if (!st.overlay) return null;
  return <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: st.overlay, opacity: o }} />;
}
