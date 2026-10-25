import React, { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { UserProfile } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, T } from '@/components/ui';
import { Appear, Progress } from '@/components/motion';
import { WeekStrip } from '@/features/profile/PlanSummary';
import { GOAL_SHORT, computeNutritionTarget } from '@/features/nutrition/targets';
import { generatePlan } from '@/features/training/planGenerator';
import { BRAND } from '@/config/brand';
import { fmtNum } from '@/utils/format';

const automation = Platform.OS === 'web' && typeof navigator !== 'undefined' && !!(navigator as { webdriver?: boolean }).webdriver;
/** Этапы — те же, что реально считает приложение (анкета → КБЖУ → программа); на каждый пункт ~0,25 с */
const PHASES = [
  { title: 'Анализируем твои данные…', items: ['Параметры тела', 'Цель и опыт', 'Уровень активности'] },
  { title: 'Создаём твой план…', items: ['Программа тренировок', 'Расчёт КБЖУ', 'Рекомендации'] },
];
const STEP_MS = 260;

/** Стратегия цели — без обещаний фиксированного результата */
const STRATEGY: Record<UserProfile['goal'], string> = {
  bulk: 'Профицит калорий, прогрессия нагрузки и белок — для роста мышц с минимумом лишнего жира.',
  cut: 'Умеренный дефицит, силовые сохраняют мышцы, белка больше — уходит в основном жир.',
  recomp: 'Калории около поддержания, высокий белок и прогрессия — мышцы растут, жир медленно уходит.',
  maintain: 'Калории на уровне расхода и регулярные тренировки — форма и сила сохраняются.',
};

/**
 * После анкеты (эталон 02_other_sections, «Формирование персонального плана»): «Анализируем твои данные…» →
 * «Создаём твой план…» — по пункту за ~0,25 с, всего ~1,8 с (расчёт мгновенный, долго не держим; Reduce Motion —
 * сразу итог) — и «Твой план готов!»: калории и БЖУ, программа на неделю — реальные формулы приложения
 * (computeNutritionTarget, generatePlan), подробности расчёта — по тапу.
 */
