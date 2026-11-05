import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, InputAccessoryView, Keyboard, PanResponder, PixelRatio, Platform, Pressable, ScrollView, TextInput, View, type ScrollViewInstance } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BodyArea, Exercise, ExerciseSet, WorkoutExercise, WorkoutSession } from '@/types';
import { colors, DISPLAY, radius, space, themed } from '@/theme';
import { Button, EmptyState, Icon, IconButton, T, elevation } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { SwipeRow } from '@/components/ds/SwipeRow';
import { confirm, toast, useDialog } from '@/components/Dialog';
import { useWorkouts, hasProgress } from '@/stores/workouts';
import { useProfile } from '@/stores/profile';
import { useCheckins } from '@/stores/checkins';
import { useHealth } from '@/stores/health';
import { getExercise, GROUP_LABEL } from '@/data/exercises';
import { effectiveIncrement, historyFor, isPersonalRecord, PR_HISTORY } from '@/features/training/progression';
import { alternativesFor } from '@/features/training/planGenerator';
import { DEFAULT_SETS, makeWorkoutExercise } from '@/features/training/session';
import { readinessFor } from '@/features/recovery/derive';
import { ExercisePickerSheet } from '@/features/exercises/ExercisePickerSheet';
import { Field } from '@/components/inputs';
import { TechniquePanel } from '@/features/exercises/TechniquePanel';
import { ExerciseThumb } from '@/features/exercises/ExerciseThumb';
import { sessionEnergy } from '@/features/training/energy';
import { EnergySheet } from '@/features/training/EnergySheet';
import { useBody } from '@/stores/body';
import { latestTrendWeight } from '@/features/progress/weightTrend';
import { afterSetTarget, currentIndexOf, isExerciseDone, navItems, nextIndex, prevIndex, remainingInfo, supersetLabels, supersetMembers, workoutProgress } from '@/features/training/workoutNav';
import { isTimed } from '@/features/training/journal';
import { finishWorkout } from '@/features/training/planning';
import { HoldTimer } from '@/features/training/HoldTimer';
import { exerciseFlag, guardExercise, prefDiscomfort, prefDislike, prefExclude, prefFavorite } from '@/features/training/prefActions';
import { warmupPlan } from '@/features/training/warmup';
import { DEFAULT_GYM, equipmentStep, loadKind, plateLayout } from '@/features/training/equipment';
import { autoregulate } from '@/features/training/autoreg';
import { formatDuration, today } from '@/utils/date';
import { fmtSec, fmtWeight, fromDisplayWeight, parseDecimal, toDisplayWeight, unitLabel } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';
import { noIncreaseReason } from '@/features/health/current';
import { Tap, prefersReducedMotion } from '@/components/motion';
import { afterModalClose } from '@/components/modalGate';
import { useKeyboardAwareScroll } from '@/components/keyboard';
import { cancelRestEnd, ensurePermission, scheduleRestEnd } from '@/services/notifications';

const NATIVE = Platform.OS !== 'web';

/** Обработчик свайпа текущего экрана тренировки (экран один — модульная переменная безопасна) */
let swipeGo: ((dir: 1 | -1) => void) | null = null;
const swipeNav = (dir: 1 | -1) => swipeGo?.(dir);

