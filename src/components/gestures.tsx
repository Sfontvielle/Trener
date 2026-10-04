import React from 'react';
import { Platform, TurboModuleRegistry, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Безопасная обёртка над react-native-gesture-handler.
 *
 * Почему: жесты шторок нативные, но если в установленной сборке нет нативного модуля (старая dev-сборка)
 * или что-то пошло не так при подключении жеста — экран не должен падать с «Error».
 *  • модуль загружается только если нативная часть есть (на iPhone — проверка через TurboModuleRegistry);
 *  • GestureDetector обёрнут в границу ошибок: при сбое жест отключается, а содержимое работает как обычно
 *    (шторку можно закрыть крестиком или тапом по фону); причина пишется в журнал.
 * Все жесты в приложении создаются с runOnJS(true): обработчики выполняются в JS и не требуют Reanimated.
 */
type RNGH = typeof import('react-native-gesture-handler');

function loadGestureHandler(): RNGH | null {
  try {
    if (Platform.OS !== 'web' && !TurboModuleRegistry.get('RNGestureHandlerModule')) {
      console.warn('[RYNJI] react-native-gesture-handler: нативного модуля нет в этой сборке — свайпы шторок отключены');
      return null;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-gesture-handler') as RNGH;
  } catch (e) {
    console.warn('[RYNJI] react-native-gesture-handler не загрузился — свайпы шторок отключены', e);
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
