import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, T, type IconName } from '@/components/ui';
import { Bar, Ring } from '@/components/charts';
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
import { useNutrition, mealForHour } from '@/stores/nutrition';
import { useHealth } from '@/stores/health';
import { useJournal } from '@/stores/journal';
import { useDayNutrition, useReadiness, useTodayWorkout } from '@/hooks/useToday';
import { useDayKey } from '@/hooks/useDayKey';
import { GOAL_LABEL } from '@/features/nutrition/targets';
import { MODE_LABEL } from '@/features/training/today';
import { resumeActive, startTodayPlanned } from '@/features/training/actions';
import { refreshDailyInsight } from '@/features/coach/service';
import { weeklyRate, weightTrend } from '@/features/progress/weightTrend';
import { buildJournal, dayMode, type JournalKind } from '@/features/journal/build';
import { workoutDebrief } from '@/features/training/debrief';
import { healthContext } from '@/features/health/model';
import { AddFoodSheet } from '@/features/nutrition/AddFoodSheet';
import { formatDayLong, formatHours, greeting, weekdayIndex } from '@/utils/date';
import { fmtNum, fmtWeight } from '@/utils/format';
import { haptic } from '@/services/haptics';

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
  const insight = useCoach((s) => s.insight);
  const checkins = useCheckins((s) => s.byDate);
  const entries = useNutrition((s) => s.entries);
  const healthDays = useHealth((s) => s.days);
  const healthSync = useHealth((s) => s.lastSyncAt);
  const notes = useJournal((s) => s.notes);
  const readiness = useReadiness();
  const tw = useTodayWorkout();
  const nut = useDayNutrition();
  const [addFood, setAddFood] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  const trend = useMemo(() => {
    const t = weightTrend(weights);
    if (!t.length) return null;
    const r = weeklyRate(t, 21);
    return { w: t[t.length - 1].trend, rate: r?.kgPerWeek };
  }, [weights]);
  const health = useMemo(() => healthContext(healthDays, d), [healthDays, d]);

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

  const readinessCard = <ReadinessCard key="r" readiness={readiness} checkin={checkins[d]} health={health} compact={mode === 'after_workout' || mode === 'evening'} />;
  const workoutCard = <TodayCard key="w" tw={tw} activeName={active?.name} activeSets={active ? active.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0) : 0} debrief={debrief} />;
  const nutritionCard = (
    <Card key="n" title="Питание" onPress={() => router.push('/nutrition')}>
      {target ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <T v="num" style={{ fontSize: 22 }}>
              {fmtNum(nut.eaten.kcal)}
            </T>
            <T v="small">/ {fmtNum(target.kcal)} ккал</T>
            <T v="small" style={{ marginLeft: 'auto' }}>
              осталось {fmtNum(Math.max(0, target.kcal - nut.eaten.kcal))}
            </T>
          </View>
          <Bar progress={nut.eaten.kcal / target.kcal} height={6} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
            <T v="small" style={{ width: 48 }}>
              Белок
            </T>
            <Bar progress={nut.eaten.protein / target.protein} color={colors.protein} height={5} style={{ flex: 1 }} />
            <T v="small" color={colors.text} style={{ fontWeight: '700', minWidth: 64, textAlign: 'right' }}>
              {Math.round(nut.eaten.protein)} / {target.protein}
            </T>
          </View>
        </>
      ) : null}
      <Button title="Добавить еду" icon="add" size="sm" variant="secondary" onPress={() => setAddFood(true)} style={{ marginTop: 2 }} />
    </Card>
  );
  const summaryCard =
    mode === 'evening' ? (
      <DaySummary key="s" workout={doneToday ? `${doneToday.name} ✓` : tw.kind === 'rest' ? 'День отдыха' : tw.kind === 'workout' ? 'Не выполнена' : '—'} kcal={target ? [nut.eaten.kcal, target.kcal] : null} protein={target ? [nut.eaten.protein, target.protein] : null} steps={health?.steps} workoutDone={!!doneToday} restDay={tw.kind === 'rest'} />
    ) : null;

  // Приоритет карточек по времени суток
  const order =
    mode === 'evening' ? [summaryCard, workoutCard, nutritionCard, readinessCard] : mode === 'after_workout' ? [workoutCard, nutritionCard, readinessCard] : [readinessCard, workoutCard, nutritionCard];

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: space.lg, paddingBottom: insets.bottom + TAB_BAR_HEIGHT + space.xl, gap: 10 }} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <T v="caption" color={colors.accent} style={{ letterSpacing: 2 }}>
              FORM
            </T>
            <T v="h2" numberOfLines={1} style={{ marginTop: 1 }}>
              {mode === 'evening' ? 'Итог дня' : `${greeting()}, ${firstName}`}
            </T>
            <T v="small">
              {WEEKDAY_FULL[weekdayIndex(d)]}, {formatDayLong(d)}
            </T>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Тренер FORM — совет дня и чат" onPress={() => router.push(insight && insight.date === d ? { pathname: '/coach', params: { insight: '1' } } : '/coach')} style={styles.coachBtn} hitSlop={4}>
            <Icon name="sparkles" size={20} color={colors.accent} />
            {insight && insight.date === d ? <View style={styles.coachDot} /> : null}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Профиль" onPress={() => router.push('/profile')} style={styles.avatar} hitSlop={4}>
            <T v="h3" color={colors.onAccent}>
              {firstName.charAt(0).toUpperCase()}
            </T>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/plan')} style={styles.goal}>
            <View style={styles.goalDot} />
            <T v="caption" color={colors.text} numberOfLines={1} style={{ flexShrink: 1, letterSpacing: 1.2 }}>
              {GOAL_LABEL[profile.goal]}
            </T>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Вес" onPress={() => router.push('/weight')} style={styles.pill}>
            <Icon name="scale-outline" size={14} color={colors.textDim} />
            <T v="small" color={colors.text} style={{ fontWeight: '700' }}>
              {trend ? `${fmtWeight(Math.round(trend.w * 10) / 10)}` : 'Вес'}
            </T>
            {trend?.rate !== undefined ? (
              <T v="small" style={{ fontSize: 11 }}>
                {trend.rate >= 0 ? '+' : ''}
                {trend.rate.toFixed(2).replace('.', ',')}
              </T>
            ) : null}
          </Pressable>
        </View>

        {order.filter(Boolean)}

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
              FORM будет записывать сюда день сам: чек-ин, вес, еду, тренировку, рекорды и изменения плана.
            </T>
          ) : null}
          {journal.map((e, i) => (
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
                {i < journal.length - 1 ? <View style={styles.jLine} /> : null}
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
      <NoteSheet visible={noteOpen} onClose={() => setNoteOpen(false)} date={d} />
    </View>
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

function ReadinessCard({ readiness, checkin, health, compact }: { readiness: ReturnType<typeof useReadiness>; checkin?: { sleepHours: number; energy: number; stress: number }; health?: ReturnType<typeof healthContext>; compact?: boolean }) {
  const [why, setWhy] = useState(false);
  if (!readiness) {
    return (
      <Pressable accessibilityRole="button" onPress={() => router.push('/checkin')} style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: space.md }]}>
        <Ring size={52} stroke={5} progress={0}>
          <Icon name="sunny-outline" size={22} color={colors.accent} />
        </Ring>
        <View style={{ flex: 1 }}>
          <T v="caption">Готовность</T>
          <T v="h3" style={{ marginTop: 2 }}>
            Как ты сегодня? 4 вопроса — и план подстроится
          </T>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    );
  }
  const col = readiness.band === 'go' ? colors.accent : readiness.band === 'reduce' ? colors.warning : colors.danger;
  const sleep = checkin?.sleepHours ?? health?.sleepHours;
  return (
    <View style={[styles.card, { gap: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Ring size={compact ? 58 : 76} stroke={compact ? 6 : 7} progress={readiness.score / 100} color={col}>
          <T v="num" style={{ fontSize: compact ? 20 : 26 }}>
            {readiness.score}
          </T>
        </Ring>
        <View style={{ flex: 1 }}>
          <T v="caption">Готовность{readiness.source === 'health' ? ' · Apple Health' : ''}</T>
          <T v="h3" style={{ marginTop: 2 }}>
            {readiness.headline}
          </T>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
            {sleep ? <Mini label="Сон" value={formatHours(sleep)} /> : null}
            {checkin ? <Mini label="Энергия" value={`${checkin.energy}/5`} /> : null}
            {checkin ? <Mini label="Стресс" value={`${checkin.stress}/5`} /> : null}
            {health?.hrvDeltaPct !== undefined ? <Mini label="HRV" value={`${health.hrvDeltaPct >= 0 ? '+' : ''}${health.hrvDeltaPct}%`} /> : null}
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setWhy(!why)}>
          <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
            {why ? 'Скрыть' : `Почему ${readiness.score}?`}
          </T>
        </Pressable>
        {readiness.source === 'health' || !checkin ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/checkin')}>
            <T v="small" style={{ fontWeight: '700' }}>
              Чек-ин для точности
            </T>
          </Pressable>
        ) : null}
      </View>
      {why ? (
        <View style={{ gap: 4 }}>
          {readiness.factors.map((f) => (
            <View key={f.label} style={{ flexDirection: 'row', gap: 8 }}>
              <T v="small" style={{ flex: 1 }} color={colors.text}>
                {f.label}: {f.detail}
              </T>
              <T v="small" color={f.impact < 0 ? colors.warning : colors.accent} style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                {f.impact > 0 ? '+' : ''}
                {f.impact}
              </T>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <T v="small" style={{ fontSize: 12 }}>
      {label} <T v="small" color={colors.text} style={{ fontWeight: '800', fontSize: 12 }}>{value}</T>
    </T>
  );
}

function TodayCard({ tw, activeName, activeSets, debrief }: { tw: ReturnType<typeof useTodayWorkout>; activeName?: string; activeSets: number; debrief: ReturnType<typeof workoutDebrief> | null }) {
  if (activeName) {
    return (
      <Card title="Сегодня · идёт тренировка" accent>
        <T v="display" style={{ fontSize: 26 }} numberOfLines={1}>
          {activeName}
        </T>
        <T v="small">Выполнено подходов: {activeSets} · всё сохранено</T>
        <Button title="Продолжить тренировку" icon="play" size="md" onPress={resumeActive} />
      </Card>
    );
  }
  if (tw.kind === 'done' && tw.completedSession) {
    const s = tw.completedSession;
    return (
      <Card title="Тренировка выполнена" accent onPress={() => router.push({ pathname: '/workout/[id]', params: { id: s.id } })}>
        <T v="display" style={{ fontSize: 28 }} numberOfLines={1}>
          {s.name} ✓
        </T>
        {debrief ? (
          <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
            <Mini label="Время" value={`${debrief.minutes} мин`} />
            <Mini label="Подходов" value={`${debrief.sets}`} />
            {debrief.volumeDeltaPct !== null ? <Mini label="Объём" value={`${debrief.volumeDeltaPct >= 0 ? '+' : ''}${debrief.volumeDeltaPct}%`} /> : null}
            {debrief.prs.length ? <Mini label="Рекорды" value={`${debrief.prs.length}`} /> : null}
          </View>
        ) : null}
        <T v="small">{tw.nextWorkout ? `Следующая: ${tw.nextWorkout.template.name}, ${formatDayLong(tw.nextWorkout.date)}` : 'Восстанавливайся'}</T>
      </Card>
    );
  }
  if (tw.kind === 'workout' && tw.template) {
    return (
      <Card title="Сегодня" accent right={tw.mode !== 'normal' ? <Badge text={MODE_LABEL[tw.mode]} /> : undefined}>
        <T v="display" style={{ fontSize: 26 }} numberOfLines={1}>
          {tw.template.name}
        </T>
        <T v="body" color={colors.textDim} numberOfLines={1}>
          {tw.template.focus}
        </T>
        <T v="small">
          ~{tw.estMinutes} мин · {tw.template.exercises.length} упр · {tw.totalSets} подходов
        </T>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
          <Button title="Начать тренировку" icon="play" size="md" onPress={() => startTodayPlanned()} style={{ flex: 1 }} />
          <Button title="Состав" variant="outline" size="md" onPress={() => router.push({ pathname: '/workout/preview', params: { templateId: tw.template!.id } })} />
        </View>
      </Card>
    );
  }
  if (tw.kind === 'rest') {
    return (
      <Card title="Сегодня">
        <T v="h2">Отдых</T>
        <T v="small">{tw.reason ?? 'Восстановление — часть плана'}{tw.nextWorkout ? ` · следующая: ${tw.nextWorkout.template.name}, ${formatDayLong(tw.nextWorkout.date)}` : ''}</T>
      </Card>
    );
  }
  return (
    <Card title="Сегодня">
      <T v="body">Плана пока нет — заполни профиль, и FORM его составит.</T>
      <Button title="Открыть профиль" variant="secondary" onPress={() => router.push('/profile')} />
    </Card>
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
          FORM:{' '}
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
    <Sheet visible={visible} onClose={onClose} title="Заметка" subtitle="Видна тебе и тренеру FORM">
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
