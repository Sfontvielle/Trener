import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { UserProfile } from '@/types';
import { colors, space, themed } from '@/theme';
import { Screen } from '@/components/Screen';
import { Banner, Button, Chip, Icon, T } from '@/components/ui';
import { AppHeader, Group, ListRow, SectionHeader } from '@/components/ds';
import { Field, Toggle } from '@/components/inputs';
import { Sheet } from '@/components/Sheet';
import { confirm, toast } from '@/components/Dialog';
import { resetAllStores } from '@/stores/hydration';
import { clearAllData } from '@/storage/persist';
import { useProfile } from '@/stores/profile';
import { useHealth } from '@/stores/health';
import { applyProfile } from '@/features/profile/applyProfile';
import { BodySection, FoodSection, GoalPicker, HealthSection, LifestyleSection, TrainingSection } from '@/features/profile/forms';
import { hasHealthInfo, healthOf, healthTraining } from '@/features/profile/health';
import { GOAL_LABEL } from '@/features/nutrition/targets';
import { LEVEL_LABEL } from '@/features/training/planGenerator';
import { ensurePermission } from '@/services/notifications';
import { relativeDay, toISODate } from '@/utils/date';
import { fmtValue } from '@/utils/format';
import { getPrefs } from '@/features/training/engine/prefs';
import { SPLIT_PREF_LABEL } from '@/features/training/engine/split';
import { GymSheet } from '@/features/training/GymSheet';
import { BRAND } from '@/config/brand';
import { useAccount } from '@/stores/account';
import { AccountSheet, accountSummary } from '@/features/account/AccountSheet';
import { LOCATION_LABEL } from '@/features/profile/questionnaire';
import { Image } from 'expo-image';
import { pickAvatar, removeAvatar } from '@/services/avatar';

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
  const updateSettings = useProfile((s) => s.updateSettings);
  const healthOn = useHealth((s) => s.enabled);
  const healthSync = useHealth((s) => s.lastSyncAt);
  const healthSummary = healthOn ? `Подключено${healthSync ? ` · ${new Date(healthSync).toTimeString().slice(0, 5)}` : ''}` : 'Не подключено · сон, шаги, HRV, пульс';
  const [section, setSection] = useState<Section>(null);
  const [gymOpen, setGymOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const apple = useAccount((s) => s.apple);
  const [draft, setDraft] = useState<UserProfile | null>(null);
  const [notifDenied, setNotifDenied] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
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

  const toggleReminder = async (key: 'morningReminder' | 'trainingReminder' | 'restNotify' | 'weeklyReview' | 'weighInReminder', v: boolean) => {
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

  const gymLine = settings.gym ? `Гриф ${settings.gym.barKg} кг · гантели шаг ${String(settings.gym.dumbbellStep).replace('.', ',')} · тренажёры ${String(settings.gym.machineStep).replace('.', ',')}` : 'Стандартный зал — диски и шаги';
  const lifeLine = `${fmtValue(profile.stepsPerDay)} шагов · ${profile.workStyle === 'desk' ? 'сидячая' : profile.workStyle === 'mixed' ? 'смешанная' : 'физическая'} работа${profile.sleepHours ? ` · сон ~${String(profile.sleepHours).replace('.', ',')} ч` : ''}`;
  const notifLine = [settings.morningReminder && 'чек-ин', settings.weighInReminder !== false && 'взвешивание', settings.trainingReminder && 'тренировка', settings.weeklyReview && 'отчёт недели'].filter(Boolean).join(', ') || 'Выключены';
  const themeLine = settings.theme === 'light' ? 'Светлая' : settings.theme === 'system' ? 'Как в системе' : 'Тёмная';

  return (
    <Screen keyboard tabBar>
      <AppHeader title="Профиль" />
      {/* Кто ты: фото (своё или инициалы), имя, цель и уровень */}
      <View style={styles.who}>
        <Pressable accessibilityRole="button" accessibilityLabel={settings.avatarUri ? 'Фото профиля: изменить' : 'Добавить фото профиля'} onPress={() => setAvatarOpen(true)} style={styles.avatar} testID="profile-avatar">
          {settings.avatarUri ? (
            <Image source={{ uri: settings.avatarUri }} style={{ width: '100%', height: '100%', borderRadius: 32 }} contentFit="cover" accessibilityIgnoresInvertColors />
          ) : (
            <T v="title2" color={colors.text}>
              {profile.name.charAt(0).toUpperCase()}
            </T>
          )}
          <View style={styles.avatarBadge}>
            <Icon name="camera" size={12} color={colors.text} />
          </View>
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <T v="title2" numberOfLines={1}>
            {profile.name}
          </T>
          <T v="callout" color={colors.textDim}>
            {GOAL_LABEL[profile.goal]} · {LEVEL_LABEL[profile.level]}
          </T>
        </View>
      </View>

      <SectionHeader title="Личные данные" />
      <Group>
        <ListRow icon="person-outline" title="Параметры тела" subtitle={`${profile.sex === 'male' ? 'Мужчина' : 'Женщина'} · ${profile.age} лет · ${profile.heightCm} см · ${profile.weightKg} кг`} onPress={() => open('body')} />
      </Group>

      <SectionHeader title="Цели и тренировки" />
      <Group>
        <ListRow icon="flag-outline" title="Цель" value={GOAL_LABEL[profile.goal]} accessibilityLabel="Цель" hint={GOAL_LABEL[profile.goal]} onPress={() => open('goal')} />
        <ListRow icon="barbell-outline" title="Тренировки" subtitle={`${profile.daysPerWeek}×/нед · ${profile.sessionMinutes} мин · ${LOCATION_LABEL[profile.location] ?? 'зал'}`} accessibilityLabel="Тренировки" hint={`${profile.daysPerWeek} раза в неделю, ${profile.sessionMinutes} минут`} onPress={() => open('training')} />
        <ListRow icon="options-outline" title="Предпочтения и ограничения" subtitle={prefsSummary(profile)} onPress={() => router.push('/training-prefs')} />
        <ListRow icon="disc-outline" title="Оборудование зала" subtitle={gymLine} onPress={() => setGymOpen(true)} />
        <ListRow icon="document-text-outline" title="Мой план и расчёты" subtitle="Программа, КБЖУ и как они посчитаны" onPress={() => router.push('/plan')} />
      </Group>

      <SectionHeader title="Питание" />
      <Group>
        <ListRow icon="restaurant-outline" title="Питание и предпочтения" subtitle={profile.likedFoods.length ? `Любит: ${profile.likedFoods.slice(0, 3).join(', ')}` : 'Предпочтения не заданы'} onPress={() => open('food')} />
      </Group>

      <SectionHeader title="Здоровье" />
      <Group>
        <ListRow icon="medkit-outline" title="Здоровье и особенности" subtitle={healthLine(profile)} onPress={() => open('health')} />
        <ListRow icon="moon-outline" title="Сон и активность" subtitle={lifeLine} onPress={() => open('life')} />
        <ListRow icon="pulse-outline" title="Восстановление" subtitle="Чек-ин: сон и самочувствие" onPress={() => router.push('/checkin')} />
        <ListRow icon="heart-outline" title="Apple Health" subtitle={healthSummary} onPress={() => router.push('/health')} />
      </Group>

      <SectionHeader title="Оформление" />
      <Group>
        <ListRow icon="color-palette-outline" title="Темы и акцентные цвета" value={themeLine} onPress={() => router.push('/appearance')} />
        <ListRow
          icon="scale-outline"
          title="Единицы веса"
          right={
            <View style={{ flexDirection: 'row', gap: space.xs }}>
              <Chip label="кг" active={settings.weightUnit === 'kg'} onPress={() => updateSettings({ weightUnit: 'kg' })} />
              <Chip label="lb" active={settings.weightUnit === 'lb'} onPress={() => updateSettings({ weightUnit: 'lb' })} />
            </View>
          }
        />
        <View style={styles.inset}>
          <Toggle value={settings.haptics} onChange={(v) => updateSettings({ haptics: v })} label="Тактильный отклик" sub="Подходы, рекорды (на iPhone)" />
        </View>
      </Group>

      <SectionHeader title="Уведомления" />
      <Group>
        <ListRow icon="notifications-outline" title="Напоминания" subtitle={notifLine} onPress={() => setNotifOpen(true)} />
      </Group>

      <SectionHeader title="Apple ID, данные и резервные копии" />
      <Group>
        <ListRow icon="logo-apple" title="Аккаунт" subtitle={accountSummary(apple)} onPress={() => setAccountOpen(true)} />
        <ListRow icon="cloud-upload-outline" title="Данные и резервные копии" subtitle={settings.lastBackupAt ? `Всё на устройстве · копия ${relativeDay(toISODate(new Date(settings.lastBackupAt))).toLowerCase()}` : 'Всё хранится на устройстве · экспорт и перенос'} onPress={() => router.push('/data')} />
      </Group>

      <Group style={{ marginTop: space.xl }}>
        <ListRow
          icon="trash-outline"
          title="Удалить все данные"
          tone="danger"
          chevron={false}
          onPress={() =>
            confirm('Удалить все данные?', 'Профиль, план, тренировки, питание, замеры и память тренера будут удалены с устройства без возможности восстановления (кроме ранее экспортированного файла).', 'Удалить всё', async () => {
              await resetAllStores();
              await clearAllData();
              router.replace('/welcome');
            }, true)
          }
        />
      </Group>

      <T v="footnote" style={{ textAlign: 'center', marginTop: space.lg }}>
        {BRAND} — фитнес-помощник и не ставит медицинских диагнозов.
      </T>

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
          <Toggle value={settings.weighInReminder !== false} onChange={(v) => toggleReminder('weighInReminder', v)} label="Взвешивание раз в неделю" sub="По понедельникам утром: по весу недели подстраиваются калории и КБЖУ" />
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
          <T v="footnote">Фото хранится только на этом iPhone.</T>
        </View>
      </Sheet>

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

const styles = themed({
  who: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.md, marginBottom: space.xs },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  avatarBadge: { position: 'absolute', right: -2, bottom: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.bg },
  times: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, paddingBottom: space.xs },
  inset: { paddingHorizontal: space.md },
});
