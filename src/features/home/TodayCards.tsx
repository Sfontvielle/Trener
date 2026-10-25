import React from 'react';
import { View } from 'react-native';
import type { Macros, ReadinessResult } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Icon, T, type IconName } from '@/components/ui';
import { Ring, Sparkline } from '@/components/charts';
import { Progress, Tap } from '@/components/motion';
import { readinessLabel } from '@/features/science/insights';
import { formatSleep } from '@/utils/date';
import { fmtNum } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';
import type { FeedItem } from '@/features/coach/feed';

/**
 * Карточки дня на главной (Premium Tech: крупные числа, спокойные поверхности, цвет — только смыслом).
 * Значения — только пользовательские данные; если их нет, карточка говорит, откуда они появятся.
 */

/** Цвет с прозрачностью: дорожка кольца — тот же цвет, приглушённый */
export const tint = (hex: string, a: number) => (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}${Math.round(a * 255).toString(16).padStart(2, '0')}` : hex);

const press = (fn: () => void) => () => {
  haptic.tap();
  fn();
};

/** Калории и БЖУ: кольцо «съедено из цели» и три полосы макросов */
export function NutritionCard({ eaten, target, onOpen }: { eaten: Macros; target: Macros | null; onOpen: () => void }) {
  const kcalP = target ? eaten.kcal / target.kcal : 0;
  const over = kcalP > 1.08;
  const macros: { key: 'protein' | 'fat' | 'carbs'; label: string; color: string }[] = [
    { key: 'protein', label: 'Белки', color: colors.protein },
    { key: 'fat', label: 'Жиры', color: colors.fat },
    { key: 'carbs', label: 'Углеводы', color: colors.carbs },
  ];
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`Калории, открыть питание: ${fmtNum(eaten.kcal)} из ${fmtNum(target?.kcal ?? 0)} ккал; белки ${Math.round(eaten.protein)}, жиры ${Math.round(eaten.fat)}, углеводы ${Math.round(eaten.carbs)} г`}
      onPress={press(onOpen)}
      style={styles.card}
      scaleTo={0.985}
      testID="home-nutrition"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Ring size={76} stroke={6} progress={Math.min(1, kcalP)} color={over ? colors.warning : colors.accent} track={tint(colors.accent, 0.14)}>
          <T v="small" color={colors.text} style={{ fontWeight: '800', fontSize: 13 }}>
            {target ? `${Math.round(Math.min(kcalP, 9.99) * 100)}%` : '—'}
          </T>
        </Ring>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="caption">Калории</T>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <T v="h1" style={{ fontVariant: ['tabular-nums'] }}>
              {fmtNum(eaten.kcal)}
            </T>
            <T v="small">{target ? `из ${fmtNum(target.kcal)} ккал` : 'ккал'}</T>
          </View>
          <T v="small" numberOfLines={1} color={over ? colors.warning : colors.textDim}>
            {!target ? 'Цель появится после анкеты' : over ? `Больше цели на ${fmtNum(eaten.kcal - target.kcal)} ккал` : eaten.kcal ? `Осталось ${fmtNum(Math.max(0, target.kcal - eaten.kcal))} ккал` : 'Пока ничего не записано'}
          </T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.md, marginTop: space.md }}>
        {macros.map((m) => (
          <View key={m.key} style={{ flex: 1, gap: 5 }}>
            <T v="small" numberOfLines={1} style={{ fontSize: 12 }}>
              {m.label}
            </T>
            <T v="body" numberOfLines={1} style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {Math.round(eaten[m.key])}
              <T v="small">{target ? ` / ${Math.round(target[m.key])} г` : ' г'}</T>
            </T>
            <Progress value={target ? eaten[m.key] / Math.max(1, target[m.key]) : 0} color={m.color} track={tint(m.color, 0.14)} height={3} />
          </View>
        ))}
      </View>
    </Tap>
  );
}

/** Небольшая карточка показателя (шаги, вес): подпись, крупное значение, строка пояснения, полоса или мини-график */
export function StatCard({
  icon,
  label,
  value,
  unit,
  sub,
  subColor,
  color,
  progress,
  spark,
  a11y,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  value: string;
  unit?: string;
  sub: string;
  subColor?: string;
  color: string;
  progress?: number;
  spark?: number[];
  a11y: string;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={a11y} onPress={press(onPress)} style={[styles.card, styles.half]} scaleTo={0.97} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={icon} size={15} color={color} />
        <T v="caption" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 8 }}>
        <T v="h1" numberOfLines={1} adjustsFontSizeToFit style={{ fontVariant: ['tabular-nums'], flexShrink: 1 }}>
          {value}
        </T>
        {unit ? <T v="small">{unit}</T> : null}
      </View>
      <T v="small" numberOfLines={1} adjustsFontSizeToFit color={subColor ?? colors.textDim} style={{ marginTop: 2 }}>
        {sub}
      </T>
      <View style={{ marginTop: 10, height: 24, justifyContent: 'flex-end' }}>
        {spark && spark.length > 1 ? <Sparkline values={spark} width={120} height={24} color={color} /> : progress !== undefined ? <Progress value={progress} color={color} track={tint(color, 0.14)} height={4} /> : null}
      </View>
    </Tap>
  );
}

/** Сон и восстановление: сон прошлой ночи (откуда — чек-ин или Apple Health) и готовность к нагрузке */
export function RecoveryCard({ sleep, readiness, hasCheckin, onOpen, onCheckin }: { sleep: { minutes: number; source: 'checkin' | 'health' } | null; readiness: ReadinessResult | undefined; hasCheckin: boolean; onOpen: () => void; onCheckin: () => void }) {
  const band = readiness?.band;
  const color = !readiness ? colors.textDim : band === 'go' ? colors.accent : band === 'reduce' ? colors.warning : colors.danger;
  const label = readiness ? readinessLabel(readiness) : null;
  return (
    <View style={[styles.card, styles.row]} testID="home-recovery">
      <Tap
        accessibilityRole="button"
        accessibilityLabel={`Сон и восстановление: ${sleep ? `сон ${formatSleep(sleep.minutes)}` : 'нет данных о сне'}${label ? `, готовность ${label.toLowerCase()}` : ''}. Сон, чек-ин`}
        onPress={press(readiness ? onOpen : onCheckin)}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md }}
        scaleTo={0.985}
      >
        <View style={[styles.iconTile, { backgroundColor: tint(colors.stabilizerMuscle, 0.16) }]}>
          <Icon name="moon" size={20} color={colors.stabilizerMuscle} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="caption">Сон и восстановление</T>
          <T v="h3" numberOfLines={1}>
            {sleep ? formatSleep(sleep.minutes) : 'Нет данных о сне'}
          </T>
          <T v="small" numberOfLines={2}>
            {sleep ? (sleep.source === 'health' ? 'по Apple Health' : 'по чек-ину') : 'Пройди чек-ин или подключи Apple Health'}
          </T>
        </View>
        {label ? (
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <View style={[styles.pill, { backgroundColor: tint(color, 0.16) }]}>
              <T v="small" color={color} style={{ fontWeight: '800', fontSize: 12 }}>
                {label}
              </T>
            </View>
            <T v="small" style={{ fontSize: 11 }}>
              готовность
            </T>
          </View>
        ) : null}
      </Tap>
      {!hasCheckin ? (
        <Tap accessibilityRole="button" accessibilityLabel="Чек-ин за 30 секунд" onPress={press(onCheckin)} style={styles.smallBtn} scaleTo={0.92} hitSlop={6}>
          <T v="small" color={colors.text} style={{ fontWeight: '700' }}>
            Чек-ин
          </T>
        </Tap>
      ) : null}
    </View>
  );
}

/** RYNJI Coach: главный сигнал дня (все сигналы — в листе) и вопрос тренеру */
export function CoachCard({ top, more, onOpen, onAsk }: { top?: FeedItem; more: number; onOpen: () => void; onAsk: () => void }) {
  const dot = !top ? colors.accent : top.tone === 'urgent' ? colors.danger : top.tone === 'warning' ? colors.warning : colors.accent;
  return (
    <View style={[styles.card, styles.row]}>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={top ? `От тренера: ${top.title}${more > 0 ? ` и ещё ${more}` : ''}` : `Тренер ${BRAND} — сигналы дня`}
        onPress={press(onOpen)}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
        scaleTo={0.985}
        testID="coach-feed"
      >
        <View style={[styles.iconTile, { backgroundColor: tint(colors.accent, 0.14) }]}>
          <Icon name="sparkles" size={18} color={dot} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="caption">{BRAND} Coach</T>
          <T v="body" style={{ fontWeight: '700' }} color={top?.tone === 'urgent' ? colors.danger : colors.text} numberOfLines={2}>
            {top ? top.title : 'Сигналов нет — всё по плану'}
          </T>
          {more > 0 ? (
            <T v="small" style={{ fontSize: 12 }}>
              и ещё {more}
            </T>
          ) : null}
        </View>
      </Tap>
      <Tap accessibilityRole="button" accessibilityLabel={`Спросить ${BRAND} Coach`} onPress={press(onAsk)} style={styles.askBtn} scaleTo={0.92} hitSlop={6} testID="coach-ask">
        <T v="small" color={colors.onAccent} style={{ fontWeight: '800' }}>
          Спросить
        </T>
      </Tap>
    </View>
  );
}

const styles = themed({
  card: { padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface },
  half: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconTile: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  pill: { paddingHorizontal: 10, height: 26, borderRadius: radius.pill, justifyContent: 'center' },
  smallBtn: { paddingHorizontal: 14, height: 32, borderRadius: 16, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  askBtn: { paddingHorizontal: 16, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
