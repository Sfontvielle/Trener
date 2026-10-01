import React, { memo, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Exercise, ExerciseSet, SetFeel, WorkoutExercise } from '@/types';
import { colors, radius, space } from '@/theme';
import { Button, EmptyState, Icon, IconButton, T } from '@/components/ui';
import { Bar } from '@/components/charts';
import { Sheet } from '@/components/Sheet';
import { Field } from '@/components/inputs';
import { confirm, toast } from '@/components/Dialog';
import { useWorkouts, hasProgress } from '@/stores/workouts';
import { useProfile } from '@/stores/profile';
import { useCheckins } from '@/stores/checkins';
import { getExercise } from '@/data/exercises';
import { historyFor, isPersonalRecord } from '@/features/training/progression';
import { alternativesFor } from '@/features/training/planGenerator';
import { makeWorkoutExercise } from '@/features/training/session';
import { readinessFor } from '@/features/recovery/derive';
import { ExercisePickerSheet } from '@/features/exercises/ExercisePickerSheet';
import { prefetchExerciseMedia } from '@/features/exercises/ExerciseMedia';
import { RestTimerBar } from '@/features/training/RestTimer';
import { platesPerSide, usesBarbell, warmupSets } from '@/features/training/warmup';
import { formatDuration, today } from '@/utils/date';
import { fmtWeight, fromDisplayWeight, parseDecimal, toDisplayWeight, unitLabel } from '@/utils/format';
import { haptic } from '@/services/haptics';

const FEEL_RIR: Record<SetFeel, number> = { easy: 3, ok: 2, hard: 0 };

