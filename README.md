# FORM — персональный тренер, питание и восстановление

Нативное iPhone-приложение на **React Native + Expo SDK 57 + TypeScript** (Expo Router).
Все данные пользователя хранятся локально на устройстве; для AI Coach — небольшой backend в `server/`.

```
ПРОФИЛЬ → ЦЕЛЬ → ПЛАН → ПИТАНИЕ → ТРЕНИРОВКИ → ВОССТАНОВЛЕНИЕ → ПРОГРЕСС → AI COACH → КОРРЕКТИРОВКА
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
npm test                  # автотесты доменной логики (КБЖУ, тренд веса, прогрессия, readiness, план, «что добрать»,
                          # разгрузка, разминка/блины, итоги недели, безопасность)
```

## Автоматизация

- **Готовность → тренировка**: чек-ин сам меняет объём и RIR сегодняшней тренировки; вес вводится прямо в чек-ине.
- **Разгрузка**: застой e1RM в базовых, накопленная усталость или 6+ недель без паузы → предложение разгрузочной недели (−40% подходов, RIR +2) в одно нажатие.
- **Калории по тренду веса**: раз в 14+ дней предложение ±100–250 ккал.
- **Итоги недели** по понедельникам: тренировки, белок, вес, сон.
- **Уведомления** (локальные, работают в Expo Go): конец отдыха в фоне, утренний чек-ин, тренировка в дни плана — расписание само следует за планом.
- **Еда в один тап**: «как вчера» для текущего приёма пищи и частые продукты с привычной порцией.
- **Резервная копия**: Профиль → «Сохранить копию» (JSON в «Файлы»/iCloud) и «Восстановить».

Все модули проекта входят в Expo Go (camera, haptics, svg, async-storage) — dev-build для ежедневной разработки не нужен.

## AI Coach (сервер)

```bash
cd server
npm install
copy .env.example .env    # вписать ANTHROPIC_API_KEY
npm start                 # http://0.0.0.0:8787
```

В приложении: **Профиль → AI Coach → адрес сервера** (для телефона в той же Wi-Fi сети: `http://<IP ПК>:8787`),
либо переменная `EXPO_PUBLIC_COACH_API_URL` (см. `.env.example`). Для продакшена сервер можно развернуть
на любом Node-хостинге (Render, Railway, Fly.io, VPS) — это один файл без фреймворков.

Без сервера тренер работает в **офлайн-режиме**: отвечает по расчётам FORM (явно помечено «Без AI»).

Архитектура AI:
- все числа (калории, БЖУ, тренд веса, объём, e1RM, readiness, выполнение плана) считаются **на устройстве**;
- модели уходит структурированный контекст: профиль, цель, план, 7/30 дней, тренд веса, питание сегодня, таблица продуктов на 100 г, память;
- память: сырые данные остаются на телефоне + последние сообщения + сжатое резюме старых + долговременные факты (`CoachMemory`, видны и редактируются в профиле);
- ответ — структурированный JSON: текст, предлагаемые изменения плана (`[Применить]` реально меняет план), новые факты для памяти;
- протокол безопасности (боль в груди, обморок, одышка, травма) срабатывает локально, до AI и без сети.

## Сборка для iPhone (EAS)

```bash
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform ios --profile preview     # internal distribution на свой iPhone
npx eas-cli@latest build --platform ios --profile production  # TestFlight / App Store
```

Mac не нужен — сборка идёт в облаке EAS. Для HealthKit в будущем понадобится dev-build (`eas build --profile development`).

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
  services/            Open Food Facts, AI API, haptics, HealthKit-провайдер
  data/                114 упражнений (RU), встроенные кадры техники, базовые продукты
  types/               доменная модель
server/                AI Coach backend (Node + @anthropic-ai/sdk)
scripts/logic-test.ts  автотесты логики
```

## Данные и источники

- Кадры фаз движения: [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (public domain), встроены в приложение (работают офлайн).
- Анатомические контуры: `react-native-body-highlighter` (MIT).
- Продукты: [Open Food Facts](https://world.openfoodfacts.org) (ODbL) — поиск и штрихкоды; найденные продукты кэшируются локально.

FORM — фитнес-помощник и не ставит медицинских диагнозов.
