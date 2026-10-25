import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, FlatList, PanResponder, Platform, Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Exercise, SplitPreference, WorkoutSession, WorkoutTemplate } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { TAB_BAR_HEIGHT } from '@/components/Screen';
import { Banner, Button, Card, EmptyState, Icon, Segmented, T } from '@/components/ui';
import { haptic } from '@/services/haptics';
import { Ambient, Appear, FadeIn, Progress, Tap, prefersReducedMotion } from '@/components/motion';
import { afterModalClose } from '@/components/modalGate';
import { agendaProgress, weekAgenda, type AgendaDay } from '@/features/training/weekAgenda';
import { usePlan } from '@/stores/plan';
import { useWorkouts } from '@/stores/workouts';
import { useUi } from '@/stores/ui';
import { WORKOUT_COLORS } from '@/features/training/colors';
import { useTodayWorkout } from '@/hooks/useToday';
import { scaleSets } from '@/features/training/scale';
import { resumeActive, startTodayPlanned } from '@/features/training/actions';
import { useProfile } from '@/stores/profile';
import { useHealth } from '@/stores/health';
import { getPrefs, withPrefs } from '@/features/training/engine/prefs';
import { estimateRecovery } from '@/features/training/engine/recovery';
import { SPLIT_PREF_LABEL } from '@/features/training/engine/split';
import { applyProfile } from '@/features/profile/applyProfile';
import { generatePlan, planVolume } from '@/features/training/planGenerator';
import { doneFineVolume } from '@/features/training/engine/volume';
import { VM_LABEL, VOLUME_MUSCLES } from '@/features/training/engine/muscles';
import { ExerciseList } from '@/features/exercises/ExerciseList';
import { WeekStrip } from '@/features/profile/PlanSummary';
import { TrainingCalendar } from '@/features/day/Calendar';
import { DayDetailsSheet, useDaySources } from '@/features/day/DayDetails';
import { checkDeload, deloadDates, DELOAD_FACTOR, DELOAD_RIR, isDeloadActive } from '@/features/training/deload';
import { applyDeload, cancelDeload } from '@/features/training/deloadActions';
import { useCheckins } from '@/stores/checkins';
import { confirm, toast } from '@/components/Dialog';
import { Sheet } from '@/components/Sheet';
import { addDays, formatDayShort, plural, startOfWeek, today, weekdayIndex as weekdayIndexOf } from '@/utils/date';
import { fmtNum } from '@/utils/format';
import { journalDay, journalSections, KIND_COLOR, KIND_LABEL, prCounts, sessionEmoji, sessionKind, sessionStats, weekStreak, type SessionStats, type WeekStats } from '@/features/training/journal';
import { BRAND } from '@/config/brand';

type Seg = 'today' | 'history' | 'library';

/**
 * Тренировки — три вкладки: неделя (что сделано и что дальше), дневник и упражнения. Сегодняшняя тренировка
 * крупно — на главной; здесь — программа недели одним списком. План и сплит — в листе.
 */
export default function Training() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ seg?: Seg | 'plan' }>();
  const norm = (x?: Seg | 'plan') => (x === 'plan' ? 'today' : x);
  const [seg, setSeg] = useState<Seg>(norm(params.seg) ?? 'today');
  // Переход из «+» → Библиотека: синхронизируем вкладку при новом параметре (без эффекта)
  const [lastParam, setLastParam] = useState(params.seg);
  if (params.seg !== lastParam) {
    setLastParam(params.seg);
    if (params.seg) setSeg(norm(params.seg)!);
  }
  const bottom = insets.bottom + TAB_BAR_HEIGHT + space.lg;
  const [calOpen, setCalOpen] = useState(false);
  const openHub = useUi((s) => s.openHub);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + space.sm }}>
      <Ambient height={360} />
      <View style={{ paddingHorizontal: space.lg, gap: space.md, marginBottom: space.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T v="h1" style={{ flex: 1 }}>
            Тренировки
          </T>
          {seg === 'history' ? (
            <Tap accessibilityRole="button" accessibilityLabel="Календарь тренировок" onPress={() => { haptic.tap(); setCalOpen(true); }} style={styles.calBtn} scaleTo={0.9}>
              <Icon name="calendar-outline" size={19} color={colors.text} />
            </Tap>
          ) : null}
          {/* «+» — запланировать или начать тренировку (новая / повтор) */}
          <Tap accessibilityRole="button" accessibilityLabel="Тренировка: запланировать или начать" onPress={() => { haptic.light(); openHub(); }} style={[styles.calBtn, styles.plusBtn]} scaleTo={0.9} testID="training-plus">
            <Icon name="add" size={24} color={colors.text} />
          </Tap>
        </View>
        <Segmented
          items={[
            { key: 'today', label: 'Неделя' },
            { key: 'history', label: 'Дневник' },
            { key: 'library', label: 'Упражнения' },
          ]}
          value={seg}
          onChange={setSeg}
        />
      </View>
      <FadeIn key={seg} style={{ flex: 1, paddingHorizontal: space.lg }} from={6}>
        {seg === 'today' ? <WeekTab bottom={bottom} openPlan={params.seg === 'plan'} /> : null}
        {seg === 'history' ? <HistoryTab bottom={bottom} calOpen={calOpen} setCalOpen={setCalOpen} /> : null}
        {seg === 'library' ? <ExerciseList onSelect={(e: Exercise) => router.push({ pathname: '/exercise/[id]', params: { id: e.id } })} contentPaddingBottom={bottom} /> : null}
      </FadeIn>
    </View>
  );
}

