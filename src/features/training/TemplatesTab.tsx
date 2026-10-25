import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import type { UserTemplate, WorkoutTemplate } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, T, type IconName } from '@/components/ui';
import { Sheet } from '@/components/Sheet';
import { afterModalClose } from '@/components/modalGate';
import { confirm, toast } from '@/components/Dialog';
import { haptic } from '@/services/haptics';
import { useSchedule } from '@/stores/schedule';
import { usePlan } from '@/stores/plan';
import { useWorkouts } from '@/stores/workouts';
import { useUi } from '@/stores/ui';
import { getExercise } from '@/data/exercises';
import { BRAND } from '@/config/brand';
import { plural } from '@/utils/date';
import { WORKOUT_COLORS } from './colors';
import { estimateMinutes } from './planGenerator';
import { openCustomBuilder } from './actions';
import { startUserTemplate } from './planning';

/**
 * «Шаблоны» (эталон «Создание программы»): программа от RYNJI, свои шаблоны и «Создать с нуля». Свой шаблон —
 * начать сейчас, запланировать на день, изменить (название, цвет, упражнения) или удалить.
 */
export function TemplatesTab({ bottom }: { bottom: number }) {
  const plan = usePlan((s) => s.plan);
  const templates = useSchedule((s) => s.templates);
  const customs = useWorkouts((s) => s.customExercises);
  const [open, setOpen] = useState<UserTemplate | null>(null);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottom, gap: space.sm }} showsVerticalScrollIndicator={false}>
      {plan ? (
        <>
          <T v="h3" accessibilityRole="header">
            Программа от {BRAND}
          </T>
          <T v="small" style={{ marginTop: -4 }}>
            {plan.splitLabel} · {plan.daysPerWeek} {plural(plan.daysPerWeek, 'тренировка', 'тренировки', 'тренировок')} в неделю
          </T>
          <View style={styles.list}>
            {plan.templates.map((t, i) => (
              <ProgramRow key={t.id} t={t} last={i === plan.templates.length - 1} />
            ))}
          </View>
        </>
      ) : null}

      <T v="h3" style={{ marginTop: space.lg }} accessibilityRole="header">
        Мои шаблоны
      </T>
      {templates.length ? (
        <View style={styles.list} testID="user-templates">
          {templates.map((t, i) => (
            <Pressable
              key={t.id}
              accessibilityRole="button"
              accessibilityLabel={`Шаблон ${t.name}`}
              onPress={() => { haptic.tap(); setOpen(t); }}
              style={({ pressed }) => [styles.row, i < templates.length - 1 && styles.line, pressed && { opacity: 0.6 }]}
            >
              <View style={[styles.icon, t.color ? { backgroundColor: WORKOUT_COLORS[t.color] } : null]}>
                <Icon name="bookmark" size={16} color={t.color ? colors.onAccent : colors.textDim} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="body" style={{ fontWeight: '700' }} numberOfLines={1}>
                  {t.name}
                </T>
                <T v="small" style={{ fontSize: 13 }} numberOfLines={1}>
                  {t.exercises.length} упр. · ~{estimateMinutes(t.exercises, customs)} мин
                </T>
              </View>
              <Icon name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ))}
        </View>
      ) : (
        <T v="small" testID="user-templates-empty">
          Пока пусто. Собери тренировку и нажми «Сохранить как шаблон» — или сохрани прошлую тренировку из истории («В шаблоны»).
        </T>
      )}

      <View style={[styles.list, { marginTop: space.lg }]}>
        <Action icon="add-circle-outline" title="Создать с нуля" sub="Своя тренировка: название, цвет, упражнения" onPress={() => openCustomBuilder()} testID="templates-new" />
        <Action icon="library-outline" title="Библиотека упражнений" sub="Техника, мышцы, 3D" onPress={() => router.push('/library')} last testID="templates-library" />
      </View>

      <TemplateSheet t={open} onClose={() => setOpen(null)} />
    </ScrollView>
  );
}

