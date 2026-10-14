import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, space, themed } from '@/theme';
import { Screen } from '@/components/Screen';
import { Button, Card, Icon, IconButton, Segmented, T } from '@/components/ui';
import { Ambient, Appear } from '@/components/motion';
import { TrendChart } from '@/components/charts';
import { useBody } from '@/stores/body';
import { useWorkouts } from '@/stores/workouts';
import { usePlan } from '@/stores/plan';
import { useProfile } from '@/stores/profile';
import { useNutrition } from '@/stores/nutrition';
import { weeklyRate, weightTrend } from '@/features/progress/weightTrend';
import { targetWeeklyChangeKg } from '@/features/nutrition/targets';
import { addDays, daysBetween, formatDayShort, today } from '@/utils/date';
import { fmtWeight } from '@/utils/format';
import { weeklyProposals, type WeeklyProposal } from '@/features/progress/weekly';
import { applyProfile } from '@/features/profile/applyProfile';
import { estimateMinutes } from '@/features/training/engine/time';
import { toast } from '@/components/Dialog';
import { getExercise } from '@/data/exercises';
import { comparePeriods, progressNarrative } from '@/features/progress/series';
import { BRAND } from '@/config/brand';
import { useLabs } from '@/stores/labs';
import { healthFlags } from '@/features/labs/analysis';
import { analyzeBody, combineBodyFat, mergeZones, withoutStrengths, ZONE_LABEL } from '@/features/progress/body';

const fmt1 = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

type Range = '7' | '30' | '90' | 'all';

