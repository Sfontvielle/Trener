import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { ISODate } from '@/types';
import { Sheet } from '@/components/Sheet';
import { Icon, T, type IconName } from '@/components/ui';
import { colors, radius, space, themed } from '@/theme';
import { useWorkouts } from '@/stores/workouts';
import { useNutrition, MEAL_LABEL } from '@/stores/nutrition';
import { useCheckins } from '@/stores/checkins';
import { useHealth } from '@/stores/health';
import { useBody } from '@/stores/body';
import { usePlan } from '@/stores/plan';
import { useLabs } from '@/stores/labs';
import { useEnhanced } from '@/stores/enhanced';
import { METRIC_META } from '@/features/progress/metrics';
import { formatDayLong, formatSleep, relativeDay, today, WEEKDAYS_SHORT, weekdayIndex } from '@/utils/date';
import { fmtWeight } from '@/utils/format';
import { buildDaySummary, type DaySources, type DaySummary } from './summary';

const FEEL: Record<string, string> = { easy: 'легко', ok: 'нормально', hard: 'тяжело', max: 'до отказа' };
const fmt1 = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** Все источники для DaySummary из сторов — один хук для Главной, календаря, истории и прогресса */
export function useDaySources(): DaySources {
  const sessions = useWorkouts((s) => s.sessions);
  const customs = useWorkouts((s) => s.customExercises);
  const entries = useNutrition((s) => s.entries);
  const checkins = useCheckins((s) => s.byDate);
  const health = useHealth((s) => s.days);
  const weights = useBody((s) => s.weights);
  const metrics = useBody((s) => s.metrics);
  const plan = usePlan((s) => s.plan);
  const labs = useLabs((s) => s.reports);
  const bp = useEnhanced((s) => s.bp);
  return useMemo(() => ({ sessions, customs, entries, checkins, health, weights, metrics, plan, labs, bp }), [sessions, customs, entries, checkins, health, weights, metrics, plan, labs, bp]);
}

export function useDaySummary(date: ISODate | null): DaySummary | null {
  const src = useDaySources();
  return useMemo(() => (date ? buildDaySummary(date, src) : null), [date, src]);
}

/** История дня: тренировка, питание, чек-ин, Health, замеры */
export function DayDetailsSheet({ date, onClose }: { date: ISODate | null; onClose: () => void }) {
  const s = useDaySummary(date);
  const title = date ? `${WEEKDAYS_SHORT[weekdayIndex(date)]}, ${formatDayLong(date)}` : '';
  // «Сегодня» / «Вчера» — полезная подпись; для старых дат она повторяет заголовок
  const rel = date ? relativeDay(date) : undefined;
  const sub = rel && !/\d/.test(rel) ? rel : undefined;
  return (
    <Sheet visible={!!date} onClose={onClose} title={title} subtitle={sub}>
      {s ? <DayDetails s={s} onClose={onClose} /> : null}
    </Sheet>
  );
}