/** Где дискомфорт — для «Дискомфорт при выполнении» (упражнение перестаёт назначаться автоматически) */
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
  const profileW = useProfile((s) => s.profile?.weightKg ?? 75);
  const weights = useBody((s) => s.weights);
  const healthDays = useHealth((s) => s.days);
  const [picker, setPicker] = useState<{ mode: 'add' } | { mode: 'swap'; weId: string } | null>(null);
  const [swapFor, setSwapFor] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [painFor, setPainFor] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [energyOpen, setEnergyOpen] = useState(false);
  const [workoutMenu, setWorkoutMenu] = useState(false);
  const [pr, setPr] = useState<{ text: string; n: number } | null>(null);
  // Подход на время: идёт таймер удержания (планка и т. п.)
  const [hold, setHold] = useState<{ weId: string; setId: string; startedAt: number } | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  // Таймер отдыха — только если человек сам включил его кнопкой ⏱ (по умолчанию выключен)
  const restOn = useProfile((s) => !!s.settings.restTimer);
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const [restOpen, setRestOpen] = useState(false);
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

  // Экран целиком не перерисовывается каждую секунду (это давало подтормаживания на длинной тренировке):
  // секундомер — отдельный компонент <Elapsed>, энергия обновляется раз в 30 с, конец отдыха — точным таймером.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

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
  const prevI = prevIndex(active, idx);
  const ssLabels = supersetLabels(active.exercises);
  const curEx = we ? getExercise(we.exerciseId, customs) : undefined;
  const timed = isTimed(curEx);
  const holding = !!hold && !!we && hold.weId === we.id && we.sets.some((x) => x.id === hold.setId && !x.done);
  const onPrCb = (text: string) => setPr({ text, n: (pr?.n ?? 0) + 1 });
  const startRest = (nextLabel?: string) => {
    const st = useProfile.getState().settings;
    if (!st.restTimer) return;
    const sec = st.defaultRestSec || 120;
    setRest(restFor(sec));
    if (st.restNotify) void scheduleRestEnd(sec, nextLabel);
  };
  const stopRest = () => {
    setRest(null);
    void cancelRestEnd();
  };
  const complete = (w: WorkoutExercise, set: ExerciseSet, i: number) => {
    if (rest) stopRest();
    completeSetFor({ we: w, set, index: i, unit, onPr: onPrCb, onNavigate: (j) => setTimeout(() => goTo(j, j > i ? 1 : -1), 260), onRest: startRest });
  };
  const startHold = (weId: string, setId: string) => {
    if (rest) stopRest();
    haptic.timerStart();
    setHold(holdStart(weId, setId));
  };
  const stopHold = (sec: number) => {
    if (!hold || !we) return;
    const set = we.sets.find((x) => x.id === hold.setId);
    setHold(null);
    if (!set) return;
    useWorkouts.getState().updateSet(we.id, set.id, { reps: sec });
    complete(we, { ...set, reps: sec }, idx);
  };

  const ctx = () => {
    const r = readinessFor(today(), useCheckins.getState().byDate, sessions, useHealth.getState().days);
    return { sessions, customs, band: r?.band, volumeFactor: 1, rirDelta: 0, gym: useProfile.getState().settings.gym, noIncrease: noIncreaseReason() };
  };

  /** После исключения/дискомфорта — предложить замену, только если в упражнении ещё есть невыполненные подходы */
  const offerReplace = (weId: string) => {
    const x = useWorkouts.getState().active?.exercises.find((e) => e.id === weId);
    if (!x || x.sets.every((st) => st.done)) return;
    afterModalClose(() => setPicker({ mode: 'swap', weId }));
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
      const s = finishWorkout({ energy: { kcal: e.kcal, source: e.source } });
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
    useDialog.getState().show('Некоторые упражнения ещё не завершены. Закончить тренировку?', `Не выполнено подходов: ${left} (${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}). Невыполненные подходы не сохранятся.`, [
      { text: 'Вернуться', style: 'cancel' },
      ...(firstLeft >= 0 && firstLeft !== currentIndexOf(a) ? [{ text: 'К пропущенному', onPress: () => goTo(firstLeft) }] : []),
      { text: 'Завершить', style: 'destructive' as const, onPress: finish },
    ]);
  };


  const collapse = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const nextWarm = ctaSet?.warmup;
  const ctaNo = ctaSet ? we!.sets.filter((x) => !x.warmup).indexOf(ctaSet) + 1 : 0;
  // Главное действие внизу: записать подход → старт удержания → далее → завершить
  // title — коротко, чтобы влезало в одну строку рядом с ⏱; label — полностью, для VoiceOver
  const center = !we
    ? null
    : allDone || (!ctaSet && nextI < 0)
      ? { icon: 'flag' as const, title: 'Завершить', label: 'Завершить тренировку', onPress: askFinish }
      : ctaSet && timed && !nextWarm
        ? { icon: 'play' as const, title: `Старт · ${fmtSec(ctaSet.reps || we.repMax)}`, label: `Старт · ${fmtSec(ctaSet.reps || we.repMax)}`, onPress: () => startHold(we.id, ctaSet.id) }
        : ctaSet
          ? { icon: 'checkmark' as const, title: nextWarm ? 'Разминка' : `Подход ${ctaNo}`, label: nextWarm ? 'Разминка — готово' : `Записать подход ${ctaNo}`, onPress: () => complete(we, ctaSet, idx) }
          : { icon: 'chevron-forward' as const, title: `Далее: ${getExercise(active.exercises[nextI].exerciseId, customs)?.name ?? 'следующее'}`, label: `Далее: ${getExercise(active.exercises[nextI].exerciseId, customs)?.name ?? 'следующее'}`, onPress: () => goTo(nextI, 1) };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Шапка (R2, как на образце): «1/8» слева — все упражнения, крупное время тренировки по центру — меню тренировки */}
      <View style={[styles.top, { paddingTop: insets.top + 4 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Список упражнений" accessibilityValue={{ text: count ? `Упражнение ${idx + 1} из ${count}` : 'Нет упражнений' }} onPress={() => setNavOpen(true)} hitSlop={8} style={({ pressed }) => [styles.pos, pressed && { opacity: 0.6 }]}>
          <T v="headline" color={colors.textDim} numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }} testID="exercise-position">
            {count ? `${idx + 1}/${count}` : '0/0'}
          </T>
        </Pressable>
        <View style={[styles.clockWrap, { top: insets.top + 4 }]} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel="Тренировка: время, калории, завершение" onPress={() => setWorkoutMenu(true)} hitSlop={6} style={({ pressed }) => [styles.clock, pressed && { opacity: 0.6 }]}>
            <T v="display" maxFontSizeMultiplier={1.2} style={{ fontSize: 40, lineHeight: 48 }} testID="workout-elapsed">
              <Elapsed startedAt={active.startedAt} />
            </T>
            <Icon name="caret-down" size={14} color={colors.textDim} />
          </Pressable>
        </View>
      </View>

      <View style={{ flex: 1 }} {...pan.panHandlers}>
        <Animated.View style={{ flex: 1, opacity: fade, transform: [{ translateX: slide }] }}>
          {we ? (
            <ExerciseFocus
              key={we.id}
              we={we}
              index={idx}
              unit={unit}
              nextName={nextI >= 0 ? getExercise(active.exercises[nextI].exerciseId, customs)?.name : undefined}
              isLast={nextI < 0}
              allDone={allDone}
              reduced={active.volumeFactor < 1 ? Math.round(active.volumeFactor * 100) : undefined}
              onComplete={(set) => complete(we, set, idx)}
              onNote={() => setNoteFor(we.id)}
              onCollapse={collapse}
              onMenu={() => setMenuFor(we.id)}
              ssLabel={ssLabels[idx]}
              ssNext={(() => {
                const m = supersetMembers(active.exercises, idx);
                if (m.length < 2) return undefined;
                const j = m[(m.indexOf(idx) + 1) % m.length];
                return `${ssLabels[j]} ${getExercise(active.exercises[j].exerciseId, customs)?.name ?? ''}`;
              })()}
            />
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', padding: space.lg }}>
              <EmptyState icon="add-circle-outline" title="Пока пусто" text="Добавь первое упражнение." action="Добавить упражнение" onAction={() => setPicker({ mode: 'add' })} />
            </View>
          )}
        </Animated.View>
      </View>

      {/* Одна нижняя панель: ‹ · главное действие · › (таймер удержания — вместо неё) */}
      {we ? (
        holding && hold ? (
          <View style={[styles.holdWrap, { paddingBottom: insets.bottom + 10 }]}>
            <HoldTimer startedAt={hold.startedAt} target={we.sets.find((x) => x.id === hold.setId)?.reps || we.repMax} onStop={stopHold} onCancel={() => setHold(null)} />
          </View>
        ) : (
          <View>
            {rest ? <RestStrip key={rest.endsAt} endsAt={rest.endsAt} total={rest.total} onChange={(endsAt) => { setRest({ endsAt, total: rest.total + Math.round((endsAt - rest.endsAt) / 1000) }); const st = useProfile.getState().settings; if (st.restNotify) void scheduleRestEnd((endsAt - Date.now()) / 1000); }} onSkip={stopRest} onEnd={() => setRest(null)} /> : null}
            <View style={[styles.bar, { paddingBottom: insets.bottom + space.xs }]}>
              <BarBtn icon="chevron-back" label="Предыдущее упражнение" disabled={prevI < 0} onPress={() => goTo(prevI, -1)} />
              <BarBtn icon="add" label="Добавить подход" onPress={() => { haptic.tap(); useWorkouts.getState().addSet(we.id); }} />
              {center ? (
                <Tap accessibilityRole="button" accessibilityLabel={center.label} onPress={() => { haptic.tap(); center.onPress(); }} scaleTo={0.92} style={styles.mainBtn} testID="workout-cta">
                  <Icon name={center.icon} size={34} color={colors.onAccent} />
                </Tap>
              ) : (
                <View style={styles.mainBtnSpace} />
              )}
              <BarBtn icon="timer-outline" label={restOn ? `Таймер отдыха: ${fmtSec(useProfile.getState().settings.defaultRestSec || 120)}` : 'Таймер отдыха: выключен'} active={restOn} onPress={() => setRestOpen(true)} />
              <BarBtn icon="chevron-forward" label="Следующее упражнение" disabled={nextI < 0} onPress={() => goTo(nextI, 1)} />
            </View>
          </View>
        )
      ) : null}

      {pr ? <PrBanner key={pr.n} text={pr.text} top={insets.top + 70} /> : null}

      <ExerciseNoteSheet we={active.exercises.find((x) => x.id === noteFor)} onClose={() => setNoteFor(null)} />
      <WorkoutNavigator
        labels={ssLabels}
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
          afterModalClose(() => setPicker({ mode: 'add' }));
        }}
        onFinish={() => {
          setNavOpen(false);
          setTimeout(askFinish, 250);
        }}
      />

      <Sheet visible={!!menuWe} onClose={() => setMenuFor(null)} title={menuWe ? getExercise(menuWe.exerciseId, customs)?.name : ''}>
        {menuWe ? (
          <View style={{ gap: 8 }}>
            <MenuRow icon="information-circle-outline" label="Карточка упражнения и история" onPress={() => { const exId = menuWe.exerciseId; setMenuFor(null); afterModalClose(() => router.push({ pathname: '/exercise/[id]', params: { id: exId } })); }} />
            <MenuRow icon={menuWe.note ? 'document-text-outline' : 'create-outline'} label="Заметка к упражнению" onPress={() => { const id = menuWe.id; setMenuFor(null); afterModalClose(() => setNoteFor(id)); }} />
            <MenuRow icon="list-outline" label="Все упражнения" onPress={() => { setMenuFor(null); afterModalClose(() => setNavOpen(true)); }} />
            <MenuRow icon="swap-horizontal" label="Заменить упражнение" onPress={() => { const id = menuWe.id; setMenuFor(null); afterModalClose(() => setSwapFor(id)); }} />
            {menuWe.superset || active.exercises.indexOf(menuWe) < count - 1 ? (
              <MenuRow
                icon={menuWe.superset ? 'unlink-outline' : 'link-outline'}
                label={menuWe.superset ? 'Убрать из суперсета' : `Суперсет со следующим: ${getExercise(active.exercises[active.exercises.indexOf(menuWe) + 1]?.exerciseId ?? '', customs)?.name ?? ''}`}
                onPress={() => {
                  const was = !!menuWe.superset;
                  useWorkouts.getState().toggleSuperset(menuWe.id);
                  haptic.tap();
                  toast(was ? 'Убрано из суперсета' : 'Суперсет: подходы по очереди, отдых после круга', 'link');
                  setMenuFor(null);
                }}
              />
            ) : null}
            <MenuRow icon={exerciseFlag(menuWe.exerciseId) === 'favorite' ? 'star' : 'star-outline'} label={exerciseFlag(menuWe.exerciseId) === 'favorite' ? 'Убрать из избранного' : 'Добавить в избранное'} onPress={() => { toast(prefFavorite(menuWe.exerciseId), 'star'); setMenuFor(null); }} />
            <MenuRow icon="thumbs-down-outline" label={exerciseFlag(menuWe.exerciseId) === 'disliked' ? 'Снять «не нравится»' : 'Мне не нравится'} onPress={() => { toast(prefDislike(menuWe.exerciseId)); setMenuFor(null); }} />
            <MenuRow icon="medkit-outline" label="Дискомфорт при выполнении" onPress={() => { const id = menuWe.id; setMenuFor(null); afterModalClose(() => setPainFor(id)); }} />
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
            {menuWe.sets.length > 1 && !menuWe.sets[menuWe.sets.length - 1].done ? (
              <MenuRow icon="remove-circle-outline" label="Убрать подход" onPress={() => { haptic.tap(); useWorkouts.getState().removeSet(menuWe.id, menuWe.sets[menuWe.sets.length - 1].id); setMenuFor(null); }} />
            ) : null}
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

      <Sheet visible={!!swapFor} onClose={() => setSwapFor(null)} title="Заменить упражнение" subtitle="Подберём альтернативу на те же мышцы и движение">
        {swapFor ? (
          <View style={{ gap: 8 }}>
            <MenuRow icon="time-outline" label="Тренажёр занят" onPress={() => { const id = swapFor; setSwapFor(null); afterModalClose(() => setPicker({ mode: 'swap', weId: id })); }} />
            <MenuRow icon="construct-outline" label="Нет нужного оборудования" onPress={() => { const id = swapFor; setSwapFor(null); afterModalClose(() => setPicker({ mode: 'swap', weId: id })); }} />
            <MenuRow icon="medkit-outline" label="Дискомфорт или боль" onPress={() => { const id = swapFor; setSwapFor(null); afterModalClose(() => setPainFor(id)); }} />
            <T v="small" style={{ fontSize: 12, marginTop: 4 }}>
              При боли прекрати это движение и выбери более комфортную альтернативу. {BRAND} не ставит диагнозов.
            </T>
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={!!painWe} onClose={() => setPainFor(null)} title="Где дискомфорт?" subtitle="Упражнение не будет назначаться автоматически, пока ты не вернёшь его вручную">
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

      <Sheet visible={workoutMenu} onClose={() => setWorkoutMenu(false)} title="Тренировка" subtitle={`${Math.round(progress * 100)}% · ≈${energy?.kcal ?? 0} ккал`}>
        <View style={{ gap: 8 }}>
          <MenuRow icon="list-outline" label="Все упражнения" onPress={() => { setWorkoutMenu(false); afterModalClose(() => setNavOpen(true)); }} />
          <MenuRow icon="flame-outline" label={`Калории ≈ ${energy?.kcal ?? 0} ккал · как считаются`} onPress={() => { setWorkoutMenu(false); afterModalClose(() => setEnergyOpen(true)); }} />
          <MenuRow icon="chevron-down" label="Свернуть (всё сохранено)" onPress={() => { setWorkoutMenu(false); afterModalClose(collapse); }} />
          <MenuRow icon="flag-outline" label="Закончить тренировку" onPress={() => { setWorkoutMenu(false); afterModalClose(askFinish); }} />
        </View>
      </Sheet>
      <EnergySheet visible={energyOpen} onClose={() => setEnergyOpen(false)} energy={energy} weightKg={bodyW} />
      <RestSheet visible={restOpen} onClose={() => setRestOpen(false)} onOff={stopRest} />
      <DiscardSheet visible={discardOpen} onClose={() => setDiscardOpen(false)} />
    </View>
  );
}

/**
 * Отметка подхода (из строки подхода или «липкой» кнопки). Сохраняется сразу — persist пишет на диск,
 * поэтому подход не теряется при сворачивании/закрытии приложения.
 */
function completeSetFor({ we: weArg, set: setArg, index, unit, onPr, onNavigate, onRest }: { we: WorkoutExercise; set: ExerciseSet; index: number; unit: 'kg' | 'lb'; onPr: (t: string) => void; onNavigate?: (i: number) => void; onRest?: (nextLabel?: string) => void }) {
  const st = useWorkouts.getState();
  // Свежие значения из хранилища: число могли только что поправить в строке подхода
  const we = st.active?.exercises.find((x) => x.id === weArg.id) ?? weArg;
  const set = we.sets.find((x) => x.id === setArg.id) ?? setArg;
  const customs = st.customExercises;
  const ex = getExercise(we.exerciseId, customs);
  if (!ex) return;
  if (set.done) {
    st.updateSet(we.id, set.id, { done: false, completedAt: undefined, feel: undefined, rir: undefined });
    return;
  }
  if (set.reps <= 0) {
    toast(isTimed(ex) ? 'Укажи время в секундах' : 'Укажи количество повторений', 'alert-circle');
    return;
  }
  const history = historyFor(ex.id, st.sessions, PR_HISTORY);
  const rec = we.recommendation;
  const prevDone = [...we.sets].reverse().find((x) => x.done && x.completedAt);
  st.updateSet(we.id, set.id, { done: true, completedAt: Date.now(), restSec: prevDone?.completedAt ? Math.round((Date.now() - prevDone.completedAt) / 1000) : undefined });
  haptic.setDone();
  // Переносим вес в следующий невыполненный подход, если он не редактировался
  const i = we.sets.findIndex((x) => x.id === set.id);
  const next = we.sets[i + 1];
  if (next && !next.done && next.weight !== set.weight && next.weight === (rec?.weight ?? 0)) st.updateSet(we.id, next.id, { weight: set.weight });
  if (!set.warmup && isPersonalRecord(ex, { ...set, done: true }, history)) {
    haptic.record();
    onPr(`${ex.name} · ${isTimed(ex) ? `${set.weight ? `${fmtWeight(set.weight)} × ` : ''}${fmtSec(set.reps)}` : set.weight ? `${fmtWeight(set.weight)} × ${set.reps}` : `${set.reps} повт.`}`);
  }
  const a = useWorkouts.getState().active;
  // После последнего подхода тренировки — сразу «Завершить тренировку»
  const workoutComplete = !!a && a.exercises.every((x) => x.sets.every((y) => y.done));
  if (!a || workoutComplete) return;
  // Суперсет: после рабочего подхода — сразу к следующему участнику, после круга — снова к первому
  const nav = set.warmup ? { index, rest: true } : afterSetTarget(a, index);
  if (nav.index !== index) onNavigate?.(nav.index);
  // Отдых — после рабочего подхода (в суперсете — после круга), если таймер включён кнопкой ⏱
  if (!set.warmup && nav.rest && onRest) {
    const target = a.exercises[nav.index];
    const left = target?.sets.find((x) => !x.done);
    const name = target ? getExercise(target.exerciseId, customs)?.name : undefined;
    onRest(left ? `${name ?? 'подход'}${left.weight ? ` · ${fmtWeight(left.weight, unit)} ${unitLabel(unit)} × ${left.reps}` : ''}` : undefined);
  }
}

/** Отдых с этого момента (вне рендера: время берётся в момент отметки подхода) */
function restFor(sec: number) {
  return { endsAt: Date.now() + sec * 1000, total: sec };
}

/** Старт удержания для подхода на время (вне рендера: время берётся в момент нажатия) */
function holdStart(weId: string, setId: string) {
  return { weId, setId, startedAt: Date.now() };
}

/** Новый рекорд: «празднование» — плашка с пружиной, пульс кубка и разлёт искр; вибрация — haptic.record() */
const SPARKS = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2);
function PrBanner({ text, top }: { text: string; top: number }) {
  const [a] = useState(() => new Animated.Value(0));
  const [burst] = useState(() => new Animated.Value(0));
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility?.(`Новый рекорд: ${text}`);
    if (prefersReducedMotion()) {
      a.setValue(1);
      const t = setTimeout(() => Animated.timing(a, { toValue: 0, duration: 200, useNativeDriver: true }).start(), 2400);
      return () => clearTimeout(t);
    }
    Animated.parallel([
      Animated.sequence([Animated.spring(a, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }), Animated.delay(2200), Animated.timing(a, { toValue: 0, duration: 260, useNativeDriver: true })]),
      Animated.timing(burst, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [a, burst, text]);
  const cup = a.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.6, 1.25, 1] });
  return (
    <Animated.View pointerEvents="none" style={[styles.pr, { top, opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] }]}>
      <View style={{ width: 26, height: 26, alignItems: 'center', justifyContent: 'center' }}>
        {SPARKS.map((ang, i) => (
          <Animated.View
            key={i}
            style={[
              styles.spark,
              {
                opacity: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
                transform: [{ translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(ang) * 34] }) }, { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(ang) * 34] }) }],
              },
            ]}
          />
        ))}
        <Animated.View style={{ transform: [{ scale: cup }] }}>
          <Icon name="trophy" size={22} color={colors.onAccent} />
        </Animated.View>
      </View>
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
function WorkoutNavigator({ visible, onClose, current, onGo, onAdd, onFinish, perExercise, labels = [] }: { visible: boolean; onClose: () => void; current: number; onGo: (i: number) => void; onAdd: () => void; onFinish: () => void; perExercise?: Record<string, number>; labels?: (string | undefined)[] }) {
  const active = useWorkouts((s) => s.active);
  const customs = useWorkouts((s) => s.customExercises);
  if (!active) return null;
  const items = navItems(active, current);
  const rem = remainingInfo(active, customs);
  const doneN = items.filter((it) => it.state === 'completed' || (it.state === 'current' && it.done === it.total && it.total > 0)).length;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Упражнения"
      subtitle={rem.exercises ? `Выполнено ${doneN} из ${items.length} · осталось ~${rem.minutes} мин` : 'Все упражнения выполнены'}
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Добавить" icon="add" variant="secondary" onPress={onAdd} style={{ flex: 1 }} accessibilityLabel="Добавить упражнение" />
          <Button title="Завершить" icon="flag" onPress={onFinish} style={{ flex: 1 }} accessibilityLabel="Завершить тренировку" />
        </View>
      }
    >
      <View style={{ gap: 6, paddingBottom: 8 }} testID="workout-list">
        {items.map((it) => {
          const ex = getExercise(it.we.exerciseId, customs);
          const full = it.total > 0 && it.done === it.total;
          const kcal = perExercise?.[it.we.exerciseId];
          return (
            <Pressable key={it.we.id} accessibilityRole="button" accessibilityLabel={`${ex?.name}${labels[it.index] ? `, суперсет ${labels[it.index]}` : ''}, ${full ? 'выполнено' : it.state === 'current' ? 'текущее' : it.done ? 'начато' : 'впереди'}`} onPress={() => onGo(it.index)} style={[styles.navItem, it.state === 'current' && { backgroundColor: colors.surface3 }, labels[it.index] && styles.navItemSs]}>
              <View style={[styles.navDot, full && { backgroundColor: colors.accent, borderColor: colors.accent }, it.state === 'current' && !full && { borderColor: colors.accent }]}>
                {full ? <Icon name="checkmark" size={14} color={colors.onAccent} /> : it.state === 'current' ? <View style={styles.navDotInner} /> : it.done ? <View style={[styles.navDotInner, { backgroundColor: colors.textDim }]} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <T v="body" style={{ fontWeight: it.state === 'current' ? '800' : '600', fontSize: 15 }} numberOfLines={2} color={full && it.state !== 'current' ? colors.textDim : colors.text}>
                  {it.index + 1}. {labels[it.index] ? <T v="body" color={colors.accent} style={{ fontWeight: '800', fontSize: 15 }}>{labels[it.index]} </T> : null}
                  {ex?.name ?? it.we.exerciseId}
                </T>
                <T v="small" style={{ fontSize: 12 }}>
                  {it.done}/{it.total} подходов · {isTimed(ex) ? `${fmtSec(it.we.repMin)}–${fmtSec(it.we.repMax)}` : `${it.we.repMin}–${it.we.repMax}`}
                  {kcal ? ` · ≈${kcal} ккал` : ''}
                </T>
              </View>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
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
          <T v="body" numberOfLines={2} style={{ flex: 1 }}>
            {a.name}
          </T>
        </Pressable>
      ))}
    </View>
  );
}

