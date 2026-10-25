import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { Exercise, ISODate, MuscleGroup, PlannedWorkout, WorkoutSession } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Button, Chip, Icon, T, type IconName } from '@/components/ui';
import { Tap } from '@/components/motion';
import { Sheet } from '@/components/Sheet';
import { afterModalClose } from '@/components/modalGate';
import { confirm, toast } from '@/components/Dialog';
import { haptic } from '@/services/haptics';
import { useWorkouts } from '@/stores/workouts';
import { useSchedule } from '@/stores/schedule';
import { usePlan } from '@/stores/plan';
import { useProfile } from '@/stores/profile';
import { getExercise, GROUP_LABEL } from '@/data/exercises';
import { GOAL_SHORT } from '@/features/nutrition/targets';
import { TrainingCalendar } from '@/features/day/Calendar';
import { DayDetailsSheet, useDaySources } from '@/features/day/DayDetails';
import { addDays, daysBetween, plural, startOfWeek, toISODate, today } from '@/utils/date';
import { fmtNum } from '@/utils/format';
import { WORKOUT_COLORS } from './colors';
import { KIND_COLOR, KIND_LABEL, journalDay, periodStats, prCounts, sessionEmoji, sessionKind, sessionStats, weekStreak, type SessionStats, type WeekStats } from './journal';
import { applyFilter, filterActive, groupByWeek, periodRange, trainingSections, upcomingWithProgram, type ListItem, type Period } from './library';
import { weekAgenda } from './weekAgenda';
import { estimateMinutes } from './planGenerator';
import { resumeActive, startTodayPlanned } from './actions';
import { movePlanned, removePlanned, restorePlanned, skipPlanned, startPlanned } from './planning';
import { planningDayLabel } from './hub';
import { PlanDays } from './TrainingHub';

export interface HistoryFilter {
  period: Period;
  groups: MuscleGroup[];
  status: 'all' | 'done' | 'missed';
}

export const EMPTY_FILTER: HistoryFilter = { period: 'all', groups: [], status: 'all' };
export const isFiltered = (f: HistoryFilter) => filterActive({ ...periodRange(f.period, today()), groups: f.groups, status: f.status });

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'Всё время' },
  { key: 'week', label: '7 дней' },
  { key: 'month', label: '30 дней' },
  { key: 'quarter', label: '3 месяца' },
  { key: 'year', label: 'Год' },
];
const GROUPS = Object.keys(GROUP_LABEL) as MuscleGroup[];

type Row = { kind: 'week'; key: string; title: string; stats: WeekStats; first: boolean } | { kind: 'session'; key: string; s: WorkoutSession; stats: SessionStats } | { kind: 'missed'; key: string; item: ListItem };

function fmtTonnage(kg: number): string {
  return kg >= 1000 ? `${fmtNum(kg / 1000, 1)} т` : `${fmtNum(kg)} кг`;
}

/** «Сегодня», «Завтра», «Пт, 31 окт» */
function dayLabel(date: ISODate, d: ISODate) {
  return planningDayLabel(date, d);
}

/**
 * «Мои тренировки» (эталон 03_anatomy · «Тренировки»): текущая программа, идёт сейчас, сегодня, ближайшие и вся
 * история по неделям — выполненные и пропущенные, без обрезки и без склейки одинаковых названий. Фильтры —
 * по дате, группам мышц и статусу; календарь дня — отдельной кнопкой.
 */
