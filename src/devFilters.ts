import { LogBox, Platform } from 'react-native';

/**
 * Только web-превью в dev-режиме: react-navigation/react-native-screens внутри expo-router передают
 * в DOM нативные пропсы (collapsable, accessible, onResponder*), React DOM ругается в консоль,
 * а dev-оверлей перекрывает таб-бар. На iPhone этих предупреждений нет. Фильтр точечный.
 */
if (Platform.OS === 'web' && typeof __DEV__ !== 'undefined' && __DEV__) {
  const NOISE = [/non-boolean attribute/, /Unknown event handler property/, /"shadow\*" style props are deprecated/];
  LogBox.ignoreLogs(['for a non-boolean attribute', 'Unknown event handler property', '"shadow*" style props are deprecated']);
  for (const level of ['error', 'warn'] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      if (typeof args[0] === 'string' && NOISE.some((r) => r.test(args[0] as string))) return;
      orig(...args);
    };
  }
}
