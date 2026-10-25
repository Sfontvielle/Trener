import React from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { Macros, ReadinessResult } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, T, type IconName } from '@/components/ui';
import { Ring, Sparkline } from '@/components/charts';
import { Progress, Tap } from '@/components/motion';
import { BRAND_LIME } from '@/components/BrandMark';
import { readinessLabel } from '@/features/science/insights';
import { formatSleep } from '@/utils/date';
import { fmtNum } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';
import { tint } from './TodayCards';

/**
 * Главная по эталону app/01_home_reference: логотип и колокольчик, приветствие, крупная карточка сегодняшней
 * тренировки с 3D-атлетом, плитки 2×2 (калории, белки, шаги, восстановление), «Совет RYNJI», КБЖУ кольцом,
 * вес с динамикой, шаги за 7 дней. Только данные пользователя и Apple Health; нет данных — пустое состояние с действием.
 */
const HERO = require('../../../assets/art/home_hero.webp');
const PLATE = require('../../../assets/art/tip_plate.webp');
const press = (fn: () => void) => () => {
  haptic.tap();
  fn();
};

export function BrandLogo({ size = 26 }: { size?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} accessible accessibilityRole="header" accessibilityLabel={BRAND}>
      <MaterialCommunityIcons name="arm-flex" size={size * 1.15} color={BRAND_LIME} />
      <T v="h2" style={{ fontSize: size, lineHeight: size * 1.2, fontWeight: '900', fontStyle: 'italic', letterSpacing: 0.8 }}>
        {BRAND}
      </T>
    </View>
  );
}

/** Сегодняшняя тренировка (или её состояние): чип, крупное название, параметры, одна главная кнопка; справа — 3D-атлет */
export function TodayCard({ chip, title, meta, cta, ctaIcon = 'play', onCta, onMeta, dim, testID, ctaLive = true }: { chip: string; title: string; meta?: string; cta: string; ctaIcon?: IconName; onCta: () => void; onMeta?: () => void; dim?: boolean; testID?: string; ctaLive?: boolean }) {
  return (
    <View style={styles.today} testID={testID}>
      <View pointerEvents="none" style={[styles.todayArt, dim && { opacity: 0.45 }]}>
        <Image source={HERO} style={{ width: '100%', height: '100%' }} contentFit="cover" contentPosition="right top" accessible={false} />
      </View>
      <View pointerEvents="none" style={StyleSheetFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="todayShade" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.surface} stopOpacity={0.96} />
              <Stop offset="0.5" stopColor={colors.surface} stopOpacity={0.55} />
              <Stop offset="1" stopColor={colors.surface} stopOpacity={0} />
            </LinearGradient>
            <LinearGradient id="todayGlow" x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor={BRAND_LIME} stopOpacity={0.14} />
              <Stop offset="0.6" stopColor={BRAND_LIME} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#todayShade)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#todayGlow)" />
        </Svg>
      </View>
      <View style={styles.chip}>
        <Icon name="barbell-outline" size={15} color={colors.text} />
        <T v="small" color={colors.text} style={{ fontWeight: '700', fontSize: 12 }}>
          {chip}
        </T>
      </View>
      <View style={{ flex: 1 }} />
      <T v="h1" numberOfLines={2} style={{ fontSize: 26, lineHeight: 31, maxWidth: '78%' }}>
        {title}
      </T>
      {meta ? (
        onMeta ? (
          <Tap accessibilityRole="button" accessibilityLabel={`Состав: ${meta}`} onPress={press(onMeta)} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }} hitSlop={8}>
            <Icon name="time-outline" size={16} color={colors.textDim} />
            <T v="bodyDim">{meta} ›</T>
          </Tap>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
            <Icon name="time-outline" size={16} color={colors.textDim} />
            <T v="bodyDim">{meta}</T>
          </View>
        )
      ) : null}
      <View style={{ marginTop: space.md }}>
        <Button title={cta} icon={ctaIcon} size="lg" live={ctaLive} variant={ctaLive ? 'primary' : 'secondary'} onPress={onCta} />
      </View>
    </View>
  );
}
const StyleSheetFill = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 };

