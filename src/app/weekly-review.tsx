import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, EmptyState, Icon, T, type IconName } from '@/components/ui';
import { toast } from '@/components/Dialog';
import { useProfile } from '@/stores/profile';
import { usePlan } from '@/stores/plan';
import { useWorkouts } from '@/stores/workouts';
import { useNutrition } from '@/stores/nutrition';
import { useBody } from '@/stores/body';
import { useCheckins } from '@/stores/checkins';
import { useHealth } from '@/stores/health';
import { useCoach } from '@/stores/coach';
import { readinessFor } from '@/features/recovery/derive';
import { buildWeeklyReview } from '@/features/progress/review';
import { analyzeProgram, type ProgramProposal } from '@/features/training/adaptPlan';
import { applyProgramProposal } from '@/features/training/adaptActions';
import { reviewCalories } from '@/features/nutrition/adaptive';
import { applyCalorieDelta } from '@/features/profile/applyProfile';
import { formatDayShort, formatHours, today } from '@/utils/date';
import { fmtNum } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';
import { CATEGORY_LABEL, categoryForScore } from '@/features/science/recovery';

/**
 * Отчёт недели: что было (вес, замеры, тренировки, рабочие веса, питание, сон, восстановление),
 * и вывод тренера — что получилось, что требует внимания и что предлагается изменить.
 * Любые изменения программы и калорий — только по кнопке пользователя.
 */
