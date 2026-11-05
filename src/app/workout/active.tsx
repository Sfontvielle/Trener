import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, PanResponder, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BodyArea, Exercise, ExerciseSet, WorkoutExercise, WorkoutSession } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Button, EmptyState, Icon, IconButton, T } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { SwipeRow } from '@/components/ds/SwipeRow';
import { confirm, toast, useDialog } from '@/components/Dialog';
import { useWorkouts, hasProgress } from '@/stores/workouts';
import { useProfile } from '@/stores/profile';
import { useCheckins } from '@/stores/checkins';
import { useHealth } from '@/stores/health';
import { getExercise, GROUP_LABEL } from '@/data/exercises';
import { effectiveIncrement, historyFor, isPersonalRecord, PR_HISTORY, TIME_STEP_SEC } from '@/features/training/progression';
import { alternativesFor } from '@/features/training/planGenerator';
import { DEFAULT_SETS, makeWorkoutExercise } from '@/features/training/session';
import { readinessFor } from '@/features/recovery/derive';
import { ExercisePickerSheet } from '@/features/exercises/ExercisePickerSheet';
import { Field } from '@/components/inputs';
import { TechniquePanel } from '@/features/exercises/TechniquePanel';
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
import { formatDuration, plural, today } from '@/utils/date';
import { fmtSec, fmtWeight, fromDisplayWeight, parseDecimal, toDisplayWeight, unitLabel } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';
import { noIncreaseReason } from '@/features/health/current';
import { prefersReducedMotion } from '@/components/motion';
import { afterModalClose } from '@/components/modalGate';
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
          : { icon: 'arrow-forward' as const, title: `Далее: ${getExercise(active.exercises[nextI].exerciseId, customs)?.name ?? 'следующее'}`, label: `Далее: ${getExercise(active.exercises[nextI].exerciseId, customs)?.name ?? 'следующее'}`, onPress: () => goTo(nextI, 1) };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Шапка (R2): свернуть · «1/8 ▾» — все упражнения · крупное время тренировки по центру (меню тренировки) · ⋯ */}
      <View style={[styles.top, { paddingTop: insets.top + 4 }]}>
        <IconButton name="chevron-down" label="Свернуть тренировку (всё сохранено)" bg="transparent" onPress={collapse} />
        <Pressable accessibilityRole="button" accessibilityLabel="Список упражнений" accessibilityValue={{ text: count ? `Упражнение ${idx + 1} из ${count}` : 'Нет упражнений' }} onPress={() => setNavOpen(true)} hitSlop={8} style={({ pressed }) => [styles.pos, pressed && { opacity: 0.6 }]}>
          <T v="headline" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }} testID="exercise-position">
            {count ? `${idx + 1}/${count}` : '0/0'}
          </T>
          <Icon name="chevron-down" size={14} color={colors.textDim} />
        </Pressable>
        <View style={{ flex: 1 }} />
        <IconButton name="ellipsis-horizontal" label="Действия с упражнением" bg="transparent" disabled={!we} onPress={() => we && setMenuFor(we.id)} />
        <View style={[styles.clockWrap, { top: insets.top + 4 }]} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel="Тренировка: время, калории, завершение" onPress={() => setWorkoutMenu(true)} hitSlop={6} style={({ pressed }) => [styles.clock, pressed && { opacity: 0.6 }]}>
            <T v="title1" maxFontSizeMultiplier={1.2} style={{ fontVariant: ['tabular-nums'], fontWeight: '700', fontSize: 30, lineHeight: 36 }} testID="workout-elapsed">
              <Elapsed startedAt={active.startedAt} />
            </T>
            <Icon name="caret-down" size={12} color={colors.textDim} />
          </Pressable>
        </View>
      </View>
      <AnimatedBar progress={progress} />

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
              {center ? <Button title={center.title} accessibilityLabel={center.label} icon={center.icon} size="lg" onPress={center.onPress} style={{ flex: 1 }} testID="workout-cta" /> : <View style={{ flex: 1 }} />}
              <BarBtn icon="timer-outline" label={restOn ? `Таймер отдыха: ${fmtSec(useProfile.getState().settings.defaultRestSec || 120)}` : 'Таймер отдыха: выключен'} active={restOn} onPress={() => setRestOpen(true)} small />
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
function completeSetFor({ we, set, index, unit, onPr, onNavigate, onRest }: { we: WorkoutExercise; set: ExerciseSet; index: number; unit: 'kg' | 'lb'; onPr: (t: string) => void; onNavigate?: (i: number) => void; onRest?: (nextLabel?: string) => void }) {
  const st = useWorkouts.getState();
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
  // Редактор подхода (R2): тап по строке — лист с крупными «−/+» и вводом с клавиатуры
  const [editId, setEditId] = useState<string | null>(null);
  const winH = useWindowDimensions().height;
  if (!ex) return null;
  const last = history[0];
  const rec = we.recommendation;
  const nextSet = we.sets.find((s) => !s.done);
  const doneCount = we.sets.filter((s) => s.done).length;
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
  const recTxt = rec ? `${rec.weight > 0 ? `${fmtWeight(rec.weight, unit)} ${unitLabel(unit)} × ` : ''}${timed ? `${fmtSec(rec.repMin)}–${fmtSec(rec.repMax)}` : `${rec.repMin}–${rec.repMax}`}` : '';
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

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: space.md }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        {ssLabel ? (
          <View style={styles.ssChip} testID="superset-chip">
            <Icon name="link" size={12} color={colors.textDim} />
            <T v="footnote" color={colors.text} numberOfLines={1}>
              Суперсет {ssLabel}
              {ssNext ? ` → ${ssNext}` : ''}
            </T>
          </View>
        ) : null}
        {/* Название по центру крупно (R2), под ним мышцы мелкими заглавными; «ⓘ» — рекомендация, история, блины */}
        <View style={styles.titleBlock}>
          <T v="title1" accessibilityRole="header" style={{ textAlign: 'center' }} numberOfLines={3}>
            {ex.name}
          </T>
          <T v="caption" numberOfLines={2} style={styles.muscleCaps} testID="exercise-muscles">
            {muscles}
          </T>
          <IconButton name="information-circle-outline" label="Рекомендация, почему" bg="transparent" color={colors.textDim} onPress={openInfo} style={styles.infoBtn} />
        </View>
        {we.note ? (
          <View style={styles.noteLine}>
            <Icon name="document-text-outline" size={14} color={colors.textDim} />
            <T v="footnote" color={colors.text} numberOfLines={2} style={{ flex: 1 }} testID="exercise-note">
              {we.note}
            </T>
          </View>
        ) : null}

        {/* «Прошлый раз» и предложение RYNJI — строками StatRow; подходы уже заполнены предложением */}
        {lastTxt || (rec && rec.action !== 'new' && (rec.weight > 0 || ex.bodyweight)) ? (
          <View style={styles.refs}>
            {lastTxt ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Прошлый раз: ${lastTxt}. Рекомендация и история`} onPress={openInfo} style={styles.refRow} testID="last-result">
                <T v="callout" style={styles.refLabel}>
                  Прошлый раз
                </T>
                <T v="bodyStrong" style={{ flex: 1, fontVariant: ['tabular-nums'] }} numberOfLines={2}>
                  {lastTxt}
                </T>
              </Pressable>
            ) : null}
            {rec && rec.action !== 'new' && (rec.weight > 0 || ex.bodyweight) ? (
              <Pressable accessibilityRole="button" accessibilityLabel={`Предложение ${BRAND}: ${recTxt}${rec.delta ? `, ${rec.delta}` : ''}. Почему`} onPress={openInfo} style={styles.refRow} testID="rynji-suggestion">
                <T v="callout" style={styles.refLabel}>
                  {BRAND}
                </T>
                <T v="bodyStrong" style={{ flex: 1, fontVariant: ['tabular-nums'] }} numberOfLines={2}>
                  {recTxt}
                </T>
                {rec.delta ? (
                  <T v="callout" color={deltaColor} style={{ fontWeight: '600', flexShrink: 1, textAlign: 'right' }} numberOfLines={2}>
                    {rec.delta}
                  </T>
                ) : null}
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {reduced ? (
          <T v="footnote" color={colors.warning} style={{ marginTop: space.xs }}>
            Объём {reduced}% по готовности · веса без повышения
          </T>
        ) : null}

        {warm.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Добавить разминку" onPress={() => { haptic.tap(); useWorkouts.getState().addWarmups(we.id, warm); }} hitSlop={6} style={({ pressed }) => [styles.warm, pressed && { opacity: 0.6 }]}>
            <Icon name="add" size={16} color={colors.textDim} />
            <T v="callout" numberOfLines={1} style={{ flex: 1 }}>
              <T v="callout" color={colors.text}>
                Разминка
              </T>
              {`  ${warm.map((w) => `${fmtWeight(w.weight, unit)}×${w.reps}`).join(' · ')}`}
            </T>
          </Pressable>
        ) : null}

        {/* Подходы — крупными строками «65 кг × 10»: номер слева (тап — отметить), цель над строкой, свайп влево — удалить */}
        <View style={styles.sets}>
          {we.sets.map((x, i) => {
            const k = we.sets.slice(0, i).filter((y) => !y.warmup).length;
            const no = x.warmup ? 'Р' : String(k + 1);
            const prev = x.warmup ? undefined : (last?.sets[k] ?? undefined);
            return (
              <SetRow
                key={x.id}
                weId={we.id}
                set={x}
                idx={i}
                no={no}
                unit={unit}
                onComplete={onComplete}
                onDelete={deleteSet}
                onEdit={() => setEditId(x.id)}
                current={x === nextSet}
                timed={timed}
                weightCol={weightCol}
                bodyweight={!!ex.bodyweight}
                prev={prev}
                range={rec ? (timed ? `${fmtSec(rec.repMin)}–${fmtSec(rec.repMax)}` : `${rec.repMin}–${rec.repMax}`) : undefined}
                last={i === we.sets.length - 1}
              />
            );
          })}
        </View>
        <View style={styles.underSets}>
          <Pressable accessibilityRole="button" accessibilityLabel="Добавить подход" onPress={() => { haptic.tap(); useWorkouts.getState().addSet(we.id); }} hitSlop={6} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.6 }]}>
            <Icon name="add" size={18} color={colors.text} />
            <T v="callout" color={colors.text}>Подход</T>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={we.note ? 'Изменить заметку к упражнению' : 'Заметка к упражнению'} onPress={() => { haptic.tap(); onNote(); }} hitSlop={6} style={({ pressed }) => [styles.pill, pressed && { opacity: 0.6 }]} testID="note-button">
            <Icon name={we.note ? 'document-text' : 'create-outline'} size={17} color={colors.text} />
            <T v="callout" color={colors.text}>Заметка</T>
          </Pressable>
        </View>
        <AutoregTip we={we} step={step} unit={unit} />
        {!nextSet ? (
          <View style={styles.doneLine}>
            <Icon name={allDone ? 'trophy-outline' : 'checkmark-circle'} size={18} color={colors.accent} />
            <T v="callout" color={colors.text} numberOfLines={2} style={{ flexShrink: 1 }}>
              {allDone ? 'Все упражнения выполнены' : `Готово · ${doneCount}/${we.sets.length}`}
              {!allDone && !isLast && nextName ? ` · далее ${nextName}` : ''}
            </T>
          </View>
        ) : null}
      </ScrollView>

      {/* «Техника» — одной строкой внизу; раскрывается вверх до 45% высоты, подходы над ней остаются видны */}
      {techOpen ? (
        <View style={[styles.techPanel, { maxHeight: Math.round(winH * 0.45) }]} testID="technique-inline">
          <ScrollView nestedScrollEnabled contentContainerStyle={{ padding: space.md }} showsVerticalScrollIndicator={false}>
            <TechniquePanel ex={ex} sex={sex} />
          </ScrollView>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Техника выполнения"
        accessibilityState={{ expanded: techOpen }}
        aria-expanded={techOpen}
        onPress={() => { haptic.tap(); setTechOpen(!techOpen); }}
        style={({ pressed }) => [styles.techRow, pressed && { backgroundColor: colors.surface2 }]}
        testID="technique-toggle"
      >
        <Icon name="information-circle-outline" size={20} color={colors.textDim} />
        <T v="body" style={{ flex: 1 }}>
          Техника и мышцы
        </T>
        <Icon name={techOpen ? 'chevron-down' : 'chevron-up'} size={16} color={colors.muted} />
      </Pressable>

      <SetEditor we={we} setId={editId} onClose={() => setEditId(null)} unit={unit} step={step} timed={timed} weightCol={weightCol} bodyweight={!!ex.bodyweight} onComplete={onComplete} />

      <Sheet visible={infoOpen} onClose={() => setInfoOpen(false)} title={ex.name} subtitle={[...primary, ...secondary].join(' · ')}>
        <View style={{ gap: 10 }} testID="rec">
          {rec ? (
            <T v="num" style={{ fontSize: 24 }} color={colors.text}>
              {rec.weight > 0 ? `${fmtWeight(rec.weight, unit)} ${unitLabel(unit)}` : ex.bodyweight ? 'Свой вес' : 'Подбери вес'} × {timed ? `${fmtSec(rec.repMin)}–${fmtSec(rec.repMax)}` : `${rec.repMin}–${rec.repMax}`}
              {rec.delta && rec.action !== 'new' ? (
                <T v="body" style={{ fontWeight: '800', fontSize: 15 }} color={rec.action === 'increase' ? colors.accent : rec.action === 'decrease' ? colors.warning : colors.textDim}>
                  {`  ${rec.delta}`}
                </T>
              ) : null}
            </T>
          ) : null}
          {rec ? <T v="small" style={{ fontSize: 14 }}>{rec.rationale}</T> : null}
          {lastTxt && !/Прошлый раз/i.test(rec?.rationale ?? '') ? <T v="small">Прошлый раз: {lastTxt}</T> : null}
          {we.why ? <T v="small">{we.why}</T> : null}
          {layout ? (
            <MenuRow icon="disc-outline" label="Раскладка блинов" onPress={() => { setInfoOpen(false); afterModalClose(() => setPlatesOpen(true)); }} />
          ) : null}
          <MenuRow icon="play-circle-outline" label="Как выполнять" onPress={() => { setInfoOpen(false); setTechOpen(true); }} />
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

/**
 * Подход — крупной строкой «65 кг × 10» (R1, по образцу владельца): номер слева, над числами — цель на этот подход
 * и прошлый результат, свайп влево — удалить. Тап по номеру — подход выполнен (повторный — отменить), так же как
 * главная кнопка внизу. Тап по числам — редактор подхода (R2): крупные «−/+» и ввод с клавиатуры в отдельном листе,
 * поэтому понятно, что и где меняется, а экран не перерисовывается на каждую цифру.
 */
const SetRow = memo(function SetRow({
  set,
  idx,
  no,
  unit,
  onComplete,
  onDelete,
  onEdit,
  current,
  timed,
  weightCol,
  bodyweight,
  prev,
  range,
  last,
}: {
  weId: string;
  set: ExerciseSet;
  idx: number;
  no: string;
  unit: 'kg' | 'lb';
  onComplete: (s: ExerciseSet) => void;
  onDelete: (s: ExerciseSet, i: number) => void;
  onEdit: () => void;
  current?: boolean;
  timed?: boolean;
  weightCol: boolean;
  bodyweight: boolean;
  /** Этот же подход в прошлый раз */
  prev?: { weight: number; reps: number };
  /** Диапазон повторов (секунд) — подсказка, если цели нет */
  range?: string;
  last?: boolean;
}) {
  const [pop] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (!set.done) return;
    // ✓ — короткий scale/fade при отметке подхода
    pop.setValue(0.5);
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 160, useNativeDriver: NATIVE }).start();
  }, [set.done, pop]);
  const done = !!set.done;
  const live = current && !done;
  const color = done || live ? colors.text : colors.textDim;
  const u = unitLabel(unit);
  const rTxt = (x: number) => (timed ? fmtSec(x) : String(x));
  const wTxt = set.weight ? fmtWeight(toDisplayWeight(set.weight, unit)) : bodyweight ? '0' : '—';
  const repsTxt = set.reps ? rTxt(set.reps) : range ?? '—';

  // Цель над строкой: «Цель 65 кг × 10 · было 9»; рост к прошлому разу — акцентом со стрелкой
  const t = set.warmup ? undefined : set.target;
  let goal: React.ReactNode = null;
  if (t) {
    const pickWeight = t.weight === 0 && !bodyweight && !timed;
    const main = pickWeight ? `подбери вес · ${range ?? rTxt(t.reps)}` : `${t.weight > 0 ? `${fmtWeight(t.weight, unit)} ${u} × ` : ''}${rTxt(t.reps)}${timed || t.weight > 0 ? '' : ` ${plural(t.reps, 'повтор', 'повтора', 'повторов')}`}`;
    const up = !!prev && !pickWeight && (t.weight > prev.weight || (t.weight === prev.weight && t.reps > prev.reps));
    const was = prev ? `было ${prev.weight !== t.weight && prev.weight > 0 ? `${fmtWeight(prev.weight, unit)} × ` : ''}${rTxt(prev.reps)}` : '';
    goal = (
      <T v="footnote" numberOfLines={1} style={{ textAlign: 'center' }} testID={`set-goal-${idx}`}>
        <T v="footnote" color={done ? colors.textDim : up ? colors.accent : colors.text} style={{ fontWeight: '600' }}>
          {`${up && !done ? '↑ ' : ''}Цель ${main}`}
        </T>
        {was ? ` · ${was}` : ''}
      </T>
    );
  }
  const valueLabel = `${weightCol ? `${wTxt} ${bodyweight ? `доп. ${u}` : u} × ` : ''}${repsTxt}${timed ? ' сек' : ' повторов'}`;

  return (
    <SwipeRow onDelete={() => onDelete(set, idx)} a11yLabel={`Удалить подход ${no}`} bg={colors.bg} testID={`set-row-${idx}`}>
      <View style={[styles.setRow, live && styles.setRowCurrent, !last && styles.setLine]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={done ? `Отменить выполнение подхода ${no}` : `Подход ${no} выполнен`}
          accessibilityState={{ checked: done }}
          onPress={() => onComplete(set)}
          hitSlop={6}
          style={[styles.badge, live && styles.badgeLive, done && styles.badgeDone]}
        >
          {done ? (
            <Animated.View style={{ transform: [{ scale: pop }], opacity: pop }}>
              <Icon name="checkmark" size={20} color={colors.onAccent} />
            </Animated.View>
          ) : (
            <T v="callout" color={live ? colors.text : colors.textDim} style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}>
              {no}
            </T>
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Подход ${no}: ${valueLabel}. Изменить`}
          onPress={() => { haptic.tap(); onEdit(); }}
          style={({ pressed }) => [styles.setMid, pressed && { opacity: 0.55 }]}
          testID={`set-edit-${idx}`}
        >
          {goal}
          <View style={styles.setVals}>
            {weightCol ? (
              <>
                <T v="metric" color={color} style={styles.setNum}>
                  {wTxt}
                </T>
                <T v="callout" color={colors.textDim} maxFontSizeMultiplier={1.4} style={styles.setUnit}>
                  {bodyweight ? `+${u}` : u}
                </T>
                <T v="callout" color={colors.muted} maxFontSizeMultiplier={1.4} style={styles.setTimes}>
                  ×
                </T>
              </>
            ) : null}
            <T v="metric" color={set.reps ? color : colors.muted} style={styles.setNum}>
              {repsTxt}
            </T>
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
        </Pressable>
        <Icon name="create-outline" size={18} color={colors.muted} style={styles.editHint} />
      </View>
    </SwipeRow>
  );
});

