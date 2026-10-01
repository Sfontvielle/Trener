import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SystemUI from 'expo-system-ui';
import { colors } from '@/theme';
import { useHydrated } from '@/stores/hydration';
import { useProfile } from '@/stores/profile';
import { DialogHost } from '@/components/Dialog';
import { ErrorBoundaryView } from '@/components/ErrorBoundaryView';
import { configureNotifications, syncReminders } from '@/services/notifications';
import { usePlan } from '@/stores/plan';

export { ErrorBoundaryView as ErrorBoundary };

configureNotifications();

SystemUI.setBackgroundColorAsync(colors.bg).catch(() => undefined);

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
  return (
    <SafeAreaProvider style={{ backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <Gate />
      <DialogHost />
    </SafeAreaProvider>
  );
}
