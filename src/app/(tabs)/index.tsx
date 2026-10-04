import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, T, type IconName } from '@/components/ui';
import { Bar } from '@/components/charts';
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
import type { NutritionTarget, WorkoutSession } from '@/types';
import { goalProgress } from '@/features/progress/goal';
import { ReadinessSheet } from '@/features/recovery/ReadinessSheet';
import { BAND_META } from '@/features/recovery/readiness';
import { applyCoachAction, currentLocalInsights, refreshDailyInsight } from '@/features/coach/service';
import type { LocalInsight } from '@/features/coach/insights';
import type { ProgramProposal } from '@/features/training/adaptPlan';
import { applyProgramProposal } from '@/features/training/adaptActions';
import { useDayKey } from '@/hooks/useDayKey';
import { GOAL_LABEL, targetWeeklyChangeKg } from '@/features/nutrition/targets';
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
import { dayInsights, readinessLabel } from '@/features/science/insights';
import { sleepBaseline } from '@/features/science/recovery';
import { BASIS_LABEL } from '@/features/science/sources';
import { QuickMeasureSheet } from '@/features/progress/QuickMeasureSheet';

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
const NOTE_CHIPS = ['Плохо спал', 'Мало времени на тренировку', 'Поясница в порядке', 'Отличное самочувствие', 'Устал после работы'];

/**
 * Главная — дневник и центр управления дня. Самое важное сверху, порядок карточек зависит от времени:
 * утро — готовность и план; после тренировки — результаты; вечер — итог дня. Остальное FORM пишет в
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
  const readiness = useReadiness();
  const tw = useTodayWorkout();
  const nut = useDayNutrition();
  const [addFood, setAddFood] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
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
  const lastWaist = useMemo(() => [...metrics].reverse().find((m) => m.kind === 'waist'), [metrics]);
  const insights = useMemo(() => {
    if (!profile) return [];
    const cur = body.weight.trendKg ?? profile.weightKg;
    return dayInsights({
      readiness,
      sleepBaseline: sleepBaseline(d, checkins, healthDays),
      sleepHours: checkins[d]?.sleepHours ?? healthDays[d]?.sleepHours,
      body,
      goal: profile.goal,
      targetKgPerWeek: targetWeeklyChangeKg(profile, cur),
    });
  }, [profile, body, readiness, d, checkins, healthDays]);
  // Советы тренера пересчитываются при изменении данных, которые на них влияют
  const tips = useMemo(
    () => (profile ? currentLocalInsights().filter((i) => i.kind !== 'general' || i.key) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile, plan, overrides, sessions, entries, checkins, weights, advice, d, healthDays],
  );

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

  const addWater = (ml: number) => {
    useNutrition.getState().addWater(d, ml);
    haptic.light();
    toast(`Вода +${ml} мл`, 'water-outline', { label: 'Отменить', onPress: () => useNutrition.getState().addWater(d, -ml) });
  };
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
            <T v="small">
              {WEEKDAY_FULL[weekdayIndex(d)]}, {formatDayLong(d)}
            </T>
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

        <Hero tw={tw} active={active} debrief={debrief} readiness={readiness} onWhy={() => setWhyOpen(true)} target={target} trend={trend} onAddFood={() => setAddFood(true)} />

        {mode === 'evening' ? (
          <DaySummary workout={doneToday ? `${doneToday.name} ✓` : tw.kind === 'rest' ? 'День отдыха' : tw.kind === 'workout' ? 'Не выполнена' : '—'} kcal={target ? [nut.eaten.kcal, target.kcal] : null} protein={target ? [nut.eaten.protein, target.protein] : null} steps={health?.steps} workoutDone={!!doneToday} restDay={tw.kind === 'rest'} />
        ) : null}

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
          <Tile label="Вода" value={water < 1000 ? `${water} мл` : `${String(Math.round(water / 50) / 20).replace('.', ',')} л`} sub={`из ${String(waterGoal / 1000).replace('.', ',')} л · тап +250`} progress={water / waterGoal} color={colors.protein} icon="water-outline" onPress={() => addWater(250)} onLongPress={() => water > 0 && addWater(-250)} a11y="Вода: добавить стакан 250 мл" />
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

        {insights.length ? (
          <View style={styles.insights} testID="insights">
            {insights.map((t) => (
              <View key={t} style={{ flexDirection: 'row', gap: 8 }}>
                <Icon name="analytics-outline" size={15} color={colors.accent} style={{ marginTop: 2 }} />
                <T v="small" color={colors.text} style={{ flex: 1, fontSize: 13 }}>
                  {t}
                </T>
              </View>
            ))}
          </View>
        ) : null}

        {tips.length ? (
          <View style={{ gap: 8 }}>
            <View style={styles.sectionHead}>
              <Icon name="sparkles" size={14} color={colors.accent} />
              <T v="caption" color={colors.accent} style={{ flex: 1 }}>
                Тренер советует
              </T>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/coach')}>
                <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
                  Спросить
                </T>
              </Pressable>
            </View>
            {tips.slice(0, 3).map((i) => (
              <TipCard
                key={i.key ?? i.text}
                tip={i}
                onDismiss={() => reactTo(i, 'dismissed')}
                onOpenProposal={() => i.proposal && setProposal(i.proposal)}
                onApply={() => {
                  if (!i.action) return;
                  const r = applyCoachAction('', i.action);
                  toast(r.message, r.ok ? 'checkmark-circle' : 'alert-circle');
                  if (r.ok) reactTo(i, 'accepted');
                }}
              />
            ))}
          </View>
        ) : null}

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
 * Главное действие дня: одна крупная карточка отвечает на «что сегодня делать» —
 * тренировка, готовность, цель питания, вес и большая кнопка.
 */
