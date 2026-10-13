import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, T, type IconName } from '@/components/ui';
import { ActivityRings } from '@/components/charts';
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
import { useUi } from '@/stores/ui';
import { useDayNutrition, useReadiness, useTodayWorkout } from '@/hooks/useToday';
import type { WorkoutSession } from '@/types';
import { goalProgress } from '@/features/progress/goal';
import { ReadinessSheet } from '@/features/recovery/ReadinessSheet';
import { applyCoachAction, currentLocalInsights, refreshDailyInsight } from '@/features/coach/service';
import type { LocalInsight } from '@/features/coach/insights';
import type { ProgramProposal } from '@/features/training/adaptPlan';
import { applyProgramProposal } from '@/features/training/adaptActions';
import { useDayKey } from '@/hooks/useDayKey';
import { GOAL_LABEL } from '@/features/nutrition/targets';
import { MODE_LABEL } from '@/features/training/today';
import { resumeActive, startTodayPlanned } from '@/features/training/actions';
import { weightTrend } from '@/features/progress/weightTrend';
import { buildJournal, dayMode } from '@/features/journal/build';
import { workoutDebrief } from '@/features/training/debrief';
import { healthContext } from '@/features/health/model';
import { AddFoodSheet } from '@/features/nutrition/AddFoodSheet';
import { addDays, formatDayLong, formatHours, greeting, weekdayIndex } from '@/utils/date';
import { fmtNum, fmtWeight } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';
import { stepGoal } from '@/features/science/steps';
import { bodyTrend } from '@/features/science/bodyTrend';
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
import { buildFeed, dayVerdict, SETUP_SECTION } from '@/features/coach/feed';
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
  const [allJournal, setAllJournal] = useState(false);

  const trend = useMemo(() => {
    const t = weightTrend(weights);
    if (!t.length) return null;
    const last = t[t.length - 1];
    const weekAgo = [...t].reverse().find((p) => p.date <= addDays(last.date, -7));
    return { w: last.trend, week: weekAgo ? last.trend - weekAgo.trend : null };
  }, [weights]);
  const health = useMemo(() => healthContext(healthDays, d), [healthDays, d]);
  const goal = useMemo(() => (profile ? goalProgress(profile, weights, metrics) : null), [profile, weights, metrics]);
  // Наука: персональная цель шагов, тренд тела и выводы — детерминированно из данных
  const steps = useMemo(() => (profile ? stepGoal({ age: profile.age, profileSteps: profile.stepsPerDay, health: healthDays, ref: d }) : null), [profile, healthDays, d]);
  const body = useMemo(() => bodyTrend(weights, metrics, d), [weights, metrics, d]);
  const due = useMemo(() => measurementDue(weights, metrics, d), [weights, metrics, d]);
  const shiftRaw = useMemo(() => missedWorkoutProposal({ date: d, hour: new Date().getHours(), plan, sessions, overrides, customs }), [d, plan, sessions, overrides, customs]);
  const shift = shiftHidden ? null : shiftRaw;
  const lastWaist = useMemo(() => [...metrics].reverse().find((m) => m.kind === 'waist'), [metrics]);
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
  // Кольца дня: тренировка (сделана / доля подходов / день отдыха), белок, шаги
  const rings = useMemo(() => {
    const doneSets = active ? active.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0) : 0;
    const allSets = active ? active.exercises.reduce((a, e) => a + e.sets.length, 0) : 0;
    const training = tw.kind === 'done' || tw.kind === 'rest' ? 1 : active ? (allSets ? doneSets / allSets : 0) : 0;
    const protein = target0 ? nut.eaten.protein / target0.protein : 0;
    const st = healthDays[d]?.steps;
    return { training, protein, steps: st !== undefined && steps ? st / steps.target : null };
  }, [active, tw.kind, target0, nut.eaten.protein, healthDays, d, steps]);
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
  const shownJournal = allJournal ? journal : journal.slice(-5);

  const reactTo = (i: LocalInsight, status: 'accepted' | 'dismissed') => {
    if (i.key) useCoach.getState().recordAdvice({ key: i.key, date: d, text: i.text, status });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: space.lg, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + space.xl }} showsVerticalScrollIndicator={false}>
        {/* Шапка: дата (открывает дневник дней), приветствие крупно; справа — тренер и профиль */}
        <View style={styles.header}>
          <View style={{ flex: 1, gap: 2 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Дневник: календарь дней" onPress={() => setDiaryOpen(true)} hitSlop={6} style={{ alignSelf: 'flex-start' }}>
              <T v="caption">
                {WEEKDAY_FULL[weekdayIndex(d)]}, {formatDayLong(d)}
              </T>
            </Pressable>
            <T v="h1" numberOfLines={2}>
              {mode === 'evening' ? `Итог дня, ${firstName}` : `${greeting()}, ${firstName}`}
            </T>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Тренер ${BRAND} — совет дня и чат`} onPress={() => router.push(insight && insight.date === d ? { pathname: '/coach', params: { insight: '1' } } : '/coach')} style={styles.headBtn} hitSlop={4}>
            <Icon name="sparkles" size={19} color={colors.accent} />
            {tips.length ? <View style={styles.coachDot} /> : null}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Профиль" onPress={() => router.push('/profile')} style={styles.headBtn} hitSlop={4}>
            <T v="h3" color={colors.text}>
              {firstName.charAt(0).toUpperCase()}
            </T>
          </Pressable>
        </View>

        <Hero tw={tw} active={active} debrief={debrief} coach={coach} onCoachWhy={() => setCoachWhyOpen(true)} onAddFood={() => setAddFood(true)} />

        {/* День — один спокойный список вместо плиток: значение справа, действие — в строке */}
        <View style={styles.dayHead}>
          <T v="h3" style={{ flex: 1 }}>
            День
          </T>
          <ActivityRings
            size={34}
            stroke={4}
            rings={[{ progress: rings.training, color: colors.accent }, { progress: rings.protein, color: colors.protein }, ...(rings.steps !== null ? [{ progress: rings.steps, color: colors.warning }] : [])]}
            label={`Прогресс дня: тренировка ${Math.round(rings.training * 100)}%, белок ${Math.round(rings.protein * 100)}%${rings.steps !== null ? `, шаги ${Math.round(rings.steps * 100)}%` : ''}`}
          />
        </View>
        <View style={styles.list}>
          <DayRow
            label="Готовность"
            a11y={readiness ? `Готовность ${readinessLabel(readiness).toLowerCase()} · сон, чек-ин` : 'Готовность · сон, чек-ин'}
            value={readiness ? readinessLabel(readiness) : '—'}
            valueColor={!readiness ? colors.textDim : readiness.band === 'go' ? colors.text : readiness.band === 'reduce' ? colors.warning : colors.danger}
            sub={sleep ? `Сон ${formatHours(sleep)}` : 'Утренний чек-ин — 30 секунд'}
            onPress={readiness ? () => setWhyOpen(true) : () => router.push('/checkin')}
            action={{ label: 'Check-in', icon: checkin ? 'checkmark' : 'sunny-outline', onPress: () => router.push('/checkin'), done: !!checkin }}
          />
          <DayRow
            label="Питание"
            a11y="Калории, открыть питание"
            value={target ? `${fmtNum(nut.eaten.kcal)} / ${fmtNum(target.kcal)}` : '—'}
            unit="ккал"
            sub={target ? `Б ${target.protein} · Ж ${target.fat} · У ${target.carbs} г` : 'нет цели'}
            progress={target ? nut.eaten.kcal / target.kcal : undefined}
            onPress={() => router.push('/nutrition')}
            action={{ label: '+ Еда', icon: 'add', onPress: () => setAddFood(true) }}
          />
          <DayRow
            label="Вода"
            a11y="Вода: добавить или уменьшить"
            value={`${water < 1000 ? `${water} мл` : `${String(Math.round(water / 50) / 20).replace('.', ',')} л`} / ${String(waterGoal / 1000).replace('.', ',')} л`}
            progress={water / waterGoal}
            onPress={() => setWaterOpen(true)}
          />
          <DayRow
            label="Шаги"
            a11y="Шаги, как рассчитана цель"
            value={health?.steps !== undefined && steps ? `${fmtNum(health.steps)} / ${fmtNum(steps.target)}` : `— / ${fmtNum(steps?.target ?? profile.stepsPerDay)}`}
            progress={health?.steps !== undefined && steps ? health.steps / steps.target : undefined}
            onPress={() => setStepsOpen(true)}
          />
          <View testID="measure-card">
            <DayRow
              label="Вес"
              a11y="Замеры: вес и талия, открыть тренд"
              value={body.weight.avg7 !== null ? fmtWeight(body.weight.avg7) : weights.length ? fmtWeight(weights[weights.length - 1].kg) : '—'}
              unit="кг"
              sub={[body.weight.kgPerWeek !== null ? `${body.weight.kgPerWeek >= 0 ? '+' : '−'}${Math.abs(body.weight.kgPerWeek).toFixed(2).replace('.', ',')} кг/нед` : '', lastWaist ? `талия ${String(lastWaist.value).replace('.', ',')} см` : ''].filter(Boolean).join(' · ') || undefined}
              onPress={() => router.push('/weight')}
              action={{ label: '+ Замеры', icon: 'add', onPress: () => setMeasureOpen(true) }}
            />
          </View>
          <DayRow label="Цель" a11y="Прогресс к цели" value={goal?.headline ?? GOAL_LABEL[profile.goal]} small onPress={() => router.push('/progress')} last />
        </View>

        <View style={{ marginTop: space.xl }}>
          <CoachFeed
            items={feed}
            onAction={(it, a) => {
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
            }}
            onDismiss={(it) => {
              if (it.id === 'shift') setShiftHidden(true);
              if (it.adviceKey) useCoach.getState().recordAdvice({ key: it.adviceKey, date: d, text: it.title, status: 'dismissed' });
            }}
          />
        </View>

        <View style={styles.journalHead}>
          <T v="h3" style={{ flex: 1 }}>
            Дневник дня
          </T>
          <Pressable accessibilityRole="button" accessibilityLabel="Заметка" onPress={() => setNoteOpen(true)} hitSlop={8} style={styles.noteBtn}>
            <Icon name="add" size={18} color={colors.text} />
          </Pressable>
        </View>
        <View>
          {journal.length === 0 ? <T v="small">Чек-ин, вес, еда и тренировка появятся здесь сами.</T> : null}
          {journal.length > shownJournal.length ? (
            <Pressable accessibilityRole="button" onPress={() => setAllJournal(true)} style={{ paddingBottom: 12 }}>
              <T v="small" color={colors.textDim} style={{ fontWeight: '600' }}>
                Показать весь день · ещё {journal.length - shownJournal.length}
              </T>
            </Pressable>
          ) : null}
          {shownJournal.map((e, i) => (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              onPress={() => {
                if (e.kind === 'workout_done' && e.refId) router.push({ pathname: '/workout/[id]', params: { id: e.refId } });
                else if (e.kind === 'workout_active') resumeActive();
                else if (e.kind === 'meal') router.push('/nutrition');
                else if (e.kind === 'checkin') router.push('/checkin');
                else if (e.kind === 'weight') router.push('/weight');
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
                {i < shownJournal.length - 1 ? <View style={styles.jLine} /> : null}
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
      </ScrollView>

      <AddFoodSheet visible={addFood} onClose={() => setAddFood(false)} date={d} meal={mealForHour(now.getHours())} />
      <Sheet visible={diaryOpen} onClose={() => setDiaryOpen(false)} title="Дневник" subtitle="Выбери день — сон, шаги, вес, тренировка, питание">
        <TrainingCalendar initiallyOpen today={d} src={daySrc} onSelect={(x) => { setDiaryOpen(false); afterModalClose(() => setDayOpen(x)); }} />
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

/**
 * Главное на сегодня — без карточки, крупной типографикой на фоне: что за тренировка, один фокус тренера,
 * «Почему?» и одна главная кнопка. Всё остальное (КБЖУ, сон, шаги) — в списке «День» ниже.
 */
function Hero({
  tw,
  active,
  debrief,
  coach,
  onCoachWhy,
  onAddFood,
}: {
  tw: ReturnType<typeof useTodayWorkout>;
  active: WorkoutSession | null;
  debrief: ReturnType<typeof workoutDebrief> | null;
  coach: CoachToday | null;
  onCoachWhy: () => void;
  onAddFood: () => void;
}) {
  const focus = coach?.focus ? (
    <View style={styles.focus} testID="coach-focus">
      <View style={styles.focusDot} />
      <T v="body" style={{ flex: 1, lineHeight: 22 }} color={colors.text}>
        {coach.focus.what}
      </T>
    </View>
  ) : null;
  const why = coach ? (
    <Pressable accessibilityRole="button" accessibilityLabel="Почему? Объяснение решений тренера" onPress={onCoachWhy} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
      <T v="small" style={{ fontWeight: '600' }}>
        Почему так ›
      </T>
    </Pressable>
  ) : null;
  const eyebrow = (text: string, warn?: string) => (
    <T v="caption">
      {text}
      {warn ? <T v="caption" color={colors.warning}>{` · ${warn}`}</T> : null}
    </T>
  );

  if (active) {
    const done = active.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
    return (
      <View style={styles.hero}>
        {eyebrow('Идёт тренировка')}
        <T v="display" numberOfLines={2}>
          {active.name}
        </T>
        <T v="bodyDim">Выполнено подходов: {done}</T>
        <Button title="Продолжить тренировку" icon="play" size="lg" onPress={resumeActive} style={styles.heroCta} />
      </View>
    );
  }
  if (tw.kind === 'done' && tw.completedSession) {
    const s = tw.completedSession;
    return (
      <View style={styles.hero} testID="coach-today">
        {eyebrow('Тренировка выполнена')}
        <T v="display" numberOfLines={2}>
          {s.name} ✓
        </T>
        <T v="bodyDim">
          {debrief ? `${debrief.minutes} мин · ${debrief.sets} подходов${debrief.prs.length ? ` · рекордов: ${debrief.prs.length}` : ''}` : ''}
          {tw.nextWorkout ? `${debrief ? ' · ' : ''}дальше ${tw.nextWorkout.template.name}, ${formatDayLong(tw.nextWorkout.date)}` : ''}
        </T>
        {focus}
        {why}
        <Button title="Добавить еду" icon="add" size="lg" onPress={onAddFood} style={styles.heroCta} />
        <Button title="Итоги" variant="ghost" size="sm" onPress={() => router.push({ pathname: '/workout/[id]', params: { id: s.id } })} />
      </View>
    );
  }
  if (tw.kind === 'workout' && tw.template) {
    const stop = coach?.mode === 'Отдых';
    return (
      <View style={styles.hero} testID="coach-today">
        {eyebrow('Тренировка дня', stop ? 'отдых' : tw.mode !== 'normal' ? MODE_LABEL[tw.mode].toLowerCase() : undefined)}
        <T v="display" numberOfLines={2}>
          {coach?.title ?? tw.template.name}
        </T>
        <T v="bodyDim" numberOfLines={2}>
          ~{tw.estMinutes} мин · {tw.totalSets} подходов · {tw.template.focus.toLowerCase()}
        </T>
        {focus}
        {why}
        <Button title="Начать тренировку" icon="play" size="lg" onPress={() => startTodayPlanned()} style={styles.heroCta} variant={stop ? 'secondary' : 'primary'} />
        <Button title="Состав" variant="ghost" size="sm" onPress={() => router.push({ pathname: '/workout/preview', params: { templateId: tw.template!.id } })} />
      </View>
    );
  }
  if (tw.kind === 'rest') {
    return (
      <View style={styles.hero} testID="coach-today">
        {eyebrow('Сегодня')}
        <T v="display">День отдыха</T>
        <T v="bodyDim">
          {tw.reason ?? 'Восстановление — часть плана'}
          {tw.nextWorkout ? ` · дальше ${tw.nextWorkout.template.name}, ${formatDayLong(tw.nextWorkout.date)}` : ''}
        </T>
        {focus}
        {why}
        <Button title="Добавить еду" icon="add" size="lg" onPress={onAddFood} style={styles.heroCta} />
        <Button title="Всё равно потренироваться" variant="ghost" size="sm" onPress={() => useUi.getState().openHub()} />
      </View>
    );
  }
  return (
    <View style={styles.hero}>
      {eyebrow('Сегодня')}
      <T v="display">Плана пока нет</T>
      <T v="bodyDim">Заполни профиль — {BRAND} составит программу и питание.</T>
      <Button title="Открыть профиль" size="lg" onPress={() => router.push('/profile')} style={styles.heroCta} />
    </View>
  );
}

/** Строка списка «День»: название, значение справа, тонкая шкала; справа — быстрое действие (если есть) */
function DayRow({ label, a11y, value, unit, sub, valueColor, progress, onPress, action, small, last }: { label: string; a11y: string; value: string; unit?: string; sub?: string; valueColor?: string; progress?: number; onPress: () => void; action?: { label: string; icon: IconName; onPress: () => void; done?: boolean }; small?: boolean; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.rowLine]}>
      <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={() => { haptic.tap(); onPress(); }} style={({ pressed }) => [{ flex: 1, gap: 3, paddingVertical: 13 }, pressed && { opacity: 0.6 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <T v="body" color={colors.textDim}>
            {label}
          </T>
          <T v={small ? 'body' : 'num'} style={[{ flex: 1, textAlign: 'right' }, small ? { fontWeight: '600' } : { fontSize: 17 }]} color={valueColor ?? colors.text} numberOfLines={1} adjustsFontSizeToFit>
            {value}
            {unit ? <T v="small"> {unit}</T> : null}
          </T>
        </View>
        {sub ? (
          <T v="small" numberOfLines={1} style={{ fontSize: 13 }}>
            {sub}
          </T>
        ) : null}
        {progress !== undefined ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, progress * 100))}%` }, progress > 1.08 && { backgroundColor: colors.warning }]} />
          </View>
        ) : null}
      </Pressable>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={() => { haptic.tap(); action.onPress(); }} hitSlop={8} style={({ pressed }) => [styles.rowAct, action.done && { backgroundColor: 'transparent' }, pressed && { opacity: 0.6 }]}>
          <Icon name={action.icon} size={18} color={action.done ? colors.textDim : colors.text} />
        </Pressable>
      ) : null}
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
  headBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  coachDot: { position: 'absolute', top: 9, right: 10, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent },
  hero: { gap: 8, marginTop: space.xl },
  heroCta: { marginTop: space.md },
  focus: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: space.sm },
  focusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent, marginTop: 8 },
  dayHead: { flexDirection: 'row', alignItems: 'center', marginTop: space.xxl, marginBottom: space.sm },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingLeft: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: space.md },
  rowLine: { borderBottomWidth: 0.5, borderBottomColor: colors.borderStrong },
  rowAct: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  track: { height: 3, borderRadius: 2, backgroundColor: colors.surface3, overflow: 'hidden', marginTop: 4 },
  fill: { height: 3, borderRadius: 2, backgroundColor: colors.accent },
  fit: { padding: 14, borderRadius: radius.md, backgroundColor: colors.surface2, gap: 4 },
  journalHead: { flexDirection: 'row', alignItems: 'center', marginTop: space.xxl, marginBottom: space.md },
  noteBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  jRow: { flexDirection: 'row', gap: 10 },
  jRail: { alignItems: 'center', width: 12, paddingTop: 6 },
  jDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.textDim },
  jLine: { flex: 1, width: 1, backgroundColor: colors.borderStrong, marginTop: 4 },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: radius.pill, backgroundColor: colors.surface2, justifyContent: 'center' },
});
