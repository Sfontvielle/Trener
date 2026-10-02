import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { BodyArea, LimitationSeverity, RecoveryProfile, MovementRestriction, RepStyle, SetStyle, SplitPreference, TrainingLimitation, UserProfile, VolumeMuscle } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Banner, Button, Card, Chip, Icon, SectionTitle, Segmented, T } from '@/components/ui';
import { Field, Toggle } from '@/components/inputs';
import { Sheet } from '@/components/Sheet';
import { confirm, toast } from '@/components/Dialog';
import { useProfile } from '@/stores/profile';
import { useWorkouts } from '@/stores/workouts';
import { usePlan } from '@/stores/plan';
import { SplitCompareButton } from '@/features/training/SplitCompare';
import { applyProfile } from '@/features/profile/applyProfile';
import { ExercisePickerSheet } from '@/features/exercises/ExercisePickerSheet';
import { getExercise } from '@/data/exercises';
import { excludeExercise, getPrefs, includeExercise, removeLimitation, toggleDislike, toggleFavorite, upsertLimitation, withPrefs } from '@/features/training/engine/prefs';
import { chooseSplit, SPLIT_LABEL, SPLIT_PREF_LABEL } from '@/features/training/engine/split';
import { AREA_LABEL, AREA_MOVEMENTS, RESTRICTION_LABEL } from '@/features/training/engine/restrictions';
import { VM_LABEL, VOLUME_MUSCLES } from '@/features/training/engine/muscles';
import { uid } from '@/utils/id';

const SPLITS: SplitPreference[] = ['auto', 'fullbody', 'upper_lower', 'torso_limbs', 'ppl', 'ul_ppl', 'bro', 'custom'];
const RECOVERY: { key: RecoveryProfile; label: string; sub: string }[] = [
  { key: 'auto', label: 'Определять FORM', sub: 'по сну, готовности, крепатуре и прогрессу' },
  { key: 'standard', label: 'Стандартное', sub: 'обычный объём, корректируется по данным' },
  { key: 'enhanced', label: 'Повышенное', sub: 'учитывается как один из факторов, не как разрешение на объём' },
];
const SET_ITEMS: { key: string; label: string }[] = [
  { key: 'auto', label: 'FORM решает' },
  { key: '2', label: '2 подхода' },
  { key: '3', label: '3 подхода' },
];
const SET_HINT: Record<string, string> = {
  auto: 'Подходы считаются от недельной цели по каждой мышце: основные 3–5, изоляция 2–4.',
  '2': 'Обычно 2 подхода. Чтобы не терять недельный объём, FORM добавит упражнение или +1 подход в основном движении — и объяснит это в плане.',
  '3': 'Обычно 3 подхода, в основном упражнении — до 4, если иначе объём не добрать.',
};
const REP_ITEMS: { key: RepStyle; label: string }[] = [
  { key: 'auto', label: 'Авто' },
  { key: 'heavy', label: 'Тяжело' },
  { key: 'moderate', label: 'Средне' },
  { key: 'light', label: 'Много' },
];
const SEVERITY: { key: LimitationSeverity; label: string }[] = [
  { key: 'mild', label: 'Лёгкий' },
  { key: 'moderate', label: 'Умеренный' },
  { key: 'severe', label: 'Сильный' },
];
const SEVERITY_HINT: Record<LimitationSeverity, string> = {
  mild: 'Лёгкий: такие движения получают большой штраф и ставятся, только если нет замены.',
  moderate: 'Умеренный: выбранные движения не назначаются совсем.',
  severe: 'Сильный: исключаются ВСЕ упражнения, нагружающие эту зону.',
};
const AREAS = Object.keys(AREA_LABEL) as BodyArea[];