function MenuRow({ icon, label, onPress, danger }: { icon: React.ComponentProps<typeof Icon>['name']; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={20} color={danger ? colors.danger : colors.text} />
      <T v="body" color={danger ? colors.danger : colors.text}>
        {label}
      </T>
    </Pressable>
  );
}

/**
 * Карточка упражнения — как в Fit Session: название акцентом по центру, мышцы под ним, «прошлый раз» одной строкой,
 * подходы крупно «55 кг × 12». Техника — в нижнем сворачиваемом разделе («Техника»), рекомендация и история — «i».
 */
function ExerciseFocus({
  we,
  index,
  unit,
  nextName,
  isLast,
  allDone,
  reduced,
  onComplete,
  onNote,
  onCollapse,
  onMenu,
  ssLabel,
  ssNext,
}: {
  we: WorkoutExercise;
  index: number;
  unit: 'kg' | 'lb';
  nextName?: string;
  isLast: boolean;
  allDone: boolean;
  /** Объём снижен по готовности, % */
  reduced?: number;
  onComplete: (set: ExerciseSet) => void;
  /** Заметка к упражнению (лист в родителе) */
  onNote: () => void;
  /** Свернуть тренировку и меню упражнения — в углах карточки */
  onCollapse: () => void;
  onMenu: () => void;
  /** Суперсет: «A1» и следующий участник круга */
  ssLabel?: string;
  ssNext?: string;
}) {
  const customs = useWorkouts((s) => s.customExercises);
  const sessions = useWorkouts((s) => s.sessions);
  const sex = useProfile((s) => s.profile?.sex);
  const ex = getExercise(we.exerciseId, customs);
  const history = useMemo(() => (ex ? historyFor(ex.id, sessions, 6) : []), [ex, sessions]);
  // Тот же шаг, что и в рекомендации: реальный шаг весов этого зала (по истории)
  const gym = useProfile((s) => s.settings.gym) ?? DEFAULT_GYM;
  const level = useProfile((s) => s.profile?.level);
  const active = useWorkouts((s) => s.active);
  const step = ex ? effectiveIncrement(loadKind(ex) === 'none' ? ex.increment || 2.5 : Math.max(equipmentStep(ex, gym), loadKind(ex) === 'machine' ? ex.increment : 0), history) : 2.5;
  const [infoOpen, setInfoOpen] = useState(false);
  const [techOpen, setTechOpen] = useState(false);
  const [platesOpen, setPlatesOpen] = useState(false);
  // Ввод прямо в строке подхода (R3): какое число набирается; черновик и геометрия строк — в ref,
  // чтобы экран не перерисовывался на каждую цифру
  const [edit, setEdit] = useState<{ id: string; f: EditField } | null>(null);
  const curId = we.sets.find((x) => !x.done)?.id;
  const order = we.sets.map((x) => x.id).join(',');
  const live = useRef<Live>({ edit: null, draft: null, rows: {}, order: order.split(','), cur: curId, shown: false, scrollY: 0, viewH: 0 });
  // Строка, где набирается число, — над клавиатурой (общий механизм экранов и шторок)
  const { scrollRef, rootRef, pad: kbPad, ensure: ensureVisible, onScroll: onKbScroll } = useKeyboardAwareScroll();
  // Подсветка текущего подхода: одна на карточку, после «✓» съезжает к следующему подходу
  const [hl] = useState(() => ({ y: new Animated.Value(0), o: new Animated.Value(0) }));
  const [hlH, setHlH] = useState(0);
  useEffect(() => {
    live.current.cur = curId;
    live.current.order = order.split(',');
    placeHighlight(live.current, hl, setHlH, scrollRef.current);
  }, [curId, order, hl, scrollRef]);
  if (!ex) return null;
  const last = history[0];
  const rec = we.recommendation;
  const timed = isTimed(ex);

  const primary = ex.groups.primary.map((g) => GROUP_LABEL[g]);
  const secondary = ex.groups.secondary.map((g) => GROUP_LABEL[g]);

  // Разминка: только перед первым рабочим подходом и если её ещё не добавили
  const work = we.sets.find((x) => !x.done && !x.warmup)?.weight ?? rec?.weight ?? 0;
  const hasWarmups = we.sets.some((x) => x.warmup);
  const started = we.sets.some((x) => x.done);
  const warmedSimilar = !!active && active.exercises.slice(0, index).some((o) => {
    const oe = getExercise(o.exerciseId, customs);
    return !!oe && oe.pattern === ex.pattern && o.sets.filter((x) => x.done && !x.warmup).length >= 2;
  });
  const prevWarm = lastWarmupCount(ex.id, sessions);
  const warm = started || hasWarmups ? [] : warmupPlan({ ex, workWeight: work, workSets: we.sets.length, level, gym, warmedSimilar, previousCount: prevWarm });
  const layout = rec && rec.weight > 0 ? plateLayout(rec.weight, ex, gym) : null;
  // «24 кг × 10, 10, 9» — если вес во всех подходах один; иначе «80×10 · 85×8»
  const lastTxt = (() => {
    if (!last) return '';
    const v = (x: { reps: number }) => (timed ? fmtSec(x.reps) : String(x.reps));
    const ws = [...new Set(last.sets.map((x) => x.weight))];
    if (ws.length === 1) return ws[0] ? `${fmtWeight(ws[0], unit)} ${unitLabel(unit)} × ${last.sets.map(v).join(', ')}` : last.sets.map(v).join(', ');
    return last.sets.map((x) => (x.weight ? `${fmtWeight(x.weight, unit)}×${v(x)}` : v(x))).join(' · ');
  })();

  const muscles = [...primary, ...secondary.filter((g) => !primary.includes(g))].map((g, i) => (i ? g.toLowerCase() : g)).join(', ');
  const weightCol = !timed || !ex.bodyweight || we.sets.some((x) => x.weight > 0);
  const deltaColor = rec?.action === 'increase' ? colors.accent : rec?.action === 'decrease' || rec?.action === 'deload' ? colors.warning : colors.textDim;
  const openInfo = () => {
    haptic.tap();
    setInfoOpen(true);
  };
  /** Свайп влево по подходу: удалить сразу, с «Отменить» — подход вернётся на своё место */
  const deleteSet = (x: ExerciseSet, i: number) => {
    useWorkouts.getState().removeSet(we.id, x.id);
    toast(x.done ? 'Подход удалён' : 'Подход убран', 'trash-outline', { label: 'Отменить', onPress: () => useWorkouts.getState().insertSet(we.id, x, i) });
  };

  /** Сохранить набранное число (один раз, когда ввод закончен); пустое или неверное — оставить как было */
  const commitEdit = (e: { id: string; f: EditField }) => {
    const L = live.current;
    const v = L.draft;
    L.draft = null;
    if (v == null || !v.trim()) return;
    const st = useWorkouts.getState();
    const cur = st.active?.exercises.find((x) => x.id === we.id)?.sets.find((x) => x.id === e.id);
    if (!cur) return;
    if (e.f === 'w') {
      const n = parseDecimal(v);
      if (!Number.isFinite(n) || n < 0) return;
      const kg = fromDisplayWeight(n, unit);
      if (kg !== cur.weight) st.updateSet(we.id, e.id, { weight: kg });
    } else {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n < 0) return;
      if (n !== cur.reps) st.updateSet(we.id, e.id, { reps: n });
    }
  };
  const startEdit = (id: string, f: EditField) => {
    const L = live.current;
    if (L.edit) commitEdit(L.edit);
    L.edit = { id, f };
    L.draft = null;
    setEdit(L.edit);
    // Клавиатура уже открыта (переход между числами) — докрутить строку над ней
    ensureVisible();
  };
  const finishEdit = () => {
    const L = live.current;
    if (L.edit) commitEdit(L.edit);
    L.edit = null;
    setEdit(null);
    Keyboard.dismiss();
  };
  /** Поле потеряло фокус (тап мимо, прокрутка) — сохранить, если это всё ещё оно */
  const endEdit = (id: string, f: EditField) => {
    const L = live.current;
    if (!L.edit || L.edit.id !== id || L.edit.f !== f) return;
    commitEdit(L.edit);
    L.edit = null;
    setEdit(null);
  };
  /** «Далее»: вес → повторы того же подхода; на повторах — готово */
  const submitField = (id: string, f: EditField) => (f === 'w' ? startEdit(id, 'r') : finishEdit());
  /** Высота строки изменилась (появилась, крупный шрифт) — подсветку пересчитать: от высот зависит её место */
  const onRowLayout = (id: string, h: number) => {
    const L = live.current;
    if (L.rows[id] === h) return;
    L.rows[id] = h;
    placeHighlight(L, hl, setHlH, scrollRef.current);
  };
  /** Отметка подхода во время набора: сначала сохранить набранное, затем записать подход со свежими значениями */
  const completeSet = (x: ExerciseSet) => {
    if (live.current.edit) finishEdit();
    onComplete(useWorkouts.getState().active?.exercises.find((y) => y.id === we.id)?.sets.find((y) => y.id === x.id) ?? x);
  };
  const editSet = edit ? we.sets.find((x) => x.id === edit.id) : undefined;
  const editTitle = editSet ? `${editSet.warmup ? 'Разминка' : `Подход ${we.sets.filter((x) => !x.warmup).indexOf(editSet) + 1}`} · ${edit?.f === 'w' ? `вес, ${unitLabel(unit)}` : timed ? 'время, сек' : 'повторы'}` : '';

  const tip = autoregulate(we, step);
  return (
    <View style={styles.cardWrap}>
      {/* Карточка упражнения (R2, по образцу владельца): «⌄» и «⋯» в углах, название по центру цветом акцента,
          мышцы под ним; подходы без подсветки и рамок; внизу — заметка слева, техника (фото) и «i» справа */}
      <View style={[styles.exCard, elevation()]}>
        <View style={styles.cardHead}>
          <IconButton name="chevron-down" label="Свернуть тренировку (всё сохранено)" bg="transparent" color={colors.textDim} onPress={onCollapse} />
          <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 4, paddingTop: 6 }}>
            <T v="title1" accessibilityRole="header" color={colors.accent} style={styles.exTitle} numberOfLines={3}>
              {ex.name}
            </T>
            <T v="caption" numberOfLines={2} style={styles.muscleCaps} testID="exercise-muscles">
              {muscles}
            </T>
            {ssLabel ? (
              <View style={styles.ssChip} testID="superset-chip">
                <Icon name="link" size={12} color={colors.textDim} />
                <T v="footnote" color={colors.text} numberOfLines={1}>
                  Суперсет {ssLabel}
                  {ssNext ? ` → ${ssNext}` : ''}
                </T>
              </View>
            ) : null}
          </View>
          <IconButton name="ellipsis-horizontal" label="Действия с упражнением" bg="transparent" color={colors.textDim} onPress={onMenu} />
        </View>
        <View style={styles.cardLine} />

        {/* Подходы: номер слева, «70 кг × 10» по центру, справа — галочка, когда подход выполнен.
            Текущий подход подсвечен; тап по числу — ввод прямо в строке, свайп влево — удалить */}
        <View ref={rootRef} style={{ flex: 1 }}>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: space.md + kbPad }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={32}
            onScroll={(e) => {
              live.current.scrollY = e.nativeEvent.contentOffset.y;
              onKbScroll(e);
            }}
            onLayout={(e) => (live.current.viewH = e.nativeEvent.layout.height)}
          >
            {we.sets.map((x, i) => {
              const k = we.sets.slice(0, i).filter((y) => !y.warmup).length;
              const no = x.warmup ? 'Р' : String(k + 1);
              return (
                <SetRow
                  key={x.id}
                  set={x}
                  idx={i}
                  no={no}
                  unit={unit}
                  current={x.id === curId}
                  editing={edit?.id === x.id ? edit.f : null}
                  onComplete={completeSet}
                  onDelete={deleteSet}
                  onStartEdit={startEdit}
                  onDraft={(v) => (live.current.draft = v)}
                  onEndEdit={endEdit}
                  onSubmitField={submitField}
                  onRowLayout={onRowLayout}
                  timed={timed}
                  weightCol={weightCol}
                  bodyweight={!!ex.bodyweight}
                  range={rec ? (timed ? `${fmtSec(rec.repMin)}–${fmtSec(rec.repMax)}` : `${rec.repMin}–${rec.repMax}`) : undefined}
                  last={i === we.sets.length - 1}
                />
              );
            })}
            {/* Подсветка поверх строк (строки непрозрачные из-за свайпа), касания проходят насквозь */}
            <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" testID="set-highlight" style={[styles.hl, { height: hlH, opacity: hl.o, transform: [{ translateY: hl.y }] }]} />
          </ScrollView>
        </View>

        <View style={styles.cardLine} />
        <View style={styles.cardFoot}>
          <Pressable accessibilityRole="button" accessibilityLabel={we.note ? `Заметка: ${we.note}. Изменить` : 'Заметка к упражнению'} onPress={() => { haptic.tap(); onNote(); }} hitSlop={6} style={({ pressed }) => [styles.noteBtn, pressed && { opacity: 0.6 }]} testID="note-button">
            <Icon name={we.note ? 'document-text' : 'create-outline'} size={26} color={we.note ? colors.text : colors.textDim} />
            {we.note ? (
              <T v="footnote" color={colors.text} numberOfLines={2} style={{ flex: 1 }} testID="exercise-note">
                {we.note}
              </T>
            ) : null}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Техника выполнения" onPress={() => { haptic.tap(); setTechOpen(true); }} hitSlop={6} style={({ pressed }) => [styles.thumbBtn, pressed && { opacity: 0.7 }]} testID="technique-toggle">
            <ExerciseThumb ex={ex} size={44} />
          </Pressable>
          <View>
            <IconButton name="information-circle-outline" label="Рекомендация, почему" bg="transparent" color={colors.textDim} size={26} onPress={openInfo} />
            {tip && tip.kind !== 'keep' ? <View style={styles.tipDot} pointerEvents="none" /> : null}
          </View>
        </View>
      </View>

      {/* Техника — отдельной шторкой: фото/анимация, мышцы, как выполнять */}
      <Sheet visible={techOpen} onClose={() => setTechOpen(false)} title={ex.name} subtitle="Техника и мышцы">
        <View testID="technique-inline">
          <TechniquePanel ex={ex} sex={sex} />
        </View>
      </Sheet>

      {/* Над цифровой клавиатурой iOS: что набирается, «Далее» (вес → повторы) и «Готово» */}
      {Platform.OS === 'ios' ? (
        <InputAccessoryView nativeID={KBD_ID} backgroundColor={colors.surface2}>
          <View style={styles.kbdBar}>
            <T v="callout" color={colors.textDim} numberOfLines={1} style={{ flex: 1 }}>
              {editTitle}
            </T>
            {edit?.f === 'w' ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Далее: повторы" onPress={() => submitField(edit.id, 'w')} hitSlop={8} style={styles.kbdBtn}>
                <T v="headline" color={colors.accent}>
                  Далее
                </T>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Готово" onPress={finishEdit} hitSlop={8} style={styles.kbdBtn}>
              <T v="headline" color={colors.accent} style={{ fontWeight: '700' }}>
                Готово
              </T>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}

      <Sheet visible={infoOpen} onClose={() => setInfoOpen(false)} title={ex.name} subtitle={[...primary, ...secondary].join(' · ')}>
        <View style={{ gap: 10 }} testID="rec">
          {rec ? (
            <T v="num" style={{ fontSize: 24 }} color={colors.text}>
              {rec.weight > 0 ? `${fmtWeight(rec.weight, unit)} ${unitLabel(unit)}` : ex.bodyweight ? 'Свой вес' : 'Подбери вес'} × {timed ? `${fmtSec(rec.repMin)}–${fmtSec(rec.repMax)}` : `${rec.repMin}–${rec.repMax}`}
              {rec.delta && rec.action !== 'new' ? (
                <T v="body" style={{ fontWeight: '700', fontSize: 15 }} color={deltaColor}>
                  {`  ${rec.delta}`}
                </T>
              ) : null}
            </T>
          ) : null}
          {rec ? <T v="callout">{rec.rationale}</T> : null}
          {lastTxt ? (
            <T v="callout" testID="last-result">
              Прошлый раз: <T v="callout" color={colors.text} style={{ fontWeight: '600' }}>{lastTxt}</T>
            </T>
          ) : null}
          {reduced ? (
            <T v="footnote" color={colors.warning}>
              Объём {reduced}% по готовности · веса без повышения
            </T>
          ) : null}
          {we.why ? <T v="callout">{we.why}</T> : null}
          <AutoregTip we={we} step={step} unit={unit} />
          {warm.length ? (
            <MenuRow icon="flame-outline" label={`Добавить разминку: ${warm.map((w) => `${fmtWeight(w.weight, unit)}×${w.reps}`).join(' · ')}`} onPress={() => { haptic.tap(); useWorkouts.getState().addWarmups(we.id, warm); setInfoOpen(false); }} />
          ) : null}
          {layout ? (
            <MenuRow icon="disc-outline" label="Раскладка блинов" onPress={() => { setInfoOpen(false); afterModalClose(() => setPlatesOpen(true)); }} />
          ) : null}
          <MenuRow icon="play-circle-outline" label="Как выполнять" onPress={() => { setInfoOpen(false); afterModalClose(() => setTechOpen(true)); }} />
        </View>
      </Sheet>

      <Sheet visible={platesOpen} onClose={() => setPlatesOpen(false)} title={rec && rec.weight ? `Штанга ${fmtWeight(rec.weight)} кг` : 'Блины'} subtitle={layout ? `Гриф ${fmtWeight(layout.bar)} кг · на каждую сторону` : undefined}>
        {layout ? (
          <View style={{ gap: 8 }} testID="plates">
            {layout.perSide.length ? (
              layout.perSide.map((p, i) => (
                <View key={i} style={styles.plate}>
                  <T v="h3">{fmtWeight(p)} кг</T>
                </View>
              ))
            ) : (
              <T v="body">Только гриф</T>
            )}
            <T v="small" style={{ fontSize: 12 }}>
              Диски и гриф настраиваются в Профиль → Оборудование зала.
            </T>
          </View>
        ) : null}
      </Sheet>

    </View>
  );
}

