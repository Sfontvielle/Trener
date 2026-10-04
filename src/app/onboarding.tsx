import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import type { UserProfile } from '@/types';
import { colors, space } from '@/theme';
import { Screen } from '@/components/Screen';
import { Button, IconButton, T } from '@/components/ui';
import { Field } from '@/components/inputs';
import { Bar } from '@/components/charts';
import { BodySection, GoalPicker, TrainingSection, defaultProfile } from '@/features/profile/forms';
import { useProfile } from '@/stores/profile';
import { PlanOverview } from '@/features/profile/PlanSummary';
import { computeNutritionTarget } from '@/features/nutrition/targets';
import { generatePlan } from '@/features/training/planGenerator';
import { applyProfile } from '@/features/profile/applyProfile';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';

/** Короткий онбординг: 4 вопроса + план. Здоровье, оборудование, активность и питание — позже, на главной («Дополни профиль») */
const STEPS = ['Знакомство', 'Тело', 'Цель', 'Тренировки', 'Твой план'];

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [p, setP] = useState<UserProfile>(defaultProfile);
  const set = (patch: Partial<UserProfile>) => setP((x) => ({ ...x, ...patch }));

  const preview = useMemo(() => (step === STEPS.length - 1 ? { target: computeNutritionTarget(p), plan: generatePlan(p) } : null), [step, p]);
  const canNext = step === 0 ? p.name.trim().length > 0 : step === 3 ? p.equipment.length > 0 || p.location === 'home' : true;

  const finish = () => {
    applyProfile({ ...p, name: p.name.trim(), createdAt: Date.now() }, { force: true });
    useProfile.getState().updateSettings({ setupPending: ['health', 'equipment', 'life', 'food'] });
    haptic.success();
    router.replace('/');
  };

  return (
    <Screen keyboard>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: space.lg }}>
        {step > 0 ? <IconButton name="chevron-back" label="Назад" onPress={() => setStep(step - 1)} /> : <View style={{ width: 44 }} />}
        <View style={{ flex: 1, gap: 6 }}>
          <T v="caption">
            {step + 1} / {STEPS.length} · {STEPS[step]}
          </T>
          <Bar progress={(step + 1) / STEPS.length} />
        </View>
      </View>

      {step === 0 ? (
        <View style={{ gap: space.lg }}>
          <T v="caption" color={colors.accent} style={{ letterSpacing: 2 }}>
            {BRAND} / PERSONAL COACH
          </T>
          <T v="display">Тренер, нутрициолог и восстановление — в одном приложении</T>
          <T v="bodyDim">4 коротких вопроса — {BRAND} рассчитает калории, БЖУ, сплит и нагрузку. Все данные хранятся на твоём телефоне.</T>
          <Field label="Как тебя зовут?" placeholder="Имя" value={p.name} onChangeText={(t) => set({ name: t })} autoFocus returnKeyType="next" onSubmitEditing={() => canNext && setStep(1)} maxLength={40} />
        </View>
      ) : null}
      {step === 1 ? (
        <Section title="Параметры тела" sub="Нужны для расчёта расхода энергии.">
          <BodySection p={p} set={set} />
        </Section>
      ) : null}
      {step === 2 ? (
        <Section title="Главная цель" sub="От неё зависят калории, объём и прогрессия.">
          <GoalPicker p={p} set={set} />
        </Section>
      ) : null}
      {step === 3 ? (
        <Section title="Тренировки" sub="Только реальные возможности — план должен выполняться.">
          <TrainingSection p={p} set={set} compact />
        </Section>
      ) : null}
      {step === 4 && preview ? (
        <Section title={`${p.name.trim()}, вот твой старт`} sub="Рассчитано автоматически. Здоровье, оборудование и питание можно уточнить потом — тренер напомнит.">
          <PlanOverview plan={preview.plan} target={preview.target} />
        </Section>
      ) : null}

      <View style={{ marginTop: space.xl }}>
        {step < STEPS.length - 1 ? (
          <Button title="Далее" size="lg" disabled={!canNext} onPress={() => setStep(step + 1)} />
        ) : (
          <Button title={`Начать с ${BRAND}`} icon="checkmark" size="lg" onPress={finish} />
        )}
      </View>
    </Screen>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.lg }}>
      <View style={{ gap: 4 }}>
        <T v="h1">{title}</T>
        {sub ? <T v="bodyDim">{sub}</T> : null}
      </View>
      {children}
    </View>
  );
}