export default function Progress() {
  const [range, setRange] = useState<Range>('30');
  const [cmpDays, setCmpDays] = useState<'7' | '30' | '90'>('30');
  const weights = useBody((s) => s.weights);
  const metrics = useBody((s) => s.metrics);
  const labReports = useLabs((s) => s.reports);
  const sexP = useProfile((s) => s.profile?.sex);
  const lastLab = useMemo(() => [...labReports].sort((a, b) => (a.date < b.date ? 1 : -1))[0], [labReports]);
  const labFlags = useMemo(() => healthFlags(labReports, sexP).length, [labReports, sexP]);
  const sessions = useWorkouts((s) => s.sessions);
  const plan = usePlan((s) => s.plan);
  const profile = useProfile((s) => s.profile);
  const entries = useNutrition((s) => s.entries);
  const customs = useWorkouts((s) => s.customExercises);
  const d = today();

  const trend = useMemo(() => weightTrend(weights), [weights]);
  const shown = useMemo(() => {
    if (range === 'all') return trend;
    const from = addDays(d, -Number(range) + 1);
    return trend.filter((p) => p.date >= from);
  }, [trend, range, d]);
  const points = useMemo(() => shown.map((p) => ({ x: daysBetween(shown[0].date, p.date), y: p.trend, raw: p.raw, date: p.date })), [shown]);
  const rate = useMemo(() => weeklyRate(trend, 21), [trend]);
  const change = shown.length >= 2 ? shown[shown.length - 1].trend - shown[0].trend : 0;
  const goalRate = profile ? targetWeeklyChangeKg(profile, trend.length ? trend[trend.length - 1].trend : profile.weightKg) : 0;

  const proposals = useMemo(() => (profile ? weeklyProposals({ profile, plan, sessions, customs }) : []), [profile, plan, sessions, customs]);
  const [doneProposals, setDoneProposals] = useState<string[]>([]);
  const cmp = useMemo(() => comparePeriods({ days: Number(cmpDays), weights, metrics, sessions, entries }), [cmpDays, weights, metrics, sessions, entries]);
  const story = progressNarrative(cmp);
  const last = trend.length ? trend[trend.length - 1].trend : null;
  // Тело одной строкой: процент жира диапазоном (замеры + фото) и что подтянуть
  const analyses = useBody((s) => s.analyses);
  const bodyA = useMemo(() => (profile ? analyzeBody({ sex: profile.sex, age: profile.age, heightCm: profile.heightCm, weightKg: last ?? profile.weightKg, metrics, weights, today: d }) : null), [profile, last, metrics, weights, d]);
  const photoA = analyses.length && daysBetween(analyses[analyses.length - 1].date, d) <= 60 ? analyses[analyses.length - 1] : null;
  const body = bodyA ? combineBodyFat(bodyA.bodyFat, photoA?.bodyFat) : null;
  const bodyFocus = bodyA ? withoutStrengths(mergeZones(bodyA.lagging, photoA?.lagging), photoA?.strengths).slice(0, 2).map((z) => ZONE_LABEL[z.zone].toLowerCase()).join(', ') : '';
  // Один период на весь экран: и график веса, и «что изменилось»
  const pick = (r: Range) => {
    setRange(r);
    setCmpDays(r === 'all' ? '90' : r);
  };
  return (
    <Screen tabBar>
      <Ambient height={420} />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: space.sm }}>
        <T v="h1" style={{ flex: 1 }}>
          Прогресс
        </T>
        <IconButton name="add" label="Записать вес" onPress={() => router.push('/weight')} />
      </View>

      {/* Главное: как меняется тело — тренд веса крупно, одна строка темпа, график и период */}
      {last !== null ? (
        <>
          <Appear i={0} style={{ marginTop: space.md }}>
            <T v="caption">Вес · тренд</T>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <T v="hero">{fmtWeight(Math.round(last * 10) / 10)}</T>
              <T v="h3" color={colors.textDim}>
                кг
              </T>
            </View>
            <T v="bodyDim" style={{ marginTop: 4 }}>
              {rate ? `темп ${rate.kgPerWeek >= 0 ? '+' : '−'}${Math.abs(rate.kgPerWeek).toFixed(2).replace('.', ',')} кг/нед` : `${change >= 0 ? '+' : '−'}${Math.abs(change).toFixed(1).replace('.', ',')} кг за период`}
              {profile && profile.goal !== 'maintain' && profile.goal !== 'recomp' ? ` · цель ${goalRate >= 0 ? '+' : '−'}${Math.abs(goalRate).toFixed(2).replace('.', ',')}` : ''}
            </T>
          </Appear>
          <Appear i={1} style={{ marginTop: space.lg }}>
            <TrendChart points={points} labels={shown.length ? [formatDayShort(shown[0].date), formatDayShort(shown[shown.length - 1].date)] : undefined} />
          </Appear>
          <Appear i={2} style={{ marginTop: space.md }}>
            <Segmented
              items={[
                { key: '7', label: '7 дн' },
                { key: '30', label: '30 дн' },
                { key: '90', label: '90 дн' },
                { key: 'all', label: 'Всё' },
              ]}
              value={range}
              onChange={pick}
            />
          </Appear>
        </>
      ) : (
        <Appear i={0} style={{ marginTop: space.xl, gap: space.md }}>
          <T v="hero">Вес</T>
          <T v="bodyDim">Взвешивайся 3–4 раза в неделю утром — появится тренд, и калории начнут подстраиваться под тебя.</T>
          <Button title="Записать вес" icon="add" size="lg" live onPress={() => router.push('/weight')} />
        </Appear>
      )}

      {/* Что изменилось — одной фразой; подробная таблица — в «Подробной статистике» */}
      <Appear i={3}>
        <T v="body" color={colors.text} style={{ marginTop: space.xl, lineHeight: 23 }} testID="progress-story">
          {story ?? 'Пока мало данных за этот период — записывай вес, замеры и тренировки.'}
        </T>
      </Appear>

      {/* Переходы — одним списком */}
      <Appear i={4} style={[styles.list, { marginTop: space.xl }]}>
        <NavRow title="Тело" a11y="Тело: состав, фото и замеры" sub={body ? `≈ ${fmt1(body.low)}–${fmt1(body.high)} % жира${bodyFocus ? ` · подтянуть: ${bodyFocus}` : ''}` : 'фото и замеры'} onPress={() => router.push('/body')} />
        <NavRow title="Статистика" a11y="Статистика: сила, рекорды, нагрузка" sub="сила · рабочие веса и рекорды · нагрузка" onPress={() => router.push('/stats')} />
        <NavRow title="Отчёт недели" onPress={() => router.push('/weekly-review')} />
        <NavRow title="Анализы и здоровье" a11y="Анализы и здоровье" sub={labFlags && lastLab ? `${formatDayShort(lastLab.date)} · обсудить с врачом: ${labFlags}` : undefined} warn={!!labFlags} onPress={() => router.push('/labs')} last />
      </Appear>

      {proposals.filter((p) => !doneProposals.includes(p.id)).length ? (
        <Card style={{ marginTop: space.xl, gap: 10 }}>
          <T v="h3">Предложение {BRAND} на неделю</T>
          {proposals
            .filter((p) => !doneProposals.includes(p.id))
            .map((p) => (
              <View key={p.id} style={{ gap: 6 }}>
                <T v="body" style={{ fontWeight: '800' }}>
                  {p.text}
                </T>
                <T v="small">{p.why}</T>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Применить" size="sm" onPress={() => { applyProposal(p); setDoneProposals([...doneProposals, p.id]); }} style={{ flex: 1 }} />
                  <Button title="Не менять" size="sm" variant="secondary" onPress={() => setDoneProposals([...doneProposals, p.id])} style={{ flex: 1 }} />
                </View>
              </View>
            ))}
        </Card>
      ) : null}

    </Screen>
  );
}

function NavRow({ title, sub, onPress, a11y, warn, last }: { title: string; sub?: string; onPress: () => void; a11y?: string; warn?: boolean; last?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? title} onPress={onPress} style={({ pressed }) => [styles.navRow, !last && styles.navLine, pressed && { opacity: 0.6 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body" style={{ fontWeight: '600' }}>
          {title}
        </T>
        {sub ? (
          <T v="small" numberOfLines={1} color={warn ? colors.warning : colors.textDim}>
            {sub}
          </T>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
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
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, paddingLeft: space.md },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingRight: space.md, minHeight: 54 },
  navLine: { borderBottomWidth: 0.5, borderBottomColor: colors.borderStrong },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 34, borderRadius: 17, backgroundColor: colors.surface2 },
});