function Action({ icon, title, sub, onPress, last, testID }: { icon: IconName; title: string; sub: string; onPress: () => void; last?: boolean; testID?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => { haptic.tap(); onPress(); }} style={({ pressed }) => [styles.row, !last && styles.line, pressed && { opacity: 0.6 }]} testID={testID}>
      <View style={[styles.icon, { backgroundColor: colors.accentDim }]}>
        <Icon name={icon} size={18} color={colors.accent} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body" style={{ fontWeight: '700' }}>
          {title}
        </T>
        <T v="small" style={{ fontSize: 13 }}>
          {sub}
        </T>
      </View>
      <Icon name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

/** Тренировка программы: тап — состав (упражнения, мышцы), карандаш — изменить */
function ProgramRow({ t, last }: { t: WorkoutTemplate; last: boolean }) {
  return (
    <View style={[styles.row, !last && styles.line]}>
      <Pressable style={{ flex: 1, gap: 2 }} accessibilityRole="button" accessibilityLabel={`${t.name}: состав`} onPress={() => router.push({ pathname: '/workout/preview', params: { templateId: t.id } })}>
        <T v="body" style={{ fontWeight: '700' }}>
          {t.name}
        </T>
        <T v="small" style={{ fontSize: 13 }}>
          {t.focus} · ~{t.estMinutes} мин · {t.exercises.reduce((a, e) => a + e.sets, 0)} подх.
        </T>
      </Pressable>
      <Pressable hitSlop={8} onPress={() => router.push({ pathname: '/workout/builder', params: { templateId: t.id } })} accessibilityLabel={`Изменить ${t.name}`} style={{ padding: 6 }}>
        <Icon name="create-outline" size={20} color={colors.textDim} />
      </Pressable>
    </View>
  );
}

function TemplateSheet({ t, onClose }: { t: UserTemplate | null; onClose: () => void }) {
  const customs = useWorkouts((s) => s.customExercises);
  const [last, setLast] = useState<UserTemplate | null>(null);
  if (t && t !== last) setLast(t);
  const x = t ?? last;
  if (!x) return null;
  const act = (fn: () => void) => {
    onClose();
    afterModalClose(fn);
  };
  return (
    <Sheet visible={!!t} onClose={onClose} title={x.name} subtitle={`${x.exercises.length} упр. · ~${estimateMinutes(x.exercises, customs)} мин`}>
      <View style={{ gap: space.sm }} testID="template-sheet">
        <View style={styles.exList}>
          {x.exercises.map((e, i) => (
            <T key={`${e.exerciseId}-${i}`} v="small" color={colors.text} numberOfLines={1}>
              {getExercise(e.exerciseId, customs)?.name ?? e.exerciseId}
              <T v="small">{`  ${e.sets} × ${e.repMin}–${e.repMax}${e.superset ? ' · суперсет' : ''}`}</T>
            </T>
          ))}
        </View>
        <Button title="Начать" icon="play" onPress={() => act(() => startUserTemplate(x))} testID="template-start" />
        <Button title="Запланировать" icon="calendar-outline" variant="secondary" onPress={() => act(() => useUi.getState().openHub({ prefill: { kind: 'template', id: x.id } }))} testID="template-plan" />
        <Button title="Изменить" icon="create-outline" variant="secondary" onPress={() => act(() => router.push({ pathname: '/workout/builder', params: { userTemplateId: x.id } }))} testID="template-edit" />
        <Button
          title="Удалить шаблон"
          icon="trash-outline"
          variant="ghost"
          onPress={() => confirm('Удалить шаблон?', `«${x.name}» пропадёт из шаблонов. Тренировки в истории не изменятся.`, 'Удалить', () => { useSchedule.getState().removeTemplate(x.id); toast('Шаблон удалён'); onClose(); }, true)}
        />
      </View>
    </Sheet>
  );
}

const styles = themed({
  list: { borderRadius: radius.lg, backgroundColor: colors.surface, paddingLeft: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingRight: space.md, minHeight: 60 },
  line: { borderBottomWidth: 0.5, borderBottomColor: colors.borderStrong },
  icon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  exList: { gap: 4, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
});
