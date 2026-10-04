// Заглушка для node-тестов: окружение «bare», HealthKit в тестах всё равно недоступен (Platform.OS !== 'ios')
export enum ExecutionEnvironment {
  Bare = 'bare',
  Standalone = 'standalone',
  StoreClient = 'storeClient',
}
const Constants = { executionEnvironment: ExecutionEnvironment.Bare };
export default Constants;