export function MyWorkouts({ bottom, filter, setFilter, filterOpen, setFilterOpen, calOpen, setCalOpen, onProgram }: {
  bottom: number;
  filter: HistoryFilter;
  setFilter: (f: HistoryFilter) => void;
  filterOpen: boolean;
  setFilterOpen: (v: boolean) => void;
  calOpen: boolean;
  setCalOpen: (v: boolean) => void;
  onProgram: () => void;
}) {
  const sessions = useWorkouts((s) => s.sessions);
  const active = useWorkouts((s) => s.active);
  const customs = useWorkouts((s) => s.customExercises);
  const planned = useSchedule((s) => s.planned);
  const plan = usePlan((s) => s.plan);
  const overrides = usePlan((s) => s.overrides);
  const goal = useProfile((s) => s.profile?.goal);
  const d = today();
  const [open, setOpen] = useState<PlannedWorkout | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null);
  const daySrc = useDaySources();

  const sections = useMemo(() => trainingSections({ sessions, planned, active, today: d, customs }), [sessions, planned, active, d, customs]);
  const soon = useMemo(() => {
    const ws = startOfWeek(d);
    const agenda = [...weekAgenda({ today: d, plan, sessions, overrides, weekStart: ws }), ...weekAgenda({ today: d, plan, sessions, overrides, weekStart: addDays(ws, 7) })];
    const r = upcomingWithProgram({ upcoming: sections.upcoming, agenda, today: d, customs });
    // Уже идущая тренировка не дублируется в «Сегодня»
    const running = (x: ListItem) => !!active && ((x.planned && active.plannedId === x.planned.id) || (x.kind === 'program' && active.source === 'plan' && active.templateId === x.template?.id));
    return { today: r.today.filter((x) => !running(x)), next: r.next };
  }, [d, plan, sessions, overrides, sections.upcoming, customs, active]);
  const prs = useMemo(() => prCounts(sessions, customs), [sessions, customs]);
  const range = periodRange(filter.period, d);
  const shown = useMemo(() => applyFilter(sections.history, { ...range, groups: filter.groups, status: filter.status }), [sections.history, range.from, range.to, filter.groups, filter.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const streak = useMemo(() => weekStreak(sessions, d), [sessions, d]);
  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const w of groupByWeek(shown, d)) {
      const done = w.items.filter((x) => x.session).map((x) => x.session!);
      out.push({ kind: 'week', key: `w${w.weekStart}`, title: w.title, stats: periodStats(done, w.weekStart, addDays(w.weekStart, 6), customs, prs), first: !out.length });
      for (const it of w.items) out.push(it.session ? { kind: 'session', key: it.key, s: it.session, stats: sessionStats(it.session, sessions, customs, prs) } : { kind: 'missed', key: it.key, item: it });
    }
    return out;
  }, [shown, d, customs, prs, sessions]);
  const filtered = isFiltered(filter);
  const weekNo = plan ? Math.max(1, Math.floor(daysBetween(toISODate(new Date(plan.createdAt)), d) / 7) + 1) : 0;

  const openItem = (x: ListItem) => {
    haptic.tap();
    if (x.planned) setOpen(x.planned);
    else if (x.template) router.push({ pathname: '/workout/preview', params: { templateId: x.template.id } });
  };
  const startItem = (x: ListItem) => {
    if (x.planned) startPlanned(x.planned);
    else if (x.template) startTodayPlanned();
  };

  const renderItem = useCallback(
    ({ item }: { item: Row }) =>
      item.kind === 'week' ? (
        <WeekHeader title={item.title} stats={item.stats} streak={item.first && !filtered ? streak : 0} />
      ) : item.kind === 'session' ? (
        <JournalCard s={item.s} stats={item.stats} customs={customs} />
      ) : (
        <MissedRow item={item.item} onPress={() => { haptic.tap(); setOpen(item.item.planned!); }} />
      ),
    [customs, streak, filtered],
  );

  const header = (
    <View style={{ gap: space.sm }}>
      {plan ? (
        <Tap accessibilityRole="button" accessibilityLabel={`Текущая программа: ${plan.splitLabel}`} onPress={() => { haptic.tap(); onProgram(); }} scaleTo={0.985} style={styles.card} testID="mine-program">
          <View style={styles.cardIcon}>
            <Icon name="barbell-outline" size={20} color={colors.accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="body" style={{ fontWeight: '700' }}>
              Текущая программа
            </T>
            <T v="small" numberOfLines={1} style={{ fontSize: 13 }}>
              {[plan.splitLabel, goal ? GOAL_SHORT[goal] : null, `неделя ${weekNo}`].filter(Boolean).join(' · ')}
            </T>
          </View>
          <Icon name="chevron-forward" size={18} color={colors.muted} />
        </Tap>
      ) : null}

      {active ? (
        <>
          <Section title="Идёт сейчас" />
          <TodayCard icon="play" title={active.name} sub={`Выполнено подходов: ${active.exercises.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0)} · ${active.exercises.length} упр.`} action="Продолжить" onAction={resumeActive} onPress={resumeActive} testID="mine-active" />
        </>
      ) : null}

      <Section title="Сегодня" />
      {soon.today.length ? (
        soon.today.map((x) => (
          <TodayCard
            key={x.key}
            icon={x.kind === 'program' ? 'barbell-outline' : 'calendar-outline'}
            title={x.title}
            sub={`${x.exercises} ${plural(x.exercises, 'упражнение', 'упражнения', 'упражнений')} · ~${estimateMinutes(x.template?.exercises ?? x.planned?.exercises ?? [], customs)} мин${x.groups.length ? ` · ${x.groups.slice(0, 3).map((g) => GROUP_LABEL[g]).join(', ')}` : ''}`}
            action="Начать"
            onAction={() => startItem(x)}
            onPress={() => openItem(x)}
            testID={x.kind === 'program' ? 'mine-today' : 'mine-today-planned'}
          />
        ))
      ) : (
        <T v="small" style={{ paddingVertical: 6 }} testID="mine-today-empty">
          {sessions.some((s) => s.status === 'completed' && s.date === d) ? 'Тренировка сегодня уже сделана — она в истории ниже.' : 'На сегодня ничего не запланировано. «+» — начать или запланировать.'}
        </T>
      )}

      {soon.next.length ? (
        <>
          <Section title="Ближайшие" />
          <View style={styles.list}>
            {soon.next.map((x, i) => (
              <UpcomingRow key={x.key} item={x} label={dayLabel(x.date, d)} last={i === soon.next.length - 1} onPress={() => openItem(x)} />
            ))}
          </View>
        </>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.lg }}>
        <T v="h3" style={{ flex: 1 }} accessibilityRole="header">
          История тренировок
        </T>
        {filtered ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Сбросить фильтры" hitSlop={8} onPress={() => { haptic.tap(); setFilter(EMPTY_FILTER); }}>
            <T v="small" color={colors.accent} style={{ fontWeight: '700' }}>
              Сбросить
            </T>
          </Pressable>
        ) : null}
      </View>
      {filtered ? (
        <T v="small" style={{ fontSize: 13 }} testID="history-filter-summary">
          {filterSummary(filter, d)} · найдено: {shown.length}
        </T>
      ) : null}
      <View testID="journal-week" />
    </View>
  );

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
        ListHeaderComponent={header}
        ListEmptyComponent={
          <T v="small" style={{ paddingVertical: space.md }}>
            {filtered ? 'По этим фильтрам тренировок нет.' : 'Заверши первую тренировку — здесь появятся результаты, веса и рекорды по неделям.'}
          </T>
        }
      />
      <PlannedSheet p={open} onClose={() => setOpen(null)} customs={customs} />
      <FilterSheet visible={filterOpen} onClose={() => setFilterOpen(false)} value={filter} onChange={setFilter} count={(f) => applyFilter(sections.history, { ...periodRange(f.period, d), groups: f.groups, status: f.status }).length} />
      <Sheet visible={calOpen} onClose={() => setCalOpen(false)} title="Календарь" subtitle="Тап по дню — тренировка, сон, питание и вес">
        <TrainingCalendar initiallyOpen today={d} src={daySrc} onSelect={(x) => { setCalOpen(false); afterModalClose(() => setDayOpen(x)); }} />
      </Sheet>
      <DayDetailsSheet date={dayOpen} onClose={() => setDayOpen(null)} />
    </>
  );
}

