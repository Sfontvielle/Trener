import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, T } from '@/components/ui';
import { Bar, Ring } from '@/components/charts';
import { TAB_BAR_HEIGHT } from '@/components/Screen';
import { useProfile } from '@/stores/profile';
import { usePlan } from '@/stores/plan';
import { useWorkouts } from '@/stores/workouts';
import { useBody } from '@/stores/body';
import { useCoach } from '@/stores/coach';
import { useCheckins } from '@/stores/checkins';
import { useDayNutrition, useReadiness, useTodayWorkout } from '@/hooks/useToday';
import { useDayKey } from '@/hooks/useDayKey';
import { GOAL_LABEL, GOAL_SHORT } from '@/features/nutrition/targets';
import { getExercise } from '@/data/exercises';
import { dayProgress, macroState } from '@/features/nutrition/status';
import { stateColor } from '@/components/macroColor';
import { mainLimiter } from '@/features/recovery/readiness';
import { MODE_LABEL } from '@/features/training/today';
import { resumeActive, startTodayPlanned } from '@/features/training/actions';
import { refreshDailyInsight } from '@/features/coach/service';
import { weeklyRate, weightTrend } from '@/features/progress/weightTrend';
import { formatDayShort, greeting, startOfWeek } from '@/utils/date';
import { fmtNum, fmtWeight } from '@/utils/format';
import { useUi } from '@/stores/ui';

