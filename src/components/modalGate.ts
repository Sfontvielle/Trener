import { Platform } from 'react-native';

/**
 * Очередь нативных модальных окон (шторки, боковая панель, диалоги).
 *
 * На iPhone нельзя показать новое модальное окно, пока предыдущее ещё закрывается: iOS его не покажет,
 * а приложение перестанет реагировать на касания («зависание»). Это случалось, например, при выборе дня
 * в календаре на главной: календарь закрывался, и сразу открывалась история дня.
 *
 * Правило: окно открывается только когда все закрывающиеся окна полностью закрыты (onDismiss на iOS;
 * на других платформах — короткая пауза). Подстраховка — таймаут, чтобы очередь не застряла никогда.
 */
let closing = 0;
let waiters: (() => void)[] = [];

export function modalBusy(): boolean {
  return closing > 0;
}

/** Окно начало закрываться. Возвращает функцию «закрылось полностью» (повторный вызов безопасен) */
export function beginModalClose(): () => void {
  closing++;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    closing = Math.max(0, closing - 1);
    if (!closing) {
      const w = waiters;
      waiters = [];
      // Следующий кадр: iOS успевает убрать предыдущий контроллер
      setTimeout(() => w.forEach((f) => f()), Platform.OS === 'ios' ? 60 : 0);
    }
  };
  // Подстраховка: если onDismiss не пришёл
  setTimeout(finish, 900);
  return finish;
}

/** Выполнить, когда ни одно окно не закрывается. Возвращает отмену */
export function whenModalIdle(cb: () => void): () => void {
  if (!closing) {
    cb();
    return () => {};
  }
  waiters.push(cb);
  return () => {
    waiters = waiters.filter((f) => f !== cb);
  };
}

/** Закрытие нативного Modal завершается onDismiss только на iOS; на остальных — сразу после скрытия */
export const DISMISS_EVENT = Platform.OS === 'ios';

/**
 * Выполнить после того, как закрываемое сейчас окно полностью закроется (открыть другую шторку, перейти на экран).
 * Небольшая пауза нужна, чтобы закрытие успело начаться (оно стартует в эффекте после рендера).
 */
export function afterModalClose(fn: () => void): void {
  setTimeout(() => whenModalIdle(fn), 50);
}