export default function TrainingPrefs() {
  const profile = useProfile((s) => s.profile);
  const sessions = useWorkouts((s) => s.sessions);
  const plan = usePlan((s) => s.plan);
  const [picker, setPicker] = useState<null | 'excluded' | 'disliked' | 'preferred'>(null);
  const [editing, setEditing] = useState<TrainingLimitation | null>(null);
  const [showMovements, setShowMovements] = useState(false);
  const prefs = useMemo(() => (profile ? getPrefs(profile) : null), [profile]);
  const choice = useMemo(() => (profile && prefs ? chooseSplit(profile, prefs, sessions) : null), [profile, prefs, sessions]);
  if (!profile || !prefs || !choice) return null;

  const commit = (next: UserProfile, msg = 'Сохранено, план обновлён') => {
    const r = applyProfile(next);
    toast(r.planRebuilt ? msg : 'Сохранено');
  };

  const cyclePriority = (m: VolumeMuscle) => {
    const pri = prefs.priorityMuscles.includes(m);
    const low = prefs.lowPriorityMuscles.includes(m);
    // обычная → приоритет → низкий приоритет → обычная
    if (!pri && !low) commit(withPrefs(profile, { priorityMuscles: [...prefs.priorityMuscles, m] }));
    else if (pri) commit(withPrefs(profile, { priorityMuscles: prefs.priorityMuscles.filter((x) => x !== m), lowPriorityMuscles: [...prefs.lowPriorityMuscles, m] }));
    else commit(withPrefs(profile, { lowPriorityMuscles: prefs.lowPriorityMuscles.filter((x) => x !== m) }));
  };

  const listIds = picker === 'excluded' ? prefs.excluded.map((e) => e.exerciseId) : picker === 'disliked' ? prefs.dislikedExercises : prefs.preferredExercises;

  return (
    <Screen>
      <Header title="Предпочтения и ограничения" subtitle="Учитываются при составлении любой тренировки" />

      <SectionTitle title="Сплит" />
      <Card style={{ gap: 10 }}>
        <View style={styles.wrap}>
          {SPLITS.map((s) => (
            <Chip key={s} label={s === 'auto' ? 'Авто' : SPLIT_PREF_LABEL[s]} active={prefs.preferredSplit === s} onPress={() => commit(withPrefs(profile, { preferredSplit: s }), 'Сплит изменён, план перестроен')} />
          ))}
        </View>
        {prefs.preferredSplit === 'custom' ? (
          <T v="small">Свой формат: FORM не перестраивает твои шаблоны, только заменяет упражнения, которые конфликтуют с ограничениями.</T>
        ) : (
          <View style={styles.why}>
            <T v="body" style={{ fontWeight: '800' }}>
              {prefs.preferredSplit === 'auto' ? `FORM выбрал: ${SPLIT_LABEL[choice.split]}` : SPLIT_LABEL[choice.split]}
            </T>
            <T v="caption" style={{ marginTop: 4 }}>
              Почему
            </T>
            {choice.reasons.map((r) => (
              <T key={r} v="small">
                • {r}
              </T>
            ))}
          </View>
        )}
        {plan && prefs.preferredSplit !== 'custom' ? <SplitCompareButton plan={plan} /> : null}
      </Card>

      <SectionTitle title="Восстановление" />
      <Card style={{ gap: 4, paddingVertical: 6 }}>
        {RECOVERY.map((r) => {
          const active = (prefs.recoveryProfile ?? 'auto') === r.key;
          return (
            <Pressable key={r.key} accessibilityRole="radio" accessibilityState={{ selected: active }} onPress={() => commit(withPrefs(profile, { recoveryProfile: r.key }))} style={styles.radioRow}>
              <View style={[styles.radio, active && { borderColor: colors.accent }]}>{active ? <View style={styles.radioDot} /> : null}</View>
              <View style={{ flex: 1 }}>
                <T v="body" style={{ fontWeight: '700' }}>
                  {r.label}
                </T>
                <T v="small" style={{ fontSize: 12 }}>
                  {r.sub}
                </T>
              </View>
            </Pressable>
          );
        })}
        {plan?.recovery ? (
          <T v="small" style={{ fontSize: 12, marginTop: 4 }}>
            Сейчас: {plan.recovery.level === 'high' ? 'хорошее' : plan.recovery.level === 'low' ? 'сниженное' : 'обычное'} восстановление
            {plan.recovery.factor !== 1 ? `, объём ×${String(plan.recovery.factor).replace('.', ',')}` : ''}. {plan.recovery.reasons.slice(0, 2).join('; ')}
          </T>
        ) : null}
        <T v="small" style={{ fontSize: 11, marginTop: 4 }} color={colors.muted}>
          Это только тренировочный контекст. FORM не даёт советов по препаратам и дозировкам и не оценивает их безопасность. Главное для объёма — фактический сон, готовность и прогресс.
        </T>
      </Card>

      <SectionTitle title="Подходы и повторы" />
      <Card style={{ gap: 10 }}>
        <Segmented items={SET_ITEMS} value={String(prefs.setStyle)} onChange={(k) => commit(withPrefs(profile, { setStyle: (k === 'auto' ? 'auto' : Number(k)) as SetStyle }))} />
        <T v="small">{SET_HINT[String(prefs.setStyle)]}</T>
        <T v="caption" style={{ marginTop: 4 }}>
          Диапазон повторений
        </T>
        <Segmented items={REP_ITEMS} value={prefs.repStyle} onChange={(k) => commit(withPrefs(profile, { repStyle: k }))} />
      </Card>

      <SectionTitle title="Приоритет мышц" />
      <Card style={{ gap: 8 }}>
        <T v="small">Тап: приоритет (+30% объёма, раньше в тренировке) → низкий приоритет (−40%) → обычный.</T>
        <View style={styles.wrap}>
          {VOLUME_MUSCLES.map((m) => {
            const pri = prefs.priorityMuscles.includes(m);
            const low = prefs.lowPriorityMuscles.includes(m);
            return <Chip key={m} label={`${pri ? '★ ' : low ? '↓ ' : ''}${VM_LABEL[m]}`} active={pri} onPress={() => cyclePriority(m)} style={low ? { opacity: 0.6 } : undefined} />;
          })}
        </View>
      </Card>

      <ExList
        title="Не предлагать"
        empty="Упражнения из этого списка никогда не попадают в план, генерацию и замены."
        items={prefs.excluded.map((e) => ({ id: e.exerciseId, sub: e.reason === 'discomfort' ? `дискомфорт${e.area ? ` · ${AREA_LABEL[e.area].toLowerCase()}` : ''}` : e.reason === 'doctor' ? 'запрет специалиста' : undefined }))}
        onRemove={(id) => commit(includeExercise(profile, id), 'Упражнение возвращено')}
        onAdd={() => setPicker('excluded')}
      />
      <ExList
        title="Не люблю"
        empty="Сильный штраф: такие упражнения ставятся, только если нет нормальной замены."
        items={prefs.dislikedExercises.map((id) => ({ id }))}
        onRemove={(id) => commit(toggleDislike(profile, id))}
        onAdd={() => setPicker('disliked')}
      />
      <ExList
        title="Предпочитаю"
        empty="Избранные упражнения выбираются чаще, если подходят по мышце и движению."
        items={prefs.preferredExercises.map((id) => ({ id }))}
        onRemove={(id) => commit(toggleFavorite(profile, id))}
        onAdd={() => setPicker('preferred')}
      />

      <SectionTitle title="Ограничения" />
      <Card style={{ gap: 10 }}>
        <T v="small">Опиши, какие ДВИЖЕНИЯ вызывают дискомфорт. Это не диагноз — FORM просто не будет их назначать.</T>
        {prefs.limitations.map((l) => (
          <Pressable key={l.id} accessibilityRole="button" onPress={() => setEditing(l)} style={[styles.lim, l.severity === 'severe' && { borderColor: colors.danger }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="body" style={{ fontWeight: '800' }}>
                {AREA_LABEL[l.area]} · {SEVERITY.find((x) => x.key === l.severity)?.label.toLowerCase()}
                {l.source === 'doctor' ? ' · от врача' : ''}
              </T>
              <T v="small" numberOfLines={2}>
                {l.severity === 'severe' ? 'Все упражнения на эту зону исключены' : l.movements.map((m) => RESTRICTION_LABEL[m].toLowerCase()).join(', ') || 'движения не выбраны'}
              </T>
              {l.note ? (
                <T v="small" numberOfLines={1} style={{ fontStyle: 'italic' }}>
                  «{l.note}»
                </T>
              ) : null}
            </View>
            <Icon name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}
        {prefs.limitations.some((l) => l.severity === 'severe') ? (
          <Banner tone="danger" icon="medkit-outline" text="Сильная или острая боль — повод обратиться к врачу. Тренировки не лечат боль: FORM только исключает нагрузку на эту зону." />
        ) : null}
        <Button title="Добавить ограничение" icon="add" variant="secondary" size="sm" onPress={() => setEditing({ id: uid('lim_'), area: 'shoulder', movements: [], severity: 'moderate', source: 'user', createdAt: Date.now() })} />
        <Pressable accessibilityRole="button" onPress={() => setShowMovements((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 }}>
          <T v="small" style={{ fontWeight: '700' }}>
            Движения, которые не предлагать вообще{prefs.excludedMovements.length ? ` · ${prefs.excludedMovements.length}` : ''}
          </T>
          <Icon name={showMovements ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textDim} />
        </Pressable>
        {showMovements ? (
          <View style={styles.wrap}>
            {(Object.keys(RESTRICTION_LABEL) as MovementRestriction[]).map((m) => (
              <Chip
                key={m}
                label={RESTRICTION_LABEL[m]}
                active={prefs.excludedMovements.includes(m)}
                onPress={() => commit(withPrefs(profile, { excludedMovements: prefs.excludedMovements.includes(m) ? prefs.excludedMovements.filter((x) => x !== m) : [...prefs.excludedMovements, m] }))}
              />
            ))}
          </View>
        ) : null}
      </Card>
      <T v="small" style={{ textAlign: 'center', marginTop: space.lg, fontSize: 12 }}>
        Изменения сразу перестраивают план. Упражнения, в которых есть прогресс, сохраняются.
      </T>

      <ExercisePickerSheet
        visible={!!picker}
        onClose={() => setPicker(null)}
        title={picker === 'excluded' ? 'Не предлагать' : picker === 'disliked' ? 'Не люблю' : 'Предпочитаю'}
        selectedIds={listIds}
        onPick={(e) => {
          if (listIds.includes(e.id)) return;
          const next = picker === 'excluded' ? excludeExercise(profile, e.id) : picker === 'disliked' ? toggleDislike(profile, e.id) : toggleFavorite(profile, e.id);
          setPicker(null);
          commit(next);
        }}
      />
      <LimitationSheet
        value={editing}
        onClose={() => setEditing(null)}
        onSave={(l) => {
          setEditing(null);
          commit(upsertLimitation(profile, l), 'Ограничение учтено, план обновлён');
        }}
        onDelete={(id) =>
          confirm('Удалить ограничение?', 'Упражнения, которые оно исключало, снова смогут попадать в план.', 'Удалить', () => {
            setEditing(null);
            commit(removeLimitation(profile, id));
          }, true)
        }
        exists={!!editing && prefs.limitations.some((l) => l.id === editing.id)}
      />
    </Screen>
  );
}

function ExList({ title, empty, items, onRemove, onAdd }: { title: string; empty: string; items: { id: string; sub?: string }[]; onRemove: (id: string) => void; onAdd: () => void }) {
  return (
    <>
      <SectionTitle title={`${title}${items.length ? ` · ${items.length}` : ''}`} action="Добавить" onAction={onAdd} />
      <Card style={{ gap: 8 }}>
        {items.length === 0 ? <T v="small">{empty}</T> : null}
        {items.map((it) => (
          <View key={it.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
            <View style={{ flex: 1 }}>
              <T v="body" style={{ fontSize: 15, fontWeight: '600' }} numberOfLines={1}>
                {getExercise(it.id)?.name ?? it.id}
              </T>
              {it.sub ? <T v="small">{it.sub}</T> : null}
            </View>
            <Pressable hitSlop={10} accessibilityLabel={`Убрать ${getExercise(it.id)?.name ?? it.id}`} onPress={() => onRemove(it.id)} style={styles.remove}>
              <Icon name="close" size={16} color={colors.textDim} />
            </Pressable>
          </View>
        ))}
      </Card>
    </>
  );
}

function LimitationSheet({ value, onClose, onSave, onDelete, exists }: { value: TrainingLimitation | null; onClose: () => void; onSave: (l: TrainingLimitation) => void; onDelete: (id: string) => void; exists: boolean }) {
  const [draft, setDraft] = useState<TrainingLimitation | null>(value);
  const [prevValue, setPrevValue] = useState(value);
  // Синхронизация черновика при открытии (во время рендера — без эффекта)
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value);
  }
  const l = draft;
  const set = (patch: Partial<TrainingLimitation>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  return (
    <Sheet
      visible={!!value}
      onClose={onClose}
      title={exists ? 'Ограничение' : 'Новое ограничение'}
      footer={
        l ? (
          <View style={{ gap: 8 }}>
            <Button title="Сохранить" icon="checkmark" size="lg" onPress={() => onSave(l)} disabled={l.severity !== 'severe' && l.movements.length === 0} />
            {exists ? <Button title="Удалить ограничение" variant="danger" size="sm" onPress={() => onDelete(l.id)} /> : null}
          </View>
        ) : null
      }
    >
      {l ? (
        <View style={{ gap: space.md }}>
          <View style={{ gap: 6 }}>
            <T v="caption">Зона</T>
            <View style={styles.wrap}>
              {AREAS.map((a) => (
                <Chip key={a} label={AREA_LABEL[a]} active={l.area === a} onPress={() => set({ area: a, movements: l.movements.filter((m) => AREA_MOVEMENTS[a].includes(m)) })} />
              ))}
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <T v="caption">Что вызывает дискомфорт</T>
            <View style={styles.wrap}>
              {AREA_MOVEMENTS[l.area].map((m) => (
                <Chip key={m} label={RESTRICTION_LABEL[m]} active={l.movements.includes(m)} onPress={() => set({ movements: l.movements.includes(m) ? l.movements.filter((x) => x !== m) : [...l.movements, m] })} />
              ))}
            </View>
          </View>
          <View style={{ gap: 6 }}>
            <T v="caption">Выраженность</T>
            <Segmented items={SEVERITY} value={l.severity} onChange={(k) => set({ severity: k })} />
            <T v="small">{SEVERITY_HINT[l.severity]}</T>
          </View>
          {l.severity === 'severe' ? <Banner tone="danger" icon="medkit-outline" text="При сильной, острой или нарастающей боли не тренируй эту зону и обратись к врачу. FORM не ставит диагнозов и не «лечит» боль тренировками." /> : null}
          <Toggle value={l.source === 'doctor'} onChange={(v) => set({ source: v ? 'doctor' : 'user' })} label="Рекомендация врача или физиотерапевта" sub="Такие ограничения — всегда жёсткий запрет" />
          <Field label="Комментарий" placeholder="Например: тянет в правом плече при жиме над головой" value={l.note ?? ''} onChangeText={(t) => set({ note: t })} maxLength={140} />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = themed({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  why: { backgroundColor: colors.surface2, borderRadius: radius.md, padding: space.md, gap: 2 },
  lim: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  radioRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  remove: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface3 },
});
