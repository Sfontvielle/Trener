import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, T } from '@/components/ui';
import { Ambient, Appear, Progress, Tap, type AmbientTone } from '@/components/motion';
import { Field } from '@/components/inputs';
import { Sheet } from '@/components/Sheet';
import { toast } from '@/components/Dialog';
import { TAB_BAR_HEIGHT } from '@/components/Screen';
import { useProfile } from '@/stores/profile';
import { usePlan } from '@/stores/plan';
import { useWorkouts } from '@/stores/workouts';
import { useBody } from '@/stores/body';
import { useCoach } from '@/stores/coach';
import { useCheckins } from '@/stores/checkins';
import { useNutrition, mealForHour, waterTarget } from '@/stores/nutrition';
import { useHealth } from '@/stores/health';
import { useJournal } from '@/stores/journal';
import { useDayNutrition, useReadiness, useTodayWorkout } from '@/hooks/useToday';
import type { WorkoutSession } from '@/types';
import { ReadinessSheet } from '@/features/recovery/ReadinessSheet';
import { applyCoachAction, currentLocalInsights, refreshDailyInsight } from '@/features/coach/service';
import type { LocalInsight } from '@/features/coach/insights';
import type { ProgramProposal } from '@/features/training/adaptPlan';
import { applyProgramProposal } from '@/features/training/adaptActions';
import { useDayKey } from '@/hooks/useDayKey';
import { MODE_LABEL } from '@/features/training/today';
import { resumeActive, startTodayPlanned } from '@/features/training/actions';
import { deltaText, sleepCard, weightCard, weightOnTrack } from '@/features/home/today';
import { CoachCard, NutritionCard, RecoveryCard, StatCard, tint } from '@/features/home/TodayCards';
import { sleepMinutesOf } from '@/features/science/recovery';
import { buildJournal, dayMode } from '@/features/journal/build';
import { workoutDebrief } from '@/features/training/debrief';
import { healthContext } from '@/features/health/model';
import { AddFoodSheet } from '@/features/nutrition/AddFoodSheet';
import { formatDayLong, weekdayIndex } from '@/utils/date';
import { fmtNum } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';
import { stepGoal } from '@/features/science/steps';
import { BASIS_LABEL } from '@/features/science/sources';
import { QuickMeasureSheet } from '@/features/progress/QuickMeasureSheet';
import { WaterSheet } from '@/features/nutrition/WaterSheet';
import { measurementDue } from '@/features/progress/reminders';
import { missedWorkoutProposal } from '@/features/training/schedule';
import { TrainingCalendar } from '@/features/day/Calendar';
import { DayDetailsSheet, useDaySources } from '@/features/day/DayDetails';
import { useLabs } from '@/stores/labs';
import { useEnhanced } from '@/stores/enhanced';
import { currentAlerts, currentCoachToday } from '@/features/coach/brief';
import type { CoachToday } from '@/features/coach/decisions/today';
import { CoachWhySheet } from '@/features/coach/DecisionView';
import { CoachFeed } from '@/features/coach/Feed';
import { buildFeed, dayVerdict, SETUP_SECTION, type FeedAction, type FeedItem } from '@/features/coach/feed';
import { afterModalClose } from '@/components/modalGate';

const WEEKDAY_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const NOTE_CHIPS = ['Плохой сон', 'Мало времени на тренировку', 'Поясница в порядке', 'Отличное самочувствие', 'Усталость после работы'];

