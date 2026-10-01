import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Exercise, WorkoutSession } from '@/types';
import { colors, radius, space } from '@/theme';
import { TAB_BAR_HEIGHT } from '@/components/Screen';
import { Banner, Button, Card, EmptyState, Icon, Segmented, SectionTitle, T } from '@/components/ui';
import { MiniBars } from '@/components/charts';
import { usePlan } from '@/stores/plan';
import { useWorkouts } from '@/stores/workouts';
import { useUi } from '@/stores/ui';
import { useTodayWorkout } from '@/hooks/useToday';
import { getExercise } from '@/data/exercises';
import { MODE_LABEL } from '@/features/training/today';
import { resumeActive, startTodayPlanned } from '@/features/training/actions';
import { sessionVolume } from '@/features/training/analytics';
import { planVolume } from '@/features/training/planGenerator';
import { doneFineVolume } from '@/features/training/engine/volume';
import { VM_LABEL, VOLUME_MUSCLES } from '@/features/training/engine/muscles';
import { ExerciseList } from '@/features/exercises/ExerciseList';
import { WeekStrip } from '@/features/profile/PlanSummary';
import { checkDeload, deloadDates, DELOAD_FACTOR, DELOAD_RIR, isDeloadActive } from '@/features/training/deload';
import { applyDeload, cancelDeload } from '@/features/training/deloadActions';
import { useCheckins } from '@/stores/checkins';
import { confirm, toast } from '@/components/Dialog';
import { addDays, formatDayShort, relativeDay, startOfWeek, today, weekdayIndex as weekdayIndexOf, WEEKDAYS_SHORT } from '@/utils/date';

type Seg = 'today' | 'plan' | 'history' | 'library';

export default function Training() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ seg?: Seg }>();
  const [seg, setSeg] = useState<Seg>(params.seg ?? 'today');
  // Переход из «+» → Библиотека: синхронизируем вкладку при новом параметре (без эффекта)
  const [lastParam, setLastParam] = useState(params.seg);
  if (params.seg !== lastParam) {
    setLastParam(params.seg);
    if (params.seg) setSeg(params.seg);
  }
  const bottom = insets.bottom + TAB_BAR_HEIGHT + space.lg;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.sm }}>
      <View style={{ paddingHorizontal: space.lg, gap: space.md, marginBottom: space.md }}>
        <T v="h1">Тренировки</T>
        <Segmented
          items={[
            { key: 'today', label: 'Сегодня' },
            { key: 'plan', label: 'План' },
            { key: 'history', label: 'История' },
            { key: 'library', label: 'Библиотека' },
          ]}
          value={seg}
          onChange={setSeg}
        />
      </View>
      <View style={{ flex: 1, paddingHorizontal: space.lg }}>
        {seg === 'today' ? <TodayTab bottom={bottom} /> : null}
        {seg === 'plan' ? <PlanTab bottom={bottom} /> : null}
        {seg === 'history' ? <HistoryTab bottom={bottom} /> : null}
        {seg === 'library' ? <ExerciseList onSelect={(e: Exercise) => router.push({ pathname: '/exercise/[id]', params: { id: e.id } })} contentPaddingBottom={bottom} /> : null}
      </View>
    </View>
  );
}

