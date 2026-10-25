import React, { useEffect, useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';
import type { Equipment, GoalType } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Screen } from '@/components/Screen';
import { Button, Chip, T } from '@/components/ui';
import { Ambient, FadeIn } from '@/components/motion';
import { Wheel } from '@/components/WheelPicker';
import { RulerPicker } from '@/components/RulerPicker';
import { ChoiceCard, Dropdown, FrequencyPicker, SexCards, StageHeader, StageTitle } from '@/features/onboarding/parts';
import { PlanReady } from '@/features/onboarding/PlanReady';
import {
  ACTIVITY_OPTIONS,
  DIET_OPTIONS,
  DURATION_OPTIONS,
  EQUIPMENT_CHOICES,
  LEVEL_OPTIONS,
  LOCATION_OPTIONS,
  Q_STAGES,
  RANGE,
  SLEEP_OPTIONS,
  draftErrors,
  draftToProfile,
  resumeStage,
  type QDraft,
} from '@/features/profile/questionnaire';
import { nameFromApple } from '@/features/account/route';
import { connectHealth } from '@/features/health/sync';
import { useProfile } from '@/stores/profile';
import { useAccount } from '@/stores/account';
import { useQuestionnaire } from '@/stores/questionnaire';
import { applyProfile } from '@/features/profile/applyProfile';
import { EQUIPMENT_LABEL } from '@/data/exercises';
import { haptic } from '@/services/haptics';

/**
 * Анкета — 5 логических этапов по эталонам onboarding/02–06; длинные этапы разбиты на внутренние страницы
 * (полоса и «N из 5» остаются этапом): 1 имя · 2 пол → возраст → рост → вес · 3 цель · 4 опыт → раз в неделю →
 * длительность → место (→ что есть, если не зал) · 5 образ жизни. Затем «Анализируем → Создаём план → Твой план готов!».
 * Ничего не подставляем: пока ответа нет, «Продолжить» недоступна. Каждый ответ сразу в черновике — после закрытия
 * приложения анкета продолжается с того же места. Целевой вес, срок и темп не спрашиваем.
 */
type Page = 'name' | 'sex' | 'age' | 'height' | 'weight' | 'goal' | 'level' | 'freq' | 'duration' | 'place' | 'equipment' | 'lifestyle';

const needsEquipment = (d: QDraft) => d.location === 'home' || d.location === 'outdoor';
const pagesOf = (stage: number, d: QDraft): Page[] =>
  [['name'], ['sex', 'age', 'height', 'weight'], ['goal'], ['level', 'freq', 'duration', 'place', ...(needsEquipment(d) ? (['equipment'] as Page[]) : [])], ['lifestyle']][stage] as Page[];

function pageDone(p: Page, d: QDraft): boolean {
  const err = draftErrors(d);
  switch (p) {
    case 'name':
      return d.name.trim().length > 0;
    case 'sex':
      return !!d.sex;
    case 'age':
      return d.age !== undefined && !err.age;
    case 'height':
      return d.heightCm !== undefined && !err.heightCm;
    case 'weight':
      return d.weightKg !== undefined && !err.weightKg;
    case 'goal':
      return !!d.goal;
    case 'level':
      return !!d.level;
    case 'freq':
      return d.daysPerWeek !== undefined;
    case 'duration':
      return !!d.sessionMinutes;
    case 'place':
      return !!d.location && (needsEquipment(d) || d.equipment.length > 0);
    case 'equipment':
      return true;
    case 'lifestyle':
      return !!d.activity && d.sleepHours !== undefined && !!d.diet;
  }
}
/** Первая неотвеченная страница этапа (после перезапуска) */
const firstOpen = (stage: number, d: QDraft) => Math.max(0, pagesOf(stage, d).findIndex((p) => !pageDone(p, d)));

const GOALS: { v: GoalType; label: string; sub: string; image: number }[] = [
  { v: 'bulk', label: 'Набор массы', sub: 'Увеличить мышечную массу', image: require('../../assets/art/goal_bulk.webp') },
  { v: 'cut', label: 'Сушка', sub: 'Снизить процент жира', image: require('../../assets/art/goal_cut.webp') },
  { v: 'recomp', label: 'Рекомпозиция', sub: 'Улучшить состав тела', image: require('../../assets/art/goal_recomp.webp') },
  { v: 'maintain', label: 'Поддержание', sub: 'Сохранить текущую форму', image: require('../../assets/art/goal_maintain.webp') },
];
const AGES = Array.from({ length: 90 - 14 + 1 }, (_, i) => 14 + i);