/** Заметка к упражнению этой тренировки (сохраняется в истории вместе с подходами) */
function ExerciseNoteSheet({ we, onClose }: { we: WorkoutExercise | undefined; onClose: () => void }) {
  const [text, setText] = useState('');
  const [forId, setForId] = useState<string | null>(null);
  if (we && forId !== we.id) {
    setForId(we.id);
    setText(we.note ?? '');
  }
  const save = () => {
    if (!we) return;
    const note = text.trim();
    useWorkouts.getState().patchActive((s) => ({ ...s, exercises: s.exercises.map((x) => (x.id === we.id ? { ...x, note: note || undefined } : x)) }));
    haptic.success();
    onClose();
  };
  return (
    <Sheet visible={!!we} onClose={onClose} title="Заметка к упражнению" subtitle={we ? getExercise(we.exerciseId)?.name : undefined}>
      <View style={{ gap: space.md }}>
        <Field placeholder="Например: сиденье на 4, узкий хват, болело плечо" value={text} onChangeText={setText} multiline maxLength={300} autoFocus />
        <Button title="Сохранить" icon="checkmark" size="lg" onPress={save} />
      </View>
    </Sheet>
  );
}

/** Кнопка нижней панели тренировки */
function BarBtn({ icon, label, onPress, disabled, active, small }: { icon: React.ComponentProps<typeof Icon>['name']; label: string; onPress: () => void; disabled?: boolean; active?: boolean; small?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={6} style={({ pressed }) => [styles.barBtn, small && { width: 40 }, disabled && { opacity: 0.25 }, pressed && { opacity: 0.5 }]}>
      <Icon name={icon} size={small ? 24 : 28} color={active ? colors.accent : colors.textDim} />
    </Pressable>
  );
}

