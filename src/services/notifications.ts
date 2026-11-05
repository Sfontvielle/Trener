import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { AppSettings, WorkoutPlan } from '@/types';
import { BRAND } from '@/config/brand';

/**
 * Локальные уведомления (без сервера): конец отдыха в фоне, утренний чек-ин, тренировка по плану.
 * Работают в Expo Go на iPhone. В web-превью — no-op.
 */
const native = Platform.OS === 'ios' || Platform.OS === 'android';
const REST_ID = 'form-rest';
const REST_WARN_ID = 'form-rest-warn';
const MORNING_ID = 'form-morning';
const TRAIN_PREFIX = 'form-train-';

let configured = false;
export function configureNotifications() {
  if (!native || configured) return;
  configured = true;
  Notifications.setNotificationHandler({
    // Конец отдыха при открытом приложении показывает сам экран тренировки — баннер не дублируем
    handleNotification: async (n) => {
      const rest = n.request.identifier === REST_ID;
      return { shouldPlaySound: !rest, shouldSetBadge: false, shouldShowBanner: !rest, shouldShowList: !rest };
    },
  });
}

/** Тап по уведомлению с адресом экрана (например, «Отчёт недели») — открыть этот экран */
export function onNotificationOpen(open: (url: string) => void): () => void {
  if (!native) return () => undefined;
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const url = r.notification.request.content.data?.url;
    if (typeof url === 'string') open(url);
  });
  return () => sub.remove();
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

/** Снять уведомление о конце отдыха (пропуск отдыха, следующий подход, конец тренировки) */
export async function cancelRestEnd() {
  if (native) {
    await cancel(REST_ID);
    await cancel(REST_WARN_ID);
  }
}

/**
 * Таймер отдыха (включается вручную): уведомление о конце отдыха, если приложение свёрнуто.
 * Без разрешения на уведомления — тихо ничего не делает: в приложении отсчёт виден и так.
 */
export async function scheduleRestEnd(seconds: number, nextLabel?: string) {
  if (!native) return;
  await cancelRestEnd();
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await Notifications.scheduleNotificationAsync({
      identifier: REST_ID,
      content: { title: 'Отдых окончен', body: nextLabel ? `Дальше: ${nextLabel}` : 'Время следующего подхода', sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.max(1, Math.round(seconds)) },
    });
  } catch {
    /* не критично */
  }
}

/** 0 = Пн … 6 = Вс (FORM) → 1 = Вс … 7 = Сб (iOS/expo) */
export function toExpoWeekday(i: number): number {
  return ((i + 1) % 7) + 1;
}

/** Пересоздаёт расписание напоминаний под текущие настройки и план */
const REVIEW_ID = 'weekly-review';
const WEIGH_ID = 'weekly-weigh-in';

export async function syncReminders(settings: AppSettings, plan: WorkoutPlan | null): Promise<void> {
  if (!native) return;
  await cancel(MORNING_ID);
  await cancel(REVIEW_ID);
  await cancel(WEIGH_ID);
  for (let i = 0; i < 7; i++) await cancel(`${TRAIN_PREFIX}${i}`);
  const weighIn = settings.weighInReminder !== false;
  if (!settings.morningReminder && !settings.trainingReminder && !settings.weeklyReview && !weighIn) return;
  const perm = await Notifications.getPermissionsAsync().catch(() => null);
  if (!perm?.granted) return;
  try {
    if (settings.morningReminder) {
      await Notifications.scheduleNotificationAsync({
        identifier: MORNING_ID,
        content: { title: 'Доброе утро 👋', body: `Чек-ин за 30 секунд и взвешивание — ${BRAND} подстроит тренировку под твоё состояние.` },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: settings.morningTime.hour, minute: settings.morningTime.minute },
      });
    }
    // Взвешивание раз в неделю — в понедельник утром (если утренний чек-ин включён, его время; иначе 8:10)
    if (weighIn) {
      await Notifications.scheduleNotificationAsync({
        identifier: WEIGH_ID,
        content: { title: 'Взвешивание недели', body: `Утром натощак, после туалета. По весу недели ${BRAND} подстроит калории и КБЖУ.`, data: { url: '/weight' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: toExpoWeekday(0), hour: settings.morningReminder ? settings.morningTime.hour : 8, minute: settings.morningReminder ? settings.morningTime.minute : 10 },
      });
    }
    if (settings.weeklyReview) {
      await Notifications.scheduleNotificationAsync({
        identifier: REVIEW_ID,
        content: { title: 'Отчёт недели готов', body: 'Вес, тренировки, питание, сон — и что изменить на этой неделе.', data: { url: '/weekly-review' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: toExpoWeekday(0), hour: 9, minute: 5 },
      });
    }
    if (settings.trainingReminder && plan) {
      for (let i = 0; i < 7; i++) {
        const t = plan.templates.find((x) => x.id === plan.schedule[i]);
        if (!t) continue;
        await Notifications.scheduleNotificationAsync({
          identifier: `${TRAIN_PREFIX}${i}`,
          content: { title: 'Сегодня тренировка', body: `По плану: ${t.name} · ${t.focus}. Открой ${BRAND} — веса уже подобраны.` },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: toExpoWeekday(i), hour: settings.trainingTime.hour, minute: settings.trainingTime.minute },
        });
      }
    }
  } catch {
    /* не критично */
  }
}
