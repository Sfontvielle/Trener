import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Button, EmptyState, IconButton, T } from '@/components/ui';
import { Ambient, Appear } from '@/components/motion';
import { usePlan } from '@/stores/plan';
import { useWorkouts } from '@/stores/workouts';
import { useTodayWorkout, useReadiness } from '@/hooks/useToday';
import { getExercise } from '@/data/exercises';
import { historyFor, recommend } from '@/features/training/progression';
import { startTodayPlanned } from '@/features/training/actions';
import { MODE_LABEL } from '@/features/training/today';
import { fmtWeight } from '@/utils/format';
import { useProfile } from '@/stores/profile';
import { scaleSets } from '@/features/training/scale';
import { ExerciseThumb } from '@/features/exercises/ExerciseThumb';
import { TargetMuscles } from '@/features/exercises/TargetMuscles';

/** Состав тренировки перед стартом: упражнения, рекомендации по весам, режим дня */
export default function Preview() {
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  const plan = usePlan((s) => s.plan);
  const sessions = useWorkouts((s) => s.sessions);
  const unit = useProfile((s) => s.settings.weightUnit);
  const sex = useProfile((s) => s.profile?.sex);
  const tw = useTodayWorkout();
  const readiness = useReadiness();
  const tpl = plan?.templates.find((t) => t.id === templateId);
  const isToday = tw.template?.id === tpl?.id;
  const vf = isToday ? tw.volumeFactor : 1;

  const rows = useMemo(
    () =>
      (tpl?.exercises ?? []).map((pe, i, all) => {
        const ex = getExercise(pe.exerciseId);
        if (!ex) return null;
        const sets = scaleSets(all.map((x) => x.sets), vf)[i];
        const rec = recommend({ exercise: ex, plannedSets: sets, repMin: pe.repMin, repMax: pe.repMax, targetRir: pe.targetRir, history: historyFor(ex.id, sessions, 3), band: isToday ? readiness?.band : undefined, rirDelta: isToday ? tw.rirDelta : 0 });
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
  const totalSets = rows.reduce((a, r) => a + r.rec.sets, 0);
  return (
    <Screen>
      <Ambient height={380} />
      <Header title="" right={<IconButton name="create-outline" label="Изменить тренировку" onPress={() => router.push({ pathname: '/workout/builder', params: { templateId: tpl.id } })} />} />
      {/* Главное — имя тренировки и одна строка параметров; ниже — одна кнопка и состав простым списком */}
      <Appear i={0} style={{ gap: 6 }}>
        <T v="caption">{isToday ? 'Сегодня' : 'Тренировка плана'}{isToday && tw.mode !== 'normal' ? <T v="caption" color={colors.warning}>{` · ${MODE_LABEL[tw.mode].toLowerCase()}`}</T> : null}</T>
        <T v="hero" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
          {tpl.name}
        </T>
        <T v="bodyDim">
          ~{isToday && tw.estMinutes ? tw.estMinutes : tpl.estMinutes} мин · {rows.length} упражнений · {totalSets} подходов
        </T>
        {isToday && tw.mode !== 'normal' && tw.reason ? <T v="small">{tw.reason}</T> : null}
      </Appear>
      <Appear i={1} style={{ marginTop: space.xl }}>
        <Button title={isToday ? 'Начать' : `Сделать ${tpl.name} сейчас`} icon="play" size="lg" live onPress={() => startTodayPlanned(isToday ? undefined : tpl)} />
      </Appear>
      <Appear i={2} style={{ marginTop: space.xl }}>
        {rows.map(({ ex, rec }, i) => (
          <Pressable key={i} accessibilityRole="button" onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: ex.id } })} style={({ pressed }) => [styles.row, i < rows.length - 1 && styles.line, pressed && { opacity: 0.6 }]}>
            <ExerciseThumb ex={ex} size={44} />
            <T v="body" style={{ flex: 1, fontWeight: '600' }} numberOfLines={2}>
              {ex.name}
              <T v="small" style={{ fontVariant: ['tabular-nums'], fontWeight: '500' }}>
                {`\n${rec.sets} × ${rec.repMin}–${rec.repMax}${rec.weight > 0 ? ` · ${fmtWeight(rec.weight, unit)} ${unit === 'lb' ? 'lb' : 'кг'}` : ''}${rec.delta && rec.action !== 'new' && rec.action !== 'hold' ? ` · ${rec.delta}` : ''}`}
              </T>
            </T>
          </Pressable>
        ))}
      </Appear>
      {/* Целевые мышцы — справка ниже состава */}
      <View style={{ marginTop: space.xl }}>
        <TargetMuscles items={rows.map(({ pe, rec }) => ({ exerciseId: pe.exerciseId, sets: rec.sets }))} sex={sex} />
      </View>
    </Screen>
  );
}

const styles = themed({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  line: { borderBottomWidth: 0.5, borderBottomColor: colors.borderStrong },
});
