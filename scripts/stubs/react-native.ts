/** Заглушка react-native для node-тестов чистой логики (тема, Health-сервис) */
export const Platform = {
  OS: (process.env.TEST_PLATFORM as 'ios' | 'web' | 'android') ?? 'ios',
  select<T>(o: { ios?: T; android?: T; web?: T; default?: T }): T | undefined {
    return (o as Record<string, T | undefined>)[Platform.OS] ?? o.default;
  },
};
export type TextStyle = Record<string, unknown>;
export type ViewStyle = Record<string, unknown>;
export type ImageStyle = Record<string, unknown>;