/**
 * Главная — дневник и центр управления дня. Самое важное сверху, порядок карточек зависит от времени:
 * утро — готовность и план; после тренировки — результаты; вечер — итог дня. Остальное RYNJI пишет в
 * дневник сам (чек-ин, вес, еда, тренировка, рекорды, изменения плана, Apple Health).
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const d = useDayKey();
  const profile = useProfile((s) => s.profile);
  const trainingTime = useProfile((s) => s.settings.trainingTime);
  const plan = usePlan((s) => s.plan);
  const overrides = usePlan((s) => s.overrides);
  const adjustments = usePlan((s) => s.adjustments);
  const active = useWorkouts((s) => s.active);
  const sessions = useWorkouts((s) => s.sessions);
  const customs = useWorkouts((s) => s.customExercises);
  const weights = useBody((s) => s.weights);
  const metrics = useBody((s) => s.metrics);
  const insight = useCoach((s) => s.insight);
  const advice = useCoach((s) => s.advice);
  const checkins = useCheckins((s) => s.byDate);
  const entries = useNutrition((s) => s.entries);
  const water = useNutrition((s) => s.water[d] ?? 0);
  const healthDays = useHealth((s) => s.days);
  const healthSync = useHealth((s) => s.lastSyncAt);
  const healthOn = useHealth((s) => s.enabled);
  const notes = useJournal((s) => s.notes);
  const labReports = useLabs((s) => s.reports);
  const bpLog = useEnhanced((s) => s.bp);
  const enhancedOn = useEnhanced((s) => s.enabled);
  const target0 = usePlan((s) => s.target);
  const readiness = useReadiness();
  const tw = useTodayWorkout();
  const nut = useDayNutrition();
  const [addFood, setAddFood] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [waterOpen, setWaterOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [shiftHidden, setShiftHidden] = useState(false);
  const daySrc = useDaySources();
  const [noteOpen, setNoteOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [coachWhyOpen, setCoachWhyOpen] = useState(false);
  const [proposal, setProposal] = useState<ProgramProposal | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);

  const wc = useMemo(() => weightCard(weights, d), [weights, d]);
  const health = useMemo(() => healthContext(healthDays, d), [healthDays, d]);
  // Наука: персональная цель шагов, тренд тела и выводы — детерминированно из данных
  const steps = useMemo(() => (profile ? stepGoal({ age: profile.age, profileSteps: profile.stepsPerDay, health: healthDays, ref: d }) : null), [profile, healthDays, d]);
  const due = useMemo(() => measurementDue(weights, metrics, d), [weights, metrics, d]);
  const shiftRaw = useMemo(() => missedWorkoutProposal({ date: d, hour: new Date().getHours(), plan, sessions, overrides, customs }), [d, plan, sessions, overrides, customs]);
  const shift = shiftHidden ? null : shiftRaw;
  // RYNJI COACH — план дня и важные сигналы: детерминированный движок решений (features/coach/decisions)
  const coach = useMemo(
    () => (profile ? currentCoachToday(d) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, plan, overrides, sessions, entries, checkins, weights, metrics, healthDays, target0, labReports, bpLog, enhancedOn, customs, d],
  );
  const alerts = useMemo(
    () => (profile ? currentAlerts(d) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, plan, sessions, checkins, weights, metrics, healthDays, labReports, bpLog, enhancedOn, advice, d],
  );
  // Советы тренера пересчитываются при изменении данных, которые на них влияют
  const tips = useMemo(
    () => (profile ? currentLocalInsights().filter((i) => !!i.action || !!i.proposal || i.kind === 'safety' || i.kind === 'health') : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, plan, overrides, sessions, entries, checkins, weights, advice, d, healthDays],
  );

  const setupPending = useProfile((s) => s.settings.setupPending);
  const feed = useMemo(() => {
    const hour = new Date().getHours();
    const done = tw.kind === 'done';
    const evening = profile && dayMode(hour, done) === 'evening' && target0 ? dayVerdict({ workoutDone: done, restDay: tw.kind === 'rest', kcal: [nut.eaten.kcal, target0.kcal], protein: [nut.eaten.protein, target0.protein] }) : null;
    const hidden = advice.filter((a) => a.date === d && a.status === 'dismissed').map((a) => a.key);
    return buildFeed({ alerts, tips, shift, due, setupPending, evening, hidden });
  }, [alerts, tips, shift, due, setupPending, profile, tw.kind, target0, nut.eaten.kcal, nut.eaten.protein, advice, d]);

  const insightKey = `${d}|${checkins[d]?.createdAt ?? 0}|${sessions.length}|${overrides[d]?.createdAt ?? 0}|${plan?.id ?? ''}`;
  useFocusEffect(
    useCallback(() => {
      if (profile) void refreshDailyInsight(insightKey);
    }, [insightKey, profile]),
  );

  const doneToday = tw.kind === 'done' ? tw.completedSession : undefined;
  const debrief = useMemo(() => (doneToday ? workoutDebrief(doneToday, sessions, customs) : null), [doneToday, sessions, customs]);
  const journal = useMemo(() => {
    const plannedAt = new Date(`${d}T${String(trainingTime.hour).padStart(2, '0')}:${String(trainingTime.minute).padStart(2, '0')}:00`).getTime();
    return buildJournal({
      date: d,
      checkin: checkins[d],
      readiness,
      weights,
      entries,
      sessions,
      active,
      adjustments,
      notes,
      planned: tw.kind === 'workout' && tw.template ? { name: tw.template.name, at: plannedAt } : null,
      healthSyncAt: healthSync,
      customs,
    });
  }, [d, checkins, readiness, weights, entries, sessions, active, adjustments, notes, tw, healthSync, customs, trainingTime]);

  if (!profile) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const now = new Date();
  const mode = dayMode(now.getHours(), !!doneToday);
  const target = nut.target;
  const checkin = checkins[d];
  const sleepNow = sleepCard(checkin ? sleepMinutesOf(checkin) : undefined, health?.sleepHours);
  const trainingDay = tw.kind === 'workout' || tw.kind === 'done' || !!active;
  const waterGoal = waterTarget(wc?.kg ?? profile.weightKg, trainingDay);

  const reactTo = (i: LocalInsight, status: 'accepted' | 'dismissed') => {
    if (i.key) useCoach.getState().recordAdvice({ key: i.key, date: d, text: i.text, status });
  };

  // Цвет фонового света — состояние дня: тренировка, отдых или «поберечься»
  const tone: AmbientTone = active ? 'accent' : tw.kind === 'rest' ? 'calm' : readiness && readiness.band !== 'go' ? 'warn' : 'accent';
  const runFeed = (it: FeedItem, a: FeedAction) => {
    if (a.kind === 'route') router.push(a.route as never);
    else if (a.kind === 'measure') setMeasureOpen(true);
    else if (a.kind === 'shift' && shift) {
      const ps = usePlan.getState();
      shift.overrides.forEach((o) => ps.setOverride(o));
      haptic.success();
      toast(shift.kind === 'tomorrow' ? `«${shift.template.name}» — завтра` : `«${shift.template.name}» — сегодня`);
    } else if (a.kind === 'proposal' && it.tip?.proposal) setProposal(it.tip.proposal);
    else if (a.kind === 'apply' && it.tip?.action) {
      const r = applyCoachAction('', it.tip.action);
      toast(r.message, r.ok ? 'checkmark-circle' : 'alert-circle');
      if (r.ok) reactTo(it.tip, 'accepted');
    } else if (a.kind === 'setup') router.push({ pathname: '/profile', params: { edit: SETUP_SECTION[a.item] } });
  };
  const dismissFeed = (it: FeedItem) => {
    if (it.id === 'shift') setShiftHidden(true);
    if (it.adviceKey) useCoach.getState().recordAdvice({ key: it.adviceKey, date: d, text: it.title, status: 'dismissed' });
  };
  const waterText = water < 1000 ? `${water} мл` : `${String(Math.round(water / 50) / 20).replace('.', ',')} л`;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Ambient tone={tone} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: space.lg, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + space.xl }} showsVerticalScrollIndicator={false}>
        {/* Шапка: дата (открывает дневник дня и календарь). Профиль — нижняя вкладка */}
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Дневник: календарь дней" onPress={() => setJournalOpen(true)} hitSlop={10} style={{ flex: 1 }}>
            <T v="caption" numberOfLines={1}>
              {WEEKDAY_FULL[weekdayIndex(d)]}, {formatDayLong(d)}
            </T>
          </Pressable>
        </View>

        <Hero tw={tw} active={active} debrief={debrief} coach={coach} evening={mode === 'evening'} onAddFood={() => setAddFood(true)} />

        {/* День — карточки: калории и БЖУ, шаги и вес, сон и восстановление, тренер. Только данные пользователя */}
        <Appear i={5} style={{ marginTop: space.xxl }}>
          <NutritionCard eaten={nut.eaten} target={target} onOpen={() => router.push('/nutrition')} />
        </Appear>
        <Appear i={6} style={styles.pair}>
          <StatCard
            icon="footsteps"
            label="Шаги"
            color={colors.stabilizerMuscle}
            value={health?.steps !== undefined ? fmtNum(health.steps) : '—'}
            sub={health?.steps !== undefined ? `из ${fmtNum(steps?.target ?? profile.stepsPerDay)}` : healthOn ? 'Нет данных за сегодня' : 'Подключи Apple Health'}
            progress={health?.steps !== undefined && steps ? health.steps / steps.target : 0}
            a11y={`Шаги, как рассчитана цель: ${health?.steps !== undefined ? `${fmtNum(health.steps)} из ${fmtNum(steps?.target ?? profile.stepsPerDay)}` : 'нет данных'}`}
            onPress={() => setStepsOpen(true)}
            testID="home-steps"
          />
          <StatCard
            icon="scale-outline"
            label="Вес"
            color={colors.protein}
            value={wc ? String(wc.kg).replace('.', ',') : '—'}
            unit={wc ? 'кг' : undefined}
            sub={!wc ? 'Записать вес' : wc.stale ? 'Давно не взвешивался' : wc.week !== null ? `${deltaText(wc.week)} за неделю` : 'Динамика — через неделю'}
            subColor={wc && wc.week !== null && !wc.stale ? (weightOnTrack(profile.goal, wc.week) ? colors.accent : colors.warning) : undefined}
            spark={wc?.spark}
            a11y={wc ? `Вес ${String(wc.kg).replace('.', ',')} кг${wc.week !== null ? `, ${deltaText(wc.week)} за неделю` : ''}. Открыть прогресс` : 'Вес: записей нет. Записать вес'}
            onPress={() => router.push(wc ? '/progress' : '/weight')}
            testID="home-weight"
          />
        </Appear>
        <Appear i={7} style={{ marginTop: 12 }}>
          <RecoveryCard sleep={sleepNow} readiness={readiness} hasCheckin={!!checkin} onOpen={() => setWhyOpen(true)} onCheckin={() => router.push('/checkin')} />
        </Appear>
        {/* RYNJI Coach: главный сигнал дня (лист со всеми сигналами) и вопрос тренеру */}
        <Appear i={8} style={{ marginTop: 12 }}>
          <CoachCard top={feed[0]} more={feed.length - 1} onOpen={() => setFeedOpen(true)} onAsk={() => router.push(insight && insight.date === d ? { pathname: '/coach', params: { insight: '1' } } : '/coach')} />
        </Appear>
        <Appear i={9}>
          <WaterLine ml={water} goal={waterGoal} text={waterText} onOpen={() => setWaterOpen(true)} onAdd={() => { useNutrition.getState().addWater(d, 250); haptic.light(); }} />
        </Appear>
      </ScrollView>

      <AddFoodSheet visible={addFood} onClose={() => setAddFood(false)} date={d} meal={mealForHour(now.getHours())} />
      <Sheet visible={diaryOpen} onClose={() => setDiaryOpen(false)} title="Дневник" subtitle="Выбери день — сон, шаги, вес, тренировка, питание">
        <TrainingCalendar initiallyOpen today={d} src={daySrc} onSelect={(x) => { setDiaryOpen(false); afterModalClose(() => setDayOpen(x)); }} />
      </Sheet>
      <Sheet visible={feedOpen} onClose={() => setFeedOpen(false)} title="От тренера" subtitle={feed.length ? 'Сигналы и предложения на сегодня — по важности' : 'Сигналов нет — всё по плану'}>
        {feed.length ? (
          <CoachFeed
            items={feed}
            limit={feed.length}
            bare
            onAction={(it, a) => {
              setFeedOpen(false);
              afterModalClose(() => runFeed(it, a));
            }}
            onDismiss={dismissFeed}
            onAsk={(it) => {
              setFeedOpen(false);
              afterModalClose(() => router.push({ pathname: '/coach', params: { q: `${it.title}. ${it.text} Что мне сделать?` } }));
            }}
          />
        ) : null}
        <View style={{ gap: 10, marginTop: space.md }}>
          {coach ? (
            <Button
              title="Почему такой план"
              icon="help-circle-outline"
              variant="secondary"
              accessibilityLabel="Почему? Объяснение решений тренера"
              onPress={() => {
                setFeedOpen(false);
                afterModalClose(() => setCoachWhyOpen(true));
              }}
            />
          ) : null}
          <Button
            title="Спросить тренера"
            icon="sparkles"
            variant="secondary"
            onPress={() => {
              setFeedOpen(false);
              afterModalClose(() => router.push(insight && insight.date === d ? { pathname: '/coach', params: { insight: '1' } } : '/coach'));
            }}
          />
        </View>
      </Sheet>
      <Sheet visible={journalOpen} onClose={() => setJournalOpen(false)} title="Дневник дня" subtitle={`${BRAND} записывает чек-ин, вес, еду и тренировку сам`}>
        <View style={{ gap: space.md }} testID="day-journal">
          {journal.length === 0 ? <T v="small">Пока пусто — записи появятся сами.</T> : null}
          <View>
            {journal.map((e, i) => (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                onPress={() => {
                  setJournalOpen(false);
                  afterModalClose(() => {
                    if (e.kind === 'workout_done' && e.refId) router.push({ pathname: '/workout/[id]', params: { id: e.refId } });
                    else if (e.kind === 'workout_active') resumeActive();
                    else if (e.kind === 'meal') router.push('/nutrition');
                    else if (e.kind === 'checkin') router.push('/checkin');
                    else if (e.kind === 'weight') router.push('/weight');
                  });
                }}
                onLongPress={() => {
                  if (e.kind === 'note' && e.refId) {
                    useJournal.getState().removeNote(e.refId);
                    toast('Заметка удалена');
                  }
                }}
                accessibilityHint={e.kind === 'note' ? 'Удерживай, чтобы удалить' : undefined}
                style={styles.jRow}
              >
                <T v="small" style={{ width: 46, fontVariant: ['tabular-nums'] }} color={e.planned ? colors.muted : colors.textDim}>
                  {new Date(e.at).toTimeString().slice(0, 5)}
                </T>
                <View style={styles.jRail}>
                  <View style={[styles.jDot, e.kind === 'pr' && { backgroundColor: colors.accent }, e.planned && { backgroundColor: colors.muted }]} />
                  {i < journal.length - 1 ? <View style={styles.jLine} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 16 }}>
                  <T v="body" style={{ fontWeight: '600' }} color={e.planned ? colors.textDim : colors.text}>
                    {e.title}
                  </T>
                  {e.sub ? (
                    <T v="small" numberOfLines={e.kind === 'note' ? 4 : 1}>
                      {e.sub}
                    </T>
                  ) : null}
                </View>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title="Заметка"
              icon="create-outline"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => {
                setJournalOpen(false);
                afterModalClose(() => setNoteOpen(true));
              }}
            />
            <Button
              title="Другие дни"
              icon="calendar-outline"
              variant="secondary"
              style={{ flex: 1 }}
              accessibilityLabel="Календарь дней"
              onPress={() => {
                setJournalOpen(false);
                afterModalClose(() => setDiaryOpen(true));
              }}
            />
          </View>
        </View>
      </Sheet>
      <WaterSheet visible={waterOpen} onClose={() => setWaterOpen(false)} date={d} />
      <DayDetailsSheet date={dayOpen} onClose={() => setDayOpen(null)} />
      <QuickMeasureSheet visible={measureOpen} onClose={() => setMeasureOpen(false)} date={d} />
      <Sheet visible={stepsOpen} onClose={() => setStepsOpen(false)} title="Шаги" subtitle={steps ? `Цель ${fmtNum(steps.target)} · ${BASIS_LABEL[steps.basis.kind]}` : undefined}>
        {steps ? (
          <View style={{ gap: 10 }}>
            <T v="body">{steps.reason}</T>
            <T v="small">
              Шаги — часть бытовой активности (NEAT): они добавляют расход энергии и полезны для здоровья, но не «сжигают» жир в конкретном месте. Ориентир пользы для твоего возраста — {fmtNum(steps.benefitRange[0])}–{fmtNum(steps.benefitRange[1])} шагов (Paluch 2022, Ding 2025).
            </T>
            <T v="small">Данных Apple Health за 4 недели: {steps.daysOfData} дн.</T>
            {!healthOn ? (
              <Button
                title="Подключить Apple Health"
                icon="heart-outline"
                variant="secondary"
                onPress={() => {
                  setStepsOpen(false);
                  afterModalClose(() => router.push('/health'));
                }}
              />
            ) : null}
          </View>
        ) : null}
      </Sheet>
      <NoteSheet visible={noteOpen} onClose={() => setNoteOpen(false)} date={d} />
      <ReadinessSheet visible={whyOpen} onClose={() => setWhyOpen(false)} r={readiness} hasCheckin={!!checkin} />
      <CoachWhySheet
        visible={coachWhyOpen}
        onClose={() => setCoachWhyOpen(false)}
        title={`${BRAND} COACH — почему так`}
        decisions={coach?.decisions ?? []}
        onReadiness={
          readiness
            ? () => {
                setCoachWhyOpen(false);
                afterModalClose(() => setWhyOpen(true));
              }
            : undefined
        }
      />
      <ProposalSheet
        p={proposal}
        onClose={() => setProposal(null)}
        onApply={(p) => {
          toast(applyProgramProposal(p), 'checkmark-circle');
          useCoach.getState().recordAdvice({ key: `program_${p.id}`, date: d, text: p.title, status: 'accepted' });
          setProposal(null);
        }}
        onDecline={(p) => {
          useCoach.getState().recordAdvice({ key: `program_${p.id}`, date: d, text: p.title, status: 'dismissed' });
          setProposal(null);
        }}
      />
    </View>
  );
}

