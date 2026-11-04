import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { colors, space, themed } from '@/theme';
import { Screen } from '@/components/Screen';
import { T } from '@/components/ui';
import { AppHeader, Group, ListRow, PrimaryAction, ProposalCard, SectionHeader, SegmentedControl, StatRow } from '@/components/ds';
import { TrendChart } from '@/components/charts';
import { useBody } from '@/stores/body';
import { useWorkouts } from '@/stores/workouts';
import { usePlan } from '@/stores/plan';
import { useProfile } from '@/stores/profile';
import { useNutrition } from '@/stores/nutrition';
import { weightTrend } from '@/features/progress/weightTrend';
import { addDays, daysBetween, formatDayShort, plural, today } from '@/utils/date';
import { NBSP, fmtDelta, fmtValue } from '@/utils/format';
import { weeklyProposals, type WeeklyProposal } from '@/features/progress/weekly';
import { applyProfile } from '@/features/profile/applyProfile';
import { estimateMinutes } from '@/features/training/engine/time';
import { periodStats, prCounts } from '@/features/training/journal';
import { toast } from '@/components/Dialog';
import { getExercise } from '@/data/exercises';
import { comparePeriods, progressNarrative } from '@/features/progress/series';
import { useLabs } from '@/stores/labs';
import { healthFlags } from '@/features/labs/analysis';
import { analyzeBody, combineBodyFat, mergeZones, withoutStrengths, ZONE_LABEL } from '@/features/progress/body';
import { NutritionAnalytics } from '@/features/nutrition/AnalyticsSection';

type Days = 7 | 30 | 90;

const RANGES: { key: `${Days}`; label: string; a11y: string }[] = [
  { key: '7', label: '7 дней', a11y: 'Период 7 дней' },
  { key: '30', label: '30 дней', a11y: 'Период 30 дней' },
  { key: '90', label: '90 дней', a11y: 'Период 90 дней' },
];

/**
 * «Прогресс» (макет 05-progress, SCREEN_BLUEPRINTS ★7): один период на весь экран — тренд веса,
 * питание и тренировки за 7 / 30 / 90 дней. Где данных мало, так и написано; подробности — по тапу.
 */
