import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { Equipment, GoalType, HealthProfile, UserProfile } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Banner, Chip, Icon, T } from '@/components/ui';
import { Field, NumberStepper } from '@/components/inputs';
import { EQUIPMENT_LABEL } from '@/data/exercises';
import { GOAL_LABEL, defaultRate } from '@/features/nutrition/targets';
import { WEEKDAYS_SHORT } from '@/utils/date';
import { haptic } from '@/services/haptics';
import { EMPTY_HEALTH, healthOf, healthTraining } from './health';
import { AREA_LABEL, RESTRICTION_LABEL } from '@/features/training/engine/restrictions';
import { BRAND } from '@/config/brand';
import { CategoryPicker, joinItems, splitItems, type PickerCategory } from './CategoryPicker';

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
    health: { ...EMPTY_HEALTH },
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
          {p.preferredDays.length && p.preferredDays.length !== p.daysPerWeek ? `Выбрано ${p.preferredDays.length}, нужно ${p.daysPerWeek} — иначе ${BRAND} расставит дни сам.` : `Если не выбрать — ${BRAND} равномерно распределит тренировки.`}
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
              <T v="small" color={colors.onAccent} style={{ fontWeight: '700' }}>
                {v}
              </T>
              <Icon name="close" size={14} color={colors.onAccent} />
            </Pressable>
          ))}
          {!values.length ? (
            <T v="body" color={colors.muted} style={{ alignSelf: 'center', fontSize: 16 }}>
              Выбрать из списка или вписать своё
            </T>
          ) : null}
        </View>
        <View style={styles.inlineAdd}>
          <Icon name="add" size={22} color={colors.accent} />
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
            <Icon name="add" size={22} color={colors.accent} />
          </Pressable>
        }
      />
      <CategoryPicker visible={open} category={category} value={items} onClose={() => setOpen(false)} onSave={(v) => onChange(joinItems(v))} />
    </View>
  );
}


const styles = themed({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  goal: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.accent, paddingHorizontal: 12, height: 32, borderRadius: radius.pill },
  tagField: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, paddingLeft: space.md, paddingRight: 6, paddingVertical: 6, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  inlineAdd: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine },
  rules: { gap: 4, padding: 12, borderRadius: radius.md, backgroundColor: colors.accentDim, borderWidth: 1, borderColor: colors.accentLine },
});
