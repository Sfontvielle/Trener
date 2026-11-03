import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { DailyCheckIn } from '@/types';
import { colors, space, themed } from '@/theme';
import { Screen } from '@/components/Screen';
import { Banner, Icon, T } from '@/components/ui';
import { FadeIn } from '@/components/motion';
import { AppHeader, Group, ListRow, PrimaryAction, SectionHeader, SegmentedControl } from '@/components/ds';
import { Field, NumberStepper, Toggle } from '@/components/inputs';
import { DurationWheel } from '@/components/WheelPicker';
import { useHealth } from '@/stores/health';
import { CATEGORY_LABEL, readinessCategory, sleepBaseline, sleepMinutesOf, withSleep } from '@/features/science/recovery';
import { useCheckins } from '@/stores/checkins';
import { useWorkouts } from '@/stores/workouts';
import { computeReadiness } from '@/features/recovery/readiness';
import { formatSleep, today } from '@/utils/date';
import { haptic } from '@/services/haptics';
import { useTodayWorkout } from '@/hooks/useToday';
import { MODE_LABEL } from '@/features/training/today';
import { useBody } from '@/stores/body';
import { useProfile } from '@/stores/profile';
import { BRAND } from '@/config/brand';

export default function CheckIn() {
  const d = today();
  const existing = useCheckins((s) => s.byDate[d]);
  const save = useCheckins((s) => s.save);
  const sessions = useWorkouts((s) => s.sessions);
  // Сон из Apple Health за прошедшую ночь — подставляется, пока человек не изменил значение вручную
  const healthDay = useHealth((s) => s.days[d]);
  const healthMin = healthDay?.sleepHours ? Math.round(healthDay.sleepHours * 60) : undefined;
  const [c, setC] = useState<DailyCheckIn>(() => {
    if (existing) return existing.sleepMinutes !== undefined ? existing : withSleep(existing, sleepMinutesOf(existing), existing.sleepSource ?? 'manual');
    // Значения по умолчанию = «нейтральные» точки формулы готовности: обычный день — один тап «Сохранить»
    const base: DailyCheckIn = { date: d, sleepHours: 7.5, sleepQuality: 4, energy: 4, stress: 2, soreness: 2, pain: false, createdAt: Date.now() };
    return healthMin ? withSleep(base, healthMin, 'health') : withSleep(base, 450, 'manual');
  });
  // Синк Apple Health завершился после открытия экрана: обновляем только не тронутое вручную значение
  if (healthMin && !existing && c.sleepSource !== 'manual' && c.sleepMinutes !== healthMin) setC(withSleep(c, healthMin, 'health'));
  const [saved, setSaved] = useState(false);
  // Взвешивание прямо в чек-ине: одно утреннее действие вместо двух
  const weights = useBody((s) => s.weights);
  const todayWeight = weights.find((w) => w.date === d);
  const lastKg = weights[weights.length - 1]?.kg ?? useProfile.getState().profile?.weightKg ?? 75;
  // Вес пишется только по явному действию: раньше переключатель был включён по умолчанию,
  // и сохранение без взвешивания записывало вчерашний вес как сегодняшний (портило тренд)
  const [logWeight, setLogWeight] = useState(false);
  const [kg, setKg] = useState(todayWeight?.kg ?? lastKg);
  const [editSleep, setEditSleep] = useState(false);
  const [more, setMore] = useState(false);
  const [details, setDetails] = useState(false);
  const set = (patch: Partial<DailyCheckIn>) => setC((x) => ({ ...x, ...patch }));
  const checkins = useCheckins((s) => s.byDate);
  const healthDays = useHealth((s) => s.days);
  const usualSleep = useProfile((s) => s.profile?.sleepHours);
  const r = useMemo(() => computeReadiness(c, { sessions, sleepBaseline: sleepBaseline(d, checkins, healthDays, usualSleep) }), [c, sessions, d, checkins, healthDays, usualSleep]);
  const cat = r.category ?? readinessCategory(r.score, r.band);
  const catColor = cat === 'high' || cat === 'normal' ? colors.accent : cat === 'reduced' ? colors.warning : colors.danger;
  const tw = useTodayWorkout();

  if (saved) {
    const reasons = r.reasons?.length ? r.reasons : ['показатели в пределах твоей обычной нормы'];
    return (
      <Screen>
        <AppHeader back title="Готовность" />
        <View style={{ marginTop: space.lg, gap: space.xxs }} accessible accessibilityLabel={`Готовность сегодня: ${CATEGORY_LABEL[cat]}. ${r.headline}`}>
          <T v="footnote">Сегодня</T>
          <T v="display" color={catColor}>
            {CATEGORY_LABEL[cat]}
          </T>
          <T v="callout" color={colors.textDim}>
            {r.headline}
          </T>
        </View>

        <SectionHeader title="Почему" />
        <Group>
          {reasons.map((x) => (
            <ListRow key={x} title={x[0].toUpperCase() + x.slice(1)} />
          ))}
        </Group>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={() => setDetails(!details)} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: space.sm, minHeight: 32, justifyContent: 'center' }}>
          <T v="callout" color={colors.text}>
            {details ? 'Скрыть' : 'Подробнее ›'}
          </T>
        </Pressable>
        {details ? (
          <View style={{ gap: space.xs }}>
            <Group>
              {r.factors.slice(0, 6).map((f) => (
                <ListRow key={f.label} title={f.label} value={f.detail} />
              ))}
            </Group>
            <T v="footnote">Категория — правило {BRAND} по сну, самочувствию, нагрузке и данным часов относительно твоей личной нормы. Это не медицинское измерение.</T>
          </View>
        ) : null}

        <SectionHeader title="Тренировка" />
        <Group>
          <ListRow
            icon="barbell-outline"
            title={tw.kind === 'workout' && tw.template ? tw.template.name : tw.kind === 'rest' ? 'Сегодня день отдыха' : tw.kind === 'done' ? 'Уже выполнена' : 'Нет плана на сегодня'}
            subtitle={tw.kind === 'workout' && tw.template ? `${MODE_LABEL[tw.mode]} · ${tw.totalSets} подходов · ~${tw.estMinutes} мин${tw.override ? ` · изменение от тренера: ${tw.override.reason}` : ''}` : undefined}
          />
        </Group>
        <PrimaryAction title="Готово" onPress={() => router.back()} style={{ marginTop: space.xxl }} />
      </Screen>
    );
  }

  const fromHealth = c.sleepSource === 'health';
  const restLine = c.pain ? 'Есть боль' : c.soreness >= 4 || c.stress >= 4 ? 'Изменено' : 'Как обычно';
  return (
    <Screen keyboard>
      <AppHeader back title="Утренний чек-ин" />
      <View style={{ gap: space.xl }}>
        {/* Сон — крупно; колесо — по тапу (из Apple Health вводить ничего не нужно) */}
        <View style={{ gap: space.xxs, marginTop: space.sm }}>
          <T v="footnote">Сон{fromHealth ? ' · Apple Health' : ''}</T>
          <Pressable accessibilityRole="button" accessibilityLabel="Изменить сон" accessibilityState={{ expanded: editSleep }} onPress={() => { haptic.tap(); setEditSleep(!editSleep); }} hitSlop={6} style={({ pressed }) => [styles.sleep, pressed && { opacity: 0.6 }]}>
            <T v="display" testID="sleep-value">
              {formatSleep(sleepMinutesOf(c))}
            </T>
            <Icon name={editSleep ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
          </Pressable>
          {healthDay?.hrvMs || healthDay?.restingHr ? (
            <T v="footnote">
              {[healthDay.hrvMs ? `HRV ${Math.round(healthDay.hrvMs)} мс` : '', healthDay.restingHr ? `пульс покоя ${Math.round(healthDay.restingHr)}` : ''].filter(Boolean).join(' · ')}
            </T>
          ) : null}
          {editSleep ? (
            <FadeIn from={6}>
              <DurationWheel minutes={sleepMinutesOf(c)} onChange={(m) => setC((x) => withSleep(x, m, 'manual'))} testID="sleep-wheel" />
              {healthMin && healthMin !== c.sleepMinutes ? (
                <Pressable accessibilityRole="button" onPress={() => setC((x) => withSleep(x, healthMin, 'health'))} style={{ alignSelf: 'center', minHeight: 32, justifyContent: 'center' }}>
                  <T v="callout" color={colors.text}>
                    Apple Health: {formatSleep(healthMin)} — подставить
                  </T>
                </Pressable>
              ) : null}
            </FadeIn>
          ) : null}
        </View>
        <Choice3 title="Самочувствие" options={['Плохо', 'Нормально', 'Отлично']} values={[2, 4, 5]} value={c.energy <= 2 ? 2 : c.energy >= 5 ? 5 : 4} onChange={(v) => set({ energy: v })} />
        {/* Остальное — обычно «как всегда»: по тапу */}
        <Group>
          <ListRow
            title={`Мышцы, стресс, боль${todayWeight ? '' : ', вес'}`}
            value={restLine}
            chevron={false}
            accessibilityLabel={`Мышцы, стресс, боль${todayWeight ? '' : ', вес'}: ${restLine.toLowerCase()}`}
            right={<Icon name={more ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />}
            onPress={() => {
              haptic.tap();
              setMore(!more);
            }}
          />
        </Group>
        {more ? (
          <FadeIn from={6} style={{ gap: space.xl }}>
            <Choice3 title="Болезненность мышц" options={['Нет', 'Средняя', 'Сильная']} values={[2, 3, 5]} value={c.soreness <= 2 ? 2 : c.soreness >= 4 ? 5 : 3} onChange={(v) => set({ soreness: v })} />
            <Choice3 title="Стресс" options={['Низкий', 'Средний', 'Высокий']} values={[2, 3, 5]} value={c.stress <= 2 ? 2 : c.stress >= 4 ? 5 : 3} onChange={(v) => set({ stress: v })} />
            <View style={{ gap: space.xs }}>
              <Group>
                <View style={styles.inset}>
                  <Toggle value={c.pain} onChange={(v) => set({ pain: v })} label="Есть боль (не крепатура)" sub="Сустав, спина, острая боль при движении" />
                </View>
                {/* Вес из Apple Health или уже записанный — ничего не спрашиваем */}
                {!todayWeight ? (
                  <View style={styles.inset}>
                    <Toggle value={logWeight} onChange={setLogWeight} label="Взвешивание утром" sub="Натощак, после туалета — для тренда веса" />
                  </View>
                ) : null}
              </Group>
              {c.pain ? <Field placeholder="Где и когда болит?" value={c.painNote ?? ''} onChangeText={(t) => set({ painNote: t })} /> : null}
              {c.pain ? <Banner tone="warning" icon="medkit-outline" text={`${BRAND} исключит нагрузку, но не заменяет врача. При острой боли, отёке или травме — к специалисту.`} /> : null}
              {!todayWeight && logWeight ? <NumberStepper value={kg} onChange={setKg} step={0.1} decimals={1} min={30} max={300} unit="кг" /> : null}
            </View>
          </FadeIn>
        ) : null}
        <PrimaryAction
          title={`Сохранить · ${CATEGORY_LABEL[cat].toLowerCase()} готовность`}
          onPress={() => {
            save({ ...c, createdAt: Date.now() });
            if (logWeight) useBody.getState().addWeight(d, Math.round(kg * 10) / 10);
            haptic.success();
            setSaved(true);
          }}
        />
      </View>
    </Screen>
  );
}

/** Три варианта одним тапом — вместо шкалы 1–5 (точность выше не нужна для решений) */
function Choice3({ title, options, values, value, onChange }: { title: string; options: [string, string, string]; values: [number, number, number]; value: number; onChange: (v: 1 | 2 | 3 | 4 | 5) => void }) {
  return (
    <View style={{ gap: space.xs }}>
      <T v="headline">{title}</T>
      <SegmentedControl
        items={options.map((o, i) => ({ key: String(values[i]), label: o, a11y: `${title}: ${o}` }))}
        value={String(value)}
        onChange={(k) => {
          haptic.tap();
          onChange(Number(k) as 1 | 2 | 3 | 4 | 5);
        }}
      />
    </View>
  );
}

const styles = themed({
  sleep: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', minHeight: 44 },
  inset: { paddingHorizontal: space.md },
});