/**
 * Главное на сегодня — крупно, на фоне, без карточки: состояние дня, имя тренировки, одна строка параметров
 * (тап — состав), фокус тренера (тап — «почему») и одна «живая» кнопка. Появляется «лесенкой».
 */
function Hero({
  tw,
  active,
  debrief,
  coach,
  evening,
  onAddFood,
}: {
  tw: ReturnType<typeof useTodayWorkout>;
  active: WorkoutSession | null;
  debrief: ReturnType<typeof workoutDebrief> | null;
  coach: CoachToday | null;
  evening: boolean;
  onAddFood: () => void;
}) {
  const eyebrow = (text: string, warn?: string) => (
    <Appear i={0}>
      <T v="caption" color={colors.textDim}>
        {text}
        {warn ? <T v="caption" color={colors.warning}>{` · ${warn}`}</T> : null}
      </T>
    </Appear>
  );
  const title = (text: string) => (
    <Appear i={1}>
      <T v="hero" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
        {text}
      </T>
    </Appear>
  );
  const meta = (text: string, onPress?: () => void, label?: string) => (
    <Appear i={2}>
      {onPress ? (
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { haptic.tap(); onPress(); }} hitSlop={8} style={({ pressed }) => [{ alignSelf: 'flex-start' }, pressed && { opacity: 0.6 }]}>
          <T v="bodyDim" numberOfLines={2}>
            {text} <T v="bodyDim" color={colors.text}>›</T>
          </T>
        </Pressable>
      ) : (
        <T v="bodyDim" numberOfLines={2}>
          {text}
        </T>
      )}
    </Appear>
  );
  // Фокус тренера и «почему» — одна строка: решение дня, тап — данные и уверенность
  const cta = (b: React.ReactNode) => <Appear i={4} style={styles.heroCta}>{b}</Appear>;

  if (active) {
    const done = active.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
    return (
      <View style={styles.hero}>
        {eyebrow('Идёт тренировка')}
        {title(active.name)}
        {meta(`Выполнено подходов: ${done}`)}
        {cta(<Button title="Продолжить тренировку" icon="play" size="lg" live onPress={resumeActive} />)}
      </View>
    );
  }
  if (tw.kind === 'done' && tw.completedSession) {
    const s = tw.completedSession;
    return (
      <View style={styles.hero} testID="coach-today">
        {eyebrow(evening ? 'Итог дня · тренировка выполнена' : 'Тренировка выполнена')}
        {title(`${s.name} ✓`)}
        {meta(
          [debrief ? `${debrief.minutes} мин · ${debrief.sets} подходов${debrief.prs.length ? ` · рекордов: ${debrief.prs.length}` : ''}` : 'Итоги', tw.nextWorkout ? `дальше ${tw.nextWorkout.template.name}, ${formatDayLong(tw.nextWorkout.date)}` : ''].filter(Boolean).join(' · '),
          () => router.push({ pathname: '/workout/[id]', params: { id: s.id } }),
          'Итоги тренировки',
        )}
        {cta(<Button title="Добавить еду" icon="add" size="lg" live onPress={onAddFood} />)}
      </View>
    );
  }
  if (tw.kind === 'workout' && tw.template) {
    const stop = coach?.mode === 'Отдых';
    const tid = tw.template.id;
    return (
      <View style={styles.hero} testID="coach-today">
        {eyebrow('Тренировка дня', stop ? 'отдых' : tw.mode !== 'normal' ? MODE_LABEL[tw.mode].toLowerCase() : undefined)}
        {title(coach?.title ?? tw.template.name)}
        {meta(`~${tw.estMinutes} мин · ${tw.totalSets} подходов`, () => router.push({ pathname: '/workout/preview', params: { templateId: tid } }), 'Состав тренировки')}
        {cta(<Button title="Начать тренировку" icon="play" size="lg" live={!stop} onPress={() => startTodayPlanned()} variant={stop ? 'secondary' : 'primary'} />)}
      </View>
    );
  }
  if (tw.kind === 'rest') {
    return (
      <View style={styles.hero} testID="coach-today">
        {eyebrow('Сегодня')}
        {title('День отдыха')}
        {meta([tw.reason ?? 'Восстановление — часть плана', tw.nextWorkout ? `дальше ${tw.nextWorkout.template.name}, ${formatDayLong(tw.nextWorkout.date)}` : ''].filter(Boolean).join(' · '))}
        {cta(<Button title="Добавить еду" icon="add" size="lg" live onPress={onAddFood} />)}
      </View>
    );
  }
  return (
    <View style={styles.hero}>
      {eyebrow('Сегодня')}
      {title('Плана пока нет')}
      {meta(`Заполни профиль — ${BRAND} составит программу и питание.`)}
      {cta(<Button title="Открыть профиль" size="lg" live onPress={() => router.push('/profile')} />)}
    </View>
  );
}

