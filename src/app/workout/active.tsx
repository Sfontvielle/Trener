import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BodyArea, Exercise, ExerciseSet, SetFeel, WorkoutExercise } from '@/types';
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
import { exerciseFlag, prefDiscomfort, prefDislike, prefExclude, prefFavorite } from '@/features/training/prefActions';
import { platesPerSide, usesBarbell, warmupSets } from '@/features/training/warmup';
import { formatDuration, today } from '@/utils/date';
import { fmtWeight, fromDisplayWeight, parseDecimal, toDisplayWeight, unitLabel } from '@/utils/format';
import { haptic } from '@/services/haptics';

const FEEL_RIR: Record<SetFeel, number> = { easy: 3, ok: 2, hard: 0 };
const PAIN_AREAS: { label: string; area?: BodyArea }[] = [
  { label: 'Плечо', area: 'shoulder' },
  { label: 'Спина / поясница', area: 'lower_back' },
  { label: 'Колено', area: 'knee' },
  { label: 'Локоть', area: 'elbow' },
  { label: 'Запястье', area: 'wrist' },
  { label: 'Другое' },
];

export default function ActiveWorkout() {
  const insets = useSafeAreaInsets();
  const active = useWorkouts((s) => s.active);
  const sessions = useWorkouts((s) => s.sessions);
  const customs = useWorkouts((s) => s.customExercises);
  const unit = useProfile((s) => s.settings.weightUnit);
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'swap'; weId: string } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [painFor, setPainFor] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const pendingScroll = useRef<string | null>(null);
  const onBlockLayout = (id: string, y: number) => {
    if (pendingScroll.current !== id) return;
    pendingScroll.current = null;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
  };
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

  // Режим фокуса: развёрнуто одно упражнение — выбранное вручную или первое незавершённое
  const current = active.exercises.find((e) => e.sets.some((x) => !x.done));
  const picked = openId && active.exercises.some((e) => e.id === openId) ? openId : null;
  const focusId = openId === '__none__' ? null : picked ?? current?.id ?? null;
  const focusIdx = active.exercises.findIndex((e) => e.id === focusId);
  const onExerciseFinished = (weId: string) => {
    // Упражнение закончено → фокус уходит на следующее незавершённое, экран прокручивается к нему
    const list = useWorkouts.getState().active?.exercises ?? [];
    const next = list.find((e) => e.id !== weId && e.sets.some((x) => !x.done));
    setOpenId(null);
    if (next) pendingScroll.current = next.id;
  };
  const total = active.exercises.reduce((a, e) => a + e.sets.length, 0);
  const done = active.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
  const menuWe = active.exercises.find((e) => e.id === menuFor);
  const swapWe = picker?.mode === 'swap' ? active.exercises.find((e) => e.id === picker.weId) : undefined;

  const ctx = () => {
    const r = readinessFor(today(), useCheckins.getState().byDate, sessions);
    return { sessions, customs, band: r?.band, volumeFactor: 1, rirDelta: 0 };
  };

  /** После исключения/дискомфорта — предложить замену, только если в упражнении ещё есть невыполненные подходы */
  const offerReplace = (weId: string) => {
    const we = useWorkouts.getState().active?.exercises.find((x) => x.id === weId);
    if (!we || we.sets.every((x) => x.done)) return;
    setTimeout(() => setPicker({ mode: 'swap', weId }), 300);
  };
  const painWe = active.exercises.find((e) => e.id === painFor);

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
            {formatDuration((now - active.startedAt) / 1000)} · {focusIdx >= 0 ? `упр. ${focusIdx + 1}/${active.exercises.length} · ` : ''}
            {done}/{total} подх.
          </T>
        </View>
        <Button title="Готово" size="sm" onPress={() => setFinishOpen(true)} />
      </View>
      <Bar progress={total ? done / total : 0} height={3} style={{ borderRadius: 0 }} />

      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: space.lg, paddingBottom: insets.bottom + 120, gap: space.md }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {active.volumeFactor < 1 ? (
          <View style={styles.note}>
            <Icon name="battery-half" size={16} color={colors.warning} />
            <T v="small" color={colors.text} style={{ flex: 1 }}>
              Объём снижен до {Math.round(active.volumeFactor * 100)}% по готовности. Веса без повышения.
            </T>
          </View>
        ) : null}
        {active.exercises.map((we, idx) => (
          <View key={we.id} onLayout={(e) => onBlockLayout(we.id, e.nativeEvent.layout.y)}>
            <ExerciseBlock
              we={we}
              index={idx}
              unit={unit}
              expanded={we.id === focusId}
              onToggle={() => setOpenId(we.id === focusId ? '__none__' : we.id)}
              onFinished={onExerciseFinished}
              onMenu={() => setMenuFor(we.id)}
            />
          </View>
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
            <MenuRow icon={exerciseFlag(menuWe.exerciseId) === 'favorite' ? 'star' : 'star-outline'} label={exerciseFlag(menuWe.exerciseId) === 'favorite' ? 'Убрать из избранного' : 'Добавить в избранное'} onPress={() => { toast(prefFavorite(menuWe.exerciseId), 'star'); setMenuFor(null); }} />
            <MenuRow icon="thumbs-down-outline" label={exerciseFlag(menuWe.exerciseId) === 'disliked' ? 'Снять «не нравится»' : 'Мне не нравится'} onPress={() => { toast(prefDislike(menuWe.exerciseId)); setMenuFor(null); }} />
            <MenuRow icon="medkit-outline" label="Дискомфорт при выполнении" onPress={() => { const id = menuWe.id; setMenuFor(null); setTimeout(() => setPainFor(id), 250); }} />
            <MenuRow
              icon="ban-outline"
              label="Не предлагать больше"
              onPress={() => {
                const exId = menuWe.exerciseId;
                const weId = menuWe.id;
                setMenuFor(null);
                confirm('Не предлагать упражнение?', 'Оно не будет попадать в план, генерацию и замены. Сегодняшнюю тренировку можно сразу перестроить заменой.', 'Не предлагать', () => {
                  toast(prefExclude(exId));
                  offerReplace(weId);
                });
              }}
            />
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

      <Sheet visible={!!painWe} onClose={() => setPainFor(null)} title="Где дискомфорт?" subtitle="Упражнение не будет назначаться автоматически, пока ты сам его не вернёшь">
        {painWe ? (
          <View style={{ gap: 8 }}>
            {PAIN_AREAS.map((a) => (
              <MenuRow
                key={a.label}
                icon="body-outline"
                label={a.label}
                onPress={() => {
                  const weId = painWe.id;
                  toast(prefDiscomfort(painWe.exerciseId, a.area));
                  setPainFor(null);
                  offerReplace(weId);
                }}
              />
            ))}
            <T v="small" style={{ fontSize: 12, marginTop: 4 }}>
              Острая, резкая или нарастающая боль — прекрати упражнение. Если боль не проходит — обратись к врачу. FORM не ставит диагнозов.
            </T>
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

const ExerciseBlock = memo(function ExerciseBlock({
  we,
  index,
  unit,
  onMenu,
  expanded,
  onToggle,
  onFinished,
}: {
  we: WorkoutExercise;
  index: number;
  unit: 'kg' | 'lb';
  onMenu: () => void;
  expanded: boolean;
  onToggle: () => void;
  onFinished: (weId: string) => void;
}) {
  const customs = useWorkouts((s) => s.customExercises);
  const sessions = useWorkouts((s) => s.sessions);
  const ex = getExercise(we.exerciseId, customs);
  const history = useMemo(() => (ex ? historyFor(ex.id, sessions, 3) : []), [ex, sessions]);
  const [whyOpen, setWhyOpen] = useState(false);
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
    if (isLast) onFinished(we.id);
    if (s.restTimerAuto) {
      st.startRest(we.restSec || s.defaultRestSec, isLast ? 'следующее упражнение' : ex.name);
      haptic.timerStart();
    }
  };

  const doneCount = we.sets.filter((x) => x.done).length;
  if (!expanded) {
    const top = we.sets.filter((x) => x.done).reduce((m, x) => Math.max(m, x.weight), 0) || we.sets[0]?.weight || 0;
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${ex.name}, развернуть`} onPress={onToggle} style={[styles.collapsed, allDone && { borderColor: colors.accentLine, opacity: 0.75 }]}>
        <View style={[styles.num, { marginTop: 0 }, allDone && { backgroundColor: colors.accent }]}>
          {allDone ? <Icon name="checkmark" size={16} color={colors.onAccent} /> : <T v="small" style={{ fontWeight: '800' }}>{index + 1}</T>}
        </View>
        <View style={{ flex: 1 }}>
          <T v="body" style={{ fontWeight: '700' }} numberOfLines={1}>
            {ex.name}
          </T>
          <T v="small" numberOfLines={1}>
            {doneCount ? `${doneCount}/${we.sets.length} подх.` : `${we.sets.length} × ${we.repMin}–${we.repMax}`}
            {top ? ` · ${fmtWeight(top, unit)} ${unitLabel(unit)}` : ''}
          </T>
        </View>
        <Icon name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
    );
  }

  return (
    <View style={[styles.block, { borderColor: colors.accentLine }]}>
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
        <IconButton name="chevron-up" label="Свернуть упражнение" onPress={onToggle} size={18} style={{ width: 38, height: 38 }} />
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
            {we.why ? (
              <Pressable accessibilityRole="button" onPress={() => setWhyOpen(!whyOpen)} hitSlop={6} style={{ marginTop: 4 }}>
                <T v="small" color={colors.accent} style={{ fontSize: 12, fontWeight: '700' }}>
                  {whyOpen ? 'Скрыть' : 'Почему столько подходов?'}
                </T>
              </Pressable>
            ) : null}
            {whyOpen && we.why ? (
              <T v="small" style={{ fontSize: 12, marginTop: 2 }}>
                {we.why}
              </T>
            ) : null}
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
        <SetRow key={s.id} weId={we.id} set={s} idx={i} unit={unit} onComplete={completeSet} askFeel={s.done && !we.sets[i + 1]?.done && !s.feel} />
      ))}
      <SetTip we={we} step={ex.increment || 2.5} unit={unit} />
      <QuickAdjust we={we} step={ex.increment || 2.5} unit={unit} bodyweight={isBw} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Button title="Подход" icon="add" size="sm" variant="secondary" onPress={() => useWorkouts.getState().addSet(we.id)} style={{ flex: 1 }} />
        {we.sets.length > 0 && !we.sets[we.sets.length - 1].done ? (
          <Button title="Убрать" icon="remove" size="sm" variant="ghost" onPress={() => useWorkouts.getState().removeSet(we.id, we.sets[we.sets.length - 1].id)} />
        ) : null}
      </View>
    </View>
  );
});

/**
 * Контекстная подсказка по ходу упражнения: два подхода подряд ниже диапазона → снизить вес,
 * два «легко» с повторами у верха диапазона → добавить. Меняются только оставшиеся подходы и только по кнопке.
 */
function SetTip({ we, step, unit }: { we: WorkoutExercise; step: number; unit: 'kg' | 'lb' }) {
  const [hiddenAt, setHiddenAt] = useState(-1);
  const done = we.sets.filter((s) => s.done);
  const todo = we.sets.filter((s) => !s.done);
  if (done.length < 2 || !todo.length || hiddenAt === done.length) return null;
  const [a, b] = done.slice(-2);
  const w = todo[0].weight;
  if (w <= 0) return null;
  let tip: { text: string; weight: number } | null = null;
  if (a.reps < we.repMin && b.reps < we.repMin) {
    const nw = Math.max(0, Math.round((w * 0.93) / step) * step);
    if (nw < w) tip = { text: `Два подхода ниже ${we.repMin} повт. — снизить вес оставшихся до ${fmtWeight(nw, unit)} ${unitLabel(unit)}?`, weight: nw };
  } else if ((a.rir ?? 0) >= 3 && (b.rir ?? 0) >= 3 && a.reps >= we.repMax && b.reps >= we.repMax) {
    tip = { text: `Легко и у верха диапазона — добавить до ${fmtWeight(w + step, unit)} ${unitLabel(unit)}?`, weight: w + step };
  }
  if (!tip) return null;
  const apply = () => {
    const st = useWorkouts.getState();
    todo.forEach((x) => st.updateSet(we.id, x.id, { weight: tip!.weight }));
    haptic.success();
    setHiddenAt(done.length);
  };
  return (
    <View style={styles.tip}>
      <Icon name="sparkles-outline" size={15} color={colors.accent} />
      <T v="small" color={colors.text} style={{ flex: 1, fontSize: 12 }}>
        {tip.text}
      </T>
      <Pressable accessibilityRole="button" hitSlop={6} onPress={apply}>
        <T v="small" color={colors.accent} style={{ fontWeight: '800', fontSize: 12 }}>
          Применить
        </T>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Скрыть подсказку" hitSlop={6} onPress={() => setHiddenAt(done.length)}>
        <Icon name="close" size={14} color={colors.muted} />
      </Pressable>
    </View>
  );
}

/** Одна рука: быстрые ± для текущего (первого невыполненного) подхода, без клавиатуры */
function QuickAdjust({ we, step, unit, bodyweight }: { we: WorkoutExercise; step: number; unit: 'kg' | 'lb'; bodyweight: boolean }) {
  const cur = we.sets.find((s) => !s.done);
  if (!cur) return null;
  const upd = (patch: Partial<ExerciseSet>) => {
    haptic.tap();
    useWorkouts.getState().updateSet(we.id, cur.id, patch);
  };
  const stepTxt = String(step).replace('.', ',');
  return (
    <View style={styles.quick}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Минус ${stepTxt} ${unitLabel(unit)}`} onPress={() => upd({ weight: Math.max(0, Math.round((cur.weight - step) * 100) / 100) })} style={styles.qBtn}>
        <T v="small" style={{ fontWeight: '800' }}>−{stepTxt}</T>
      </Pressable>
      <T v="body" style={{ fontWeight: '800', minWidth: 56, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
        {bodyweight && !cur.weight ? 'свой' : fmtWeight(cur.weight, unit)}
      </T>
      <Pressable accessibilityRole="button" accessibilityLabel={`Плюс ${stepTxt} ${unitLabel(unit)}`} onPress={() => upd({ weight: Math.round((cur.weight + step) * 100) / 100 })} style={styles.qBtn}>
        <T v="small" style={{ fontWeight: '800' }}>+{stepTxt}</T>
      </Pressable>
      <View style={{ width: 10 }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Минус повтор" onPress={() => upd({ reps: Math.max(0, cur.reps - 1) })} style={styles.qBtn}>
        <Icon name="remove" size={18} />
      </Pressable>
      <T v="body" style={{ fontWeight: '800', minWidth: 28, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
        {cur.reps}
      </T>
      <Pressable accessibilityRole="button" accessibilityLabel="Плюс повтор" onPress={() => upd({ reps: cur.reps + 1 })} style={styles.qBtn}>
        <Icon name="add" size={18} />
      </Pressable>
    </View>
  );
}

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

const SetRow = memo(function SetRow({ weId, set, idx, unit, onComplete, askFeel }: { weId: string; set: ExerciseSet; idx: number; unit: 'kg' | 'lb'; onComplete: (s: ExerciseSet) => void; askFeel: boolean }) {
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
        <Pressable style={{ width: 28 }} disabled={!set.done} onPress={() => { const n: SetFeel = set.feel === 'easy' ? 'ok' : set.feel === 'ok' ? 'hard' : 'easy'; haptic.tap(); upd({ feel: n, rir: FEEL_RIR[n] }); }} accessibilityLabel="Изменить ощущение подхода">
          <T v="body" style={{ fontWeight: '800' }} color={set.done ? colors.accent : colors.textDim}>
            {idx + 1}
          </T>
          {set.done && set.feel ? (
            <T v="small" style={{ fontSize: 9, fontWeight: '800' }} color={set.feel === 'hard' ? colors.warning : colors.textDim}>
              {set.feel === 'easy' ? 'RIR3' : set.feel === 'ok' ? 'RIR2' : 'RIR0'}
            </T>
          ) : null}
        </Pressable>
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
      {askFeel ? (
        <View style={styles.feelRow}>
          <T v="small" style={{ fontSize: 12 }}>
            Как пошло?
          </T>
          {(['easy', 'ok', 'hard'] as SetFeel[]).map((f) => (
            <Pressable key={f} onPress={() => setFeel(f)} style={[styles.feel, set.feel === f && { backgroundColor: f === 'hard' ? colors.warning : colors.accent }]} accessibilityRole="button" accessibilityState={{ selected: set.feel === f }}>
              <T v="small" style={{ fontSize: 12, fontWeight: '700' }} color={set.feel === f ? colors.onAccent : colors.textDim}>
                {f === 'easy' ? 'Легко · RIR 3+' : f === 'ok' ? 'Норм · RIR 2' : 'Тяжело · 0–1'}
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
  tip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine },
  collapsed: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: space.md, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  quick: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.surface2 },
  qBtn: { minWidth: 44, height: 40, paddingHorizontal: 8, borderRadius: radius.sm, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 52, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.surface2 },
  alt: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.accentDim },
  rpe: { width: 48, height: 44, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