function TodayTab({ bottom }: { bottom: number }) {
  const tw = useTodayWorkout();
  const active = useWorkouts((s) => s.active);
  const sessions = useWorkouts((s) => s.sessions);
  const plan = usePlan((s) => s.plan);
  const openHub = useUi((s) => s.openHub);
  const d = today();
  const customs = useWorkouts((s) => s.customExercises);
  // Прямые подходы по детальным группам: сделано с понедельника / запланировано на неделю
  const week = useMemo(() => doneFineVolume(sessions, startOfWeek(d), d, customs), [sessions, d, customs]);
  const planned = useMemo(() => (plan ? planVolume(plan, customs) : null), [plan, customs]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(d), i)), [d]);
  const doneDays = new Set(sessions.filter((s) => s.status === 'completed').map((s) => s.date));
  const checkins = useCheckins((s) => s.byDate);
  const overrides = usePlan((s) => s.overrides);
  const adjustments = usePlan((s) => s.adjustments);
  const deload = useMemo(() => checkDeload({ plan, sessions, checkins, adjustments, overrides }), [plan, sessions, checkins, adjustments, overrides]);
  const deloadActive = isDeloadActive(overrides);
  const [deloadPlanOpen, setDeloadPlanOpen] = useState(false);

  return (
    <FlatList
      data={[]}
      renderItem={null}
      contentContainerStyle={{ paddingBottom: bottom }}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={{ gap: space.md }}>
          {active ? <Banner tone="accent" icon="play-circle" text={`Незавершённая тренировка: ${active.name}`} action="Продолжить" onAction={resumeActive} /> : null}
          {deloadActive ? (
            <Banner tone="warning" icon="battery-charging" text="Идёт разгрузочная неделя: меньше подходов, больше запаса. Это и есть прогресс — сила вырастет после неё." action="Отменить" onAction={() => confirm('Отменить разгрузку?', 'Тренировки вернутся к обычному объёму.', 'Отменить разгрузку', () => { cancelDeload(); toast('Разгрузка отменена'); })} />
          ) : deload.suggest ? (
            <Card tone="warning" style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="battery-half" size={20} color={colors.warning} />
                <T v="h3">Пора разгрузиться</T>
              </View>
              {deload.reasons.map((r) => (
                <T key={r} v="small">
                  • {r}
                </T>
              ))}
              <T v="small" style={{ fontSize: 12 }}>
                Неделя с −40% подходов и запасом 3–4 повтора снимает накопленную усталость — после неё веса обычно снова растут.
              </T>
              {deloadPlanOpen && plan ? (
                <View style={{ gap: 4, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface2 }}>
                  {deloadDates(plan).map((dd) => {
                    const t = plan.templates.find((x) => x.id === plan.schedule[weekdayIndexOf(dd)]);
                    const sets = t ? t.exercises.reduce((a, e) => a + Math.max(1, Math.round(e.sets * DELOAD_FACTOR)), 0) : 0;
                    const was = t ? t.exercises.reduce((a, e) => a + e.sets, 0) : 0;
                    return (
                      <T key={dd} v="small" color={colors.text}>
                        {formatDayShort(dd)} · {t?.name ?? '—'}: {was} → {sets} подходов, RIR +{DELOAD_RIR}, веса без повышения
                      </T>
                    );
                  })}
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title={deloadPlanOpen ? 'Скрыть' : 'Посмотреть план'} size="sm" variant="secondary" onPress={() => setDeloadPlanOpen(!deloadPlanOpen)} style={{ flex: 1 }} />
                <Button title="Применить" icon="battery-charging" size="sm" onPress={() => { const n = applyDeload(); toast(`Разгрузка: облегчено тренировок — ${n}`); }} style={{ flex: 1 }} />
              </View>
            </Card>
          ) : null}
          <Card tone="accent">
            <T v="caption">Сегодня</T>
            {tw.kind === 'workout' && tw.template ? (
              <>
                <T v="display" style={{ marginTop: 4 }}>
                  {tw.template.name}
                </T>
                <T v="bodyDim">{tw.template.focus}</T>
                <View style={styles.metaRow}>
                  <Meta icon="time-outline" text={`~${tw.estMinutes} мин`} />
                  <Meta icon="list-outline" text={`${tw.template.exercises.length} упр`} />
                  <Meta icon="layers-outline" text={`${tw.totalSets} подх.`} />
                  <Meta icon="speedometer-outline" text={MODE_LABEL[tw.mode]} warn={tw.mode !== 'normal'} />
                </View>
                {tw.reason ? (
                  <T v="small" style={{ marginTop: 6 }}>
                    {tw.reason}
                  </T>
                ) : null}
                <View style={{ gap: 6, marginTop: space.md }}>
                  {tw.template.exercises.map((pe, i) => (
                    <Pressable key={i} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: pe.exerciseId } })} style={styles.exRow}>
                      <T v="small" style={{ width: 18, fontWeight: '800' }}>
                        {i + 1}
                      </T>
                      <T v="body" numberOfLines={1} style={{ flex: 1, fontSize: 15 }}>
                        {getExercise(pe.exerciseId)?.name}
                      </T>
                      <T v="small">
                        {Math.max(1, Math.round(pe.sets * tw.volumeFactor))}×{pe.repMin}–{pe.repMax}
                      </T>
                    </Pressable>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: space.md }}>
                  <Button title="Начать" icon="play" size="lg" style={{ flex: 1 }} onPress={() => startTodayPlanned()} />
                  <Button title="Детали" variant="outline" size="lg" onPress={() => router.push({ pathname: '/workout/preview', params: { templateId: tw.template!.id } })} />
                </View>
              </>
            ) : tw.kind === 'done' ? (
              <>
                <T v="h1" style={{ marginTop: 4 }}>
                  Выполнено ✓
                </T>
                <T v="bodyDim">{tw.completedSession?.name}</T>
                <Button title="Смотреть итоги" variant="secondary" style={{ marginTop: space.md }} onPress={() => tw.completedSession && router.push({ pathname: '/workout/[id]', params: { id: tw.completedSession.id } })} />
              </>
            ) : (
              <>
                <T v="h1" style={{ marginTop: 4 }}>
                  Отдых
                </T>
                <T v="bodyDim">{tw.reason ?? (tw.nextWorkout ? `Следующая — ${tw.nextWorkout.template.name}, ${formatDayShort(tw.nextWorkout.date)}` : 'Восстановление')}</T>
                <Button title="Тренировка вне плана" icon="add" variant="secondary" style={{ marginTop: space.md }} onPress={openHub} />
              </>
            )}
          </Card>

          <SectionTitle title="Эта неделя" style={{ marginTop: space.sm }} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {weekDays.map((wd, i) => {
              const planned = plan?.schedule[i];
              const done = doneDays.has(wd);
              const isToday = wd === d;
              return (
                <View key={wd} style={[styles.day, planned && { borderColor: colors.borderStrong }, isToday && { borderColor: colors.accent }]}>
                  <T v="small" style={{ fontSize: 11 }} color={isToday ? colors.accent : colors.textDim}>
                    {WEEKDAYS_SHORT[i]}
                  </T>
                  <View style={[styles.dayDot, done ? { backgroundColor: colors.accent } : planned ? { backgroundColor: colors.surface3 } : null]}>
                    {done ? <Icon name="checkmark" size={12} color={colors.onAccent} /> : null}
                  </View>
                </View>
              );
            })}
          </View>

          <SectionTitle title="Объём за неделю · сделано / план" />
          <Card style={{ gap: 10 }}>
            {VOLUME_MUSCLES.filter((m) => (planned?.[m] ?? 0) > 0).map((g) => {
              const done = Math.round(week[g] ?? 0);
              const target = Math.round(planned?.[g] ?? 0);
              const p = target ? done / target : 0;
              return (
                <View key={g} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <T v="small" style={{ width: 118 }} numberOfLines={1}>
                    {VM_LABEL[g]}
                  </T>
                  <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surface3, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.min(100, p * 100)}%`, height: 6, backgroundColor: p >= 0.9 ? colors.accent : 'rgba(200,245,60,0.5)' }} />
                  </View>
                  <T v="small" style={{ width: 54, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                    {done}/{target}
                  </T>
                </View>
              );
            })}
          </Card>
        </View>
      }
    />
  );
}

function Meta({ icon, text, warn }: { icon: React.ComponentProps<typeof Icon>['name']; text: string; warn?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Icon name={icon} size={14} color={warn ? colors.warning : colors.textDim} />
      <T v="small" color={warn ? colors.warning : colors.textDim}>
        {text}
      </T>
    </View>
  );
}

function PlanTab({ bottom }: { bottom: number }) {
  const plan = usePlan((s) => s.plan);
  if (!plan) return <EmptyState icon="calendar-outline" title="Плана пока нет" text="Заполни профиль — FORM создаст план автоматически." action="Профиль" onAction={() => router.push('/profile')} />;
  return (
    <FlatList
      data={plan.templates}
      keyExtractor={(t) => t.id}
      contentContainerStyle={{ paddingBottom: bottom, gap: 10 }}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={{ gap: space.md, marginBottom: space.sm }}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <T v="h2">{plan.splitLabel}</T>
                <T v="small">
                  {plan.daysPerWeek}× в неделю · {plan.sessionMinutes[0]}–{plan.sessionMinutes[1]} мин · {plan.weeklySetsTarget[0]}–{plan.weeklySetsTarget[1]} подх./группу
                </T>
              </View>
              <Button title="Детали" size="sm" variant="secondary" onPress={() => router.push('/plan')} />
            </View>
            <View style={{ marginTop: space.md }}>
              <WeekStrip plan={plan} />
            </View>
          </Card>
          <T v="caption">Тренировки плана</T>
        </View>
      }
      renderItem={({ item: t }) => (
        <Card onPress={() => router.push({ pathname: '/workout/preview', params: { templateId: t.id } })}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <T v="h3">{t.name}</T>
              <T v="small">
                {t.focus} · ~{t.estMinutes} мин
              </T>
            </View>
            <Pressable hitSlop={8} onPress={() => router.push({ pathname: '/workout/builder', params: { templateId: t.id } })} accessibilityLabel={`Изменить ${t.name}`} style={{ padding: 6 }}>
              <Icon name="create-outline" size={20} color={colors.accent} />
            </Pressable>
          </View>
          <View style={{ gap: 4, marginTop: 10 }}>
            {t.exercises.map((pe, i) => (
              <T key={i} v="small" numberOfLines={1}>
                {getExercise(pe.exerciseId)?.name} · {pe.sets}×{pe.repMin}–{pe.repMax}
              </T>
            ))}
          </View>
        </Card>
      )}
    />
  );
}

function HistoryTab({ bottom }: { bottom: number }) {
  const sessions = useWorkouts((s) => s.sessions);
  const data = useMemo(() => sessions.filter((s) => s.status === 'completed').sort((a, b) => b.startedAt - a.startedAt), [sessions]);
  const weekly = useMemo(() => {
    const d = today();
    return Array.from({ length: 8 }, (_, i) => {
      const from = addDays(startOfWeek(d), -7 * (7 - i));
      const to = addDays(from, 6);
      return data.filter((s) => s.date >= from && s.date <= to).length;
    });
  }, [data]);
  const renderItem = useCallback(({ item }: { item: WorkoutSession }) => <HistoryRow s={item} />, []);
  if (!data.length) return <EmptyState icon="time-outline" title="История пуста" text="Заверши первую тренировку — здесь появятся результаты, веса и рекорды." />;
  return (
    <FlatList
      data={data}
      keyExtractor={(s) => s.id}
      renderItem={renderItem}
      initialNumToRender={12}
      contentContainerStyle={{ paddingBottom: bottom, gap: 8 }}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <Card style={{ marginBottom: 8 }}>
          <T v="caption">Тренировок в неделю · 8 недель</T>
          <View style={{ marginTop: 10 }}>
            <MiniBars values={weekly} height={44} />
          </View>
          <T v="small" style={{ marginTop: 8 }}>
            Всего: {data.length}
          </T>
        </Card>
      }
    />
  );
}

const HistoryRow = React.memo(function HistoryRow({ s }: { s: WorkoutSession }) {
  const v = sessionVolume(s);
  return (
    <Card onPress={() => router.push({ pathname: '/workout/[id]', params: { id: s.id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      <View style={{ flex: 1 }}>
        <T v="body" style={{ fontWeight: '700' }} numberOfLines={1}>
          {s.name}
        </T>
        <T v="small" numberOfLines={1}>
          {relativeDay(s.date)} · {v.durationMin} мин · {v.sets} подх.
        </T>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.muted} />
    </Card>
  );
});

const styles = StyleSheet.create({
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  exRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: colors.surface2, minHeight: 40 },
  day: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  dayDot: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
});
