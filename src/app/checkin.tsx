import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { DailyCheckIn } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Banner, Button, Icon, T } from '@/components/ui';
import { Ambient, Appear, FadeIn } from '@/components/motion';
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
  const r = useMemo(() => computeReadiness(c, { sessions, sleepBaseline: sleepBaseline(d, checkins, healthDays) }), [c, sessions, d, checkins, healthDays]);
  const cat = r.category ?? readinessCategory(r.score, r.band);
  const catColor = cat === 'high' || cat === 'normal' ? colors.accent : cat === 'reduced' ? colors.warning : colors.danger;
  const tw = useTodayWorkout();

  if (saved) {
    return (
      <Screen>
        <Ambient tone={cat === 'high' || cat === 'normal' ? 'accent' : 'warn'} />
        <Header title="Готовность" />
        <Appear i={0} style={{ marginTop: space.xl, gap: space.sm }}>
          <T v="caption">Сегодня</T>
          <T v="hero" color={catColor}>
            {CATEGORY_LABEL[cat]}
          </T>
          <T v="bodyDim">{r.headline}</T>
        </Appear>
        <Appear i={1} style={{ marginTop: space.xl, gap: 6 }}>
          {(r.reasons?.length ? r.reasons : ['показатели в пределах твоей обычной нормы']).map((x) => (
            <T key={x} v="body">
              {x[0].toUpperCase() + x.slice(1)}
            </T>
          ))}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: details }} onPress={() => setDetails(!details)} hitSlop={8} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <T v="small" style={{ fontWeight: '600' }}>
              {details ? 'Скрыть' : 'Подробнее ›'}
            </T>
          </Pressable>
          {details ? (
            <View style={{ gap: 2 }}>
              {r.factors.slice(0, 6).map((f) => (
                <View key={f.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 }}>
                  <T v="small">{f.label}</T>
                  <T v="small" color={f.impact < -2 ? colors.warning : f.impact > 2 ? colors.accent : colors.textDim}>
                    {f.detail}
                  </T>
                </View>
              ))}
              <T v="small" style={{ marginTop: 6, fontSize: 11 }}>
                Категория — правило {BRAND} по сну, самочувствию, нагрузке и данным часов относительно твоей личной нормы. Это не медицинское измерение.
              </T>
            </View>
          ) : null}
        </Appear>
        <Appear i={2} style={{ marginTop: space.xl }}>
          <T v="caption">Тренировка</T>
          <T v="h3" style={{ marginTop: 4 }}>
            {tw.kind === 'workout' && tw.template
              ? `${tw.template.name}: ${MODE_LABEL[tw.mode].toLowerCase()} · ${tw.totalSets} подходов · ~${tw.estMinutes} мин`
              : tw.kind === 'rest'
                ? 'Сегодня день отдыха'
                : tw.kind === 'done'
                  ? 'Уже выполнена'
                  : '—'}
          </T>
          {tw.kind === 'workout' && tw.override ? (
            <T v="small" style={{ marginTop: 4 }}>
              Действует изменение от тренера: {tw.override.reason}
            </T>
          ) : null}
        </Appear>
        <Button title="Готово" size="lg" live onPress={() => router.back()} style={{ marginTop: space.xxl }} />
      </Screen>
    );
  }

  const fromHealth = c.sleepSource === 'health';
  return (
    <Screen keyboard>
      <Ambient />
      <Header title="Утренний чек-ин" />
      <View style={{ gap: space.xl }}>
        {/* Сон — крупно; колесо — по тапу (из Apple Health вводить ничего не нужно) */}
        <Appear i={0} style={{ gap: 8, marginTop: space.sm }}>
          <T v="caption">Сон{fromHealth ? ' · Apple Health' : ''}</T>
          <Pressable accessibilityRole="button" accessibilityLabel="Изменить сон" accessibilityState={{ expanded: editSleep }} onPress={() => { haptic.tap(); setEditSleep(!editSleep); }} hitSlop={6} style={({ pressed }) => [{ alignSelf: 'flex-start' }, pressed && { opacity: 0.6 }]}>
            <T v="hero" testID="sleep-value">
              {formatSleep(sleepMinutesOf(c))}
            </T>
          </Pressable>
          {healthDay?.hrvMs || healthDay?.restingHr ? (
            <T v="small">
              {[healthDay.hrvMs ? `HRV ${Math.round(healthDay.hrvMs)} мс` : '', healthDay.restingHr ? `пульс покоя ${Math.round(healthDay.restingHr)}` : ''].filter(Boolean).join(' · ')}
            </T>
          ) : null}
          {editSleep ? (
            <FadeIn from={6}>
              <DurationWheel minutes={sleepMinutesOf(c)} onChange={(m) => setC((x) => withSleep(x, m, 'manual'))} testID="sleep-wheel" />
              {healthMin && healthMin !== c.sleepMinutes ? (
                <Pressable accessibilityRole="button" onPress={() => setC((x) => withSleep(x, healthMin, 'health'))} style={{ alignSelf: 'center', padding: 4 }}>
                  <T v="small" color={colors.text}>
                    Apple Health: {formatSleep(healthMin)} — подставить
                  </T>
                </Pressable>
              ) : null}
            </FadeIn>
          ) : null}
        </Appear>
        <Appear i={1}>
          <Choice3 title="Самочувствие" options={['Плохо', 'Нормально', 'Отлично']} values={[2, 4, 5]} value={c.energy <= 2 ? 2 : c.energy >= 5 ? 5 : 4} onChange={(v) => set({ energy: v })} />
        </Appear>
        {/* Остальное — обычно «как всегда»: по тапу */}
        <Appear i={2}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => { haptic.tap(); setMore(!more); }} style={({ pressed }) => [styles.moreRow, pressed && { opacity: 0.6 }]}>
            <T v="body" style={{ flex: 1 }}>
              Мышцы, стресс, боль{todayWeight ? '' : ', вес'}
            </T>
            <T v="small">{c.pain ? 'есть боль' : c.soreness >= 4 || c.stress >= 4 ? 'изменено' : 'как обычно'}</T>
            <Icon name={more ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
          </Pressable>
        </Appear>
        {more ? (
          <FadeIn from={6} style={{ gap: space.xl }}>
            <Choice3 title="Болезненность мышц" options={['Нет', 'Средняя', 'Сильная']} values={[2, 3, 5]} value={c.soreness <= 2 ? 2 : c.soreness >= 4 ? 5 : 3} onChange={(v) => set({ soreness: v })} />
            <Choice3 title="Стресс" options={['Низкий', 'Средний', 'Высокий']} values={[2, 3, 5]} value={c.stress <= 2 ? 2 : c.stress >= 4 ? 5 : 3} onChange={(v) => set({ stress: v })} />
            <View style={{ gap: 8 }}>
              <Toggle value={c.pain} onChange={(v) => set({ pain: v })} label="Есть боль (не крепатура)" sub="Сустав, спина, острая боль при движении" />
              {c.pain ? <Field placeholder="Где и когда болит?" value={c.painNote ?? ''} onChangeText={(t) => set({ painNote: t })} /> : null}
              {c.pain ? <Banner tone="warning" icon="medkit-outline" text={`${BRAND} исключит нагрузку, но не заменяет врача. При острой боли, отёке или травме — к специалисту.`} /> : null}
            </View>
            {/* Вес из Apple Health или уже записанный — ничего не спрашиваем */}
            {!todayWeight ? (
              <View style={{ gap: 8 }}>
                <Toggle value={logWeight} onChange={setLogWeight} label="Взвешивание утром" sub="Натощак, после туалета — для тренда веса" />
                {logWeight ? <NumberStepper value={kg} onChange={setKg} step={0.1} decimals={1} min={30} max={300} unit="кг" /> : null}
              </View>
            ) : null}
          </FadeIn>
        ) : null}
        <Button
          title={`Сохранить · ${CATEGORY_LABEL[cat].toLowerCase()} готовность`}
          size="lg"
          icon="checkmark"
          live
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
    <View style={{ gap: 8 }}>
      <T v="h3">{title}</T>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {options.map((o, i) => {
          const active = values[i] === value;
          return (
            <Pressable
              key={o}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${title}: ${o}`}
              onPress={() => {
                haptic.tap();
                onChange(values[i] as 1 | 2 | 3 | 4 | 5);
              }}
              style={[styles.choice, active && styles.choiceOn]}
            >
              <T v="body" style={{ fontWeight: '600', fontSize: 15 }} color={active ? colors.bg : colors.text}>
                {o}
              </T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = themed({
  choice: { flex: 1, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  // Выбор — светлая «пилюля»; лайм на экране остаётся у кнопки «Сохранить»
  choiceOn: { backgroundColor: colors.text },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.md, minHeight: 54, borderRadius: radius.lg, backgroundColor: colors.surface },
});