export function PlanReady({ profile, onStart, onBack }: { profile: UserProfile | null; onStart: () => void; onBack: () => void }) {
  const [phase, setPhase] = useState(automation ? PHASES.length : 0);
  const [tick, setTick] = useState(0);
  const [more, setMore] = useState(false);
  const calc = useMemo(() => (profile ? { target: computeNutritionTarget(profile), plan: generatePlan(profile) } : null), [profile]);

  useEffect(() => {
    if (automation) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    void AccessibilityInfo.isReduceMotionEnabled?.()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) return setPhase(PHASES.length);
        // по пункту за шаг: 3 пункта анализа → 3 пункта плана → готово
        let t = 0;
        PHASES.forEach((p, pi) => {
          for (let i = 1; i <= p.items.length; i++) timers.push(setTimeout(() => setTick(i), (t += STEP_MS)));
          timers.push(setTimeout(() => {
            setPhase(pi + 1);
            setTick(0);
          }, (t += STEP_MS)));
        });
      });
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  if (!profile || !calc) {
    return (
      <View style={{ gap: space.lg, marginTop: space.xxl }}>
        <T v="h2">Не все ответы заполнены</T>
        <Button title="Вернуться к анкете" variant="secondary" onPress={onBack} />
      </View>
    );
  }

  if (phase < PHASES.length) {
    const ph = PHASES[phase];
    const done = Math.min(ph.items.length, tick);
    return (
      <View style={styles.wait} accessibilityLiveRegion="polite" testID="plan-analyze">
        <View style={styles.ringOuter}>
          <View style={styles.ringInner}>
            {phase === 0 ? <MaterialCommunityIcons name="arm-flex" size={46} color={colors.accent} /> : <MaterialCommunityIcons name="dumbbell" size={46} color={colors.accent} />}
          </View>
        </View>
        <T v="h2" style={{ textAlign: 'center' }}>
          {ph.title}
        </T>
        <View style={{ gap: 10, alignSelf: 'center' }}>
          {ph.items.map((it, i) => (
            <View key={it} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: i < done ? 1 : 0.35 }}>
              <Icon name={i < done ? 'checkmark-circle-outline' : 'ellipse-outline'} size={20} color={i < done ? colors.accent : colors.textDim} />
              <T v="body">{it}</T>
            </View>
          ))}
        </View>
        <View style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: space.md }}>
          <Progress value={done / ph.items.length} color={colors.accent} track={colors.surface3} height={8} style={{ flex: 1 }} />
          <T v="small" style={{ fontVariant: ['tabular-nums'], width: 40, textAlign: 'right' }}>
            {Math.round((done / ph.items.length) * 100)}%
          </T>
        </View>
      </View>
    );
  }

  const { target, plan } = calc;
  const macro = [
    { label: 'Белки', g: target.protein, kcal: target.protein * 4, color: colors.protein },
    { label: 'Жиры', g: target.fat, kcal: target.fat * 9, color: colors.fat },
    { label: 'Углеводы', g: target.carbs, kcal: target.carbs * 4, color: colors.carbs },
  ];
  return (
    <View style={{ gap: space.xl, marginTop: space.lg }} testID="plan-ready">
      <Appear i={0} style={{ alignItems: 'center', gap: 10 }}>
        <View style={styles.badge}>
          <Icon name="checkmark" size={30} color={colors.onAccent} />
        </View>
        <T v="h1" accessibilityRole="header" style={{ textAlign: 'center', fontSize: 30 }}>
          Твой план готов!
        </T>
        <T v="bodyDim" style={{ textAlign: 'center' }}>
          {profile.name}, мы учли твою цель ({GOAL_SHORT[profile.goal].toLowerCase()}), параметры, опыт и образ жизни
        </T>
        <View style={{ alignSelf: 'stretch', gap: 8, marginTop: space.sm }}>
          {[
            { icon: 'barbell-outline' as const, label: 'Программа тренировок' },
            { icon: 'restaurant-outline' as const, label: 'Персональное КБЖУ' },
            { icon: 'heart-outline' as const, label: 'Рекомендации по восстановлению' },
          ].map((r) => (
            <View key={r.label} style={styles.readyRow}>
              <Icon name={r.icon} size={20} color={colors.accent} />
              <T v="body" style={{ flex: 1, fontWeight: '600' }}>
                {r.label}
              </T>
              <Icon name="checkmark" size={20} color={colors.accent} />
            </View>
          ))}
        </View>
      </Appear>

      <Appear i={1} style={styles.card}>
        <T v="caption">Питание на день</T>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <T v="hero" testID="plan-kcal">
            {fmtNum(target.kcal)}
          </T>
          <T v="h3" color={colors.textDim}>
            ккал
          </T>
        </View>
        <View style={styles.bar}>
          {macro.map((m) => (
            <View key={m.label} style={{ flex: m.kcal, backgroundColor: m.color }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {macro.map((m) => (
            <View key={m.label} style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.dot, { backgroundColor: m.color }]} />
                <T v="small">{m.label}</T>
              </View>
              <T v="h3" style={{ fontVariant: ['tabular-nums'] }}>
                {m.g} г
              </T>
            </View>
          ))}
        </View>
      </Appear>

      <Appear i={2} style={styles.card}>
        <T v="caption">Программа</T>
        <T v="h3">
          {plan.splitLabel} · {plan.daysPerWeek}× в неделю · ~{profile.sessionMinutes} мин
        </T>
        <WeekStrip plan={plan} />
        <T v="small" color={colors.textDim}>
          {STRATEGY[profile.goal]}
        </T>
      </Appear>

      <Appear i={3}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore(!more)} hitSlop={8} style={{ alignSelf: 'center' }}>
          <T v="small" style={{ fontWeight: '600' }}>
            {more ? 'Скрыть расчёт' : 'Как это рассчитано ›'}
          </T>
        </Pressable>
        {more ? (
          <View style={{ gap: 6, marginTop: 10 }}>
            {[...target.steps, ...plan.rationale].map((st, i) => (
              <T key={i} v="small">
                {st.label}: {st.value}
                {st.note ? ` (${st.note})` : ''}
              </T>
            ))}
          </View>
        ) : null}
      </Appear>

      <Button title="Открыть мой план" size="lg" live onPress={onStart} accessibilityLabel={`Открыть мой план и начать с ${BRAND}`} />
    </View>
  );
}

const styles = themed({
  wait: { minHeight: 520, alignItems: 'center', justifyContent: 'center', gap: 22, paddingHorizontal: space.md },
  ringOuter: { width: 150, height: 150, borderRadius: 75, borderWidth: 3, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center', shadowColor: colors.accent, shadowOpacity: 0.7, shadowRadius: 26, shadowOffset: { width: 0, height: 0 } },
  ringInner: { width: 118, height: 118, borderRadius: 59, borderWidth: 1, borderColor: colors.accentLine, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentDim },
  readyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, shadowColor: colors.accent, shadowOpacity: 0.6, shadowRadius: 18, shadowOffset: { width: 0, height: 0 } },
  card: { gap: 12, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