export default function ActiveWorkout() {
  const insets = useSafeAreaInsets();
  const active = useWorkouts((s) => s.active);
  const sessions = useWorkouts((s) => s.sessions);
  const customs = useWorkouts((s) => s.customExercises);
  const unit = useProfile((s) => s.settings.weightUnit);
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'swap'; weId: string } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [finishOpen, setFinishOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    active?.exercises.forEach((we) => {
      const ex = getExercise(we.exerciseId, customs);
      if (ex) prefetchExerciseMedia(ex);
    });
    // только при открытии
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  if (!active) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 40, padding: space.lg }}>
        <EmptyState icon="barbell-outline" title="Нет активной тренировки" text="Начни тренировку через кнопку «+» внизу." action="На главную" onAction={() => router.replace('/')} />
      </View>
    );
  }

  const total = active.exercises.reduce((a, e) => a + e.sets.length, 0);
  const done = active.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  const menuWe = active.exercises.find((e) => e.id === menuFor);
  const swapWe = picker?.mode === 'swap' ? active.exercises.find((e) => e.id === picker.weId) : undefined;

  const ctx = () => {
    const r = readinessFor(today(), useCheckins.getState().byDate, sessions);
    return { sessions, customs, band: r?.band, volumeFactor: 1, rirDelta: 0 };
  };

  const onPick = (ex: Exercise) => {
    const st = useWorkouts.getState();
    if (picker?.mode === 'swap' && swapWe) {
      const we = makeWorkoutExercise({ exerciseId: ex.id, sets: swapWe.plannedSets, repMin: swapWe.repMin, repMax: swapWe.repMax, targetRir: swapWe.targetRir, restSec: swapWe.restSec }, ctx());
      if (we) st.replaceExercise(swapWe.id, { ...we, sets: we.sets.map((s, i) => swapWe.sets[i]?.done ? swapWe.sets[i] : s) });
      toast(`Заменено на «${ex.name}»`, 'swap-horizontal');
    } else {
      const [repMin, repMax] = ex.defaultReps;
      const we = makeWorkoutExercise({ exerciseId: ex.id, sets: 3, repMin, repMax, targetRir: 2, restSec: ex.mechanic === 'compound' ? 120 : 75 }, ctx());
      if (we) st.addExercise(we);
      toast(`Добавлено: ${ex.name}`, 'add-circle');
    }
    setPicker(null);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <IconButton name="chevron-down" label="Свернуть тренировку" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <T v="h3" numberOfLines={1}>
            {active.name}
          </T>
          <T v="small" style={{ fontVariant: ['tabular-nums'] }}>
            {formatDuration((now - active.startedAt) / 1000)} · {done}/{total} подходов
          </T>
        </View>
        <Button title="Готово" size="sm" onPress={() => setFinishOpen(true)} />
      </View>
      <Bar progress={total ? done / total : 0} height={3} style={{ borderRadius: 0 }} />

      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 120, gap: space.md }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {active.volumeFactor < 1 ? (
          <View style={styles.note}>
            <Icon name="battery-half" size={16} color={colors.warning} />
            <T v="small" color={colors.text} style={{ flex: 1 }}>
              Объём снижен до {Math.round(active.volumeFactor * 100)}% по готовности. Веса без повышения.
            </T>
          </View>
        ) : null}
        {active.exercises.map((we, idx) => (
          <ExerciseBlock key={we.id} we={we} index={idx} unit={unit} onMenu={() => setMenuFor(we.id)} />
        ))}
        {active.exercises.length === 0 ? <EmptyState icon="add-circle-outline" title="Пока пусто" text="Добавь первое упражнение." /> : null}
        <Button title="Добавить упражнение" icon="add" variant="secondary" onPress={() => setPicker({ mode: 'add' })} />
        <Button title="Завершить тренировку" icon="flag" size="lg" onPress={() => setFinishOpen(true)} style={{ marginTop: space.sm }} />
      </ScrollView>

      <RestTimerBar bottom={insets.bottom + 12} />

      <Sheet visible={!!menuWe} onClose={() => setMenuFor(null)} title={menuWe ? getExercise(menuWe.exerciseId, customs)?.name : ''}>
        {menuWe ? (
          <View style={{ gap: 8 }}>
            <MenuRow icon="information-circle-outline" label="Техника и мышцы" onPress={() => { setMenuFor(null); router.push({ pathname: '/exercise/[id]', params: { id: menuWe.exerciseId } }); }} />
            <MenuRow icon="swap-horizontal" label="Заменить упражнение" onPress={() => { const id = menuWe.id; setMenuFor(null); setTimeout(() => setPicker({ mode: 'swap', weId: id }), 250); }} />
            <MenuRow icon="arrow-up" label="Переместить выше" onPress={() => { useWorkouts.getState().moveExercise(menuWe.id, -1); setMenuFor(null); }} />
            <MenuRow icon="arrow-down" label="Переместить ниже" onPress={() => { useWorkouts.getState().moveExercise(menuWe.id, 1); setMenuFor(null); }} />
            <MenuRow
              icon="trash-outline"
              label="Удалить из тренировки"
              danger
              onPress={() => {
                const id = menuWe.id;
                setMenuFor(null);
                confirm('Удалить упражнение?', 'Выполненные в нём подходы тоже удалятся.', 'Удалить', () => useWorkouts.getState().removeExercise(id), true);
              }}
            />
          </View>
        ) : null}
      </Sheet>

      <ExercisePickerSheet
        visible={!!picker}
        onClose={() => setPicker(null)}
        onPick={onPick}
        title={picker?.mode === 'swap' ? 'Заменить на…' : 'Добавить упражнение'}
        excludeIds={active.exercises.map((e) => e.exerciseId)}
        header={swapWe ? <SwapSuggestions exerciseId={swapWe.exerciseId} onPick={onPick} /> : undefined}
      />

      <FinishSheet visible={finishOpen} onClose={() => setFinishOpen(false)} />
    </View>
  );
}

