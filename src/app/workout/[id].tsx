import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, Icon, IconButton, T } from '@/components/ui';
import { Field } from '@/components/inputs';
import { confirm, toast } from '@/components/Dialog';
import { useWorkouts } from '@/stores/workouts';
import { useProfile } from '@/stores/profile';
import { useBody } from '@/stores/body';
import { useHealth } from '@/stores/health';
import { getExercise } from '@/data/exercises';
import { sessionVolume } from '@/features/training/analytics';
import { workoutDebrief } from '@/features/training/debrief';
import { sessionEnergy } from '@/features/training/energy';
import { historyFor, workingSets } from '@/features/training/progression';
import { latestTrendWeight } from '@/features/progress/weightTrend';
import { EnergySheet } from '@/features/training/EnergySheet';
import { formatDayLong } from '@/utils/date';
import { fmtNum, fmtSec, fmtWeight } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';
import { feelIndex, isTimed, KIND_COLOR, KIND_LABEL, SESSION_FEEL, sessionKind, setsLine } from '@/features/training/journal';
import { supersetLabels } from '@/features/training/workoutNav';
import { repeatSession } from '@/features/training/actions';
import { ExerciseThumb } from '@/features/exercises/ExerciseThumb';


export default function SessionDetail() {
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const sessions = useWorkouts((s) => s.sessions);
  const customs = useWorkouts((s) => s.customExercises);
  const unit = useProfile((s) => s.settings.weightUnit);
  const profileW = useProfile((s) => s.profile?.weightKg ?? 75);
  const weights = useBody((s) => s.weights);
  const healthDays = useHealth((s) => s.days);
  const s = sessions.find((x) => x.id === id);
  const [energyOpen, setEnergyOpen] = useState(false);
  const [note, setNote] = useState(s?.notes ?? '');

  const debrief = useMemo(() => (s ? workoutDebrief(s, sessions, customs) : null), [s, sessions, customs]);
  const bodyW = latestTrendWeight(weights) ?? profileW;
  // Если часы досинхронизировали тренировку — показываем измеренное, иначе сохранённую оценку
  const energy = useMemo(() => (s ? sessionEnergy(s, bodyW, healthDays, customs) : null), [s, bodyW, healthDays, customs]);
  const progress = useMemo(() => {
    if (!s) return [];
    const before = sessions.filter((x) => x.id !== s.id && x.status === 'completed' && (x.finishedAt ?? x.startedAt) < s.startedAt);
    return s.exercises
      .map((we) => {
        const ex = getExercise(we.exerciseId, customs);
        const ws = workingSets(we.sets);
        const prev = historyFor(we.exerciseId, before, 1)[0];
        if (!ex || !ws.length || !prev) return null;
        const top = Math.max(...ws.map((x) => x.weight));
        const prevTop = Math.max(...prev.sets.map((x) => x.weight));
        const reps = ws.reduce((a, x) => a + x.reps, 0);
        const prevReps = prev.sets.reduce((a, x) => a + x.reps, 0);
        const text = top > prevTop ? `+${fmtWeight(top - prevTop, unit)} ${unit === 'lb' ? 'lb' : 'кг'}` : top === prevTop && reps > prevReps ? `+${reps - prevReps} повт.` : top < prevTop ? `−${fmtWeight(prevTop - top, unit)} ${unit === 'lb' ? 'lb' : 'кг'}` : '=';
        return { name: ex.name, text, up: text.startsWith('+') };
      })
      .filter((x): x is { name: string; text: string; up: boolean } => !!x);
  }, [s, sessions, customs, unit]);

  if (!s || !debrief || !energy) {
    return (
      <Screen>
        <Header title="Тренировка" />
        <EmptyState icon="alert-circle-outline" title="Тренировка не найдена" text="Возможно, она была удалена." />
      </Screen>
    );
  }
  const v = sessionVolume(s);
  const planned = s.exercises.reduce((a, e) => a + e.plannedSets, 0);
  const doneEx = s.exercises.filter((we) => workingSets(we.sets).length > 0).length;
  const lifted = unit === 'lb' ? v.tonnage * 2.20462 : v.tonnage;
  const feelIdx = feelIndex(s.sessionRpe);
  const kind = sessionKind(s, customs);
  const labels = supersetLabels(s.exercises);

  return (
    <Screen keyboard>
      <Header
        title={fresh ? 'Тренировка завершена' : s.name}
        subtitle={`${formatDayLong(s.date)}${s.focus ? ` · ${s.focus}` : ''}`}
        onBack={() => (fresh ? router.replace('/') : router.back())}
        right={
          <IconButton
            name="trash-outline"
            label="Удалить тренировку"
            onPress={() => confirm('Удалить тренировку?', 'Она пропадёт из истории и статистики.', 'Удалить', () => { useWorkouts.getState().deleteSession(s.id); router.back(); }, true)}
          />
        }
      />

      <View style={styles.hero}>
        <Icon name="trophy" size={34} color={colors.accent} />
        <T v="h1" style={{ textAlign: 'center' }}>
          {s.name}
        </T>
        <T v="small" style={{ textAlign: 'center' }}>
          {debrief.prs.length ? `Новых рекордов: ${debrief.prs.length}` : debrief.volumeDeltaPct !== null ? `Объём ${debrief.volumeDeltaPct >= 0 ? '+' : ''}${debrief.volumeDeltaPct}% к прошлой такой же` : 'Тренировка записана'}
        </T>
        <View style={[styles.kind, { borderColor: colors[KIND_COLOR[kind]] }]}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[KIND_COLOR[kind]] }} />
          <T v="small" style={{ fontSize: 11, fontWeight: '800' }} color={colors.text}>
            {KIND_LABEL[kind]}
          </T>
        </View>
        {!fresh ? (
          <Button
            title="Повторить"
            icon="repeat"
            size="sm"
            onPress={() => {
              haptic.tap();
              repeatSession(s);
            }}
            style={{ marginTop: 8, minWidth: 170 }}
          />
        ) : null}
        {!fresh ? (
          <T v="small" style={{ fontSize: 11, textAlign: 'center' }}>
            Те же упражнения и подходы — веса подберёт тренер
          </T>
        ) : null}
      </View>

      <View style={styles.grid}>
        <Stat label="Время" value={`${v.durationMin}`} unit="мин" />
        <Stat label="Упражнений" value={`${doneEx}`} unit={`из ${s.exercises.length}`} />
        <Stat label="Подходов" value={`${v.sets}`} unit={planned ? `из ${planned}` : ''} />
        <Stat label={`Поднято, ${unit === 'lb' ? 'lb' : 'кг'}`} value={fmtNum(lifted)} unit="" />
        <Pressable accessibilityRole="button" accessibilityLabel="Активные калории: как рассчитано" onPress={() => setEnergyOpen(true)} style={[styles.stat, { flexGrow: 2 }]}>
          <T v="caption" style={{ fontSize: 10 }}>
            Активные калории
          </T>
          <T v="num" style={{ fontSize: 22 }}>
            {energy.kcal < 5 ? '—' : `${energy.source === 'health' ? '' : '≈ '}${energy.kcal}`}
            {energy.kcal < 5 ? null : <T v="small"> ккал</T>}
          </T>
          <T v="small" color={colors.accent} style={{ fontSize: 11, fontWeight: '800' }}>
            {energy.source === 'health' ? 'Apple Health · как рассчитано?' : 'оценка · как рассчитано?'}
          </T>
        </Pressable>
      </View>

      {debrief.prs.length ? (
        <Card tone="accent" style={{ marginTop: space.md, gap: 6 }}>
          <T v="caption" color={colors.accent}>
            Новые личные рекорды
          </T>
          {debrief.prs.map((p) => (
            <View key={p} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Icon name="trophy-outline" size={16} color={colors.accent} />
              <T v="body">{p}</T>
            </View>
          ))}
        </Card>
      ) : null}

      {progress.length ? (
        <Card style={{ marginTop: space.md, gap: 6 }}>
          <T v="caption">Относительно прошлого раза</T>
          {progress.map((p) => (
            <View key={p.name} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <T v="body" style={{ flex: 1, fontSize: 14 }} numberOfLines={2}>
                {p.name}
              </T>
              <T v="body" style={{ fontWeight: '800', fontSize: 14 }} color={p.up ? colors.accent : p.text === '=' ? colors.textDim : colors.warning}>
                {p.text}
              </T>
            </View>
          ))}
        </Card>
      ) : null}

      {debrief.lines.length ? (
        <Card style={{ marginTop: space.md, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="sparkles" size={16} color={colors.accent} />
            <T v="caption" color={colors.accent}>
              Тренер {BRAND}
            </T>
          </View>
          {debrief.lines.map((l) => (
            <T key={l} v="body" color={colors.text}>
              {l}
            </T>
          ))}
          <Button title="Разобрать с тренером" size="sm" variant="secondary" onPress={() => router.push({ pathname: '/coach', params: { q: 'Разбери мою сегодняшнюю тренировку' } })} />
        </Card>
      ) : null}

      <Card style={{ marginTop: space.md, gap: 10 }}>
        <T v="caption">Как ощущалась тренировка?</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {SESSION_FEEL.map((f, i) => (
            <Pressable
              key={f.label}
              accessibilityRole="button"
              accessibilityLabel={f.label}
              accessibilityState={{ selected: feelIdx === i }}
              onPress={() => {
                haptic.tap();
                useWorkouts.getState().updateSession(s.id, { sessionRpe: f.rpe });
              }}
              style={[styles.feel, feelIdx === i && { backgroundColor: i === 3 ? colors.warning : colors.accent, borderColor: 'transparent' }]}
            >
              <T v="small" style={{ fontWeight: '800', fontSize: 12, textAlign: 'center' }} color={feelIdx === i ? colors.onAccent : colors.text} numberOfLines={1} adjustsFontSizeToFit>
                {f.emoji} {f.label}
              </T>
            </Pressable>
          ))}
        </View>
        <T v="small" style={{ fontSize: 11 }}>
          Необязательно — {BRAND} учтёт это в восстановлении и нагрузке на следующих тренировках.
        </T>
        <Field placeholder="Заметка: самочувствие, техника, что заметил" value={note} onChangeText={setNote} multiline maxLength={400} onBlur={() => note.trim() !== (s.notes ?? '') && useWorkouts.getState().updateSession(s.id, { notes: note.trim() || undefined })} />
      </Card>

      <Card style={{ marginTop: space.md, paddingVertical: 6 }}>
        {/* Как в дневнике: номер, упражнение, все подходы одной строкой; суперсет — общей линией слева */}
        {s.exercises.map((we, i) => {
          const ex = getExercise(we.exerciseId, customs);
          const ws = workingSets(we.sets);
          const kcal = energy.perExercise[we.exerciseId];
          const timed = isTimed(ex);
          const ss = labels[i];
          return (
            <View key={we.id}>
              {i && !(ss && labels[i - 1] && ss[0] === labels[i - 1]![0]) ? <Divider /> : null}
              <View style={[styles.exRow, ss && styles.exRowSs]} testID="session-exercise">
                <T v="body" style={{ width: 26, fontWeight: '800' }} color={ss ? colors.accent : colors.textDim}>
                  {ss ?? i + 1}
                </T>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="body" style={{ fontWeight: '700' }}>
                    {ex?.name ?? we.exerciseId}
                  </T>
                  <T v="small" color={ws.length ? colors.text : colors.textDim}>
                    {ws.length ? setsLine(we.sets, { unit, timed }) : 'не выполнено'}
                    {ws.length && ws.length < we.plannedSets ? `  (план ${we.plannedSets})` : ''}
                  </T>
                  {kcal ? (
                    <T v="small" style={{ fontSize: 11 }}>
                      ≈{kcal} ккал{timed && ws.length ? ` · всего ${fmtSec(ws.reduce((a, x) => a + x.reps, 0))}` : ''}
                    </T>
                  ) : null}
                </View>
                {ex ? <ExerciseThumb ex={ex} size={44} /> : null}
              </View>
            </View>
          );
        })}
      </Card>
      {fresh ? (
        <Button
          title="Готово"
          icon="checkmark"
          size="lg"
          onPress={() => {
            if (note.trim() !== (s.notes ?? '')) useWorkouts.getState().updateSession(s.id, { notes: note.trim() || undefined });
            toast('Тренировка сохранена');
            router.replace('/');
          }}
          style={{ marginTop: space.lg }}
        />
      ) : null}
      <EnergySheet visible={energyOpen} onClose={() => setEnergyOpen(false)} energy={energy} weightKg={bodyW} />
    </Screen>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.stat}>
      <T v="caption" style={{ fontSize: 10 }}>
        {label}
      </T>
      <T v="num" style={{ fontSize: 22 }}>
        {value}
        {unit ? <T v="small"> {unit}</T> : null}
      </T>
    </View>
  );
}

const styles = themed({
  hero: { alignItems: 'center', gap: 4, paddingVertical: space.lg, paddingHorizontal: space.md, borderRadius: radius.xl, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: space.md },
  stat: { flexGrow: 1, minWidth: '30%', padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 2 },
  kind: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  exRowSs: { borderLeftWidth: 3, borderLeftColor: colors.accent, paddingLeft: 8, marginLeft: -8 },
  feel: { width: '48%', flexGrow: 1, height: 44, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
});