function Hero({
  tw,
  active,
  debrief,
  readiness,
  onWhy,
  target,
  trend,
  onAddFood,
}: {
  tw: ReturnType<typeof useTodayWorkout>;
  active: WorkoutSession | null;
  debrief: ReturnType<typeof workoutDebrief> | null;
  readiness: ReturnType<typeof useReadiness>;
  onWhy: () => void;
  target: NutritionTarget | null;
  trend: { w: number; week: number | null } | null;
  onAddFood: () => void;
}) {
  const readyCol = !readiness ? colors.textDim : readiness.band === 'go' ? colors.accent : readiness.band === 'reduce' ? colors.warning : colors.danger;
  const facts = (
    <View style={{ gap: 6 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={readiness ? `Готовность ${readinessLabel(readiness).toLowerCase()}, почему` : 'Пройти чек-ин'} onPress={readiness ? onWhy : () => router.push('/checkin')} style={styles.heroRow}>
        <Icon name="pulse" size={16} color={readyCol} />
        <T v="body" style={{ fontSize: 15, flex: 1 }} color={colors.text}>
          {readiness ? (
            <>
              Готовность <T v="body" style={{ fontWeight: '800', fontSize: 15 }} color={readyCol}>{readinessLabel(readiness).toLowerCase()}</T>
              {readiness.band !== 'go' ? ` · ${BAND_META[readiness.band].short.toLowerCase()}` : ''}
            </>
          ) : (
            'Готовность: пройди чек-ин (4 вопроса)'
          )}
        </T>
        <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
          {readiness ? 'почему?' : 'чек-ин'}
        </T>
      </Pressable>
      {target ? (
        <View style={styles.heroRow}>
          <Icon name="restaurant-outline" size={16} color={colors.textDim} />
          <T v="body" style={{ fontSize: 15 }} color={colors.text}>
            Цель питания {fmtNum(target.kcal)} ккал / {target.protein} г белка
          </T>
        </View>
      ) : null}
      {trend ? (
        <Pressable accessibilityRole="button" onPress={() => router.push('/weight')} style={styles.heroRow}>
          <Icon name="scale-outline" size={16} color={colors.textDim} />
          <T v="body" style={{ fontSize: 15 }} color={colors.text}>
            Вес {fmtWeight(Math.round(trend.w * 10) / 10)} кг{trend.week !== null ? ` · ${trend.week >= 0 ? '+' : '−'}${Math.abs(trend.week).toFixed(1).replace('.', ',')} кг за неделю` : ''}
          </T>
        </Pressable>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => router.push('/weight')} style={styles.heroRow}>
          <Icon name="scale-outline" size={16} color={colors.textDim} />
          <T v="body" style={{ fontSize: 15 }} color={colors.textDim}>
            Вес не записан — взвесься утром
          </T>
        </Pressable>
      )}
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
      <View style={styles.hero}>
        <T v="caption" color={colors.accent}>
          Тренировка выполнена
        </T>
        <T v="display" style={{ fontSize: 28 }} numberOfLines={1}>
          {s.name} ✓
        </T>
        {debrief ? (
          <T v="small">
            {debrief.minutes} мин · {debrief.sets} подходов{debrief.prs.length ? ` · рекордов: ${debrief.prs.length}` : ''}
            {tw.nextWorkout ? ` · следующая: ${tw.nextWorkout.template.name}, ${formatDayLong(tw.nextWorkout.date)}` : ''}
          </T>
        ) : null}
        {facts}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <Button title="Добавить еду" icon="add" size="lg" onPress={onAddFood} style={{ flex: 1 }} />
          <Button title="Итоги" variant="secondary" size="lg" onPress={() => router.push({ pathname: '/workout/[id]', params: { id: s.id } })} />
        </View>
      </View>
    );
  }
  if (tw.kind === 'workout' && tw.template) {
    return (
      <View style={[styles.hero, { borderColor: colors.accentLine }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T v="caption" color={colors.accent} style={{ flex: 1 }}>
            Сегодня
          </T>
          {tw.mode !== 'normal' ? <Badge text={MODE_LABEL[tw.mode]} /> : null}
        </View>
        <T v="display" style={{ fontSize: 30, lineHeight: 34 }} numberOfLines={2}>
          {tw.template.name}
        </T>
        <T v="body" color={colors.textDim} numberOfLines={1}>
          {tw.template.focus} · ~{tw.estMinutes} мин · {tw.totalSets} подходов
        </T>
        {tw.reason && tw.mode !== 'normal' ? (
          <T v="small" style={{ fontSize: 12 }} color={colors.warning}>
            {tw.reason}
          </T>
        ) : null}
        <View style={styles.heroDivider} />
        {facts}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Button title="Начать тренировку" icon="play" size="lg" onPress={() => startTodayPlanned()} style={{ flex: 1 }} />
          <Button title="Состав" variant="secondary" size="lg" onPress={() => router.push({ pathname: '/workout/preview', params: { templateId: tw.template!.id } })} />
        </View>
      </View>
    );
  }
  if (tw.kind === 'rest') {
    return (
      <View style={styles.hero}>
        <T v="caption" color={colors.accent}>
          Сегодня
        </T>
        <T v="display" style={{ fontSize: 28 }}>
          День отдыха
        </T>
        <T v="small">
          {tw.reason ?? 'Восстановление — часть плана: белок, шаги и сон'}
          {tw.nextWorkout ? ` · следующая: ${tw.nextWorkout.template.name}, ${formatDayLong(tw.nextWorkout.date)}` : ''}
        </T>
        <View style={styles.heroDivider} />
        {facts}
        <Button title="Добавить еду" icon="add" size="lg" onPress={onAddFood} style={{ marginTop: 8 }} />
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

function TipCard({ tip, onDismiss, onApply, onOpenProposal }: { tip: LocalInsight; onDismiss: () => void; onApply: () => void; onOpenProposal: () => void }) {
  const icon: IconName = tip.kind === 'health' || tip.kind === 'safety' ? 'medkit-outline' : tip.kind === 'recovery' ? 'battery-half' : tip.kind === 'progression' ? 'trending-up' : tip.kind === 'nutrition' ? 'restaurant-outline' : tip.kind === 'plan' ? 'git-branch-outline' : tip.kind === 'weight' ? 'scale-outline' : 'bulb-outline';
  const tone = tip.kind === 'safety' || tip.kind === 'health' ? colors.warning : colors.accent;
  return (
    <View style={styles.tip}>
      <View style={[styles.tipIcon, { backgroundColor: tone === colors.warning ? colors.warningDim : colors.accentDim }]}>
        <Icon name={icon} size={16} color={tone} />
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        <T v="body" style={{ fontSize: 14, lineHeight: 19 }} color={colors.text}>
          {tip.text}
        </T>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          {tip.proposal ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onOpenProposal}>
              <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
                Подробнее
              </T>
            </Pressable>
          ) : null}
          {tip.action ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onApply}>
              <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
                {tip.action.label}
              </T>
            </Pressable>
          ) : null}
          {tip.key ? (
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onDismiss}>
              <T v="small" style={{ fontWeight: '700' }}>
                {tip.proposal || tip.action ? 'Не сейчас' : 'Понятно'}
              </T>
            </Pressable>
          ) : null}
        </View>
      </View>
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

function Card({ title, right, onPress, children, accent }: { title: string; right?: React.ReactNode; onPress?: () => void; children: React.ReactNode; accent?: boolean }) {
  // Нажимается только заголовок: внутри карточки могут быть свои кнопки (вложенные кнопки недопустимы)
  return (
    <View style={[styles.card, accent && { borderColor: colors.accentLine }]}>
      <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} disabled={!onPress} hitSlop={6} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 22 }}>
        <T v="caption" style={{ flex: 1 }}>
          {title}
        </T>
        {right}
        {onPress && !right ? <Icon name="chevron-forward" size={16} color={colors.muted} /> : null}
      </Pressable>
      {children}
    </View>
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

/** Вечером: итог дня одним взглядом и вывод FORM */
function DaySummary({ workout, kcal, protein, steps, workoutDone, restDay }: { workout: string; kcal: [number, number] | null; protein: [number, number] | null; steps?: number; workoutDone: boolean; restDay: boolean }) {
  const kOk = kcal ? Math.abs(kcal[0] - kcal[1]) / kcal[1] <= 0.1 : false;
  const pOk = protein ? protein[0] >= protein[1] * 0.9 : false;
  const verdict =
    (workoutDone || restDay) && kOk && pOk
      ? 'Хороший день. Завтра план можно оставить без изменений.'
      : protein && !pOk
        ? `Белка не хватило ~${Math.round(protein[1] - protein[0])} г — добери перед сном (творог, йогурт) или завтра с утра.`
        : kcal && kcal[0] < kcal[1] * 0.85
          ? `Недобор ~${Math.round(kcal[1] - kcal[0])} ккал — для твоей цели лучше закрыть его.`
          : kcal && kcal[0] > kcal[1] * 1.1
            ? 'Калорий больше цели — завтра без компенсаций, просто по плану.'
            : 'День в рамках плана.';
  return (
    <Card title="Итог дня" accent>
      <View style={{ gap: 8 }}>
        <Row label="Тренировка" value={workout} ok={workoutDone || restDay} />
        {kcal ? <Row label="Ккал" value={`${fmtNum(kcal[0])} / ${fmtNum(kcal[1])}`} ok={kOk} /> : null}
        {protein ? <Row label="Белок" value={`${Math.round(protein[0])} / ${protein[1]} г`} ok={pOk} /> : null}
        {steps ? <Row label="Шаги" value={steps.toLocaleString('ru-RU')} /> : null}
      </View>
      <T v="body" color={colors.text} style={{ marginTop: 4 }}>
        <T v="body" color={colors.accent} style={{ fontWeight: '800' }}>
          {BRAND}:{' '}
        </T>
        {verdict}
      </T>
    </Card>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <T v="body" style={{ flex: 1 }} color={colors.textDim}>
        {label}
      </T>
      <T v="body" style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>
        {value}
      </T>
      {ok !== undefined ? <Icon name={ok ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={ok ? colors.accent : colors.muted} style={{ marginLeft: 6 }} /> : null}
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
  quick: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  measure: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  insights: { gap: 8, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine },
  hero: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1.5, borderColor: colors.border, padding: space.lg, gap: 6 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 24 },
  heroDivider: { height: 1, backgroundColor: colors.border, marginVertical: 6 },
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
