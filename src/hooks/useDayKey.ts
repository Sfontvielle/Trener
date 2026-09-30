import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { today } from '@/utils/date';

/** Текущая дата, которая обновляется после полуночи и при возврате приложения из фона */
export function useDayKey(): string {
  const [d, setD] = useState(today());
  useEffect(() => {
    const tick = () => setD((prev) => (prev === today() ? prev : today()));
    const id = setInterval(tick, 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && tick());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, []);
  return d;
}
