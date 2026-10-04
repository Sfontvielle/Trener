import React, { memo, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, PanResponder, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BodyArea, Exercise, ExerciseSet, SetFeel, WorkoutExercise, WorkoutSession } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Button, EmptyState, Icon, IconButton, T } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { DrawerScroll, SideDrawer } from '@/components/SideDrawer';
import { confirm, toast, useDialog } from '@/components/Dialog';
import { useWorkouts, hasProgress } from '@/stores/workouts';
import { useProfile } from '@/stores/profile';
import { useCheckins } from '@/stores/checkins';
import { useHealth } from '@/stores/health';
import { getExercise, GROUP_LABEL } from '@/data/exercises';
import { effectiveIncrement, historyFor, isPersonalRecord } from '@/features/training/progression';
import { alternativesFor } from '@/features/training/planGenerator';
import { DEFAULT_SETS, makeWorkoutExercise } from '@/features/training/session';
import { readinessFor } from '@/features/recovery/derive';
import { ExercisePickerSheet } from '@/features/exercises/ExercisePickerSheet';
import { prefetchExerciseMedia } from '@/features/exercises/ExerciseMedia';
import { TechniqueView } from '@/features/exercises/TechniqueView';
import { sessionEnergy } from '@/features/training/energy';
import { EnergySheet } from '@/features/training/EnergySheet';
import { useBody } from '@/stores/body';
import { latestTrendWeight } from '@/features/progress/weightTrend';
import { currentIndexOf, isExerciseDone, navItems, nextIndex, nextSetLabel, prevIndex, remainingInfo, workoutProgress } from '@/features/training/workoutNav';
import { RestTimerBar } from '@/features/training/RestTimer';
import { exerciseFlag, guardExercise, prefDiscomfort, prefDislike, prefExclude, prefFavorite } from '@/features/training/prefActions';
import { warmupPlan } from '@/features/training/warmup';
import { DEFAULT_GYM, equipmentStep, loadKind, plateLayout } from '@/features/training/equipment';
import { autoregulate } from '@/features/training/autoreg';
import { formatDuration, today } from '@/utils/date';
import { fmtWeight, fromDisplayWeight, parseDecimal, toDisplayWeight, unitLabel } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';
import { noIncreaseReason } from '@/features/health/current';
import { prefersReducedMotion } from '@/components/motion';

/** Обработчик свайпа текущего экрана тренировки (экран один — модульная переменная безопасна) */
let swipeGo: ((dir: 1 | -1) => void) | null = null;
const swipeNav = (dir: 1 | -1) => swipeGo?.(dir);

