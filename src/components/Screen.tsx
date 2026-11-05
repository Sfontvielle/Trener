import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, space, themed } from '@/theme';
import { IconButton, T } from './ui';
import { KeyboardScrollProvider, useKeyboardAwareScroll } from './keyboard';

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
  footer,
}: {
  children: React.ReactNode;
  /** Закреплённая панель внизу (главное действие экрана): не уезжает при прокрутке */
  footer?: React.ReactNode;
  scroll?: boolean;
  tabBar?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  keyboard?: boolean;
  padded?: boolean;
  refreshControl?: React.ComponentProps<typeof ScrollView>['refreshControl'];
}) {
  const insets = useSafeAreaInsets();
  const { scrollRef, rootRef, pad, ensure, onScroll } = useKeyboardAwareScroll();
  const bottom = footer ? space.lg : (tabBar ? TAB_BAR_HEIGHT + insets.bottom : insets.bottom) + space.lg;
  const inner = scroll ? (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      // Пока открыта клавиатура, под содержимым есть место — любое поле можно поднять над ней
      contentContainerStyle={[{ paddingTop: insets.top + space.sm, paddingBottom: pad ? pad + space.xl : bottom, paddingHorizontal: padded ? space.lg : 0 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      showsVerticalScrollIndicator={false}
      // Короткий экран не «гуляет» под пальцем: оттягивание — только когда есть что прокручивать (или обновление жестом)
      alwaysBounceVertical={!!refreshControl}
      refreshControl={refreshControl}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <KeyboardScrollProvider ensure={ensure}>{children}</KeyboardScrollProvider>
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, paddingTop: insets.top + space.sm, paddingBottom: bottom, paddingHorizontal: padded ? space.lg : 0 }, contentStyle]}>{children}</View>
  );
  return (
    <View ref={rootRef} style={[styles.root, style]}>
      {keyboard && !scroll ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {inner}
        </KeyboardAvoidingView>
      ) : (
        inner
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + space.sm }]}>{footer}</View> : null}
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
        <T v={large ? 'title1' : 'title2'} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {title}
        </T>
        {subtitle ? (
          <T v="footnote" numberOfLines={1}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right ?? <View style={{ width: 44 }} />}
    </View>
  );
}

const styles = themed({
  root: { flex: 1, backgroundColor: colors.bg },
  footer: { paddingHorizontal: space.lg, paddingTop: space.sm, borderTopWidth: 0.5, borderTopColor: colors.borderStrong, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md, minHeight: 48 },
});
