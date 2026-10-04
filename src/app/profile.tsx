import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import type { UserProfile } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Banner, Button, Card, Chip, Divider, Icon, SectionTitle, T } from '@/components/ui';
import { Field, NumberStepper, Toggle } from '@/components/inputs';
import { Sheet } from '@/components/Sheet';
import { confirm, toast } from '@/components/Dialog';
import { resetAllStores } from '@/stores/hydration';
import { clearAllData } from '@/storage/persist';
import { useProfile } from '@/stores/profile';
import { useCoach } from '@/stores/coach';
import { useHealth } from '@/stores/health';
import { applyProfile } from '@/features/profile/applyProfile';
import { BodySection, FoodSection, GoalPicker, HealthSection, LifestyleSection, TrainingSection } from '@/features/profile/forms';
import { hasHealthInfo, healthOf, healthTraining } from '@/features/profile/health';
import { GOAL_LABEL } from '@/features/nutrition/targets';
import { LEVEL_LABEL } from '@/features/training/planGenerator';
import { ensurePermission } from '@/services/notifications';
import { relativeDay, toISODate } from '@/utils/date';
import { getPrefs } from '@/features/training/engine/prefs';
import { SPLIT_PREF_LABEL } from '@/features/training/engine/split';
import { GymSheet } from '@/features/training/GymSheet';
import { BRAND } from '@/config/brand';

function prefsSummary(p: UserProfile): string {
  const t = getPrefs(p);
  const parts = [t.preferredSplit === 'auto' ? 'Сплит: авто' : SPLIT_PREF_LABEL[t.preferredSplit]];
  if (t.excluded.length) parts.push(`исключено ${t.excluded.length}`);
  if (t.limitations.length) parts.push(`ограничений ${t.limitations.length}`);
  if (t.setStyle !== 'auto') parts.push(`${t.setStyle} подхода`);
  return parts.join(' · ');
}

function healthLine(p: UserProfile): string {
  const h = healthOf(p);
  if (!hasHealthInfo(h)) return 'Травмы, ограничения, аллергии — не указаны';
  const r = healthTraining(p);
  const parts: string[] = [];
  if (r.limitations.length) parts.push(`ограничений движений: ${r.limitations.length}`);
  if (h.allergies.length + h.intolerances.length) parts.push(`аллергии/непереносимости: ${h.allergies.length + h.intolerances.length}`);
  if (r.minRir >= 2) parts.push('без отказа');
  return parts.join(' · ') || 'Учтено в плане и питании';
}

const MORNING_TIMES = [[6, 30], [7, 0], [7, 30], [8, 0], [9, 0]] as const;
const TRAINING_TIMES = [[7, 0], [12, 0], [17, 0], [18, 0], [19, 0]] as const;
const hm = (h: number, m: number) => `${h}:${String(m).padStart(2, '0')}`;

type Section = 'goal' | 'body' | 'training' | 'health' | 'life' | 'food' | null;
const TITLES: Record<Exclude<Section, null>, string> = { goal: 'Цель', body: 'Параметры тела', training: 'Тренировки', health: 'Здоровье и особенности', life: 'Активность', food: 'Питание и предпочтения' };

