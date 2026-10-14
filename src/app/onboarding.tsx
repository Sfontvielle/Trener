import React, { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { UserProfile } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Screen } from '@/components/Screen';
import { Button, IconButton, T } from '@/components/ui';
import { Ambient, Appear, FadeIn, Progress } from '@/components/motion';
import { BodySection, GoalPicker, TrainingSection, defaultProfile } from '@/features/profile/forms';
import { useProfile } from '@/stores/profile';
import { WeekStrip } from '@/features/profile/PlanSummary';
import { computeNutritionTarget } from '@/features/nutrition/targets';
import { generatePlan } from '@/features/training/planGenerator';
import { applyProfile } from '@/features/profile/applyProfile';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';
import { fmtNum } from '@/utils/format';

/**
 * Знакомство — 5 коротких шагов, по одному вопросу на экран и без маркетинговых текстов:
 * имя → тело → цель → тренировки (дни недели вручную, темп) → старт. Здоровье, оборудование, активность
 * и питание — позже, тренер напомнит на главной.
 */
const STEPS = 5;
const TITLES = ['Как тебя зовут?', 'Параметры тела', 'Главная цель', 'Тренировки', ''];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<UserProfile>(defaultProfile);
  const set = (patch: Partial<UserProfile>) => setP((x) => ({ ...x, ...patch }));

  const preview = useMemo(() => (step === STEPS - 1 ? { target: computeNutritionTarget(p), plan: generatePlan(p) } : null), [step, p]);
  const canNext = step === 0 ? p.name.trim().length > 0 : step === 3 ? p.equipment.length > 0 || p.location === 'home' : true;
  const go = (n: number) => {
    haptic.tap();
    setStep(n);
  };

  const finish = () => {
    applyProfile({ ...p, name: p.name.trim(), createdAt: Date.now() }, { force: true });
    useProfile.getState().updateSettings({ setupPending: ['health', 'equipment', 'life', 'food'] });
    haptic.success();
    router.replace('/');
  };

  return (
    <Screen keyboard>
      <Ambient tone="calm" height={520} />
      {/* Назад слева, прогресс по центру: плашка «2 из 5» и полоса пропорционально экрану */}
      <View style={styles.top}>
        <View style={{ width: 44 }}>{step > 0 ? <IconButton name="chevron-back" label="Назад" bg="transparent" onPress={() => go(step - 1)} /> : null}</View>
        <View style={styles.progressWrap}>
          <View style={styles.pill}>
            <T v="small" color={colors.text} style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {step + 1} из {STEPS}
            </T>
          </View>
          <Progress value={(step + 1) / STEPS} color={colors.accent} track={colors.surface2} height={4} style={{ width: '100%' }} />
        </View>
        <View style={{ width: 44 }} />
      </View>

      <FadeIn key={step} from={14} style={{ gap: space.xl, marginTop: space.xl }}>
        {step < STEPS - 1 ? <T v="h1">{TITLES[step]}</T> : null}
        {step === 0 ? (
          <TextInput
            value={p.name}
            onChangeText={(t) => set({ name: t })}
            placeholder="Имя"
            placeholderTextColor={colors.muted}
            autoFocus
            returnKeyType="next"
            onSubmitEditing={() => canNext && go(1)}
            maxLength={40}
            accessibilityLabel="Как тебя зовут?"
            selectionColor={colors.accent}
            style={styles.nameInput}
          />
        ) : null}
        {step === 1 ? <BodySection p={p} set={set} /> : null}
        {step === 2 ? <GoalPicker p={p} set={set} /> : null}
        {step === 3 ? <TrainingSection p={p} set={set} compact /> : null}
        {step === 4 && preview ? <Start name={p.name.trim()} plan={preview.plan} target={preview.target} /> : null}
      </FadeIn>

      <View style={{ marginTop: space.xxl }}>
        {step < STEPS - 1 ? (
          <Button title="Далее" size="lg" live={canNext} disabled={!canNext} onPress={() => go(step + 1)} />
        ) : (
          <Button title={`Начать с ${BRAND}`} icon="checkmark" size="lg" live onPress={finish} />
        )}
      </View>
    </Screen>
  );
}

/** Старт: калории крупно, БЖУ одной строкой, неделя тренировок; подробный расчёт — по тапу */
function Start({ name, plan, target }: { name: string; plan: ReturnType<typeof generatePlan>; target: ReturnType<typeof computeNutritionTarget> }) {
  const [more, setMore] = useState(false);
  return (
    <View style={{ gap: space.xl }}>
      <Appear i={0} style={{ gap: 6 }}>
        <T v="caption">{name}, вот твой старт</T>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <T v="hero">{fmtNum(target.kcal)}</T>
          <T v="h3" color={colors.textDim}>
            ккал в день
          </T>
        </View>
        <T v="bodyDim">
          Белки {target.protein} · Жиры {target.fat} · Углеводы {target.carbs} г
        </T>
      </Appear>
      <Appear i={1} style={{ gap: 12 }}>
        <T v="h3">
          {plan.splitLabel} · {plan.daysPerWeek}× в неделю
        </T>
        <WeekStrip plan={plan} />
      </Appear>
      <Appear i={2}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore(!more)} hitSlop={8} style={{ alignSelf: 'flex-start' }}>
          <T v="small" style={{ fontWeight: '600' }}>
            {more ? 'Скрыть расчёт' : 'Как это рассчитано ›'}
          </T>
        </Pressable>
        {more ? (
          <View style={{ gap: 6, marginTop: 10 }}>
            {[...target.steps, ...plan.rationale].map((st, i) => (
              <T key={i} v="small">
                {st.label}: {st.value}
              </T>
            ))}
          </View>
        ) : null}
      </Appear>
    </View>
  );
}

const styles = themed({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressWrap: { flex: 1, alignItems: 'center', gap: 10, paddingHorizontal: '6%' },
  pill: { paddingHorizontal: 14, height: 30, borderRadius: radius.pill, backgroundColor: colors.surface2, justifyContent: 'center' },
  nameInput: { fontSize: 34, fontWeight: '800', color: colors.text, letterSpacing: -0.6, paddingVertical: 10, borderBottomWidth: 1.5, borderBottomColor: colors.borderStrong },
});