/** Плитка 2×2: значок, подпись, крупное число «из цели», справа — кольцо, столбики или сегменты */
export function Tile({ icon, iconLib = 'ion', label, value, of, unit, accent, ring, bars, segments, a11y, onPress, testID, empty }: {
  icon: string;
  iconLib?: 'ion' | 'mci';
  label: string;
  value: string;
  of?: string;
  unit?: string;
  accent?: string;
  ring?: number;
  bars?: (number | undefined)[];
  segments?: number;
  a11y: string;
  onPress: () => void;
  testID?: string;
  empty?: string;
}) {
  const c = accent ?? colors.accent;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={a11y} onPress={press(onPress)} style={styles.tile} scaleTo={0.97} testID={testID}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {iconLib === 'mci' ? <MaterialCommunityIcons name={icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']} size={20} color={c} /> : <Icon name={icon as IconName} size={19} color={c} />}
        <T v="body" style={{ fontWeight: '700', flex: 1, fontSize: 15 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {label}
        </T>
        {ring !== undefined ? <Ring size={30} stroke={3.5} progress={Math.min(1, Math.max(0, ring))} color={c} track={tint(c, 0.16)} /> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 12, gap: 6 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 }}>
          <T v="h1" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 26, fontVariant: ['tabular-nums'] }} color={accent && segments !== undefined ? c : colors.text}>
            {value}
          </T>
          {of ? (
            <T v="small" numberOfLines={1}>
              / {of}
              {unit ? ` ${unit}` : ''}
            </T>
          ) : unit ? (
            <T v="small">{unit}</T>
          ) : null}
        </View>
        {bars ? <MiniBars values={bars} color={c} /> : null}
        {segments !== undefined ? <Segments n={segments} color={c} /> : null}
      </View>
      {empty ? (
        <T v="small" numberOfLines={1} style={{ marginTop: 4, fontSize: 12 }}>
          {empty}
        </T>
      ) : null}
    </Tap>
  );
}

function MiniBars({ values, color }: { values: (number | undefined)[]; color: string }) {
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 26 }}>
      {values.map((v, i) => (
        <View key={i} style={{ width: 5, height: v ? Math.max(4, (v / max) * 26) : 3, borderRadius: 2, backgroundColor: v ? color : colors.surface3 }} />
      ))}
    </View>
  );
}

function Segments({ n, color }: { n: number; color: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4, paddingBottom: 8 }}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={{ width: 16, height: 5, borderRadius: 3, backgroundColor: i < n ? color : colors.surface3 }} />
      ))}
    </View>
  );
}

/** Восстановление на плитке: готовность (по чек-ину/Health) и сон */
export function recoveryTile(readiness: ReadinessResult | undefined, sleep: { minutes: number } | null) {
  if (!readiness) return { value: '—', color: colors.textDim, n: 0, sub: sleep ? `Сон ${formatSleep(sleep.minutes)}` : 'Пройди чек-ин' };
  const n = readiness.band === 'go' ? 3 : readiness.band === 'reduce' ? 2 : 1;
  const color = readiness.band === 'go' ? colors.accent : readiness.band === 'reduce' ? colors.warning : colors.danger;
  return { value: readinessLabel(readiness), color, n, sub: sleep ? `Сон ${formatSleep(sleep.minutes)}` : undefined };
}

