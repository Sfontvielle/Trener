import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, radius, space } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Banner, Button, EmptyState, Icon, T } from '@/components/ui';
import { usePlan } from '@/stores/plan';
import { useWorkouts } from '@/stores/workouts';
import { useTodayWorkout, useReadiness } from '@/hooks/useToday';
import { getExercise } from '@/data/exercises';
import { historyFor, recommend } from '@/features/training/progression';
import { startTodayPlanned } from '@/features/training/actions';
import { MODE_LABEL } from '@/features/training/today';
import { fmtWeight } from '@/utils/format';
import { useProfile } from '@/stores/profile';

/** Состав тренировки перед стартом: упражнения, рекомендации по весам, режим дня */
export default function Preview() {
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  const plan = usePlan((s) => s.plan);
  const sessions = useWorkouts((s) => s.sessions);
  const unit = useProfile((s) => s.settings.weightUnit);
  const tw = useTodayWorkout();
  const readiness = useReadiness();
  const tpl = plan?.templates.find((t) => t.id === templateId);
  const isToday = tw.template?.id === tpl?.id;
  const vf = isToday ? tw.volumeFactor : 1;

  const rows = useMemo(
    () =>
      (tpl?.exercises ?? []).map((pe) => {
        const ex = getExercise(pe.exerciseId);
        if (!ex) return null;
        const rec = recommend({ exercise: ex, plannedSets: pe.sets, repMin: pe.repMin, repMax: pe.repMax, targetRir: pe.targetRir, history: historyFor(ex.id, sessions, 3), band: isToday ? readiness?.band : undefined, volumeFactor: vf, rirDelta: isToday ? tw.rirDelta : 0 });
        return { pe, ex, rec };
      }).filter(Boolean) as { pe: any; ex: NonNullable<ReturnType<typeof getExercise>>; rec: ReturnType<typeof recommend> }[],
    [tpl, sessions, readiness, vf, isToday, tw.rirDelta],
  );

  if (!tpl) {
    return (
      <Screen>
        <Header title="Тренировка" />
        <EmptyState icon="alert-circle-outline" title="Шаблон не найден" text="Возможно, план был перестроен." />
      </Screen>
    );
  }
  return (
    <Screen>
      <Header title={tpl.name} subtitle={tpl.focus} right={<Button title="Изменить" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/workout/builder', params: { templateId: tpl.id } })} />} />
      {isToday && tw.mode !== 'normal' ? <Banner tone="warning" icon="battery-half" text={`${MODE_LABEL[tw.mode]}: ${tw.reason ?? ''}`} /> : null}
      <View style={{ gap: 10, marginTop: space.md }}>
        {rows.map(({ pe, ex, rec }, i) => (
          <Pressable key={i} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: ex.id } })} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 14, flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <T v="body" style={{ fontWeight: '700' }} numberOfLines={2}>
                {ex.name}
              </T>
              <T v="small">
                {rec.sets} × {rec.repMin}–{rec.repMax}
                {rec.weight > 0 ? ` · ${fmtWeight(rec.weight, unit)} ${unit === 'lb' ? 'lb' : 'кг'}` : ''} · RIR {rec.targetRir}
              </T>
              <T v="small" style={{ fontSize: 12 }} numberOfLines={2}>
                {rec.rationale}
              </T>
            </View>
            <Icon name={rec.action === 'increase' ? 'trending-up' : 'chevron-forward'} size={18} color={rec.action === 'increase' ? colors.accent : colors.muted} />
          </Pressable>
        ))}
      </View>
      <Button title={isToday ? 'Начать' : `Сделать ${tpl.name} сейчас`} icon="play" size="lg" style={{ marginTop: space.lg }} onPress={() => startTodayPlanned(isToday ? undefined : tpl)} />
    </Screen>
  );
}
