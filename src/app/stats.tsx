import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, space } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, Segmented, SectionTitle, Stat, T } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { MiniBars, TrendChart } from '@/components/charts';
import { useBody } from '@/stores/body';
import { useWorkouts } from '@/stores/workouts';
import { usePlan } from '@/stores/plan';
import { useProfile } from '@/stores/profile';
import { useNutrition } from '@/stores/nutrition';
import { useCheckins } from '@/stores/checkins';
import { useHealth } from '@/stores/health';
import { adherence, progressRows, workoutsInRange } from '@/features/training/analytics';
import { readinessFor } from '@/features/recovery/derive';
import { addDays, daysBetween, formatDayShort, formatHours, today } from '@/utils/date';
import { getPrefs } from '@/features/training/engine/prefs';
import { doneFineVolume, weeklyTargets } from '@/features/training/engine/volume';
import { VM_LABEL, VOLUME_MUSCLES } from '@/features/training/engine/muscles';
import { getExercise } from '@/data/exercises';
import { comparePeriods, e1rmSeries, topLifts, weeklySeries } from '@/features/progress/series';
import { CATEGORY_LABEL, categoryForScore } from '@/features/science/recovery';

type Tab = 'strength' | 'load' | 'recovery';

/**
 * Подробная статистика — вне первого экрана «Прогресса»: сила (расчётный максимум), рабочие веса и рекорды,
 * нагрузка (сравнение периодов, 8 недель, объём по мышцам) и восстановление.
 */
