import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, T } from '@/components/ui';
import { Ring } from '@/components/charts';
import { Ambient, Appear, Progress, Tap, prefersReducedMotion, type AmbientTone } from '@/components/motion';
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
import { weightTrend } from '@/features/progress/weightTrend';
import { buildJournal, dayMode } from '@/features/journal/build';
import { workoutDebrief } from '@/features/training/debrief';
import { healthContext } from '@/features/health/model';
import { AddFoodSheet } from '@/features/nutrition/AddFoodSheet';
import { addDays, formatDayLong, formatHours, weekdayIndex } from '@/utils/date';
import { fmtNum } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';
import { stepGoal } from '@/features/science/steps';
import { readinessLabel } from '@/features/science/insights';
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

  const trend = useMemo(() => {
    const t = weightTrend(weights);
    if (!t.length) return null;
    const last = t[t.length - 1];
    const weekAgo = [...t].reverse().find((p) => p.date <= addDays(last.date, -7));
    return { w: last.trend, week: weekAgo ? last.trend - weekAgo.trend : null };
  }, [weights]);
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
  const firstName = profile.name.split(' ')[0] || 'атлет';
  const target = nut.target;
  const checkin = checkins[d];
  const sleep = checkin?.sleepHours ?? health?.sleepHours;
  const trainingDay = tw.kind === 'workout' || tw.kind === 'done' || !!active;
  const waterGoal = waterTarget(trend?.w ?? profile.weightKg, trainingDay);

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
        {/* Шапка: дата (открывает дневник дня и календарь) и профиль */}
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel="Дневник: календарь дней" onPress={() => setJournalOpen(true)} hitSlop={10} style={{ flex: 1 }}>
            <T v="caption" numberOfLines={1}>
              {WEEKDAY_FULL[weekdayIndex(d)]}, {formatDayLong(d)}
            </T>
          </Pressable>
          <Tap accessibilityRole="button" accessibilityLabel="Профиль" onPress={() => router.push('/profile')} style={styles.headBtn} scaleTo={0.9} hitSlop={4}>
            <T v="body" style={{ fontWeight: '700' }} color={colors.text}>
              {firstName.charAt(0).toUpperCase()}
            </T>
          </Tap>
        </View>

        <Hero tw={tw} active={active} debrief={debrief} coach={coach} evening={mode === 'evening'} onAddFood={() => setAddFood(true)} />

        {/* День — три кольца: чек-ин, калории, шаги. Выполнено — галочка; вода — компактной строкой */}
        <Appear i={5}>
          <View style={styles.metrics}>
            <Metric
              a11y={readiness ? `Готовность ${readinessLabel(readiness).toLowerCase()} · сон, чек-ин` : 'Готовность · сон, чек-ин'}
              label="Чек-ин"
              color={!readiness ? colors.textDim : readiness.band === 'go' ? colors.accent : readiness.band === 'reduce' ? colors.warning : colors.danger}
              progress={readiness ? READY_FILL[readiness.category ?? (readiness.band === 'go' ? 'normal' : readiness.band === 'reduce' ? 'reduced' : 'low')] : 0}
              value={readiness ? readinessLabel(readiness) : '—'}
              sub={checkin ? (sleep ? `сон ${formatHours(sleep)}` : 'пройден') : '30 секунд'}
              done={!!checkin}
              onPress={readiness ? () => setWhyOpen(true) : () => router.push('/checkin')}
            />
            <Metric
              a11y={`Калории, открыть питание: ${fmtNum(nut.eaten.kcal)} из ${fmtNum(target?.kcal ?? 0)} ккал`}
              label="Калории"
              color={colors.fat}
              progress={target ? nut.eaten.kcal / target.kcal : 0}
              value={fmtNum(nut.eaten.kcal)}
              sub={target ? `из ${fmtNum(target.kcal)}` : 'ккал'}
              done={!!target && nut.eaten.kcal >= target.kcal * 0.95 && nut.eaten.kcal <= target.kcal * 1.08}
              onPress={() => router.push('/nutrition')}
            />
            <Metric
              a11y="Шаги, как рассчитана цель"
              label="Шаги"
              color={colors.stabilizerMuscle}
              progress={health?.steps !== undefined && steps ? health.steps / steps.target : 0}
              value={health?.steps !== undefined ? fmtNum(health.steps) : '—'}
              sub={`из ${fmtNum(steps?.target ?? profile.stepsPerDay)}`}
              done={health?.steps !== undefined && !!steps && health.steps >= steps.target}
              onPress={() => setStepsOpen(true)}
            />
          </View>
        </Appear>
        <Appear i={6}>
          <WaterLine ml={water} goal={waterGoal} text={waterText} onOpen={() => setWaterOpen(true)} onAdd={() => { useNutrition.getState().addWater(d, 250); haptic.light(); }} />
        </Appear>

        {/* Тренер — одна строка: главный сигнал дня или вход; все сигналы, «почему так» и чат — в листе */}
        <Appear i={7}>
          <CoachLine top={feed[0]} more={feed.length - 1} onPress={() => setFeedOpen(true)} />
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

