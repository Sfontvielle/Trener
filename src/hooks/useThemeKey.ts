import { useColorScheme } from 'react-native';
import { applyPalette, resolveScheme } from '@/theme';
import { useProfile } from '@/stores/profile';

/**
 * Применяет выбранную тему ДО рендера дочерних экранов (синхронно, идемпотентно) и возвращает ключ темы.
 * Корневой навигатор перемонтируется по этому ключу — так перекрашиваются и мемоизированные компоненты.
 */
export function useThemeKey(): { key: string; scheme: 'dark' | 'light' } {
  const system = useColorScheme();
  const pref = useProfile((s) => s.settings.theme);
  const accent = useProfile((s) => s.settings.accent) ?? 'lime';
  const scheme = resolveScheme(pref, system === 'light' || system === 'dark' ? system : null);
  applyPalette(scheme, accent);
  return { key: `${scheme}-${accent}`, scheme };
}