const REST_OPTIONS = [60, 90, 120, 150, 180, 240];

/** Таймер отдыха: выключен по умолчанию; человек сам включает его и выбирает длительность */
function RestSheet({ visible, onClose, onOff }: { visible: boolean; onClose: () => void; onOff: () => void }) {
  const on = useProfile((s) => !!s.settings.restTimer);
  const sec = useProfile((s) => s.settings.defaultRestSec || 120);
  const pick = (v: number | null) => {
    haptic.tap();
    const st = useProfile.getState();
    if (v === null) {
      st.updateSettings({ restTimer: false });
      onOff();
    } else {
      st.updateSettings({ restTimer: true, defaultRestSec: v });
      // Разрешение на уведомления — чтобы конец отдыха был слышен и со свёрнутым приложением
      if (st.settings.restNotify) void ensurePermission();
    }
    onClose();
  };
  const row = (v: number | null, label: string) => {
    const sel = v === null ? !on : on && sec === v;
    return (
      <Pressable key={label} accessibilityRole="radio" accessibilityState={{ checked: sel }} accessibilityLabel={label} onPress={() => pick(v)} style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.7 }]}>
        <T v="body" style={{ flex: 1, fontVariant: ['tabular-nums'] }} color={colors.text}>
          {label}
        </T>
        {sel ? <Icon name="checkmark" size={20} color={colors.accent} /> : null}
      </Pressable>
    );
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Таймер отдыха" subtitle="Отсчёт после каждого рабочего подхода. В конце — вибрация и уведомление, если приложение свёрнуто">
      <View style={{ gap: 8 }} testID="rest-sheet">
        {row(null, 'Выключен')}
        {REST_OPTIONS.map((v) => row(v, fmtSec(v)))}
      </View>
    </Sheet>
  );
}

