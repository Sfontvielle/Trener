import React, { useMemo, useState } from 'react';
import { guardExercise } from '@/features/training/prefActions';
import { DEFAULT_SETS } from '@/features/training/session';
import { Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Exercise, PlannedExercise } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Button, EmptyState, Icon, IconButton, T } from '@/components/ui';
import { ExerciseLoop } from '@/features/exercises/ExerciseThumb';
import { Field, NumberStepper } from '@/components/inputs';
import { confirm, toast } from '@/components/Dialog';
import { useWorkouts } from '@/stores/workouts';
import { usePlan } from '@/stores/plan';
import { getExercise, GROUP_LABEL } from '@/data/exercises';
import { ExercisePickerSheet } from '@/features/exercises/ExercisePickerSheet';
import { estimateMinutes } from '@/features/training/planGenerator';
import { useProfile } from '@/stores/profile';
import { getPrefs } from '@/features/training/engine/prefs';
import { analyzeWorkout, suggestOrder } from '@/features/training/engine/order';
import { weeklyTargets } from '@/features/training/engine/volume';
import { startDraft } from '@/features/training/actions';
import { normalizeSupersets, supersetLabels, toggleLinkAfter } from '@/features/training/workoutNav';
import { isTimed } from '@/features/training/journal';
import { fmtSec } from '@/utils/format';
import { haptic } from '@/services/haptics';

/**
 * Конструктор тренировки. Два режима:
 *  - черновик (сгенерированная / своя тренировка) → «Начать»;
 *  - templateId — редактирование шаблона плана («Мой план») → «Сохранить».
 */
