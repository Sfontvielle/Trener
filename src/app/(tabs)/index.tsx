import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, T, linkHit } from '@/components/ui';
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
import { useNutrition } from '@/stores/nutrition';
import { useHealth } from '@/stores/health';
import { useJournal } from '@/stores/journal';
import { useDayNutrition, useReadiness, useTodayWorkout } from '@/hooks/useToday';
import { ReadinessSheet } from '@/features/recovery/ReadinessSheet';
import { applyCoachAction, currentLocalInsights, refreshDailyInsight } from '@/features/coach/service';
import type { LocalInsight } from '@/features/coach/insights';
import type { ProgramProposal } from '@/features/training/adaptPlan';
import { applyProgramProposal } from '@/features/training/adaptActions';
import { useDayKey } from '@/hooks/useDayKey';
import { MODE_LABEL } from '@/features/training/today';
import { resumeActive, startTodayPlanned } from '@/features/training/actions';
import { startPlanned } from '@/features/training/planning';
import { estimateMinutes } from '@/features/training/planGenerator';
import { useSchedule } from '@/stores/schedule';
import { DayRings, NutritionBlock, WorkoutCard, type SleepRingData, type WorkoutCardState } from '@/features/home/Today';
import { agendaProgress, weekAgenda } from '@/features/training/weekAgenda';
import { sleepMinutesOf } from '@/features/science/recovery';
import { buildJournal, dayMode } from '@/features/journal/build';
import { workoutDebrief } from '@/features/training/debrief';
import { healthContext } from '@/features/health/model';
import { formatDayLong, weekdayIndex } from '@/utils/date';
import { fmtNum } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';
import { stepGoal } from '@/features/science/steps';
import { BASIS_LABEL } from '@/features/science/sources';
import { QuickMeasureSheet } from '@/features/progress/QuickMeasureSheet';
import { measurementDue } from '@/features/progress/reminders';
import { missedWorkoutProposal } from '@/features/training/schedule';
import { TrainingCalendar } from '@/features/day/Calendar';
import { DayDetailsSheet, useDaySources } from '@/features/day/DayDetails';
import { useLabs } from '@/stores/labs';
import { useEnhanced } from '@/stores/enhanced';
import { currentAlerts, currentCoachToday } from '@/features/coach/brief';
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
  const [measureOpen, setMeasureOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const [shiftHidden, setShiftHidden] = useState(false);
  const daySrc = useDaySources();
  const [noteOpen, setNoteOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [coachWhyOpen, setCoachWhyOpen] = useState(false);
  const [proposal, setProposal] = useState<ProgramProposal | null>(null);
  const [feedOpen, setFeedOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);

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
  const plannedToday = useSchedule((st) => st.planned.find((p) => p.date === d && p.status === 'planned'));
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
  const target = nut.target;
  const checkin = checkins[d];
  // Сон: Apple Health (со временем подъёма; без часов — «в постели» от iPhone), иначе — из утреннего чек-ина
  const hd = healthDays[d];
  const sleepRing: SleepRingData | null = hd?.sleepHours
    ? { minutes: Math.round(hd.sleepHours * 60), wakeAt: hd.wakeAt, inBed: hd.sleepInBed, source: 'health' }
    : checkin && sleepMinutesOf(checkin)
      ? { minutes: sleepMinutesOf(checkin)!, source: 'checkin' }
      : null;
  const week = agendaProgress(weekAgenda({ today: d, plan, sessions, overrides }));

  const reactTo = (i: LocalInsight, status: 'accepted' | 'dismissed') => {
    if (i.key) useCoach.getState().recordAdvice({ key: i.key, date: d, text: i.text, status });
  };

  // Цвет фонового света — состояние дня: тренировка, отдых или «поберечься»
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

  // Карточка «Сегодня»: идёт → выполнено → по программе → своя запланированная → отдых → нет плана
  const cardState: WorkoutCardState = active
    ? { kind: 'active', session: active }
    : tw.kind === 'done' && tw.completedSession
      ? { kind: 'done', session: tw.completedSession, minutes: debrief?.minutes, sets: debrief?.sets, prs: debrief?.prs.length, next: tw.nextWorkout }
      : tw.kind === 'workout' && tw.template
        ? {
            kind: 'workout',
            template: tw.template,
            minutes: tw.estMinutes,
            sets: tw.totalSets,
            label: coach?.mode === 'Отдых' ? 'Тренер советует отдых' : tw.mode !== 'normal' ? `По программе · ${MODE_LABEL[tw.mode].toLowerCase()}` : 'Тренировка по программе',
            coachRest: coach?.mode === 'Отдых',
            onStart: () => startTodayPlanned(),
          }
        : plannedToday && (tw.kind === 'rest' || tw.kind === 'no_plan')
          ? { kind: 'planned', planned: plannedToday, minutes: estimateMinutes(plannedToday.exercises, customs), onStart: () => startPlanned(plannedToday) }
          : tw.kind === 'rest'
            ? { kind: 'rest', reason: tw.reason, next: tw.nextWorkout }
            : { kind: 'no_plan' };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Всё на одном экране: прокрутка включается, только если не помещается (маленький iPhone, крупный текст) */}
      <ScrollView alwaysBounceVertical={false} contentContainerStyle={{ paddingTop: insets.top + space.xs, paddingHorizontal: space.md, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + space.md }} showsVerticalScrollIndicator={false}>
        {/* Шапка (макет 01-home): «Сегодня», дата — вход в дневник дня, колокольчик — сигналы тренера */}
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <T v="title1" accessibilityRole="header">
              Сегодня
            </T>
            <Pressable accessibilityRole="button" accessibilityLabel="Дневник: календарь дней" onPress={() => setJournalOpen(true)} hitSlop={8} style={[{ alignSelf: 'flex-start' }, linkHit]}>
              <T v="footnote">
                {WEEKDAY_FULL[weekdayIndex(d)]}, {formatDayLong(d)}
              </T>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={feed.length ? `Сигналы тренера: ${feed.length}` : 'Сигналы тренера'} onPress={() => { haptic.tap(); setFeedOpen(true); }} hitSlop={6} style={styles.bell} testID="home-bell">
            <Icon name="notifications-outline" size={22} color={colors.text} />
            {feed.length ? <View style={[styles.bellDot, feed.some((f) => f.tone === 'urgent' || f.tone === 'warning') && { backgroundColor: colors.warning }]} testID="home-bell-dot" /> : null}
          </Pressable>
        </View>

        <View style={{ marginTop: space.md }}>
          <WorkoutCard state={cardState} onResume={resumeActive} />
        </View>

        {target ? (
          <View style={{ marginTop: space.lg }}>
            <NutritionBlock eaten={nut.eaten} target={target} entries={nut.entries} />
          </View>
        ) : null}

        {/* Три кольца дня: шаги, сон (с подъёмом), тренировки недели; советы тренера — по колокольчику */}
        <View style={{ marginTop: space.lg }}>
          <DayRings
            steps={health?.steps}
            stepsTarget={steps?.target ?? profile.stepsPerDay}
            healthOn={healthOn}
            sleep={sleepRing}
            week={week}
            onSteps={() => (health?.steps === undefined && !healthOn ? router.push('/health') : setStepsOpen(true))}
            onSleep={() => (readiness ? setWhyOpen(true) : router.push('/checkin'))}
            onWeek={() => router.push('/training')}
          />
        </View>
      </ScrollView>

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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  bell: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 9, right: 10, width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accent, borderWidth: 1.5, borderColor: colors.bg },
  checkin: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingVertical: 12, paddingHorizontal: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pair: { flexDirection: 'row', gap: 12, marginTop: 12 },
  water: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, paddingVertical: 12, paddingHorizontal: space.md, borderRadius: radius.lg, backgroundColor: colors.surface },
  waterBtn: { minWidth: 56, height: 36, borderRadius: 18, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  fit: { padding: 14, borderRadius: radius.md, backgroundColor: colors.surface2, gap: 4 },
  jRow: { flexDirection: 'row', gap: 10 },
  jRail: { alignItems: 'center', width: 12, paddingTop: 6 },
  jDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.textDim },
  jLine: { flex: 1, width: 1, backgroundColor: colors.borderStrong, marginTop: 4 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface2, justifyContent: 'center' },
});
