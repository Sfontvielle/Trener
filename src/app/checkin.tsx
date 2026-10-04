import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { DailyCheckIn } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Banner, Button, Card, Icon, T } from '@/components/ui';
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
import { parseDecimal } from '@/utils/format';
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
  const [showHealth, setShowHealth] = useState(!!(existing?.hrvMs || existing?.restingHr));
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
        <Header title="Готовность" />
        <View style={{ alignItems: 'center', gap: space.sm, marginTop: space.lg }}>
          <T v="caption">Готовность</T>
          <T v="display" color={catColor} style={{ textAlign: 'center' }}>
            {CATEGORY_LABEL[cat]}
          </T>
          <T v="h3" style={{ textAlign: 'center' }}>
            {r.headline}
          </T>
        </View>
        <Card style={{ marginTop: space.xl }}>
          <T v="caption">Почему</T>
          {(r.reasons?.length ? r.reasons : ['показатели в пределах твоей обычной нормы']).map((x) => (
            <T key={x} v="body" style={{ paddingVertical: 4 }}>
              • {x[0].toUpperCase() + x.slice(1)}
            </T>
          ))}
          {r.factors.slice(0, 6).map((f) => (
            <View key={f.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
              <T v="small">{f.label}</T>
              <T v="small" color={f.impact < -2 ? colors.warning : f.impact > 2 ? colors.accent : colors.textDim}>
                {f.detail}
              </T>
            </View>
          ))}
          <T v="small" style={{ marginTop: 6, fontSize: 11 }}>
            Категория — правило {BRAND} по сну, самочувствию, нагрузке и данным часов относительно твоей личной нормы. Это не медицинское измерение.
          </T>
        </Card>
        <Card style={{ marginTop: space.md }} tone={tw.mode !== 'normal' ? 'warning' : 'accent'}>
          <T v="caption">Сегодняшняя тренировка</T>
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
        </Card>
        <Button title="Готово" size="lg" onPress={() => router.back()} style={{ marginTop: space.xl }} />
      </Screen>
    );
  }

  return (
    <Screen keyboard>
      <Header title="Утренний чек-ин" subtitle="Обычный день — просто «Сохранить»" />
      <View style={{ gap: space.xl }}>
        {c.sleepSource === 'health' && !editSleep ? (
          // Сон из Apple Health — ничего вводить не нужно
          <View style={styles.fromHealth}>
            <Icon name="moon" size={18} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <T v="h3" testID="sleep-value">
                {formatSleep(sleepMinutesOf(c))}
              </T>
              <T v="small">Источник: Apple Health</T>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Изменить сон" onPress={() => setEditSleep(true)} hitSlop={8} style={{ padding: 6 }}>
              <T v="small" color={colors.accent} style={{ fontWeight: '800' }}>
                Изменить
              </T>
            </Pressable>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <T v="h3">Сон</T>
              <T v="h3" color={colors.accent} testID="sleep-value">
                {formatSleep(sleepMinutesOf(c))}
              </T>
            </View>
            <DurationWheel minutes={sleepMinutesOf(c)} onChange={(m) => setC((x) => withSleep(x, m, 'manual'))} testID="sleep-wheel" />
            {healthMin && healthMin !== c.sleepMinutes ? (
              <Pressable accessibilityRole="button" onPress={() => setC((x) => withSleep(x, healthMin, 'health'))} style={{ alignSelf: 'center', padding: 4 }}>
                <T v="small" color={colors.accent}>
                  Apple Health: {formatSleep(healthMin)} — подставить
                </T>
              </Pressable>
            ) : null}
          </View>
        )}
        <Choice3 title="Самочувствие" options={['Плохо', 'Нормально', 'Отлично']} values={[2, 4, 5]} value={c.energy <= 2 ? 2 : c.energy >= 5 ? 5 : 4} onChange={(v) => set({ energy: v })} />
        <Choice3 title="Болезненность мышц" options={['Нет', 'Средняя', 'Сильная']} values={[2, 3, 5]} value={c.soreness <= 2 ? 2 : c.soreness >= 4 ? 5 : 3} onChange={(v) => set({ soreness: v })} />
        <Choice3 title="Стресс" options={['Низкий', 'Средний', 'Высокий']} values={[2, 3, 5]} value={c.stress <= 2 ? 2 : c.stress >= 4 ? 5 : 3} onChange={(v) => set({ stress: v })} />
        <View style={{ gap: 8 }}>
          <Toggle value={c.pain} onChange={(v) => set({ pain: v })} label="Есть боль (не крепатура)" sub="Сустав, спина, острая боль при движении" />
          {c.pain ? <Field placeholder="Где и когда болит?" value={c.painNote ?? ''} onChangeText={(t) => set({ painNote: t })} /> : null}
          {c.pain ? <Banner tone="warning" icon="medkit-outline" text={`${BRAND} исключит нагрузку, но не заменяет врача. При острой боли, отёке или травме — к специалисту.`} /> : null}
        </View>
        {healthDay?.hrvMs || healthDay?.restingHr ? (
          // Есть в Apple Health — ничего вводить не нужно, готовность берёт эти значения сама
          <View style={styles.fromHealth}>
            <Icon name="heart" size={16} color={colors.accent} />
            <T v="small" color={colors.text} style={{ flex: 1 }}>
              Из Apple Health: {[healthDay.hrvMs ? `HRV ${Math.round(healthDay.hrvMs)} мс` : '', healthDay.restingHr ? `пульс покоя ${Math.round(healthDay.restingHr)}` : ''].filter(Boolean).join(' · ')}
            </T>
          </View>
        ) : (
        <View style={{ gap: 8 }}>
          <Toggle value={showHealth} onChange={setShowHealth} label="Данные с часов" sub="HRV и пульс покоя вручную — если Apple Health не подключён" />
          {showHealth ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Field style={{ flex: 1 }} label="HRV, мс" keyboardType="numeric" value={c.hrvMs ? String(c.hrvMs) : ''} onChangeText={(t) => set({ hrvMs: Number.isFinite(parseDecimal(t)) ? parseDecimal(t) : undefined })} />
              <Field style={{ flex: 1 }} label="Пульс покоя" keyboardType="numeric" value={c.restingHr ? String(c.restingHr) : ''} onChangeText={(t) => set({ restingHr: Number.isFinite(parseDecimal(t)) ? parseDecimal(t) : undefined })} />
            </View>
          ) : null}
        </View>
        )}
        <View style={{ gap: 8 }}>
          <Toggle value={logWeight} onChange={setLogWeight} label={todayWeight ? `Вес сегодня ${String(todayWeight.kg).replace('.', ',')} кг — обновить` : 'Взвесился утром'} sub={todayWeight ? 'Уже записан (вручную или из Apple Health)' : 'Натощак, после туалета — для тренда веса'} />
          {logWeight ? <NumberStepper value={kg} onChange={setKg} step={0.1} decimals={1} min={30} max={300} unit="кг" /> : null}
        </View>
        <Button
          title={`Сохранить · ${CATEGORY_LABEL[cat].toLowerCase()} готовность`}
          size="lg"
          icon="checkmark"
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
              <T v="body" style={{ fontWeight: '700', fontSize: 15 }} color={active ? colors.onAccent : colors.text}>
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
  choice: { flex: 1, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  choiceOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  fromHealth: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine },
});