export default function Onboarding() {
  const draft = useQuestionnaire((s) => s.draft);
  const update = useQuestionnaire((s) => s.update);
  const [stage, setStageState] = useState(() => resumeStage(useQuestionnaire.getState().draft, useQuestionnaire.getState().stage));
  const [page, setPage] = useState(() => (stage < Q_STAGES ? firstOpen(stage, useQuestionnaire.getState().draft) : 0));
  const setStage = (n: number, p = 0) => {
    setStageState(n);
    setPage(p);
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

  const pages = stage < Q_STAGES ? pagesOf(stage, draft) : [];
  const cur = pages[Math.min(page, pages.length - 1)];
  const canNext = !!cur && pageDone(cur, draft);
  const profile = useMemo(() => (stage === Q_STAGES ? draftToProfile(draft, 0) : null), [stage, draft]);

  const next = () => {
    if (!canNext) return;
    haptic.tap();
    if (page < pages.length - 1) setPage(page + 1);
    else setStage(stage + 1);
  };
  const back = () => {
    haptic.tap();
    if (page > 0) setPage(page - 1);
    else if (stage > 0) setStage(stage - 1, pagesOf(stage - 1, draft).length - 1);
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

  if (stage === Q_STAGES) {
    return (
      <Screen>
        <Ambient tone="calm" height={520} />
        <PlanReady profile={profile} onStart={finish} onBack={() => setStage(Q_STAGES - 1, 0)} />
      </Screen>
    );
  }

  const progress = (stage + (page + 1) / pages.length) / Q_STAGES;
  const err = draftErrors(draft);

  return (
    <Screen keyboard contentStyle={cur === 'name' ? undefined : { flexGrow: 1 }}>
      <Ambient tone="calm" height={520} />
      <StageHeader stage={stage + 1} total={Q_STAGES} progress={progress} onBack={stage > 0 || page > 0 ? back : undefined} />

      <FadeIn key={`${stage}-${page}`} from={14} style={{ gap: space.xl, marginTop: space.xl, flex: 1 }}>
        {cur === 'name' ? (
          <>
            <StageTitle title="Как тебя зовут?" sub="Так я буду к тебе обращаться" />
            <TextInput
              value={draft.name}
              onChangeText={(t) => update({ name: t })}
              placeholder="Введите имя"
              placeholderTextColor={colors.muted}
              autoFocus={!draft.name}
              returnKeyType="next"
              onSubmitEditing={next}
              maxLength={40}
              accessibilityLabel="Как тебя зовут?"
              selectionColor={colors.accent}
              style={styles.nameInput}
            />
          </>
        ) : null}

        {cur === 'sex' ? (
          <>
            <StageTitle title="Твой пол?" />
            <View style={{ marginTop: space.lg }}>
              <SexCards value={draft.sex} onChange={(v) => update({ sex: v })} />
            </View>
          </>
        ) : null}

        {cur === 'age' ? (
          <>
            <StageTitle title="Сколько тебе лет?" sub="Только для пользователей 18+" />
            <View style={{ alignItems: 'center', gap: space.md }}>
              <Wheel label="Возраст" values={AGES} value={draft.age ?? 18} onChange={(v) => update({ age: v })} format={(v) => (v === (draft.age ?? -1) ? `${v} лет` : String(v))} width={240} testID="q-age-wheel" />
              <View style={styles.manual}>
                <T v="small" color={colors.textDim}>
                  или введи:
                </T>
                <TextInput
                  value={draft.age === undefined ? '' : String(draft.age)}
                  onChangeText={(t) => {
                    const n = parseInt(t.replace(/\D/g, ''), 10);
                    update({ age: Number.isFinite(n) ? n : undefined });
                  }}
                  placeholder="—"
                  placeholderTextColor={colors.muted}
                  keyboardType="number-pad"
                  maxLength={2}
                  accessibilityLabel="Возраст, лет"
                  selectionColor={colors.accent}
                  style={styles.manualInput}
                />
                <T v="small" color={colors.textDim}>
                  лет
                </T>
              </View>
              {err.age ? (
                <T v="small" color={colors.danger} style={{ textAlign: 'center' }}>
                  {err.age}
                </T>
              ) : draft.age === undefined ? (
                <T v="small" style={{ textAlign: 'center' }}>
                  Прокрути колесо или введи число
                </T>
              ) : null}
            </View>
          </>
        ) : null}

        {cur === 'height' ? (
          <>
            <StageTitle title="Какой у тебя рост?" />
            <RulerPicker label="Рост" unit="см" value={draft.heightCm} onChange={(v) => update({ heightCm: v })} min={RANGE.heightCm[0]} max={RANGE.heightCm[1]} start={draft.sex === 'female' ? 165 : 178} testID="q-height" />
            {err.heightCm ? (
              <T v="small" color={colors.danger} style={{ textAlign: 'center' }}>
                {err.heightCm}
              </T>
            ) : null}
          </>
        ) : null}

        {cur === 'weight' ? (
          <>
            <StageTitle title="Сколько ты весишь?" />
            <RulerPicker label="Текущий вес" unit="кг" value={draft.weightKg} onChange={(v) => update({ weightKg: v })} min={RANGE.weightKg[0]} max={RANGE.weightKg[1]} start={draft.sex === 'female' ? 62 : 78} step={0.1} decimals={1} testID="q-weight" />
            {err.weightKg ? (
              <T v="small" color={colors.danger} style={{ textAlign: 'center' }}>
                {err.weightKg}
              </T>
            ) : (
              <T v="small" style={{ textAlign: 'center' }}>
                Нужны для расчёта калорий и нагрузки. Хранятся только на этом iPhone.
              </T>
            )}
          </>
        ) : null}

        {cur === 'goal' ? (
          <>
            <StageTitle title="Твоя цель?" />
            <View style={{ gap: 14 }}>
              {GOALS.map((g) => (
                <ChoiceCard key={g.v} tall title={g.label} sub={g.sub} image={g.image} active={draft.goal === g.v} onPress={() => update({ goal: g.v })} />
              ))}
            </View>
          </>
        ) : null}

        {cur === 'level' ? (
          <>
            <StageTitle title="Опыт тренировок?" />
            <View style={{ gap: 14 }}>
              {LEVEL_OPTIONS.map((l) => (
                <ChoiceCard key={l.v} tall title={l.label} sub={l.sub} active={draft.level === l.v} onPress={() => update({ level: l.v })} />
              ))}
            </View>
          </>
        ) : null}

        {cur === 'freq' ? (
          <>
            <StageTitle title="Сколько раз в неделю планируешь тренироваться?" />
            <View style={{ marginTop: space.lg }}>
              <FrequencyPicker value={draft.daysPerWeek} onChange={(v) => update({ daysPerWeek: v })} />
            </View>
          </>
        ) : null}

        {cur === 'duration' ? (
          <>
            <StageTitle title="Сколько времени готов уделять одной тренировке?" />
            <View style={{ gap: 14 }}>
              {DURATION_OPTIONS.map((m) => (
                <ChoiceCard key={m} title={`${m} минут`} active={draft.sessionMinutes === m} onPress={() => update({ sessionMinutes: m })} />
              ))}
            </View>
          </>
        ) : null}

        {cur === 'place' ? (
          <>
            <StageTitle title="Где планируешь тренироваться?" />
            <View style={{ gap: 14 }}>
              {LOCATION_OPTIONS.map((l) => (
                <ChoiceCard
                  key={l.v}
                  title={l.label}
                  icon={l.icon as React.ComponentProps<typeof ChoiceCard>['icon']}
                  active={draft.location === l.v}
                  // зал — стандартный набор (лишнее можно снять в Профиле); дома и на улице ничего не отмечаем за человека
                  onPress={() => l.v !== draft.location && update({ location: l.v, equipment: [...l.equipment] })}
                />
              ))}
            </View>
          </>
        ) : null}

        {cur === 'equipment' ? (
          <>
            <StageTitle title={draft.location === 'outdoor' ? 'Что есть на площадке?' : 'Что есть дома?'} sub="Отметь всё, чем можешь пользоваться" />
            <View style={styles.wrap}>
              {(EQUIPMENT_CHOICES[draft.location!] ?? []).map((e: Equipment) => (
                <Chip key={e} label={EQUIPMENT_LABEL[e]} active={draft.equipment.includes(e)} onPress={() => update({ equipment: draft.equipment.includes(e) ? draft.equipment.filter((x) => x !== e) : [...draft.equipment, e] })} />
              ))}
            </View>
            <T v="small" style={{ textAlign: 'center' }}>
              {draft.equipment.length ? 'Подберу упражнения под это оборудование.' : 'Ничего нет — соберу программу с весом тела.'}
            </T>
          </>
        ) : null}

        {cur === 'lifestyle' ? <Lifestyle draft={draft} update={update} /> : null}
      </FadeIn>

      {/* как на эталонах — главная кнопка внизу экрана; на странице имени — сразу под полем (над клавиатурой) */}
      <View style={{ marginTop: space.xxl }}>
        <Button title={cur === 'lifestyle' ? 'Завершить анкету' : 'Продолжить'} size="lg" live={canNext} disabled={!canNext} onPress={next} />
      </View>
    </Screen>
  );
}

/** Этап 5 (эталон 06_lifestyle): три выпадающих списка, «Дополнительно» и Apple Health по желанию */
function Lifestyle({ draft, update }: { draft: QDraft; update: (p: Partial<QDraft>) => void }) {
  const [health, setHealth] = useState<string | null>(null);
  return (
    <View style={{ gap: space.lg }}>
      <StageTitle title="Расскажи о своём образе жизни" />
      <Dropdown
        label="Уровень повседневной активности"
        value={draft.activity}
        options={ACTIVITY_OPTIONS.map((a) => ({ v: a.v, label: a.label, sub: a.sub }))}
        onChange={(v) => {
          const a = ACTIVITY_OPTIONS.find((x) => x.v === v)!;
          update({ activity: v, workStyle: a.workStyle, stepsPerDay: a.steps });
        }}
        testID="q-activity"
      />
      <Dropdown label="Сколько ты спишь?" value={draft.sleepHours} options={SLEEP_OPTIONS.map((s) => ({ v: s.hours, label: s.label.replace(' ч', ' часов').replace('ч+', 'часов и больше') }))} onChange={(v) => update({ sleepHours: v })} testID="q-sleep" />
      <Dropdown label="Есть ли ограничения в питании?" value={draft.diet} options={DIET_OPTIONS} onChange={(v) => update({ diet: v })} testID="q-diet" />
      <View style={{ gap: 10 }}>
        <T v="body" style={{ fontWeight: '700', fontSize: 16 }}>
          Дополнительно (необязательно)
        </T>
        <TextInput
          value={draft.limitations}
          onChangeText={(t) => update({ limitations: t })}
          placeholder="Аллергии, травмы, особенности и т.д."
          placeholderTextColor={colors.muted}
          multiline
          maxLength={400}
          accessibilityLabel="Дополнительно: аллергии, травмы, особенности"
          selectionColor={colors.accent}
          style={styles.area}
        />
      </View>
      <View style={styles.healthRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="body" style={{ fontWeight: '700' }}>
            Apple Health
          </T>
          <T v="small">{health ?? 'Необязательно: шаги и сон будут подтягиваться сами'}</T>
        </View>
        <Button
          title="Подключить"
          size="sm"
          variant="secondary"
          onPress={async () => {
            const r = await connectHealth();
            setHealth(r.message);
          }}
        />
      </View>
    </View>
  );
}

const styles = themed({
  nameInput: { fontSize: 18, color: colors.text, height: 62, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  manual: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  manualInput: { fontSize: 18, fontWeight: '700', color: colors.text, width: 56, height: 40, textAlign: 'center', borderRadius: radius.sm, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, padding: 0 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  area: { minHeight: 96, fontSize: 16, color: colors.text, padding: 16, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, textAlignVertical: 'top' },
  healthRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.md, backgroundColor: colors.surface2 },
});