/** «Совет RYNJI»: главный сигнал тренера, тап — все сигналы и вопрос тренеру */
export function TipCard({ title, text, tone, more, onOpen, onAsk }: { title: string; text?: string; tone?: 'urgent' | 'warning' | 'info'; more: number; onOpen: () => void; onAsk: () => void }) {
  const c = tone === 'urgent' ? colors.danger : tone === 'warning' ? colors.warning : colors.accent;
  return (
    <View style={styles.tip}>
      <View pointerEvents="none" style={styles.tipArt}>
        <Image source={PLATE} style={{ width: '100%', height: '100%' }} contentFit="contain" contentPosition="right" accessible={false} />
      </View>
      <Tap accessibilityRole="button" accessibilityLabel={`Совет ${BRAND}: ${title}${more > 0 ? ` и ещё ${more}` : ''}`} onPress={press(onOpen)} style={{ gap: 6, paddingRight: '28%' }} scaleTo={0.985} testID="coach-feed">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="bulb-outline" size={18} color={c} />
          <T v="body" color={c} style={{ fontWeight: '800' }}>
            Совет {BRAND}
          </T>
        </View>
        <T v="h3" numberOfLines={2} style={{ fontSize: 19 }}>
          {title}
        </T>
        {text ? (
          <T v="small" numberOfLines={2}>
            {text}
          </T>
        ) : null}
        {more > 0 ? (
          <T v="small" style={{ fontSize: 12 }} color={colors.textDim}>
            и ещё {more}
          </T>
        ) : null}
      </Tap>
      <Tap accessibilityRole="button" accessibilityLabel={`Спросить ${BRAND} Coach`} onPress={press(onAsk)} style={styles.ask} scaleTo={0.92} hitSlop={6} testID="coach-ask">
        <Icon name="sparkles" size={14} color={colors.onAccent} />
        <T v="small" color={colors.onAccent} style={{ fontWeight: '800' }}>
          Спросить
        </T>
      </Tap>
    </View>
  );
}

/** «КБЖУ на сегодня»: кольцо калорий из трёх сегментов БЖУ и список граммов с долей калорий */
export function MacroCard({ eaten, target, onOpen }: { eaten: Macros; target: Macros | null; onOpen: () => void }) {
  const parts = [
    { key: 'protein' as const, label: 'Белки', kcal: eaten.protein * 4, color: colors.protein },
    { key: 'fat' as const, label: 'Жиры', kcal: eaten.fat * 9, color: colors.fat },
    { key: 'carbs' as const, label: 'Углеводы', kcal: eaten.carbs * 4, color: colors.carbs },
  ];
  const total = parts.reduce((a, p) => a + p.kcal, 0);
  const R = 46;
  const C = 2 * Math.PI * R;
  const fill = target ? Math.min(1, eaten.kcal / Math.max(1, target.kcal)) : 0;
  let acc = 0;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`КБЖУ на сегодня: ${fmtNum(eaten.kcal)}${target ? ` из ${fmtNum(target.kcal)}` : ''} ккал. Открыть питание`} onPress={press(onOpen)} style={styles.card} scaleTo={0.985} testID="home-nutrition">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <MaterialCommunityIcons name="silverware-fork-knife" size={19} color={colors.accent} />
        <T v="body" style={{ fontWeight: '700', flex: 1 }}>
          КБЖУ на сегодня
        </T>
        <Icon name="chevron-forward" size={18} color={colors.textDim} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, marginTop: space.md }}>
        <View style={{ width: 112, height: 112, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={112} height={112} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
            <Circle cx={56} cy={56} r={R} stroke={tint(colors.accent, 0.14)} strokeWidth={10} fill="none" />
            {total > 0
              ? parts.map((p) => {
                  const len = (p.kcal / total) * C * fill;
                  const el = <Circle key={p.key} cx={56} cy={56} r={R} stroke={p.color} strokeWidth={10} fill="none" strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-acc} />;
                  acc += len;
                  return el;
                })
              : null}
          </Svg>
          <T v="h2" style={{ fontVariant: ['tabular-nums'], fontSize: 22 }}>
            {fmtNum(eaten.kcal)}
          </T>
          <T v="small" style={{ fontSize: 12 }}>
            {target ? `из ${fmtNum(target.kcal)}` : 'ккал'}
          </T>
        </View>
        <View style={{ flex: 1, gap: 10 }}>
          {parts.map((p) => (
            <View key={p.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: p.color }} />
              <T v="body" style={{ flex: 1 }}>
                {p.label}
              </T>
              <T v="body" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {Math.round(eaten[p.key])}
                <T v="small">{target ? ` / ${Math.round(target[p.key])} г` : ' г'}</T>
              </T>
            </View>
          ))}
          {!eaten.kcal ? (
            <T v="small" style={{ fontSize: 12 }}>
              Пока ничего не записано
            </T>
          ) : null}
        </View>
      </View>
    </Tap>
  );
}

