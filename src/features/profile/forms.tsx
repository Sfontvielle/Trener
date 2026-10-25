import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Equipment, GoalType, HealthProfile, UserProfile } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Banner, Chip, Icon, Segmented, T } from '@/components/ui';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Field, NumberStepper } from '@/components/inputs';
import { EQUIPMENT_LABEL } from '@/data/exercises';
import { GOAL_LABEL, GOAL_SHORT, defaultRate } from '@/features/nutrition/targets';
import { WEEKDAYS_SHORT } from '@/utils/date';
import { haptic } from '@/services/haptics';
import { healthOf, healthTraining } from './health';
import { DURATION_OPTIONS, EQUIPMENT_CHOICES, LOCATION_OPTIONS, SLEEP_OPTIONS, STEP_BUCKETS, stepBucketOf } from './questionnaire';
import { AREA_LABEL, RESTRICTION_LABEL } from '@/features/training/engine/restrictions';
import { BRAND } from '@/config/brand';
import { CategoryPicker, joinItems, splitItems, type PickerCategory } from './CategoryPicker';
import { useBody } from '@/stores/body';
import { bodyTrend } from '@/features/science/bodyTrend';
import { goalPresets, presetForRate, rateWarning, recommendedPreset } from '@/features/coach/decisions/goals';

export const GOAL_DESC: Record<GoalType, string> = {
  bulk: 'больше мышц и силы',
  cut: 'меньше жира, сила остаётся',
  recomp: 'мышцы вместо жира',
  maintain: 'держать форму',
};

/** Стартовые дни недели для N тренировок (0 = понедельник) — как в генераторе плана */
export const DEFAULT_DAYS: Record<number, number[]> = { 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };

export const GYM_EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'bench', 'machine', 'cable', 'pullupbar', 'ezbar', 'smith', 'kettlebell', 'band'];
export const HOME_DEFAULT: Equipment[] = ['dumbbell', 'bench', 'pullupbar', 'band'];

type Setter = (patch: Partial<UserProfile>) => void;

