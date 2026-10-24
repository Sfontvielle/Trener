import { useEffect, useState } from 'react';
import { toast } from '@/components/Dialog';
import { AppleCanceled, appleAvailable, signInWithApple } from '@/services/appleAuth';
import { useAccount } from '@/stores/account';
import { haptic } from '@/services/haptics';

/** Вход через Apple ID для экрана входа и Профиля: доступность (null — ещё проверяем), занятость, привязка */
export function useAppleLink() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void appleAvailable().then((ok) => alive && setAvailable(ok));
    return () => {
      alive = false;
    };
  }, []);

  /** true — привязано; false — отменено, недоступно или ошибка (об ошибке уже сказали) */
  const link = async (): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    try {
      const a = await signInWithApple();
      if (!a) {
        setAvailable(false);
        return false;
      }
      // Повторный вход тем же Apple ID не отдаёт имя и почту — оставляем сохранённые раньше
      const prev = useAccount.getState().apple;
      const same = prev?.userId === a.userId ? prev : null;
      useAccount.getState().linkApple({ ...a, email: a.email ?? same?.email, givenName: a.givenName ?? same?.givenName, familyName: a.familyName ?? same?.familyName });
      haptic.success();
      return true;
    } catch (e) {
      if (!(e instanceof AppleCanceled)) toast('Не удалось войти через Apple. Попробуй ещё раз позже.', 'alert-circle-outline');
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { available, busy, link };
}
