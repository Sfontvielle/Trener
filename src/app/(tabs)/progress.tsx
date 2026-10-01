import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, space } from '@/theme';
import { Screen } from '@/components/Screen';
import { Button, Card, EmptyState, Icon, Segmented, SectionTitle, Stat, T } from '@/components/ui';
import { MiniBars, TrendChart } from '@/components/charts';
import { useBody } from '@/stores/body';
import { useWorkouts } from '@/stores/workouts';
import { usePlan } from '@/stores/plan';
import { useProfile } from '@/stores/profile';
import { useNutrition } from '@/stores/nutrition';
import { useCheckins } from '@/stores/checkins';
import { useHealth } from '@/stores/health';
import { weeklyRate, weightTrend } from '@/features/progress/weightTrend';
import { adherence, progressRows, workoutsInRange } from '@/features/training/analytics';
import { reviewCalories } from '@/features/nutrition/adaptive';
import { targetWeeklyChangeKg } from '@/features/nutrition/targets';
import { readinessFor } from '@/features/recovery/derive';
import { addDays, daysBetween, formatDayShort, formatHours, today } from '@/utils/date';
import { fmtWeight } from '@/utils/format';
import { lastWeekSummary, weeklyProposals, type WeeklyProposal } from '@/features/progress/weekly';
import { applyProfile } from '@/features/profile/applyProfile';
import { getPrefs } from '@/features/training/engine/prefs';
import { doneFineVolume, weeklyTargets } from '@/features/training/engine/volume';
import { VM_LABEL, VOLUME_MUSCLES } from '@/features/training/engine/muscles';
import { estimateMinutes } from '@/features/training/engine/time';
import { toast } from '@/components/Dialog';
import { getExercise } from '@/data/exercises';

type Range = '7' | '30' | '90' | 'all';