export default function WeeklyReviewScreen() {
  const profile = useProfile((s) => s.profile);
  const plan = usePlan((s) => s.plan);
  const target = usePlan((s) => s.target);
  const adjustments = usePlan((s) => s.adjustments);
  const sessions = useWorkouts((s) => s.sessions);
  const entries = useNutrition((s) => s.entries);
  const weights = useBody((s) => s.weights);
  const metrics = useBody((s) => s.metrics);
  const checkins = useCheckins((s) => s.byDate);
  const health = useHealth((s) => s.days);
  const [handled, setHandled] = useState<string[]>([]);

  const review = useMemo(
    () => (profile ? buildWeeklyReview({ profile, plan, target, sessions, entries, weights, metrics, checkins, readiness: (d) => readinessFor(d, checkins, sessions, health)?.score }) : null),
    [profile, plan, target, sessions, entries, weights, metrics, checkins, health],
  );
  const proposals = useMemo<ProgramProposal[]>(() => (profile && review ? analyzeProgram({ profile, plan, sessions, checkins, readinessAvg: review.avgReadiness }) : []), [profile, plan, sessions, checkins, review]);
  const calories = useMemo(() => (profile && target ? reviewCalories({ profile, weights, entries, adjustments, targetKcal: target.kcal, metrics, sessions }) : null), [profile, target, weights, entries, adjustments, metrics, sessions]);

  if (!profile || !review) return null;
  const w = review.week;
  const empty = !w && !review.loggedDays;

  const remember = () => {
    const parts = [...review.good.slice(0, 2), ...review.attention.slice(0, 2)];
    useCoach.getState().addMemory(`Неделя ${formatDayShort(review.from)}–${formatDayShort(review.to)}: ${parts.join('; ')}`, 'training', 'user');
    haptic.success();
    toast('Выводы недели сохранены в памяти тренера');
  };

  return (
    <Screen>
      <Header title="Отчёт недели" subtitle={`${formatDayShort(review.from)} – ${formatDayShort(review.to)}`} />
      {empty ? (
        <EmptyState icon="newspaper-outline" title="Прошлая неделя пустая" text={`Записывай тренировки, еду и вес — в понедельник ${BRAND} соберёт отчёт и предложит, что изменить.`} />
      ) : (
        <>
          <View style={styles.grid}>
            <Tile icon="scale-outline" label="Вес" value={w?.weightDelta !== null && w?.weightDelta !== undefined ? `${w.weightDelta > 0 ? '+' : ''}${w.weightDelta.toFixed(1).replace('.', ',')} кг` : '—'} />
            <Tile icon="resize-outline" label="Талия" value={review.waistDelta !== null ? `${review.waistDelta > 0 ? '+' : ''}${String(review.waistDelta).replace('.', ',')} см` : '—'} />
            <Tile icon="barbell-outline" label="Тренировки" value={w ? `${w.workouts}/${w.planned || w.workouts}` : '0'} sub={review.missed ? `пропущено ${review.missed}` : undefined} />
            <Tile icon="trending-up" label="Рост весов" value={review.strengthUps.length ? `${review.strengthUps.length} упр.` : '—'} sub={review.prs.length ? `рекордов ${review.prs.length}` : undefined} />
            <Tile icon="flame-outline" label="Калории, ср." value={w?.avgKcal ? fmtNum(w.avgKcal) : '—'} sub={target && review.loggedDays ? `в цели ${review.kcalOnTargetDays}/${review.loggedDays} дн` : undefined} />
            <Tile icon="egg-outline" label="Белок, ср." value={review.avgProtein !== null ? `${review.avgProtein} г` : '—'} sub={target ? `цель ${target.protein} г` : undefined} />
            <Tile icon="moon-outline" label="Сон, ср." value={w?.avgSleep ? `${formatHours(w.avgSleep)} ч` : '—'} />
            <Tile icon="pulse" label="Готовность, ср." value={review.avgReadiness !== null ? CATEGORY_LABEL[categoryForScore(review.avgReadiness)] : '—'} />
          </View>

          {review.strengthUps.length || review.prs.length ? (
            <Card style={{ marginTop: space.md, gap: 6 }}>
              <T v="caption">Лучшие достижения</T>
              {review.prs.slice(0, 4).map((p) => (
                <Line key={p} icon="trophy-outline" text={p} color={colors.accent} />
              ))}
              {review.prs.length > 4 ? <T v="small">…и ещё {review.prs.length - 4} рекордов</T> : null}
              {review.strengthUps.filter((x) => !review.prs.some((p) => p.startsWith(x.name))).slice(0, 3).map((x) => (
                <Line key={x.name} icon="arrow-up-circle-outline" text={`${x.name} ${x.text}`} />
              ))}
            </Card>
          ) : null}

          <Card style={{ marginTop: space.md, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="sparkles" size={16} color={colors.accent} />
              <T v="caption" color={colors.accent}>
                Вывод тренера
              </T>
            </View>
            <T v="h3">Что получилось</T>
            {review.good.length ? review.good.map((g) => <Line key={g} icon="checkmark-circle" text={g} color={colors.accent} />) : <T v="small">Пока нечем похвастаться — эта неделя станет стартовой точкой.</T>}
            <T v="h3" style={{ marginTop: 4 }}>
              Что требует внимания
            </T>
            {review.attention.length ? review.attention.map((g) => <Line key={g} icon="alert-circle-outline" text={g} color={colors.warning} />) : <T v="small">Явных проблем нет.</T>}
            <T v="h3" style={{ marginTop: 4 }}>
              Что предлагаю изменить
            </T>
            {proposals.filter((p) => !handled.includes(p.id)).map((p) => (
              <View key={p.id} style={styles.proposal}>
                <T v="body" style={{ fontWeight: '800' }}>
                  {p.title}
                </T>
                {p.why.map((x) => (
                  <T key={x} v="small">
                    • {x}
                  </T>
                ))}
                {p.splitWhy ? (
                  <T v="small" color={colors.text}>
                    {p.splitWhy}
                  </T>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Применить" size="sm" style={{ flex: 1 }} onPress={() => { toast(applyProgramProposal(p), 'checkmark-circle'); setHandled([...handled, p.id]); }} />
                  <Button title="Оставить" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => { useCoach.getState().recordAdvice({ key: `program_${p.id}`, date: today(), text: p.title, status: 'dismissed' }); setHandled([...handled, p.id]); }} />
                </View>
              </View>
            ))}
            {calories && calories.status === 'adjust' && !handled.includes('kcal') ? (
              <View style={styles.proposal}>
                <T v="body" style={{ fontWeight: '800' }}>
                  {calories.deltaKcal > 0 ? '+' : ''}
                  {calories.deltaKcal} ккал в день
                </T>
                <T v="small">{calories.detail}</T>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Применить" size="sm" style={{ flex: 1 }} onPress={() => { applyCalorieDelta(calories.deltaKcal, calories.headline, 'coach'); toast('Калорийность обновлена'); setHandled([...handled, 'kcal']); }} />
                  <Button title="Оставить" size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => setHandled([...handled, 'kcal'])} />
                </View>
              </View>
            ) : null}
            {!proposals.filter((p) => !handled.includes(p.id)).length && !(calories?.status === 'adjust' && !handled.includes('kcal')) ? (
              <T v="small">Менять программу не нужно — продолжаем по плану и прогрессируем в весах.</T>
            ) : null}
            <T v="small" style={{ fontSize: 11 }}>
              Изменения применяются только по твоей кнопке. Выводы — сопоставление данных, а не медицинская оценка.
            </T>
          </Card>
          <Button title="Запомнить выводы недели" icon="bookmark-outline" variant="secondary" style={{ marginTop: space.md }} onPress={remember} />
          <Button title="Обсудить с тренером" icon="chatbubbles-outline" variant="ghost" onPress={() => router.push({ pathname: '/coach', params: { q: 'Разбери мою неделю' } })} />
        </>
      )}
    </Screen>
  );
}

function Tile({ icon, label, value, sub }: { icon: IconName; label: string; value: string; sub?: string }) {
  return (
    <View style={styles.tile}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Icon name={icon} size={13} color={colors.textDim} />
        <T v="caption" style={{ fontSize: 10 }} numberOfLines={1}>
          {label}
        </T>
      </View>
      <T v="num" style={{ fontSize: 20 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
      {sub ? (
        <T v="small" style={{ fontSize: 11 }}>
          {sub}
        </T>
      ) : null}
    </View>
  );
}

function Line({ icon, text, color = colors.textDim }: { icon: IconName; text: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <Icon name={icon} size={16} color={color} style={{ marginTop: 2 }} />
      <T v="body" style={{ flex: 1, fontSize: 14 }}>
        {text}
      </T>
    </View>
  );
}

const styles = themed({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { width: '48%', flexGrow: 1, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 2 },
  proposal: { gap: 6, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.accentLine },
});
