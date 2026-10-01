import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { UserProfile } from '@/types';
import { colors, radius, space } from '@/theme';
import { Header, Screen } from '@/components/Screen';
import { Banner, Button, Card, Chip, Divider, Icon, SectionTitle, T } from '@/components/ui';
import { Field, NumberStepper, Toggle } from '@/components/inputs';
import { Sheet } from '@/components/Sheet';
import { confirm, toast } from '@/components/Dialog';
import { useProfile } from '@/stores/profile';
import { useCoach } from '@/stores/coach';
import { resetAllStores } from '@/stores/hydration';
import { clearAllData } from '@/storage/persist';
import { applyProfile } from '@/features/profile/applyProfile';
import { BodySection, FoodSection, GoalPicker, LifestyleSection, TrainingSection } from '@/features/profile/forms';
import { GOAL_LABEL } from '@/features/nutrition/targets';
import { LEVEL_LABEL } from '@/features/training/planGenerator';
import { seedDemoData } from '@/features/profile/demo';
import { coachBaseUrl } from '@/services/coachApi';
import { ensurePermission } from '@/services/notifications';
import { backupStats, exportBackup, pickBackup, restoreBackup } from '@/services/backup';
import { relativeDay, toISODate } from '@/utils/date';

const MORNING_TIMES = [[6, 30], [7, 0], [7, 30], [8, 0], [9, 0]] as const;
const TRAINING_TIMES = [[7, 0], [12, 0], [17, 0], [18, 0], [19, 0]] as const;
const hm = (h: number, m: number) => `${h}:${String(m).padStart(2, '0')}`;

type Section = 'goal' | 'body' | 'training' | 'life' | 'food' | null;
const TITLES: Record<Exclude<Section, null>, string> = { goal: 'Цель', body: 'Параметры тела', training: 'Тренировки', life: 'Активность', food: 'Питание и предпочтения' };

