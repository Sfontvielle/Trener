import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';
import { router } from 'expo-router';
import { colors, space, themed } from '@/theme';
import { Button, Card, Icon, SectionTitle, T } from '@/components/ui';
import { Group, StatRow } from '@/components/ds';
import { toast } from '@/components/Dialog';
import { useNutrition } from '@/stores/nutrition';
import { usePlan } from '@/stores/plan';
import { useBody } from '@/stores/body';
import { useProfile } from '@/stores/profile';
import { useWorkouts } from '@/stores/workouts';
import { nutritionPeriod, weightLinkText } from '@/features/nutrition/analytics';
import { reviewCalories } from '@/features/nutrition/adaptive';
import { applyCalorieDelta } from '@/features/profile/applyProfile';
import { plural, today } from '@/utils/date';
import { BRAND } from '@/config/brand';

/**
 * Питание за период на экране «Прогресс» (макет 05-progress, NUTRITION_SPEC.md §11): средние по учтённым дням,
 * % от цели, калории по дням с линией цели и одна фраза о связи с весом — или чего для неё не хватает.
 */
export function NutritionAnalytics({ days }: { days: 7 | 30 | 90 }) {
  const entries = useNutrition((s) => s.entries);
  const target = usePlan((s) => s.target);
  const adjustments = usePlan((s) => s.adjustments);
  const weights = useBody((s) => s.weights);
  const metrics = useBody((s) => s.metrics);
  const profile = useProfile((s) => s.profile);
  const sessions = useWorkouts((s) => s.sessions);
  const d = today();
  const p = useMemo(() => nutritionPeriod({ entries, target, weights, days, today: d }), [entries, target, weights, days, d]);
  const review = useMemo(() => (profile && target ? reviewCalories({ profile, weights, entries, adjustments, targetKcal: target.kcal, metrics, sessions }) : null), [profile, target, weights, entries, adjustments, metrics, sessions]);
  const pct = (x: number | undefined) => (x === undefined ? undefined : `${Math.round(x * 100)}%`);
  const periodDays = days - 1; // сегодня не входит
  return (
    <View testID="nutrition-analytics">
      <SectionTitle title="Питание" action={`${p.counted} из ${periodDays} ${plural(periodDays, 'дня', 'дней', 'дней')} учтено`} onAction={() => router.push('/nutrition')} />
      {p.avg && target ? (
        <>
          <Group>
            <StatRow label="В среднем" value={p.avg.kcal} unit={`ккал · ${pct(p.pct?.kcal)}`} />
            <StatRow label="Цель" value={target.kcal} unit="ккал" />
            <StatRow label="Белки" value={p.avg.protein} unit={`г · ${pct(p.pct?.protein)}`} dot={colors.protein} />
            <StatRow label="Жиры" value={p.avg.fat} unit={`г · ${pct(p.pct?.fat)}`} dot={colors.fat} />
            <StatRow label="Углеводы" value={p.avg.carbs} unit={`г · ${pct(p.pct?.carbs)}`} dot={colors.carbs} />
            <StatRow label="Клетчатка" value={p.avg.fiber ?? '—'} unit={p.avg.fiber !== null ? 'г' : undefined} dot={colors.fiber} />
          </Group>
          <KcalBars perDay={p.perDay} target={target.kcal} />
          <T v="footnote" style={{ marginTop: space.xxs }}>
            Калории по дням, линия — цель. В средние входят дни, где записано 2 приёма пищи или 800 ккал; сегодняшний незаконченный день — нет.
          </T>
        </>
      ) : (
        <Card>
          <T v="callout">Нет дней, где записано хотя бы 2 приёма пищи или 800 ккал. Записывай еду — здесь появятся средние за период.</T>
        </Card>
      )}
      <Card style={{ marginTop: space.md, gap: space.xs }} testID="nutrition-weight-link">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
          <Icon name="sparkles-outline" size={16} color={colors.textDim} />
          <T v="footnote">{BRAND}</T>
        </View>
        <T v="body">{weightLinkText(p.weight)}</T>
        {review && review.status === 'adjust' ? <ApplyReview delta={review.deltaKcal} summary={review.summary} /> : null}
      </Card>
    </View>
  );
}

function ApplyReview({ delta, summary }: { delta: number; summary: string }) {
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <View style={{ gap: space.xs }}>
      <T v="callout">{summary}</T>
      <View style={{ flexDirection: 'row', gap: space.xs }}>
        <Button title="Не менять" variant="secondary" size="sm" onPress={() => setDone(true)} style={{ flex: 1 }} />
        <Button
          title={`Применить ${delta > 0 ? '+' : ''}${delta} ккал`}
          size="sm"
          style={{ flex: 1 }}
          onPress={() => {
            applyCalorieDelta(delta, summary, 'adaptive');
            toast('Калорийность обновлена');
            setDone(true);
          }}
        />
      </View>
    </View>
  );
}

/** Столбики калорий по дням: учтённые — основным цветом, неучтённые — бледно, сегодня — контуром; линия — цель */
function KcalBars({ perDay, target }: { perDay: { date: string; kcal: number | null; counted: boolean }[]; target: number }) {
  const [w, setW] = useState(0);
  const H = 96;
  const max = Math.max(target * 1.25, ...perDay.map((x) => x.kcal ?? 0));
  const gap = perDay.length > 40 ? 1 : 3;
  const bw = w ? Math.max(1, (w - gap * (perDay.length - 1)) / perDay.length) : 0;
  const y = (v: number) => H - (v / max) * (H - 4);
  const counted = perDay.filter((x) => x.counted).length;
  return (
    <View style={styles.chart} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityLabel={`Калории по дням: ${counted} учтённых дней, цель ${target} ккал`}>
      {w ? (
        <Svg width={w} height={H}>
          {perDay.map((x, i) =>
            x.kcal === null ? null : (
              <Rect
                key={x.date}
                x={i * (bw + gap)}
                y={y(x.kcal)}
                width={bw}
                height={H - y(x.kcal)}
                rx={Math.min(2, bw / 2)}
                fill={x.counted ? colors.textDim : colors.surface3}
                stroke={i === perDay.length - 1 ? colors.textDim : undefined}
                strokeWidth={i === perDay.length - 1 ? 1 : 0}
                fillOpacity={i === perDay.length - 1 ? 0 : 1}
              />
            ),
          )}
          <Line x1={0} x2={w} y1={y(target)} y2={y(target)} stroke={colors.text} strokeWidth={1} strokeDasharray="4 3" />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = themed({
  chart: { height: 96, marginTop: space.md },
});
