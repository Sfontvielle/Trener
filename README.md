# RYNJI — персональный тренер, питание и восстановление

Нативное iPhone-приложение на **React Native + Expo SDK 57 + TypeScript** (Expo Router). Local-first: все данные
пользователя хранятся на устройстве, тренер работает на телефоне без сервера и настроек.

Название приложения задаётся в одном месте — `src/config/brand.ts` (и `"name"` в `app.json` для иконки).
Технические идентификаторы (ключи хранилища `form.*`, bundle id, scheme) не зависят от бренда — смена названия
не теряет данные пользователей.

```
ПРОФИЛЬ + ЗДОРОВЬЕ → ПЛАН → ТРЕНИРОВКИ ↔ ПИТАНИЕ ↔ ВОССТАНОВЛЕНИЕ ↔ ПРОГРЕСС → ТРЕНЕР → ПРЕДЛОЖЕНИЕ → ПОДТВЕРЖДЕНИЕ
```

## Быстрый старт (Windows)

```bash
npm install
npx expo start            # QR-код → открыть в Expo Go на iPhone
npx expo start --web      # web-превью в браузере (узкое окно / режим iPhone в DevTools)
```

Проверки:

```bash
npx tsc --noEmit          # типы
npx expo-doctor           # конфигурация и версии пакетов
npm run lint              # ESLint (eslint-config-expo, правила React Compiler)
npm test                  # автотесты доменной логики
```

## Как всё связано

- **Здоровье и ограничения** (Профиль → Здоровье и особенности, шаг в онбординге): травмы, хронические ограничения,
  болезненные движения, запреты врача, аллергии, непереносимости, запрещённые продукты. Текст разбирается в
  ограничения движений (`features/profile/health.ts`) и через `getPrefs()` попадает в генератор плана, замены,
  тренировку дня, ручное добавление упражнений (с предложением безопасной альтернативы) и тренера. Давление/сердце/грыжа —
  без работы до отказа; аллергены исключаются из «Что добрать» и подсвечиваются при добавлении еды.
- **Сегодня** (главная): тренировка дня, готовность (с объяснением «почему»), цель питания, вес и динамика, вода, шаги, сон,
  прогресс к цели и советы тренера с учётом реакции на них.
- **Тренер**: на устройстве; знает профиль, здоровье, план, тренировки, рабочие веса, питание, вес, замеры, сон/Health,
  прошлые советы и реакцию на них; хранит долгосрочную память (факты и подтверждённые выводы). При интернете
  дополняет ответы свежими обзорами PubMed (кэшируются локально) и показывает источники; у ключевых тем — проверенные
  первоисточники (ISSN, ACSM, IOC, ВОЗ, NIH). Изменения программы — только после подтверждения.
- **Адаптация программы** (`features/training/adaptPlan.ts`): пропуски, плохое восстановление, застой, «слишком легко» →
  предложение (с объяснением, почему этот формат подходит) на главной, в чате и в отчёте недели.
- **Прогрессия весов**: двойная прогрессия по истории; сложность подхода — «Легко / Нормально / Тяжело / До отказа»
  (внутри — запас повторов). Новое упражнение — 2 подхода; больше — только по недельной цели мышцы с объяснением.
- **Калории тренировки** (`features/training/energy.ts`): данные часов из Apple Health, если совпадают по времени,
  иначе оценка по MET (Compendium of Physical Activities) — всегда «≈» и «Как рассчитано?».
- **Отчёт недели**, прогресс (вес, замеры, фото, сила, объём, питание, сравнение периодов).
- **Данные**: Профиль → Данные и конфиденциальность: экспорт файла для переноса, тихая автокопия в папке приложения,
  восстановление (в «Дополнительно»).

## Внешняя большая модель (необязательно, для разработчика)

Тренер полностью работает на устройстве. Папка `server/` — опциональный backend с внешней моделью; подключается только
на этапе сборки переменной `EXPO_PUBLIC_COACH_API_URL` (пользователь ничего не настраивает).

## Сборка для iPhone (EAS)

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform ios --profile preview     # internal distribution на свой iPhone
npx eas-cli@latest build --platform ios --profile production  # TestFlight / App Store
```

Mac не нужен — сборка идёт в облаке EAS.

### Apple Health (development build)

```bash
npx eas-cli@latest build --profile development --platform ios   # dev-клиент с HealthKit
npx expo start --dev-client                                      # подключиться к нему
```

Плагин `@kingstinct/react-native-healthkit` (app.json) добавляет entitlement `com.apple.developer.healthkit` и `NSHealthShareUsageDescription`; RYNJI только читает данные. Профиль `development` уже есть в `eas.json` (нужен `expo-dev-client`, установлен).

## Структура

```
src/
  app/                 экраны (Expo Router): (tabs)/ index · training · nutrition · progress,
                       onboarding, checkin, coach, profile, plan, weight, food/*, workout/*, exercise/[id]
  components/          UI-кит: Card, Button, Sheet, Dialog/Toast, Ring/Bar/TrendChart, inputs
  features/
    training/          генератор плана, прогрессия, генератор тренировки, «сегодня», аналитика, Training Hub, таймер
    nutrition/         расчёт КБЖУ, адаптация калорий по тренду, статусы, «что добрать»
    recovery/          readiness
    progress/          тренд веса
    coach/             контекст для AI, сервис, безопасность, офлайн-ответы, инсайты
    exercises/         библиотека, анимация техники, анатомия
    profile/           формы, применение профиля (пересчёт плана), демо-данные
  stores/              zustand-сторы, каждый — отдельный ключ AsyncStorage
  storage/             слой хранения (заменяется на SQLite без изменения экранов)
  services/            Open Food Facts, AI API, haptics, Apple Health (services/health)
  data/                114 упражнений (RU), встроенные кадры техники, базовые продукты
  types/               доменная модель
server/                AI Coach backend (Node + @anthropic-ai/sdk)
scripts/logic-test.ts  автотесты логики
```

## Данные и источники

- Кадры фаз движения: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain), встроены в приложение (работают офлайн).
- Анатомические контуры: `react-native-body-highlighter` (MIT).
- Продукты: [Open Food Facts](https://world.openfoodfacts.org) (ODbL) — поиск и штрихкоды; найденные продукты кэшируются локально.

RYNJI — фитнес-помощник и не ставит медицинских диагнозов.

## Тесты

```bash
npm test                     # логика: план, здоровье, сплиты, прогрессия, калории, восстановление, сканер, Health, отчёт, тренер
npx expo start --web --port 8081 & node scripts/e2e-web.cjs   # UI в Expo Web (нужен Playwright)
```
