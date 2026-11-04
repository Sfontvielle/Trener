// Заглушка для запусков в Node (замеры, тесты): уведомлений нет, все вызовы — пустые
export const SchedulableTriggerInputTypes = { DAILY: 'daily', WEEKLY: 'weekly', DATE: 'date', TIME_INTERVAL: 'timeInterval' } as const;
export const setNotificationHandler = () => {};
export const addNotificationResponseReceivedListener = () => ({ remove: () => {} });
export const getPermissionsAsync = async () => ({ status: 'denied', granted: false });
export const requestPermissionsAsync = async () => ({ status: 'denied', granted: false });
export const cancelScheduledNotificationAsync = async () => {};
export const scheduleNotificationAsync = async () => '';