export default function Progress() {
  const [range, setRange] = useState<Range>('30');
  const [allPrs, setAllPrs] = useState(false);
  const weights = useBody((s) => s.weights);
  const sessions = useWorkouts((s) => s.sessions);
  const plan = usePlan((s) => s.plan);
  const target = usePlan((s) => s.target);
  const adjustments = usePlan((s) => s.adjustments);
  const profile = useProfile((s) => s.profile);
  const entries = useNutrition((s) => s.entries);
  const checkins = useCheckins((s) => s.byDate);
  const customs = useWorkouts((s) => s.customExercises);
  const d = today();

  const trend = useMemo(() => weightTrend(weights), [weights]);
  const shown = useMemo(() => {
    if (range === 'all') return trend;
    const from = addDays(d, -Number(range) + 1);
    return trend.filter((p) => p.date >= from);
  }, [trend, range, d]);
  const points = useMemo(() => shown.map((p) => ({ x: daysBetween(shown[0].date, p.date), y: p.trend, raw: p.raw })), [shown]);
  const rate = useMemo(() => weeklyRate(trend, 21), [trend]);
  const change = shown.length >= 2 ? shown[shown.length - 1].trend - shown[0].trend : 0;
  const goalRate = profile ? targetWeeklyChangeKg(profile, trend.length ? trend[trend.length - 1].trend : profile.weightKg) : 0;
  const review = useMemo(() => (profile && target ? reviewCalories({ profile, weights, entries, adjustments, targetKcal: target.kcal }) : null), [profile, target, weights, entries, adjustments]);

  const month = workoutsInRange(sessions, addDays(d, -29), d);
  const adh = useMemo(() => adherence(sessions, plan, 28), [sessions, plan]);
  const weekly = useMemo(() => Array.from({ length: 8 }, (_, i) => workoutsInRange(sessions, addDays(d, -7 * (8 - i) + 1), addDays(d, -7 * (7 - i)))), [sessions, d]);

  const recFactor = plan?.recovery?.factor ?? 1;
  // Объём по детальным группам: прямые подходы за 7 дней против недельной цели
  const volume = useMemo(() => {
    if (!profile) return [];
    const tg = weeklyTargets(profile, getPrefs(profile), recFactor);
    const cur = doneFineVolume(sessions, addDays(d, -6), d, customs);
    const prev = doneFineVolume(sessions, addDays(d, -13), addDays(d, -7), customs);
    return VOLUME_MUSCLES.filter((m) => tg[m] > 0).map((m) => ({ m, cur: cur[m], prev: prev[m], target: tg[m] }));
  }, [sessions, d, profile, customs, recFactor]);
  const proposals = useMemo(() => (profile ? weeklyProposals({ profile, plan, sessions, customs }) : []), [profile, plan, sessions, customs]);
  const [doneProposals, setDoneProposals] = useState<string[]>([]);
  const prs = useMemo(() => progressRows(sessions).filter((r) => r.sessions >= 1).slice(0, 8), [sessions]);
  // Сила: средний прирост e1RM по упражнениям с 2+ тренировками
  const strength = useMemo(() => {
    const rows = progressRows(sessions, [], 60).filter((r) => r.sessions >= 2);
    return rows.length ? Math.round(rows.reduce((a, r) => a + r.gainPct, 0) / rows.length) : null;
  }, [sessions]);

  const readiness7 = useMemo(() => {
    const vals: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const r = readinessFor(addDays(d, -i), checkins, sessions, useHealth.getState().days);
      vals.push(r?.score ?? 0);
    }
    return vals;
  }, [checkins, sessions, d]);
  const sleep = Object.values(checkins).filter((c) => c.date > addDays(d, -7));
  const avgSleep = sleep.length ? sleep.reduce((a, c) => a + c.sleepHours, 0) / sleep.length : null;

  const week = useMemo(() => lastWeekSummary({ sessions, plan, entries, target, weights, checkins }), [sessions, plan, entries, target, weights, checkins]);

  return (
    <Screen tabBar>
      <T v="h1" style={{ marginBottom: space.md }}>
        Прогресс
      </T>

      {week ? (
        <Card tone="accent" style={{ marginBottom: space.md, gap: 10 }}>
          <T v="caption">
            Итоги недели · {formatDayShort(week.from)} – {formatDayShort(week.to)}
          </T>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Stat label="Тренировки" value={`${week.workouts}/${week.planned || week.workouts}`} color={week.planned && week.workouts >= week.planned ? colors.accent : colors.text} />
            <Stat label="Подходов" value={String(week.sets)} />
            <Stat label="Ккал, ср." value={week.avgKcal ? String(week.avgKcal) : '—'} sub={target && week.avgKcal ? `цель ${target.kcal}` : undefined} />
            <Stat label="Вес" value={week.weightDelta === null ? '—' : `${week.weightDelta >= 0 ? '+' : ''}${week.weightDelta.toFixed(1)}`} unit={week.weightDelta === null ? undefined : 'кг'} />
          </View>
          <T v="small" style={{ fontSize: 12 }}>
            {week.loggedDays ? `Белок в норме ${week.proteinDays} из ${week.loggedDays} дней с записями. ` : 'Питание не записывалось. '}
            {week.avgSleep ? `Сон в среднем ${formatHours(week.avgSleep)}.` : ''}
          </T>
        </Card>
      ) : null}

      {proposals.filter((p) => !doneProposals.includes(p.id)).length ? (
        <Card style={{ marginBottom: space.md, gap: 10 }}>
          <T v="caption">Предложение FORM на неделю</T>
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

      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <T v="caption">Вес · тренд</T>
          <Pressable onPress={() => router.push('/weight')} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} accessibilityRole="button">
            <Icon name="add" size={16} color={colors.accent} />
            <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
              Записать
            </T>
          </Pressable>
        </View>
        {trend.length ? (
          <>
            <View style={{ flexDirection: 'row', gap: space.lg, marginTop: 8 }}>
              <Stat label="Сейчас" value={fmtWeight(Math.round(trend[trend.length - 1].trend * 10) / 10)} unit="кг" />
              <Stat label="За период" value={`${change >= 0 ? '+' : ''}${change.toFixed(1)}`} unit="кг" color={colors.text} />
              <Stat label="Темп/нед" value={rate ? `${rate.kgPerWeek >= 0 ? '+' : ''}${rate.kgPerWeek.toFixed(2)}` : '—'} sub={profile && profile.goal !== 'maintain' && profile.goal !== 'recomp' ? `цель ${goalRate >= 0 ? '+' : ''}${goalRate.toFixed(2)}` : 'цель ≈ 0'} />
            </View>
            <Segmented
              style={{ marginTop: space.md }}
              items={[
                { key: '7', label: '7 дн' },
                { key: '30', label: '30 дн' },
                { key: '90', label: '90 дн' },
                { key: 'all', label: 'Всё' },
              ]}
              value={range}
              onChange={setRange}
            />
            <View style={{ marginTop: space.md }}>
              <TrendChart points={points} labels={shown.length ? [formatDayShort(shown[0].date), formatDayShort(shown[shown.length - 1].date)] : undefined} />
            </View>
            <T v="small" style={{ fontSize: 12 }}>
              Линия — сглаженный тренд, точки — взвешивания. Решения по калориям FORM принимает по тренду.
            </T>
          </>
        ) : (
          <EmptyState icon="scale-outline" title="Нет истории веса" text="Взвешивайся 3–4 раза в неделю утром — появится тренд и адаптация калорий." action="Записать вес" onAction={() => router.push('/weight')} />
        )}
        {review ? (
          <View style={{ marginTop: space.md, padding: 12, borderRadius: radius.md, backgroundColor: review.status === 'adjust' ? colors.warningDim : colors.surface2 }}>
            <T v="body" style={{ fontWeight: '700', fontSize: 14 }}>
              {review.headline}
            </T>
            <T v="small" style={{ fontSize: 12 }}>
              {review.detail}
            </T>
          </View>
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: space.md }}>
        <Card style={{ flex: 1 }}>
          <Stat label="Тренировки" value={String(month)} unit="/ 30 дн" />
          <View style={{ marginTop: 10 }}>
            <MiniBars values={weekly} height={32} max={Math.max(plan?.daysPerWeek ?? 4, ...weekly)} />
          </View>
        </Card>
        <Card style={{ flex: 1 }}>
          <Stat label="Выполнение плана" value={adh.pct === null ? '—' : `${adh.pct}%`} color={adh.pct === null ? colors.text : adh.pct >= 85 ? colors.accent : adh.pct >= 65 ? colors.warning : colors.danger} sub={`${adh.workoutsDone}/${adh.workoutsPlanned} трен · 28 дн`} />
          <T v="small" style={{ fontSize: 11, marginTop: 6 }}>
            {strength !== null ? `Сила: ${strength >= 0 ? '+' : ''}${strength}% e1RM за 60 дн` : 'Учитывает пропуски и недоделанные подходы'}
          </T>
        </Card>
      </View>

      <SectionTitle title="Объём за 7 дней · цель" />
      {volume.some((v) => v.cur > 0 || v.prev > 0) ? (
        <Card style={{ gap: 8 }}>
          {volume.map((v) => {
            const pct = Math.min(1.3, v.cur / Math.max(1, v.target));
            return (
              <View key={v.m} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T v="small" style={{ width: 118, fontSize: 13 }} color={colors.text} numberOfLines={1}>
                  {VM_LABEL[v.m]}
                </T>
                <View style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.surface3, overflow: 'hidden' }}>
                  <View style={{ width: `${(pct / 1.3) * 100}%`, height: 8, borderRadius: 4, backgroundColor: pct >= 0.8 ? colors.accent : pct >= 0.5 ? colors.warning : colors.danger }} />
                  <View style={{ position: 'absolute', left: `${(1 / 1.3) * 100}%`, top: 0, bottom: 0, width: 2, backgroundColor: colors.text, opacity: 0.6 }} />
                </View>
                <T v="small" style={{ width: 46, textAlign: 'right', fontSize: 12, fontVariant: ['tabular-nums'] }} color={colors.text}>
                  {Math.round(v.cur)}/{v.target}
                </T>
              </View>
            );
          })}
          <T v="small" style={{ fontSize: 11 }}>
            Прямые рабочие подходы. Метка — недельная цель; косвенная работа (например, трицепс в жимах) не считается.
          </T>
        </Card>
      ) : (
        <Card>
          <T v="small">После первых тренировок здесь появится объём по каждой мышечной группе против недельной цели.</T>
        </Card>
      )}

      <SectionTitle title="Рабочие веса и рекорды" />
      {prs.length ? (
        <View style={{ gap: 8 }}>
          {prs.slice(0, allPrs ? prs.length : 4).map((r) => (
            <Card key={r.exerciseId} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: r.exerciseId } })} style={{ paddingVertical: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <T v="body" style={{ fontWeight: '700' }} numberOfLines={1}>
                    {r.name}
                  </T>
                  <T v="small">
                    {r.from} → <T v="small" color={colors.text} style={{ fontWeight: '800' }}>{r.to}</T>
                    {r.e1rmTo ? ` · 1ПМ ~${r.e1rmTo} кг` : ''}
                  </T>
                </View>
                <T v="h3" color={r.gainPct > 0 ? colors.accent : colors.textDim}>
                  {r.gainPct > 0 ? `+${r.gainPct}%` : r.sessions === 1 ? 'старт' : '='}
                </T>
              </View>
            </Card>
          ))}
          {prs.length > 4 ? <Button title={allPrs ? 'Свернуть' : `Показать все (${prs.length})`} size="sm" variant="ghost" onPress={() => setAllPrs(!allPrs)} /> : null}
        </View>
      ) : (
        <Card>
          <T v="small">Заверши несколько тренировок — FORM покажет рост рабочих весов и расчётный 1ПМ.</T>
        </Card>
      )}

      <SectionTitle title="Восстановление · 7 дней" />
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
          <Stat label="Готовность, ср." value={readiness7.some((x) => x) ? String(Math.round(readiness7.filter((x) => x).reduce((a, b) => a + b, 0) / readiness7.filter((x) => x).length)) : '—'} />
          <Stat label="Сон, ср." value={avgSleep ? formatHours(avgSleep) : '—'} unit={avgSleep ? 'ч' : undefined} />
          <Stat label="Чек-инов" value={`${sleep.length}/7`} />
        </View>
        <MiniBars values={readiness7} max={100} height={36} />
        {!sleep.length ? <Button title="Пройти чек-ин" size="sm" variant="secondary" style={{ marginTop: 10 }} onPress={() => router.push('/checkin')} /> : null}
      </Card>
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
