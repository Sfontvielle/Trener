import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { Sheet } from '@/components/Sheet';
import { Button, Chip, Icon, T, type IconName } from '@/components/ui';
import { toast } from '@/components/Dialog';
import { colors, radius, space, themed } from '@/theme';
import { useUi } from '@/stores/ui';
import { useWorkouts } from '@/stores/workouts';
import { usePlan } from '@/stores/plan';
import { useTodayWorkout } from '@/hooks/useToday';
import { MODE_LABEL } from './today';
import { openCustomBuilder, openGenerated, repeatSession, resumeActive, startTodayPlanned } from './actions';
import { planningDayLabel, planningDays, recentRepeatable, scheduleOverride } from './hub';
import { WORKOUT_COLORS } from './colors';
import { useProfile } from '@/stores/profile';
import { formatDayShort, today } from '@/utils/date';
import { haptic } from '@/services/haptics';
import { afterModalClose } from '@/components/modalGate';

const MINUTES = [30, 45, 60, 75, 90];

type Step = 'root' | 'start' | 'repeat' | 'plan';

function Row({ icon, title, sub, onPress, accent, dot, testID }: { icon: IconName; title: string; sub?: string; onPress: () => void; accent?: boolean; dot?: string; testID?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} testID={testID} style={({ pressed }) => [styles.row, accent && { borderColor: colors.accentLine }, pressed && { opacity: 0.8 }]}>
      <View style={[styles.rowIcon, accent && { backgroundColor: colors.accent }, dot ? { backgroundColor: dot } : null]}>
        <Icon name={icon} size={20} color={accent || dot ? colors.onAccent : colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="h3" numberOfLines={1}>
          {title}
        </T>
        {sub ? (
          <T v="small" numberOfLines={2}>
            {sub}
          </T>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

/**
 * «+» на вкладке «Тренировки»: запланировать тренировку или начать — новую (название, цвет, упражнения)
 * либо повтор прошлой. Используются существующие механизмы: DayOverride, конструктор, repeatSession.
 */
export function TrainingHub() {
  const open = useUi((s) => s.hubOpen);
  const close = useUi((s) => s.closeHub);
  const active = useWorkouts((s) => s.active);
  const draft = useWorkouts((s) => s.draft);
  const sessions = useWorkouts((s) => s.sessions);
  const plan = usePlan((s) => s.plan);
  const tw = useTodayWorkout();
  const sessionMin = useProfile((s) => s.profile?.sessionMinutes ?? 60);
  const [step, setStep] = useState<Step>('root');
  const [genOpen, setGenOpen] = useState(false);
  const [minutes, setMinutes] = useState(() => MINUTES.reduce((a, b) => (Math.abs(b - sessionMin) < Math.abs(a - sessionMin) ? b : a), 60));
  const d = today();
  const [planDate, setPlanDate] = useState(d);
  const recent = useMemo(() => recentRepeatable(sessions), [sessions]);
  const days = useMemo(() => planningDays(d), [d]);

  const reset = () => {
    setStep('root');
    setGenOpen(false);
    setPlanDate(d);
  };
  const run = (fn: () => void) => {
    close();
    reset();
    afterModalClose(fn);
  };
  const doneSets = active ? active.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0) : 0;
  const planToday = tw.kind === 'workout' && tw.template ? tw.template : null;

  const titles: Record<Step, string> = { root: 'Тренировка', start: 'Начать тренировку', repeat: 'Повторить тренировку', plan: 'Запланировать тренировку' };
  const back = step === 'root' ? null : () => setStep(step === 'repeat' ? 'start' : 'root');

  return (
    <Sheet visible={open} onClose={() => { close(); reset(); }} title={titles[step]}>
      <View style={{ gap: space.sm }} testID={`hub-${step}`}>
        {back ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Назад" onPress={back} hitSlop={8} style={styles.back}>
            <Icon name="chevron-back" size={16} color={colors.textDim} />
            <T v="small">Назад</T>
          </Pressable>
        ) : null}

        {step === 'root' ? (
          <>
            {active ? <Row accent icon="play" title="Продолжить незавершённую" sub={`${active.name} · выполнено подходов: ${doneSets}`} onPress={() => run(resumeActive)} /> : null}
            <Row icon="calendar-outline" title="Запланировать тренировку" sub="День и тренировка из плана" onPress={() => { haptic.tap(); setStep('plan'); }} testID="hub-plan" />
            <Row icon="play-outline" title="Начать тренировку" sub="Новая или повтор прошлой" onPress={() => { haptic.tap(); setStep('start'); }} testID="hub-start" />
            {draft && draft.exercises.length > 0 ? (
              <Row icon="document-text-outline" title="Черновик тренировки" sub={`${draft.name} · ${draft.exercises.length} упр.`} onPress={() => run(() => router.push('/workout/builder'))} />
            ) : null}
          </>
        ) : null}

        {step === 'start' ? (
          <>
            {planToday ? (
              <Row
                accent
                icon="flash"
                title={`По плану: ${planToday.name}`}
                sub={`~${tw.estMinutes} мин · ${tw.totalSets} подходов${tw.mode !== 'normal' ? ` · ${MODE_LABEL[tw.mode]}` : ''}`}
                onPress={() => run(() => startTodayPlanned())}
              />
            ) : null}
            <Row icon="add-circle-outline" title="Новая тренировка" sub="Название, цвет и упражнения" onPress={() => run(openCustomBuilder)} testID="hub-new" />
            <Row icon="repeat" title="Повторить тренировку" sub={recent.length ? `Последняя: ${recent[0].name}, ${formatDayShort(recent[0].date)}` : 'Пока нет завершённых тренировок'} onPress={() => recent.length && setStep('repeat')} testID="hub-repeat" />
            {genOpen ? (
              <View style={styles.gen}>
                <T v="h3">Сколько есть времени?</T>
                <View style={styles.chips}>
                  {MINUTES.map((m) => (
                    <Chip key={m} label={`${m} мин`} active={minutes === m} onPress={() => setMinutes(m)} />
                  ))}
                </View>
                <Button title="Сгенерировать" icon="sparkles" onPress={() => run(() => openGenerated(minutes, 'auto'))} style={{ marginTop: space.sm }} />
              </View>
            ) : (
              <Row icon="sparkles" title="Собрать за меня" sub="День сплита с наибольшим недобором объёма" onPress={() => setGenOpen(true)} />
            )}
          </>
        ) : null}

        {step === 'repeat' ? (
          <View style={{ gap: space.sm }} testID="hub-repeat-list">
            {recent.map((s) => (
              <Row
                key={s.id}
                icon="repeat"
                dot={s.color ? WORKOUT_COLORS[s.color] : undefined}
                title={s.name}
                sub={`${formatDayShort(s.date)} · ${s.exercises.length} упр.`}
                onPress={() => run(() => repeatSession(s))}
              />
            ))}
          </View>
        ) : null}

        {step === 'plan' ? (
          plan ? (
            <View style={{ gap: space.md }} testID="hub-plan-form">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {days.map((x) => (
                  <Chip key={x} label={planningDayLabel(x, d)} active={planDate === x} onPress={() => setPlanDate(x)} />
                ))}
              </ScrollView>
              <View style={{ gap: space.sm }}>
                {plan.templates.map((t) => (
                  <Row
                    key={t.id}
                    icon="barbell-outline"
                    title={t.name}
                    sub={`${t.exercises.length} упр. · ~${t.estMinutes} мин`}
                    onPress={() => {
                      usePlan.getState().setOverride(scheduleOverride(planDate, t.id));
                      haptic.success();
                      toast(`«${t.name}» — ${planningDayLabel(planDate, d).toLowerCase()}`, 'calendar');
                      close();
                      reset();
                    }}
                  />
                ))}
              </View>
            </View>
          ) : (
            <T v="small">План ещё не создан — заполни профиль.</T>
          )
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = themed({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2, minHeight: 64, borderWidth: 1, borderColor: 'transparent' },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center' },
  gen: { padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface2, gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 2 },
});