/** Кнопка «−/+» редактора: крупная, с отдачей; удержание повторяет шаг */
function StepBtn({ icon, label, onPress }: { icon: 'add' | 'remove'; label: string; onPress: () => void }) {
  const rep = useRef<ReturnType<typeof setInterval> | null>(null);
  const stop = () => {
    if (rep.current) clearInterval(rep.current);
    rep.current = null;
  };
  useEffect(() => stop, []);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => { haptic.tap(); onPress(); }}
      onLongPress={() => { stop(); rep.current = setInterval(onPress, 110); }}
      onPressOut={stop}
      delayLongPress={350}
      hitSlop={6}
      style={({ pressed }) => [styles.stepBtn, pressed && { backgroundColor: colors.surface3 }]}
    >
      <Icon name={icon} size={28} color={colors.text} />
    </Pressable>
  );
}

/** Поле редактора: подпись, «−», крупное число (тап — клавиатура), «+» */
function StepField({ label, value, onChange, step, decimals, testID }: { label: string; value: string; onChange: (v: string) => void; step: number; decimals: boolean; testID: string }) {
  const num = parseDecimal(value);
  const cur = Number.isFinite(num) ? num : 0;
  const fmt = (x: number) => (decimals ? String(Math.round(x * 100) / 100).replace('.', ',') : String(Math.round(x)));
  return (
    <View style={styles.field}>
      <T v="footnote" style={{ textAlign: 'center' }}>
        {label}
      </T>
      <View style={styles.fieldRow}>
        <StepBtn icon="remove" label={`${label}: меньше на ${String(step).replace('.', ',')}`} onPress={() => onChange(fmt(Math.max(0, cur - step)))} />
        <TextInput
          value={value}
          onChangeText={(v) => onChange(v.replace(/[^0-9.,]/g, ''))}
          keyboardType={decimals ? 'decimal-pad' : 'number-pad'}
          selectTextOnFocus
          maxFontSizeMultiplier={1.3}
          accessibilityLabel={label}
          placeholder="0"
          placeholderTextColor={colors.muted}
          style={styles.fieldInput}
          testID={testID}
        />
        <StepBtn icon="add" label={`${label}: больше на ${String(step).replace('.', ',')}`} onPress={() => onChange(fmt(cur + step))} />
      </View>
    </View>
  );
}