/** Как прошёл подход — понятными словами; внутри переводится в запас повторов (RIR) для прогрессии */
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
  const [swapFor, setSwapFor] = useState<string | null>(null);
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

  // Экран целиком не перерисовывается каждую секунду (это давало подтормаживания на длинной тренировке):
  // секундомер — отдельный компонент <Elapsed>, энергия обновляется раз в 30 с, конец отдыха — точным таймером.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  const restEnd = rest?.endsAt;
  useEffect(() => {
    if (!restEnd) return;
    const id = setTimeout(() => setNow(Date.now()), Math.max(0, restEnd + 1600 - Date.now()));
    return () => clearTimeout(id);
  }, [restEnd]);
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
    return { sessions, customs, band: r?.band, volumeFactor: 1, rirDelta: 0, gym: useProfile.getState().settings.gym, noIncrease: noIncreaseReason() };
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
    useDialog.getState().show('Некоторые упражнения ещё не завершены. Закончить тренировку?', `Не выполнено подходов: ${left} (${names.slice(0, 3).join(', ')}${names.length > 3 ? '…' : ''}). Невыполненные подходы не сохранятся.`, [
      { text: 'Вернуться', style: 'cancel' },
      ...(firstLeft >= 0 && firstLeft !== currentIndexOf(a) ? [{ text: 'К пропущенному', onPress: () => goTo(firstLeft) }] : []),
      { text: 'Завершить', style: 'destructive' as const, onPress: finish },
    ]);
  };


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
            <Elapsed startedAt={active.startedAt} />
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
                count={count}
                unit={unit}
                nextName={nextI >= 0 ? getExercise(active.exercises[nextI].exerciseId, customs)?.name : undefined}
                isLast={nextI < 0}
                allDone={allDone}
                onMenu={() => setMenuFor(we.id)}
                onSwap={() => setSwapFor(we.id)}
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
          {allDone ? (
            <Button title="ЗАВЕРШИТЬ ТРЕНИРОВКУ" icon="flag" size="lg" onPress={askFinish} />
          ) : resting ? (
            <RestTimerBar inline />
          ) : ctaSet ? (
            <Button title={ctaSet.warmup ? 'Разминка — готово' : `Завершить подход ${we.sets.filter((x) => !x.warmup).indexOf(ctaSet) + 1}`} icon="checkmark" size="lg" onPress={() => completeSetFor({ we, set: ctaSet, index: idx, unit, onPr: (text) => setPr({ text, n: (pr?.n ?? 0) + 1 }) })} />
          ) : nextI < 0 ? (
            <Button title="ЗАВЕРШИТЬ ТРЕНИРОВКУ" icon="flag" size="lg" onPress={askFinish} />
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

      <Sheet visible={!!swapFor} onClose={() => setSwapFor(null)} title="Заменить упражнение" subtitle="Подберём альтернативу на те же мышцы и движение">
        {swapFor ? (
          <View style={{ gap: 8 }}>
            <MenuRow icon="time-outline" label="Тренажёр занят" onPress={() => { const id = swapFor; setSwapFor(null); setTimeout(() => setPicker({ mode: 'swap', weId: id }), 250); }} />
            <MenuRow icon="construct-outline" label="Нет нужного оборудования" onPress={() => { const id = swapFor; setSwapFor(null); setTimeout(() => setPicker({ mode: 'swap', weId: id }), 250); }} />
            <MenuRow icon="medkit-outline" label="Дискомфорт или боль" onPress={() => { const id = swapFor; setSwapFor(null); setTimeout(() => setPainFor(id), 250); }} />
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
  if (!set.warmup && isPersonalRecord(ex, { ...set, done: true }, history)) {
    haptic.record();
    onPr(`${ex.name} · ${set.weight ? `${fmtWeight(set.weight)} × ${set.reps}` : `${set.reps} повт.`}`);
  }
  const settings = useProfile.getState().settings;
  const a = useWorkouts.getState().active;
  // После последнего подхода тренировки отдых не нужен — сразу показываем «Завершить тренировку»
  const workoutComplete = !!a && a.exercises.every((x) => x.sets.every((y) => y.done));
  if (workoutComplete) st.stopRest?.();
  if (settings.restTimerAuto && a && !workoutComplete) {
    const label = nextSetLabel(a, index, (w) => `${fmtWeight(w, unit)}`, (id) => getExercise(id, customs)?.name ?? '');
    // Отдых по программе: тяжёлые базовые — дольше, изоляция — короче (задано в плане); после разминки — 45 с
    st.startRest(set.warmup ? 45 : we.restSec || settings.defaultRestSec, label);
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
      <DrawerScroll contentContainerStyle={{ gap: 6, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
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
      </DrawerScroll>
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
  count,
  unit,
  onMenu,
  nextName,
  isLast,
  allDone,
  onSwap,
  onPr,
}: {
  we: WorkoutExercise;
  index: number;
  count: number;
  unit: 'kg' | 'lb';
  onMenu: () => void;
  nextName?: string;
  isLast: boolean;
  allDone: boolean;
  onSwap: () => void;
  onPr: (text: string) => void;
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
  const [whyOpen, setWhyOpen] = useState(false);
  const [techOpen, setTechOpen] = useState(false);
  const [platesOpen, setPlatesOpen] = useState(false);
  if (!ex) return null;
  const last = history[0];
  const rec = we.recommendation;
  const isBw = ex.bodyweight;
  const nextSet = we.sets.find((s) => !s.done);
  const doneCount = we.sets.filter((s) => s.done).length;
  const lastDone = [...we.sets].reverse().find((s) => s.done);

  const completeSet = (set: ExerciseSet) => completeSetFor({ we, set, index, unit, onPr });

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
  const lastTxt = last ? last.sets.map((x) => (x.weight ? `${fmtWeight(x.weight, unit)}×${x.reps}` : `${x.reps}`)).join(' · ') : '';

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <T v="small" style={{ fontSize: 12 }} testID="exercise-position">
            Упражнение {index + 1} из {count}
          </T>
          <T v="h2" numberOfLines={2} style={{ fontSize: 22, lineHeight: 26 }}>
            {ex.name}
          </T>
        </View>
        {/* Техника — отдельно, в листе: на основном экране только то, что нужно для подхода */}
        <Pressable accessibilityRole="button" accessibilityLabel="Техника выполнения" onPress={() => setTechOpen(true)} style={({ pressed }) => [styles.techBtn, pressed && { opacity: 0.7 }]} hitSlop={6}>
          <Icon name="play-circle-outline" size={16} color={colors.accent} />
          <T v="small" color={colors.accent} style={{ fontWeight: '800', fontSize: 12 }}>
            Техника
          </T>
        </Pressable>
        <IconButton name="swap-horizontal" label="Заменить упражнение" onPress={onSwap} size={18} style={{ width: 40, height: 40 }} />
        <IconButton name="ellipsis-horizontal" label="Действия с упражнением" onPress={onMenu} size={18} style={{ width: 40, height: 40 }} />
      </View>

      {rec ? (
        <View style={styles.recCard} testID="rec">
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <Pressable accessibilityRole="button" accessibilityLabel={layout ? 'Раскладка блинов' : 'Рекомендация'} disabled={!layout} onPress={() => setPlatesOpen(true)} hitSlop={4}>
              <T v="num" style={{ fontSize: 22, textDecorationLine: layout ? 'underline' : 'none', textDecorationStyle: 'dotted' }}>
                {rec.weight > 0 ? `${fmtWeight(rec.weight, unit)} ${unitLabel(unit)}` : isBw ? 'Свой вес' : 'Подбери вес'} × {rec.repMin}–{rec.repMax}
              </T>
            </Pressable>
            {rec.delta && rec.action !== 'new' ? (
              <T v="body" style={{ fontWeight: '800', fontSize: 15 }} color={rec.action === 'increase' ? colors.accent : rec.action === 'decrease' ? colors.warning : colors.textDim}>
                {rec.delta}
              </T>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Рекомендация, почему" onPress={() => setWhyOpen(!whyOpen)} hitSlop={8} style={{ marginLeft: 'auto' }}>
              <T v="small" style={{ fontSize: 12, fontWeight: '700' }} color={colors.accent}>
                {whyOpen ? 'Скрыть' : 'Почему?'}
              </T>
            </Pressable>
          </View>
          {whyOpen ? (
            <T v="small" style={{ fontSize: 12 }}>
              {rec.rationale}
              {lastTxt ? `\nПрошлый раз: ${lastTxt}` : ''}
              {we.why ? `\n${we.why}` : ''}
            </T>
          ) : null}
        </View>
      ) : null}

      {warm.length ? (
        <View style={styles.warm}>
          <Icon name="flame-outline" size={15} color={colors.textDim} />
          <T v="small" style={{ flex: 1, fontSize: 12 }} numberOfLines={2}>
            Разминка: <T v="small" color={colors.text} style={{ fontSize: 12 }}>{warm.map((w) => `${fmtWeight(w.weight, unit)}×${w.reps}`).join(' · ')}</T>
          </T>
          <Pressable accessibilityRole="button" accessibilityLabel="Добавить разминку" onPress={() => { haptic.tap(); useWorkouts.getState().addWarmups(we.id, warm); }} hitSlop={8}>
            <T v="small" color={colors.accent} style={{ fontWeight: '800', fontSize: 12 }}>
              + Добавить
            </T>
          </Pressable>
        </View>
      ) : null}

      {lastDone && lastDone.rir === undefined && !lastDone.warmup ? <RirPicker weId={we.id} set={lastDone} /> : null}
      <AutoregTip we={we} step={step} unit={unit} />

      <View style={styles.block}>
        <View style={styles.headRow}>
          <T v="caption" style={{ width: 28 }}>#</T>
          <T v="caption" style={{ flex: 1, textAlign: 'center' }}>{isBw ? `+${unitLabel(unit)}` : unitLabel(unit)}</T>
          <T v="caption" style={{ flex: 1, textAlign: 'center' }}>Повт</T>
          <T v="caption" style={{ width: 40, textAlign: 'center' }}>RIR</T>
          <View style={{ width: 48 }} />
        </View>
        {we.sets.map((x, i) => (
          <SetRow key={x.id} weId={we.id} set={x} idx={i} no={x.warmup ? 'Р' : String(we.sets.slice(0, i + 1).filter((y) => !y.warmup).length)} unit={unit} onComplete={completeSet} current={x === nextSet} />
        ))}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Button title="Добавить подход" icon="add" size="sm" variant="ghost" onPress={() => { haptic.tap(); useWorkouts.getState().addSet(we.id); }} style={{ flex: 1 }} />
          {we.sets.length > 1 && !we.sets[we.sets.length - 1].done ? (
            <Button title="Убрать подход" icon="remove" size="sm" variant="ghost" onPress={() => { haptic.tap(); useWorkouts.getState().removeSet(we.id, we.sets[we.sets.length - 1].id); }} style={{ flex: 1 }} />
          ) : null}
        </View>
      </View>

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

      <Sheet visible={techOpen} onClose={() => setTechOpen(false)} title={ex.name} subtitle={[...primary, ...secondary].join(' · ')}>
        <TechniqueView ex={ex} sex={sex} />
      </Sheet>
    </View>
  );
}

/**
 * После подхода — один тап: «Сколько повторений осталось?» (RIR, Zourdos 2016). Таймер отдыха уже идёт.
 * RIR сохраняется в подход и маппится в «ощущение» для старых экранов (0 → до отказа, 1 → тяжело, 2 → нормально, 3+ → легко).
 */
const RIR_OPTS = [0, 1, 2, 3, 4] as const;
export function feelForRir(rir: number): SetFeel {
  return rir <= 0 ? 'max' : rir === 1 ? 'hard' : rir === 2 ? 'ok' : 'easy';
}
function RirPicker({ weId, set }: { weId: string; set: ExerciseSet }) {
  const pick = (r: number) => {
    haptic.tap();
    useWorkouts.getState().updateSet(weId, set.id, { rir: r, feel: feelForRir(r) });
  };
  return (
    <View style={styles.feelCard} testID="rir-picker">
      <T v="small" color={colors.text} style={{ fontWeight: '700' }}>
        Сколько повторений осталось в запасе?
      </T>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {RIR_OPTS.map((r) => (
          <Pressable key={r} accessibilityRole="button" accessibilityLabel={`Запас ${r === 4 ? '4 и больше' : r}`} onPress={() => pick(r)} style={[styles.feel, { flex: 1 }]}>
            <T v="h3" style={{ textAlign: 'center' }} color={r === 0 ? colors.warning : colors.text}>
              {r === 4 ? '4+' : r}
            </T>
          </Pressable>
        ))}
      </View>
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
    we.sets.filter((x) => !x.done && !x.warmup).forEach((x) => st.updateSet(we.id, x.id, { weight: tip.weight }));
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

const SetRow = memo(function SetRow({ weId, set, idx, no, unit, onComplete, current }: { weId: string; set: ExerciseSet; idx: number; no: string; unit: 'kg' | 'lb'; onComplete: (s: ExerciseSet) => void; current?: boolean }) {
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
        <View style={{ width: 28 }}>
          <T v="body" style={{ fontWeight: '800' }} color={set.warmup ? colors.muted : set.done ? colors.accent : colors.textDim}>
            {no}
          </T>
        </View>
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
          accessibilityLabel={`Запас повторов, подход ${idx + 1}`}
          disabled={!set.done || !!set.warmup}
          onPress={() => {
            // Тап — следующее значение 4+ → 3 → 2 → 1 → 0 (поправить без клавиатуры)
            const r = set.rir === undefined ? 2 : set.rir <= 0 ? 4 : set.rir - 1;
            haptic.tap();
            upd({ rir: r, feel: feelForRir(r) });
          }}
          style={{ width: 40, alignItems: 'center' }}
        >
          <T v="body" style={{ fontWeight: '800' }} color={set.rir === 0 ? colors.warning : set.done ? colors.text : colors.muted}>
            {set.warmup ? '' : set.rir === undefined ? '–' : set.rir >= 4 ? '4+' : set.rir}
          </T>
        </Pressable>
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
  spark: { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: colors.onAccent },
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
  recCard: { gap: 4, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accentLine },
  plate: { padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2, alignItems: 'center' },
  techBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 34, borderRadius: 17, borderWidth: 1, borderColor: colors.accentLine, backgroundColor: colors.accentDim },
  setCard: { gap: 8, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.accentLine },
  feelCard: { gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 52, paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: colors.surface2 },
  alt: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.accentDim },
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