function SwapSuggestions({ exerciseId, onPick }: { exerciseId: string; onPick: (e: Exercise) => void }) {
  const profile = useProfile((s) => s.profile);
  const customs = useWorkouts((s) => s.customExercises);
  const alts = useMemo(() => (profile ? alternativesFor(exerciseId, profile, customs).slice(0, 4) : []), [exerciseId, profile, customs]);
  if (!alts.length) return <View />;
  return (
    <View style={{ gap: 6 }}>
      <T v="caption">Похожие по движению</T>
      {alts.map((a) => (
        <Pressable key={a.id} onPress={() => onPick(a)} style={styles.alt}>
          <Icon name="swap-horizontal" size={16} color={colors.accent} />
          <T v="body" numberOfLines={1} style={{ flex: 1 }}>
            {a.name}
          </T>
        </Pressable>
      ))}
    </View>
  );
}

function MenuRow({ icon, label, onPress, danger }: { icon: React.ComponentProps<typeof Icon>['name']; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={20} color={danger ? colors.danger : colors.text} />
      <T v="body" color={danger ? colors.danger : colors.text}>
        {label}
      </T>
    </Pressable>
  );
}

const ExerciseBlock = memo(function ExerciseBlock({ we, index, unit, onMenu }: { we: WorkoutExercise; index: number; unit: 'kg' | 'lb'; onMenu: () => void }) {
  const customs = useWorkouts((s) => s.customExercises);
  const sessions = useWorkouts((s) => s.sessions);
  const ex = getExercise(we.exerciseId, customs);
  const history = useMemo(() => (ex ? historyFor(ex.id, sessions, 3) : []), [ex, sessions]);
  if (!ex) return null;
  const last = history[0];
  const rec = we.recommendation;
  const allDone = we.sets.length > 0 && we.sets.every((s) => s.done);
  const isBw = ex.bodyweight;

  const completeSet = (set: ExerciseSet) => {
    const st = useWorkouts.getState();
    if (set.done) {
      st.updateSet(we.id, set.id, { done: false, completedAt: undefined, feel: undefined, rir: undefined });
      return;
    }
    if (set.reps <= 0) {
      toast('Укажи количество повторений', 'alert-circle');
      return;
    }
    const prevDone = [...we.sets].reverse().find((s) => s.done && s.completedAt);
    st.updateSet(we.id, set.id, { done: true, completedAt: Date.now(), restSec: prevDone?.completedAt ? Math.round((Date.now() - prevDone.completedAt) / 1000) : undefined });
    haptic.setDone();
    // Переносим вес/повторы в следующий невыполненный подход, если он не редактировался
    const i = we.sets.findIndex((s) => s.id === set.id);
    const next = we.sets[i + 1];
    if (next && !next.done && next.weight !== set.weight && next.weight === (rec?.weight ?? 0)) st.updateSet(we.id, next.id, { weight: set.weight });
    if (isPersonalRecord(ex, { ...set, done: true }, history)) {
      haptic.record();
      toast(`Новый рекорд: ${ex.name} ${set.weight ? `${fmtWeight(set.weight)} × ${set.reps}` : `${set.reps} повт.`}`, 'trophy');
    }
    const s = useProfile.getState().settings;
    const isLast = we.sets.filter((x) => !x.done).length <= 1;
    if (s.restTimerAuto) {
      st.startRest(we.restSec || s.defaultRestSec, isLast ? 'следующее упражнение' : ex.name);
      haptic.timerStart();
    }
  };

  return (
    <View style={[styles.block, allDone && { borderColor: colors.accentLine }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={[styles.num, allDone && { backgroundColor: colors.accent }]}>
          {allDone ? <Icon name="checkmark" size={16} color={colors.onAccent} /> : <T v="small" style={{ fontWeight: '800' }}>{index + 1}</T>}
        </View>
        <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: ex.id } })} accessibilityRole="button" accessibilityLabel={`${ex.name}, техника`}>
          <T v="h3" numberOfLines={2}>
            {ex.name}
          </T>
          <T v="small" numberOfLines={1}>
            {we.plannedSets} × {we.repMin}–{we.repMax} · RIR {we.targetRir} · отдых {Math.round(we.restSec / 60 * 10) / 10} мин
          </T>
        </Pressable>
        <IconButton name="ellipsis-horizontal" label="Действия с упражнением" onPress={onMenu} size={18} style={{ width: 38, height: 38 }} />
      </View>

      {last ? (
        <T v="small" style={{ marginTop: 8 }} numberOfLines={2}>
          Прошлый раз: <T v="small" color={colors.text}>{last.sets.map((s) => (s.weight ? `${fmtWeight(s.weight, unit)}×${s.reps}` : `${s.reps}`)).join(' · ')}</T>
        </T>
      ) : null}
      {rec ? (
        <View style={[styles.rec, rec.action === 'increase' && { borderColor: colors.accentLine, backgroundColor: colors.accentDim }, rec.action === 'decrease' && { borderColor: 'rgba(247,178,59,0.4)' }]}>
          <Icon name={rec.action === 'increase' ? 'trending-up' : rec.action === 'decrease' ? 'trending-down' : rec.action === 'new' ? 'sparkles-outline' : 'remove'} size={16} color={rec.action === 'increase' ? colors.accent : rec.action === 'decrease' ? colors.warning : colors.textDim} />
          <View style={{ flex: 1 }}>
            <T v="small" color={colors.text} style={{ fontWeight: '800' }}>
              Сегодня: {rec.weight > 0 ? `${fmtWeight(rec.weight, unit)} ${unitLabel(unit)} × ` : isBw ? '' : 'подбери вес · '}
              {rec.repMin}–{rec.repMax}
            </T>
            <T v="small" style={{ fontSize: 12 }}>
              {rec.rationale}
            </T>
          </View>
        </View>
      ) : null}

      <WarmupHint ex={ex} we={we} unit={unit} />

      <View style={styles.headRow}>
        <T v="caption" style={{ width: 28 }}>#</T>
        <T v="caption" style={{ flex: 1, textAlign: 'center' }}>{isBw ? `+${unitLabel(unit)}` : unitLabel(unit)}</T>
        <T v="caption" style={{ flex: 1, textAlign: 'center' }}>Повт</T>
        <View style={{ width: 48 }} />
      </View>
      {we.sets.map((s, i) => (
        <SetRow key={s.id} weId={we.id} set={s} idx={i} unit={unit} onComplete={completeSet} />
      ))}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Button title="Подход" icon="add" size="sm" variant="secondary" onPress={() => useWorkouts.getState().addSet(we.id)} style={{ flex: 1 }} />
        {we.sets.length > 0 && !we.sets[we.sets.length - 1].done ? (
          <Button title="Убрать" icon="remove" size="sm" variant="ghost" onPress={() => useWorkouts.getState().removeSet(we.id, we.sets[we.sets.length - 1].id)} />
        ) : null}
      </View>
    </View>
  );
});