/**
 * Главный экран — строго один экран без вертикального скролла.
 * Высоты блоков подстраиваются: на iPhone 17 Pro Max (440×956) всё с запасом,
 * на 390×844 включается компактный режим (меньше вторичных подписей).
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const avail = height - insets.top - insets.bottom - TAB_BAR_HEIGHT;
  const compact = avail < 700;
  const tight = avail < 620;

  const profile = useProfile((s) => s.profile);
  const plan = usePlan((s) => s.plan);
  const override = usePlan((s) => s.overrides);
  const active = useWorkouts((s) => s.active);
  const sessions = useWorkouts((s) => s.sessions);
  const weights = useBody((s) => s.weights);
  const insight = useCoach((s) => s.insight);
  const checkins = useCheckins((s) => s.byDate);
  const d = useDayKey();
  const readiness = useReadiness();
  const tw = useTodayWorkout();
  const nut = useDayNutrition();
  const openHub = useUi((s) => s.openHub);

  const trend = useMemo(() => {
    const t = weightTrend(weights);
    if (!t.length) return null;
    const r = weeklyRate(t, 21);
    return { w: t[t.length - 1].trend, rate: r?.kgPerWeek };
  }, [weights]);

  const insightKey = `${d}|${checkins[d]?.createdAt ?? 0}|${sessions.length}|${override[d]?.createdAt ?? 0}|${plan?.id ?? ''}`;
  useFocusEffect(
    useCallback(() => {
      if (profile) void refreshDailyInsight(insightKey);
    }, [insightKey, profile]),
  );

  if (!profile) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const target = nut.target;
  const dp = dayProgress();
  const kcalState = target ? macroState('kcal', nut.eaten.kcal, target.kcal, dp) : 'progress';
  const firstName = profile.name.split(' ')[0] || 'атлет';
  const gap = tight ? 8 : compact ? 10 : 12;
  const previewLines = 6;
  const insightText = insight && insight.date === d ? insight.text : 'Собираю данные дня…';
  const weekStart = startOfWeek(d);
  const weekDone = sessions.filter((x) => x.status === 'completed' && x.date >= weekStart).length;

  return (
    <View style={[styles.root, { paddingTop: insets.top + (compact ? 4 : 8), paddingBottom: insets.bottom + TAB_BAR_HEIGHT + gap, gap }]}>
      {/* Шапка */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <T v="caption" color={colors.accent} style={{ letterSpacing: 2 }}>
            FORM <T v="caption"> / PERSONAL COACH</T>
          </T>
          <T v={compact || width < 420 ? 'h2' : 'h1'} numberOfLines={1} style={{ marginTop: 2 }}>
            {greeting()}, {firstName}
          </T>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="AI Coach" onPress={() => router.push('/coach')} style={styles.headBtn} hitSlop={4}>
          <Icon name="chatbubble-ellipses-outline" size={21} color={colors.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Профиль" onPress={() => router.push('/profile')} style={styles.avatar} hitSlop={4}>
          <T v="h3" color={colors.onAccent}>
            {firstName.charAt(0).toUpperCase()}
          </T>
        </Pressable>
      </View>

      {/* Цель + тренд веса */}
      <View style={styles.goalRow}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/plan')} style={styles.goal}>
          <View style={styles.goalDot} />
          <T v="caption" color={colors.text} numberOfLines={1} style={{ flexShrink: 1, letterSpacing: 1.2 }}>
            {tight ? `Цель · ${GOAL_SHORT[profile.goal]}` : GOAL_LABEL[profile.goal]}
          </T>
        </Pressable>
        {plan ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Почему такой план" onPress={() => router.push('/plan')} style={styles.weight}>
            <Icon name="git-branch-outline" size={15} color={colors.textDim} />
            <T v="small" color={colors.text} style={{ fontWeight: '700' }} numberOfLines={1}>
              {plan.splitLabel}
            </T>
          </Pressable>
        ) : null}
      </View>

      {/* Готовность */}
      <Pressable accessibilityRole="button" accessibilityLabel="Чек-ин и готовность" onPress={() => router.push('/checkin')} style={[styles.card, styles.readiness]}>
        {readiness ? (
          <>
            <Ring size={compact ? 58 : 66} stroke={6} progress={readiness.score / 100} color={readiness.band === 'go' ? colors.accent : readiness.band === 'reduce' ? colors.warning : colors.danger}>
              <T v="num" style={{ fontSize: compact ? 19 : 22 }}>
                {readiness.score}
              </T>
            </Ring>
            <View style={{ flex: 1 }}>
              <T v="caption">Готовность · {readiness.score}/100</T>
              <T v="h3" numberOfLines={2} style={{ marginTop: 2 }}>
                {tw.kind === 'rest' ? (readiness.band === 'go' ? 'Отдых по плану — силы есть на завтра' : 'Отдых по плану — как раз вовремя') : tw.kind === 'done' ? 'Тренировка сделана — восстанавливайся' : readiness.headline}
              </T>
              {!tight && mainLimiter(readiness) ? (
                <T v="small" numberOfLines={1} style={{ marginTop: 1 }}>
                  {mainLimiter(readiness)}
                </T>
              ) : null}
            </View>
          </>
        ) : (
          <>
            <Ring size={compact ? 58 : 66} stroke={6} progress={0}>
              <Icon name="sunny-outline" size={24} color={colors.accent} />
            </Ring>
            <View style={{ flex: 1 }}>
              <T v="caption">Утренний чек-ин</T>
              <T v="h3" numberOfLines={2} style={{ marginTop: 2 }}>
                Как ты сегодня? 4 вопроса — и план подстроится
              </T>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.muted} />
          </>
        )}
      </Pressable>

      {/* Сегодняшняя тренировка */}
      <View style={[styles.card, styles.workout, { flex: 1, minHeight: tight ? 150 : 170 }]}>
        <View style={styles.rowBetween}>
          <T v="caption">Сегодняшняя тренировка</T>
          {tw.kind === 'workout' && tw.mode !== 'normal' ? (
            <View style={[styles.badge, { backgroundColor: colors.warningDim }]}>
              <T v="small" color={colors.warning} style={{ fontSize: 11, fontWeight: '800' }}>
                {MODE_LABEL[tw.mode]}
              </T>
            </View>
          ) : null}
        </View>
        {active ? (
          <WorkoutBody title={active.name} sub={active.focus} meta={`В процессе · ${active.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0)} подходов сделано`} cta="Продолжить" icon="play" onPress={resumeActive} compact={compact} />
        ) : tw.kind === 'workout' && tw.template ? (
          <WorkoutBody
            title={tw.template.name}
            sub={tw.template.focus}
            meta={`~${tw.estMinutes} мин · ${tw.template.exercises.length} упр · ${tw.totalSets} подходов · RIR ${Math.min(...tw.template.exercises.map((e) => e.targetRir)) + tw.rirDelta}–${Math.max(...tw.template.exercises.map((e) => e.targetRir)) + tw.rirDelta}`}
            cta="Начать"
            icon="play"
            onPress={() => startTodayPlanned()}
            secondary={() => router.push({ pathname: '/workout/preview', params: { templateId: tw.template!.id } })}
            compact={compact}
            lines={tw.template.exercises.slice(0, previewLines).map((e) => ({ name: getExercise(e.exerciseId)?.name ?? '', meta: `${Math.max(1, Math.round(e.sets * tw.volumeFactor))}×${e.repMin}–${e.repMax}` }))}
          />
        ) : tw.kind === 'done' ? (
          <WorkoutBody
            title="Готово ✓"
            sub={tw.completedSession?.name ?? ''}
            meta={tw.nextWorkout ? `Следующая: ${tw.nextWorkout.template.name}, ${formatDayShort(tw.nextWorkout.date)}` : 'Восстанавливайся'}
            cta="Итоги тренировки"
            icon="stats-chart"
            variant="secondary"
            onPress={() => tw.completedSession && router.push({ pathname: '/workout/[id]', params: { id: tw.completedSession.id } })}
            compact={compact}
            lines={tw.completedSession ? tw.completedSession.exercises.filter((e) => e.sets.some((x) => x.done)).slice(0, previewLines).map((e) => ({ name: getExercise(e.exerciseId)?.name ?? '', meta: `${e.sets.filter((x) => x.done).length} подх.` })) : []}
          />
        ) : tw.kind === 'rest' ? (
          <WorkoutBody
            title="Отдых"
            sub={tw.reason ?? 'Восстановление — часть плана'}
            meta={tw.nextWorkout ? `Следующая: ${tw.nextWorkout.template.name}, ${formatDayShort(tw.nextWorkout.date)}` : ''}
            cta="Всё равно потренироваться"
            icon="add"
            variant="secondary"
            onPress={openHub}
            compact={compact}
            lines={tw.nextWorkout ? tw.nextWorkout.template.exercises.slice(0, Math.max(0, previewLines - 1)).map((e) => ({ name: getExercise(e.exerciseId)?.name ?? '', meta: `${e.sets}×${e.repMin}–${e.repMax}` })) : []}
            linesTitle={tw.nextWorkout ? `Следующая · ${tw.nextWorkout.template.name}` : undefined}
          />
        ) : (
          <WorkoutBody title="Нет плана" sub="Заполни профиль — FORM составит план" meta="" cta="Открыть профиль" icon="person" onPress={() => router.push('/profile')} compact={compact} />
        )}
      </View>

      {/* Компактные метрики: калории, белок, тренировки за неделю, вес */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Metric
          label="Калории"
          value={target ? fmtNum(Math.max(0, target.kcal - nut.eaten.kcal)) : '—'}
          sub={target ? (nut.eaten.kcal > target.kcal ? `+${fmtNum(nut.eaten.kcal - target.kcal)} сверх` : 'осталось') : ''}
          color={stateColor(kcalState, colors.text)}
          progress={target ? nut.eaten.kcal / target.kcal : 0}
          onPress={() => router.push('/nutrition')}
        />
        <Metric
          label="Белок"
          value={`${Math.round(nut.eaten.protein)}`}
          sub={target ? `из ${target.protein} г` : 'г'}
          color={colors.protein}
          progress={target ? nut.eaten.protein / target.protein : 0}
          onPress={() => router.push('/nutrition')}
        />
        <Metric label="Тренировки" value={`${weekDone}/${plan?.daysPerWeek ?? profile.daysPerWeek}`} sub="за неделю" color={colors.text} progress={weekDone / Math.max(1, plan?.daysPerWeek ?? profile.daysPerWeek)} onPress={() => router.push('/progress')} />
        <Metric
          label="Вес"
          value={trend ? fmtWeight(Math.round(trend.w * 10) / 10) : '+'}
          sub={trend?.rate !== undefined ? `${trend.rate >= 0 ? '+' : ''}${trend.rate.toFixed(2).replace('.', ',')}/нед` : trend ? 'кг' : 'взвеситься'}
          color={colors.text}
          onPress={() => router.push('/weight')}
        />
      </View>

      {/* AI insight */}
      <View style={[styles.card, styles.insight]}>
        <View style={styles.insightIcon}>
          <Icon name="sparkles" size={17} color={colors.onAccent} />
        </View>
        <View style={{ flex: 1 }}>
          <T v="caption" color={colors.accent}>
            FORM Coach{insight?.source === 'local' ? ' · расчёт' : ''}
          </T>
          <T v="small" color={colors.text} numberOfLines={compact ? 2 : 3} style={{ marginTop: 2, lineHeight: 18 }}>
            {insightText}
          </T>
          {insight && insight.date === d ? (
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 6 }}>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push({ pathname: '/coach', params: { q: `Почему ты так советуешь: «${insight.text}»? Объясни по моим данным.` } })}>
                <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
                  Почему?
                </T>
              </Pressable>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={() => router.push('/coach')}>
                <T v="small" style={{ fontWeight: '700' }}>
                  Подробнее
                </T>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function WorkoutBody({
  title,
  sub,
  meta,
  cta,
  icon,
  onPress,
  secondary,
  variant = 'primary',
  compact,
  lines = [],
  linesTitle,
}: {
  title: string;
  sub: string;
  meta: string;
  cta: string;
  icon: 'play' | 'add' | 'stats-chart' | 'person';
  onPress: () => void;
  secondary?: () => void;
  variant?: 'primary' | 'secondary';
  compact?: boolean;
  lines?: { name: string; meta: string }[];
  linesTitle?: string;
}) {
  // Сколько строк состава влезает — по реальной высоте карточки (кнопка «Начать» всегда видна)
  const [fit, setFit] = useState(0);
  return (
    <View style={{ flex: 1, justifyContent: 'space-between', gap: 8 }}>
      <View>
        <T v="display" numberOfLines={1} style={{ fontSize: compact ? 30 : 36, marginTop: 2 }}>
          {title}
        </T>
        <T v="body" numberOfLines={1} color={colors.textDim}>
          {sub}
        </T>
        {meta ? (
          <T v="small" numberOfLines={1} style={{ marginTop: 4 }}>
            {meta}
          </T>
        ) : null}
      </View>
      {lines.length ? (
        <View style={{ flex: 1, minHeight: 0, gap: 6, justifyContent: 'center' }} onLayout={(e) => setFit(Math.max(0, Math.floor((e.nativeEvent.layout.height - (linesTitle ? 18 : 0) + 6) / 38)))}>
          {linesTitle && fit > 0 ? <T v="caption" style={{ fontSize: 10 }}>{linesTitle}</T> : null}
          {lines.slice(0, fit).map((l, i) => (
            <View key={i} style={styles.line}>
              <T v="small" color={colors.text} numberOfLines={1} style={{ flex: 1, fontWeight: '600' }}>
                {l.name}
              </T>
              <T v="small" style={{ fontVariant: ['tabular-nums'] }}>{l.meta}</T>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title={cta} icon={icon} variant={variant} size={compact ? 'md' : 'lg'} onPress={onPress} style={{ flex: 1 }} />
        {secondary ? <Button title="Состав" variant="outline" size={compact ? 'md' : 'lg'} onPress={secondary} /> : null}
      </View>
    </View>
  );
}

function Metric({ label, value, sub, color, progress, onPress }: { label: string; value: string; sub: string; color: string; progress?: number; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value} ${sub}`} onPress={onPress} style={[styles.card, styles.metric]}>
      <T v="caption" numberOfLines={1} style={{ fontSize: 10 }}>
        {label}
      </T>
      <T v="num" numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 20, color }}>
        {value}
      </T>
      <T v="small" numberOfLines={1} style={{ fontSize: 10.5 }}>
        {sub}
      </T>
      {progress !== undefined ? <Bar progress={Math.min(1, progress)} color={color === colors.text ? colors.accent : color} height={3} style={{ marginTop: 4 }} /> : null}
    </Pressable>
  );
}

const styles = themed({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  goalRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  goal: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine },
  goalDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  weight: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: space.md },
  readiness: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 12 },
  workout: { borderColor: colors.accentLine, gap: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  metric: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, gap: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: colors.surface2 },
  insight: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  insightIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
