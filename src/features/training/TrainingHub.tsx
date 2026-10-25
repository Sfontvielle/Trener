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
import { useSchedule } from '@/stores/schedule';
import { useTodayWorkout } from '@/hooks/useToday';
import { MODE_LABEL } from './today';
import { openCustomBuilder, openGenerated, repeatSession, resumeActive, startTodayPlanned } from './actions';
import { planningDayLabel, planningDays, repeatableSessions } from './hub';
import { planProgramDay, planRepeat, planUserTemplate } from './planning';
import { WORKOUT_COLORS } from './colors';
import { useProfile } from '@/stores/profile';
import { formatDayShort, today } from '@/utils/date';
import { estimateMinutes } from './planGenerator';
import { haptic } from '@/services/haptics';
import { afterModalClose } from '@/components/modalGate';
import type { ISODate, WorkoutSession } from '@/types';

const MINUTES = [30, 45, 60, 75, 90];
/** Прошлые тренировки показываем страницами — весь список доступен «Показать ещё» */
const PAGE = 20;

type Step = 'root' | 'start' | 'repeat' | 'plan' | 'planRepeat';

function Row({ icon, title, sub, onPress, accent, dot, testID }: { icon: IconName; title: string; sub?: string; onPress: () => void; accent?: boolean; dot?: string; testID?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} testID={testID} style={({ pressed }) => [styles.row, accent && { borderColor: colors.accentLine }, pressed && { opacity: 0.8 }]}>
      <View style={[styles.rowIcon, accent && { backgroundColor: colors.accent }, dot ? { backgroundColor: dot } : null]}>
        <Icon name={icon} size={20} color={accent || dot ? colors.onAccent : colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="h3" numberOfLines={2}>
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

/** Дата для планирования: сегодня и четыре недели вперёд, листается вбок */
export function PlanDays({ value, onChange, from }: { value: ISODate; onChange: (d: ISODate) => void; from: ISODate }) {
  const days = useMemo(() => planningDays(from), [from]);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} testID="plan-days">
      {days.map((x) => (
        <Chip key={x} label={planningDayLabel(x, from)} active={value === x} onPress={() => onChange(x)} />
      ))}
    </ScrollView>
  );
}

function Caption({ children }: { children: string }) {
  return (
    <T v="caption" style={{ marginTop: space.sm }}>
      {children}
    </T>
  );
}

/** Прошлые тренировки — все, новые первыми, одинаковые названия не склеиваются */
function SessionList({ sessions, onPick, testID }: { sessions: WorkoutSession[]; onPick: (s: WorkoutSession) => void; testID: string }) {
  const [n, setN] = useState(PAGE);
  return (
    <View style={{ gap: space.sm }} testID={testID}>
      {sessions.slice(0, n).map((s) => (
        <Row key={s.id} icon="repeat" dot={s.color ? WORKOUT_COLORS[s.color] : undefined} title={s.name} sub={`${formatDayShort(s.date)} · ${s.exercises.length} упр.`} onPress={() => onPick(s)} />
      ))}
      {sessions.length > n ? <Button title={`Показать ещё (${sessions.length - n})`} variant="secondary" size="sm" onPress={() => setN(n + PAGE)} /> : null}
    </View>
  );
}

/**
 * «+» на вкладке «Тренировки»: «Запланировать тренировку» и «Начать тренировку» (новая / повтор прошлой).
 * Запланировать можно что угодно: тренировку программы, свой шаблон, повтор любой прошлой или собрать свою.
 */
