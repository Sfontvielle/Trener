import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { Macros, NutritionTarget, ReadinessResult, WorkoutSession, WorkoutTemplate, PlannedWorkout, FoodEntry } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Button, Icon, T, elevation } from '@/components/ui';
import { Group, ListRow, Scale } from '@/components/ds';
import { Ring } from '@/components/charts';
import { MacroSummary } from '@/features/nutrition/diary';
import { GROUP_LABEL } from '@/data/exercises';
import { readinessLabel } from '@/features/science/insights';
import { formatDayLong, formatSleep, relativeDay } from '@/utils/date';
import { fmtValue } from '@/utils/format';
import { haptic } from '@/services/haptics';
import { BRAND } from '@/config/brand';

/**
 * Главная «Сегодня» (макет 01-home, SCREEN_BLUEPRINTS ★1): одна карточка тренировки, коротко питание, активность и
 * восстановление одной группой. Без дублей: калории — только здесь и в «Питании», вес — в «Прогрессе», вода — в «Питании».
 */

const lower = (s: string, i: number) => (i === 0 ? s : s.toLowerCase());
/** «Ягодицы, бицепс бедра, квадрицепс и икры» */
export function musclesText(groups: string[]): string {
  const names = groups.map((g) => GROUP_LABEL[g] ?? g).map(lower);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`;
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.metric}>
      <T v="metric">{value}</T>
      <T v="footnote">{label}</T>
    </View>
  );
}

export type WorkoutCardState =
  | { kind: 'active'; session: WorkoutSession }
  | { kind: 'workout'; template: WorkoutTemplate; minutes: number; sets: number; label: string; coachRest?: boolean; onStart: () => void }
  | { kind: 'planned'; planned: PlannedWorkout; minutes: number; onStart: () => void }
  | { kind: 'done'; session: WorkoutSession; minutes?: number; sets?: number; prs?: number; next?: { date: string; template: WorkoutTemplate } }
  | { kind: 'rest'; reason?: string; next?: { date: string; template: WorkoutTemplate } }
  | { kind: 'no_plan' };

/** Главное на сегодня — одна карточка и одно действие */
export function WorkoutCard({ state, onResume }: { state: WorkoutCardState; onResume: () => void }) {
  const next = (n?: { date: string; template: WorkoutTemplate }) =>
    n ? (
      <Pressable accessibilityRole="button" accessibilityLabel={`Ближайшая: ${n.template.name}, ${relativeDay(n.date).toLowerCase()}. Состав`} onPress={() => router.push({ pathname: '/workout/preview', params: { templateId: n.template.id } })} style={({ pressed }) => [styles.next, pressed && { opacity: 0.6 }]} hitSlop={6}>
        <T v="callout" style={{ flex: 1 }}>
          Ближайшая: <T v="callout" color={colors.text}>{n.template.name}</T>, {relativeDay(n.date).toLowerCase()}
        </T>
        <Icon name="chevron-forward" size={16} color={colors.muted} />
      </Pressable>
    ) : null;

  if (state.kind === 'active') {
    const s = state.session;
    const doneEx = s.exercises.filter((e) => e.sets.length > 0 && e.sets.every((x) => x.done)).length;
    return (
      <View style={[styles.card, elevation()]} testID="coach-today">
        <T v="footnote">Идёт тренировка</T>
        <T v="title2">{s.name}</T>
        <T v="callout" style={{ marginBottom: space.md }}>
          Выполнено {doneEx} из {s.exercises.length} {s.exercises.length === 1 ? 'упражнения' : 'упражнений'}
        </T>
        <Button title="Продолжить тренировку" icon="play" size="lg" full onPress={onResume} />
      </View>
    );
  }
  if (state.kind === 'workout' || state.kind === 'planned') {
    const t = state.kind === 'workout' ? state.template : null;
    const name = t ? t.name : state.kind === 'planned' ? state.planned.name : '';
    const exCount = t ? t.exercises.length : state.kind === 'planned' ? state.planned.exercises.length : 0;
    const sets = state.kind === 'workout' ? state.sets : state.kind === 'planned' ? state.planned.exercises.reduce((a, e) => a + e.sets, 0) : 0;
    const label = state.kind === 'workout' ? state.label : 'Запланировано';
    const coachRest = state.kind === 'workout' && state.coachRest;
    const open = () => (t ? router.push({ pathname: '/workout/preview', params: { templateId: t.id } }) : undefined);
    return (
      <View style={[styles.card, elevation()]} testID="coach-today">
        <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${name}, ${exCount} упражнений, около ${state.minutes} минут. Состав`} disabled={!t} onPress={() => { haptic.tap(); open(); }} style={({ pressed }) => [pressed && { opacity: 0.7 }]}>
          <T v="footnote" color={coachRest ? colors.warning : colors.textDim}>
            {label}
          </T>
          <T v="title2" style={{ marginTop: 2 }}>
            {name}
          </T>
          <View style={styles.metrics}>
            <Metric value={String(exCount)} label={exCount === 1 ? 'упражнение' : exCount < 5 ? 'упражнения' : 'упражнений'} />
            <Metric value={`~${state.minutes}`} label="минут" />
            <Metric value={String(sets)} label={sets % 10 === 1 && sets !== 11 ? 'подход' : sets % 10 >= 2 && sets % 10 <= 4 && (sets < 12 || sets > 14) ? 'подхода' : 'подходов'} />
          </View>
          {t && t.muscles.length ? (
            <T v="callout" style={{ marginBottom: space.md }}>
              {musclesText(t.muscles.slice(0, 4))}
            </T>
          ) : (
            <View style={{ height: space.sm }} />
          )}
        </Pressable>
        <Button title="Начать тренировку" icon="play" size="lg" full variant={coachRest ? 'secondary' : 'primary'} onPress={state.onStart} />
      </View>
    );
  }
  if (state.kind === 'done') {
    const s = state.session;
    return (
      <View style={[styles.card, elevation()]} testID="coach-today">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="checkmark-circle" size={16} color={colors.accent} />
          <T v="footnote">Тренировка выполнена</T>
        </View>
        <T v="title2" style={{ marginTop: 2 }}>
          {s.name}
        </T>
        <View style={styles.metrics}>
          {state.minutes !== undefined ? <Metric value={String(state.minutes)} label="минут" /> : null}
          {state.sets !== undefined ? <Metric value={String(state.sets)} label="подходов" /> : null}
          {state.prs ? <Metric value={String(state.prs)} label={state.prs === 1 ? 'рекорд' : state.prs < 5 ? 'рекорда' : 'рекордов'} /> : null}
        </View>
        <Button title="Итоги" icon="stats-chart-outline" variant="secondary" full onPress={() => router.push({ pathname: '/workout/[id]', params: { id: s.id } })} />
        {next(state.next)}
      </View>
    );
  }
  if (state.kind === 'rest') {
    return (
      <View style={[styles.card, elevation()]} testID="coach-today">
        <T v="footnote">Сегодня</T>
        <T v="title2" style={{ marginTop: 2 }}>
          День отдыха
        </T>
        <T v="callout" style={{ marginTop: space.xxs }}>
          {state.reason ?? 'Восстановление — часть плана: мышцы растут между тренировками.'}
        </T>
        {next(state.next)}
      </View>
    );
  }
  return (
    <View style={[styles.card, elevation()]} testID="coach-today">
      <T v="title2">Плана пока нет</T>
      <T v="callout" style={{ marginTop: space.xxs, marginBottom: space.md }}>
        Заполни анкету — {BRAND} составит программу и питание.
      </T>
      <Button title="Заполнить анкету" icon="person-outline" size="lg" full onPress={() => router.push('/profile')} />
    </View>
  );
}

