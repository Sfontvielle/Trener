import React from 'react';
import { Pressable, View } from 'react-native';
import { Sheet } from '@/components/Sheet';
import { Chip, Icon, T } from '@/components/ui';
import { Bar } from '@/components/charts';
import { colors, radius, space, themed } from '@/theme';
import { useNutrition, waterTarget } from '@/stores/nutrition';
import { useProfile } from '@/stores/profile';
import { haptic } from '@/services/haptics';

const fmt = (ml: number) => (ml >= 1000 ? `${String(Math.round(ml / 50) / 20).replace('.', ',')} л` : `${ml} мл`);

/** Вода: увеличить и уменьшить крупными кнопками, быстрые объёмы — одним тапом */
export function WaterSheet({ visible, onClose, date }: { visible: boolean; onClose: () => void; date: string }) {
  const ml = useNutrition((s) => s.water[date] ?? 0);
  const w = useProfile((s) => s.profile?.weightKg ?? 75);
  const goal = waterTarget(w, false);
  const add = (x: number) => {
    useNutrition.getState().addWater(date, x);
    haptic.light();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Вода" subtitle={`Ориентир ~${String(goal / 1000).replace('.', ',')} л в день`}>
      <View style={{ gap: space.lg }}>
        <View style={styles.row}>
          <Pressable accessibilityRole="button" accessibilityLabel="Уменьшить на 250 мл" disabled={!ml} onPress={() => add(-250)} style={[styles.big, !ml && { opacity: 0.35 }]} hitSlop={6}>
            <Icon name="remove" size={28} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <T v="display" style={{ fontSize: 36 }} testID="water-amount">
              {fmt(ml)}
            </T>
            <Bar progress={ml / goal} color={colors.protein} height={6} style={{ alignSelf: 'stretch' }} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Увеличить на 250 мл" onPress={() => add(250)} style={[styles.big, { backgroundColor: colors.accent }]} hitSlop={6}>
            <Icon name="add" size={28} color={colors.onAccent} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {[150, 250, 330, 500].map((x) => (
            <Chip key={x} label={`+${x} мл`} onPress={() => add(x)} />
          ))}
          {[-50, -100].map((x) => (
            <Chip key={x} label={`${x} мл`} onPress={() => ml > 0 && add(x)} />
          ))}
        </View>
      </View>
    </Sheet>
  );
}

const styles = themed({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  big: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface3 },
  card: { borderRadius: radius.md },
});