/** Вода — одной компактной строкой: сколько выпито, тонкая полоса, «+250» в один тап; выполнено — галочка */
function WaterLine({ ml, goal, text, onOpen, onAdd }: { ml: number; goal: number; text: string; onOpen: () => void; onAdd: () => void }) {
  const done = ml >= goal;
  return (
    <View style={styles.water}>
      <Pressable accessibilityRole="button" accessibilityLabel="Вода: добавить или уменьшить" onPress={() => { haptic.tap(); onOpen(); }} style={({ pressed }) => [{ flex: 1, gap: 6 }, pressed && { opacity: 0.6 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={done ? 'checkmark-circle' : 'water'} size={15} color={done ? colors.accent : colors.protein} />
          <T v="small" color={colors.text} style={{ fontWeight: '600' }}>
            Вода {text}
            <T v="small">{` из ${String(goal / 1000).replace('.', ',')} л`}</T>
          </T>
        </View>
        <Progress value={ml / goal} color={done ? colors.accent : colors.protein} track={tint(colors.protein, 0.14)} height={3} />
      </Pressable>
      <Tap accessibilityRole="button" accessibilityLabel="Плюс 250 мл воды" onPress={onAdd} style={styles.waterBtn} scaleTo={0.9} hitSlop={6}>
        <T v="small" color={colors.text} style={{ fontWeight: '800' }}>
          +250
        </T>
      </Tap>
    </View>
  );
}

/** Существенное изменение программы: объяснение → подтверждение → перестройка */
function ProposalSheet({ p, onClose, onApply, onDecline }: { p: ProgramProposal | null; onClose: () => void; onApply: (p: ProgramProposal) => void; onDecline: (p: ProgramProposal) => void }) {
  return (
    <Sheet visible={!!p} onClose={onClose} title={p?.title} subtitle="Предложение тренера — применится только после подтверждения">
      {p ? (
        <View style={{ gap: space.md }}>
          <View style={{ gap: 6 }}>
            <T v="caption">Почему</T>
            {p.why.map((w) => (
              <T key={w} v="body" style={{ fontSize: 15 }}>
                • {w}
              </T>
            ))}
          </View>
          {p.splitWhy ? (
            <View style={styles.fit}>
              <T v="caption" color={colors.accent}>
                Почему этот формат подходит тебе
              </T>
              <T v="small" color={colors.text}>
                {p.splitWhy}
              </T>
            </View>
          ) : null}
          <T v="small" style={{ fontSize: 12 }}>
            Упражнения, в которых есть прогресс, сохранятся. Вернуть как было можно в Профиль → Тренировки.
          </T>
          <Button title="Применить изменение" icon="checkmark" size="lg" onPress={() => onApply(p)} />
          <Button title="Оставить как есть" variant="ghost" onPress={() => onDecline(p)} />
        </View>
      ) : null}
    </Sheet>
  );
}


function NoteSheet({ visible, onClose, date }: { visible: boolean; onClose: () => void; date: string }) {
  const [text, setText] = useState('');
  const save = (t: string) => {
    if (!t.trim()) return;
    useJournal.getState().addNote(date, t);
    haptic.success();
    toast('Заметка в дневнике — тренер её учтёт');
    setText('');
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Заметка" subtitle={`Видна тебе и тренеру ${BRAND}`}>
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {NOTE_CHIPS.map((c) => (
            <Pressable key={c} accessibilityRole="button" onPress={() => save(c)} style={styles.chip}>
              <T v="small" color={colors.text} style={{ fontWeight: '600' }}>
                {c}
              </T>
            </Pressable>
          ))}
        </View>
        <Field placeholder="Например: поясница чувствует себя нормально" value={text} onChangeText={setText} multiline maxLength={280} />
        <Button title="Сохранить" icon="checkmark" size="lg" disabled={!text.trim()} onPress={() => save(text)} />
      </View>
    </Sheet>
  );
}

const styles = themed({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hero: { gap: 10, marginTop: space.xxl },
  heroCta: { marginTop: space.lg },
  pair: { flexDirection: 'row', gap: 12, marginTop: 12 },
  water: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, paddingVertical: 12, paddingHorizontal: space.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  waterBtn: { minWidth: 56, height: 36, borderRadius: 18, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.surface2 },
  fit: { padding: 14, borderRadius: radius.md, backgroundColor: colors.surface2, gap: 4 },
  jRow: { flexDirection: 'row', gap: 10 },
  jRail: { alignItems: 'center', width: 12, paddingTop: 6 },
  jDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.textDim },
  jLine: { flex: 1, width: 1, backgroundColor: colors.borderStrong, marginTop: 4 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface2, justifyContent: 'center' },
});