/** Питание коротко: съедено из цели, шкала и Б/Ж/У; тап — дневник */
export function NutritionBlock({ eaten, target, entries }: { eaten: Macros; target: NutritionTarget | null; entries: FoodEntry[] }) {
  if (!target) return null;
  const left = Math.round(target.kcal - eaten.kcal);
  return (
    <View testID="home-nutrition">
      <Pressable accessibilityRole="button" accessibilityLabel={`Калории: ${fmtValue(eaten.kcal)} из ${fmtValue(target.kcal)} ккал, ${left >= 0 ? `осталось ${fmtValue(left)}` : `больше цели на ${fmtValue(-left)}`}. Открыть питание`} onPress={() => { haptic.tap(); router.push('/nutrition'); }} style={({ pressed }) => [pressed && { opacity: 0.7 }]} testID="home-kcal">
        <View style={styles.kcalLine}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1, flexWrap: 'wrap' }}>
            <T v="display">{fmtValue(eaten.kcal)}</T>
            <T v="callout">из {fmtValue(target.kcal)} ккал</T>
          </View>
          <T v="footnote" color={left < 0 ? colors.warning : colors.textDim}>
            {left >= 0 ? `осталось ${fmtValue(left)}` : `больше на ${fmtValue(-left)}`}
          </T>
        </View>
        <Scale value={eaten.kcal} target={target.kcal} onSurface={false} />
      </Pressable>
      <MacroSummary entries={entries} eaten={eaten} target={target} fiber={false} testID="home-macros" />
    </View>
  );
}

