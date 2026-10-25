import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { UserProfile } from '@/types';
import { colors, radius, space, themed } from '@/theme';
import { Screen } from '@/components/Screen';
import { Banner, Button, Card, Chip, Divider, Icon, SectionTitle, T } from '@/components/ui';
import { Appear } from '@/components/motion';
import { Field, Toggle } from '@/components/inputs';
import { Sheet } from '@/components/Sheet';
import { confirm, toast } from '@/components/Dialog';
import { resetAllStores } from '@/stores/hydration';
import { clearAllData } from '@/storage/persist';
import { useProfile } from '@/stores/profile';
import { useLabs } from '@/stores/labs';
import { useEnhanced } from '@/stores/enhanced';
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
import { useAccount } from '@/stores/account';
import { AccountSheet, accountSummary } from '@/features/account/AccountSheet';
import { LOCATION_LABEL } from '@/features/profile/questionnaire';
import { Image } from 'expo-image';
import { pickAvatar, removeAvatar } from '@/services/avatar';
import type { IconName } from '@/components/ui';

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
const TITLES: Record<Exclude<Section, null>, string> = { goal: 'Цель', body: 'Параметры тела', training: 'Тренировки', health: 'Здоровье и особенности', life: 'Образ жизни и сон', food: 'Питание и предпочтения' };