export default function Progress() {
  const [days, setDays] = useState<Days>(30);
  const weights = useBody((s) => s.weights);
  const metrics = useBody((s) => s.metrics);
  const analyses = useBody((s) => s.analyses);
  const labReports = useLabs((s) => s.reports);
  const sessions = useWorkouts((s) => s.sessions);
  const customs = useWorkouts((s) => s.customExercises);
  const plan = usePlan((s) => s.plan);
  const profile = useProfile((s) => s.profile);
  const entries = useNutrition((s) => s.entries);
  const d = today();

  const trend = useMemo(() => weightTrend(weights), [weights]);
  const from = addDays(d, -days + 1);
  const shown = useMemo(() => trend.filter((p) => p.date >= from), [trend, from]);
  const points = useMemo(() => shown.map((p) => ({ x: daysBetween(shown[0].date, p.date), y: p.trend, raw: p.raw, date: p.date })), [shown]);
  const last = trend.length ? trend[trend.length - 1].trend : null;
  const cmp = useMemo(() => comparePeriods({ days, weights, metrics, sessions, entries }), [days, weights, metrics, sessions, entries]);
  const story = progressNarrative(cmp);

  // Тренировки за период и за такой же период до него
  const train = useMemo(() => {
    const prs = prCounts(sessions, customs);
    const cur = periodStats(sessions, from, d, customs, prs);
    const prev = periodStats(sessions, addDays(from, -days), addDays(from, -1), customs, prs);
    return { cur, prev };
  }, [sessions, customs, from, d, days]);
  const volPct = train.prev.tonnage > 0 && train.cur.tonnage > 0 ? Math.round(((train.cur.tonnage - train.prev.tonnage) / train.prev.tonnage) * 100) : undefined;

  const lastLab = useMemo(() => [...labReports].sort((a, b) => (a.date < b.date ? 1 : -1))[0], [labReports]);
  const labFlags = useMemo(() => healthFlags(labReports, profile?.sex).length, [labReports, profile?.sex]);
  // Тело одной строкой: процент жира диапазоном (замеры + фото) и что подтянуть
  const bodyA = useMemo(() => (profile ? analyzeBody({ sex: profile.sex, age: profile.age, heightCm: profile.heightCm, weightKg: last ?? profile.weightKg, metrics, weights, today: d }) : null), [profile, last, metrics, weights, d]);
  const photoA = analyses.length && daysBetween(analyses[analyses.length - 1].date, d) <= 60 ? analyses[analyses.length - 1] : null;
  const body = bodyA ? combineBodyFat(bodyA.bodyFat, photoA?.bodyFat) : null;
  const bodyFocus = bodyA ? withoutStrengths(mergeZones(bodyA.lagging, photoA?.lagging), photoA?.strengths).slice(0, 2).map((z) => ZONE_LABEL[z.zone].toLowerCase()).join(', ') : '';

  const proposals = useMemo(() => (profile ? weeklyProposals({ profile, plan, sessions, customs }) : []), [profile, plan, sessions, customs]);
  const [doneProposals, setDoneProposals] = useState<string[]>([]);
  const openProposals = proposals.filter((p) => !doneProposals.includes(p.id));

  const span = shown.length >= 2 ? daysBetween(shown[0].date, shown[shown.length - 1].date) : 0;
  const labels: [string, string, string] | [string, string] | undefined =
    shown.length < 2 ? undefined : span >= 4 ? [formatDayShort(shown[0].date), formatDayShort(addDays(shown[0].date, Math.round(span / 2))), formatDayShort(shown[shown.length - 1].date)] : [formatDayShort(shown[0].date), formatDayShort(shown[shown.length - 1].date)];
  const period = `${days} ${plural(days, 'день', 'дня', 'дней')}`;

  return (
    <Screen tabBar>
      <AppHeader title="Прогресс" actions={[{ icon: 'add', label: 'Записать вес', onPress: () => router.push('/weight'), testID: 'progress-add-weight' }]} />
      <SegmentedControl items={RANGES} value={`${days}`} onChange={(k) => setDays(Number(k) as Days)} />

      {/* Вес: тренд крупно, изменение за период справа, под ним — график */}
      {last !== null ? (
        <View style={{ marginTop: space.xl }} testID="progress-weight">
          <View style={styles.weightRow}>
            <View accessible accessibilityLabel={`Вес, тренд: ${fmtValue(last, 1)} кг`} style={{ flexShrink: 1 }}>
              <T v="footnote">Вес, тренд</T>
              <View style={styles.valueRow}>
                <T v="display">{fmtValue(last, 1)}</T>
                <T v="callout" color={colors.textDim}>
                  кг
                </T>
              </View>
            </View>
            <View accessible accessibilityLabel={cmp.weight ? `Изменение за ${period}: ${fmtDelta(cmp.weight.delta, 1)} кг` : `За ${period} мало взвешиваний для изменения`} style={styles.deltaCol} testID="progress-weight-delta">
              {cmp.weight ? (
                <>
                  <T v="headline" style={{ fontVariant: ['tabular-nums'] }}>
                    {`${fmtDelta(cmp.weight.delta, 1)}${NBSP}кг`}
                  </T>
                  <T v="footnote">за {period}</T>
                </>
              ) : (
                <T v="footnote" style={{ textAlign: 'right' }}>
                  {`мало взвешиваний\nза ${period}`}
                </T>
              )}
            </View>
          </View>
          <View style={{ marginTop: space.md }}>
            <TrendChart points={points} labels={labels} height={180} emptyText={`За ${period} меньше 2 взвешиваний`} />
          </View>
        </View>
      ) : (
        <View style={{ marginTop: space.xl, gap: space.sm }}>
          <T v="title2">Вес</T>
          <T v="callout" color={colors.textDim}>
            Взвешивайся 3–4 раза в неделю утром — появится тренд, и калории начнут подстраиваться под тебя.
          </T>
          <PrimaryAction title="Записать первый вес" icon="add" onPress={() => router.push('/weight')} />
        </View>
      )}

      {/* Что изменилось — одной фразой; подробности — в «Статистике» */}
      <T v="callout" color={colors.textDim} style={{ marginTop: space.md }} testID="progress-story">
        {story ?? `За ${period} мало данных — записывай вес, замеры и тренировки.`}
      </T>

      {/* Питание за тот же период: средние по учтённым дням, калории по дням, связь с весом */}
      <View style={{ marginTop: space.xl }}>
        <NutritionAnalytics days={days} />
      </View>

      {/* Тренировки за период; изменение — к такому же периоду до него */}
      <View style={{ marginTop: space.xl }} testID="progress-training">
        <SectionHeader title="Тренировки" />
        {train.cur.workouts ? (
          <>
            <Group>
              <StatRow label="Тренировок" value={train.cur.workouts} delta={train.prev.workouts ? train.cur.workouts - train.prev.workouts : undefined} />
              <StatRow label="Объём" value={Math.round(train.cur.tonnage)} unit="кг" delta={volPct} deltaSuffix="%" testID="progress-volume" />
              {cmp.strengthPct !== null ? <StatRow label="Сила" value={`${fmtDelta(cmp.strengthPct)}%`} /> : null}
              <StatRow label="Личные рекорды" value={train.cur.prs} onPress={() => router.push('/stats')} testID="progress-prs" />
            </Group>
            <T v="footnote" style={{ marginTop: space.xs }}>
              {train.prev.workouts ? `Изменения — к предыдущим ${days} ${plural(days, 'дню', 'дням', 'дням')}. ` : ''}
              {cmp.strengthPct !== null ? 'Сила — средний рост лучших подходов в упражнениях периода.' : ''}
            </T>
          </>
        ) : (
          <Group>
            <ListRow title={`За ${period} тренировок нет`} subtitle="План и запись тренировки — во вкладке «Тренировки»" icon="barbell-outline" onPress={() => router.push('/training')} />
          </Group>
        )}
      </View>

      {/* Предложения на неделю — применяются только по кнопке */}
      {openProposals.length ? (
        <View style={{ marginTop: space.xl, gap: space.sm }} testID="progress-proposals">
          {openProposals.map((p) => (
            <ProposalCard
              key={p.id}
              title={p.text}
              why={p.why}
              onKeep={() => setDoneProposals((x) => [...x, p.id])}
              onApply={() => {
                applyProposal(p);
                setDoneProposals((x) => [...x, p.id]);
              }}
            />
          ))}
        </View>
      ) : null}

      {/* Подробности — одним списком */}
      <View style={{ marginTop: space.xl }}>
        <SectionHeader title="Подробнее" />
        <Group>
          <ListRow
            title="Тело"
            icon="body-outline"
            accessibilityLabel="Тело: состав, фото и замеры"
            subtitle={body ? `≈ ${fmtValue(body.low, 1)}–${fmtValue(body.high, 1)} % жира${bodyFocus ? ` · подтянуть: ${bodyFocus}` : ''}` : 'Фото и замеры'}
            onPress={() => router.push('/body')}
          />
          <ListRow title="Статистика" icon="stats-chart-outline" accessibilityLabel="Статистика: сила, рекорды, нагрузка" subtitle="Сила, рабочие веса, нагрузка" onPress={() => router.push('/stats')} />
          <ListRow title="Отчёт недели" icon="calendar-outline" onPress={() => router.push('/weekly-review')} />
          <ListRow
            title="Анализы и здоровье"
            icon="flask-outline"
            iconColor={labFlags ? colors.warning : undefined}
            accessibilityLabel="Анализы и здоровье"
            subtitle={labFlags && lastLab ? `${formatDayShort(lastLab.date)} · обсудить с врачом: ${labFlags}` : undefined}
            onPress={() => router.push('/labs')}
          />
        </Group>
      </View>
    </Screen>
  );
}

