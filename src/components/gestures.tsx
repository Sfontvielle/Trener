import React from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Обёртка над react-native-gesture-handler.
 *  • iPhone/Android: gesture-handler — если нативная часть той же версии, что и JS (проверка методов модуля при
 *    запуске). Тогда шторки тянутся за любое место, плавно, и правильно делят жест с прокруткой (как системные).
 *    Нативная часть другой версии (старая сборка) — запасной режим на PanResponder, приложение не падает;
 *  • веб: gesture-handler (JS-реализация), GestureDetector обёрнут в границу ошибок.
 * Все жесты создаются с runOnJS(true): обработчики в JS, Reanimated не нужен.
 */
type RNGH = typeof import('react-native-gesture-handler');

function forcedOff(): boolean {
  // Только для проверки запасного режима в веб-тестах
  try {
    return Platform.OS === 'web' && typeof localStorage !== 'undefined' && localStorage.getItem('rynji.noGH') === '1';
  } catch {
    return false;
  }
}

/** Методы нативного модуля, которые вызывает JS gesture-handler 3.x: нет хотя бы одного — версии не совпадают */
const NATIVE_METHODS = ['createGestureHandler', 'attachGestureHandler', 'setGestureHandlerConfig', 'updateGestureHandlerConfig', 'configureRelations', 'dropGestureHandler', 'flushOperations'] as const;

/**
 * Раньше в Expo Go и старых dev-сборках нативная часть бывала другой версии, чем JS (модуль есть, а метода нет →
 * «undefined is not a function» в микрозадаче, которую не ловит граница ошибок). Поэтому до загрузки JS-части
 * проверяем нативный модуль: все методы на месте — включаем gesture-handler, иначе — PanResponder.
 */
export function nativeGestureModuleOk(mod: unknown): boolean {
  if (!mod || (typeof mod !== 'object' && typeof mod !== 'function')) return false;
  return NATIVE_METHODS.every((k) => typeof (mod as Record<string, unknown>)[k] === 'function');
}

function loadGestureHandler(): RNGH | null {
  if (forcedOff()) return null;
  try {
    if (Platform.OS !== 'web') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { TurboModuleRegistry } = require('react-native') as typeof import('react-native');
      if (!nativeGestureModuleOk(TurboModuleRegistry.get('RNGestureHandlerModule'))) {
        console.warn('[RYNJI] нативный gesture-handler другой версии — шторки на PanResponder');
        return null;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-gesture-handler') as RNGH;
  } catch (e) {
    console.warn('[RYNJI] react-native-gesture-handler не загрузился — шторки на PanResponder', e);
    return null;
  }
}

export const GH = loadGestureHandler();

export function GestureRoot({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  if (!GH) return <View style={style ?? { flex: 1 }}>{children}</View>;
  return <GH.GestureHandlerRootView style={style ?? { flex: 1 }}>{children}</GH.GestureHandlerRootView>;
}

type DetectorProps = { gesture: unknown; children: React.ReactElement };

/** GestureDetector, который при любой ошибке отключает жест, но не роняет экран */
export class SafeDetector extends React.Component<DetectorProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('[RYNJI] жест отключён из-за ошибки:', error instanceof Error ? error.message : error);
  }

  render() {
    const { gesture, children } = this.props;
    if (!GH || !gesture || this.state.failed) return children;
    // gesture-handler 3: пропсы детектора — объединение старого и нового API; жест передаём как есть
    const props = { gesture, children } as unknown as React.ComponentProps<RNGH['GestureDetector']>;
    return <GH.GestureDetector {...props} />;
  }
}