function filterSummary(f: HistoryFilter, d: ISODate): string {
  const parts: string[] = [];
  if (f.period !== 'all') {
    if (f.period.startsWith('m:')) {
      const [y, m] = f.period.slice(2).split('-').map(Number);
      parts.push(`${MONTHS[m - 1]}${String(y) !== d.slice(0, 4) ? ` ${y}` : ''}`);
    } else parts.push(PERIODS.find((p) => p.key === f.period)!.label);
  }
  if (f.groups.length) parts.push(f.groups.map((g) => GROUP_LABEL[g]).join(', '));
  if (f.status !== 'all') parts.push(f.status === 'done' ? 'выполненные' : 'пропущенные');
  return parts.join(' · ');
}

function Section({ title }: { title: string }) {
  return (
    <T v="h3" style={{ marginTop: space.md }} accessibilityRole="header">
      {title}
    </T>
  );
}

/** Сегодняшняя тренировка — выделенная карточка с круглой кнопкой старта (эталон: зелёная рамка и ▶) */
function TodayCard({ icon, title, sub, action, onAction, onPress, testID }: { icon: IconName; title: string; sub: string; action: string; onAction: () => void; onPress: () => void; testID?: string }) {
  return (
    <View style={[styles.card, styles.todayCard]} testID={testID}>
      <Tap accessibilityRole="button" accessibilityLabel={`${title}: состав`} onPress={onPress} scaleTo={0.985} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={styles.cardIcon}>
          <Icon name={icon} size={20} color={colors.accent} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="body" style={{ fontWeight: '800', fontSize: 17 }} numberOfLines={1}>
            {title}
          </T>
          <T v="small" numberOfLines={2} style={{ fontSize: 13 }}>
            {sub}
          </T>
        </View>
      </Tap>
      <Tap accessibilityRole="button" accessibilityLabel={`${action}: ${title}`} onPress={() => { haptic.light(); onAction(); }} scaleTo={0.9} style={styles.play} hitSlop={6}>
        <Icon name="play" size={20} color={colors.onAccent} />
      </Tap>
    </View>
  );
}

