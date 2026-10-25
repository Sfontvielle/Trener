import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Divider, EmptyState, Icon, IconButton, T } from '@/components/ui';
import { Field } from '@/components/inputs';
import { Ambient, Appear } from '@/components/motion';
import { Sheet } from '@/components/Sheet';
import { afterModalClose } from '@/components/modalGate';
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
import { feelIndex, isTimed, KIND_LABEL, repeatPlanned, SESSION_FEEL, sessionKind, setsLine } from '@/features/training/journal';
import { supersetLabels } from '@/features/training/workoutNav';
import { repeatSession } from '@/features/training/actions';
import { useSchedule } from '@/stores/schedule';
import { useUi } from '@/stores/ui';


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
  const [allPrs, setAllPrs] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
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
  const lifted = unit === 'lb' ? v.tonnage * 2.20462 : v.tonnage;
  const feelIdx = feelIndex(s.sessionRpe);
  const kind = sessionKind(s, customs);
  const labels = supersetLabels(s.exercises);
  const delta = Object.fromEntries(progress.map((p) => [p.name, p]));

  const feelSection = (
      <Section title="Как ощущалась тренировка?">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
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
              style={[styles.feel, feelIdx === i && { backgroundColor: colors.text }]}
            >
              <T v="body" style={{ fontWeight: '600', fontSize: 15, textAlign: 'center' }} color={feelIdx === i ? colors.bg : colors.text} numberOfLines={1} adjustsFontSizeToFit>
                {f.emoji} {f.label}
              </T>
            </Pressable>
          ))}
        </View>
        <Field placeholder="Заметка" value={note} onChangeText={setNote} multiline maxLength={400} onBlur={() => note.trim() !== (s.notes ?? '') && useWorkouts.getState().updateSession(s.id, { notes: note.trim() || undefined })} style={{ marginTop: 6 }} />
      </Section>
  );

  return (
    <Screen keyboard>
      <Ambient height={380} />
      <Header
        title={fresh ? 'Тренировка завершена' : ''}
        onBack={() => (fresh ? router.replace('/') : router.back())}
        right={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {/* Разбор тренера — отдельной кнопкой, не в основном потоке */}
            {debrief.lines.length ? <IconButton name="sparkles" label="Разбор тренера" color={colors.accent} onPress={() => setCoachOpen(true)} /> : null}
            <IconButton
              name="trash-outline"
              label="Удалить тренировку"
              onPress={() => confirm('Удалить тренировку?', 'Она пропадёт из истории и статистики.', 'Удалить', () => { useWorkouts.getState().deleteSession(s.id); router.back(); }, true)}
            />
          </View>
        }
      />

      {/* Главное — название, одна строка итога и «Повторить»; три цифры — в ряд */}
      <Appear i={0} style={{ gap: 6 }}>
        <T v="caption">
          {formatDayLong(s.date)} · {KIND_LABEL[kind]}
        </T>
        <T v="hero" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
          {s.name}
        </T>
        <T v="bodyDim">
          {v.sets}
          {planned ? ` из ${planned}` : ''} подходов{debrief.volumeDeltaPct !== null ? ` · объём ${debrief.volumeDeltaPct >= 0 ? '+' : ''}${debrief.volumeDeltaPct}%` : ''}
          {feelIdx >= 0 ? ` · ${SESSION_FEEL[feelIdx].emoji} ${SESSION_FEEL[feelIdx].label}` : ''}
        </T>
      </Appear>
      {!fresh ? (
        <Appear i={1} style={{ marginTop: space.lg, gap: space.sm }}>
          <Button
            title="Повторить"
            icon="repeat"
            size="lg"
            live
            onPress={() => {
              haptic.tap();
              repeatSession(s);
            }}
          />
          {/* Повтор — новая тренировка; эта запись не меняется */}
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <Button title="Запланировать" icon="calendar-outline" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => useUi.getState().openHub({ prefill: { kind: 'session', id: s.id } })} testID="session-plan" />
            <Button
              title="В шаблоны"
              icon="bookmark-outline"
              variant="secondary"
              size="sm"
              style={{ flex: 1 }}
              accessibilityLabel="Сохранить как шаблон"
              testID="session-template"
              onPress={() => {
                const exercises = repeatPlanned(s);
                if (!exercises.length) return;
                useSchedule.getState().saveTemplate({ name: s.name, exercises, color: s.color });
                haptic.success();
                toast(`Шаблон «${s.name}» сохранён`, 'bookmark');
              }}
            />
          </View>
        </Appear>
      ) : null}

      <Appear i={2} style={styles.stats}>
        <BigStat label="Время" value={`${v.durationMin}`} unit="мин" />
        <BigStat label={`Поднято, ${unit === 'lb' ? 'lb' : 'кг'}`} value={fmtNum(lifted)} unit="" />
        <Pressable accessibilityRole="button" accessibilityLabel="Активные калории: как рассчитано" onPress={() => setEnergyOpen(true)} style={styles.stat}>
          <T v="small" numberOfLines={1}>
            Активные калории
          </T>
          <T v="num" style={{ fontSize: 26 }}>
            {energy.kcal < 5 ? '—' : `${energy.source === 'health' ? '' : '≈'}${energy.kcal}`}
            {energy.kcal < 5 ? null : <T v="small">{energy.source === 'health' ? ' ккал' : ' ккал ›'}</T>}
          </T>
        </Pressable>
      </Appear>

      {debrief.prs.length ? (
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: allPrs }} onPress={() => setAllPrs(!allPrs)} style={({ pressed }) => [styles.prLine, pressed && { opacity: 0.6 }]}>
          <T v="body" numberOfLines={allPrs ? undefined : 1} style={{ flex: 1 }}>
            <T v="body" style={{ fontWeight: '700' }}>{`🏆 Новые личные рекорды · ${debrief.prs.length}`}</T>
            {allPrs ? `\n${debrief.prs.join('\n')}` : `  ${debrief.prs[0]}`}
          </T>
          <Icon name={allPrs ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
        </Pressable>
      ) : null}

      {fresh || feelIdx < 0 ? feelSection : null}

      <T v="h3" style={{ marginTop: space.xl, marginBottom: space.sm }}>
        Упражнения
      </T>
      <Card style={{ paddingVertical: 6 }}>
        {/* Как в дневнике: номер, упражнение, все подходы одной строкой; суперсет — общей линией слева */}
        {s.exercises.map((we, i) => {
          const ex = getExercise(we.exerciseId, customs);
          const ws = workingSets(we.sets);
          const timed = isTimed(ex);
          const ss = labels[i];
          return (
            <View key={we.id}>
              {i && !(ss && labels[i - 1] && ss[0] === labels[i - 1]![0]) ? <Divider /> : null}
              <View style={[styles.exRow, ss && styles.exRowSs]} testID="session-exercise">
                {ss ? (
                  <T v="body" style={{ width: 26, fontWeight: '800' }} color={colors.accent}>
                    {ss}
                  </T>
                ) : null}
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="body" style={{ fontWeight: '700' }}>
                    {ex?.name ?? we.exerciseId}
                  </T>
                  <T v="small" color={ws.length ? colors.text : colors.textDim}>
                    {ws.length ? setsLine(we.sets, { unit, timed }) : 'не выполнено'}
                    {ws.length && ws.length < we.plannedSets ? `  (план ${we.plannedSets})` : ''}
                    {timed && ws.length ? `  · всего ${fmtSec(ws.reduce((a, x) => a + x.reps, 0))}` : ''}
                  </T>
                  {/* Запас повторов (RIR), если отмечали */}
                  {!timed && ws.some((x) => x.rir !== undefined) ? (
                    <T v="small" style={{ fontSize: 12 }}>
                      {`Запас: ${ws.map((x) => (x.rir === undefined ? '–' : x.rir >= 4 ? '4+' : String(x.rir))).join(' · ')} повт.`}
                    </T>
                  ) : null}
                </View>
                {/* К прошлому разу — прямо в строке упражнения, без отдельного списка */}
                {delta[ex?.name ?? ''] ? (
                  <T v="body" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }} color={delta[ex!.name].up ? colors.text : delta[ex!.name].text === '=' ? colors.textDim : colors.warning}>
                    {delta[ex!.name].text}
                  </T>
                ) : null}
              </View>
            </View>
          );
        })}
      </Card>
      {!(fresh || feelIdx < 0) ? feelSection : null}
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
      <Sheet visible={coachOpen} onClose={() => setCoachOpen(false)} title={`Тренер ${BRAND}`} subtitle="Разбор этой тренировки">
        <View style={{ gap: 10 }} testID="coach-debrief">
          {debrief.lines.map((l) => (
            <T key={l} v="body" style={{ lineHeight: 22 }}>
              {l}
            </T>
          ))}
          <Button
            title="Обсудить с тренером"
            icon="chatbubbles-outline"
            variant="secondary"
            style={{ marginTop: space.sm }}
            onPress={() => {
              setCoachOpen(false);
              afterModalClose(() => router.push({ pathname: '/coach', params: { q: 'Разбери мою сегодняшнюю тренировку' } }));
            }}
          />
        </View>
      </Sheet>
    </Screen>
  );
}

function BigStat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.stat}>
      <T v="small">{label}</T>
      <T v="num" style={{ fontSize: 28 }}>
        {value}
        {unit ? <T v="small"> {unit}</T> : null}
      </T>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space.xl, gap: 6 }}>
      <T v="h3" style={{ marginBottom: 4 }}>
        {title}
      </T>
      {children}
    </View>
  );
}

const styles = themed({
  stats: { flexDirection: 'row', marginTop: space.xl },
  prLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.xl, paddingVertical: 14, paddingHorizontal: space.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  stat: { flex: 1, gap: 2, paddingRight: 8 },
  feel: { width: '47%', flexGrow: 1, height: 46, borderRadius: radius.pill, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  exRowSs: { borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: 8, marginLeft: -8 },
});
