// Глобальный флаг сборки React Native для запусков в Node (замеры, тесты вне Metro)
(globalThis as { __DEV__?: boolean }).__DEV__ = false;
export {};