/** Вес и динамика: тренд, изменение за неделю, мини-график за 4 недели */
export function WeightCard({ kg, sub, subColor, spark, a11y, onPress }: { kg: string | null; sub: string; subColor?: string; spark?: number[]; a11y: string; onPress: () => void }) {
  return (
    <Tap accessibilityRole="button" accessibilityLabel={a11y} onPress={press(onPress)} style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: space.md }]} scaleTo={0.985} testID="home-weight">
      <View style={[styles.iconTile, { backgroundColor: tint(colors.protein, 0.16) }]}>
        <Icon name="scale-outline" size={20} color={colors.protein} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body" style={{ fontWeight: '700' }}>
          Вес
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <T v="h2" style={{ fontVariant: ['tabular-nums'] }}>
            {kg ?? '—'}
          </T>
          {kg ? <T v="small">кг</T> : null}
        </View>
        <T v="small" color={subColor ?? colors.textDim} numberOfLines={1}>
          {sub}
        </T>
      </View>
      {spark && spark.length > 1 ? <Sparkline values={spark} width={110} height={36} color={colors.protein} /> : <Icon name="chevron-forward" size={18} color={colors.textDim} />}
    </Tap>
  );
}

/** «Активность за 7 дней»: шаги по дням из Apple Health, среднее; без данных — что подключить */
export function StepsWeekCard({ week, average, today, goal, healthOn, onPress }: { week: { label: string; steps?: number }[]; average: number | null; today?: number; goal: number; healthOn: boolean; onPress: () => void }) {
  const max = Math.max(goal, ...week.map((w) => w.steps ?? 0));
  const any = week.some((w) => w.steps !== undefined);
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`Активность за 7 дней${average ? `, в среднем ${fmtNum(average)} шагов` : ''}. Подробнее о шагах`} onPress={press(onPress)} style={styles.card} scaleTo={0.985} testID="home-steps-week">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="stats-chart" size={17} color={colors.accent} />
        <T v="body" style={{ fontWeight: '700', flex: 1 }}>
          Активность за 7 дней
        </T>
        {average ? <T v="small">Среднее: {fmtNum(average)} шагов</T> : null}
      </View>
      {any ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 96, marginTop: space.md }}>
          {week.map((w, i) => (
            <View key={i} style={{ alignItems: 'center', gap: 6, flex: 1 }}>
              <View style={{ width: 22, height: w.steps ? Math.max(6, (w.steps / max) * 72) : 4, borderRadius: 7, backgroundColor: w.steps ? (i === week.length - 1 ? colors.accent : tint(colors.accent, 0.62)) : colors.surface3 }} />
              <T v="small" style={{ fontSize: 11 }}>
                {w.label}
              </T>
            </View>
          ))}
        </View>
      ) : (
        <T v="small" style={{ marginTop: 10 }}>
          {healthOn ? 'Apple Health пока не прислал шаги за эту неделю.' : 'Подключи Apple Health — шаги будут подтягиваться сами.'}
        </T>
      )}
      {today !== undefined ? (
        <View style={{ gap: 6, marginTop: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <T v="h3" style={{ fontVariant: ['tabular-nums'] }}>
              {fmtNum(today)}
            </T>
            <T v="small" style={{ flex: 1 }}>
              шагов сегодня · цель {fmtNum(goal)}
            </T>
            <T v="small">{Math.round((today / goal) * 100)}%</T>
          </View>
          <Progress value={today / goal} color={colors.accent} track={tint(colors.accent, 0.14)} height={6} />
        </View>
      ) : null}
    </Tap>
  );
}

const styles = themed({
  today: { minHeight: 300, padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accentLine, overflow: 'hidden' },
  todayArt: { position: 'absolute', right: -20, top: 0, bottom: 70, width: '72%' },
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 28, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.45)', borderWidth: 1, borderColor: colors.border },
  tile: { flex: 1, minWidth: 0, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  card: { padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tip: { padding: space.md, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', gap: 12 },
  tipArt: { position: 'absolute', right: -30, top: 4, bottom: 4, width: '46%' },
  ask: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: 17, backgroundColor: colors.accent },
  iconTile: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
