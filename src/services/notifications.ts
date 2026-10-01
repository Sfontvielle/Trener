import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { AppSettings, WorkoutPlan } from '@/types';

/**
 * Локальные уведомления (без сервера): конец отдыха в фоне, утренний чек-ин, тренировка по плану.
 * Работают в Expo Go на iPhone. В web-превью — no-op.
 */
const native = Platform.OS === 'ios' || Platform.OS === 'android';
const REST_ID = 'form-rest';
const MORNING_ID = 'form-morning';
const TRAIN_PREFIX = 'form-train-';

let configured = false;
export function configureNotifications() {
  if (!native || configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
}

export async function ensurePermission(): Promise<boolean> {
  if (!native) return false;
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) return false;
    const res = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    return res.granted;
  } catch {
    return false;
  }
}

async function cancel(id: string) {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    /* не было запланировано */
  }
}

/** Уведомление об окончании отдыха (приходит, только если приложение свёрнуто — иначе срабатывает экранный таймер) */
export async function scheduleRestEnd(seconds: number, label: string) {
  if (!native) return;
  await cancel(REST_ID);
  if (seconds < 5) return;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.scheduleNotificationAsync({
      identifier: REST_ID,
      content: { title: 'Отдых закончен', body: `Следующий подход: ${label}`, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.round(seconds) },
    });
  } catch {
    /* уведомления недоступны — таймер на экране всё равно работает */
  }
}

export async function cancelRestEnd() {
  if (native) await cancel(REST_ID);
}

/** 0 = Пн … 6 = Вс (FORM) → 1 = Вс … 7 = Сб (iOS/expo) */
export function toExpoWeekday(i: number): number {
  return ((i + 1) % 7) + 1;
}

/** Пересоздаёт расписание напоминаний под текущие настройки и план */
export async function syncReminders(settings: AppSettings, plan: WorkoutPlan | null): Promise<void> {
  if (!native) return;
  await cancel(MORNING_ID);
  for (let i = 0; i < 7; i++) await cancel(`${TRAIN_PREFIX}${i}`);
  if (!settings.morningReminder && !settings.trainingReminder) return;
  const perm = await Notifications.getPermissionsAsync().catch(() => null);
  if (!perm?.granted) return;
  try {
    if (settings.morningReminder) {
      await Notifications.scheduleNotificationAsync({
        identifier: MORNING_ID,
        content: { title: 'Доброе утро 👋', body: 'Чек-ин за 30 секунд и взвешивание — FORM подстроит тренировку под твоё состояние.' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: settings.morningTime.hour, minute: settings.morningTime.minute },
      });
    }
    if (settings.trainingReminder && plan) {
      for (let i = 0; i < 7; i++) {
        const t = plan.templates.find((x) => x.id === plan.schedule[i]);
        if (!t) continue;
        await Notifications.scheduleNotificationAsync({
          identifier: `${TRAIN_PREFIX}${i}`,
          content: { title: 'Сегодня тренировка', body: `По плану: ${t.name} · ${t.focus}. Открой FORM — веса уже подобраны.` },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: toExpoWeekday(i), hour: settings.trainingTime.hour, minute: settings.trainingTime.minute },
        });
      }
    }
  } catch {
    /* не критично */
  }
}
