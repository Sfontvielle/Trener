import React, { memo, useMemo } from 'react';
import { View } from 'react-native';
import type { Exercise, Sex } from '@/types';
import { colors, radius, themed } from '@/theme';
import { T } from '@/components/ui';
import { GROUP_LABEL } from '@/data/exercises';
import { targetMuscles } from '@/features/training/journal';
import { Anatomy } from './Anatomy';

/**
 * «Целевые мышцы» тренировки (по мотивам YouCan): карта тела и доли подходов по группам в процентах.
 * compact — одна строка «Грудь 40% · Трицепс 25% · Плечи 20%» без карты.
 */
export const TargetMuscles = memo(function TargetMuscles({ items, customs = [], sex, compact, max = 4 }: { items: { exerciseId: string; sets: number }[]; customs?: Exercise[]; sex?: Sex; compact?: boolean; max?: number }) {
  const t = useMemo(() => targetMuscles(items, customs), [items, customs]);
  if (!t.groups.length) return null;
  const top = t.groups.slice(0, max);
  if (compact) {
    return (
      <T v="small" style={{ fontSize: 12 }} testID="target-muscles" accessibilityLabel={`Целевые мышцы: ${top.map((g) => `${GROUP_LABEL[g.group]} ${g.pct} процентов`).join(', ')}`}>
        <T v="small" style={{ fontSize: 12, fontWeight: '800' }} color={colors.text}>
          Мышцы:{' '}
        </T>
        {top.map((g) => `${GROUP_LABEL[g.group]} ${g.pct}%`).join(' · ')}
      </T>
    );
  }
  return (
    <View style={styles.card} testID="target-muscles">
      <View style={{ width: 132 }}>
        <Anatomy primary={t.primary} secondary={t.secondary} sex={sex} scale={0.3} showLegend={false} />
      </View>
      <View style={{ flex: 1, gap: 8, justifyContent: 'center' }}>
        <T v="caption">Целевые мышцы</T>
        {top.map((g, i) => (
          <View key={g.group} style={{ gap: 3 }} accessibilityLabel={`${GROUP_LABEL[g.group]}: ${g.pct} процентов подходов`}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T v="small" color={colors.text} style={{ fontWeight: i === 0 ? '800' : '600' }} numberOfLines={1}>
                {GROUP_LABEL[g.group]}
              </T>
              <T v="small" style={{ fontVariant: ['tabular-nums'], fontWeight: '800' }} color={i === 0 ? colors.accent : colors.textDim}>
                {g.pct}%
              </T>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${g.pct}%`, backgroundColor: i === 0 ? colors.accent : colors.barSoft }]} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
});

const styles = themed({
  card: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.surface3, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3 },
});
