import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { Equipment, GoalType } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Screen } from '@/components/Screen';
import { Button, Chip, IconButton, T } from '@/components/ui';
import { Ambient, Appear, FadeIn, Progress } from '@/components/motion';
import { NumberField } from '@/components/inputs';
import { ChipChoice, ChoiceCards, GOAL_DESC, GOAL_ICON, GYM_EQUIPMENT, PickerField, SexPicker, WeekdayChips } from '@/features/profile/forms';
import { DURATION_OPTIONS, LEVEL_OPTIONS, Q_STAGES, SLEEP_OPTIONS, STEP_BUCKETS, WORK_OPTIONS, draftErrors, draftToProfile, resumeStage, stageComplete } from '@/features/profile/questionnaire';
import { nameFromApple } from '@/features/account/route';
import { useProfile } from '@/stores/profile';
import { useAccount } from '@/stores/account';
import { useQuestionnaire } from '@/stores/questionnaire';
import { WeekStrip } from '@/features/profile/PlanSummary';
import { GOAL_SHORT, computeNutritionTarget } from '@/features/nutrition/targets';
import { generatePlan } from '@/features/training/planGenerator';
import { applyProfile } from '@/features/profile/applyProfile';
import { EQUIPMENT_LABEL } from '@/data/exercises';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';
import { fmtNum } from '@/utils/format';

/**
 * Анкета — 5 этапов: имя → о тебе (пол, возраст 18+, рост, вес) → цель → тренировки (опыт, график, длительность,
 * оборудование) → образ жизни (работа, шаги, сон, ограничения), затем «вот твой старт».
 * Ничего не подставляем за человека: поля пустые, пока он не ответил. Каждый ответ сразу сохраняется в черновик —
 * после закрытия приложения анкета продолжается с того же этапа. Целевой вес и срок не спрашиваем.
 */
const TITLES = ['Как тебя зовут?', 'О тебе', 'Главная цель', 'Тренировки', 'Образ жизни'];
const HOME_EQUIPMENT: Equipment[] = ['dumbbell', 'bench', 'pullupbar', 'kettlebell', 'band'];