/** Активность и восстановление — одной группой; нет Apple Health — одна строка-приглашение */
export function ActivityGroup({
  steps,
  stepsTarget,
  healthOn,
  sleepMinutes,
  readiness,
  hasCheckin,
  onSteps,
  onReadiness,
}: {
  steps?: number;
  stepsTarget: number;
  healthOn: boolean;
  sleepMinutes?: number;
  readiness?: ReadinessResult;
  hasCheckin: boolean;
  onSteps: () => void;
  onReadiness: () => void;
}) {
  const band = readiness?.band;
  const dot = band === 'go' ? colors.accent : band === 'reduce' ? colors.warning : colors.danger;
  return (
    <Group>
      <ListRow
        icon="footsteps-outline"
        title="Шаги"
        value={steps !== undefined ? `${fmtValue(steps)} / ${fmtValue(stepsTarget)}` : healthOn ? 'нет данных' : 'Подключить Apple Health'}
        accessibilityLabel={`Шаги, как рассчитана цель: ${steps !== undefined ? `${fmtValue(steps)} из ${fmtValue(stepsTarget)}` : 'нет данных'}`}
        onPress={steps === undefined && !healthOn ? () => router.push('/health') : onSteps}
        testID="home-steps"
      />
      <ListRow icon="moon-outline" title="Сон" value={sleepMinutes ? formatSleep(sleepMinutes) : hasCheckin ? '—' : 'нет данных'} onPress={sleepMinutes ? undefined : () => router.push('/checkin')} testID="home-sleep" />
      {readiness ? (
        <ListRow
          icon="pulse-outline"
          title="Готовность"
          right={
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.xs }}>
              <View style={[styles.dot, { backgroundColor: dot }]} />
              <T v="bodyStrong">{readinessLabel(readiness)}</T>
            </View>
          }
          accessibilityLabel={`Готовность: ${readinessLabel(readiness).toLowerCase()}${sleepMinutes ? `, сон ${formatSleep(sleepMinutes)}` : ''}. Почему так`}
          onPress={onReadiness}
          testID="home-recovery"
        />
      ) : (
        <ListRow icon="pulse-outline" title="Готовность" value="Пройти чек-ин" accessibilityLabel="Готовность: нет данных. Пройти чек-ин за 30 секунд" onPress={() => router.push('/checkin')} testID="home-recovery" />
      )}
    </Group>
  );
}

/** Цель сна для кольца: 8 ч — середина рекомендации 7–9 ч для взрослых (AASM/SRS 2015) */
export const SLEEP_GOAL_MIN = 480;

export interface SleepRingData {
  minutes: number;
  /** Время подъёма из Apple Health */
  wakeAt?: number;
  /** Посчитано по «в постели» (iPhone без часов) */
  inBed?: boolean;
  source: 'checkin' | 'health';
}