/** Полоса отдыха над нижней панелью: обратный отсчёт, −15/+15 с, «Пропустить»; в конце — вибрация */
function RestStrip({ endsAt, total, onChange, onSkip, onEnd }: { endsAt: number; total: number; onChange: (endsAt: number) => void; onSkip: () => void; onEnd: () => void }) {
  const [t, setT] = useState(() => Date.now());
  const left = Math.max(0, Math.ceil((endsAt - t) / 1000));
  const over = left === 0;
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!over) return;
    haptic.timerEnd();
    const id = setTimeout(onEnd, 4000);
    return () => clearTimeout(id);
    // onEnd — колбэк родителя, срабатывает один раз на конец отдыха
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);
  const pct = total > 0 ? Math.min(1, Math.max(0, 1 - (endsAt - t) / (total * 1000))) : 1;
  return (
    <View style={styles.rest} testID="rest-strip" accessibilityLiveRegion="polite">
      <View style={[styles.restFill, { width: `${Math.round(pct * 100)}%` }]} />
      <Icon name="timer-outline" size={18} color={over ? colors.accent : colors.textDim} />
      <T v="headline" color={over ? colors.accent : colors.text} style={{ flex: 1, fontVariant: ['tabular-nums'] }} accessibilityLabel={over ? 'Отдых окончен' : `Отдых, осталось ${fmtSec(left)}`}>
        {over ? 'Отдых окончен' : `Отдых ${fmtSec(left)}`}
      </T>
      {!over ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel="Отдых на 15 секунд короче" hitSlop={6} onPress={() => onChange(Math.max(Date.now() + 1000, endsAt - 15000))} style={styles.restBtn}>
            <T v="callout" color={colors.text}>−15</T>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Отдых на 15 секунд длиннее" hitSlop={6} onPress={() => onChange(endsAt + 15000)} style={styles.restBtn}>
            <T v="callout" color={colors.text}>+15</T>
          </Pressable>
        </>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel={over ? 'Скрыть' : 'Пропустить отдых'} hitSlop={6} onPress={onSkip} style={styles.restBtn}>
        <T v="callout" color={colors.accent} style={{ fontWeight: '600' }}>
          {over ? 'OK' : 'Пропустить'}
        </T>
      </Pressable>
    </View>
  );
}

