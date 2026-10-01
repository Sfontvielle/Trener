import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Exercise, PlannedExercise } from '@/types';
import { colors, radius, space } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Banner, Button, EmptyState, Icon, IconButton, T } from '@/components/ui';
import { Field, NumberStepper } from '@/components/inputs';
import { confirm, toast } from '@/components/Dialog';
import { useWorkouts } from '@/stores/workouts';
import { usePlan } from '@/stores/plan';
import { getExercise, GROUP_LABEL } from '@/data/exercises';
import { ExercisePickerSheet } from '@/features/exercises/ExercisePickerSheet';
import { estimateMinutes } from '@/features/training/planGenerator';
import { startDraft } from '@/features/training/actions';

/**
 * Конструктор тренировки. Два режима:
 *  - черновик (сгенерированная / своя тренировка) → «Начать»;
 *  - templateId — редактирование шаблона плана («Мой план») → «Сохранить».
 */
export default function Builder() {
  const params = useLocalSearchParams<{ rationale?: string; templateId?: string }>();
  const draft = useWorkouts((s) => s.draft);
  const setDraft = useWorkouts((s) => s.setDraft);
  const customs = useWorkouts((s) => s.customExercises);
  const plan = usePlan((s) => s.plan);
  const template = params.templateId ? plan?.templates.find((t) => t.id === params.templateId) : undefined;
  const [tplExercises, setTplExercises] = useState<PlannedExercise[]>(() => template?.exercises.map((e) => ({ ...e })) ?? []);
  const [picker, setPicker] = useState<{ swapIdx?: number } | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const isTemplate = !!template;
  const draftExercises = draft?.exercises;
  const exercises = useMemo(() => (isTemplate ? tplExercises : draftExercises ?? []), [isTemplate, tplExercises, draftExercises]);
  const setExercises = (next: PlannedExercise[]) => {
    if (isTemplate) setTplExercises(next);
    else if (draft) setDraft({ ...draft, exercises: next });
  };
  const minutes = useMemo(() => estimateMinutes(exercises, customs), [exercises, customs]);
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const pe of exercises) {
      const ex = getExercise(pe.exerciseId, customs);
      ex?.groups.primary.forEach((g) => m.set(g, (m.get(g) ?? 0) + pe.sets));
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [exercises, customs]);

  if (!isTemplate && !draft) {
    return (
      <Screen>
        <Header title="Тренировка" />
        <EmptyState icon="document-outline" title="Черновик не найден" text="Создай тренировку через кнопку «+»." action="На главную" onAction={() => router.replace('/')} />
      </Screen>
    );
  }

  const onPick = (ex: Exercise) => {
    if (picker?.swapIdx !== undefined) {
      const next = [...exercises];
      next[picker.swapIdx] = { ...next[picker.swapIdx], exerciseId: ex.id };
      setExercises(next);
    } else {
      const [repMin, repMax] = ex.defaultReps;
      setExercises([...exercises, { exerciseId: ex.id, sets: 3, repMin, repMax, targetRir: 2, restSec: ex.mechanic === 'compound' ? 120 : 75 }]);
      toast(`Добавлено: ${ex.name}`, 'add-circle');
    }
    setPicker(null);
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
      {params.rationale && !isTemplate ? (
        <View style={{ marginBottom: space.md }}>
          <Banner tone="accent" icon="sparkles" text={String(params.rationale)} />
        </View>
      ) : null}
      {groups.length ? (
        <T v="small" style={{ marginBottom: space.md }}>
          Нагрузка: {groups.map(([g, n]) => `${GROUP_LABEL[g]} ${n}`).join(' · ')}
        </T>
      ) : null}

      <View style={{ gap: 10 }}>
        {exercises.map((pe, i) => {
          const ex = getExercise(pe.exerciseId, customs);
          const open = expanded === i;
          return (
            <View key={`${pe.exerciseId}-${i}`} style={styles.item}>
              <Pressable style={styles.itemHead} onPress={() => setExpanded(open ? null : i)} accessibilityRole="button" accessibilityLabel={`${ex?.name}, изменить`}>
                <View style={styles.idx}>
                  <T v="small" style={{ fontWeight: '800' }}>
                    {i + 1}
                  </T>
                </View>
                <View style={{ flex: 1 }}>
                  <T v="body" style={{ fontWeight: '700' }} numberOfLines={2}>
                    {ex?.name ?? pe.exerciseId}
                  </T>
                  <T v="small">
                    {pe.sets} × {pe.repMin}–{pe.repMax} · RIR {pe.targetRir}
                  </T>
                </View>
                <Icon name={open ? 'chevron-up' : 'create-outline'} size={18} color={colors.muted} />
              </Pressable>
              {open ? (
                <View style={{ gap: 10, marginTop: 10 }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <NumberStepper compact label="Подходы" value={pe.sets} onChange={(v) => patch(i, { sets: Math.round(v) })} min={1} max={10} style={{ flex: 1 }} />
                    <NumberStepper compact label="RIR" value={pe.targetRir} onChange={(v) => patch(i, { targetRir: Math.round(v) })} min={0} max={5} style={{ flex: 1 }} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <NumberStepper compact label="Повт. от" value={pe.repMin} onChange={(v) => patch(i, { repMin: Math.round(v), repMax: Math.max(pe.repMax, Math.round(v)) })} min={1} max={60} style={{ flex: 1 }} />
                    <NumberStepper compact label="до" value={pe.repMax} onChange={(v) => patch(i, { repMax: Math.round(v), repMin: Math.min(pe.repMin, Math.round(v)) })} min={1} max={60} style={{ flex: 1 }} />
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

const styles = StyleSheet.create({
  item: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: 12 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  idx: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
});