export default function Profile() {
  const profile = useProfile((s) => s.profile);
  const settings = useProfile((s) => s.settings);
  const updateSettings = useProfile((s) => s.updateSettings);
  const memory = useCoach((s) => s.memory);
  const healthOn = useHealth((s) => s.enabled);
  const healthSync = useHealth((s) => s.lastSyncAt);
  const healthSummary = healthOn ? `Подключено${healthSync ? ` · ${new Date(healthSync).toTimeString().slice(0, 5)}` : ''}` : 'Не подключено · сон, шаги, HRV, пульс';
  const [section, setSection] = useState<Section>(null);
  const [gymOpen, setGymOpen] = useState(false);
  const [draft, setDraft] = useState<UserProfile | null>(null);
  const [fact, setFact] = useState('');
  const [editMem, setEditMem] = useState<{ id: string; text: string } | null>(null);
  const [notifDenied, setNotifDenied] = useState(false);

  const toggleReminder = async (key: 'morningReminder' | 'trainingReminder' | 'restNotify' | 'weeklyReview', v: boolean) => {
    if (v && Platform.OS !== 'web') {
      const ok = await ensurePermission();
      setNotifDenied(!ok);
      if (!ok) return;
    }
    updateSettings({ [key]: v });
  };

  if (!profile) return null;
  const open = (s: Exclude<Section, null>) => {
    setDraft({ ...profile });
    setSection(s);
  };
  const save = () => {
    if (!draft) return;
    const r = applyProfile(draft);
    setSection(null);
    toast(r.planRebuilt ? 'План тренировок и питание пересчитаны' : r.targetChanged ? 'КБЖУ пересчитаны' : 'Сохранено');
  };
  const set = (patch: Partial<UserProfile>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <Screen keyboard>
      <Header title="Профиль" />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={styles.avatar}>
          <T v="h1" color={colors.onAccent}>
            {profile.name.charAt(0).toUpperCase()}
          </T>
        </View>
        <View style={{ flex: 1 }}>
          <T v="h2" numberOfLines={1}>
            {profile.name}
          </T>
          <T v="small">
            {GOAL_LABEL[profile.goal]} · {LEVEL_LABEL[profile.level]}
          </T>
        </View>
      </Card>

      <SectionTitle title="Данные" />
      <Card style={{ paddingVertical: 4 }}>
        <Row label="Цель" value={`${GOAL_LABEL[profile.goal]}${profile.goal === 'bulk' || profile.goal === 'cut' ? ` · ${String(profile.ratePctPerWeek).replace('.', ',')}%/нед` : ''}`} onPress={() => open('goal')} />
        <Divider />
        <Row label="Тело" value={`${profile.sex === 'male' ? 'М' : 'Ж'} · ${profile.age} лет · ${profile.heightCm} см · ${profile.weightKg} кг`} onPress={() => open('body')} />
        <Divider />
        <Row label="Тренировки" value={`${profile.daysPerWeek}×/нед · ${profile.sessionMinutes} мин · ${profile.location === 'gym' ? 'зал' : 'дом'}`} onPress={() => open('training')} />
        <Divider />
        <Row label="Здоровье и особенности" value={healthLine(profile)} onPress={() => open('health')} />
        <Divider />
        <Row label="Предпочтения и ограничения" value={prefsSummary(profile)} onPress={() => router.push('/training-prefs')} />
        <Divider />
        <Row label="Активность" value={`${profile.stepsPerDay} шагов · ${profile.workStyle === 'desk' ? 'сидячая' : profile.workStyle === 'mixed' ? 'смешанная' : 'физическая'} работа`} onPress={() => open('life')} />
        <Divider />
        <Row label="Питание" value={profile.likedFoods.length ? `Любит: ${profile.likedFoods.slice(0, 3).join(', ')}` : 'Предпочтения не заданы'} onPress={() => open('food')} />
      </Card>
      <Button title="Мой план и расчёты" icon="document-text-outline" variant="secondary" style={{ marginTop: space.md }} onPress={() => router.push('/plan')} />

      <SectionTitle title="Настройки" />
      <Card style={{ paddingVertical: 4, marginBottom: space.md }}>
        <Row label="Оформление" value={`${settings.theme === 'light' ? 'Светлая' : settings.theme === 'system' ? 'Системная' : 'Тёмная'} тема`} onPress={() => router.push('/appearance')} />
        <Divider />
        <Row label="Apple Health" value={healthSummary} onPress={() => router.push('/health')} />
        <Divider />
        <Row label="Данные и конфиденциальность" value={settings.lastBackupAt ? `Всё на устройстве · копия ${relativeDay(toISODate(new Date(settings.lastBackupAt))).toLowerCase()}` : 'Всё хранится на устройстве · экспорт и перенос'} onPress={() => router.push('/data')} />
      </Card>
      <Card style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52 }}>
          <T v="body" style={{ flex: 1 }}>
            Единицы веса
          </T>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Chip label="кг" active={settings.weightUnit === 'kg'} onPress={() => updateSettings({ weightUnit: 'kg' })} />
            <Chip label="lb" active={settings.weightUnit === 'lb'} onPress={() => updateSettings({ weightUnit: 'lb' })} />
          </View>
        </View>
        <Row label="Оборудование зала" value={settings.gym ? `Гриф ${settings.gym.barKg} кг · гантели шаг ${String(settings.gym.dumbbellStep).replace('.', ',')} · тренажёры ${String(settings.gym.machineStep).replace('.', ',')}` : 'Стандартный зал — настроить диски и шаги'} onPress={() => setGymOpen(true)} />
        <Toggle value={settings.restTimerAuto} onChange={(v) => updateSettings({ restTimerAuto: v })} label="Авто-таймер отдыха" sub="Запускается после отметки подхода" />
        <NumberStepper label="Отдых по умолчанию, сек" value={settings.defaultRestSec} onChange={(v) => updateSettings({ defaultRestSec: Math.round(v) })} step={15} min={30} max={600} compact />
        <Toggle value={settings.haptics} onChange={(v) => updateSettings({ haptics: v })} label="Тактильный отклик" sub="Подходы, таймер, рекорды (на iPhone)" />
      </Card>

      <SectionTitle title="Напоминания" />
      <Card style={{ gap: 6 }}>
        {Platform.OS === 'web' ? <Banner text="Уведомления работают на iPhone (в web-превью недоступны)." /> : null}
        {notifDenied ? <Banner tone="warning" icon="notifications-off-outline" text={`Уведомления запрещены. Разреши их в Настройках iPhone → ${BRAND}.`} /> : null}
        <Toggle value={settings.restNotify} onChange={(v) => toggleReminder('restNotify', v)} label="Конец отдыха" sub="Уведомление, если приложение свёрнуто во время отдыха" />
        <Toggle value={settings.morningReminder} onChange={(v) => toggleReminder('morningReminder', v)} label="Утренний чек-ин" sub="Каждый день: самочувствие + вес" />
        {settings.morningReminder ? (
          <View style={styles.times}>
            {MORNING_TIMES.map(([h, m]) => (
              <Chip key={hm(h, m)} label={hm(h, m)} active={settings.morningTime.hour === h && settings.morningTime.minute === m} onPress={() => updateSettings({ morningTime: { hour: h, minute: m } })} style={{ height: 32 }} />
            ))}
          </View>
        ) : null}
        <Toggle value={!!settings.weeklyReview} onChange={(v) => toggleReminder('weeklyReview', v)} label="Отчёт недели" sub="По понедельникам: итоги и что изменить" />
        <Toggle value={settings.trainingReminder} onChange={(v) => toggleReminder('trainingReminder', v)} label="Тренировка по плану" sub="Только в дни тренировок, следует за расписанием" />
        {settings.trainingReminder ? (
          <View style={styles.times}>
            {TRAINING_TIMES.map(([h, m]) => (
              <Chip key={hm(h, m)} label={hm(h, m)} active={settings.trainingTime.hour === h && settings.trainingTime.minute === m} onPress={() => updateSettings({ trainingTime: { hour: h, minute: m } })} style={{ height: 32 }} />
            ))}
          </View>
        ) : null}
      </Card>

      <SectionTitle title={`Что ${BRAND} знает обо мне · ${memory.length}`} />
      <Card style={{ gap: 8 }}>
        {memory.length === 0 ? <T v="small">Тренер запоминает устойчивые факты: что ты не любишь, как реагируют суставы, когда удобно тренироваться.</T> : null}
        {memory.map((m) =>
          editMem?.id === m.id ? (
            <View key={m.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <Field style={{ flex: 1 }} value={editMem.text} onChangeText={(t) => setEditMem({ id: m.id, text: t })} autoFocus />
              <Button title="OK" size="sm" disabled={!editMem.text.trim()} onPress={() => { useCoach.getState().updateMemory(m.id, editMem.text); setEditMem(null); }} style={{ height: 50 }} />
            </View>
          ) : (
            <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Icon name={m.category === 'food' ? 'restaurant-outline' : m.category === 'injury' || m.category === 'health' ? 'medkit-outline' : m.category === 'training' ? 'barbell-outline' : 'bookmark-outline'} size={16} color={colors.textDim} />
              <Pressable style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Изменить: ${m.text}`} onPress={() => setEditMem({ id: m.id, text: m.text })}>
                <T v="body" style={{ fontSize: 14 }}>
                  {m.text}
                </T>
                <T v="small" style={{ fontSize: 11 }}>
                  {m.source === 'coach' ? 'запомнил тренер' : 'добавлено тобой'} · тап — изменить
                </T>
              </Pressable>
              <Pressable hitSlop={10} accessibilityLabel="Удалить факт" onPress={() => useCoach.getState().removeMemory(m.id)}>
                <Icon name="close" size={16} color={colors.muted} />
              </Pressable>
            </View>
          ),
        )}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <Field style={{ flex: 1 }} placeholder="Добавить факт: «Не ем рыбу»" value={fact} onChangeText={setFact} onSubmitEditing={() => { if (fact.trim()) { useCoach.getState().addMemory(fact, 'preference', 'user'); setFact(''); } }} />
          <Button title="Добавить" size="sm" disabled={!fact.trim()} onPress={() => { useCoach.getState().addMemory(fact, 'preference', 'user'); setFact(''); }} style={{ height: 50 }} />
        </View>
      </Card>

      <Button
        title="Удалить все данные"
        icon="trash-outline"
        size="sm"
        variant="danger"
        style={{ marginTop: space.xl }}
        onPress={() =>
          confirm('Удалить все данные?', 'Профиль, план, тренировки, питание, замеры и память тренера будут удалены с устройства без возможности восстановления (кроме ранее экспортированного файла).', 'Удалить всё', async () => {
            await resetAllStores();
            await clearAllData();
            router.replace('/onboarding');
          }, true)
        }
      />

      <T v="small" style={{ textAlign: 'center', marginTop: space.lg, fontSize: 12 }}>
        {BRAND} — фитнес-помощник и не ставит медицинских диагнозов.
      </T>

      <GymSheet visible={gymOpen} onClose={() => setGymOpen(false)} />
      <Sheet visible={!!section} onClose={() => setSection(null)} title={section ? TITLES[section] : ''} footer={<Button title="Сохранить и пересчитать" icon="checkmark" size="lg" onPress={save} />}>
        {draft && section === 'goal' ? <GoalPicker p={draft} set={set} /> : null}
        {draft && section === 'body' ? <BodySection p={draft} set={set} /> : null}
        {draft && section === 'training' ? <TrainingSection p={draft} set={set} /> : null}
        {draft && section === 'health' ? <HealthSection p={draft} set={set} /> : null}
        {draft && section === 'life' ? <LifestyleSection p={draft} set={set} /> : null}
        {draft && section === 'food' ? (
          <View style={{ gap: space.md }}>
            <Field label="Имя" value={draft.name} onChangeText={(t) => set({ name: t })} maxLength={40} />
            <FoodSection p={draft} set={set} />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function Row({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={{ flex: 1 }}>
        <T v="body" style={{ fontWeight: '700' }}>
          {label}
        </T>
        <T v="small" numberOfLines={1}>
          {value}
        </T>
      </View>
      <Icon name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = themed({
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingVertical: 8, borderRadius: radius.sm },
});