/** Разминка и раскладка блинов — подсказка, ничего не нужно вводить */
function WarmupHint({ ex, we, unit }: { ex: Exercise; we: WorkoutExercise; unit: 'kg' | 'lb' }) {
  const [open, setOpen] = useState(false);
  const work = we.sets.find((s) => !s.done)?.weight ?? we.recommendation?.weight ?? 0;
  const started = we.sets.some((s) => s.done);
  const warm = started ? [] : warmupSets(ex, work);
  const plates = usesBarbell(ex) && unit === 'kg' && work > 20 ? platesPerSide(work) : null;
  if (!warm.length && !plates) return null;
  return (
    <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityLabel="Разминка и блины" style={styles.warm}>
      <Icon name="flame-outline" size={15} color={colors.textDim} />
      <View style={{ flex: 1, gap: 2 }}>
        {warm.length ? (
          <T v="small" style={{ fontSize: 12 }} numberOfLines={open ? undefined : 1}>
            Разминка: <T v="small" color={colors.text} style={{ fontSize: 12 }}>{warm.map((w) => `${fmtWeight(w.weight)}×${w.reps}`).join(' · ')}</T>
          </T>
        ) : null}
        {plates && (open || !warm.length) ? (
          <T v="small" style={{ fontSize: 12 }}>
            {fmtWeight(work)} кг = гриф 20 + на сторону: <T v="small" color={colors.text} style={{ fontSize: 12 }}>{plates.length ? plates.map((p) => fmtWeight(p)).join(' + ') : 'без блинов'}</T>
          </T>
        ) : null}
      </View>
      {plates && warm.length ? <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.muted} /> : null}
    </Pressable>
  );
}