export default function Onboarding() {
  const draft = useQuestionnaire((s) => s.draft);
  const update = useQuestionnaire((s) => s.update);
  const [step, setStepState] = useState(() => resumeStage(useQuestionnaire.getState().draft, useQuestionnaire.getState().stage));
  const setStep = (n: number) => {
    setStepState(n);
    useQuestionnaire.getState().setStage(n);
  };

  // Имя — только если человек сам дал его Apple при входе
  useEffect(() => {
    const a = useAccount.getState().apple;
    const q = useQuestionnaire.getState();
    if (!q.draft.name.trim() && a) {
      const n = nameFromApple(a.givenName, a.familyName);
      if (n) q.update({ name: n });
    }
  }, []);

  const errors = draftErrors(draft);
  const profile = useMemo(() => (step === Q_STAGES ? draftToProfile(draft, 0) : null), [step, draft]);
  const preview = useMemo(() => (profile ? { target: computeNutritionTarget(profile), plan: generatePlan(profile) } : null), [profile]);
  const canNext = step < Q_STAGES && stageComplete(draft, step);
  const go = (n: number) => {
    haptic.tap();
    setStep(n);
  };

  const finish = () => {
    if (!profile) return;
    const now = Date.now();
    applyProfile({ ...profile, createdAt: now, updatedAt: now }, { force: true });
    // Этапы анкеты уже спросили оборудование, образ жизни и ограничения; позже — только предпочтения в еде
    useProfile.getState().updateSettings({ setupPending: ['food'] });
    useQuestionnaire.getState().reset();
    haptic.success();
    router.replace('/');
  };

  return (
    <Screen keyboard>
      <Ambient tone="calm" height={520} />
      {/* Назад слева, прогресс по центру: плашка «2 из 5» и полоса пропорционально этапу */}
      <View style={styles.top}>
        <View style={{ width: 44 }}>{step > 0 ? <IconButton name="chevron-back" label="Назад" bg="transparent" onPress={() => go(step - 1)} /> : null}</View>
        <View style={styles.progressWrap}>
          <View style={styles.pill}>
            <T v="small" color={colors.text} style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {step < Q_STAGES ? `${step + 1} из ${Q_STAGES}` : 'Готово'}
            </T>
          </View>
          <Progress value={Math.min(step + 1, Q_STAGES) / Q_STAGES} color={colors.accent} track={colors.surface2} height={4} style={{ width: '100%' }} />
        </View>
        <View style={{ width: 44 }} />
      </View>

      <FadeIn key={step} from={14} style={{ gap: space.xl, marginTop: space.xl }}>
        {step < Q_STAGES ? (
          <T v="h1" accessibilityRole="header">
            {TITLES[step]}
          </T>
        ) : null}

        {step === 0 ? (
          <TextInput
            value={draft.name}
            onChangeText={(t) => update({ name: t })}
            placeholder="Имя"
            placeholderTextColor={colors.muted}
            autoFocus={!draft.name}
            returnKeyType="next"
            onSubmitEditing={() => canNext && go(1)}
            maxLength={40}
            accessibilityLabel="Как тебя зовут?"
            selectionColor={colors.accent}
            style={styles.nameInput}
          />
        ) : null}

        {step === 1 ? (
          <View style={{ gap: space.lg }}>
            <SexPicker value={draft.sex} onChange={(v) => update({ sex: v })} />
            <View style={styles.rows}>
              <NumberField label="Возраст" unit="лет" value={draft.age} onChange={(v) => update({ age: v })} error={errors.age} testID="q-age" />
              <View style={styles.rowLine} />
              <NumberField label="Рост" unit="см" value={draft.heightCm} onChange={(v) => update({ heightCm: v })} error={errors.heightCm} testID="q-height" />
              <View style={styles.rowLine} />
              <NumberField label="Текущий вес" unit="кг" decimals={1} value={draft.weightKg} onChange={(v) => update({ weightKg: v })} error={errors.weightKg} testID="q-weight" />
            </View>
            <T v="small">Нужны для расчёта калорий и нагрузки. Хранятся только на этом iPhone.</T>
          </View>
        ) : null}

        {step === 2 ? (
          <ChoiceCards<GoalType>
            items={(['bulk', 'cut', 'recomp', 'maintain'] as GoalType[]).map((g) => ({ v: g, label: g === 'bulk' ? 'Набор массы' : GOAL_SHORT[g], sub: GOAL_DESC[g], icon: GOAL_ICON[g] }))}
            value={draft.goal}
            onChange={(g) => update({ goal: g })}
          />
        ) : null}

        {step === 3 ? (
          <View style={{ gap: space.lg }}>
            <Block title="Опыт">
              <ChoiceCards compact items={LEVEL_OPTIONS.map((x) => ({ v: x.v, label: x.label, sub: x.sub }))} value={draft.level} onChange={(v) => update({ level: v })} />
            </Block>
            <Block title="Дни тренировок">
              <WeekdayChips days={draft.days} onChange={(days) => update({ days })} />
            </Block>
            <Block title="Длительность тренировки">
              <ChipChoice items={DURATION_OPTIONS.map((v) => ({ v, label: `${v} мин` }))} value={draft.sessionMinutes} onChange={(v) => update({ sessionMinutes: v })} />
            </Block>
            <Block title="Где тренируешься">
              <ChipChoice
                items={[
                  { v: 'gym' as const, label: 'Зал' },
                  { v: 'home' as const, label: 'Дома' },
                ]}
                value={draft.location}
                // Зал — стандартный набор (можно снять лишнее); дома — ничего не отмечаем за человека
                onChange={(v) => v !== draft.location && update({ location: v, equipment: v === 'gym' ? GYM_EQUIPMENT : [] })}
              />
            </Block>
            {draft.location ? (
              <Block title={draft.location === 'gym' ? 'Оборудование в зале' : 'Что есть дома'}>
                <View style={styles.wrap}>
                  {(draft.location === 'gym' ? GYM_EQUIPMENT : HOME_EQUIPMENT).map((e) => (
                    <Chip key={e} label={EQUIPMENT_LABEL[e]} active={draft.equipment.includes(e)} onPress={() => update({ equipment: draft.equipment.includes(e) ? draft.equipment.filter((x) => x !== e) : [...draft.equipment, e] })} />
                  ))}
                </View>
                {draft.location === 'home' && !draft.equipment.length ? <T v="small">Ничего нет — соберём программу с весом тела.</T> : null}
              </Block>
            ) : null}
          </View>
        ) : null}

        {step === 4 ? (
          <View style={{ gap: space.lg }}>
            <Block title="Работа и образ жизни">
              <ChoiceCards compact items={WORK_OPTIONS} value={draft.workStyle} onChange={(v) => update({ workStyle: v })} />
            </Block>
            <Block title="Шагов в день, обычно">
              <ChipChoice items={STEP_BUCKETS.map((b) => ({ v: b.steps, label: b.label }))} value={draft.stepsPerDay} onChange={(v) => update({ stepsPerDay: v })} />
            </Block>
            <Block title="Сон, обычно">
              <ChipChoice items={SLEEP_OPTIONS.map((b) => ({ v: b.hours, label: b.label }))} value={draft.sleepHours} onChange={(v) => update({ sleepHours: v })} />
            </Block>
            <Block title="Травмы и ограничения">
              <ChipChoice
                items={[
                  { v: 'none' as const, label: 'Нет' },
                  { v: 'some' as const, label: 'Есть' },
                ]}
                value={draft.limits}
                onChange={(v) => update({ limits: v })}
              />
              {draft.limits === 'some' ? (
                <PickerField label="Что учесть" category="injuries" placeholder="Например: правое плечо — больно в жиме над головой" value={draft.limitations} onChange={(t) => update({ limitations: t })} maxLength={400} hint="Такие движения не назначим. Подробности о здоровье — потом в Профиле." />
              ) : null}
            </Block>
          </View>
        ) : null}

        {step === Q_STAGES && profile && preview ? <Start name={profile.name} plan={preview.plan} target={preview.target} /> : null}
      </FadeIn>

      <View style={{ marginTop: space.xxl }}>
        {step < Q_STAGES ? (
          <Button title="Далее" size="lg" live={canNext} disabled={!canNext} onPress={() => go(step + 1)} />
        ) : (
          <Button title={`Начать с ${BRAND}`} icon="checkmark" size="lg" live disabled={!profile} onPress={finish} />
        )}
      </View>
    </Screen>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <T v="caption">{title}</T>
      {children}
    </View>
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
                {st.label === 'Бытовая активность' || st.label === 'Тренировки' ? ` (${st.note})` : ''}
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
  rows: { borderRadius: radius.lg, backgroundColor: colors.surface, paddingHorizontal: space.md },
  rowLine: { height: 0.5, backgroundColor: colors.borderStrong },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
