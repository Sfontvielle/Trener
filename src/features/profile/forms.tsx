import React, { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import type { Equipment, GoalType, UserProfile } from '@/types';
import { colors, radius, space } from '@/theme';
import { Chip, Icon, T } from '@/components/ui';
import { Field, NumberStepper } from '@/components/inputs';
import { EQUIPMENT_LABEL } from '@/data/exercises';
import { GOAL_LABEL, defaultRate } from '@/features/nutrition/targets';
import { WEEKDAYS_SHORT } from '@/utils/date';
import { haptic } from '@/services/haptics';

export const GOAL_DESC: Record<GoalType, string> = {
  bulk: 'Профицит калорий, упор на прогрессию весов',
  cut: 'Дефицит калорий, сохраняем силу и мышцы',
  recomp: 'Вес ≈ стабилен: меньше жира, больше мышц',
  maintain: 'Держим форму и результаты',
};

export const GYM_EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'bench', 'machine', 'cable', 'pullupbar', 'ezbar', 'smith', 'kettlebell', 'band'];
export const HOME_DEFAULT: Equipment[] = ['dumbbell', 'bench', 'pullupbar', 'band'];

export function defaultProfile(): UserProfile {
  return {
    name: '',
    sex: 'male',
    age: 30,
    heightCm: 180,
    weightKg: 80,
    goal: 'bulk',
    ratePctPerWeek: 0.35,
    level: 'intermediate',
    trainingYears: 2,
    daysPerWeek: 4,
    sessionMinutes: 70,
    location: 'gym',
    equipment: GYM_EQUIPMENT,
    limitations: '',
    avoidExerciseIds: [],
    likedFoods: [],
    dislikedFoods: [],
    dietRestrictions: [],
    activity: 'moderate',
    stepsPerDay: 7000,
    workStyle: 'desk',
    preferredTime: 'evening',
    preferredDays: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

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

export function GoalPicker({ p, set }: { p: UserProfile; set: Setter }) {
  return (
    <View style={{ gap: 10 }}>
      {(Object.keys(GOAL_LABEL) as GoalType[]).map((g) => {
        const active = p.goal === g;
        return (
          <Pressable
            key={g}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => {
              haptic.tap();
              set({ goal: g, ratePctPerWeek: defaultRate(g, p.level) });
            }}
            style={[styles.goal, active && { borderColor: colors.accent, backgroundColor: colors.accentDim }]}
          >
            <View style={{ flex: 1 }}>
              <T v="h3">{GOAL_LABEL[g]}</T>
              <T v="small">{GOAL_DESC[g]}</T>
            </View>
            <View style={[styles.radio, active && { borderColor: colors.accent }]}>{active ? <View style={styles.radioDot} /> : null}</View>
          </Pressable>
        );
      })}
      {p.goal === 'bulk' || p.goal === 'cut' ? (
        <View style={{ gap: 6, marginTop: 6 }}>
          <T v="caption">Темп, % массы тела в неделю</T>
          <Opt
            items={(p.goal === 'bulk' ? [0.25, 0.35, 0.5, 0.75] : [0.4, 0.6, 0.8, 1.0]).map((v) => ({ v, label: `${String(v).replace('.', ',')}% · ${(p.weightKg * v / 100).toFixed(2).replace('.', ',')} кг` }))}
            value={p.ratePctPerWeek}
            onChange={(v) => set({ ratePctPerWeek: v })}
          />
          <T v="small" style={{ fontSize: 12 }}>
            {p.goal === 'bulk' ? 'Медленнее — меньше жира. Новичкам можно быстрее.' : 'Быстрее 1% в неделю — риск потерять мышцы и силу.'}
          </T>
        </View>
      ) : null}
    </View>
  );
}

export function BodySection({ p, set }: { p: UserProfile; set: Setter }) {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: 6 }}>
        <T v="caption">Пол</T>
        <Opt items={[{ v: 'male', label: 'Мужской' }, { v: 'female', label: 'Женский' }]} value={p.sex} onChange={(v) => set({ sex: v })} />
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <NumberStepper label="Возраст" value={p.age} onChange={(v) => set({ age: Math.round(v) })} min={14} max={90} style={{ flex: 1 }} />
        <NumberStepper label="Рост" unit="см" value={p.heightCm} onChange={(v) => set({ heightCm: Math.round(v) })} min={130} max={230} style={{ flex: 1 }} />
      </View>
      <NumberStepper label="Вес" unit="кг" value={p.weightKg} onChange={(v) => set({ weightKg: v })} step={0.5} decimals={1} min={35} max={250} />
    </View>
  );
}