const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/**
 * Неделя: крупно — сколько тренировок сделано из плана, ниже — дни недели одним списком (сделано ✓,
 * сегодня — одна главная кнопка, дальше — по ротации, пропуски). План/сплит и объём — строками в листы.
 */
function WeekTab({ bottom, openPlan }: { bottom: number; openPlan?: boolean }) {
  const tw = useTodayWorkout();
  const active = useWorkouts((s) => s.active);
  const sessions = useWorkouts((s) => s.sessions);
  const plan = usePlan((s) => s.plan);
  const openHub = useUi((s) => s.openHub);
  const d = today();
  const customs = useWorkouts((s) => s.customExercises);
  // Прямые подходы по детальным группам: сделано с понедельника / запланировано на неделю
  const week = useMemo(() => doneFineVolume(sessions, startOfWeek(d), d, customs), [sessions, d, customs]);
  const planned = useMemo(() => (plan ? planVolume(plan, customs) : null), [plan, customs]);
  const checkins = useCheckins((s) => s.byDate);
  const overrides = usePlan((s) => s.overrides);
  const adjustments = usePlan((s) => s.adjustments);
  // Неделя, которую смотрим: 0 — текущая, −1 — прошлая, +1 — следующая (листается стрелками и свайпом)
  const [wk, setWk] = useState({ offset: 0, dir: 0 });
  const ws = addDays(startOfWeek(d), wk.offset * 7);
  const days = useMemo(() => weekAgenda({ today: d, plan, sessions, overrides, weekStart: ws }), [d, plan, sessions, overrides, ws]);
  const shift = (dir: 1 | -1) => {
    const next = Math.max(-26, Math.min(8, wk.offset + dir));
    if (next === wk.offset) return;
    haptic.tap();
    setWk({ offset: next, dir });
  };
  const prog = agendaProgress(days);
  const deload = useMemo(() => checkDeload({ plan, sessions, checkins, adjustments, overrides }), [plan, sessions, checkins, adjustments, overrides]);
  const deloadActive = isDeloadActive(overrides);
  const [deloadPlanOpen, setDeloadPlanOpen] = useState(false);
  const [volOpen, setVolOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(!!openPlan);
  const volGroups = VOLUME_MUSCLES.filter((m) => (planned?.[m] ?? 0) > 0).map((g) => {
    const target = Math.round(planned?.[g] ?? 0);
    return { g, p: target ? Math.round(week[g] ?? 0) / target : 0 };
  });
  if (!plan) return <EmptyState icon="calendar-outline" title="Плана пока нет" text={`Заполни профиль — ${BRAND} создаст план автоматически.`} action="Профиль" onAction={() => router.push('/profile')} />;
  const openDay = (day: AgendaDay) => {
    if (day.session) router.push({ pathname: '/workout/[id]', params: { id: day.session.id } });
    else if (day.template) router.push({ pathname: '/workout/preview', params: { templateId: day.template.id } });
  };

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: bottom }} showsVerticalScrollIndicator={false}>
      {active ? <Banner tone="accent" icon="play-circle" text={`Незавершённая тренировка: ${active.name}`} action="Продолжить" onAction={resumeActive} /> : null}
      {deloadActive ? (
        <Banner tone="warning" icon="battery-charging" text="Идёт разгрузочная неделя: меньше подходов, больше запаса. Это и есть прогресс — сила вырастет после неё." action="Отменить" onAction={() => confirm('Отменить разгрузку?', 'Тренировки вернутся к обычному объёму.', 'Отменить разгрузку', () => { cancelDeload(); toast('Разгрузка отменена'); })} />
      ) : deload.suggest ? (
        <Card tone="warning" style={{ gap: 8, marginBottom: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="battery-half" size={20} color={colors.warning} />
            <T v="h3">Пора разгрузиться</T>
          </View>
          {deload.reasons.map((r) => (
            <T key={r} v="small">
              • {r}
            </T>
          ))}
          {deloadPlanOpen ? (
            <View style={{ gap: 4, padding: 10, borderRadius: radius.md, backgroundColor: colors.surface2 }}>
              <T v="small" style={{ fontSize: 12 }}>
                Неделя с −40% подходов и запасом 3–4 повтора снимает накопленную усталость — после неё веса обычно снова растут.
              </T>
              {deloadDates(plan).map((dd) => {
                const t = plan.templates.find((x) => x.id === plan.schedule[weekdayIndexOf(dd)]);
                const sets = t ? scaleSets(t.exercises.map((e) => e.sets), DELOAD_FACTOR).reduce((a, b) => a + b, 0) : 0;
                const was = t ? t.exercises.reduce((a, e) => a + e.sets, 0) : 0;
                return (
                  <T key={dd} v="small" color={colors.text}>
                    {formatDayShort(dd)} · {t?.name ?? '—'}: {was} → {sets} подходов, запас +{DELOAD_RIR} повт., веса без повышения
                  </T>
                );
              })}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={deloadPlanOpen ? 'Скрыть' : 'Посмотреть план'} size="sm" variant="secondary" onPress={() => setDeloadPlanOpen(!deloadPlanOpen)} style={{ flex: 1 }} />
            <Button title="Применить" icon="battery-charging" size="sm" onPress={() => { const n = applyDeload(); toast(`Разгрузка: облегчено тренировок — ${n}`); }} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}

      {/* Календарь недели сверху: листается стрелками и свайпом — прошлые и следующие недели */}
      <WeekCalendar weekStart={ws} offset={wk.offset} today={d} days={days} onShift={shift} onOpen={(day) => openDay(day)} />

      <SlideIn key={ws} dir={wk.dir}>
        {/* Главное: сколько сделано из плана недели — крупно, полоса наливается */}
        <View style={styles.weekHero} accessibilityLabel={`Неделя: сделано ${prog.done} из ${prog.planned} тренировок`}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
            <T v="hero">{wk.offset > 0 ? prog.planned : `${prog.done} из ${prog.planned}`}</T>
            <T v="bodyDim">{plural(prog.planned, 'тренировка', 'тренировки', 'тренировок')}{wk.offset > 0 ? ' по плану' : ''}</T>
          </View>
          {wk.offset <= 0 ? <Progress value={prog.planned ? prog.done / prog.planned : 0} color={prog.done >= prog.planned && prog.planned ? colors.accent : colors.text} height={5} style={{ marginTop: space.md }} /> : null}
        </View>

        {/* Дни недели — один спокойный список */}
        <View style={{ marginTop: space.lg }}>
          {days.length ? (
            days.map((day, i) => <AgendaRow key={day.date} day={day} last={i === days.length - 1} customs={customs} tw={tw} onRestTrain={openHub} />)
          ) : (
            <T v="small" style={{ paddingVertical: space.md }}>
              Тренировок на этой неделе не было.
            </T>
          )}
        </View>
      </SlideIn>

      {/* Второстепенное — строками */}
      <Appear i={2} style={styles.navList}>
        <NavRow title={`План · ${plan.splitLabel}`} label="План и сплит" onPress={() => setPlanOpen(true)} />
        <NavRow title={`Объём · в норме ${volGroups.filter((g) => g.p >= 0.9).length} из ${volGroups.length}`} label="Объём за неделю" onPress={() => setVolOpen(true)} last />
      </Appear>

      <Sheet visible={volOpen} onClose={() => setVolOpen(false)} title="Объём за неделю" subtitle="Прямые рабочие подходы с понедельника · сделано / план">
        <View style={{ gap: 12 }}>
          {VOLUME_MUSCLES.filter((m) => (planned?.[m] ?? 0) > 0).map((g) => {
            const done = Math.round(week[g] ?? 0);
            const target = Math.round(planned?.[g] ?? 0);
            const p = target ? done / target : 0;
            return (
              <View key={g} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <T v="small" style={{ width: 118 }} numberOfLines={1}>
                  {VM_LABEL[g]}
                </T>
                <Progress value={p} color={p >= 0.9 ? colors.accent : colors.barSoft} height={6} style={{ flex: 1 }} />
                <T v="small" style={{ width: 54, textAlign: 'right', fontVariant: ['tabular-nums'] }}>
                  {done}/{target}
                </T>
              </View>
            );
          })}
        </View>
      </Sheet>
      <Sheet visible={planOpen} onClose={() => setPlanOpen(false)} title="План и сплит" subtitle="Тренировки плана и формат недели">
        <PlanContent onDone={() => setPlanOpen(false)} />
      </Sheet>
    </ScrollView>
  );
}

const MONTHS_GEN = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const dayNum = (iso: string) => Number(iso.slice(8, 10));
const monthOf = (iso: string) => MONTHS_GEN[Number(iso.slice(5, 7)) - 1];

/** Подпись недели: «Эта неделя», «Прошлая», «Следующая» или даты */
function weekLabel(offset: number, ws: string): string {
  if (offset === 0) return 'Эта неделя';
  if (offset === -1) return 'Прошлая неделя';
  if (offset === 1) return 'Следующая неделя';
  const we = addDays(ws, 6);
  return monthOf(ws) === monthOf(we) ? `${dayNum(ws)}–${dayNum(we)} ${monthOf(we)}` : `${dayNum(ws)} ${monthOf(ws)} – ${dayNum(we)} ${monthOf(we)}`;
}

/**
 * Календарь недели: стрелки и свайп листают недели, у дня — отметка: сделано ✓, запланировано •, пропуск ○.
 * Тап по дню с тренировкой — итоги или состав.
 */
function WeekCalendar({ weekStart, offset, today: td, days, onShift, onOpen }: { weekStart: string; offset: number; today: string; days: AgendaDay[]; onShift: (dir: 1 | -1) => void; onOpen: (d: AgendaDay) => void }) {
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderRelease: (_, g) => {
          if (g.dx < -40) onShift(1);
          else if (g.dx > 40) onShift(-1);
        },
      }),
    [onShift],
  );
  const byDate = Object.fromEntries(days.map((x) => [x.date, x]));
  return (
    <View style={styles.cal} {...pan.panHandlers} testID="week-calendar">
      <View style={styles.calHead}>
        <Tap accessibilityRole="button" accessibilityLabel="Предыдущая неделя" onPress={() => onShift(-1)} hitSlop={10} style={styles.calArrow} scaleTo={0.88}>
          <Icon name="chevron-back" size={18} color={colors.textDim} />
        </Tap>
        <T v="body" style={{ flex: 1, textAlign: 'center', fontWeight: '700' }} testID="week-label">
          {weekLabel(offset, weekStart)}
        </T>
        <Tap accessibilityRole="button" accessibilityLabel="Следующая неделя" onPress={() => onShift(1)} hitSlop={10} style={styles.calArrow} scaleTo={0.88}>
          <Icon name="chevron-forward" size={18} color={colors.textDim} />
        </Tap>
      </View>
      <SlideIn key={weekStart} dir={0} style={styles.calRow}>
        {Array.from({ length: 7 }, (_, i) => {
          const date = addDays(weekStart, i);
          const it = byDate[date];
          const isToday = date === td;
          const st = it?.status;
          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={`${WD[i]} ${dayNum(date)}${isToday ? ', сегодня' : ''}${st === 'done' ? ', сделано' : st === 'today' || st === 'planned' ? `, ${it?.template?.name ?? 'тренировка'}` : st === 'missed' ? ', пропущено' : ''}`}
              disabled={!it?.session && !it?.template}
              onPress={() => it && onOpen(it)}
              style={styles.calDay}
            >
              <T v="small" style={{ fontSize: 12 }} color={isToday ? colors.text : colors.muted}>
                {WD[i]}
              </T>
              <View style={[styles.calNum, isToday && styles.calToday]}>
                <T v="body" style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }} color={isToday ? colors.bg : date < td ? colors.textDim : colors.text}>
                  {dayNum(date)}
                </T>
              </View>
              <View style={styles.calMarkBox}>
                {st === 'done' ? (
                  <View style={styles.calDone}>
                    <Icon name="checkmark" size={10} color={colors.onAccent} />
                  </View>
                ) : st === 'today' || st === 'planned' ? (
                  <View style={styles.calDot} />
                ) : st === 'missed' ? (
                  <View style={styles.calMissed} />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </SlideIn>
    </View>
  );
}

/** Плавная смена недели: содержимое въезжает с той стороны, куда листали */
function SlideIn({ dir, style, children }: { dir: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const [a] = useState(() => new Animated.Value(dir && !prefersReducedMotion() ? 0 : 1));
  useEffect(() => {
    if (!dir || prefersReducedMotion()) return;
    Animated.spring(a, { toValue: 1, useNativeDriver: Platform.OS !== 'web', speed: 16, bounciness: 4 }).start();
  }, [a, dir]);
  return <Animated.View style={[style, { opacity: a, transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [dir * 36, 0] }) }] }]}>{children}</Animated.View>;
}