export default function Stats() {
  const [tab, setTab] = useState<Tab>('strength');
  const [allPrs, setAllPrs] = useState(false);
  const [cmpDays, setCmpDays] = useState<'7' | '30' | '90'>('30');
  const [lift, setLift] = useState<string | null>(null);
  const weights = useBody((s) => s.weights);
  const metrics = useBody((s) => s.metrics);
  const sessions = useWorkouts((s) => s.sessions);
  const customs = useWorkouts((s) => s.customExercises);
  const plan = usePlan((s) => s.plan);
  const target = usePlan((s) => s.target);
  const profile = useProfile((s) => s.profile);
  const entries = useNutrition((s) => s.entries);
  const checkins = useCheckins((s) => s.byDate);
  const d = today();

  const month = workoutsInRange(sessions, addDays(d, -29), d);
  const adh = useMemo(() => adherence(sessions, plan, 28), [sessions, plan]);
  const weekly = useMemo(() => Array.from({ length: 8 }, (_, i) => workoutsInRange(sessions, addDays(d, -7 * (8 - i) + 1), addDays(d, -7 * (7 - i)))), [sessions, d]);
  const recFactor = plan?.recovery?.factor ?? 1;
  const volume = useMemo(() => {
    if (!profile) return [];
    const tg = weeklyTargets(profile, getPrefs(profile), recFactor);
    const cur = doneFineVolume(sessions, addDays(d, -6), d, customs);
    const prev = doneFineVolume(sessions, addDays(d, -13), addDays(d, -7), customs);
    return VOLUME_MUSCLES.filter((m) => tg[m] > 0).map((m) => ({ m, cur: cur[m], prev: prev[m], target: tg[m] }));
  }, [sessions, d, profile, customs, recFactor]);
  const prs = useMemo(() => progressRows(sessions).filter((r) => r.sessions >= 1).slice(0, 8), [sessions]);
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
  const cmp = useMemo(() => comparePeriods({ days: Number(cmpDays), weights, metrics, sessions, entries }), [cmpDays, weights, metrics, sessions, entries]);
  const series = useMemo(() => weeklySeries(sessions, entries, 8), [sessions, entries]);
  const lifts = useMemo(() => topLifts(sessions), [sessions]);
  const liftId = lift ?? lifts[0] ?? null;
  const liftPts = useMemo(() => (liftId ? e1rmSeries(liftId, sessions) : []), [liftId, sessions]);

  return (
    <Screen>
      <Header title="Статистика" />
      <Segmented
        items={[
          { key: 'strength', label: 'Сила' },
          { key: 'load', label: 'Нагрузка' },
          { key: 'recovery', label: 'Восстановление' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <FadeIn key={tab} from={8} style={{ marginTop: space.lg }}>
      {tab === 'strength' ? (
      <>
      <SectionTitle title="Расчётный максимум" style={{ marginTop: 0 }} />
      <Card style={{ gap: 10 }}>
        {lifts.length ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {lifts.map((id) => (
                <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: id === liftId }} onPress={() => setLift(id)} style={{ paddingHorizontal: 14, height: 36, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: id === liftId ? colors.text : colors.surface2 }}>
                  <T v="small" color={id === liftId ? colors.bg : colors.text} style={{ fontWeight: '600' }} numberOfLines={2}>
                    {getExercise(id, customs)?.name ?? id}
                  </T>
                </Pressable>
              ))}
            </ScrollView>
            {liftPts.length >= 2 ? (
              <TrendChart points={liftPts.map((p) => ({ x: daysBetween(liftPts[0].date, p.date), y: p.value, raw: p.value, date: p.date }))} labels={[formatDayShort(liftPts[0].date), formatDayShort(liftPts[liftPts.length - 1].date)]} height={150} />
            ) : (
              <T v="small">Нужно минимум 2 тренировки с весом в этом упражнении.</T>
            )}
          </>
        ) : (
          <T v="small">Нужно 2+ тренировки с одним упражнением.</T>
        )}
      </Card>


      <SectionTitle title="Рабочие веса и рекорды" />
      {prs.length ? (
        <View style={{ gap: 8 }}>
          {prs.slice(0, allPrs ? prs.length : 4).map((r) => (
            <Card key={r.exerciseId} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: r.exerciseId } })} style={{ paddingVertical: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <T v="body" style={{ fontWeight: '700' }} numberOfLines={2}>
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
          <T v="small">Появится после нескольких тренировок.</T>
        </Card>
      )}

      </>
      ) : null}
      {tab === 'load' ? (
      <>
      <Segmented
        items={[
          { key: '7', label: '7 дн' },
          { key: '30', label: '30 дн' },
          { key: '90', label: '90 дн' },
        ]}
        value={cmpDays}
        onChange={setCmpDays}
      />
      <SectionTitle title={`Что изменилось · к предыдущим ${cmpDays} дням`} />
      <Card style={{ gap: 6 }}>
        <CmpRow label="Тренировки" cur={cmp.workouts.cur} prev={cmp.workouts.prev} />
        <CmpRow label="Рабочие подходы" cur={cmp.sets.cur} prev={cmp.sets.prev} />
        {cmp.kcal.cur !== null ? <CmpRow label="Ккал в день, ср." cur={cmp.kcal.cur} prev={cmp.kcal.prev} /> : null}
        {cmp.protein.cur !== null ? <CmpRow label="Белок в день, ср." cur={cmp.protein.cur} prev={cmp.protein.prev} unit="г" /> : null}
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
          {strength !== null ? (
            <T v="small" style={{ marginTop: 6 }}>
              Сила {strength >= 0 ? '+' : ''}
              {strength}% за 60 дн
            </T>
          ) : null}
        </Card>
      </View>
      <SectionTitle title="Тренировки и питание · 8 недель" />
      <Card style={{ gap: 12 }}>
        <WeekBars title="Тренировок в неделю" values={series.map((w) => w.workouts)} max={Math.max(plan?.daysPerWeek ?? 4, ...series.map((w) => w.workouts))} last={`${series[series.length - 1].workouts}`} />
        <WeekBars title="Рабочих подходов" values={series.map((w) => w.sets)} last={`${series[series.length - 1].sets}`} />
        <WeekBars title="Поднято за неделю, т" values={series.map((w) => Math.round(w.tonnage / 100) / 10)} last={`${(series[series.length - 1].tonnage / 1000).toFixed(1).replace('.', ',')}`} />
        {series.some((w) => w.avgKcal !== null) ? (
          <>
            <WeekBars title={`Ккал в день, ср.${target ? ` · цель ${target.kcal}` : ''}`} values={series.map((w) => w.avgKcal ?? 0)} max={Math.max(target?.kcal ?? 0, ...series.map((w) => w.avgKcal ?? 0))} last={series[series.length - 1].avgKcal !== null ? `${series[series.length - 1].avgKcal}` : '—'} color={colors.carbs} />
            <WeekBars title={`Белок в день, ср.${target ? ` · цель ${target.protein} г` : ''}`} values={series.map((w) => w.avgProtein ?? 0)} max={Math.max(target?.protein ?? 0, ...series.map((w) => w.avgProtein ?? 0))} last={series[series.length - 1].avgProtein !== null ? `${series[series.length - 1].avgProtein} г` : '—'} color={colors.protein} />
          </>
        ) : null}
      </Card>

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
          <T v="small" style={{ fontSize: 12 }}>
            Прямые рабочие подходы · метка — цель
          </T>
        </Card>
      ) : (
        <Card>
          <T v="small">Появится после первых тренировок.</T>
        </Card>
      )}

      </>
      ) : null}
      {tab === 'recovery' ? (
      <>
      <SectionTitle title="Восстановление · 7 дней" style={{ marginTop: 0 }} />
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 12, justifyContent: 'space-between', marginBottom: 10 }}>
          <Stat label="Готовность, неделя" value={readiness7.some((x) => x) ? CATEGORY_LABEL[categoryForScore(readiness7.filter((x) => x).reduce((a, b) => a + b, 0) / readiness7.filter((x) => x).length)] : '—'} />
          <Stat label="Сон, ср." value={avgSleep ? formatHours(avgSleep) : '—'} unit={avgSleep ? 'ч' : undefined} />
          <Stat label="Чек-инов" value={`${sleep.length}/7`} />
        </View>
        <MiniBars values={readiness7} max={100} height={36} />
        {!sleep.length ? <Button title="Пройти чек-ин" size="sm" variant="secondary" style={{ marginTop: 10 }} onPress={() => router.push('/checkin')} /> : null}
      </Card>
      </>
      ) : null}
      </FadeIn>
    </Screen>
  );
}

function CmpRow({ label, cur, prev, unit }: { label: string; cur: number; prev: number | null; unit?: string }) {
  const d = prev === null ? null : cur - prev;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <T v="small" style={{ flex: 1 }} color={colors.text}>
        {label}
      </T>
      <T v="small" style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }} color={colors.text}>
        {cur}
        {unit ? ` ${unit}` : ''}
      </T>
      <T v="small" style={{ width: 96, textAlign: 'right', fontSize: 11, fontVariant: ['tabular-nums'] }} numberOfLines={1}>
        {d === null || prev === null ? '' : d === 0 ? 'как раньше' : `было ${prev}`}
      </T>
    </View>
  );
}

function WeekBars({ title, values, max, last, color }: { title: string; values: number[]; max?: number; last: string; color?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row' }}>
        <T v="small" style={{ flex: 1, fontSize: 12 }}>
          {title}
        </T>
        <T v="small" color={colors.text} style={{ fontWeight: '800', fontSize: 12 }}>
          {last}
        </T>
      </View>
      <MiniBars values={values} max={max} height={34} color={color} />
    </View>
  );
}

