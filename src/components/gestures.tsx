import React from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Обёртка над react-native-gesture-handler.
 *  • iPhone/Android: gesture-handler не используется (несовпадение версий JS и нативной части в Expo Go роняло
 *    шторки), Sheet и SideDrawer работают на PanResponder;
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

/**
 * На iPhone gesture-handler НЕ используется: в Expo Go и старых dev-сборках нативная часть бывает другой версии,
 * чем JS (модуль есть, а метода нет → «undefined is not a function» в микрозадаче, которую не ловит граница ошибок,
 * и ошибка сыплется на каждый рендер). Шторки на телефоне работают на PanResponder — чистый JS, любая сборка.
 * gesture-handler остаётся только в веб-версии (там его реализация целиком на JS).
 */
function loadGestureHandler(): RNGH | null {
  if (Platform.OS !== 'web' || forcedOff()) return null;
  try {
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
    return <GH.GestureDetector gesture={gesture as Parameters<RNGH['GestureDetector']>[0]['gesture']}>{children}</GH.GestureDetector>;
  }
}