function Opt<V extends string | number>({ items, value, onChange }: { items: { v: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  return (
    <View style={styles.wrap}>
      {items.map((it) => (
        <Chip key={String(it.v)} label={it.label} active={it.v === value} onPress={() => onChange(it.v)} />
      ))}
    </View>
  );
}

export const GOAL_ICON: Record<GoalType, React.ComponentProps<typeof MaterialCommunityIcons>['name']> = { bulk: 'arm-flex', cut: 'fire', recomp: 'swap-horizontal', maintain: 'scale-balance' };

/** Цель — четыре варианта крупно, без лишнего текста. Темп выбирается отдельно (RatePresets) */
export function GoalPicker({ p, set, withRate }: { p: UserProfile; set: Setter; withRate?: boolean }) {
  return (
    <View style={{ gap: 10 }}>
      {(Object.keys(GOAL_LABEL) as GoalType[]).map((g) => {
        const active = p.goal === g;
        return (
          <Pressable
            key={g}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={GOAL_SHORT[g]}
            onPress={() => {
              haptic.tap();
              set({ goal: g, ratePctPerWeek: g === 'bulk' || g === 'cut' ? goalPresets(g, p.level, p.weightKg).find((x) => x.id === recommendedPreset({ goal: g, level: p.level, sex: p.sex, heightCm: p.heightCm, weightKg: p.weightKg }).id)!.ratePct : defaultRate(g, p.level) });
            }}
            style={({ pressed }) => [styles.goal, active && styles.goalOn, pressed && { opacity: 0.8 }]}
          >
            <MaterialCommunityIcons name={GOAL_ICON[g]} size={24} color={active ? colors.accent : colors.textDim} />
            <View style={{ flex: 1 }}>
              <T v="h3">{GOAL_SHORT[g]}</T>
              <T v="small" style={{ fontSize: 13 }}>
                {GOAL_DESC[g]}
              </T>
            </View>
            <View style={[styles.radio, active && { borderColor: colors.accent }]}>{active ? <View style={styles.radioDot} /> : null}</View>
          </Pressable>
        );
      })}
      {withRate && (p.goal === 'bulk' || p.goal === 'cut') ? <RatePresets p={p} set={set} /> : null}
    </View>
  );
}

/**
 * Темп цели — пресеты (Консервативный / Сбалансированный / Более быстрый). Рекомендуемый зависит от массы, талии,
 * опыта и истории. Свой темп можно выбрать — при агрессивном RYNJI объясняет последствия, но не запрещает.
 */
export function RatePresets({ p, set }: { p: UserProfile; set: Setter }) {
  const metrics = useBody((s) => s.metrics);
  const weights = useBody((s) => s.weights);
  const [custom, setCustom] = useState(false);
  const waistCm = [...metrics].filter((m) => m.kind === 'waist').sort((a, b) => (a.date < b.date ? -1 : 1)).pop()?.value;
  const waistPerKg = p.goal === 'bulk' ? bodyTrend(weights, metrics).waistPerKg : null;
  const presets = goalPresets(p.goal, p.level, p.weightKg);
  const rec = recommendedPreset({ goal: p.goal, level: p.level, sex: p.sex, heightCm: p.heightCm, weightKg: p.weightKg, waistCm, waistPerKg });
  const current = presetForRate(p.goal, p.level, p.ratePctPerWeek);
  const warn = rateWarning(p.goal, p.level, p.ratePctPerWeek, p.weightKg);
  return (
    <View style={{ gap: 8, marginTop: 6 }} testID="rate-presets">
      <T v="caption">Темп</T>
      {presets.map((x) => {
        const active = current === x.id;
        return (
          <Pressable
            key={x.id}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${x.label}: ${String(x.ratePct).replace('.', ',')}% в неделю`}
            onPress={() => {
              haptic.tap();
              set({ ratePctPerWeek: x.ratePct });
            }}
            style={[styles.goal, { paddingVertical: 12 }, active && styles.goalOn]}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <T v="body" style={{ fontWeight: '800' }}>
                  {x.label}
                </T>
                {rec.id === x.id ? (
                  <View style={styles.recBadge}>
                    <T v="small" color={colors.onAccent} style={{ fontSize: 10, fontWeight: '800' }}>
                      РЕКОМЕНДУЕМ
                    </T>
                  </View>
                ) : null}
              </View>
              <T v="small" style={{ fontSize: 12, fontVariant: ['tabular-nums'] }} color={active ? colors.text : colors.textDim}>
                {p.goal === 'bulk' ? '+' : '−'}
                {String(x.kgPerWeek).replace('.', ',')} кг/нед · ~{x.kcalPerDay} ккал/день
              </T>
              {active ? (
                <T v="small" style={{ fontSize: 12 }}>
                  {x.note}
                </T>
              ) : null}
            </View>
            <View style={[styles.radio, active && { borderColor: colors.accent }]}>{active ? <View style={styles.radioDot} /> : null}</View>
          </Pressable>
        );
      })}

      {custom || !current ? (
        <Opt
          items={(p.goal === 'bulk' ? [0.15, 0.25, 0.35, 0.5, 0.75, 1.0] : [0.4, 0.6, 0.8, 1.0, 1.25]).map((v) => ({ v, label: `${String(v).replace('.', ',')}%` }))}
          value={p.ratePctPerWeek}
          onChange={(v) => set({ ratePctPerWeek: v })}
        />
      ) : (
        <Pressable accessibilityRole="button" hitSlop={6} onPress={() => setCustom(true)} style={{ alignSelf: 'flex-start' }}>
          <T v="small" color={colors.text} style={{ fontWeight: '600' }}>
            Свой темп ›
          </T>
        </Pressable>
      )}
      {warn ? (
        <View style={[styles.warn, warn.level === 'strong' && { borderColor: colors.warning }]} testID="rate-warning">
          <T v="small" color={colors.text}>
            {warn.text}
          </T>
        </View>
      ) : null}
      <T v="small" style={{ fontSize: 11 }}>
        Старт, а не гарантия: дальше {BRAND} подстроит темп по тренду веса и силовым.
      </T>
    </View>
  );
}

/** Пол — две карточки с иконками */
export function SexPicker({ value, onChange }: { value: UserProfile['sex'] | undefined; onChange: (v: UserProfile['sex']) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      {(['male', 'female'] as const).map((sx) => {
        const active = value === sx;
        return (
          <Pressable
            key={sx}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={sx === 'male' ? 'Мужчина' : 'Женщина'}
            onPress={() => {
              haptic.tap();
              onChange(sx);
            }}
            style={({ pressed }) => [styles.sexCard, active && styles.goalOn, pressed && { transform: [{ scale: 0.97 }] }]}
          >
            <MaterialCommunityIcons name={sx === 'male' ? 'human-male' : 'human-female'} size={52} color={active ? colors.accent : colors.textDim} />
            <T v="body" style={{ fontWeight: '700' }} color={active ? colors.text : colors.textDim}>
              {sx === 'male' ? 'Мужчина' : 'Женщина'}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function BodySection({ p, set, activity }: { p: UserProfile; set: Setter; activity?: boolean }) {
  return (
    <View style={{ gap: space.lg }}>
      <SexPicker value={p.sex} onChange={(v) => set({ sex: v })} />
      <View style={styles.rows}>
        <NumberStepper inline label="Возраст" unit="лет" value={p.age} onChange={(v) => set({ age: Math.round(v) })} min={14} max={90} />
        <View style={styles.rowLine} />
        <NumberStepper inline label="Рост" unit="см" value={p.heightCm} onChange={(v) => set({ heightCm: Math.round(v) })} min={130} max={230} />
        <View style={styles.rowLine} />
        <NumberStepper inline label="Вес" unit="кг" value={p.weightKg} onChange={(v) => set({ weightKg: v })} step={0.5} decimals={1} min={35} max={250} />
      </View>
      {activity ? <ActivityPicker p={p} set={set} /> : null}
    </View>
  );
}

export { STEP_BUCKETS, stepBucketOf };

export function ActivityPicker({ p, set }: { p: UserProfile; set: Setter }) {
  return (
    <View style={{ gap: 8 }} testID="activity-picker">
      <T v="caption">Шагов в день, обычно</T>
      <Segmented items={STEP_BUCKETS.map((b) => ({ key: b.key, label: b.label }))} value={stepBucketOf(p.stepsPerDay)} onChange={(k) => set({ stepsPerDay: STEP_BUCKETS.find((b) => b.key === k)!.steps })} />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: p.workStyle === 'physical' }}
        accessibilityLabel="Физическая работа"
        onPress={() => {
          haptic.tap();
          set({ workStyle: p.workStyle === 'physical' ? 'desk' : 'physical' });
        }}
        hitSlop={6}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 4 }}
      >
        <Icon name={p.workStyle === 'physical' ? 'checkbox' : 'square-outline'} size={20} color={p.workStyle === 'physical' ? colors.accent : colors.textDim} />
        <T v="small" color={colors.text}>
          Физическая работа
        </T>
      </Pressable>
    </View>
  );
}

/**
 * Дни тренировок — выбор вручную: тап по дню включает/выключает его, число тренировок в неделю = выбранные дни (2–6).
 */
export function DayPicker({ p, set }: { p: UserProfile; set: Setter }) {
  const days = p.preferredDays.length === p.daysPerWeek && p.preferredDays.length ? p.preferredDays : DEFAULT_DAYS[p.daysPerWeek] ?? DEFAULT_DAYS[3];
  return <WeekdayChips days={days} onChange={(next) => set({ preferredDays: next, daysPerWeek: next.length })} min={2} />;
}

/** Дни недели чипами. В анкете начинаем с пустого выбора (min 0), но больше 6 дней не даём — нужен отдых */
export function WeekdayChips({ days, onChange, min = 0 }: { days: number[]; onChange: (days: number[]) => void; min?: number }) {
  const toggle = (d: number) => {
    const on = days.includes(d);
    const next = on ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b);
    if (next.length < min || next.length > 6) {
      haptic.warning?.();
      return;
    }
    haptic.tap();
    onChange(next);
  };
  return (
    <View style={{ gap: 10 }} testID="day-picker">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {WEEKDAYS_SHORT.map((w, i) => {
          const on = days.includes(i);
          return (
            <Pressable key={w} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${w}: ${on ? 'тренировка' : 'отдых'}`} onPress={() => toggle(i)} hitSlop={4} style={({ pressed }) => [styles.day, on && styles.dayOn, pressed && { transform: [{ scale: 0.92 }] }]}>
              <T v="body" style={{ fontWeight: '700' }} color={on ? colors.bg : colors.textDim}>
                {w}
              </T>
            </Pressable>
          );
        })}
      </View>
      <T v="small">
        {days.length ? `${days.length} ${days.length === 1 ? 'тренировка' : days.length < 5 ? 'тренировки' : 'тренировок'} в неделю · ${days.map((d) => WEEKDAYS_SHORT[d]).join(', ')}` : 'Выбери от 2 до 6 дней'}
      </T>
    </View>
  );
}

/** Вариант крупной карточкой с радио-кнопкой — как выбор цели. Ничего не выбрано, пока человек не нажмёт */
export function ChoiceCards<V extends string | number>({ items, value, onChange, compact }: { items: { v: V; label: string; sub?: string; icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[]; value: V | undefined; onChange: (v: V) => void; compact?: boolean }) {
  return (
    <View style={{ gap: compact ? 8 : 10 }}>
      {items.map((it) => {
        const active = it.v === value;
        return (
          <Pressable
            key={String(it.v)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, checked: active }}
            aria-checked={active}
            accessibilityLabel={it.label}
            accessibilityHint={it.sub}
            onPress={() => {
              haptic.tap();
              onChange(it.v);
            }}
            style={({ pressed }) => [styles.goal, compact && { paddingVertical: 12 }, active && styles.goalOn, pressed && { opacity: 0.8 }]}
          >
            {it.icon ? <MaterialCommunityIcons name={it.icon} size={24} color={active ? colors.accent : colors.textDim} /> : null}
            <View style={{ flex: 1 }}>
              <T v={compact ? 'body' : 'h3'} style={compact ? { fontWeight: '700' } : undefined}>
                {it.label}
              </T>
              {it.sub ? (
                <T v="small" style={{ fontSize: 13 }}>
                  {it.sub}
                </T>
              ) : null}
            </View>
            <View style={[styles.radio, active && { borderColor: colors.accent }]}>{active ? <View style={styles.radioDot} /> : null}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Короткие варианты чипами (длительность, шаги, сон) — без выбора по умолчанию */
export function ChipChoice<V extends string | number>({ items, value, onChange }: { items: { v: V; label: string }[]; value: V | undefined; onChange: (v: V) => void }) {
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup">
      {items.map((it) => (
        <Chip key={String(it.v)} label={it.label} active={it.v === value} onPress={() => onChange(it.v)} />
      ))}
    </View>
  );
}

export function TrainingSection({ p, set, compact }: { p: UserProfile; set: Setter; compact?: boolean }) {
  const toggleEq = (e: Equipment) => set({ equipment: p.equipment.includes(e) ? p.equipment.filter((x) => x !== e) : [...p.equipment, e] });
  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: 6 }}>
        <T v="caption">Уровень подготовки</T>
        <Opt
          items={[
            { v: 'beginner', label: 'Новичок' },
            { v: 'intermediate', label: 'Средний' },
            { v: 'advanced', label: 'Опытный' },
          ]}
          value={p.level}
          onChange={(v) => set(compact ? { level: v, trainingYears: v === 'beginner' ? 0 : v === 'intermediate' ? 2 : 5 } : { level: v })}
        />
      </View>
      {compact ? null : <NumberStepper label="Стаж тренировок, лет" value={p.trainingYears} onChange={(v) => set({ trainingYears: v })} step={0.5} decimals={1} min={0} max={40} />}
      <View style={{ gap: 8 }}>
        <T v="caption">Дни тренировок</T>
        <DayPicker p={p} set={set} />
      </View>
      {compact ? null : (
      <>
      <View style={{ gap: 6 }}>
        <T v="caption">Длительность тренировки</T>
        <Opt items={DURATION_OPTIONS.map((v) => ({ v, label: `${v} мин` }))} value={DURATION_OPTIONS.reduce((a, b) => (Math.abs(b - p.sessionMinutes) < Math.abs(a - p.sessionMinutes) ? b : a))} onChange={(v) => set({ sessionMinutes: v })} />
      </View>
      </>
      )}
      <View style={{ gap: 6 }}>
        <T v="caption">Где тренируешься</T>
        <Opt
          items={LOCATION_OPTIONS.map((l) => ({ v: l.v, label: l.label }))}
          value={p.location}
          onChange={(v) => set({ location: v, equipment: v === 'gym' || v === 'mixed' ? GYM_EQUIPMENT : v === 'home' ? HOME_DEFAULT : ['pullupbar'] })}
        />
      </View>
      {compact ? (
        p.goal === 'bulk' || p.goal === 'cut' ? <RatePresets p={p} set={set} /> : null
      ) : (
      <View style={{ gap: 6 }}>
        <T v="caption">Доступное оборудование</T>
        <View style={styles.wrap}>
          {(p.location === 'gym' || p.location === 'mixed' ? GYM_EQUIPMENT : (EQUIPMENT_CHOICES[p.location] ?? [])).map((e) => (
            <Chip key={e} label={EQUIPMENT_LABEL[e]} active={p.equipment.includes(e)} onPress={() => toggleEq(e)} />
          ))}
        </View>
      </View>
      )}
    </View>
  );
}

export function LifestyleSection({ p, set }: { p: UserProfile; set: Setter }) {
  return (
    <View style={{ gap: space.md }}>
      <NumberStepper label="Шагов в день (примерно)" value={p.stepsPerDay} onChange={(v) => set({ stepsPerDay: Math.round(v) })} step={1000} min={0} max={40000} />
      <View style={{ gap: 6 }}>
        <T v="caption">Работа</T>
        <Opt
          items={[
            { v: 'desk', label: 'Сидячая' },
            { v: 'mixed', label: 'Смешанная' },
            { v: 'physical', label: 'Физическая' },
          ]}
          value={p.workStyle}
          onChange={(v) => set({ workStyle: v })}
        />
      </View>
      <View style={{ gap: 6 }}>
        <T v="caption">Сон, обычно</T>
        <ChipChoice items={SLEEP_OPTIONS.map((b) => ({ v: b.hours, label: b.label }))} value={p.sleepHours} onChange={(v) => set({ sleepHours: v })} />
      </View>
      <View style={{ gap: 6 }}>
        <T v="caption">Когда удобнее тренироваться</T>
        <Opt
          items={[
            { v: 'morning', label: 'Утро' },
            { v: 'day', label: 'День' },
            { v: 'evening', label: 'Вечер' },
            { v: 'any', label: 'По-разному' },
          ]}
          value={p.preferredTime}
          onChange={(v) => set({ preferredTime: v })}
        />
      </View>
    </View>
  );
}

/**
 * Здоровье и особенности: пишутся обычными словами, а приложение превращает их в правила
 * (какие движения не назначать, без отказа, что исключить из еды) и показывает это сразу.
 */
export function HealthSection({ p, set }: { p: UserProfile; set: Setter }) {
  const h = healthOf(p);
  const upd = (patch: Partial<HealthProfile>) => {
    const next = { ...h, ...patch };
    // Старое поле остаётся синхронным (резервные копии и прежние версии читают его)
    set({ health: next, limitations: next.injuries });
  };
  const rules = healthTraining({ health: h, limitations: h.injuries });
  return (
    <View style={{ gap: space.md }}>
      <PickerField label="Травмы" category="injuries" placeholder="Например: правое плечо — больно в жиме над головой" value={h.injuries} onChange={(t) => upd({ injuries: t })} maxLength={400} />
      <PickerField label="Хронические ограничения" category="chronic" placeholder="Например: протрузия L5, гипертония" value={h.chronic} onChange={(t) => upd({ chronic: t })} maxLength={400} />
      <PickerField label="Движения, вызывающие боль" category="painful" placeholder="Например: глубокий присед, выпады" value={h.painfulMovements} onChange={(t) => upd({ painfulMovements: t })} maxLength={300} />
      <PickerField label="Ограничения от врача или физиотерапевта" category="medical" placeholder="Например: без осевой нагрузки 3 месяца" value={h.medical} onChange={(t) => upd({ medical: t })} maxLength={300} hint="Соблюдаются строго — такие движения не назначаются совсем." />
      <TagInput label="Аллергии" category="allergies" values={h.allergies} onChange={(v) => upd({ allergies: v })} />
      <TagInput label="Непереносимости" category="intolerances" values={h.intolerances} onChange={(v) => upd({ intolerances: v })} />
      <TagInput label="Запрещённые продукты" category="forbidden" values={h.forbiddenFoods} onChange={(v) => upd({ forbiddenFoods: v })} />
      <Field label="Другие важные особенности" placeholder="Например: астма, после операции на колене в 2022" value={h.other} onChangeText={(t) => upd({ other: t })} multiline maxLength={300} />
      {rules.limitations.length || rules.notes.length ? (
        <View style={styles.rules}>
          <T v="caption" color={colors.accent}>
            Что будет учтено
          </T>
          {rules.limitations.map((l) => (
            <T key={l.id} v="small" color={colors.text}>
              • {AREA_LABEL[l.area]}{l.source === 'doctor' ? ' (врач)' : ''}: {l.severity === 'severe' ? 'исключить все упражнения на эту зону' : `не назначать — ${l.movements.map((m) => RESTRICTION_LABEL[m].toLowerCase()).join(', ')}`}
            </T>
          ))}
          {rules.notes.filter((x) => !x.startsWith('Ограничения из профиля')).map((x) => (
            <T key={x} v="small" color={colors.text}>
              • {x}
            </T>
          ))}
          <T v="small" style={{ fontSize: 11 }}>
            Это правила подбора движений, а не диагноз. Конфликтующие упражнения заменяются безопасными аналогами с объяснением.
          </T>
        </View>
      ) : null}
      {rules.clearance ? <Banner tone="warning" icon="medkit-outline" text="Согласуй интенсивность тренировок с врачом. При боли, головокружении или одышке во время нагрузки — остановись." /> : null}
    </View>
  );
}

const RESTRICTIONS: { v: string; label: string }[] = [
  { v: 'vegetarian', label: 'Вегетарианство' },
  { v: 'no_fish', label: 'Без рыбы' },
  { v: 'lactose', label: 'Без лактозы' },
  { v: 'gluten', label: 'Без глютена' },
];

export function FoodSection({ p, set }: { p: UserProfile; set: Setter }) {
  return (
    <View style={{ gap: space.md }}>
      <TagInput label="Любимые продукты" category="liked" values={p.likedFoods} onChange={(v) => set({ likedFoods: v })} />
      <TagInput label="Не ешь / не любишь" category="disliked" values={p.dislikedFoods} onChange={(v) => set({ dislikedFoods: v })} />
      <View style={{ gap: 6 }}>
        <T v="caption">Пищевые ограничения</T>
        <View style={styles.wrap}>
          {RESTRICTIONS.map((r) => (
            <Chip key={r.v} label={r.label} active={p.dietRestrictions.includes(r.v)} onPress={() => set({ dietRestrictions: p.dietRestrictions.includes(r.v) ? p.dietRestrictions.filter((x) => x !== r.v) : [...p.dietRestrictions, r.v] })} />
          ))}
        </View>
      </View>
    </View>
  );
}

/**
 * Список значений с кнопкой «+»: открывает выбор по категории (поиск, популярное, мультивыбор, свой вариант).
 * Выбранные элементы удаляются тапом по чипу.
 */
export function TagInput({ label, values, onChange, category }: { label: string; values: string[]; onChange: (v: string[]) => void; category: PickerCategory }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T v="caption">{label}</T>
      {/* Поле целиком: выбранное — чипами внутри, «+» внутри справа; тап по полю открывает выбор */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Добавить: ${label}`}
        onPress={() => {
          haptic.tap();
          setOpen(true);
        }}
        style={({ pressed }) => [styles.tagField, pressed && { opacity: 0.85 }]}
      >
        <View style={[styles.wrap, { flex: 1 }]}>
          {values.map((v) => (
            <Pressable key={v} accessibilityLabel={`Удалить ${v}`} onPress={() => onChange(values.filter((x) => x !== v))} style={styles.tag} hitSlop={4}>
              <T v="small" color={colors.text} style={{ fontWeight: '600' }}>
                {v}
              </T>
              <Icon name="close" size={14} color={colors.textDim} />
            </Pressable>
          ))}
          {!values.length ? (
            <T v="body" color={colors.muted} style={{ alignSelf: 'center', fontSize: 16 }}>
              Выбрать из списка или вписать своё
            </T>
          ) : null}
        </View>
        <View style={styles.inlineAdd}>
          <Icon name="add" size={22} color={colors.text} />
        </View>
      </Pressable>
      <CategoryPicker visible={open} category={category} value={values} onClose={() => setOpen(false)} onSave={onChange} />
    </View>
  );
}

/** Текстовое поле + «+»: выбранные в каталоге пункты добавляются в текст через запятую, свой текст сохраняется */
export function PickerField({ label, value, onChange, category, placeholder, hint, maxLength }: { label: string; value: string; onChange: (t: string) => void; category: PickerCategory; placeholder?: string; hint?: string; maxLength?: number }) {
  const [open, setOpen] = useState(false);
  const items = splitItems(value);
  return (
    <View style={{ gap: 6 }}>
      {/* Подпись переносится на новую строку, ничего не уезжает за край */}
      <T v="caption">{label}</T>
      <Field
        accessibilityLabel={label}
        placeholder={placeholder}
        value={value}
        onChangeText={onChange}
        multiline
        maxLength={maxLength}
        hint={hint}
        accessory={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Выбрать: ${label}`}
            onPress={() => {
              haptic.tap();
              setOpen(true);
            }}
            hitSlop={6}
            style={({ pressed }) => [styles.inlineAdd, pressed && { opacity: 0.7 }]}
          >
            <Icon name="add" size={22} color={colors.text} />
          </Pressable>
        }
      />
      <CategoryPicker visible={open} category={category} value={items} onClose={() => setOpen(false)} onSave={(v) => onChange(joinItems(v))} />
    </View>
  );
}


const styles = themed({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  goal: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 16, paddingHorizontal: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: 'transparent' },
  goalOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  sexCard: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, height: 132, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: 'transparent' },
  rows: { borderRadius: radius.lg, backgroundColor: colors.surface, paddingHorizontal: space.md },
  rowLine: { height: 0.5, backgroundColor: colors.borderStrong },
  day: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  dayOn: { backgroundColor: colors.text },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  recBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.accent },
  warn: { padding: 10, borderRadius: radius.md, backgroundColor: colors.warningDim, borderWidth: 1, borderColor: colors.warningLine },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface3, paddingHorizontal: 12, height: 32, borderRadius: radius.pill },
  tagField: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingLeft: space.md, paddingRight: 6, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.surface2 },
  inlineAdd: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface3 },
  rules: { gap: 4, padding: 12, borderRadius: radius.md, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine },
});
