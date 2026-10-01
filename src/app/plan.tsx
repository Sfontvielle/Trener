import React, { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { colors, space } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Button, Card, EmptyState, SectionTitle, T } from '@/components/ui';
import { confirm, toast } from '@/components/Dialog';
import { usePlan } from '@/stores/plan';
import { useProfile } from '@/stores/profile';
import { useBody } from '@/stores/body';
import { useNutrition } from '@/stores/nutrition';
import { PlanOverview, PlanWhy } from '@/features/profile/PlanSummary';
import { applyCalorieDelta, applyProfile } from '@/features/profile/applyProfile';
import { reviewCalories } from '@/features/nutrition/adaptive';
import { GOAL_LABEL } from '@/features/nutrition/targets';
import { relativeDay, today, toISODate } from '@/utils/date';

/** Текущий план: прозрачные расчёты, адаптация калорий и журнал изменений */
export default function PlanScreen() {
  const plan = usePlan((s) => s.plan);
  const target = usePlan((s) => s.target);
  const adjustments = usePlan((s) => s.adjustments);
  const overrides = usePlan((s) => s.overrides);
  const profile = useProfile((s) => s.profile);
  const weights = useBody((s) => s.weights);
  const entries = useNutrition((s) => s.entries);
  const review = useMemo(() => (profile && target ? reviewCalories({ profile, weights, entries, adjustments, targetKcal: target.kcal }) : null), [profile, target, weights, entries, adjustments]);
  const todayOverride = overrides[today()];

  if (!plan || !target || !profile) {
    return (
      <Screen>
        <Header title="План" />
        <EmptyState icon="calendar-outline" title="Плана пока нет" text="Заполни профиль." />
      </Screen>
    );
  }
  return (
    <Screen>
      <Header title="Мой план" subtitle={GOAL_LABEL[profile.goal]} />
      {todayOverride ? (
        <Card tone="warning" style={{ marginBottom: space.md, gap: 8 }}>
          <T v="caption">Изменение на сегодня</T>
          <T v="body">{todayOverride.reason}</T>
          <Button title="Вернуть план как был" size="sm" variant="secondary" onPress={() => { usePlan.getState().clearOverride(today()); toast('Сегодня снова по плану'); }} />
        </Card>
      ) : null}
      <PlanOverview plan={plan} target={target} />
      <View style={{ marginTop: space.md }}>
        <PlanWhy plan={plan} onChange={() => router.push('/training-prefs')} />
      </View>

      {review ? (
        <>
          <SectionTitle title="Адаптация калорий" />
          <Card tone={review.status === 'adjust' ? 'warning' : 'default'} style={{ gap: 6 }}>
            <T v="h3">{review.headline}</T>
            <T v="small">{review.detail}</T>
            {review.observedTdee ? (
              <T v="small">
                Фактический расход по дневнику и весу: ~{Math.round(review.observedTdee / 10) * 10} ккал (формула: {target.tdee})
              </T>
            ) : null}
            {review.status === 'adjust' ? <Button title={`Применить ${review.deltaKcal > 0 ? '+' : ''}${review.deltaKcal} ккал`} size="sm" onPress={() => { applyCalorieDelta(review.deltaKcal, review.headline, 'adaptive'); toast('Калории обновлены'); }} /> : null}
          </Card>
        </>
      ) : null}

      <SectionTitle title="Журнал изменений" />
      <Card style={{ gap: 10 }}>
        {adjustments.length === 0 ? <T v="small">Изменений пока не было.</T> : null}
        {adjustments.slice(0, 15).map((a) => (
          <View key={a.id} style={{ flexDirection: 'row', gap: 10 }}>
            <T v="small" style={{ width: 70 }}>
              {relativeDay(toISODate(new Date(a.createdAt)))}
            </T>
            <T v="small" color={colors.text} style={{ flex: 1 }}>
              {a.summary}
            </T>
          </View>
        ))}
      </Card>

      <Button
        title="Перестроить план с нуля"
        variant="outline"
        icon="refresh"
        style={{ marginTop: space.lg }}
        onPress={() => confirm('Перестроить план?', 'Шаблоны тренировок будут сгенерированы заново по профилю. Ручные правки шаблонов пропадут, история сохранится.', 'Перестроить', () => { applyProfile(profile, { force: true }); toast('План перестроен'); })}
      />
      <Button title="Изменить профиль и цель" variant="ghost" onPress={() => router.push('/profile')} style={{ marginTop: 6 }} />
    </Screen>
  );
}