export function TrainingSection({ p, set }: { p: UserProfile; set: Setter }) {
  const toggleEq = (e: Equipment) => set({ equipment: p.equipment.includes(e) ? p.equipment.filter((x) => x !== e) : [...p.equipment, e] });
  const toggleDay = (d: number) => {
    const next = p.preferredDays.includes(d) ? p.preferredDays.filter((x) => x !== d) : [...p.preferredDays, d];
    set({ preferredDays: next.sort() });
  };
  return (
    <View style={{ gap: space.md }}>
      <View style={{ gap: 6 }}>
        <T v="caption">Уровень подготовки</T>
        <Opt
          items={[
            { v: 'beginner', label: 'Новичок' },
            { v: 'intermediate', label: 'Средний' },
            { v: 'advanced', label: 'Продвинутый' },
          ]}
          value={p.level}
          onChange={(v) => set({ level: v })}
        />
      </View>
      <NumberStepper label="Стаж тренировок, лет" value={p.trainingYears} onChange={(v) => set({ trainingYears: v })} step={0.5} decimals={1} min={0} max={40} />
      <View style={{ gap: 6 }}>
        <T v="caption">Сколько дней в неделю реально можешь</T>
        <Opt items={[2, 3, 4, 5, 6].map((v) => ({ v, label: String(v) }))} value={p.daysPerWeek} onChange={(v) => set({ daysPerWeek: v, preferredDays: p.preferredDays.length === v ? p.preferredDays : [] })} />
      </View>
      <View style={{ gap: 6 }}>
        <T v="caption">Длительность тренировки</T>
        <Opt items={[45, 60, 75, 90].map((v) => ({ v, label: `${v} мин` }))} value={[45, 60, 75, 90].reduce((a, b) => (Math.abs(b - p.sessionMinutes) < Math.abs(a - p.sessionMinutes) ? b : a))} onChange={(v) => set({ sessionMinutes: v })} />
      </View>
      <View style={{ gap: 6 }}>
        <T v="caption">Дни тренировок (необязательно)</T>
        <View style={styles.wrap}>
          {WEEKDAYS_SHORT.map((w, i) => (
            <Chip key={w} label={w} active={p.preferredDays.includes(i)} onPress={() => toggleDay(i)} style={{ minWidth: 46, justifyContent: 'center' }} />
          ))}
        </View>
        <T v="small" style={{ fontSize: 12 }} color={p.preferredDays.length && p.preferredDays.length !== p.daysPerWeek ? colors.warning : colors.textDim}>
          {p.preferredDays.length && p.preferredDays.length !== p.daysPerWeek ? `Выбрано ${p.preferredDays.length}, нужно ${p.daysPerWeek} — иначе FORM расставит дни сам.` : 'Если не выбрать — FORM равномерно распределит тренировки.'}
        </T>
      </View>
      <View style={{ gap: 6 }}>
        <T v="caption">Где тренируешься</T>
        <Opt
          items={[
            { v: 'gym', label: 'Зал' },
            { v: 'home', label: 'Дома' },
          ]}
          value={p.location}
          onChange={(v) => set({ location: v, equipment: v === 'gym' ? GYM_EQUIPMENT : HOME_DEFAULT })}
        />
      </View>
      <View style={{ gap: 6 }}>
        <T v="caption">Доступное оборудование</T>
        <View style={styles.wrap}>
          {(p.location === 'gym' ? GYM_EQUIPMENT : (['dumbbell', 'bench', 'pullupbar', 'kettlebell', 'band'] as Equipment[])).map((e) => (
            <Chip key={e} label={EQUIPMENT_LABEL[e]} active={p.equipment.includes(e)} onPress={() => toggleEq(e)} />
          ))}
        </View>
      </View>
      <Field label="Ограничения и травмы" placeholder="Например: правое плечо не любит жим над головой" value={p.limitations} onChangeText={(t) => set({ limitations: t })} multiline hint="Для AI-тренера. Структурированные ограничения (зона, движения) и исключения — в Профиль → Предпочтения и ограничения." />
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

const LIKE_SUGGEST = ['Курица', 'Творог', 'Рис', 'Гречка', 'Яйца', 'Овсянка', 'Говядина', 'Индейка', 'Лосось', 'Скир', 'Бананы', 'Картофель', 'Макароны', 'Орехи'];
const RESTRICTIONS: { v: string; label: string }[] = [
  { v: 'vegetarian', label: 'Вегетарианство' },
  { v: 'no_fish', label: 'Без рыбы' },
  { v: 'lactose', label: 'Без лактозы' },
  { v: 'gluten', label: 'Без глютена' },
];

export function FoodSection({ p, set }: { p: UserProfile; set: Setter }) {
  return (
    <View style={{ gap: space.md }}>
      <TagInput label="Любимые продукты" values={p.likedFoods} onChange={(v) => set({ likedFoods: v })} suggestions={LIKE_SUGGEST} placeholder="Добавить продукт" />
      <TagInput label="Не ешь / не любишь" values={p.dislikedFoods} onChange={(v) => set({ dislikedFoods: v })} suggestions={['Рыба', 'Молоко', 'Грибы', 'Свинина', 'Печень']} placeholder="Добавить продукт" />
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

export function TagInput({ label, values, onChange, suggestions = [], placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; suggestions?: string[]; placeholder?: string }) {
  const [text, setText] = useState('');
  const add = (v: string) => {
    const t = v.trim();
    if (!t || values.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    onChange([...values, t]);
    setText('');
  };
  const rest = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()));
  return (
    <View style={{ gap: 8 }}>
      <T v="caption">{label}</T>
      {values.length ? (
        <View style={styles.wrap}>
          {values.map((v) => (
            <Pressable key={v} accessibilityLabel={`Удалить ${v}`} onPress={() => onChange(values.filter((x) => x !== v))} style={styles.tag}>
              <T v="small" color={colors.onAccent} style={{ fontWeight: '700' }}>
                {v}
              </T>
              <Icon name="close" size={14} color={colors.onAccent} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.tagInputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          onSubmitEditing={() => add(text)}
          returnKeyType="done"
          style={styles.tagInput}
          selectionColor={colors.accent}
        />
        <Pressable onPress={() => add(text)} accessibilityLabel="Добавить" style={styles.tagAdd} disabled={!text.trim()}>
          <Icon name="add" size={20} color={text.trim() ? colors.accent : colors.muted} />
        </Pressable>
      </View>
      {rest.length ? (
        <View style={styles.wrap}>
          {rest.slice(0, 10).map((s) => (
            <Chip key={s} label={`+ ${s}`} onPress={() => add(s)} style={{ height: 32 }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  goal: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, paddingHorizontal: 12, height: 32, borderRadius: radius.pill },
  tagInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  tagInput: { flex: 1, minWidth: 0, height: 48, color: colors.text, fontSize: 16, paddingHorizontal: space.md },
  tagAdd: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
