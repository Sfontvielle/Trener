import React, { memo, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, PanResponder, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BodyArea, Exercise, ExerciseSet, SetFeel, WorkoutExercise } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Button, EmptyState, Icon, IconButton, T } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { SideDrawer } from '@/components/SideDrawer';
import { confirm, toast, useDialog } from '@/components/Dialog';
import { useWorkouts, hasProgress } from '@/stores/workouts';
import { useProfile } from '@/stores/profile';
import { useCheckins } from '@/stores/checkins';
import { useHealth } from '@/stores/health';
import { getExercise, GROUP_LABEL } from '@/data/exercises';
import { historyFor, isPersonalRecord } from '@/features/training/progression';
import { alternativesFor } from '@/features/training/planGenerator';
import { DEFAULT_SETS, makeWorkoutExercise } from '@/features/training/session';
import { readinessFor } from '@/features/recovery/derive';
import { ExercisePickerSheet } from '@/features/exercises/ExercisePickerSheet';
import { ExerciseMedia, prefetchExerciseMedia } from '@/features/exercises/ExerciseMedia';
import { Anatomy } from '@/features/exercises/Anatomy';
import { TechniqueView } from '@/features/exercises/TechniqueView';
import { sessionEnergy } from '@/features/training/energy';
import { EnergySheet } from '@/features/training/EnergySheet';
import { useBody } from '@/stores/body';
import { latestTrendWeight } from '@/features/progress/weightTrend';
import { currentIndexOf, isExerciseDone, navItems, nextIndex, nextSetLabel, prevIndex, remainingInfo, workoutProgress } from '@/features/training/workoutNav';
import { RestTimerBar } from '@/features/training/RestTimer';
import { exerciseFlag, guardExercise, prefDiscomfort, prefDislike, prefExclude, prefFavorite } from '@/features/training/prefActions';
import { platesPerSide, usesBarbell, warmupSets } from '@/features/training/warmup';
import { formatDuration, today } from '@/utils/date';
import { fmtWeight, fromDisplayWeight, parseDecimal, toDisplayWeight, unitLabel } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';

/** Обработчик свайпа текущего экрана тренировки (экран один — модульная переменная безопасна) */
let swipeGo: ((dir: 1 | -1) => void) | null = null;
const swipeNav = (dir: 1 | -1) => swipeGo?.(dir);