/**
 * Редактор подхода (R2): вес и повторы (секунды) крупно, «−/+» с шагом снаряда, число можно набрать.
 * Изменения сохраняются одним действием — «Сохранить» или «Записать подход».
 */
function SetEditor({ we, setId, onClose, unit, step, timed, weightCol, bodyweight, onComplete }: { we: WorkoutExercise; setId: string | null; onClose: () => void; unit: 'kg' | 'lb'; step: number; timed: boolean; weightCol: boolean; bodyweight: boolean; onComplete: (s: ExerciseSet) => void }) {
  const set = setId ? we.sets.find((x) => x.id === setId) : undefined;
  const [draft, setDraft] = useState<{ id: string; w: string; r: string } | null>(null);
  // Новый подход в редакторе — черновик из его значений (паттерн «состояние от пропсов» без эффекта)
  if (set && draft?.id !== set.id) setDraft({ id: set.id, w: set.weight ? String(toDisplayWeight(set.weight, unit)).replace('.', ',') : '', r: set.reps ? String(set.reps) : '' });
  const k = set ? we.sets.filter((x) => !x.warmup).indexOf(set) + 1 : 0;
  const title = set ? (set.warmup ? 'Разминочный подход' : `Подход ${k}`) : '';
  const commit = (): ExerciseSet | null => {
    if (!set || !draft) return null;
    const w = parseDecimal(draft.w);
    const r = parseInt(draft.r, 10);
    const patch: Partial<ExerciseSet> = { weight: Number.isFinite(w) ? fromDisplayWeight(w, unit) : 0, reps: Number.isFinite(r) ? r : 0 };
    useWorkouts.getState().updateSet(we.id, set.id, patch);
    return { ...set, ...patch };
  };
  const t = set?.target;
  const wStep = unit === 'lb' ? 5 : step;
  return (
    <Sheet visible={!!set} onClose={onClose} title={title} subtitle={t && !set?.warmup ? `Цель: ${t.weight > 0 ? `${fmtWeight(t.weight, unit)} ${unitLabel(unit)} × ` : ''}${timed ? fmtSec(t.reps) : t.reps}` : undefined}>
      {set && draft ? (
        <View style={{ gap: space.lg }} testID="set-editor">
          {weightCol ? <StepField label={bodyweight ? `Доп. вес, ${unitLabel(unit)}` : `Вес, ${unitLabel(unit)}`} value={draft.w} onChange={(w) => setDraft({ ...draft, w })} step={wStep} decimals testID="edit-weight" /> : null}
          <StepField label={timed ? 'Время, сек' : 'Повторы'} value={draft.r} onChange={(r) => setDraft({ ...draft, r })} step={timed ? TIME_STEP_SEC : 1} decimals={false} testID="edit-reps" />
          <View style={{ gap: space.xs }}>
            {!set.done ? (
              <Button
                title="Записать подход"
                icon="checkmark"
                size="lg"
                full
                onPress={() => {
                  const s2 = commit();
                  onClose();
                  if (s2) afterModalClose(() => onComplete(s2));
                }}
                testID="edit-complete"
              />
            ) : null}
            <Button title="Сохранить" variant={set.done ? 'primary' : 'secondary'} size={set.done ? 'lg' : 'md'} full onPress={() => { commit(); onClose(); }} testID="edit-save" />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

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
  sets: { marginTop: space.lg },
  setLine: { borderBottomWidth: 0.5, borderBottomColor: colors.borderStrong },
  setMid: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 },
  setVals: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  setNum: { fontSize: 32, lineHeight: 40, fontWeight: '600', fontVariant: ['tabular-nums'] },
  editHint: { width: 40, textAlign: 'center' },
  titleBlock: { alignItems: 'center', gap: 4, paddingHorizontal: 40 },
  muscleCaps: { textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.6 },
  infoBtn: { position: 'absolute', right: -6, top: -6 },
  underSets: { flexDirection: 'row', gap: space.xs, marginTop: space.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface2 },
  clockWrap: { position: 'absolute', left: 0, right: 0, height: 44, alignItems: 'center', justifyContent: 'center' },
  field: { gap: space.xs },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  fieldInput: { flex: 1, minWidth: 0, height: 64, borderRadius: radius.lg, backgroundColor: colors.surface2, color: colors.text, textAlign: 'center', fontSize: 36, fontWeight: '700', fontVariant: ['tabular-nums'], outlineWidth: 0 },
  stepBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  setUnit: { marginLeft: 2 },
  setTimes: { marginHorizontal: 8 },
  badge: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  badgeLive: { borderWidth: 1.5, borderColor: colors.accent, backgroundColor: colors.surface },
  badgeDone: { backgroundColor: colors.accent },
  addSet: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: space.xxs },
  techRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 52, paddingHorizontal: space.md, borderTopWidth: 0.5, borderTopColor: colors.borderStrong, backgroundColor: colors.bg },
  techPanel: { borderTopWidth: 0.5, borderTopColor: colors.borderStrong, backgroundColor: colors.surface },
  doneLine: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: space.sm },
  bar: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.xs, paddingTop: space.xs, borderTopWidth: 0.5, borderTopColor: colors.borderStrong, backgroundColor: colors.bg },
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
  setRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 76, paddingVertical: space.sm, paddingHorizontal: space.xs },
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