export default function Profile() {
  const profile = useProfile((s) => s.profile);
  const settings = useProfile((s) => s.settings);
  const updateSettings = useProfile((s) => s.updateSettings);
  const memory = useCoach((s) => s.memory);
  const [section, setSection] = useState<Section>(null);
  const [draft, setDraft] = useState<UserProfile | null>(null);
  const [url, setUrl] = useState(settings.coachApiUrl);
  const [ping, setPing] = useState<'idle' | 'busy' | 'ok' | 'fail'>('idle');
  const [fact, setFact] = useState('');
  const [notifDenied, setNotifDenied] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);

  const toggleReminder = async (key: 'morningReminder' | 'trainingReminder' | 'restNotify', v: boolean) => {
    if (v && Platform.OS !== 'web') {
      const ok = await ensurePermission();
      setNotifDenied(!ok);
      if (!ok) return;
    }
    updateSettings({ [key]: v });
  };

  const doExport = async () => {
    setBackupBusy(true);
    try {
      const r = await exportBackup();
      updateSettings({ lastBackupAt: Date.now() });
      toast(r === 'downloaded' ? 'Файл копии скачан' : 'Копия готова — сохрани в «Файлы» или iCloud');
    } catch (e: any) {
      toast(e?.message ?? 'Не удалось создать копию', 'alert-circle');
    } finally {
      setBackupBusy(false);
    }
  };

  const doImport = async () => {
    try {
      const b = await pickBackup();
      if (!b) return;
      confirm('Восстановить из копии?', `${backupStats(b)}, от ${b.exportedAt.slice(0, 10)}. Текущие данные на этом устройстве будут заменены.`, 'Восстановить', () => {
        restoreBackup(b);
        toast('Данные восстановлены');
        router.replace('/');
      }, true);
    } catch (e: any) {
      toast(e?.message ?? 'Не удалось прочитать файл', 'alert-circle');
    }
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

  const testServer = async () => {
    updateSettings({ coachApiUrl: url.trim() });
    const base = (url.trim() || coachBaseUrl()).replace(/\/+$/, '');
    if (!base) return setPing('fail');
    setPing('busy');
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8000);
      const r = await fetch(`${base}/health`, { signal: ctrl.signal });
      clearTimeout(t);
      setPing(r.ok ? 'ok' : 'fail');
    } catch {
      setPing('fail');
    }
  };

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
        <Row label="Активность" value={`${profile.stepsPerDay} шагов · ${profile.workStyle === 'desk' ? 'сидячая' : profile.workStyle === 'mixed' ? 'смешанная' : 'физическая'} работа`} onPress={() => open('life')} />
        <Divider />
        <Row label="Питание" value={profile.likedFoods.length ? `Любит: ${profile.likedFoods.slice(0, 3).join(', ')}` : 'Предпочтения не заданы'} onPress={() => open('food')} />
      </Card>
      <Button title="Мой план и расчёты" icon="document-text-outline" variant="secondary" style={{ marginTop: space.md }} onPress={() => router.push('/plan')} />

      <SectionTitle title="Настройки" />
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
        <Toggle value={settings.restTimerAuto} onChange={(v) => updateSettings({ restTimerAuto: v })} label="Авто-таймер отдыха" sub="Запускается после отметки подхода" />
        <NumberStepper label="Отдых по умолчанию, сек" value={settings.defaultRestSec} onChange={(v) => updateSettings({ defaultRestSec: Math.round(v) })} step={15} min={30} max={600} compact />
        <Toggle value={settings.haptics} onChange={(v) => updateSettings({ haptics: v })} label="Тактильный отклик" sub="Подходы, таймер, рекорды (на iPhone)" />
      </Card>

      <SectionTitle title="Напоминания" />
      <Card style={{ gap: 6 }}>
        {Platform.OS === 'web' ? <Banner text="Уведомления работают на iPhone (в web-превью недоступны)." /> : null}
        {notifDenied ? <Banner tone="warning" icon="notifications-off-outline" text="Уведомления запрещены. Разреши их в Настройках iPhone → FORM." /> : null}
        <Toggle value={settings.restNotify} onChange={(v) => toggleReminder('restNotify', v)} label="Конец отдыха" sub="Уведомление, если приложение свёрнуто во время отдыха" />
        <Toggle value={settings.morningReminder} onChange={(v) => toggleReminder('morningReminder', v)} label="Утренний чек-ин" sub="Каждый день: самочувствие + вес" />
        {settings.morningReminder ? (
          <View style={styles.times}>
            {MORNING_TIMES.map(([h, m]) => (
              <Chip key={hm(h, m)} label={hm(h, m)} active={settings.morningTime.hour === h && settings.morningTime.minute === m} onPress={() => updateSettings({ morningTime: { hour: h, minute: m } })} style={{ height: 32 }} />
            ))}
          </View>
        ) : null}
        <Toggle value={settings.trainingReminder} onChange={(v) => toggleReminder('trainingReminder', v)} label="Тренировка по плану" sub="Только в дни тренировок, следует за расписанием" />
        {settings.trainingReminder ? (
          <View style={styles.times}>
            {TRAINING_TIMES.map(([h, m]) => (
              <Chip key={hm(h, m)} label={hm(h, m)} active={settings.trainingTime.hour === h && settings.trainingTime.minute === m} onPress={() => updateSettings({ trainingTime: { hour: h, minute: m } })} style={{ height: 32 }} />
            ))}
          </View>
        ) : null}
      </Card>

      <SectionTitle title="AI Coach" />
      <Card style={{ gap: 10 }}>
        <Field label="Адрес AI-сервера" placeholder="https://… или http://192.168.1.10:8787" value={url} onChangeText={(t) => { setUrl(t); setPing('idle'); }} autoCapitalize="none" autoCorrect={false} keyboardType="url" hint="Сервер из папки server/ проекта. Без него тренер отвечает по расчётам FORM без AI." />
        <Button title="Сохранить и проверить" size="sm" variant="secondary" loading={ping === 'busy'} onPress={testServer} />
        {ping === 'ok' ? <Banner tone="accent" icon="checkmark-circle" text="Сервер отвечает — AI Coach подключён." /> : null}
        {ping === 'fail' ? <Banner tone="warning" icon="alert-circle" text="Сервер не отвечает. Проверь адрес, что сервер запущен и телефон в той же сети." /> : null}
      </Card>

      <SectionTitle title={`Память тренера · ${memory.length}`} />
      <Card style={{ gap: 8 }}>
        {memory.length === 0 ? <T v="small">Тренер запоминает устойчивые факты: что ты не любишь, как реагируют суставы, когда удобно тренироваться.</T> : null}
        {memory.map((m) => (
          <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Icon name={m.category === 'food' ? 'restaurant-outline' : m.category === 'injury' ? 'medkit-outline' : m.category === 'training' ? 'barbell-outline' : 'bookmark-outline'} size={16} color={colors.textDim} />
            <T v="body" style={{ flex: 1, fontSize: 14 }}>
              {m.text}
            </T>
            <Pressable hitSlop={10} accessibilityLabel="Удалить факт" onPress={() => useCoach.getState().removeMemory(m.id)}>
              <Icon name="close" size={16} color={colors.muted} />
            </Pressable>
          </View>
        ))}
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <Field style={{ flex: 1 }} placeholder="Добавить факт: «Не ем рыбу»" value={fact} onChangeText={setFact} onSubmitEditing={() => { if (fact.trim()) { useCoach.getState().addMemory(fact, 'preference', 'user'); setFact(''); } }} />
          <Button title="Добавить" size="sm" disabled={!fact.trim()} onPress={() => { useCoach.getState().addMemory(fact, 'preference', 'user'); setFact(''); }} style={{ height: 50 }} />
        </View>
      </Card>

      <SectionTitle title="Данные на устройстве" />
      <Card style={{ gap: 10 }}>
        <T v="small">Все данные хранятся локально на iPhone. В AI уходит только сводка, нужная для ответа.</T>
        <T v="small" color={settings.lastBackupAt ? colors.textDim : colors.warning}>
          {settings.lastBackupAt ? `Последняя копия: ${relativeDay(toISODate(new Date(settings.lastBackupAt))).toLowerCase()}` : 'Резервной копии ещё нет — при потере телефона история пропадёт.'}
        </T>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Сохранить копию" icon="cloud-upload-outline" size="sm" loading={backupBusy} onPress={doExport} style={{ flex: 1 }} />
          <Button title="Восстановить" icon="cloud-download-outline" size="sm" variant="secondary" onPress={doImport} style={{ flex: 1 }} />
        </View>
        <Button
          title="Заполнить демо-историей (для проверки)"
          size="sm"
          variant="outline"
          onPress={() => confirm('Добавить демо-данные?', 'Будут добавлены ВЫМЫШЛЕННЫЕ 4 недели тренировок, веса, чек-инов и питания — чтобы посмотреть, как работает Прогресс. Реальные данные не удаляются, но смешаются с демо.', 'Добавить демо', () => { seedDemoData(); toast('Демо-данные добавлены'); })}
        />
        <Button
          title="Удалить все данные"
          size="sm"
          variant="danger"
          onPress={() =>
            confirm('Удалить все данные?', 'Профиль, план, тренировки, питание и память тренера будут удалены без возможности восстановления.', 'Удалить всё', async () => {
              await resetAllStores();
              await clearAllData();
              router.replace('/onboarding');
            }, true)
          }
        />
      </Card>
      <T v="small" style={{ textAlign: 'center', marginTop: space.lg, fontSize: 12 }}>
        FORM — фитнес-помощник и не ставит медицинских диагнозов.
      </T>

      <Sheet visible={!!section} onClose={() => setSection(null)} title={section ? TITLES[section] : ''} footer={<Button title="Сохранить и пересчитать" icon="checkmark" size="lg" onPress={save} />}>
        {draft && section === 'goal' ? <GoalPicker p={draft} set={set} /> : null}
        {draft && section === 'body' ? <BodySection p={draft} set={set} /> : null}
        {draft && section === 'training' ? <TrainingSection p={draft} set={set} /> : null}
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

const styles = StyleSheet.create({
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingVertical: 8, borderRadius: radius.sm },
});
