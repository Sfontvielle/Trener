import { useEffect, useRef, useState } from 'react';
import { beginModalClose, DISMISS_EVENT, whenModalIdle } from './modalGate';

/**
 * Жизненный цикл нативного Modal с очередью (modalGate): открытие ждёт, пока предыдущее окно полностью закроется;
 * закрытие: анимация → Modal visible=false → onDismiss (iOS) → размонтирование.
 * Возвращает mounted (рендерить Modal), shown (его visible) и onDismiss для Modal.
 */
export function useModalPresence(visible: boolean, animateIn: () => void, animateOut: (done: () => void) => void) {
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const r = useRef<{ visible: boolean; finish: (() => void) | null; open: boolean }>({ visible, finish: null, open: false });

  useEffect(() => {
    r.current.visible = visible;
    if (visible) {
      if (r.current.open) {
        animateIn();
        return;
      }
      return whenModalIdle(() => {
        if (!r.current.visible) return;
        r.current.open = true;
        setMounted(true);
        setShown(true);
      });
    }
    if (r.current.open) {
      r.current.open = false;
      const finish = beginModalClose();
      r.current.finish = finish;
      animateOut(() => {
        if (r.current.visible) {
          // Открыли снова, пока закрывалось
          finish();
          r.current.open = true;
          animateIn();
          return;
        }
        setShown(false);
        if (!DISMISS_EVENT) {
          setMounted(false);
          finish();
        }
      });
    }
    // animateIn/animateOut стабильны (используют Animated.Value из useState)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (mounted && shown && r.current.visible) animateIn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, shown]);

  const onDismiss = () => {
    if (r.current.visible) return;
    setMounted(false);
    r.current.finish?.();
    r.current.finish = null;
  };
  return { mounted, shown, onDismiss };
}
