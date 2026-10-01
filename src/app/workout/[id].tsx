import React, { useMemo } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, space } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, Icon, IconButton, Stat, T } from '@/components/ui';
import { confirm } from '@/components/Dialog';
import { useWorkouts } from '@/stores/workouts';
import { useProfile } from '@/stores/profile';
import { getExercise } from '@/data/exercises';
import { sessionVolume } from '@/features/training/analytics';
import { workoutDebrief } from '@/features/training/debrief';
import { bestSet, historyFor, isPersonalRecord, workingSets } from '@/features/training/progression';
import { formatDayLong } from '@/utils/date';
import { fmtNum, fmtWeight } from '@/utils/format';

export default function SessionDetail() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const sessions = useWorkouts((s) => s.sessions);
  const unit = useProfile((s) => s.settings.weightUnit);
  const s = sessions.find((x) => x.id === id);

  const prs = useMemo(() => {
    if (!s) return [];
    const before = sessions.filter((x) => x.id !== s.id && x.startedAt < s.startedAt);
    const out: string[] = [];
    for (const we of s.exercises) {
      const ex = getExercise(we.exerciseId);
      if (!ex) continue;
      const hist = historyFor(ex.id, before, 20);
      const b = bestSet(we.sets);
      const set = workingSets(we.sets).find((x) => b && x.weight === b.weight && x.reps === b.reps);
      if (set && isPersonalRecord(ex, set, hist)) out.push(`${ex.name}: ${set.weight ? `${fmtWeight(set.weight, unit)} × ${set.reps}` : `${set.reps} повт.`}`);
    }
    return out;
  }, [s, sessions, unit]);

  if (!s) {
    return (
      <Screen>
        <Header title="Тренировка" />
        <EmptyState icon="alert-circle-outline" title="Тренировка не найдена" text="Возможно, она была удалена." />
      </Screen>
    );
  }
  const v = sessionVolume(s);
  const debrief = workoutDebrief(s, sessions);
  const planned = s.exercises.reduce((a, e) => a + e.plannedSets, 0);

  return (
    <Screen>
      <Header
        title={fresh ? 'Тренировка завершена' : s.name}
        subtitle={`${formatDayLong(s.date)} · ${s.focus}`}
        onBack={() => (fresh ? router.replace('/') : router.back())}
        right={
          <IconButton
            name="trash-outline"
            label="Удалить тренировку"
            onPress={() => confirm('Удалить тренировку?', 'Она пропадёт из истории и статистики.', 'Удалить', () => { useWorkouts.getState().deleteSession(s.id); router.back(); }, true)}
          />
        }
      />
      {fresh ? (
        <Card tone="accent" style={{ alignItems: 'center', gap: 6, paddingVertical: space.xl }}>
          <Icon name="trophy" size={40} color={colors.accent} />
          <T v="h1">Тренировка завершена</T>
          <T v="small" style={{ textAlign: 'center' }}>
            {debrief.minutes} мин · {debrief.sets} рабочих подходов{debrief.volumeDeltaPct !== null ? ` · объём ${debrief.volumeDeltaPct >= 0 ? '+' : ''}${debrief.volumeDeltaPct}%` : ''}{debrief.prs.length ? ` · рекордов: ${debrief.prs.length}` : ''}
          </T>
        </Card>
      ) : null}
      {debrief.lines.length ? (
        <Card style={{ marginTop: space.md, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="sparkles" size={16} color={colors.accent} />
            <T v="caption" color={colors.accent}>
              FORM Coach
            </T>
          </View>
          {debrief.lines.map((l) => (
            <T key={l} v="body" color={colors.text}>
              {l}
            </T>
          ))}
          <Button title="Спросить тренера" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/coach', params: { q: 'Разбери мою сегодняшнюю тренировку' } })} />
        </Card>
      ) : null}
      <Card style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space.md }}>
        <Stat label="Время" value={String(v.durationMin)} unit="мин" />
        <Stat label="Подходы" value={`${v.sets}`} sub={planned ? `из ${planned}` : undefined} />
        <Stat label="Тоннаж" value={fmtNum(unit === 'lb' ? v.tonnage * 2.20462 : v.tonnage)} unit={unit === 'lb' ? 'lb' : 'кг'} />
        {s.sessionRpe ? <Stat label="RPE" value={String(s.sessionRpe)} /> : null}
      </Card>
      {prs.length ? (
        <Card tone="accent" style={{ marginTop: space.md, gap: 6 }}>
          <T v="caption" color={colors.accent}>
            Личные рекорды
          </T>
          {prs.map((p) => (
            <View key={p} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Icon name="trophy-outline" size={16} color={colors.accent} />
              <T v="body">{p}</T>
            </View>
          ))}
        </Card>
      ) : null}
      <Card style={{ marginTop: space.md, paddingVertical: 6 }}>
        {s.exercises.map((we, i) => {
          const ex = getExercise(we.exerciseId);
          const ws = workingSets(we.sets);
          return (
            <View key={we.id}>
              {i ? <Divider /> : null}
              <View style={{ paddingVertical: 10, gap: 2 }}>
                <T v="body" style={{ fontWeight: '700' }}>
                  {ex?.name ?? we.exerciseId}
                </T>
                <T v="small">
                  {ws.length ? ws.map((x) => `${x.weight ? `${fmtWeight(x.weight, unit)}×` : ''}${x.reps}${x.feel === 'hard' ? '!' : ''}`).join('  ·  ') : 'не выполнено'}
                  {ws.length < we.plannedSets ? `  (план ${we.plannedSets})` : ''}
                </T>
              </View>
            </View>
          );
        })}
      </Card>
      {s.notes ? (
        <Card style={{ marginTop: space.md }}>
          <T v="caption">Заметка</T>
          <T v="body" style={{ marginTop: 4 }}>
            {s.notes}
          </T>
        </Card>
      ) : null}
      {fresh ? <Button title="На главную" size="lg" onPress={() => router.replace('/')} style={{ marginTop: space.lg }} /> : null}
    </Screen>
  );
}
