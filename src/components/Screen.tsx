import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, space } from '@/theme';
import { IconButton, T } from './ui';

export const TAB_BAR_HEIGHT = 64;

/** Базовый экран: фон, safe area (Dynamic Island / home indicator), отступ под таб-бар */
export function Screen({
  children,
  scroll = true,
  tabBar = false,
  style,
  contentStyle,
  keyboard = false,
  padded = true,
  refreshControl,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  tabBar?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  keyboard?: boolean;
  padded?: boolean;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
}) {
  const insets = useSafeAreaInsets();
  const bottom = (tabBar ? TAB_BAR_HEIGHT + insets.bottom : insets.bottom) + space.lg;
  const inner = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[{ paddingTop: insets.top + space.sm, paddingBottom: bottom, paddingHorizontal: padded ? space.lg : 0 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingTop: insets.top + space.sm, paddingBottom: bottom, paddingHorizontal: padded ? space.lg : 0 }, contentStyle]}>{children}</View>
  );
  return (
    <View style={[styles.root, style]}>
      {keyboard ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {inner}
        </KeyboardAvoidingView>
      ) : (
        inner
      )}
    </View>
  );
}

/** Заголовок экрана стека: назад + заголовок + действие */
export function Header({ title, subtitle, right, onBack, large }: { title: string; subtitle?: string; right?: React.ReactNode; onBack?: () => void; large?: boolean }) {
  return (
    <View style={styles.header}>
      <IconButton
        name="chevron-back"
        label="Назад"
        onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
        style={{ marginLeft: -4 }}
      />
      <View style={{ flex: 1, paddingHorizontal: 6 }}>
        <T v={large ? 'h1' : 'h3'} numberOfLines={1}>
          {title}
        </T>
        {subtitle ? (
          <T v="small" numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right ?? <View style={{ width: 44 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md, minHeight: 48 },
});
