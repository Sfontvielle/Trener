import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, currentTheme } from '@/theme';

/**
 * «Жидкое стекло» iOS 26 (expo-glass-effect) с запасным вариантом: на Android, вебе, старых iOS и при
 * включённом «Понижении прозрачности» — обычная полупрозрачная поверхность в цветах темы.
 * Модуль подключается защищённо: если нативной части нет (старая сборка), приложение не падает.
 */
type GlassMod = typeof import('expo-glass-effect');
let mod: GlassMod | null = null;
let available = false;
if (Platform.OS === 'ios') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('expo-glass-effect') as GlassMod;
    available = !!mod.isGlassEffectAPIAvailable?.() && !!mod.isLiquidGlassAvailable?.();
  } catch {
    mod = null;
    available = false;
  }
}

let reduceTransparency = false;
const listeners = new Set<(v: boolean) => void>();
if (available) {
  AccessibilityInfo.isReduceTransparencyEnabled?.()
    .then((v) => {
      reduceTransparency = v;
      listeners.forEach((l) => l(v));
    })
    .catch(() => {});
  AccessibilityInfo.addEventListener?.('reduceTransparencyChanged', (v: boolean) => {
    reduceTransparency = v;
    listeners.forEach((l) => l(v));
  });
}

export function glassAvailable(): boolean {
  return available && !reduceTransparency;
}

function useGlass(): boolean {
  const [on, setOn] = useState(glassAvailable);
  useEffect(() => {
    if (!available) return;
    const l = () => setOn(glassAvailable());
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return on;
}

/**
 * Поверхность из стекла. Нельзя класть внутрь контейнера с opacity 0 (эффект перестаёт рисоваться) —
 * поэтому используется только в статичных местах: нижнее меню, шапки, переключатели.
 */
export function GlassSurface({ style, fallback, interactive, children, testID }: { style?: StyleProp<ViewStyle>; fallback?: string; interactive?: boolean; children?: React.ReactNode; testID?: string }) {
  const on = useGlass();
  const scheme = currentTheme().scheme;
  if (on && mod) {
    const GlassView = mod.GlassView;
    return (
      <GlassView style={style} glassEffectStyle="regular" isInteractive={interactive} colorScheme={scheme} testID={testID}>
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[style, { backgroundColor: fallback ?? colors.surface2 }]} testID={testID}>
      {children}
    </View>
  );
}