/** Как прошёл подход — понятными словами; внутри переводится в запас повторов (RIR) для прогрессии */
const FEEL_RIR: Record<SetFeel, number> = { easy: 3, ok: 2, hard: 1, max: 0 };
const FEEL_LABEL: Record<SetFeel, string> = { easy: 'Легко', ok: 'Нормально', hard: 'Тяжело', max: 'До отказа' };
const FEELS: SetFeel[] = ['easy', 'ok', 'hard', 'max'];
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
  const rest = useWorkouts((s) => s.rest);
  const unit = useProfile((s) => s.settings.weightUnit);
  const profileW = useProfile((s) => s.profile?.weightKg ?? 75);
  const weights = useBody((s) => s.weights);
  const healthDays = useHealth((s) => s.days);
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'swap'; weId: string } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [painFor, setPainFor] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [energyOpen, setEnergyOpen] = useState(false);
  const [pr, setPr] = useState<{ text: string; n: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [slide] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));
  const [pan] = useState(() =>
    PanResponder.create({
      // Свайп — только явный горизонтальный жест; вертикальная прокрутка и поля ввода не мешают
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2.2,
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) < 70) return;
        swipeNav(g.dx < 0 ? 1 : -1);
      },
    }),
  );

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

  const idx = active ? currentIndexOf(active) : 0;
  const count = active?.exercises.length ?? 0;
  const goTo = (i: number, dir: 1 | -1 = i > idx ? 1 : -1) => {
    if (!active || i < 0 || i >= count || i === idx) return;
    haptic.tap();
    useWorkouts.getState().setCurrent(i);
    slide.setValue(dir * 36);
    fade.setValue(0);
    Animated.parallel([Animated.timing(slide, { toValue: 0, duration: 220, useNativeDriver: true }), Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true })]).start();
  };
  useEffect(() => {
    swipeGo = (dir) => {
      const a = useWorkouts.getState().active;
      if (!a) return;
      const i = currentIndexOf(a);
      const j = dir === 1 ? nextIndex(a, i) : prevIndex(a, i);
      if (j >= 0) goTo(j, dir);
    };
    return () => {
      swipeGo = null;
    };
  });

  // Энергозатраты: измеренные (часы/Apple Health), иначе оценка по MET — пересчёт раз в секунду
  const bodyW = latestTrendWeight(weights) ?? profileW;
  const energy = useMemo(() => (active ? sessionEnergy(active, bodyW, healthDays, customs, now) : null), [active, bodyW, healthDays, customs, now]);

  if (!active) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 40, padding: space.lg }}>
        <EmptyState icon="barbell-outline" title="Нет активной тренировки" text="Начни тренировку через кнопку «+» внизу." action="На главную" onAction={() => router.replace('/')} />
      </View>
    );
  }

  const we = active.exercises[idx];
  const menuWe = active.exercises.find((e) => e.id === menuFor);
  const swapWe = picker?.mode === 'swap' ? active.exercises.find((e) => e.id === picker.weId) : undefined;
  const painWe = active.exercises.find((e) => e.id === painFor);
  const progress = workoutProgress(active);
  const nextI = nextIndex(active, idx);
  const ctaSet = we?.sets.find((x) => !x.done);
  const allDone = active.exercises.length > 0 && active.exercises.every((x) => isExerciseDone(x));
  // Во время отдыха нижняя зона — таймер (с «Пропустить»), после — снова главная кнопка
  const resting = !!rest && rest.endsAt + 1500 > now;
  const prevI = prevIndex(active, idx);

  const ctx = () => {
    const r = readinessFor(today(), useCheckins.getState().byDate, sessions, useHealth.getState().days);
    return { sessions, customs, band: r?.band, volumeFactor: 1, rirDelta: 0 };
  };

  /** После исключения/дискомфорта — предложить замену, только если в упражнении ещё есть невыполненные подходы */
  const offerReplace = (weId: string) => {
    const x = useWorkouts.getState().active?.exercises.find((e) => e.id === weId);
    if (!x || x.sets.every((st) => st.done)) return;
    setTimeout(() => setPicker({ mode: 'swap', weId }), 300);
  };

  const onPick = (picked: Exercise) => {
    const mode = picker;
    setPicker(null);
    const swapTarget = mode?.mode === 'swap' ? swapWe : undefined;
    guardExercise(
      picked,
      (ex) => {
        const st = useWorkouts.getState();
        if (swapTarget) {
          const nw = makeWorkoutExercise({ exerciseId: ex.id, sets: swapTarget.plannedSets, repMin: swapTarget.repMin, repMax: swapTarget.repMax, targetRir: swapTarget.targetRir, restSec: swapTarget.restSec }, ctx());
          if (nw) st.replaceExercise(swapTarget.id, { ...nw, sets: nw.sets.map((x, i) => (swapTarget.sets[i]?.done ? swapTarget.sets[i] : x)) });
          toast(`Заменено на «${ex.name}»`, 'swap-horizontal');
        } else {
          const [repMin, repMax] = ex.defaultReps;
          const nw = makeWorkoutExercise({ exerciseId: ex.id, sets: DEFAULT_SETS, repMin, repMax, targetRir: 2, restSec: ex.mechanic === 'compound' ? 120 : 75 }, ctx());
          if (nw) {
            st.addExercise(nw);
            st.setCurrent(st.active!.exercises.length - 1);
          }
          toast(`Добавлено: ${ex.name}`, 'add-circle');
        }
      },
      customs,
    );
  };

  /**
   * Завершение: все подходы сделаны → «Все упражнения выполнены. Завершить тренировку?»;
   * часть пропущена → показываем, что именно, но даём осознанно закончить.
   */
  const askFinish = () => {
    const a = useWorkouts.getState().active;
    if (!a) return;
    if (!hasProgress(a)) return setDiscardOpen(true);
    const finish = () => {
      const e = sessionEnergy(a, bodyW, useHealth.getState().days, customs);
      const s = useWorkouts.getState().finish({ energy: { kcal: e.kcal, source: e.source } });
      haptic.success();
      if (s) router.replace({ pathname: '/workout/[id]', params: { id: s.id, fresh: '1' } });
    };
    const left = a.exercises.reduce((n, x) => n + x.sets.filter((st) => !st.done).length, 0);
    if (!left) {
      useDialog.getState().show('Все упражнения выполнены', 'Завершить тренировку?', [
        { text: 'Вернуться', style: 'cancel' },
        { text: 'Завершить', onPress: finish },
      ]);
      return;
    }
    const names = a.exercises.filter((x) => !isExerciseDone(x)).map((x) => getExercise(x.exerciseId, customs)?.name ?? '').filter(Boolean);
    const firstLeft = a.exercises.findIndex((x) => !isExerciseDone(x));
    useDialog.getState().show('Завершить тренировку?', `Не выполнено подходов: ${left} (${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}). Можно доделать их сейчас или завершить — невыполненные подходы не сохранятся.`, [
      { text: 'Вернуться', style: 'cancel' },
      ...(firstLeft >= 0 && firstLeft !== currentIndexOf(a) ? [{ text: 'К пропущенному', onPress: () => goTo(firstLeft) }] : []),
      { text: 'Завершить', style: 'destructive' as const, onPress: finish },
    ]);
  };

  const exEnergy = we && energy ? energy.perExercise[we.exerciseId] : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <IconButton name="chevron-down" label="Свернуть тренировку (всё сохранено)" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <Pressable style={{ flex: 1, alignItems: 'center' }} onPress={() => setNavOpen(true)} accessibilityRole="button" accessibilityLabel="Все упражнения тренировки">
          <T v="caption" numberOfLines={1} color={colors.textDim}>
            {active.name}
          </T>
          <T v="h3" style={{ fontVariant: ['tabular-nums'] }}>
            {count ? `${idx + 1} из ${count}` : '—'}
          </T>
          <T v="small" style={{ fontSize: 11, fontVariant: ['tabular-nums'] }}>
            {formatDuration((now - active.startedAt) / 1000)}
            {energy && energy.kcal >= 5 ? ` · ${energy.source === 'health' ? '' : '≈ '}${energy.kcal} ккал` : ''}
          </T>
        </Pressable>
        <IconButton name="list" label="Список упражнений" onPress={() => setNavOpen(true)} />
      </View>
      <AnimatedBar progress={progress} />

      <View style={{ flex: 1 }} {...pan.panHandlers}>
        <Animated.View style={{ flex: 1, opacity: fade, transform: [{ translateX: slide }] }}>
          <ScrollView key={we?.id ?? 'empty'} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: 10, paddingBottom: insets.bottom + 150, gap: 10 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
            {active.volumeFactor < 1 ? (
              <View style={styles.note}>
                <Icon name="battery-half" size={14} color={colors.warning} />
                <T v="small" color={colors.text} style={{ flex: 1, fontSize: 12 }} numberOfLines={2}>
                  Объём {Math.round(active.volumeFactor * 100)}% по готовности · веса без повышения
                </T>
              </View>
            ) : null}
            {we ? (
              <ExerciseFocus
                key={we.id}
                we={we}
                index={idx}
                unit={unit}
                nextName={nextI >= 0 ? getExercise(active.exercises[nextI].exerciseId, customs)?.name : undefined}
                isLast={nextI < 0}
                allDone={allDone}
                kcal={exEnergy}
                totalKcal={energy?.kcal}
                energySource={energy?.source}
                onEnergy={() => setEnergyOpen(true)}
                onMenu={() => setMenuFor(we.id)}
                onPr={(text) => setPr({ text, n: (pr?.n ?? 0) + 1 })}
              />
            ) : (
              <EmptyState icon="add-circle-outline" title="Пока пусто" text="Добавь первое упражнение." action="Добавить упражнение" onAction={() => setPicker({ mode: 'add' })} />
            )}
          </ScrollView>
        </Animated.View>
      </View>

      {we ? (
        <View style={[styles.cta, { bottom: insets.bottom + 66 }]}>
          {resting ? (
            <RestTimerBar inline />
          ) : ctaSet ? (
            <Button title={`Завершить подход ${we.sets.indexOf(ctaSet) + 1}`} icon="checkmark" size="lg" onPress={() => completeSetFor({ we, set: ctaSet, index: idx, unit, onPr: (text) => setPr({ text, n: (pr?.n ?? 0) + 1 }) })} />
          ) : allDone || nextI < 0 ? (
            <Button title="Завершить тренировку" icon="flag" size="lg" onPress={askFinish} />
          ) : (
            <Button title={`Далее: ${getExercise(active.exercises[nextI].exerciseId, customs)?.name ?? 'следующее'}`} icon="arrow-forward" size="lg" onPress={() => goTo(nextI, 1)} />
          )}
        </View>
      ) : null}

      <View style={[styles.navBar, { paddingBottom: insets.bottom + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Предыдущее упражнение" disabled={prevI < 0} onPress={() => goTo(prevI, -1)} style={[styles.navBtn, prevI < 0 && { opacity: 0.35 }]}>
          <Icon name="chevron-back" size={20} />
          <T v="small" color={colors.text} style={{ fontWeight: '700' }}>
            Назад
          </T>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Открыть список упражнений" onPress={() => setNavOpen(true)} style={[styles.navBtn, { flex: 1.2 }]}>
          <Icon name="menu" size={18} />
          <T v="small" color={colors.text} style={{ fontWeight: '700' }}>
            Упражнения
          </T>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Следующее упражнение" disabled={nextI < 0} onPress={() => goTo(nextI, 1)} style={[styles.navBtn, nextI < 0 && { opacity: 0.35 }]}>
          <T v="small" color={colors.text} style={{ fontWeight: '700' }}>
            Вперёд
          </T>
          <Icon name="chevron-forward" size={20} />
        </Pressable>
      </View>

      {!we ? <RestTimerBar bottom={insets.bottom + 74} /> : null}
      {pr ? <PrBanner key={pr.n} text={pr.text} top={insets.top + 70} /> : null}

      <WorkoutNavigator
        visible={navOpen}
        onClose={() => setNavOpen(false)}
        current={idx}
        perExercise={energy?.perExercise}
        onGo={(i) => {
          setNavOpen(false);
          goTo(i);
        }}
        onAdd={() => {
          setNavOpen(false);
          setTimeout(() => setPicker({ mode: 'add' }), 250);
        }}
        onFinish={() => {
          setNavOpen(false);
          setTimeout(askFinish, 250);
        }}
      />

      <Sheet visible={!!menuWe} onClose={() => setMenuFor(null)} title={menuWe ? getExercise(menuWe.exerciseId, customs)?.name : ''}>
        {menuWe ? (
          <View style={{ gap: 8 }}>
            <MenuRow icon="information-circle-outline" label="Карточка упражнения и история" onPress={() => { setMenuFor(null); router.push({ pathname: '/exercise/[id]', params: { id: menuWe.exerciseId } }); }} />
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
            <MenuRow icon="arrow-up" label="Переместить раньше" onPress={() => { useWorkouts.getState().moveExercise(menuWe.id, -1); useWorkouts.getState().setCurrent(Math.max(0, idx - 1)); setMenuFor(null); }} />
            <MenuRow icon="arrow-down" label="Переместить позже" onPress={() => { useWorkouts.getState().moveExercise(menuWe.id, 1); useWorkouts.getState().setCurrent(Math.min(count - 1, idx + 1)); setMenuFor(null); }} />
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
              Острая, резкая или нарастающая боль — прекрати упражнение. Если боль не проходит — обратись к врачу. {BRAND} не ставит диагнозов.
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

      <EnergySheet visible={energyOpen} onClose={() => setEnergyOpen(false)} energy={energy} weightKg={bodyW} />
      <DiscardSheet visible={discardOpen} onClose={() => setDiscardOpen(false)} />
    </View>
  );
}

/**
 * Отметка подхода (из строки подхода или «липкой» кнопки). Сохраняется сразу — persist пишет на диск,
 * поэтому подход не теряется при сворачивании/закрытии приложения.
 */
function completeSetFor({ we, set, index, unit, onPr }: { we: WorkoutExercise; set: ExerciseSet; index: number; unit: 'kg' | 'lb'; onPr: (t: string) => void }) {
  const st = useWorkouts.getState();
  const customs = st.customExercises;
  const ex = getExercise(we.exerciseId, customs);
  if (!ex) return;
  if (set.done) {
    st.updateSet(we.id, set.id, { done: false, completedAt: undefined, feel: undefined, rir: undefined });
    return;
  }
  if (set.reps <= 0) {
    toast('Укажи количество повторений', 'alert-circle');
    return;
  }
  const history = historyFor(ex.id, st.sessions, 3);
  const rec = we.recommendation;
  const prevDone = [...we.sets].reverse().find((x) => x.done && x.completedAt);
  st.updateSet(we.id, set.id, { done: true, completedAt: Date.now(), restSec: prevDone?.completedAt ? Math.round((Date.now() - prevDone.completedAt) / 1000) : undefined });
  haptic.setDone();
  // Переносим вес в следующий невыполненный подход, если он не редактировался
  const i = we.sets.findIndex((x) => x.id === set.id);
  const next = we.sets[i + 1];
  if (next && !next.done && next.weight !== set.weight && next.weight === (rec?.weight ?? 0)) st.updateSet(we.id, next.id, { weight: set.weight });
  if (isPersonalRecord(ex, { ...set, done: true }, history)) {
    haptic.record();
    onPr(`${ex.name} · ${set.weight ? `${fmtWeight(set.weight)} × ${set.reps}` : `${set.reps} повт.`}`);
  }
  const settings = useProfile.getState().settings;
  const a = useWorkouts.getState().active;
  if (settings.restTimerAuto && a) {
    const label = nextSetLabel(a, index, (w) => `${fmtWeight(w, unit)}`, (id) => getExercise(id, customs)?.name ?? '');
    st.startRest(we.restSec || settings.defaultRestSec, label);
    haptic.timerStart();
  }
}

/** Плавный прогресс тренировки */
function AnimatedBar({ progress }: { progress: number }) {
  const [v] = useState(() => new Animated.Value(progress));
  useEffect(() => {
    Animated.timing(v, { toValue: progress, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [progress, v]);
  return (
    <View style={styles.barTrack}>
      <Animated.View style={[styles.barFill, { width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
    </View>
  );
}

/** Новый рекорд: короткая «премиальная» плашка (scale + fade), без конфетти */
function PrBanner({ text, top }: { text: string; top: number }) {
  const [a] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.sequence([Animated.spring(a, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }), Animated.delay(2200), Animated.timing(a, { toValue: 0, duration: 260, useNativeDriver: true })]).start();
  }, [a]);
  return (
    <Animated.View pointerEvents="none" style={[styles.pr, { top, opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}>
      <Icon name="trophy" size={22} color={colors.onAccent} />
      <View style={{ flexShrink: 1 }}>
        <T v="caption" color={colors.onAccent}>
          Новый рекорд
        </T>
        <T v="body" color={colors.onAccent} style={{ fontWeight: '800' }} numberOfLines={2}>
          {text}
        </T>
      </View>
    </Animated.View>
  );
}

/** Навигатор тренировки (выдвижная панель): ✓ выполнено · ● текущее · ◐ начато · ○ впереди */
function WorkoutNavigator({ visible, onClose, current, onGo, onAdd, onFinish, perExercise }: { visible: boolean; onClose: () => void; current: number; onGo: (i: number) => void; onAdd: () => void; onFinish: () => void; perExercise?: Record<string, number> }) {
  const active = useWorkouts((s) => s.active);
  const customs = useWorkouts((s) => s.customExercises);
  if (!active) return null;
  const items = navItems(active, current);
  const rem = remainingInfo(active, customs);
  const doneN = items.filter((it) => it.state === 'completed' || (it.state === 'current' && it.done === it.total && it.total > 0)).length;
  return (
    <SideDrawer
      visible={visible}
      onClose={onClose}
      title="Упражнения"
      subtitle={rem.exercises ? `Выполнено ${doneN} из ${items.length} · осталось ~${rem.minutes} мин` : 'Все упражнения выполнены'}
      footer={
        <View style={{ gap: 8 }}>
          <Button title="Добавить упражнение" icon="add" variant="secondary" size="sm" onPress={onAdd} />
          <Button title="Завершить тренировку" icon="flag" size="md" onPress={onFinish} />
        </View>
      }
    >
      <ScrollView contentContainerStyle={{ gap: 6, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
        {items.map((it) => {
          const ex = getExercise(it.we.exerciseId, customs);
          const full = it.total > 0 && it.done === it.total;
          const kcal = perExercise?.[it.we.exerciseId];
          return (
            <Pressable key={it.we.id} accessibilityRole="button" accessibilityLabel={`${ex?.name}, ${full ? 'выполнено' : it.state === 'current' ? 'текущее' : it.done ? 'начато' : 'впереди'}`} onPress={() => onGo(it.index)} style={[styles.navItem, it.state === 'current' && { borderColor: colors.accent, backgroundColor: colors.accentDim }]}>
              <View style={[styles.navDot, full && { backgroundColor: colors.accent, borderColor: colors.accent }, it.state === 'current' && !full && { borderColor: colors.accent }]}>
                {full ? <Icon name="checkmark" size={14} color={colors.onAccent} /> : it.state === 'current' ? <View style={styles.navDotInner} /> : it.done ? <View style={[styles.navDotInner, { backgroundColor: colors.textDim }]} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <T v="body" style={{ fontWeight: it.state === 'current' ? '800' : '600', fontSize: 15 }} numberOfLines={2} color={full && it.state !== 'current' ? colors.textDim : colors.text}>
                  {it.index + 1}. {ex?.name ?? it.we.exerciseId}
                </T>
                <T v="small" style={{ fontSize: 12 }}>
                  {it.done}/{it.total} подходов · {it.we.repMin}–{it.we.repMax}
                  {kcal ? ` · ≈${kcal} ккал` : ''}
                </T>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </SideDrawer>
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

function ExerciseFocus({
  we,
  index,
  unit,
  onMenu,
  nextName,
  isLast,
  allDone,
  kcal,
  totalKcal,
  energySource,
  onEnergy,
  onPr,
}: {
  we: WorkoutExercise;
  index: number;
  unit: 'kg' | 'lb';
  onMenu: () => void;
  nextName?: string;
  isLast: boolean;
  allDone: boolean;
  kcal?: number;
  totalKcal?: number;
  energySource?: 'health' | 'estimate';
  onEnergy: () => void;
  onPr: (text: string) => void;
}) {
  const customs = useWorkouts((s) => s.customExercises);
  const sessions = useWorkouts((s) => s.sessions);
  const sex = useProfile((s) => s.profile?.sex);
  const ex = getExercise(we.exerciseId, customs);
  const history = useMemo(() => (ex ? historyFor(ex.id, sessions, 3) : []), [ex, sessions]);
  const [whyOpen, setWhyOpen] = useState(false);
  const [techOpen, setTechOpen] = useState(false);
  if (!ex) return null;
  const last = history[0];
  const rec = we.recommendation;
  const isBw = ex.bodyweight;
  const nextSet = we.sets.find((s) => !s.done);
  const setNo = nextSet ? we.sets.indexOf(nextSet) + 1 : we.sets.length;
  const doneCount = we.sets.filter((s) => s.done).length;
  const lastDone = [...we.sets].reverse().find((s) => s.done);

  const completeSet = (set: ExerciseSet) => completeSetFor({ we, set, index, unit, onPr });

  const primary = ex.groups.primary.map((g) => GROUP_LABEL[g]);
  const secondary = ex.groups.secondary.map((g) => GROUP_LABEL[g]);
  const prevSame = last?.sets[setNo - 1] ?? last?.sets[last.sets.length - 1];

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <T v="h2" numberOfLines={2} style={{ fontSize: 22, lineHeight: 26 }}>
            {ex.name}
          </T>
          <T v="small" numberOfLines={1} style={{ fontSize: 12 }}>
            {[...primary, ...secondary].slice(0, 3).join(' · ')}
          </T>
        </View>
        <IconButton name="ellipsis-horizontal" label="Действия с упражнением" onPress={onMenu} size={18} style={{ width: 40, height: 40 }} />
      </View>

      {/* Визуал: фазы движения + какие мышцы работают; «Техника» — полный разбор */}
      <View style={styles.visual}>
        <View style={{ flex: 1.35 }}>{ex.media ? <ExerciseMedia exercise={ex} height={150} /> : <View style={styles.noMedia}><Icon name="barbell-outline" size={34} color={colors.muted} /></View>}</View>
        <Pressable accessibilityRole="button" accessibilityLabel="Мышцы и техника" onPress={() => setTechOpen(true)} style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Anatomy primary={ex.primary} secondary={ex.secondary} sex={sex} scale={0.3} showLegend={false} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Техника выполнения" onPress={() => setTechOpen(true)} style={styles.techBadge} hitSlop={6}>
          <Icon name="play-circle" size={15} color={colors.onAccent} />
          <T v="small" color={colors.onAccent} style={{ fontWeight: '800', fontSize: 12 }}>
            Техника
          </T>
        </Pressable>
      </View>

      {/* Текущий подход: что сделать сейчас */}
      <View style={styles.setCard}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <T v="caption" color={colors.accent}>
            {nextSet ? `Подход ${setNo} из ${we.sets.length}` : `Выполнено ${doneCount} из ${we.sets.length}`}
          </T>
          {kcal ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Как рассчитаны калории" onPress={onEnergy} hitSlop={8} style={{ marginLeft: 'auto' }}>
              <T v="small" style={{ fontSize: 12 }}>
                {energySource === 'health' ? '' : '≈'}
                {kcal} ккал · {energySource === 'health' ? '' : '≈'}
                {totalKcal ?? 0} всего <T v="small" color={colors.accent} style={{ fontSize: 12, fontWeight: '800' }}>?</T>
              </T>
            </Pressable>
          ) : null}
        </View>
        {rec ? (
          <Pressable accessibilityRole="button" onPress={() => setWhyOpen(!whyOpen)} style={{ gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
              <T v="small" style={{ fontSize: 12 }}>
                Рекомендуем
              </T>
              <T v="num" style={{ fontSize: 22 }}>
                {rec.weight > 0 ? fmtWeight(rec.weight, unit) : isBw ? 'свой вес' : 'подбери вес'}
              </T>
              {rec.weight > 0 ? <T v="small">{unitLabel(unit)}</T> : null}
              <T v="h3" color={colors.textDim}>
                × {rec.repMin}–{rec.repMax}
              </T>
              <Icon name={rec.action === 'increase' ? 'trending-up' : rec.action === 'decrease' ? 'trending-down' : 'remove'} size={16} color={rec.action === 'increase' ? colors.accent : rec.action === 'decrease' ? colors.warning : colors.textDim} />
              <T v="small" style={{ marginLeft: 'auto', fontSize: 11 }} color={colors.accent}>
                {whyOpen ? 'скрыть' : 'почему?'}
              </T>
            </View>
            {whyOpen ? (
              <T v="small" style={{ fontSize: 12 }}>
                {rec.rationale}
                {we.why ? `\n${we.why}` : ''}
              </T>
            ) : null}
          </Pressable>
        ) : null}
        {prevSame ? (
          <T v="small" numberOfLines={1} style={{ fontSize: 12 }}>
            Прошлый раз: <T v="small" color={colors.text} style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>{last!.sets.map((x) => (x.weight ? `${fmtWeight(x.weight, unit)}×${x.reps}` : `${x.reps}`)).join(' · ')}</T>
          </T>
        ) : (
          <T v="small" style={{ fontSize: 12 }}>
            Первый раз — начни с веса, который даёт запас 2–3 повтора.
          </T>
        )}
        {nextSet ? <QuickAdjust we={we} step={ex.increment || 2.5} unit={unit} bodyweight={isBw} /> : null}
      </View>

      {lastDone && !lastDone.feel ? <FeelPicker weId={we.id} set={lastDone} /> : null}

      <WarmupHint ex={ex} we={we} unit={unit} />

      <View style={styles.block}>
        <View style={styles.headRow}>
          <T v="caption" style={{ width: 28 }}>#</T>
          <T v="caption" style={{ flex: 1, textAlign: 'center' }}>{isBw ? `+${unitLabel(unit)}` : unitLabel(unit)}</T>
          <T v="caption" style={{ flex: 1, textAlign: 'center' }}>Повт</T>
          <View style={{ width: 48 }} />
        </View>
        {we.sets.map((x, i) => (
          <SetRow key={x.id} weId={we.id} set={x} idx={i} unit={unit} onComplete={completeSet} current={x === nextSet} />
        ))}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Button title="Добавить подход" icon="add" size="sm" variant="ghost" onPress={() => { haptic.tap(); useWorkouts.getState().addSet(we.id); }} style={{ flex: 1 }} />
          {we.sets.length > 1 && !we.sets[we.sets.length - 1].done ? (
            <Button title="Убрать подход" icon="remove" size="sm" variant="ghost" onPress={() => { haptic.tap(); useWorkouts.getState().removeSet(we.id, we.sets[we.sets.length - 1].id); }} style={{ flex: 1 }} />
          ) : null}
        </View>
      </View>
      <SetTip we={we} step={ex.increment || 2.5} unit={unit} />

      {!nextSet ? (
        <View style={styles.doneCard}>
          <View style={styles.doneIcon}>
            <Icon name={allDone ? 'trophy' : 'checkmark'} size={18} color={colors.onAccent} />
          </View>
          <View style={{ flex: 1 }}>
            <T v="body" style={{ fontWeight: '800' }}>
              {allDone ? 'Все упражнения выполнены' : 'Упражнение завершено'} · {doneCount}/{we.sets.length}
            </T>
            <T v="small" numberOfLines={1}>
              {allDone ? 'Нажми «Завершить тренировку» внизу' : !isLast && nextName ? `Следующее: ${nextName}` : 'Остались пропущенные подходы — см. «Упражнения»'}
            </T>
          </View>
        </View>
      ) : null}

      <Sheet visible={techOpen} onClose={() => setTechOpen(false)} title={ex.name} subtitle={[...primary, ...secondary].join(' · ')}>
        <TechniqueView ex={ex} sex={sex} />
      </Sheet>
    </View>
  );
}

/** После подхода: как он прошёл — понятными словами (внутри → запас повторов для прогрессии) */
function FeelPicker({ weId, set }: { weId: string; set: ExerciseSet }) {
  const pick = (f: SetFeel) => {
    haptic.tap();
    useWorkouts.getState().updateSet(weId, set.id, { feel: f, rir: FEEL_RIR[f] });
  };
  return (
    <View style={styles.feelCard}>
      <T v="small" color={colors.text} style={{ fontWeight: '700' }}>
        Как прошёл подход?
      </T>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {FEELS.map((f) => (
          <Pressable key={f} accessibilityRole="button" accessibilityLabel={`Подход: ${FEEL_LABEL[f]}`} onPress={() => pick(f)} style={[styles.feel, { flex: 1 }]}>
            <T v="small" style={{ fontSize: 12, fontWeight: '800', textAlign: 'center' }} color={f === 'max' ? colors.warning : colors.text} numberOfLines={1} adjustsFontSizeToFit>
              {FEEL_LABEL[f]}
            </T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

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
      <View style={{ flex: 1, alignItems: 'center' }}>
        <T v="num" style={{ fontSize: 22 }}>
          {bodyweight && !cur.weight ? 'свой' : fmtWeight(cur.weight, unit)}
        </T>
        <T v="small" style={{ fontSize: 10 }}>
          {unitLabel(unit)}
        </T>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Плюс ${stepTxt} ${unitLabel(unit)}`} onPress={() => upd({ weight: Math.round((cur.weight + step) * 100) / 100 })} style={styles.qBtn}>
        <T v="small" style={{ fontWeight: '800' }}>+{stepTxt}</T>
      </Pressable>
      <View style={styles.qSep} />
      <Pressable accessibilityRole="button" accessibilityLabel="Минус повтор" onPress={() => upd({ reps: Math.max(0, cur.reps - 1) })} style={styles.qBtn}>
        <Icon name="remove" size={20} />
      </Pressable>
      <View style={{ flex: 0.8, alignItems: 'center' }}>
        <T v="num" style={{ fontSize: 22 }}>
          {cur.reps}
        </T>
        <T v="small" style={{ fontSize: 10 }}>
          повт.
        </T>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Плюс повтор" onPress={() => upd({ reps: cur.reps + 1 })} style={styles.qBtn}>
        <Icon name="add" size={20} />
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

const SetRow = memo(function SetRow({ weId, set, idx, unit, onComplete, current }: { weId: string; set: ExerciseSet; idx: number; unit: 'kg' | 'lb'; onComplete: (s: ExerciseSet) => void; current?: boolean }) {
  const [pop] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!set.done) return;
    // ✓ — короткий scale/fade при отметке подхода
    pop.setValue(0.5);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }).start();
  }, [set.done, pop]);
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
  return (
    <View>
      <View style={[styles.setRow, set.done && { backgroundColor: colors.doneRow }, current && styles.setRowCurrent]}>
        <Pressable style={{ width: 28 }} disabled={!set.done} onPress={() => { const i = set.feel ? FEELS.indexOf(set.feel) : -1; const n = FEELS[(i + 1) % FEELS.length]; haptic.tap(); upd({ feel: n, rir: FEEL_RIR[n] }); }} accessibilityLabel="Изменить ощущение подхода">
          <T v="body" style={{ fontWeight: '800' }} color={set.done ? colors.accent : colors.textDim}>
            {idx + 1}
          </T>
          {set.done && set.feel ? (
            <T v="small" style={{ fontSize: 8.5, fontWeight: '800' }} color={set.feel === 'max' ? colors.warning : colors.textDim} numberOfLines={1}>
              {set.feel === 'easy' ? 'легко' : set.feel === 'ok' ? 'норм' : set.feel === 'hard' ? 'тяжело' : 'отказ'}
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
          <Animated.View style={{ transform: [{ scale: pop }], opacity: pop }}>
            <Icon name="checkmark" size={22} color={set.done ? colors.onAccent : colors.muted} />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
});

/** Ни одного выполненного подхода: тренировку нечего сохранять — удалить или продолжить */
function DiscardSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Завершить тренировку?" subtitle="Ни один подход не отмечен выполненным">
      <View style={{ gap: space.md }}>
        <T v="body">Сохранять нечего. Удалить тренировку без сохранения?</T>
        <Button
          title="Удалить без сохранения"
          variant="danger"
          onPress={() => {
            useWorkouts.getState().discard();
            onClose();
            router.replace('/');
          }}
        />
        <Button title="Вернуться к тренировке" variant="secondary" onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = themed({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.md, paddingBottom: 8, backgroundColor: colors.bg },
  note: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: radius.md, backgroundColor: colors.warningDim },
  block: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 8 },
  rec: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 2 },
  last: { padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, gap: 4 },
  setRowCurrent: { borderWidth: 1, borderColor: colors.accentLine },
  doneCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.accentLine },
  doneIcon: { width: 32, height: 32, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  cta: { position: 'absolute', left: space.lg, right: space.lg },
  navBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: 8, paddingHorizontal: space.lg, paddingTop: 8, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  navBtn: { flex: 1, height: 50, borderRadius: radius.md, backgroundColor: colors.surface2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: 'transparent' },
  navDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  navDotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  barTrack: { height: 4, backgroundColor: colors.surface3 },
  barFill: { height: 4, backgroundColor: colors.accent },
  pr: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.accent, boxShadow: '0px 10px 30px rgba(0,0,0,0.35)' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2, paddingHorizontal: 4 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4, paddingHorizontal: 4, borderRadius: radius.sm },
  input: { flex: 1, minWidth: 0, width: 0, height: 42, borderRadius: radius.sm, backgroundColor: colors.surface2, color: colors.text, textAlign: 'center', fontSize: 18, fontWeight: '800', borderWidth: 1, borderColor: colors.border, fontVariant: ['tabular-nums'] },
  inputDone: { backgroundColor: 'transparent', borderColor: 'transparent' },
  check: { width: 48, height: 42, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  feelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 36, paddingBottom: 6 },
  feel: { paddingHorizontal: 10, height: 30, borderRadius: 15, backgroundColor: colors.surface2, justifyContent: 'center' },
  warm: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: radius.lg, backgroundColor: colors.surface },
  qBtn: { width: 50, height: 48, borderRadius: radius.md, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  qSep: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: 2 },
  visual: { flexDirection: 'row', alignItems: 'stretch', borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', minHeight: 150 },
  noMedia: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  techBadge: { position: 'absolute', right: 8, top: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 28, borderRadius: 14, backgroundColor: colors.accent },
  setCard: { gap: 8, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.accentLine },
  feelCard: { gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  techBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 40, paddingHorizontal: 12, borderRadius: 20, backgroundColor: colors.accent },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 52, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.surface2 },
  alt: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.accentDim },
  rpe: { width: 48, height: 44, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
