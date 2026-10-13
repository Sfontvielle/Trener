import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, space, themed } from '@/theme';
import { Screen } from '@/components/Screen';
import { Button, Card, Icon, IconButton, Segmented, SectionTitle, Stat, T } from '@/components/ui';
import { Ambient, Appear } from '@/components/motion';
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
import { targetWeeklyChangeKg } from '@/features/nutrition/targets';
import { readinessFor } from '@/features/recovery/derive';
import { addDays, daysBetween, formatDayShort, formatHours, today } from '@/utils/date';
import { fmtWeight } from '@/utils/format';
import { weeklyProposals, type WeeklyProposal } from '@/features/progress/weekly';
import { applyProfile } from '@/features/profile/applyProfile';
import { getPrefs } from '@/features/training/engine/prefs';
import { doneFineVolume, weeklyTargets } from '@/features/training/engine/volume';
import { VM_LABEL, VOLUME_MUSCLES } from '@/features/training/engine/muscles';
import { estimateMinutes } from '@/features/training/engine/time';
import { toast } from '@/components/Dialog';
import { getExercise } from '@/data/exercises';
import { comparePeriods, e1rmSeries, metricSeries, progressNarrative, topLifts, weeklySeries } from '@/features/progress/series';
import { METRIC_META } from '@/features/progress/metrics';
import { BRAND } from '@/config/brand';
import { CATEGORY_LABEL, categoryForScore } from '@/features/science/recovery';
import { useLabs } from '@/stores/labs';
import { PhotoCompare } from '@/features/progress/PhotoCompare';
import { healthFlags } from '@/features/labs/analysis';

type Range = '7' | '30' | '90' | 'all';

export default function Progress() {
  const [range, setRange] = useState<Range>('30');
  const [allPrs, setAllPrs] = useState(false);
  const [cmpDays, setCmpDays] = useState<'7' | '30' | '90'>('30');
  const [lift, setLift] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const weights = useBody((s) => s.weights);
  const metrics = useBody((s) => s.metrics);
  const photos = useBody((s) => s.photos);
  const labReports = useLabs((s) => s.reports);
  const sexP = useProfile((s) => s.profile?.sex);
  const lastLab = useMemo(() => [...labReports].sort((a, b) => (a.date < b.date ? 1 : -1))[0], [labReports]);
  const labFlags = useMemo(() => healthFlags(labReports, sexP).length, [labReports, sexP]);
  const sessions = useWorkouts((s) => s.sessions);
  const plan = usePlan((s) => s.plan);
  const target = usePlan((s) => s.target);
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
  const points = useMemo(() => shown.map((p) => ({ x: daysBetween(shown[0].date, p.date), y: p.trend, raw: p.raw, date: p.date })), [shown]);
  const rate = useMemo(() => weeklyRate(trend, 21), [trend]);
  const change = shown.length >= 2 ? shown[shown.length - 1].trend - shown[0].trend : 0;
  const goalRate = profile ? targetWeeklyChangeKg(profile, trend.length ? trend[trend.length - 1].trend : profile.weightKg) : 0;

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

  const cmp = useMemo(() => comparePeriods({ days: Number(cmpDays), weights, metrics, sessions, entries }), [cmpDays, weights, metrics, sessions, entries]);
  const story = progressNarrative(cmp);
  const series = useMemo(() => weeklySeries(sessions, entries, 8), [sessions, entries]);
  const lifts = useMemo(() => topLifts(sessions), [sessions]);
  const liftId = lift ?? lifts[0] ?? null;
  const liftPts = useMemo(() => (liftId ? e1rmSeries(liftId, sessions) : []), [liftId, sessions]);
  const waist = useMemo(() => metricSeries(metrics, 'waist'), [metrics]);
  const latestMetrics = useMemo(() => {
    const m: Partial<Record<string, { value: number; first: number }>> = {};
    for (const k of Object.keys(METRIC_META)) {
      const list = metricSeries(metrics, k as keyof typeof METRIC_META);
      if (list.length) m[k] = { value: list[list.length - 1].value, first: list[0].value };
    }
    return m;
  }, [metrics]);

  const last = trend.length ? trend[trend.length - 1].trend : null;
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

      <SectionTitle title="Тело: замеры и фото" action="Записать" onAction={() => router.push('/measurements')} />
      <Card style={{ gap: 10 }}>
        {waist.length >= 2 ? (
          <>
            <T v="small">Талия, см</T>
            <TrendChart points={waist.map((p) => ({ x: daysBetween(waist[0].date, p.date), y: p.value, raw: p.value, date: p.date }))} unit="см" labels={[formatDayShort(waist[0].date), formatDayShort(waist[waist.length - 1].date)]} height={140} />
          </>
        ) : null}
        {Object.keys(latestMetrics).length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {Object.entries(latestMetrics).map(([k, v]) => {
              const meta = METRIC_META[k as keyof typeof METRIC_META];
              const d = v ? Math.round((v.value - v.first) * 10) / 10 : 0;
              return (
                <View key={k} style={{ minWidth: '30%', flexGrow: 1, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface2 }}>
                  <T v="small" style={{ fontSize: 12 }}>
                    {meta.label}
                  </T>
                  <T v="num" style={{ fontSize: 18 }}>
                    {String(v?.value).replace('.', ',')}
                    <T v="small"> {meta.unit}</T>
                  </T>
                  {d ? (
                    <T v="small" style={{ fontSize: 11 }}>
                      {d > 0 ? '+' : '−'}
                      {String(Math.abs(d)).replace('.', ',')} с первого замера
                    </T>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <T v="small">Замеров пока нет.</T>
        )}
        <PhotoCompare photos={photos} />
        {photos.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {(photos.length > 1 ? [photos[0], ...photos.slice(-5).filter((x) => x !== photos[0])] : photos).map((ph, i) => (
              <View key={ph.id} style={{ width: 92, height: 122, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surface2 }}>
                <Image source={{ uri: ph.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                <View style={{ position: 'absolute', left: 4, bottom: 4, paddingHorizontal: 5, borderRadius: 5, backgroundColor: 'rgba(0,0,0,0.55)' }}>
                  <T v="small" color="#fff" style={{ fontSize: 10 }}>
                    {i === 0 && photos.length > 1 ? 'старт · ' : ''}
                    {formatDayShort(ph.date)}
                  </T>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : null}
        <Button title="Записать замеры и фото" icon="body-outline" variant="secondary" size="sm" onPress={() => router.push('/measurements')} />
      </Card>

      <SectionTitle title="Сила · расчётный максимум" />
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

      <Pressable accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore(!more)} style={({ pressed }) => [styles.moreRow, pressed && { opacity: 0.6 }]}>
        <T v="body" style={{ flex: 1 }}>
          Подробная статистика
        </T>
        <T v="small">изменения · 8 недель · объём · сон</T>
        <Icon name={more ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
      </Pressable>
      {more ? (
      <>
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

      <SectionTitle title="Восстановление · 7 дней" />
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
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: space.xl, paddingHorizontal: space.md, minHeight: 54, borderRadius: radius.lg, backgroundColor: colors.surface },
});