export default function Builder() {
  const params = useLocalSearchParams<{ templateId?: string }>();
  const draft = useWorkouts((s) => s.draft);
  const setDraft = useWorkouts((s) => s.setDraft);
  const customs = useWorkouts((s) => s.customExercises);
  const plan = usePlan((s) => s.plan);
  const template = params.templateId ? plan?.templates.find((t) => t.id === params.templateId) : undefined;
  const [tplExercises, setTplExercises] = useState<PlannedExercise[]>(() => template?.exercises.map((e) => ({ ...e })) ?? []);
  const [picker, setPicker] = useState<{ swapIdx?: number } | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [keptOrder, setKeptOrder] = useState<string | null>(null);
  const [whyOrder, setWhyOrder] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const profile = useProfile((s) => s.profile);
  const sessions = useWorkouts((s) => s.sessions);

  const isTemplate = !!template;
  const draftExercises = draft?.exercises;
  const exercises = useMemo(() => (isTemplate ? tplExercises : draftExercises ?? []), [isTemplate, tplExercises, draftExercises]);
  // Суперсеты держатся только у соседних упражнений: после любой перестановки ключи нормализуются
  const setExercises = (list: PlannedExercise[]) => {
    const next = normalizeSupersets(list);
    if (isTemplate) setTplExercises(next);
    else if (draft) setDraft({ ...draft, exercises: next });
  };
  const ssLabels = supersetLabels(exercises);
  const minutes = useMemo(() => estimateMinutes(exercises, customs), [exercises, customs]);
  const prefs = useMemo(() => (profile ? getPrefs(profile) : null), [profile]);
  // Оптимизатор порядка: предлагает, но не переставляет без согласия
  const orderSig = exercises.map((e) => e.exerciseId).join('|');
  const recFactor = plan?.recovery?.factor ?? 1;
  const order = useMemo(() => (prefs && exercises.length >= 2 ? suggestOrder(exercises, prefs.priorityMuscles, customs) : null), [exercises, prefs, customs]);
  const issues = useMemo(
    () => (profile && prefs ? analyzeWorkout({ list: exercises, profile, prefs, sessions, weeklyTargets: weeklyTargets(profile, prefs, recFactor), customs }) : []),
    [exercises, profile, prefs, sessions, customs, recFactor],
  );
  const visibleIssues = issues.filter((i) => !hidden.includes(i.id));

  if (!isTemplate && !draft) {
    return (
      <Screen>
        <Header title="Тренировка" />
        <EmptyState icon="document-outline" title="Черновик не найден" text="Создай тренировку через кнопку «+»." action="На главную" onAction={() => router.replace('/')} />
      </Screen>
    );
  }

  const onPick = (picked: Exercise) => {
    const swapIdx = picker?.swapIdx;
    setPicker(null);
    // Конфликт с ограничением из профиля — объяснение и безопасная альтернатива, а не молчаливое добавление
    guardExercise(
      picked,
      (ex) => {
        if (swapIdx !== undefined) {
          const next = [...exercises];
          next[swapIdx] = { ...next[swapIdx], exerciseId: ex.id };
          setExercises(next);
        } else {
          const [repMin, repMax] = ex.defaultReps;
          setExercises([...exercises, { exerciseId: ex.id, sets: DEFAULT_SETS, repMin, repMax, targetRir: 2, restSec: ex.mechanic === 'compound' ? 120 : 75 }]);
          toast(`Добавлено: ${ex.name}`, 'add-circle');
        }
      },
      customs,
    );
  };
  const patch = (i: number, p: Partial<PlannedExercise>) => setExercises(exercises.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= exercises.length) return;
    const next = [...exercises];
    [next[i], next[j]] = [next[j], next[i]];
    setExercises(next);
  };

  const saveTemplate = () => {
    if (!template) return;
    const t = { ...template, exercises: tplExercises, estMinutes: estimateMinutes(tplExercises, customs) };
    usePlan.getState().updateTemplate(t);
    usePlan.getState().addAdjustment({ kind: 'volume', summary: `Шаблон «${t.name}» изменён вручную`, source: 'user' });
    toast('Шаблон сохранён');
    router.back();
  };

  return (
    <Screen keyboard>
      <Header
        title={isTemplate ? `Шаблон: ${template!.name}` : draft!.source === 'custom' ? 'Своя тренировка' : draft!.name}
        subtitle={`~${minutes} мин · ${exercises.length} упр · ${exercises.reduce((a, e) => a + e.sets, 0)} подходов`}
        right={
          !isTemplate ? (
            <IconButton
              name="trash-outline"
              label="Удалить черновик"
              onPress={() => confirm('Удалить черновик?', 'Собранная тренировка будет удалена.', 'Удалить', () => { setDraft(null); router.back(); }, true)}
            />
          ) : undefined
        }
      />
      {!isTemplate && draft!.source === 'custom' ? (
        <Field placeholder="Название (необязательно)" value={draft!.name === 'Своя тренировка' ? '' : draft!.name} onChangeText={(t) => setDraft({ ...draft!, name: t || 'Своя тренировка' })} style={{ marginBottom: space.md }} />
      ) : null}
      {order?.changed && keptOrder !== orderSig ? (
        <View style={styles.suggest}>
          <Icon name="swap-vertical" size={16} color={colors.accent} />
          <Pressable style={{ flex: 1 }} hitSlop={6} onPress={() => setWhyOrder(!whyOrder)} accessibilityRole="button" accessibilityLabel="Порядок можно улучшить, почему">
            <T v="small" color={colors.text}>
              Порядок можно улучшить
            </T>
            {whyOrder ? <T v="small" style={{ fontSize: 12 }}>{order.why}</T> : null}
          </Pressable>
          <Pressable hitSlop={8} onPress={() => { setExercises(order.order); toast('Порядок обновлён'); }} accessibilityRole="button">
            <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
              Применить
            </T>
          </Pressable>
          <Pressable hitSlop={8} onPress={() => setKeptOrder(orderSig)} accessibilityRole="button" accessibilityLabel="Оставить мой порядок">
            <Icon name="close" size={16} color={colors.muted} />
          </Pressable>
        </View>
      ) : null}
      {visibleIssues.map((it) => (
        <View key={it.id} style={[styles.issue, it.level === 'danger' && { borderColor: colors.danger }, it.level === 'warning' && { borderColor: colors.warningLine }]}>
          <Icon name={it.level === 'danger' ? 'alert-circle' : it.level === 'warning' ? 'warning-outline' : 'information-circle-outline'} size={18} color={it.level === 'danger' ? colors.danger : it.level === 'warning' ? colors.warning : colors.textDim} />
          <View style={{ flex: 1, gap: 6 }}>
            <T v="small" color={colors.text}>
              {it.text}
            </T>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              {it.fix ? (
                <Pressable hitSlop={6} onPress={() => { setExercises(it.fix!(exercises)); toast('Исправлено'); }} accessibilityRole="button">
                  <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
                    {it.fixLabel ?? 'Исправить'}
                  </T>
                </Pressable>
              ) : null}
              <Pressable hitSlop={6} onPress={() => setHidden([...hidden, it.id])} accessibilityRole="button">
                <T v="small" style={{ fontWeight: '700' }}>
                  Оставить
                </T>
              </Pressable>
            </View>
          </View>
        </View>
      ))}

      <View style={{ gap: 10 }}>
        {exercises.map((pe, i) => {
          const ex = getExercise(pe.exerciseId, customs);
          const open = expanded === i;
          const timed = isTimed(ex);
          const range = timed ? `${fmtSec(pe.repMin)}–${fmtSec(pe.repMax)}` : `${pe.repMin}–${pe.repMax}`;
          const linked = !!pe.superset && pe.superset === exercises[i + 1]?.superset;
          return (
            <React.Fragment key={`${pe.exerciseId}-${i}`}>
            <View style={[styles.item, !!ssLabels[i] && { borderColor: colors.accentLine }]}>
              <View style={styles.itemHead}>
                {/* «Гифка» упражнения: тап — техника */}
                <Pressable accessibilityRole="button" accessibilityLabel={`Техника: ${ex?.name ?? ''}`} onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: pe.exerciseId } })} hitSlop={4}>
                  {ex ? <ExerciseLoop ex={ex} size={60} delay={i * 180} /> : null}
                  {ssLabels[i] ? (
                    <View style={styles.ss}>
                      <T v="small" style={{ fontWeight: '800', fontSize: 10 }} color={colors.onAccent}>
                        {ssLabels[i]}
                      </T>
                    </View>
                  ) : null}
                </Pressable>
                <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }} onPress={() => setExpanded(open ? null : i)} accessibilityRole="button" accessibilityLabel={`${ex?.name}, изменить`}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="body" style={{ fontWeight: '700' }} numberOfLines={2}>
                      {ex?.name ?? pe.exerciseId}
                    </T>
                    {ex ? (
                      <T v="small" numberOfLines={1} style={{ fontSize: 12 }}>
                        {ex.groups.primary.map((g) => GROUP_LABEL[g]).join(', ')}
                      </T>
                    ) : null}
                    <T v="small" color={colors.text} style={{ fontVariant: ['tabular-nums'] }}>
                      {pe.sets} × {range}
                    </T>
                  </View>
                  <Icon name={open ? 'chevron-up' : 'create-outline'} size={18} color={colors.muted} />
                </Pressable>
              </View>
              {open ? (
                <View style={{ gap: 10, marginTop: 10 }}>
                  {pe.why ? (
                    <T v="small" style={{ fontSize: 12 }}>
                      Почему: {pe.why}
                    </T>
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <NumberStepper compact label="Подходы" value={pe.sets} onChange={(v) => patch(i, { sets: Math.round(v) })} min={1} max={10} style={{ flex: 1 }} />
                    <NumberStepper compact label="RIR" value={pe.targetRir} onChange={(v) => patch(i, { targetRir: Math.round(v) })} min={0} max={5} style={{ flex: 1 }} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <NumberStepper compact label={timed ? 'Сек от' : 'Повт. от'} value={pe.repMin} onChange={(v) => patch(i, { repMin: Math.round(v), repMax: Math.max(pe.repMax, Math.round(v)) })} min={timed ? 5 : 1} max={timed ? 600 : 60} step={timed ? 5 : 1} style={{ flex: 1 }} />
                    <NumberStepper compact label="до" value={pe.repMax} onChange={(v) => patch(i, { repMax: Math.round(v), repMin: Math.min(pe.repMin, Math.round(v)) })} min={timed ? 5 : 1} max={timed ? 600 : 60} step={timed ? 5 : 1} style={{ flex: 1 }} />
                  </View>
                  <NumberStepper compact label="Отдых, сек" value={pe.restSec} onChange={(v) => patch(i, { restSec: Math.round(v) })} step={15} min={15} max={600} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <IconButton name="arrow-up" label="Выше" onPress={() => move(i, -1)} disabled={i === 0} />
                    <IconButton name="arrow-down" label="Ниже" onPress={() => move(i, 1)} disabled={i === exercises.length - 1} />
                    <IconButton name="information-circle-outline" label="Техника" onPress={() => router.push({ pathname: '/exercise/[id]', params: { id: pe.exerciseId } })} />
                    <Button title="Заменить" icon="swap-horizontal" size="sm" variant="secondary" onPress={() => setPicker({ swapIdx: i })} style={{ flex: 1, height: 44 }} />
                    <IconButton name="trash-outline" label="Удалить" color={colors.danger} onPress={() => { setExercises(exercises.filter((_, j) => j !== i)); setExpanded(null); }} />
                  </View>
                </View>
              ) : null}
            </View>
            {i < exercises.length - 1 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={linked ? `Разъединить суперсет: ${ex?.name ?? ''}` : `Суперсет со следующим: ${ex?.name ?? ''}`}
                onPress={() => { haptic.tap(); setExercises(toggleLinkAfter(exercises, i)); }}
                hitSlop={4}
                style={[styles.link, linked && styles.linkOn]}
              >
                <Icon name={linked ? 'link' : 'link-outline'} size={14} color={linked ? colors.onAccent : colors.muted} />
                {/* Без суперсета — только значок связи (подпись — для VoiceOver), чтобы не шуметь между упражнениями */}
                {linked ? (
                  <T v="small" style={{ fontSize: 11, fontWeight: '800' }} color={colors.onAccent}>
                    Суперсет
                  </T>
                ) : null}
              </Pressable>
            ) : null}
            </React.Fragment>
          );
        })}
      </View>
      {exercises.length === 0 ? <EmptyState icon="add-circle-outline" title="Добавь упражнения" text="Выбери из библиотеки — подходы и повторы можно настроить." /> : null}
      <Button title="Добавить упражнение" icon="add" variant="secondary" onPress={() => setPicker({})} style={{ marginTop: space.md }} />
      {isTemplate ? (
        <Button title="Сохранить шаблон" icon="checkmark" size="lg" onPress={saveTemplate} disabled={!exercises.length} style={{ marginTop: space.lg }} />
      ) : (
        <Button title="Начать тренировку" icon="play" size="lg" onPress={() => draft && startDraft(draft)} disabled={!exercises.length} style={{ marginTop: space.lg }} />
      )}

      <ExercisePickerSheet visible={!!picker} onClose={() => setPicker(null)} onPick={onPick} title={picker?.swapIdx !== undefined ? 'Заменить на…' : 'Добавить упражнение'} excludeIds={exercises.map((e) => e.exerciseId)} />
    </Screen>
  );
}

const styles = themed({
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 12 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.md, paddingVertical: 10, borderRadius: radius.lg, backgroundColor: colors.surface, marginBottom: space.md },
  ss: { position: 'absolute', top: -4, left: -4, minWidth: 20, height: 20, paddingHorizontal: 4, borderRadius: 10, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  issue: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, marginBottom: 8 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', paddingHorizontal: 10, height: 26, marginVertical: -4, borderRadius: 13, backgroundColor: colors.bg },
  linkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