/** Применение недельного предложения — только по кнопке пользователя */
function applyProposal(p: WeeklyProposal) {
  const profile = useProfile.getState().profile;
  if (!profile) return;
  if (p.kind === 'days' && p.days) {
    applyProfile({ ...profile, daysPerWeek: p.days, preferredDays: [] });
    toast(`План перестроен на ${p.days} дн. в неделю`);
    return;
  }
  const ps = usePlan.getState();
  if (p.kind === 'replace' && p.fromId && p.toId && ps.plan) {
    const customs = useWorkouts.getState().customExercises;
    for (const t of ps.plan.templates) {
      if (!t.exercises.some((e) => e.exerciseId === p.fromId)) continue;
      const exercises = t.exercises.map((e) => (e.exerciseId === p.fromId ? { ...e, exerciseId: p.toId!, why: `Замена из-за плато в «${getExercise(p.fromId!, customs)?.name}»` } : e));
      ps.updateTemplate({ ...t, exercises, estMinutes: estimateMinutes(exercises, customs) });
    }
    ps.addAdjustment({ kind: 'volume', summary: `Замена: ${p.text} (плато)`, source: 'user' });
    toast('Упражнение заменено в плане');
  }
}

const styles = themed({
  weightRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  deltaCol: { alignItems: 'flex-end', marginLeft: 'auto' },
});