/** Авторегуляция по первым подходам (features/training/autoreg) — меняет только оставшиеся подходы, по кнопке */
function AutoregTip({ we, step, unit }: { we: WorkoutExercise; step: number; unit: 'kg' | 'lb' }) {
  const doneN = we.sets.filter((x) => x.done).length;
  const [hiddenAt, setHiddenAt] = useState(-1);
  const tip = autoregulate(we, step);
  if (!tip || hiddenAt === doneN) return null;
  const apply = () => {
    if (tip.kind !== 'increase' && tip.kind !== 'decrease') return;
    const st = useWorkouts.getState();
    we.sets.filter((x) => !x.done && !x.warmup).forEach((x) => st.updateSet(we.id, x.id, { weight: tip.weight, ...(x.target ? { target: { ...x.target, weight: tip.weight } } : {}) }));
    haptic.success();
    setHiddenAt(doneN);
  };
  return (
    <View style={styles.tip} testID="autoreg">
      <Icon name={tip.kind === 'increase' ? 'trending-up' : tip.kind === 'decrease' ? 'trending-down' : 'remove'} size={15} color={tip.kind === 'decrease' ? colors.warning : colors.accent} />
      <T v="small" color={colors.text} style={{ flex: 1, fontSize: 12 }}>
        {tip.text}
      </T>
      {tip.kind !== 'keep' ? (
        <Pressable accessibilityRole="button" hitSlop={6} onPress={apply}>
          <T v="small" color={colors.accent} style={{ fontWeight: '800', fontSize: 12 }}>
            {`${fmtWeight(tip.weight, unit)} ${unitLabel(unit)}`}
          </T>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Скрыть подсказку" hitSlop={6} onPress={() => setHiddenAt(doneN)}>
        <Icon name="close" size={14} color={colors.muted} />
      </Pressable>
    </View>
  );
}

/** Сколько разминочных подходов человек сделал в прошлый раз в этом упражнении */
function lastWarmupCount(exerciseId: string, sessions: WorkoutSession[]): number | undefined {
  const s = sessions.filter((x) => x.status === 'completed' && x.exercises.some((e) => e.exerciseId === exerciseId)).sort((a, b) => b.startedAt - a.startedAt)[0];
  const we = s?.exercises.find((e) => e.exerciseId === exerciseId);
  const n = we?.sets.filter((x) => x.warmup && x.done).length ?? 0;
  return n > 0 ? n : undefined;
}

/** Состояние карточки подходов вне рендера: набор числа, геометрия строк, прокрутка */
type Live = { edit: { id: string; f: EditField } | null; draft: string | null; rows: Record<string, number>; order: string[]; cur?: string; shown: boolean; scrollY: number; viewH: number };

/**
 * Место строки в списке — сумма высот строк выше (строки идут подряд). Не берём y из onLayout:
 * в браузере он не приходит, если строка только сдвинулась (вставили разминку выше).
 */
function rowBox(L: Live, id: string): { y: number; h: number } | undefined {
  let y = 0;
  for (const k of L.order) {
    const h = L.rows[k];
    if (h == null) return undefined;
    if (k === id) return { y, h };
    y += h;
  }
  return undefined;
}

/** Подсветка — на текущий подход: первый раз на месте, дальше пружиной вниз (вверх при отмене); все сделаны — гаснет */
function placeHighlight(L: Live, hl: { y: Animated.Value; o: Animated.Value }, setH: (h: number) => void, sv: ScrollViewInstance | null) {
  const r = L.cur ? rowBox(L, L.cur) : undefined;
  const reduce = prefersReducedMotion();
  if (!r) {
    if (L.shown) {
      L.shown = false;
      if (reduce) hl.o.setValue(0);
      else Animated.timing(hl.o, { toValue: 0, duration: 220, useNativeDriver: NATIVE }).start();
    }
    return;
  }
  setH(r.h);
  if (!L.shown || reduce) {
    hl.y.setValue(r.y);
    if (reduce) hl.o.setValue(1);
    else Animated.timing(hl.o, { toValue: 1, duration: 200, useNativeDriver: NATIVE }).start();
  } else Animated.spring(hl.y, { toValue: r.y, friction: 9, tension: 70, useNativeDriver: NATIVE }).start();
  L.shown = true;
  // Текущий подход всегда на виду
  if (sv && L.viewH && r.y + r.h > L.scrollY + L.viewH) sv.scrollTo({ y: r.y + r.h - L.viewH + space.md, animated: !reduce });
  else if (sv && r.y < L.scrollY) sv.scrollTo({ y: Math.max(0, r.y - space.xs), animated: !reduce });
}

/** Какое число подхода сейчас набирается: вес или повторы (секунды) */
type EditField = 'w' | 'r';
/** Общая панель над цифровой клавиатурой iOS («Далее» / «Готово»): у number-pad своей клавиши ввода нет */
const KBD_ID = 'set-kbd';

/**
 * Подход (R3, по образцу владельца): номер слева, «70 кг × 10» крупно по центру, справа — галочка после выполнения.
 * Текущий подход подсвечен (подсветка общая на карточку и съезжает вниз после «✓»).
 * Тап по весу или повторам — число прямо в строке становится полем с цифровой клавиатурой (без шторок);
 * значение сохраняется один раз, когда ввод закончен. Тап по номеру — выполнен / отменить, свайп влево — удалить.
 */
const SetRow = memo(function SetRow({
  set,
  idx,
  no,
  unit,
  current,
  editing,
  onComplete,
  onDelete,
  onStartEdit,
  onDraft,
  onEndEdit,
  onSubmitField,
  onRowLayout,
  timed,
  weightCol,
  bodyweight,
  range,
  last,
}: {
  set: ExerciseSet;
  idx: number;
  no: string;
  unit: 'kg' | 'lb';
  /** Текущий (первый невыполненный) подход */
  current: boolean;
  /** Поле, которое сейчас набирается в этой строке */
  editing: EditField | null;
  onComplete: (s: ExerciseSet) => void;
  onDelete: (s: ExerciseSet, i: number) => void;
  onStartEdit: (setId: string, f: EditField) => void;
  onDraft: (v: string) => void;
  onEndEdit: (setId: string, f: EditField) => void;
  /** Клавиша ввода (Android / веб): вес → повторы, повторы → готово */
  onSubmitField: (setId: string, f: EditField) => void;
  onRowLayout: (setId: string, h: number) => void;
  timed?: boolean;
  weightCol: boolean;
  bodyweight: boolean;
  /** Диапазон повторов (секунд) — подсказка, если цели нет */
  range?: string;
  last?: boolean;
}) {
  const [pop] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!set.done) return;
    // ✓ справа — короткий scale/fade при отметке подхода
    pop.setValue(0.4);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 160, useNativeDriver: NATIVE }).start();
  }, [set.done, pop]);
  const done = !!set.done;
  const u = unitLabel(unit);
  const rTxt = (x: number) => (timed ? fmtSec(x) : String(x));
  const wTxt = set.weight ? fmtWeight(toDisplayWeight(set.weight, unit)) : bodyweight ? '0' : '—';
  const repsTxt = set.reps ? rTxt(set.reps) : range ?? '—';
  const t = set.warmup ? undefined : set.target;
  const goal = t ? `, цель ${t.weight > 0 ? `${fmtWeight(t.weight, unit)} ${u} × ` : ''}${rTxt(t.reps)}` : '';
  const state = `${done ? ', выполнен' : current ? ', текущий' : ''}`;
  const wUnit = bodyweight ? `доп. ${u}` : u;

  /** Число в покое (кнопка) или поле ввода на его месте */
  const num = (f: EditField) => {
    const isW = f === 'w';
    if (editing === f) {
      const init = isW ? (set.weight ? String(toDisplayWeight(set.weight, unit)).replace('.', ',') : '') : set.reps ? String(set.reps) : '';
      return (
        <TextInput
          autoFocus
          defaultValue={init}
          placeholder={isW ? '0' : range ?? '0'}
          placeholderTextColor={colors.muted}
          onChangeText={(v) => onDraft(v.replace(/[^0-9.,]/g, ''))}
          onBlur={() => onEndEdit(set.id, f)}
          onSubmitEditing={() => onSubmitField(set.id, f)}
          keyboardType={isW ? 'decimal-pad' : 'number-pad'}
          returnKeyType={isW && weightCol ? 'next' : 'done'}
          blurOnSubmit={false}
          selectTextOnFocus
          inputAccessoryViewID={Platform.OS === 'ios' ? KBD_ID : undefined}
          maxLength={isW ? 6 : 4}
          maxFontSizeMultiplier={1.3}
          accessibilityLabel={`Подход ${no}: ${isW ? `вес, ${wUnit}` : timed ? 'время, секунд' : 'повторы'}`}
          style={[styles.numInput, { width: Math.round((isW ? 104 : 80) * Math.min(PixelRatio.getFontScale(), 1.3)) }]}
          testID={`set-${f}-input-${idx}`}
        />
      );
    }
    const label = isW
      ? `Подход ${no}: вес ${wTxt} ${wUnit}${state}. Изменить`
      : `Подход ${no}: ${timed ? `время ${repsTxt} секунд` : `${repsTxt} повторов`}${goal}${state}. Изменить`;
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { haptic.tap(); onStartEdit(set.id, f); }} hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }} style={({ pressed }) => [styles.numBtn, pressed && { opacity: 0.55 }]} testID={`set-${f}-${idx}`}>
        <T v="metric" color={isW || set.reps ? colors.text : colors.muted} style={styles.setNum}>
          {isW ? wTxt : repsTxt}
        </T>
      </Pressable>
    );
  };

  return (
    <View onLayout={(e) => onRowLayout(set.id, e.nativeEvent.layout.height)}>
      <SwipeRow onDelete={() => onDelete(set, idx)} a11yLabel={`Удалить подход ${no}`} bg={colors.surface} testID={`set-row-${idx}`}>
        <View style={[styles.setRow, !last && styles.setLine]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={done ? `Отменить выполнение подхода ${no}` : `Подход ${no} выполнен`}
            accessibilityState={{ checked: done }}
            onPress={() => onComplete(set)}
            hitSlop={6}
            style={[styles.badge, current && styles.badgeCur]}
            testID={current ? 'set-current' : undefined}
          >
            <T v="callout" color={current ? colors.onAccent : colors.textDim} style={{ fontVariant: ['tabular-nums'], fontWeight: current ? '700' : '400' }}>
              {no}
            </T>
          </Pressable>
          <View style={styles.setMid}>
            <View style={styles.setVals}>
              {weightCol ? (
                <>
                  {num('w')}
                  <T v="callout" color={colors.textDim} maxFontSizeMultiplier={1.4} style={styles.setUnit}>
                    {bodyweight ? `+${u}` : u}
                  </T>
                  <T v="callout" color={colors.muted} maxFontSizeMultiplier={1.4} style={styles.setTimes}>
                    ×
                  </T>
                </>
              ) : null}
              {num('r')}
              {timed ? (
                <T v="callout" color={colors.textDim} maxFontSizeMultiplier={1.4} style={styles.setUnit}>
                  сек
                </T>
              ) : !weightCol ? (
                <T v="callout" color={colors.textDim} maxFontSizeMultiplier={1.4} style={styles.setUnit}>
                  повт.
                </T>
              ) : null}
            </View>
          </View>
          <View style={styles.setRight}>
            {done ? (
              <Animated.View style={{ transform: [{ scale: pop }], opacity: pop }} testID={`set-done-${idx}`}>
                <Icon name="checkmark" size={26} color={colors.accent} />
              </Animated.View>
            ) : null}
          </View>
        </View>
      </SwipeRow>
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
            afterModalClose(() => router.replace('/'));
          }}
        />
        <Button title="Вернуться к тренировке" variant="secondary" onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = themed({
  top: { flexDirection: 'row', alignItems: 'center', gap: space.xxs, paddingHorizontal: space.xs, paddingBottom: space.xxs, backgroundColor: colors.bg },
  pos: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 44, paddingHorizontal: space.xs },
  clock: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: space.sm },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs },
  noteLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.xs },
  refs: { marginTop: space.md, gap: 2 },
  refRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm, minHeight: 32, paddingVertical: 4 },
  refLabel: { width: 108 },
  cardWrap: { flex: 1, paddingHorizontal: space.sm, paddingTop: space.xs, paddingBottom: space.xs },
  exCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: space.xxs, paddingTop: space.xxs, paddingBottom: space.sm },
  exTitle: { textAlign: 'center', fontSize: 24, lineHeight: 30 },
  cardLine: { height: 0.5, backgroundColor: colors.borderStrong },
  cardFoot: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 64, paddingHorizontal: space.sm, paddingVertical: space.xs },
  noteBtn: { flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  tipDot: { position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  setRight: { width: 40, alignItems: 'center', justifyContent: 'center' },
  mainBtn: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: colors.bg },
  mainBtnSpace: { width: 68, height: 68 },
  setMid: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  setVals: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  setNum: { fontSize: 32, lineHeight: 40, fontWeight: '600', fontVariant: ['tabular-nums'] },
  editHint: { width: 40, textAlign: 'center' },
  titleBlock: { alignItems: 'center', gap: 4, paddingHorizontal: 40 },
  muscleCaps: { textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4 },
  infoBtn: { position: 'absolute', right: -6, top: -6 },
  underSets: { flexDirection: 'row', gap: space.xs, marginTop: space.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface2 },
  clockWrap: { position: 'absolute', left: 0, right: 0, height: 44, alignItems: 'center', justifyContent: 'center' },
  setUnit: { marginLeft: 2 },
  setTimes: { marginHorizontal: 8 },
  badge: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  setLine: { borderBottomWidth: 0.5, borderBottomColor: colors.borderStrong },
  badgeCur: { backgroundColor: colors.accent },
  hl: { position: 'absolute', left: space.xxs, right: space.xxs, top: 0, borderRadius: radius.md, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine },
  numBtn: { minHeight: 44, justifyContent: 'center' },
  // Поле на месте числа: та же высота строки (отрицательный отступ), чтобы при наборе строки ниже не сдвигались
  numInput: { height: 52, marginVertical: -6, paddingHorizontal: 8, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.accent, color: colors.text, textAlign: 'center', fontFamily: DISPLAY.semibold, fontSize: 30, fontVariant: ['tabular-nums'], outlineWidth: 0 },
  kbdBar: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingHorizontal: space.md, borderTopWidth: 0.5, borderTopColor: colors.borderStrong },
  kbdBtn: { minHeight: 44, justifyContent: 'center' },
  badgeLive: { borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.surface },
  badgeDone: { backgroundColor: colors.accent },
  addSet: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: space.xxs },
  techRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52, paddingHorizontal: space.md, borderTopWidth: 0.5, borderTopColor: colors.borderStrong, backgroundColor: colors.bg },
  techPanel: { borderTopWidth: 0.5, borderTopColor: colors.borderStrong, backgroundColor: colors.surface },
  doneLine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space.sm },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.md, paddingTop: space.xxs, backgroundColor: colors.bg },
  barBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  rest: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 52, paddingHorizontal: space.md, borderTopWidth: 0.5, borderTopColor: colors.borderStrong, backgroundColor: colors.surface, overflow: 'hidden' },
  restFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: colors.accentDim },
  restBtn: { minHeight: 36, minWidth: 44, paddingHorizontal: 10, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  holdWrap: { paddingHorizontal: space.lg, paddingTop: 4 },
  note: { flexDirection: 'row', gap: 8, alignItems: 'center', padding: 10, borderRadius: radius.md, backgroundColor: colors.warningDim },
  block: { backgroundColor: colors.surface, borderRadius: radius.xl, paddingHorizontal: 10, paddingVertical: 10 },
  thumbBtn: { borderRadius: 18, overflow: 'hidden' },
  thumbPlay: { position: 'absolute', right: 4, bottom: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  techBlock: { gap: space.md, marginTop: space.lg },
  rec: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.surface, gap: 2 },
  last: { padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, gap: 4 },
  setRowCurrent: { backgroundColor: colors.surface, borderRadius: radius.lg, borderBottomColor: 'transparent' },
  ssChip: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: space.xs, paddingVertical: 2, borderRadius: radius.xs, backgroundColor: colors.surface2, marginBottom: space.xs, maxWidth: '100%' },
  navItemSs: { borderLeftWidth: 3, borderLeftColor: colors.accent },
  doneCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface },
  doneIcon: { width: 32, height: 32, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  cta: { position: 'absolute', left: space.lg, right: space.lg },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md },
  navDot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  navDotInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  barTrack: { height: 2, backgroundColor: colors.surface3 },
  barFill: { height: 2, backgroundColor: colors.accent },
  spark: { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: colors.onAccent },
  pr: { position: 'absolute', left: space.lg, right: space.lg, flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.accent, boxShadow: '0px 10px 30px rgba(0,0,0,0.35)' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2, paddingHorizontal: 4 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 72, paddingVertical: space.sm, paddingHorizontal: space.sm },
  input: { flex: 1, minWidth: 0, width: 0, height: 44, borderRadius: radius.sm, backgroundColor: 'transparent', color: colors.text, textAlign: 'center', fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  inputDone: { backgroundColor: 'transparent', borderColor: 'transparent' },
  check: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  feelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 36, paddingBottom: 6 },
  feel: { paddingHorizontal: 10, height: 30, borderRadius: 15, backgroundColor: colors.surface2, justifyContent: 'center' },
  warm: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, marginTop: space.sm, paddingHorizontal: space.xxs },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.surface },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: radius.lg, backgroundColor: colors.surface },
  qBtn: { width: 50, height: 48, borderRadius: radius.md, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  qSep: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: 2 },
  recCard: { gap: 4, paddingVertical: 4 },
  plate: { padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center' },
  techBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 36, borderRadius: 18, backgroundColor: colors.surface2 },
  setCard: { gap: 8, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface },
  feelCard: { gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface2 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 52, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.surface2 },
  alt: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2 },
  rpe: { width: 48, height: 44, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});

/** Секундомер тренировки: тикает сам, не перерисовывая весь экран */
function Elapsed({ startedAt }: { startedAt: number }) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{formatDuration((t - startedAt) / 1000)}</>;
}