/** Цвет с прозрачностью: дорожка кольца — тот же цвет, приглушённый */
const tint = (hex: string, a: number) => (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}` : hex);

const READY_FILL: Record<'high' | 'normal' | 'reduced' | 'low', number> = { high: 1, normal: 0.78, reduced: 0.5, low: 0.25 };

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

/** Кольцо дня: прогресс цветом, значение внутри, название и «из цели» под ним; выполнено — галочка */
function Metric({ a11y, label, color, progress, value, sub, done, onPress }: { a11y: string; label: string; color: string; progress: number; value: string; sub: string; done?: boolean; onPress: () => void }) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${a11y}${done ? ' · выполнено' : ''}`} onPress={() => { haptic.tap(); onPress(); }} style={styles.metric} scaleTo={0.93}>
      <View>
        <Ring size={84} stroke={5} progress={Math.min(1, progress)} color={progress > 1.08 ? colors.warning : color} track={tint(color, 0.16)}>
          <T v="body" style={{ fontWeight: '700', fontSize: 16, maxWidth: 66, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </T>
        </Ring>
        {done ? <DoneBadge /> : null}
      </View>
      <T v="small" color={colors.text} style={{ fontSize: 13, fontWeight: '600', marginTop: 8 }} numberOfLines={1}>
        {label}
      </T>
      <T v="small" style={{ fontSize: 12 }} numberOfLines={1} adjustsFontSizeToFit>
        {sub}
      </T>
    </Tap>
  );
}

/** Галочка «выполнено» — пружиной, с короткой вспышкой */
function DoneBadge() {
  const [a] = useState(() => new Animated.Value(prefersReducedMotion() ? 1 : 0));
  useEffect(() => {
    if (prefersReducedMotion()) return;
    Animated.spring(a, { toValue: 1, useNativeDriver: Platform.OS !== 'web', speed: 12, bounciness: 14 }).start();
  }, [a]);
  return (
    <Animated.View style={[styles.done, { opacity: a, transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }] }]} testID="metric-done">
      <Icon name="checkmark" size={13} color={colors.onAccent} />
    </Animated.View>
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

/** Строка тренера: цвет важности и главный сигнал одной фразой (остальные — в листе); без сигналов — вход в чат */
function CoachLine({ top, more, onPress }: { top?: FeedItem; more: number; onPress: () => void }) {
  const label = top ? `От тренера: ${top.title}${more > 0 ? ` и ещё ${more}` : ''}` : `Тренер ${BRAND} — совет дня и чат`;
  const dot = !top ? colors.accent : top.tone === 'urgent' ? colors.danger : top.tone === 'warning' ? colors.warning : colors.accent;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} onPress={() => { haptic.tap(); onPress(); }} style={styles.coachLine} scaleTo={0.985} testID="coach-feed">
      <Icon name="sparkles" size={16} color={dot} />
      <T v="body" style={{ flex: 1, fontWeight: '600' }} color={top?.tone === 'urgent' ? colors.danger : colors.text} numberOfLines={1}>
        {top ? top.title : 'Спросить тренера'}
      </T>
    </Tap>
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
  headBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  coachDot: { position: 'absolute', top: 9, right: 10, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  hero: { gap: 10, marginTop: space.xxl },
  heroCta: { marginTop: space.lg },
  metrics: { flexDirection: 'row', marginTop: space.xxl, marginHorizontal: -4 },
  metric: { flex: 1, alignItems: 'center', paddingVertical: 4, gap: 1 },
  done: { position: 'absolute', top: 0, right: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  water: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: space.xl, paddingVertical: 12, paddingHorizontal: space.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  waterBtn: { minWidth: 56, height: 36, borderRadius: 18, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  coachLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: space.md, paddingVertical: 15, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: colors.surface },
  sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: colors.surface2 },
  fit: { padding: 14, borderRadius: radius.md, backgroundColor: colors.surface2, gap: 4 },
  jRow: { flexDirection: 'row', gap: 10 },
  jRail: { alignItems: 'center', width: 12, paddingTop: 6 },
  jDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.textDim },
  jLine: { flex: 1, width: 1, backgroundColor: colors.borderStrong, marginTop: 4 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface2, justifyContent: 'center' },
});