export function DayDetails({ s, onClose }: { s: DaySummary; onClose?: () => void }) {
  const future = s.date > today();
  if (!s.hasAny) {
    return (
      <View style={styles.empty} testID="day-empty">
        <Icon name={future ? 'calendar-outline' : 'document-outline'} size={28} color={colors.muted} />
        <T v="body" style={{ textAlign: 'center' }}>
          {future ? (s.plannedName ? `Запланировано: ${s.plannedName}` : s.plannedRest ? 'По плану — день отдыха' : 'Пока ничего не запланировано') : s.plannedRest ? 'День отдыха — записей нет' : 'За этот день записей нет'}
        </T>
      </View>
    );
  }
  return (
    <View style={{ gap: space.md }} testID="day-details">
      {s.workouts.length ? (
        s.workouts.map((w) => (
          <Block key={w.id} icon="barbell-outline" title={w.name} right={[w.minutes ? `${w.minutes} мин` : '', `${w.workingSets} подх.`].filter(Boolean).join(' · ')}>
            {w.exercises.map((e) => (
              <View key={e.id} style={{ gap: 2 }}>
                <T v="body" style={{ fontWeight: '700', fontSize: 15 }}>
                  {e.name}
                </T>
                <T v="small">
                  {e.sets
                    .map((x) => `${x.weight ? `${fmtWeight(x.weight)}×` : ''}${x.reps}${x.rir !== undefined ? ` RIR ${x.rir}` : x.feel ? ` (${FEEL[x.feel] ?? x.feel})` : ''}${x.pr ? ' 🏆' : ''}`)
                    .join(' · ')}
                </T>
              </View>
            ))}
            {w.volumeKg ? <T v="small">Объём: {w.volumeKg.toLocaleString('ru-RU')} кг{w.prs ? ` · рекордов: ${w.prs}` : ''}</T> : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                onClose?.();
                router.push({ pathname: '/workout/[id]', params: { id: w.id } });
              }}
            >
              <T v="small" color={colors.accent} style={{ fontWeight: '700' }}>
                Открыть тренировку →
              </T>
            </Pressable>
          </Block>
        ))
      ) : (
        <Block icon="barbell-outline" title={s.plannedRest ? 'День отдыха' : s.plannedName ? `${s.plannedName} — не выполнена` : 'Без тренировки'} />
      )}

      {s.nutrition ? (
        <Block icon="restaurant-outline" title="Питание" right={`${s.nutrition.kcal} ккал`}>
          <T v="small" color={colors.text}>
            Б {fmt1(s.nutrition.protein)} · Ж {fmt1(s.nutrition.fat)} · У {fmt1(s.nutrition.carbs)} · Клетчатка {s.nutrition.fiber === null ? '—' : `${s.nutrition.fiberComplete ? '' : '≥'}${Math.round(s.nutrition.fiber)}`} г
          </T>
          {s.nutrition.meals.map((m) => (
            <View key={m.slot} style={{ gap: 1 }}>
              <T v="body" style={{ fontSize: 14, fontWeight: '700' }}>
                {MEAL_LABEL[m.slot]} · {m.kcal} ккал
              </T>
              <T v="small" numberOfLines={2}>
                {m.items.map((i) => `${i.name} ${Math.round(i.grams)} г`).join(', ')}
              </T>
            </View>
          ))}
        </Block>
      ) : null}

      {s.checkin ? (
        <Block icon="sunny-outline" title="Чек-ин" right={`сон ${formatSleep(s.checkin.sleepMinutes)}`}>
          <T v="small">
            Качество сна {s.checkin.sleepQuality}/5 · энергия {s.checkin.energy}/5 · стресс {s.checkin.stress}/5 · усталость {s.checkin.soreness}/5{s.checkin.pain ? ' · отмечена боль' : ''}
            {s.checkin.sleepSource === 'health' ? ' · сон из Apple Health' : ''}
          </T>
        </Block>
      ) : null}

      {s.health ? (
        <Block icon="heart-outline" title="Apple Health">
          <T v="small">
            {[
              s.health.steps !== undefined ? `шаги ${s.health.steps.toLocaleString('ru-RU')}` : '',
              s.health.restingHr ? `пульс покоя ${s.health.restingHr}` : '',
              s.health.hrvMs ? `HRV ${s.health.hrvMs} мс` : '',
              s.health.sleepMinutes ? `сон ${formatSleep(s.health.sleepMinutes)}` : '',
              s.health.activeKcal ? `активные ${s.health.activeKcal} ккал` : '',
            ]
              .filter(Boolean)
              .join(' · ')}
          </T>
        </Block>
      ) : null}

      {s.weightKg !== null || s.measurements.length ? (
        <Block icon="body-outline" title="Замеры">
          <T v="small">
            {[s.weightKg !== null ? `вес ${fmt1(s.weightKg)} кг` : '', ...s.measurements.map((m) => `${METRIC_META[m.kind].label.toLowerCase()} ${fmt1(m.value)} ${METRIC_META[m.kind].unit}`)].filter(Boolean).join(' · ')}
          </T>
        </Block>
      ) : null}

      {s.bp.length ? (
        <Block icon="heart-outline" title="Давление">
          <T v="small">{s.bp.map((b) => `${b.systolic}/${b.diastolic}${b.pulse ? ` · пульс ${b.pulse}` : ''}`).join('; ')}</T>
        </Block>
      ) : null}

      {s.labs.map((l) => (
        <Pressable
          key={l.id}
          accessibilityRole="button"
          onPress={() => {
            onClose?.();
            router.push('/labs');
          }}
        >
          <Block icon="flask-outline" title={`Анализы${l.lab ? ` · ${l.lab}` : ''}`} right="›">
            <T v="small">
              {l.count} показателей{l.outOfRange ? ` · вне референса: ${l.outOfRange}` : ' · все в пределах референса'}
            </T>
          </Block>
        </Pressable>
      ))}
    </View>
  );
}

function Block({ icon, title, right, children }: { icon: IconName; title: string; right?: string; children?: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={18} color={colors.accent} />
        <T v="h3" style={{ flex: 1, fontSize: 16 }} numberOfLines={2}>
          {title}
        </T>
        {right ? <T v="small">{right}</T> : null}
      </View>
      {children ? <View style={{ gap: 6 }}>{children}</View> : null}
    </View>
  );
}

const styles = themed({
  block: { gap: 8, padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface2 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: space.xl },
});