const hhmm = (ms: number) => new Date(ms).toTimeString().slice(0, 5);
const short = (min: number) => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} ч ${m} м` : `${h} ч`;
};

function RingCell({ progress, color, icon, value, caption, label, onPress, testID }: { progress: number; color: string; icon: React.ComponentProps<typeof Icon>['name']; value: string; caption: string; label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { haptic.tap(); onPress(); }} style={({ pressed }) => [styles.ringCell, pressed && { opacity: 0.7 }]} testID={testID}>
      <Ring size={100} stroke={10} progress={progress} color={color}>
        <Icon name={icon} size={24} color={color} />
      </Ring>
      <T v="metric" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ marginTop: space.xs, fontSize: 22, lineHeight: 27 }}>
        {value}
      </T>
      <T v="footnote" numberOfLines={2} style={{ textAlign: 'center' }}>
        {caption}
      </T>
    </Pressable>
  );
}

/**
 * Три анимированных кольца дня (R1): шаги из Apple Health, сон (Apple Health — со временем подъёма; без часов —
 * «в постели» от iPhone; иначе — из чек-ина) и тренировки этой недели. Тап — подробности.
 */
export function DayRings({
  steps,
  stepsTarget,
  healthOn,
  sleep,
  week,
  onSteps,
  onSleep,
  onWeek,
}: {
  steps?: number;
  stepsTarget: number;
  healthOn: boolean;
  sleep: SleepRingData | null;
  week: { done: number; planned: number };
  onSteps: () => void;
  onSleep: () => void;
  onWeek: () => void;
}) {
  const sleepCaption = !sleep ? (healthOn ? 'нет данных' : 'чек-ин') : sleep.wakeAt ? `${sleep.inBed ? 'в постели · ' : ''}подъём ${hhmm(sleep.wakeAt)}` : sleep.source === 'checkin' ? 'из чек-ина' : sleep.inBed ? 'в постели' : 'Apple Health';
  return (
    <View style={styles.rings} testID="home-rings">
      <RingCell
        progress={steps !== undefined && stepsTarget > 0 ? steps / stepsTarget : 0}
        color={colors.accent}
        icon="footsteps"
        value={steps !== undefined ? fmtValue(steps) : '—'}
        caption={steps !== undefined ? `из ${fmtValue(stepsTarget)}` : healthOn ? 'нет данных' : 'Apple Health'}
        label={steps !== undefined ? `Шаги: ${fmtValue(steps)} из ${fmtValue(stepsTarget)}. Как рассчитана цель` : healthOn ? 'Шаги: нет данных' : 'Шаги: подключить Apple Health'}
        onPress={onSteps}
        testID="home-steps"
      />
      <RingCell
        progress={sleep ? sleep.minutes / SLEEP_GOAL_MIN : 0}
        color={colors.ringSleep}
        icon="moon"
        value={sleep ? short(sleep.minutes) : '—'}
        caption={sleepCaption}
        label={sleep ? `Сон: ${formatSleep(sleep.minutes)}${sleep.inBed ? ' в постели' : ''}${sleep.wakeAt ? `, подъём в ${hhmm(sleep.wakeAt)}` : ''}. Готовность` : 'Сон: нет данных. Пройти чек-ин'}
        onPress={onSleep}
        testID="home-sleep"
      />
      <RingCell
        progress={week.planned > 0 ? week.done / week.planned : 0}
        color={colors.ringWeek}
        icon="barbell"
        value={week.planned > 0 ? `${week.done} из ${week.planned}` : String(week.done)}
        caption="тренировок за неделю"
        label={`Тренировки за неделю: ${week.done}${week.planned ? ` из ${week.planned}` : ''}. Открыть тренировки`}
        onPress={onWeek}
        testID="home-week"
      />
    </View>
  );
}

/** «Понедельник, 2 ноября» */
export function dayTitle(d: string, weekday: string): string {
  return `${weekday}, ${formatDayLong(d)}`;
}

const styles = themed({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space.md },
  metrics: { flexDirection: 'row', gap: space.xl, marginTop: space.sm, marginBottom: space.xs },
  metric: { gap: 0 },
  next: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.md, minHeight: 32 },
  kcalLine: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.sm, marginBottom: space.sm, flexWrap: 'wrap' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rings: { flexDirection: 'row', justifyContent: 'space-between', gap: space.xs },
  ringCell: { flex: 1, alignItems: 'center', minWidth: 0, paddingVertical: space.xs },
});