function UpcomingRow({ item, label, last, onPress }: { item: ListItem; label: string; last: boolean; onPress: () => void }) {
  const manual = item.kind === 'planned';
  const color = item.planned?.color ? WORKOUT_COLORS[item.planned.color] : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${label}${manual ? ', запланировано' : ', по программе'}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.line, pressed && { opacity: 0.6 }]}
      testID="mine-upcoming"
    >
      <View style={[styles.rowIcon, color ? { backgroundColor: color } : null]}>
        <Icon name={manual ? 'calendar-outline' : 'barbell-outline'} size={17} color={color ? colors.onAccent : colors.textDim} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="body" style={{ fontWeight: '700' }} numberOfLines={1}>
          {item.title}
        </T>
        <T v="small" style={{ fontSize: 13 }} numberOfLines={1}>
          {label} · {item.exercises} {plural(item.exercises, 'упражнение', 'упражнения', 'упражнений')}
        </T>
      </View>
      <Icon name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

function MissedRow({ item, onPress }: { item: ListItem; onPress: () => void }) {
  const status = item.status === 'skipped' ? 'пропущено (отмечено)' : 'пропущено';
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${item.title}, ${journalDay(item.date, today())}, ${status}`} onPress={onPress} scaleTo={0.985} style={styles.jRow} testID="history-missed">
      <View style={[styles.kindDot, styles.missedDot]} />
      <View style={{ flex: 1, gap: 3 }}>
        <T v="body" style={{ fontWeight: '700', fontSize: 17 }} color={colors.textDim} numberOfLines={1}>
          {item.title}
        </T>
        <T v="small" style={{ fontSize: 13 }}>
          {journalDay(item.date, today())} · {status}
        </T>
      </View>
      <View style={styles.missedMark}>
        <Icon name="close" size={13} color={colors.warning} />
      </View>
    </Tap>
  );
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

/** Выполненная тренировка: цвет, название, день · время · объём · рекорды, заметка; справа — отметка «выполнено» */
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
      <View style={styles.doneMark}>
        <Icon name="checkmark" size={14} color={colors.onAccent} />
      </View>
    </Tap>
  );
});

/**
 * Запланированная тренировка: состав и действия — начать, перенести, пропустить/вернуть, удалить.
 * Просроченная без отметки показывается «пропущено», но её можно выполнить или перенести.
 */
function PlannedSheet({ p, onClose, customs }: { p: PlannedWorkout | null; onClose: () => void; customs: Exercise[] }) {
  const d = today();
  const [moving, setMoving] = useState(false);
  const [date, setDate] = useState(d);
  const [shownFor, setShownFor] = useState<string | null>(null);
  if ((p?.id ?? null) !== shownFor) {
    setShownFor(p?.id ?? null);
    setMoving(false);
    setDate(p && p.date >= d ? p.date : d);
  }
  // Последнее открытое содержимое держим, пока шторка уезжает
  const [last, setLast] = useState<PlannedWorkout | null>(null);
  if (p && p !== last) setLast(p);
  const x = p ?? last;
  if (!x) return null;
  const overdue = x.status === 'planned' && x.date < d;
  const statusText = x.status === 'done' ? 'выполнено' : x.status === 'skipped' ? 'пропущено (отмечено)' : overdue ? 'пропущено' : 'запланировано';
  const source = x.source === 'plan' ? 'тренировка программы' : x.source === 'template' ? 'мой шаблон' : x.source === 'repeat' ? 'повтор прошлой' : 'своя тренировка';
  const act = (fn: () => void) => {
    onClose();
    afterModalClose(fn);
  };
  return (
    <Sheet visible={!!p} onClose={onClose} title={x.name} subtitle={`${planningDayLabel(x.date, d)} · ${statusText} · ${source}`}>
      <View style={{ gap: space.sm }} testID="planned-sheet">
        <View style={styles.exList}>
          {x.exercises.map((e, i) => (
            <T key={`${e.exerciseId}-${i}`} v="small" color={colors.text} numberOfLines={1}>
              {getExercise(e.exerciseId, customs)?.name ?? e.exerciseId}
              <T v="small">{`  ${e.sets} × ${e.repMin}–${e.repMax}`}</T>
            </T>
          ))}
          <T v="small" style={{ marginTop: 4 }}>
            ~{estimateMinutes(x.exercises, customs)} мин
          </T>
        </View>
        {x.status !== 'done' ? (
          <Button title={overdue || x.status === 'skipped' ? 'Выполнить сейчас' : 'Начать'} icon="play" onPress={() => act(() => startPlanned(x))} testID="planned-start" />
        ) : null}
        {x.status !== 'done' ? (
          moving ? (
            <View style={{ gap: space.sm }}>
              <PlanDays value={date} onChange={setDate} from={d} />
              <Button
                title={`Перенести: ${planningDayLabel(date, d).toLowerCase()}`}
                icon="calendar"
                variant="secondary"
                testID="planned-move-confirm"
                onPress={() => {
                  movePlanned(x, date);
                  haptic.success();
                  toast(`«${x.name}» — ${planningDayLabel(date, d).toLowerCase()}`, 'calendar');
                  onClose();
                }}
              />
            </View>
          ) : (
            <Button title="Перенести" icon="calendar-outline" variant="secondary" onPress={() => setMoving(true)} testID="planned-move" />
          )
        ) : null}
        {x.status === 'planned' ? (
          <Button title="Отметить пропущенной" icon="close-circle-outline" variant="secondary" onPress={() => { skipPlanned(x); toast('Отмечено: пропущено'); onClose(); }} testID="planned-skip" />
        ) : x.status === 'skipped' ? (
          <Button title="Вернуть в план" icon="refresh" variant="secondary" onPress={() => { restorePlanned(x); onClose(); }} />
        ) : null}
        {x.status === 'done' && x.doneSessionId ? (
          <Button title="Открыть выполненную" icon="checkmark-circle-outline" variant="secondary" onPress={() => act(() => router.push({ pathname: '/workout/[id]', params: { id: x.doneSessionId! } }))} />
        ) : null}
        <Button
          title="Удалить из плана"
          icon="trash-outline"
          variant="ghost"
          onPress={() => confirm('Удалить запланированную?', `«${x.name}» пропадёт из списка. История тренировок не изменится.`, 'Удалить', () => { removePlanned(x); onClose(); }, true)}
        />
      </View>
    </Sheet>
  );
}

/** Фильтры истории: период (последние дни или конкретный месяц), группы мышц, статус */
function FilterSheet({ visible, onClose, value, onChange, count }: { visible: boolean; onClose: () => void; value: HistoryFilter; onChange: (f: HistoryFilter) => void; count: (f: HistoryFilter) => number }) {
  const d = today();
  const [month, setMonth] = useState(() => d.slice(0, 7));
  const set = (patch: Partial<HistoryFilter>) => {
    haptic.tap();
    onChange({ ...value, ...patch });
  };
  const shiftMonth = (dir: number) => {
    const [y, m] = month.split('-').map(Number);
    const t = new Date(y, m - 1 + dir, 1);
    const next = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
    if (next > d.slice(0, 7)) return;
    setMonth(next);
    if (value.period.startsWith('m:')) set({ period: `m:${next}` });
  };
  const [y, m] = month.split('-').map(Number);
  const monthOn = value.period === `m:${month}`;
  const n = count(value);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Фильтры истории"
      footer={
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button title="Сбросить" variant="secondary" onPress={() => onChange(EMPTY_FILTER)} style={{ flex: 1 }} />
          <Button title={`Показать · ${n}`} onPress={onClose} style={{ flex: 1.4 }} testID="history-filter-apply" />
        </View>
      }
    >
      <View style={{ gap: space.md }} testID="history-filter-sheet">
        <T v="caption">Период</T>
        <View style={styles.chips}>
          {PERIODS.map((p) => (
            <Chip key={p.key} label={p.label} active={value.period === p.key} onPress={() => set({ period: p.key })} />
          ))}
        </View>
        <View style={styles.month}>
          <Pressable accessibilityRole="button" accessibilityLabel="Предыдущий месяц" hitSlop={8} onPress={() => shiftMonth(-1)} style={styles.monthArrow}>
            <Icon name="chevron-back" size={18} color={colors.textDim} />
          </Pressable>
          <Pressable accessibilityRole="radio" accessibilityState={{ checked: monthOn }} aria-checked={monthOn} accessibilityLabel={`Месяц: ${MONTHS[m - 1]} ${y}`} onPress={() => set({ period: monthOn ? 'all' : `m:${month}` })} style={[styles.monthPill, monthOn && { backgroundColor: colors.text }]}>
            <T v="body" style={{ fontWeight: '700' }} color={monthOn ? colors.bg : colors.text}>
              {MONTHS[m - 1]} {y}
            </T>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Следующий месяц" hitSlop={8} onPress={() => shiftMonth(1)} style={styles.monthArrow}>
            <Icon name="chevron-forward" size={18} color={month >= d.slice(0, 7) ? colors.borderStrong : colors.textDim} />
          </Pressable>
        </View>
        <T v="caption">Группы мышц</T>
        <View style={styles.chips}>
          {GROUPS.map((g) => {
            const on = value.groups.includes(g);
            return <Chip key={g} label={GROUP_LABEL[g]} active={on} onPress={() => set({ groups: on ? value.groups.filter((x) => x !== g) : [...value.groups, g] })} />;
          })}
        </View>
        <T v="caption">Статус</T>
        <View style={styles.chips}>
          <Chip label="Все" active={value.status === 'all'} onPress={() => set({ status: 'all' })} />
          <Chip label="Выполненные" active={value.status === 'done'} onPress={() => set({ status: 'done' })} />
          <Chip label="Пропущенные" active={value.status === 'missed'} onPress={() => set({ status: 'missed' })} />
        </View>
      </View>
    </Sheet>
  );
}

const styles = themed({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'transparent', minHeight: 64 },
  todayCard: { borderColor: colors.accentLine, backgroundColor: colors.surface2 },
  cardIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentDim, alignItems: 'center', justifyContent: 'center' },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  list: { borderRadius: radius.lg, backgroundColor: colors.surface, paddingLeft: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingRight: space.md, minHeight: 60 },
  line: { borderBottomWidth: 0.5, borderBottomColor: colors.borderStrong },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  weekHead: { gap: 2, marginTop: space.xl, marginBottom: space.xs },
  kindDot: { width: 8, height: 8, borderRadius: 4, marginTop: 8, alignSelf: 'flex-start' },
  missedDot: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.warning },
  jRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: colors.borderStrong },
  doneMark: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  missedMark: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.warning, alignItems: 'center', justifyContent: 'center' },
  exList: { gap: 4, padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  month: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthArrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  monthPill: { flex: 1, height: 40, borderRadius: radius.pill, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
});