export default function Profile() {
  const profile = useProfile((s) => s.profile);
  const settings = useProfile((s) => s.settings);
  const labCount = useLabs((x) => x.reports.length);
  const enhancedOn = useEnhanced((x) => x.enabled);
  const updateSettings = useProfile((s) => s.updateSettings);
  const memory = useCoach((s) => s.memory);
  const healthOn = useHealth((s) => s.enabled);
  const healthSync = useHealth((s) => s.lastSyncAt);
  const healthSummary = healthOn ? `Подключено${healthSync ? ` · ${new Date(healthSync).toTimeString().slice(0, 5)}` : ''}` : 'Не подключено · сон, шаги, HRV, пульс';
  const [section, setSection] = useState<Section>(null);
  const [gymOpen, setGymOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const apple = useAccount((s) => s.apple);
  const [draft, setDraft] = useState<UserProfile | null>(null);
  const [fact, setFact] = useState('');
  const [editMem, setEditMem] = useState<{ id: string; text: string } | null>(null);
  const [notifDenied, setNotifDenied] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [coachOpen, setCoachOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  // Переход с главной («Дополни профиль»): сразу открыть нужный раздел. Профиль — вкладка и не размонтируется,
  // поэтому помним последний обработанный раздел, а не «уже открывали»
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const handled = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!profile || !edit || !(edit in TITLES) || handled.current === edit) return;
    handled.current = edit;
    const t = setTimeout(() => {
      setDraft({ ...profile });
      setSection(edit as Exclude<Section, null>);
      router.setParams({ edit: undefined });
      handled.current = undefined;
    }, 300);
    return () => clearTimeout(t);
  }, [edit, profile]);

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
    // Раздел заполнен — больше не предлагать его на главной
    const done = section === 'training' ? 'equipment' : section;
    const pend = useProfile.getState().settings.setupPending;
    if (pend?.length) updateSettings({ setupPending: pend.filter((x) => x !== done) });
    setSection(null);
    toast(r.planRebuilt ? 'План тренировок и питание пересчитаны' : r.targetChanged ? 'КБЖУ пересчитаны' : 'Сохранено');
  };
  const set = (patch: Partial<UserProfile>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  return (
    <Screen keyboard tabBar>
      <T v="h1" style={{ marginBottom: space.sm }}>
        Профиль
      </T>
      {/* Кто ты: фото (своё или инициалы), имя и цель; дальше — категории (значения — внутри разделов) */}
      <Appear i={0} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: space.sm }}>
        <Pressable accessibilityRole="button" accessibilityLabel={settings.avatarUri ? 'Фото профиля: изменить' : 'Добавить фото профиля'} onPress={() => setAvatarOpen(true)} style={styles.avatar} testID="profile-avatar">
          {settings.avatarUri ? (
            <Image source={{ uri: settings.avatarUri }} style={{ width: '100%', height: '100%', borderRadius: 38 }} contentFit="cover" accessibilityIgnoresInvertColors />
          ) : (
            <T v="h1" color={colors.text}>
              {profile.name.charAt(0).toUpperCase()}
            </T>
          )}
          <View style={styles.avatarBadge}>
            <Icon name="camera" size={13} color={colors.onAccent} />
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <T v="h1" numberOfLines={1}>
            {profile.name}
          </T>
          <T v="bodyDim">
            {GOAL_LABEL[profile.goal]} · {LEVEL_LABEL[profile.level]}
          </T>
        </View>
      </Appear>

      <SectionTitle title="Личные данные" />
      <Card style={{ paddingVertical: 4 }}>
        <Row icon="person-outline" label="Имя, пол, возраст, рост, вес" value={`${profile.sex === 'male' ? 'М' : 'Ж'} · ${profile.age} лет · ${profile.heightCm} см · ${profile.weightKg} кг`} onPress={() => open('body')} />
      </Card>

      <SectionTitle title="Цели и тренировки" />
      <Card style={{ paddingVertical: 4 }}>
        <Row icon="flag-outline" label="Цель" value={GOAL_LABEL[profile.goal]} onPress={() => open('goal')} />
        <Divider />
        <Row icon="barbell-outline" label="Тренировки" value={`${profile.daysPerWeek}×/нед · ${profile.sessionMinutes} мин · ${LOCATION_LABEL[profile.location] ?? 'зал'}`} onPress={() => open('training')} />
        <Divider />
        <Row icon="options-outline" label="Предпочтения и ограничения" value={prefsSummary(profile)} onPress={() => router.push('/training-prefs')} />
        <Divider />
        <Row icon="disc-outline" label="Оборудование зала" value={settings.gym ? `Гриф ${settings.gym.barKg} кг · гантели шаг ${String(settings.gym.dumbbellStep).replace('.', ',')} · тренажёры ${String(settings.gym.machineStep).replace('.', ',')}` : 'Стандартный зал — настроить диски и шаги'} onPress={() => setGymOpen(true)} />
        <Divider />
        <Row icon="document-text-outline" label="Мой план и расчёты" value="Программа, КБЖУ и как они посчитаны" onPress={() => router.push('/plan')} />
      </Card>

      <SectionTitle title="Питание" />
      <Card style={{ paddingVertical: 4 }}>
        <Row icon="restaurant-outline" label="Питание и предпочтения" value={profile.likedFoods.length ? `Любит: ${profile.likedFoods.slice(0, 3).join(', ')}` : 'Предпочтения не заданы'} onPress={() => open('food')} />
      </Card>

      <SectionTitle title="Здоровье" />
      <Card style={{ paddingVertical: 4 }}>
        <Row icon="medkit-outline" label="Здоровье и особенности" value={healthLine(profile)} onPress={() => open('health')} />
        <Divider />
        <Row icon="moon-outline" label="Сон и активность" value={`${profile.stepsPerDay} шагов · ${profile.workStyle === 'desk' ? 'сидячая' : profile.workStyle === 'mixed' ? 'смешанная' : 'физическая'} работа${profile.sleepHours ? ` · сон ~${String(profile.sleepHours).replace('.', ',')} ч` : ''}`} onPress={() => open('life')} />
        <Divider />
        <Row icon="pulse-outline" label="Восстановление" value="Чек-ин: сон и самочувствие" onPress={() => router.push('/checkin')} />
        <Divider />
        <Row icon="flask-outline" label="Анализы" value={labCount ? `${labCount} ${labCount === 1 ? 'анализ' : 'анализа(ов)'} · история и изменения` : 'PDF, фото или текст — любые лаборатории'} onPress={() => router.push('/labs')} />
        <Divider />
        <Row icon="heart-circle-outline" label="Давление, пульс, мониторинг" value={enhancedOn ? 'Режим Enhanced включён · мониторинг' : 'Мониторинг здоровья и сигналы'} onPress={() => router.push('/health-monitor')} />
        <Divider />
        <Row icon="heart-outline" label="Apple Health" value={healthSummary} onPress={() => router.push('/health')} />
      </Card>

      <SectionTitle title={`${BRAND} Coach`} />
      <Card style={{ paddingVertical: 4 }}>
        <Row icon="sparkles-outline" label="Настройки Coach и память" value={`Что ${BRAND} знает обо мне · ${memory.length}`} onPress={() => setCoachOpen(true)} />
      </Card>

      <SectionTitle title="Оформление и уведомления" />
      <Card style={{ paddingVertical: 4 }}>
        <Row icon="color-palette-outline" label="Темы и акцентные цвета" value={`${settings.theme === 'light' ? 'Светлая' : settings.theme === 'system' ? 'Системная' : 'Тёмная'} тема`} onPress={() => router.push('/appearance')} />
        <Divider />
        <Row icon="notifications-outline" label="Уведомления" value={[settings.morningReminder && 'чек-ин', settings.trainingReminder && 'тренировка', settings.weeklyReview && 'отчёт недели'].filter(Boolean).join(', ') || 'выключены'} onPress={() => setNotifOpen(true)} />
        <Divider />
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52 }}>
          <T v="body" style={{ flex: 1, fontWeight: '600' }}>
            Единицы веса
          </T>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Chip label="кг" active={settings.weightUnit === 'kg'} onPress={() => updateSettings({ weightUnit: 'kg' })} />
            <Chip label="lb" active={settings.weightUnit === 'lb'} onPress={() => updateSettings({ weightUnit: 'lb' })} />
          </View>
        </View>
        <Toggle value={settings.haptics} onChange={(v) => updateSettings({ haptics: v })} label="Тактильный отклик" sub="Подходы, рекорды (на iPhone)" />
      </Card>

      <SectionTitle title="Apple ID, данные и резервные копии" />
      <Card style={{ paddingVertical: 4, marginBottom: space.md }}>
        <Row icon="logo-apple" label="Аккаунт" value={accountSummary(apple)} onPress={() => setAccountOpen(true)} />
        <Divider />
        <Row icon="cloud-upload-outline" label="Данные и резервные копии" value={settings.lastBackupAt ? `Всё на устройстве · копия ${relativeDay(toISODate(new Date(settings.lastBackupAt))).toLowerCase()}` : 'Всё хранится на устройстве · экспорт и перенос'} onPress={() => router.push('/data')} />
      </Card>

      <Sheet visible={notifOpen} onClose={() => setNotifOpen(false)} title="Уведомления">
        <View style={{ gap: 6 }}>
          {Platform.OS === 'web' ? <Banner text="Уведомления работают на iPhone (в web-превью недоступны)." /> : null}
          {notifDenied ? <Banner tone="warning" icon="notifications-off-outline" text={`Уведомления запрещены. Разреши их в Настройках iPhone → ${BRAND}.`} /> : null}
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
        </View>
      </Sheet>

      {/* Настройки Coach: память — устойчивые факты, которые тренер учитывает; редактировать и удалять может только человек */}
      <Sheet visible={coachOpen} onClose={() => setCoachOpen(false)} title={`${BRAND} Coach`} subtitle={`Что ${BRAND} знает обо мне · ${memory.length}`}>
        <View style={{ gap: 8 }} testID="coach-memory">
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
        </View>
      </Sheet>

      <Sheet visible={avatarOpen} onClose={() => setAvatarOpen(false)} title="Фото профиля">
        <View style={{ gap: 10 }}>
          <Button
            title={settings.avatarUri ? 'Выбрать другое фото' : 'Выбрать фото'}
            icon="images-outline"
            size="lg"
            onPress={async () => {
              try {
                const uri = await pickAvatar(settings.avatarUri);
                if (uri) updateSettings({ avatarUri: uri });
                setAvatarOpen(false);
              } catch (e) {
                toast((e as Error).message, 'alert-circle');
              }
            }}
          />
          {settings.avatarUri ? (
            <Button
              title="Убрать фото — показывать инициалы"
              variant="ghost"
              onPress={() => {
                removeAvatar(settings.avatarUri);
                updateSettings({ avatarUri: undefined });
                setAvatarOpen(false);
              }}
            />
          ) : null}
          <T v="small">Фото хранится только на этом iPhone.</T>
        </View>
      </Sheet>

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
            router.replace('/welcome');
          }, true)
        }
      />

      <T v="small" style={{ textAlign: 'center', marginTop: space.lg, fontSize: 12 }}>
        {BRAND} — фитнес-помощник и не ставит медицинских диагнозов.
      </T>

      <GymSheet visible={gymOpen} onClose={() => setGymOpen(false)} />
      <AccountSheet visible={accountOpen} onClose={() => setAccountOpen(false)} />
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

/** Строка раздела в стиле iOS: название; текущее значение — в VoiceOver и внутри раздела, на экране не шумит */
function Row({ label, value, onPress, icon }: { label: string; value: string; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={value} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      {icon ? <Icon name={icon} size={19} color={colors.accent} /> : null}
      <T v="body" style={{ flex: 1, fontWeight: '600' }}>
        {label}
      </T>
      <Icon name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = themed({
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center', overflow: 'visible', borderWidth: 2, borderColor: colors.accentLine },
  avatarBadge: { position: 'absolute', right: -2, bottom: -2, width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 8, borderRadius: radius.sm },
});
