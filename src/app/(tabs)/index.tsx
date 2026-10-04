import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, T, type IconName } from '@/components/ui';
import { ActivityRings, Bar } from '@/components/charts';
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
import { buildJournal, dayMode, type JournalKind } from '@/features/journal/build';
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
const KIND_ICON: Record<JournalKind, IconName> = {
  checkin: 'sunny-outline',
  weight: 'scale-outline',
  meal: 'restaurant-outline',
  workout_planned: 'barbell-outline',
  workout_active: 'play-circle-outline',
  workout_done: 'checkmark-circle',
  pr: 'trophy-outline',
  plan: 'sparkles-outline',
  health: 'heart-outline',
  note: 'create-outline',
};
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
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: space.lg, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + space.xl, gap: 12 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <T v="caption" color={colors.accent} style={{ letterSpacing: 2 }}>
              {BRAND} · СЕГОДНЯ
            </T>
            <T v="h2" numberOfLines={1} style={{ marginTop: 1 }}>
              {mode === 'evening' ? `Итог дня, ${firstName}` : `${greeting()}, ${firstName}`}
            </T>
            <Pressable accessibilityRole="button" accessibilityLabel="Дневник: календарь дней" onPress={() => setDiaryOpen(true)} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <T v="small">
                {WEEKDAY_FULL[weekdayIndex(d)]}, {formatDayLong(d)}
              </T>
              <Icon name="calendar-outline" size={14} color={colors.accent} />
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Тренер ${BRAND} — совет дня и чат`} onPress={() => router.push(insight && insight.date === d ? { pathname: '/coach', params: { insight: '1' } } : '/coach')} style={styles.coachBtn} hitSlop={4}>
            <Icon name="sparkles" size={20} color={colors.accent} />
            {tips.length ? <View style={styles.coachDot} /> : null}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Профиль" onPress={() => router.push('/profile')} style={styles.avatar} hitSlop={4}>
            <T v="h3" color={colors.onAccent}>
              {firstName.charAt(0).toUpperCase()}
            </T>
          </Pressable>
        </View>

        <View style={styles.quickRow}>
          <QuickAction icon="restaurant-outline" label="+ Еда" onPress={() => setAddFood(true)} />
          <QuickAction icon="body-outline" label="+ Замеры" onPress={() => setMeasureOpen(true)} />
          <QuickAction icon="sunny-outline" label="Check-in" onPress={() => router.push('/checkin')} done={!!checkin} />
        </View>


        <Hero tw={tw} active={active} debrief={debrief} readiness={readiness} coach={coach} rings={rings} onWhy={() => setWhyOpen(true)} onCoachWhy={() => setCoachWhyOpen(true)} onAddFood={() => setAddFood(true)} />


        <View style={styles.grid}>
          <Tile
            label="Калории"
            value={target ? fmtNum(nut.eaten.kcal) : '—'}
            sub={target ? `из ${fmtNum(target.kcal)}` : 'нет цели'}
            progress={target ? nut.eaten.kcal / target.kcal : undefined}
            color={target && nut.eaten.kcal > target.kcal * 1.08 ? colors.warning : colors.accent}
            icon="flame-outline"
            onPress={() => router.push('/nutrition')}
            a11y="Калории, открыть питание"
          />
          <Tile label="Белок" value={target ? `${Math.round(nut.eaten.protein)}` : '—'} sub={target ? `из ${target.protein} г` : ''} progress={target ? nut.eaten.protein / target.protein : undefined} color={colors.protein} icon="egg-outline" onPress={() => router.push('/nutrition')} a11y="Белок, открыть питание" />
          <Tile label="Вода" value={water < 1000 ? `${water} мл` : `${String(Math.round(water / 50) / 20).replace('.', ',')} л`} sub={`из ${String(waterGoal / 1000).replace('.', ',')} л · тап — изменить`} progress={water / waterGoal} color={colors.protein} icon="water-outline" onPress={() => setWaterOpen(true)} a11y="Вода: добавить или уменьшить" />
          <Tile
            label="Шаги"
            value={health?.steps !== undefined && steps ? `${fmtNum(health.steps)} / ${fmtNum(steps.target)}` : '—'}
            sub={health?.steps !== undefined ? (steps?.source === 'health' ? `цель по твоей норме ~${fmtNum(steps.baseline)}` : 'цель из профиля') : healthOn ? `нет данных · цель ${fmtNum(steps?.target ?? profile.stepsPerDay)}` : `цель ${fmtNum(steps?.target ?? profile.stepsPerDay)} · Apple Health`}
            progress={health?.steps !== undefined && steps ? health.steps / steps.target : undefined}
            icon="footsteps-outline"
            onPress={() => setStepsOpen(true)}
            a11y="Шаги, как рассчитана цель"
          />
          <Tile label="Сон" value={sleep ? formatHours(sleep) : '—'} sub={sleep ? (checkin ? 'из чек-ина' : 'Apple Health') : 'чек-ин'} progress={sleep ? sleep / 8 : undefined} color={sleep && sleep < 6.5 ? colors.warning : colors.accent} icon="moon-outline" onPress={() => router.push('/checkin')} a11y="Сон, чек-ин" />
          <Tile label={GOAL_LABEL[profile.goal]} value={goal?.headline ?? '—'} sub={goal?.detail ?? ''} progress={goal?.pct ?? undefined} icon="flag-outline" small onPress={() => router.push('/progress')} a11y="Прогресс к цели" />
        </View>

        <View style={styles.measure} testID="measure-card">
          <Pressable accessibilityRole="button" accessibilityLabel="Замеры: вес и талия, открыть тренд" onPress={() => router.push('/weight')} style={({ pressed }) => [{ flex: 1, gap: 4 }, pressed && { opacity: 0.8 }]}>
            <T v="caption">Замеры</T>
            <View style={{ flexDirection: 'row', gap: space.lg }}>
              <View>
                <T v="small" style={{ fontSize: 11 }}>
                  Вес{body.weight.avg7 !== null ? ' · среднее 7 дн' : ''}
                </T>
                <T v="num" style={{ fontSize: 20 }}>
                  {body.weight.avg7 !== null ? fmtWeight(body.weight.avg7) : weights.length ? fmtWeight(weights[weights.length - 1].kg) : '—'}
                  <T v="small"> кг</T>
                </T>
                {body.weight.kgPerWeek !== null ? (
                  <T v="small" style={{ fontSize: 11 }}>
                    {body.weight.kgPerWeek >= 0 ? '+' : '−'}
                    {Math.abs(body.weight.kgPerWeek).toFixed(2).replace('.', ',')} кг/нед
                  </T>
                ) : null}
              </View>
              <View>
                <T v="small" style={{ fontSize: 11 }}>
                  Талия
                </T>
                <T v="num" style={{ fontSize: 20 }}>
                  {lastWaist ? String(lastWaist.value).replace('.', ',') : '—'}
                  <T v="small"> см</T>
                </T>
                {body.waist ? (
                  <T v="small" style={{ fontSize: 11 }}>
                    {body.waist.changeCm >= 0 ? '+' : '−'}
                    {Math.abs(body.waist.changeCm).toString().replace('.', ',')} см за {Math.max(1, Math.round(body.waist.days / 7))} нед
                  </T>
                ) : null}
              </View>
            </View>
          </Pressable>
          <Button title="Добавить" icon="add" size="sm" variant="secondary" onPress={() => setMeasureOpen(true)} />
        </View>

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

        <View style={styles.journalHead}>
          <T v="caption" style={{ flex: 1 }}>
            Дневник · сегодня
          </T>
          <Pressable accessibilityRole="button" onPress={() => setNoteOpen(true)} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="add" size={16} color={colors.accent} />
            <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
              Заметка
            </T>
          </Pressable>
        </View>
        <View style={styles.journal}>
          {journal.length === 0 ? (
            <T v="small" style={{ padding: space.md }}>
              {BRAND} будет записывать сюда день сам: чек-ин, вес, еду, тренировку, рекорды и изменения плана.
            </T>
          ) : null}
          {journal.length > shownJournal.length ? (
            <Pressable accessibilityRole="button" onPress={() => setAllJournal(true)} style={{ paddingBottom: 10 }}>
              <T v="small" color={colors.accent} style={{ fontWeight: '700' }}>
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
              <T v="small" style={{ width: 44, fontVariant: ['tabular-nums'], fontWeight: '700' }} color={e.planned ? colors.muted : colors.textDim}>
                {new Date(e.at).toTimeString().slice(0, 5)}
              </T>
              <View style={styles.jRail}>
                <View style={[styles.jDot, e.kind === 'pr' && { backgroundColor: colors.accent }, e.planned && { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.muted }]}>
                  <Icon name={KIND_ICON[e.kind]} size={12} color={e.kind === 'pr' ? colors.onAccent : e.planned ? colors.muted : colors.text} />
                </View>
                {i < shownJournal.length - 1 ? <View style={styles.jLine} /> : null}
              </View>
              <View style={{ flex: 1, paddingBottom: 12 }}>
                <T v="body" style={{ fontWeight: '700', fontSize: 14 }} color={e.planned ? colors.textDim : colors.text}>
                  {e.title}
                </T>
                {e.sub ? (
                  <T v="small" style={{ fontSize: 12 }} numberOfLines={e.kind === 'note' ? 4 : 2}>
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
 * RYNJI COACH — СЕГОДНЯ: одна карточка отвечает на «что делать сегодня» — тренировка и режим, готовность, сон,
 * шаги, КБЖУ, главный фокус и «Почему?». Всё собрано автоматически движком решений.
 */
function Hero({
  tw,
  active,
  debrief,
  readiness,
  coach,
  rings,
  onWhy,
  onCoachWhy,
  onAddFood,
}: {
  tw: ReturnType<typeof useTodayWorkout>;
  active: WorkoutSession | null;
  debrief: ReturnType<typeof workoutDebrief> | null;
  readiness: ReturnType<typeof useReadiness>;
  coach: CoachToday | null;
  rings: { training: number; protein: number; steps: number | null };
  onWhy: () => void;
  onCoachWhy: () => void;
  onAddFood: () => void;
}) {
  const readyCol = !readiness ? colors.textDim : readiness.band === 'go' ? colors.accent : readiness.band === 'reduce' ? colors.warning : colors.danger;
  const facts = coach ? (
    <View style={{ gap: 8 }}>
      <View style={styles.chips}>
        <Pressable accessibilityRole="button" accessibilityLabel={readiness ? `Готовность ${readinessLabel(readiness).toLowerCase()}, почему` : 'Пройти чек-ин'} onPress={readiness ? onWhy : () => router.push('/checkin')} style={styles.fact}>
          <Icon name="pulse" size={14} color={readyCol} />
          <T v="small" color={colors.text} style={{ fontWeight: '700' }}>
            {readiness ? (
              <>
                Готовность <T v="small" style={{ fontWeight: '800' }} color={readyCol}>{readinessLabel(readiness).toLowerCase()}</T>
              </>
            ) : (
              'Готовность: чек-ин'
            )}
          </T>
        </Pressable>
        {coach.sleep ? (
          <View style={styles.fact} accessibilityLabel={`Сон ${coach.sleep.text}`}>
            <Icon name="moon-outline" size={14} color={colors.textDim} />
            <T v="small" color={colors.text} style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {coach.sleep.text}
            </T>
          </View>
        ) : null}
        {coach.steps ? (
          <View style={styles.fact} accessibilityLabel={`Цель шагов ${coach.steps.target}`}>
            <Icon name="footsteps-outline" size={14} color={colors.textDim} />
            <T v="small" color={colors.text} style={{ fontWeight: '700' }}>
              {fmtNum(coach.steps.target)}
            </T>
          </View>
        ) : null}
      </View>
      {coach.nutrition ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Питание на сегодня" onPress={() => router.push('/nutrition')} style={styles.heroRow}>
          <Icon name="restaurant-outline" size={16} color={colors.textDim} />
          <View style={{ flex: 1 }}>
            <T v="body" style={{ fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }} color={colors.text}>
              {fmtNum(coach.nutrition.kcal)} ккал · Б {coach.nutrition.protein} · Ж {coach.nutrition.fat} · У {coach.nutrition.carbs}
            </T>
            <T v="small" style={{ fontSize: 11 }}>
              {coach.nutrition.label}
            </T>
          </View>
        </Pressable>
      ) : null}
      {coach.focus ? (
        <View style={styles.focus} testID="coach-focus">
          <Icon name="locate-outline" size={16} color={colors.accent} style={{ marginTop: 1 }} />
          <T v="body" style={{ flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '700' }} color={colors.text}>
            {coach.focus.what}
          </T>
        </View>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Почему? Объяснение решений тренера" onPress={onCoachWhy} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
          Почему?
        </T>
        <T v="small" numberOfLines={1} style={{ flex: 1, fontSize: 12 }}>
          {coach.why[0] ?? ''}
        </T>
        <Icon name="chevron-forward" size={14} color={colors.accent} />
      </Pressable>
    </View>
  ) : null;
  const ringsView = (
    <ActivityRings
      size={60}
      stroke={6}
      rings={[{ progress: rings.training, color: colors.accent }, { progress: rings.protein, color: colors.protein }, ...(rings.steps !== null ? [{ progress: rings.steps, color: colors.warning }] : [])]}
      label={`Прогресс дня: тренировка ${Math.round(rings.training * 100)}%, белок ${Math.round(rings.protein * 100)}%${rings.steps !== null ? `, шаги ${Math.round(rings.steps * 100)}%` : ''}`}
    />
  );
  const titleRow = (title: React.ReactNode, sub: React.ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, gap: 4 }}>
        {title}
        {sub}
      </View>
      {ringsView}
    </View>
  );
  const caption = (right?: React.ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <T v="caption" color={colors.accent} style={{ flex: 1, letterSpacing: 1.5 }}>
        {BRAND} COACH — СЕГОДНЯ
      </T>
      {right}
    </View>
  );

  if (active) {
    const done = active.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
    return (
      <View style={[styles.hero, { borderColor: colors.accent }]}>
        <T v="caption" color={colors.accent}>
          Идёт тренировка
        </T>
        <T v="display" style={{ fontSize: 28 }} numberOfLines={1}>
          {active.name}
        </T>
        <T v="small">Выполнено подходов: {done} · всё сохранено</T>
        <Button title="Продолжить тренировку" icon="play" size="lg" onPress={resumeActive} style={{ marginTop: 6 }} />
      </View>
    );
  }
  if (tw.kind === 'done' && tw.completedSession) {
    const s = tw.completedSession;
    return (
      <View style={styles.hero} testID="coach-today">
        {caption()}
        {titleRow(
          <T v="display" style={{ fontSize: 26 }} numberOfLines={2}>
            {s.name} ✓
          </T>,
          <T v="small">
            Тренировка выполнена{debrief ? ` · ${debrief.minutes} мин · ${debrief.sets} подходов${debrief.prs.length ? ` · рекордов: ${debrief.prs.length}` : ''}` : ''}
            {tw.nextWorkout ? ` · следующая: ${tw.nextWorkout.template.name}, ${formatDayLong(tw.nextWorkout.date)}` : ''}
          </T>,
        )}
        <View style={styles.heroDivider} />
        {facts}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <Button title="Добавить еду" icon="add" size="lg" onPress={onAddFood} style={{ flex: 1 }} />
          <Button title="Итоги" variant="secondary" size="lg" onPress={() => router.push({ pathname: '/workout/[id]', params: { id: s.id } })} />
        </View>
      </View>
    );
  }
  if (tw.kind === 'workout' && tw.template) {
    const stop = coach?.mode === 'Отдых';
    return (
      <View style={[styles.hero, { borderColor: stop ? colors.danger : colors.accentLine }]} testID="coach-today">
        {caption(tw.mode !== 'normal' || stop ? <Badge text={stop ? 'Отдых' : MODE_LABEL[tw.mode]} /> : null)}
        {titleRow(
          <T v="display" style={{ fontSize: 28, lineHeight: 32 }} numberOfLines={2}>
            {coach?.title ?? tw.template.name}
          </T>,
          <T v="body" color={colors.textDim} numberOfLines={2} style={{ fontSize: 14 }}>
            {tw.template.focus} · ~{tw.estMinutes} мин · {tw.totalSets} подходов
          </T>,
        )}
        <View style={styles.heroDivider} />
        {facts}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <Button title="Начать тренировку" icon="play" size="lg" onPress={() => startTodayPlanned()} style={{ flex: 1 }} variant={stop ? 'secondary' : 'primary'} />
          <Button title="Состав" variant="secondary" size="lg" onPress={() => router.push({ pathname: '/workout/preview', params: { templateId: tw.template!.id } })} />
        </View>
      </View>
    );
  }
  if (tw.kind === 'rest') {
    return (
      <View style={styles.hero} testID="coach-today">
        {caption()}
        {titleRow(
          <T v="display" style={{ fontSize: 26 }}>
            День отдыха
          </T>,
          <T v="small">
            {tw.reason ?? 'Восстановление — часть плана'}
            {tw.nextWorkout ? ` · следующая: ${tw.nextWorkout.template.name}, ${formatDayLong(tw.nextWorkout.date)}` : ''}
          </T>,
        )}
        <View style={styles.heroDivider} />
        {facts}
        <Button title="Добавить еду" icon="add" size="lg" onPress={onAddFood} style={{ marginTop: 6 }} />
        <Button title="Всё равно потренироваться" icon="barbell-outline" variant="ghost" size="sm" onPress={() => useUi.getState().openHub()} />
      </View>
    );
  }
  return (
    <View style={styles.hero}>
      <T v="caption">Сегодня</T>
      <T v="h2">Плана пока нет</T>
      <T v="small">Заполни профиль — {BRAND} составит программу и питание.</T>
      <Button title="Открыть профиль" size="lg" onPress={() => router.push('/profile')} />
    </View>
  );
}

function QuickAction({ icon, label, onPress, done }: { icon: IconName; label: string; onPress: () => void; done?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.quick, pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] }]}
    >
      <Icon name={done ? 'checkmark-circle' : icon} size={17} color={colors.accent} />
      <T v="body" style={{ fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
        {label}
      </T>
    </Pressable>
  );
}

function Tile({ label, value, sub, progress, color = colors.accent, icon, onPress, onLongPress, a11y, small }: { label: string; value: string; sub: string; progress?: number; color?: string; icon: IconName; onPress: () => void; onLongPress?: () => void; a11y: string; small?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.8 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon name={icon} size={13} color={colors.textDim} />
        <T v="caption" style={{ fontSize: 10, flex: 1 }} numberOfLines={1}>
          {label}
        </T>
      </View>
      <T v="num" style={{ fontSize: small ? 15 : 20, lineHeight: small ? 19 : 24 }} numberOfLines={small ? 2 : 1} adjustsFontSizeToFit={!small}>
        {value}
      </T>
      <T v="small" style={{ fontSize: 10.5 }} numberOfLines={2}>
        {sub}
      </T>
      {progress !== undefined ? <Bar progress={progress} color={color} height={4} style={{ marginTop: 'auto' }} /> : null}
    </Pressable>
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


function Badge({ text }: { text: string }) {
  return (
    <View style={styles.badge}>
      <T v="small" color={colors.warning} style={{ fontSize: 11, fontWeight: '800' }}>
        {text}
      </T>
    </View>
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
  quickRow: { flexDirection: 'row', gap: 8 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accentLine },
  quick: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  measure: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  insights: { gap: 8, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine },
  hero: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.border, padding: space.lg, gap: 6 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  heroDivider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  focus: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: radius.md, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '31.6%', flexGrow: 1, minHeight: 96, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 3 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  tip: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tipIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  fit: { padding: 12, borderRadius: radius.md, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coachBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine, alignItems: 'center', justifyContent: 'center' },
  coachDot: { position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  headBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  goal: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine },
  goalDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: space.md, paddingVertical: 12, gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.warningDim },
  coach: { gap: 10 },
  coachIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  journalHead: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  journal: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingTop: 14, paddingHorizontal: space.md },
  jRow: { flexDirection: 'row', gap: 10 },
  jRail: { alignItems: 'center', width: 24 },
  jDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  jLine: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 2 },
  chip: { paddingHorizontal: 12, height: 34, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, justifyContent: 'center' },
});