export function TrainingHub() {
  const open = useUi((s) => s.hubOpen);
  const initialStep = useUi((s) => s.hubStep);
  const prefill = useUi((s) => s.hubPrefill);
  const close = useUi((s) => s.closeHub);
  const active = useWorkouts((s) => s.active);
  const draft = useWorkouts((s) => s.draft);
  const sessions = useWorkouts((s) => s.sessions);
  const customs = useWorkouts((s) => s.customExercises);
  const templates = useSchedule((s) => s.templates);
  const plan = usePlan((s) => s.plan);
  const tw = useTodayWorkout();
  const sessionMin = useProfile((s) => s.profile?.sessionMinutes ?? 60);
  const [step, setStep] = useState<Step>('root');
  // Шаг, с которого открыли «+» (корень или сразу «Запланировать») — синхронизируем при каждом открытии
  const [openedWith, setOpenedWith] = useState<string | null>(null);
  const key = open ? `${initialStep}:${prefill?.kind ?? ''}:${prefill?.id ?? ''}` : null;
  if (key !== openedWith) {
    setOpenedWith(key);
    if (open) setStep(initialStep);
  }
  const [genOpen, setGenOpen] = useState(false);
  const [minutes, setMinutes] = useState(() => MINUTES.reduce((a, b) => (Math.abs(b - sessionMin) < Math.abs(a - sessionMin) ? b : a), 60));
  const d = today();
  const [planDate, setPlanDate] = useState(d);
  const recent = useMemo(() => repeatableSessions(sessions), [sessions]);

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
  const planned = (name: string, date: ISODate) => {
    haptic.success();
    toast(`«${name}» — ${planningDayLabel(date, d).toLowerCase()}`, 'calendar');
    close();
    reset();
  };
  const doneSets = active ? active.exercises.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0) : 0;
  const planToday = tw.kind === 'workout' && tw.template ? tw.template : null;
  const preTemplate = prefill?.kind === 'template' ? templates.find((t) => t.id === prefill.id) : undefined;
  const preSession = prefill?.kind === 'session' ? sessions.find((s) => s.id === prefill.id) : undefined;
  const pre = step === 'plan' && (preTemplate || preSession) ? { name: (preTemplate ?? preSession)!.name, n: (preTemplate ?? preSession)!.exercises.length } : null;

  const titles: Record<Step, string> = { root: 'Тренировка', start: 'Начать тренировку', repeat: 'Повторить тренировку', plan: 'Запланировать тренировку', planRepeat: 'Запланировать повтор' };
  const parent: Partial<Record<Step, Step>> = { start: 'root', plan: 'root', repeat: 'start', planRepeat: 'plan' };
  // Открыли «Запланировать» с уже выбранной тренировкой — назад некуда
  const back = step === 'root' || pre ? null : () => setStep(parent[step]!);

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
            <Row icon="calendar-outline" title="Запланировать тренировку" sub="Любой день: программа, шаблон, повтор или своя" onPress={() => { haptic.tap(); setStep('plan'); }} testID="hub-plan" />
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
            <Row icon="add-circle-outline" title="Новая тренировка" sub="Название, цвет и упражнения" onPress={() => run(() => openCustomBuilder())} testID="hub-new" />
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

        {step === 'repeat' ? <SessionList sessions={recent} onPick={(s) => run(() => repeatSession(s))} testID="hub-repeat-list" /> : null}

        {step === 'plan' ? (
          <View style={{ gap: space.sm }} testID="hub-plan-form">
            <PlanDays value={planDate} onChange={setPlanDate} from={d} />
            {pre ? (
              // Тренировка уже выбрана (свой шаблон / прошлая) — остаётся только день
              <>
                <View style={[styles.row, { marginTop: space.sm }]}>
                  <View style={styles.rowIcon}>
                    <Icon name={preTemplate ? 'bookmark-outline' : 'repeat'} size={20} color={colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="h3" numberOfLines={1}>
                      {pre.name}
                    </T>
                    <T v="small">{pre.n} упр.</T>
                  </View>
                </View>
                <Button
                  title={`Запланировать: ${planningDayLabel(planDate, d).toLowerCase()}`}
                  icon="calendar"
                  testID="hub-plan-confirm"
                  onPress={() => {
                    const p = preTemplate ? planUserTemplate(planDate, preTemplate) : planRepeat(planDate, preSession!);
                    if (p) planned(p.name, planDate);
                  }}
                />
              </>
            ) : (
              <>
                {plan ? (
                  <>
                    <Caption>Программа</Caption>
                    {plan.templates.map((t) => (
                      <Row key={t.id} icon="barbell-outline" title={t.name} sub={`${t.exercises.length} упр. · ~${t.estMinutes} мин`} onPress={() => { planProgramDay(planDate, t); planned(t.name, planDate); }} />
                    ))}
                  </>
                ) : null}
                {templates.length ? (
                  <>
                    <Caption>Мои шаблоны</Caption>
                    {templates.map((t) => (
                      <Row
                        key={t.id}
                        icon="bookmark-outline"
                        dot={t.color ? WORKOUT_COLORS[t.color] : undefined}
                        title={t.name}
                        sub={`${t.exercises.length} упр. · ~${estimateMinutes(t.exercises, customs)} мин`}
                        onPress={() => { planUserTemplate(planDate, t); planned(t.name, planDate); }}
                      />
                    ))}
                  </>
                ) : null}
                <Caption>Другое</Caption>
                <Row icon="repeat" title="Повтор прошлой тренировки" sub={recent.length ? 'Любая из истории — те же упражнения и подходы' : 'Пока нет завершённых тренировок'} onPress={() => recent.length && setStep('planRepeat')} testID="hub-plan-repeat" />
                <Row icon="create-outline" title="Своя тренировка" sub="Собрать упражнения и запланировать" onPress={() => run(() => openCustomBuilder(planDate))} testID="hub-plan-custom" />
              </>
            )}
          </View>
        ) : null}

        {step === 'planRepeat' ? (
          <>
            <PlanDays value={planDate} onChange={setPlanDate} from={d} />
            <SessionList
              sessions={recent}
              testID="hub-plan-repeat-list"
              onPick={(s) => {
                const p = planRepeat(planDate, s);
                if (p) planned(p.name, planDate);
              }}
            />
          </>
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
