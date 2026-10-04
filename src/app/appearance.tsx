import { useNavigationContainerRef } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { colors, radius, space, themed, ACCENT_LABEL, ACCENT_SWATCH, paletteFor, type AccentName, type ThemePref } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Card, Icon, SectionTitle, T } from '@/components/ui';
import { useProfile } from '@/stores/profile';
import { haptic } from '@/services/haptics';
import { setPendingNavState } from '@/features/settings/themeNav';
import { BRAND } from '@/config/brand';

const THEMES: { key: ThemePref; label: string; sub: string }[] = [
  { key: 'system', label: 'Системная', sub: 'Как в настройках iPhone' },
  { key: 'dark', label: 'Тёмная', sub: `Фирменная ${BRAND}` },
  { key: 'light', label: 'Светлая', sub: 'Для яркого дня' },
];
const ACCENTS: AccentName[] = ['lime', 'blue', 'orange'];

/** Настройки → Оформление: тема и цвет акцента. Применяется сразу, сохраняется в профиле */
export default function Appearance() {
  const settings = useProfile((s) => s.settings);
  const update = useProfile((s) => s.updateSettings);
  const nav = useNavigationContainerRef();
  const set = (patch: Partial<typeof settings>) => {
    haptic.tap();
    // Навигатор перемонтируется для перекраски — вернёмся на этот экран
    setPendingNavState(nav.getRootState());
    update(patch);
  };

  return (
    <Screen>
      <Header title="Оформление" />
      <SectionTitle title="Тема" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {THEMES.map((t) => {
          const active = (settings.theme ?? 'dark') === t.key;
          const p = paletteFor(t.key === 'light' ? 'light' : 'dark', settings.accent ?? 'lime');
          const lp = paletteFor('light', settings.accent ?? 'lime');
          return (
            <Pressable key={t.key} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => set({ theme: t.key })} style={[styles.theme, active && { borderColor: colors.accent }]}>
              <View style={styles.preview}>
                {t.key === 'system' ? (
                  <View style={{ flex: 1, flexDirection: 'row' }}>
                    <Mini p={paletteFor('dark', settings.accent ?? 'lime')} />
                    <Mini p={lp} />
                  </View>
                ) : (
                  <Mini p={p} />
                )}
              </View>
              <T v="body" style={{ fontWeight: '700', marginTop: 8 }}>
                {t.label}
              </T>
              <T v="small" style={{ fontSize: 11 }} numberOfLines={1}>
                {t.sub}
              </T>
              <View style={[styles.radio, active && { borderColor: colors.accent }]}>{active ? <View style={styles.dot} /> : null}</View>
            </Pressable>
          );
        })}
      </View>

      <SectionTitle title="Акцент" />
      <Card style={{ gap: 4, paddingVertical: 6 }}>
        {ACCENTS.map((a) => {
          const active = (settings.accent ?? 'lime') === a;
          return (
            <Pressable key={a} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => set({ accent: a })} style={styles.accentRow}>
              <View style={[styles.swatch, { backgroundColor: ACCENT_SWATCH[a] }]} />
              <T v="body" style={{ flex: 1, fontWeight: '600' }}>
                {ACCENT_LABEL[a]}
                {a === 'lime' ? ' · по умолчанию' : ''}
              </T>
              {active ? <Icon name="checkmark-circle" size={22} color={colors.accent} /> : null}
            </Pressable>
          );
        })}
      </Card>
      <T v="small" style={{ marginTop: space.md, textAlign: 'center' }}>
        Выбор сохраняется на устройстве и применяется сразу.
      </T>
    </Screen>
  );
}

function Mini({ p }: { p: ReturnType<typeof paletteFor> }) {
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, padding: 6, gap: 4 }}>
      <View style={{ height: 14, borderRadius: 4, backgroundColor: p.surface, borderWidth: 1, borderColor: p.border }} />
      <View style={{ height: 6, width: '70%', borderRadius: 3, backgroundColor: p.text }} />
      <View style={{ height: 6, width: '45%', borderRadius: 3, backgroundColor: p.textDim }} />
      <View style={{ height: 10, borderRadius: 5, backgroundColor: p.accent, marginTop: 2 }} />
    </View>
  );
}

const styles = themed({
  theme: { flex: 1, padding: 10, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  preview: { height: 78, borderRadius: radius.sm, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  radio: { position: 'absolute', right: 10, top: 10, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent },
  accentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 },
  swatch: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border },
});