const SetRow = memo(function SetRow({ weId, set, idx, unit, onComplete }: { weId: string; set: ExerciseSet; idx: number; unit: 'kg' | 'lb'; onComplete: (s: ExerciseSet) => void }) {
  const [w, setW] = useState(set.weight ? String(toDisplayWeight(set.weight, unit)).replace('.', ',') : '');
  const [r, setR] = useState(set.reps ? String(set.reps) : '');
  // Синхронизация только при внешнем изменении (перенос веса из прошлого подхода, смена единиц).
  // Если значение совпадает с тем, что уже введено, текст не трогаем — иначе «82,» превращалось бы в «82».
  const [prev, setPrev] = useState({ weight: set.weight, reps: set.reps, unit });
  if (prev.weight !== set.weight || prev.reps !== set.reps || prev.unit !== unit) {
    setPrev({ weight: set.weight, reps: set.reps, unit });
    const typedW = parseDecimal(w);
    if (prev.unit !== unit || !(Number.isFinite(typedW) && fromDisplayWeight(typedW, unit) === set.weight) && !(set.weight === 0 && w === '')) {
      setW(set.weight ? String(toDisplayWeight(set.weight, unit)).replace('.', ',') : '');
    }
    if (parseInt(r, 10) !== set.reps && !(set.reps === 0 && r === '')) setR(set.reps ? String(set.reps) : '');
  }
  const upd = (patch: Partial<ExerciseSet>) => useWorkouts.getState().updateSet(weId, set.id, patch);
  const setFeel = (f: SetFeel) => {
    haptic.tap();
    upd({ feel: set.feel === f ? undefined : f, rir: set.feel === f ? undefined : FEEL_RIR[f] });
  };
  return (
    <View>
      <View style={[styles.setRow, set.done && { backgroundColor: 'rgba(200,245,60,0.07)' }]}>
        <T v="body" style={{ width: 28, fontWeight: '800' }} color={set.done ? colors.accent : colors.textDim}>
          {idx + 1}
        </T>
        <TextInput
          value={w}
          onChangeText={(t) => {
            setW(t);
            const n = parseDecimal(t);
            upd({ weight: Number.isFinite(n) ? fromDisplayWeight(n, unit) : 0 });
          }}
          placeholder="0"
          placeholderTextColor={colors.muted}
          keyboardType="decimal-pad"
          selectTextOnFocus
          accessibilityLabel={`Вес, подход ${idx + 1}`}
          style={[styles.input, set.done && styles.inputDone]}
        />
        <TextInput
          value={r}
          onChangeText={(t) => {
            setR(t);
            const n = parseInt(t, 10);
            upd({ reps: Number.isFinite(n) ? n : 0 });
          }}
          placeholder="0"
          placeholderTextColor={colors.muted}
          keyboardType="number-pad"
          selectTextOnFocus
          accessibilityLabel={`Повторы, подход ${idx + 1}`}
          style={[styles.input, set.done && styles.inputDone]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={set.done ? 'Отменить выполнение подхода' : 'Подход выполнен'}
          onPress={() => onComplete(set)}
          style={[styles.check, set.done && { backgroundColor: colors.accent, borderColor: colors.accent }]}
          hitSlop={4}
        >
          <Icon name="checkmark" size={22} color={set.done ? colors.onAccent : colors.muted} />
        </Pressable>
      </View>
      {set.done ? (
        <View style={styles.feelRow}>
          <T v="small" style={{ fontSize: 12 }}>
            Как пошло?
          </T>
          {(['easy', 'ok', 'hard'] as SetFeel[]).map((f) => (
            <Pressable key={f} onPress={() => setFeel(f)} style={[styles.feel, set.feel === f && { backgroundColor: f === 'hard' ? colors.warning : colors.accent }]} accessibilityRole="button" accessibilityState={{ selected: set.feel === f }}>
              <T v="small" style={{ fontSize: 12, fontWeight: '700' }} color={set.feel === f ? colors.onAccent : colors.textDim}>
                {f === 'easy' ? 'Легко' : f === 'ok' ? 'Нормально' : 'Тяжело'}
              </T>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
});

function FinishSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const active = useWorkouts((s) => s.active);
  const [rpe, setRpe] = useState<number | undefined>();
  const [notes, setNotes] = useState('');
  if (!active) return null;
  const doneSets = active.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  const planned = active.exercises.reduce((a, e) => a + e.plannedSets, 0);
  const finish = () => {
    const s = useWorkouts.getState().finish({ sessionRpe: rpe, notes: notes.trim() || undefined });
    onClose();
    haptic.success();
    if (s) router.replace({ pathname: '/workout/[id]', params: { id: s.id, fresh: '1' } });
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Завершить тренировку?" subtitle={`Выполнено ${doneSets} из ${planned} запланированных подходов`}>
      {hasProgress(active) ? (
        <View style={{ gap: space.md }}>
          <T v="caption">Общая тяжесть тренировки (RPE)</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[5, 6, 7, 8, 9, 10].map((n) => (
              <Pressable key={n} onPress={() => setRpe(rpe === n ? undefined : n)} style={[styles.rpe, rpe === n && { backgroundColor: n >= 9 ? colors.warning : colors.accent }]}>
                <T v="h3" color={rpe === n ? colors.onAccent : colors.textDim}>
                  {n}
                </T>
              </Pressable>
            ))}
          </View>
          <T v="small" style={{ fontSize: 12 }}>
            5–6 легко · 7–8 рабочая · 9–10 на пределе. Необязательно, но помогает FORM оценить восстановление.
          </T>
          <Field placeholder="Заметка (самочувствие, техника…)" value={notes} onChangeText={setNotes} multiline />
          <Button title="Сохранить тренировку" icon="checkmark" size="lg" onPress={finish} />
          <Button title="Продолжить тренировку" variant="ghost" onPress={onClose} />
        </View>
      ) : (
        <View style={{ gap: space.md }}>
          <T v="body">Ни один подход не отмечен выполненным. Удалить тренировку без сохранения?</T>
          <Button
            title="Удалить без сохранения"
            variant="danger"
            onPress={() => {
              useWorkouts.getState().discard();
              onClose();
              router.replace('/');
            }}
          />
          <Button title="Продолжить тренировку" variant="secondary" onPress={onClose} />
        </View>
      )}
    </Sheet>
  );
}


const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.md, paddingBottom: 8, backgroundColor: colors.bg },
  note: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: radius.md, backgroundColor: colors.warningDim },
  block: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  num: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  rec: { flexDirection: 'row', gap: 8, marginTop: 10, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, marginBottom: 4, paddingHorizontal: 4 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingHorizontal: 4, borderRadius: radius.sm },
  input: { flex: 1, minWidth: 0, width: 0, height: 46, borderRadius: radius.sm, backgroundColor: colors.surface2, color: colors.text, textAlign: 'center', fontSize: 19, fontWeight: '800', borderWidth: 1, borderColor: colors.border, fontVariant: ['tabular-nums'] },
  inputDone: { backgroundColor: 'transparent', borderColor: 'transparent' },
  check: { width: 48, height: 46, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  feelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 36, paddingBottom: 6 },
  feel: { paddingHorizontal: 10, height: 30, borderRadius: 15, backgroundColor: colors.surface2, justifyContent: 'center' },
  warm: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 52, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.surface2 },
  alt: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.accentDim },
  rpe: { width: 48, height: 44, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
