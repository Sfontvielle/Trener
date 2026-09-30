import React, { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Body, { type ExtendedBodyPart, type Slug } from 'react-native-body-highlighter';
import type { MuscleSlug, Sex } from '@/types';
import { colors, radius } from '@/theme';
import { T } from '@/components/ui';
import { MUSCLE_LABEL } from '@/data/exercises';

const FRONT_ONLY: MuscleSlug[] = ['chest', 'biceps', 'abs', 'obliques', 'quadriceps', 'tibialis'];
const BACK_ONLY: MuscleSlug[] = ['upper-back', 'lower-back', 'gluteal', 'hamstring'];

/**
 * Анатомическая карта: фигура спереди и сзади.
 * Основные мышцы — ярко-зелёные, вспомогательные — оранжевые, остальные — тёмно-серые.
 */
export const Anatomy = memo(function Anatomy({ primary, secondary, sex = 'male', scale = 0.62, showLegend = true }: { primary: MuscleSlug[]; secondary: MuscleSlug[]; sex?: Sex; scale?: number; showLegend?: boolean }) {
  const data = useMemo<ExtendedBodyPart[]>(
    () => [
      ...secondary.filter((s) => !primary.includes(s)).map((s) => ({ slug: s as Slug, intensity: 2 })),
      ...primary.map((s) => ({ slug: s as Slug, intensity: 1 })),
    ],
    [primary, secondary],
  );
  const hasFront = [...primary, ...secondary].some((m) => !BACK_ONLY.includes(m));
  const hasBack = [...primary, ...secondary].some((m) => !FRONT_ONLY.includes(m));
  return (
    <View>
      <View style={styles.row}>
        <View style={[styles.side, !hasFront && { opacity: 0.55 }]}>
          <Body data={data} side="front" gender={sex} scale={scale} colors={[colors.accent, colors.secondaryMuscle]} defaultFill={colors.muscleIdle} border={colors.bg} />
          <T v="caption" style={styles.label}>
            Спереди
          </T>
        </View>
        <View style={[styles.side, !hasBack && { opacity: 0.55 }]}>
          <Body data={data} side="back" gender={sex} scale={scale} colors={[colors.accent, colors.secondaryMuscle]} defaultFill={colors.muscleIdle} border={colors.bg} />
          <T v="caption" style={styles.label}>
            Сзади
          </T>
        </View>
      </View>
      {showLegend ? (
        <View style={{ gap: 8, marginTop: 12 }}>
          <LegendRow color={colors.accent} title="Основные" items={primary.map((m) => MUSCLE_LABEL[m])} />
          {secondary.length ? <LegendRow color={colors.secondaryMuscle} title="Вспомогательные" items={secondary.filter((s) => !primary.includes(s)).map((m) => MUSCLE_LABEL[m])} /> : null}
        </View>
      ) : null}
    </View>
  );
});

function LegendRow({ color, title, items }: { color: string; title: string; items: string[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: color, marginTop: 3 }} />
      <T v="small" color={colors.text} style={{ flex: 1 }}>
        <T v="small" style={{ fontWeight: '800' }} color={colors.text}>
          {title}:{' '}
        </T>
        {items.join(', ')}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.surface2, borderRadius: radius.lg, paddingVertical: 12 },
  side: { alignItems: 'center' },
  label: { marginTop: 4, color: colors.textDim },
});
