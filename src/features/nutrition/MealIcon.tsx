import React from 'react';
import { View } from 'react-native';
import type { MealSlot } from '@/types';
import { colors } from '@/theme';
import { Icon, type IconName } from '@/components/ui';

/**
 * Единообразные иконки приёмов пищи (одна линейка Ionicons, цвет — токены темы):
 * завтрак — утреннее солнце, обед — дневное солнце, ужин — луна, перекус — чашка.
 */
export const MEAL_ICON: Record<MealSlot, IconName> = {
  breakfast: 'partly-sunny-outline',
  lunch: 'sunny-outline',
  dinner: 'moon-outline',
  snack: 'cafe-outline',
};

export function mealTint(m: MealSlot): string {
  return m === 'breakfast' ? colors.fat : m === 'lunch' ? colors.accent : m === 'dinner' ? colors.protein : colors.secondaryMuscle;
}

export function MealIcon({ meal, size = 32 }: { meal: MealSlot; size?: number }) {
  const tint = mealTint(meal);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface3, borderWidth: 1, borderColor: tint }}>
      <Icon name={MEAL_ICON[meal]} size={Math.round(size * 0.55)} color={tint} />
    </View>
  );
}