/** День недели: дата слева, тренировка и её параметры, справа — статус. Сегодня — единственная лаймовая кнопка */
function AgendaRow({ day, last, customs, tw, onRestTrain }: { day: AgendaDay; last: boolean; customs: Exercise[]; tw: ReturnType<typeof useTodayWorkout>; onRestTrain: () => void }) {
  const wd = WD[weekdayIndexOf(day.date)];
  const num = Number(day.date.slice(8, 10));
  const t = day.template;
  const s = day.session;
  const isToday = day.status === 'today' || (day.status === 'rest' && day.date === today());
  const title = s?.name ?? t?.name ?? 'Отдых';
  const sub =
    day.status === 'done' && s
      ? (() => {
          const st = sessionStats(s, [s], customs, new Map());
          return `${st.minutes} мин · ${st.sets} подх.${st.tonnage ? ` · ${fmtTonnage(st.tonnage)}` : ''}`;
        })()
      : day.status === 'today'
        ? `~${tw.estMinutes || t?.estMinutes || 0} мин · ${tw.totalSets || t?.exercises.reduce((a, e) => a + e.sets, 0) || 0} подходов`
        : day.status === 'missed'
          ? 'пропущено'
          : '';
  const open = () => {
    haptic.tap();
    if (s) router.push({ pathname: '/workout/[id]', params: { id: s.id } });
    else if (t) router.push({ pathname: '/workout/preview', params: { templateId: t.id } });
  };
  return (
    <View style={[styles.agendaRow, !last && styles.agendaLine]}>
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${wd} ${num}: ${title}, ${day.status === 'done' ? 'сделано' : day.status === 'today' ? 'сегодня' : day.status === 'missed' ? 'пропущено' : day.status === 'rest' ? 'отдых' : 'по плану'}`}
      onPress={open}
      disabled={!s && !t}
      scaleTo={0.985}
      style={styles.agendaTap}
    >
      <T v="small" style={styles.agendaDate} color={isToday ? colors.text : colors.muted}>
        {wd}
        {'\n'}
        <T v="h3" color={isToday ? colors.text : day.status === 'done' ? colors.textDim : colors.text}>
          {num}
        </T>
      </T>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body" style={{ fontWeight: isToday ? '800' : '600', fontSize: isToday ? 18 : 16 }} color={day.status === 'missed' || day.status === 'rest' ? colors.textDim : colors.text} numberOfLines={1}>
          {title}
        </T>
        {sub ? (
          <T v="small" numberOfLines={1} style={{ fontSize: 13 }}>
            {sub}
          </T>
        ) : null}
      </View>
    </Tap>
      {day.status === 'done' ? (
        <View style={styles.doneMark}>
          <Icon name="checkmark" size={15} color={colors.bg} />
        </View>
      ) : day.status === 'today' ? (
        <Button title="Начать" size="sm" onPress={() => startTodayPlanned()} />
      ) : day.status === 'rest' && isToday ? (
        <Button title="Всё равно" size="sm" variant="secondary" onPress={onRestTrain} accessibilityLabel="Тренировка вне плана" />
      ) : null}
    </View>
  );
}

function NavRow({ title, sub, label, onPress, last }: { title: string; sub?: string; label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => { haptic.tap(); onPress(); }} style={({ pressed }) => [styles.navRow, !last && styles.navLine, pressed && { opacity: 0.6 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body" style={{ fontWeight: '600' }}>
          {title}
        </T>
        {sub ? (
          <T v="small" numberOfLines={1} style={{ fontSize: 13 }}>
            {sub}
          </T>
        ) : null}
      </View>
      <Icon name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

const SPLIT_CHOICES: Exclude<SplitPreference, 'auto' | 'custom'>[] = ['fullbody', 'upper_lower', 'torso_limbs', 'ppl', 'ul_ppl', 'bro'];

/** Коротко и по-русски: что значит каждый сплит */
const SPLIT_DESC: Record<Exclude<SplitPreference, 'auto' | 'custom'>, string> = {
  fullbody: 'Каждая тренировка — всё тело. Мышца работает 2–3 раза в неделю, удобно при 2–3 днях.',
  upper_lower: 'Чередуешь верх и низ тела. Классика для 4 дней: каждая мышца — 2 раза в неделю.',
  torso_limbs: 'День торса (грудь, спина, плечи) и день конечностей (ноги, руки).',
  ppl: 'Жимовая (грудь, плечи, трицепс) · тяговая (спина, бицепс) · ноги. Для 3 или 6 дней.',
  ul_ppl: 'Верх и низ + жимовая, тяговая и ноги. Подходит для 5 дней.',
  bro: 'Одна-две группы мышц в день. Много подходов на группу, но мышца работает раз в неделю.',
};

type Choice = Exclude<SplitPreference, 'auto' | 'custom'>;

/**
 * План: сверху — твой текущий план (неделя и тренировки). Сплит меняется одной кнопкой: она раскрывает
 * список вариантов. Для выбранного варианта FORM собирает тренировки ПОД ТЕБЯ — дни и время, недельный объём,
 * исключённые упражнения, ограничения, оборудование, восстановление — и показывает до применения.
 */
function PlanContent({ onDone }: { onDone: () => void }) {
  const plan = usePlan((s) => s.plan);
  const profile = useProfile((s) => s.profile);
  const sessions = useWorkouts((s) => s.sessions);
  const customs = useWorkouts((s) => s.customExercises);
  const [pick, setPick] = useState<Choice | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const preview = useMemo(() => {
    if (!profile || !plan || !pick) return null;
    const prefs = getPrefs(profile);
    const recovery = estimateRecovery({ profile: prefs.recoveryProfile, sessions, checkins: useCheckins.getState().byDate, health: useHealth.getState().days });
    return generatePlan(withPrefs(profile, { preferredSplit: pick }), { previous: plan, sessions, customs, recovery });
  }, [profile, plan, pick, sessions, customs]);
  if (!plan || !profile) return <EmptyState icon="calendar-outline" title="Плана пока нет" text={`Заполни профиль — ${BRAND} создаст план автоматически.`} action="Профиль" onAction={() => router.push('/profile')} />;
  const prefs = getPrefs(profile);
  const changing = !!preview && preview.split !== plan.split;
  const shown = changing ? preview : plan;
  const best = plan.splitChoice?.candidates?.[0]?.split;
  const cand = plan.splitChoice?.candidates?.find((c) => c.split === shown.split);
  const choose = (sp: Choice) => {
    haptic.tap();
    setListOpen(false);
    setPick(sp);
  };

  return (
        <View style={{ gap: space.sm }}>
          {/* 1. Твой план — крупно, без карточки */}
          <View style={{ gap: 6, marginTop: space.sm }}>
            <T v="caption">Твой план</T>
            <T v="display" style={{ fontSize: 34 }}>{plan.splitLabel}</T>
            <T v="bodyDim">
              {plan.daysPerWeek} {plan.daysPerWeek === 1 ? 'тренировка' : plan.daysPerWeek < 5 ? 'тренировки' : 'тренировок'} в неделю · {plan.sessionMinutes[0]}–{plan.sessionMinutes[1]} мин
              {prefs.excluded.length ? ` · исключено упражнений: ${prefs.excluded.length}` : ''}
            </T>
            <View style={{ marginTop: space.sm }}>
              <WeekStrip plan={plan} />
            </View>
          </View>

          {/* 2. Сплит — одна кнопка, раскрывает список */}
          <Pressable accessibilityRole="button" accessibilityLabel="Сменить сплит" accessibilityState={{ expanded: listOpen }} onPress={() => { haptic.tap(); setListOpen(!listOpen); }} style={[styles.dropBtn, { marginTop: space.md }]}>
            <View style={{ flex: 1 }}>
              <T v="small">Сплит</T>
              <T v="body" style={{ fontWeight: '700' }}>
                {changing && pick ? `${SPLIT_PREF_LABEL[pick]} — предпросмотр` : plan.splitLabel}
              </T>
            </View>
            <Icon name={listOpen ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textDim} />
          </Pressable>
          {listOpen ? (
            <View style={styles.dropList}>
              {SPLIT_CHOICES.map((sp, i) => {
                const current = plan.split === sp || (sp === 'ppl' && plan.split === 'ppl_x2');
                const selected = changing ? pick === sp : current;
                return (
                  <Pressable key={sp} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => {
                      if (!current) return choose(sp);
                      setPick(null);
                      setListOpen(false);
                    }} style={[styles.dropItem, i > 0 && { borderTopWidth: 0.5, borderTopColor: colors.borderStrong }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <T v="body" style={{ fontWeight: '700' }}>
                          {SPLIT_PREF_LABEL[sp]}
                        </T>
                        {current ? <T v="small">· сейчас</T> : null}
                        {best === sp ? <T v="small" color={colors.accent} style={{ fontWeight: '600' }}>· лучший для тебя</T> : null}
                      </View>
                      <T v="small" style={{ fontSize: 13 }}>
                        {SPLIT_DESC[sp]}
                      </T>
                    </View>
                    <Icon name={selected ? 'checkmark' : 'ellipse-outline'} size={20} color={selected ? colors.text : colors.borderStrong} />
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* 3. Предпросмотр нового сплита */}
          {changing ? (
            <Card style={{ gap: 8 }}>
              <T v="h3">{shown.splitLabel}: так будет выглядеть неделя</T>
              <T v="small">
                {shown.daysPerWeek}× в неделю · {shown.sessionMinutes[0]}–{shown.sessionMinutes[1]} мин · твои исключения и ограничения учтены
              </T>
              {cand ? (
                <View style={{ gap: 2 }}>
                  {cand.pros.slice(0, 3).map((x) => (
                    <T key={x} v="small" color={colors.text} style={{ fontSize: 12 }}>
                      <T v="small" color={colors.accent} style={{ fontWeight: '800', fontSize: 12 }}>+ </T>
                      {x}
                    </T>
                  ))}
                  {cand.cons.slice(0, 2).map((x) => (
                    <T key={x} v="small" color={colors.text} style={{ fontSize: 12 }}>
                      <T v="small" color={colors.warning} style={{ fontWeight: '800', fontSize: 12 }}>− </T>
                      {x}
                    </T>
                  ))}
                </View>
              ) : null}
              <WeekStrip plan={shown} />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <Button
                  title="Перейти на этот сплит"
                  icon="checkmark"
                  size="sm"
                  style={{ flex: 1 }}
                  onPress={() => {
                    applyProfile(withPrefs(profile, { preferredSplit: pick! }));
                    setPick(null);
                    setListOpen(false);
                    haptic.success();
                    toast('План перестроен — упражнения с прогрессом сохранены');
                  }}
                />
                <Button title="Отмена" size="sm" variant="secondary" onPress={() => setPick(null)} />
              </View>
            </Card>
          ) : null}
          <T v="h3" style={{ marginTop: space.lg }}>{changing ? 'Тренировки нового сплита' : 'Тренировки плана'}</T>
          <View style={styles.navList}>
            {shown.templates.map((t, i) => (
              <TemplateRow key={t.id} t={t} editable={!changing} last={i === shown.templates.length - 1} onOpen={onDone} />
            ))}
          </View>
        </View>
  );
}

/** Тренировка плана одной строкой: тап — состав (упражнения, мышцы), карандаш — изменить */
function TemplateRow({ t, editable, last, onOpen }: { t: WorkoutTemplate; editable: boolean; last: boolean; onOpen: () => void }) {
  return (
    <View style={[styles.navRow, !last && styles.navLine]}>
      <Pressable
        style={{ flex: 1, gap: 2 }}
        disabled={!editable}
        onPress={() => {
          onOpen();
          afterModalClose(() => router.push({ pathname: '/workout/preview', params: { templateId: t.id } }));
        }}
        accessibilityRole="button"
      >
        <T v="body" style={{ fontWeight: '700' }}>
          {t.name}
        </T>
        <T v="small" style={{ fontSize: 13 }}>
          {t.focus} · ~{t.estMinutes} мин · {t.exercises.reduce((a, e) => a + e.sets, 0)} подх.
        </T>
      </Pressable>
      {editable ? (
        <Pressable
          hitSlop={8}
          onPress={() => {
            onOpen();
            afterModalClose(() => router.push({ pathname: '/workout/builder', params: { templateId: t.id } }));
          }}
          accessibilityLabel={`Изменить ${t.name}`}
          style={{ padding: 6 }}
        >
          <Icon name="create-outline" size={20} color={colors.textDim} />
        </Pressable>
      ) : null}
    </View>
  );
}

type JournalRow = { kind: 'week'; key: string; title: string; stats: WeekStats; first?: boolean } | { kind: 'item'; key: string; s: WorkoutSession; stats: SessionStats };

/**
 * Дневник (по мотивам Fitsession): итоги недели плашками, календарь с цветами тренировок,
 * лента по неделям — название, смайл ощущения, время, объём, рекорды, заметка. Тап — подробности и «Повторить».
 */
function HistoryTab({ bottom, calOpen, setCalOpen }: { bottom: number; calOpen: boolean; setCalOpen: (v: boolean) => void }) {
  const sessions = useWorkouts((s) => s.sessions);
  const customs = useWorkouts((s) => s.customExercises);
  const d = today();
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const daySrc = useDaySources();
  const { rows, streak, total } = useMemo(() => {
    const prs = prCounts(sessions, customs);
    const sections = journalSections(sessions, d, customs, prs);
    const out: JournalRow[] = [];
    for (const sec of sections) {
      out.push({ kind: 'week', key: `w${sec.weekStart}`, title: sec.title, stats: sec.stats, first: !out.length });
      for (const x of sec.sessions) out.push({ kind: 'item', key: x.id, s: x, stats: sessionStats(x, sessions, customs, prs) });
    }
    return { rows: out, streak: weekStreak(sessions, d), total: sessions.filter((x) => x.status === 'completed').length };
  }, [sessions, customs, d]);
  const renderItem = useCallback(({ item }: { item: JournalRow }) => (item.kind === 'week' ? <WeekHeader title={item.title} stats={item.stats} streak={item.first ? streak : 0} /> : <JournalCard s={item.s} stats={item.stats} customs={customs} />), [customs, streak]);
  if (!total) return <EmptyState icon="book-outline" title="Дневник пуст" text="Заверши первую тренировку — здесь появятся результаты, веса и рекорды по неделям." />;
  return (
    <>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={renderItem}
        initialNumToRender={14}
        windowSize={9}
        contentContainerStyle={{ paddingBottom: bottom }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<View testID="journal-week" />}
      />
      <Sheet visible={calOpen} onClose={() => setCalOpen(false)} title="Календарь" subtitle="Тап по дню — тренировка, сон, питание и вес">
        <TrainingCalendar initiallyOpen today={d} src={daySrc} onSelect={(x) => { setCalOpen(false); afterModalClose(() => setDayOpen(x)); }} />
      </Sheet>
      <DayDetailsSheet date={dayOpen} onClose={() => setDayOpen(null)} />
    </>
  );
}

function fmtTonnage(kg: number): string {
  return kg >= 1000 ? `${fmtNum(kg / 1000, 1)} т` : `${fmtNum(kg)} кг`;
}

const WeekHeader = React.memo(function WeekHeader({ title, stats, streak }: { title: string; stats: WeekStats; streak: number }) {
  return (
    <View style={styles.weekHead} accessibilityRole="header">
      <T v="h3">
        {title}
        <T v="small" style={{ fontSize: 13 }}>
          {`   ${stats.workouts} ${plural(stats.workouts, 'тренировка', 'тренировки', 'тренировок')}${stats.prs ? ` · ${stats.prs} ${plural(stats.prs, 'рекорд', 'рекорда', 'рекордов')}` : ''}`}
        </T>
        {streak >= 2 ? (
          <T v="small" style={{ fontSize: 13 }} color={colors.warning} accessibilityLabel={`Серия: ${streak} ${plural(streak, 'неделя', 'недели', 'недель')} подряд с тренировками`}>
            {`  🔥 ${streak} ${plural(streak, 'неделя', 'недели', 'недель')} подряд`}
          </T>
        ) : null}
      </T>
    </View>
  );
});

/** Тренировка в дневнике — строка без карточки: цвет типа, название, дата и объём одной строкой, ощущение, заметка */
const JournalCard = React.memo(function JournalCard({ s, stats, customs }: { s: WorkoutSession; stats: SessionStats; customs: Exercise[] }) {
  const kind = sessionKind(s, customs);
  const emoji = sessionEmoji(s);
  const parts = [journalDay(s.date, today()), `${stats.minutes} мин`, stats.tonnage ? fmtTonnage(stats.tonnage) : '', stats.prs ? `🏆 ${stats.prs}` : ''].filter(Boolean);
  return (
    <Tap accessibilityRole="button" onPress={() => { haptic.tap(); router.push({ pathname: '/workout/[id]', params: { id: s.id } }); }} accessibilityLabel={`${s.name}, ${journalDay(s.date, today())}, ${KIND_LABEL[kind]}`} scaleTo={0.985} style={styles.jRow}>
      {/* Свой цвет тренировки (выбран при создании) — иначе цвет по типу */}
      <View style={[styles.kindDot, { backgroundColor: s.color ? WORKOUT_COLORS[s.color] : colors[KIND_COLOR[kind]] }]} />
      <View style={{ flex: 1, gap: 3 }}>
        <T v="body" style={{ fontWeight: '700', fontSize: 17 }} numberOfLines={1}>
          {s.name}
          {emoji ? ` ${emoji}` : ''}
        </T>
        <T v="small" style={{ fontVariant: ['tabular-nums'], fontSize: 13 }} numberOfLines={s.notes ? 2 : 1}>
          {parts.join(' · ')}
          {s.notes ? <T v="small" style={{ fontStyle: 'italic', fontSize: 13 }}>{`\n«${s.notes}»`}</T> : null}
        </T>
      </View>
    </Tap>
  );
});

const styles = themed({
  weekHero: { marginTop: space.lg },
  cal: { marginTop: space.xs, paddingVertical: 10, paddingHorizontal: 6, borderRadius: radius.xl, backgroundColor: colors.surface },
  calHead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, marginBottom: 6 },
  calArrow: { width: 36, height: 32, alignItems: 'center', justifyContent: 'center' },
  calRow: { flexDirection: 'row' },
  calDay: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4 },
  calNum: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  calToday: { backgroundColor: colors.text },
  calMarkBox: { height: 14, alignItems: 'center', justifyContent: 'center' },
  calDone: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  calDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.textDim },
  calMissed: { width: 8, height: 8, borderRadius: 4, borderWidth: 1.5, borderColor: colors.warning },
  agendaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 66 },
  agendaTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  agendaLine: { borderBottomWidth: 0.5, borderBottomColor: colors.borderStrong },
  agendaDate: { width: 34, textAlign: 'center', fontSize: 12, lineHeight: 18 },
  doneMark: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  navList: { marginTop: space.xl, borderRadius: radius.lg, backgroundColor: colors.surface, paddingLeft: space.md },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingRight: space.md, minHeight: 56 },
  navLine: { borderBottomWidth: 0.5, borderBottomColor: colors.borderStrong },
  dropBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.md, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  dropList: { borderRadius: radius.lg, backgroundColor: colors.surface2, overflow: 'hidden' },
  dropItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: space.md, paddingVertical: 14 },
  weekHead: { gap: 2, marginTop: space.xl, marginBottom: space.xs },
  kindDot: { width: 8, height: 8, borderRadius: 4, marginTop: 8, alignSelf: 'flex-start' },
  jRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.borderStrong },
  calBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  plusBtn: { marginLeft: 8 },
});
