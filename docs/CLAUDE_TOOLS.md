# Инструменты Claude Code для RYNJI

Проверено 2 ноября 2026 в облачной сессии Claude Code (CLI 2.1.316). Каждый пункт проверен запуском в новой сессии, а не только установкой.

| Инструмент | Как подключён | Проверка | Результат |
|---|---|---|---|
| frontend-design | плагин `frontend-design@claude-plugins-official` | навык загружается (`# Frontend Design`) | работает |
| feature-dev | плагин `feature-dev@claude-plugins-official`: команда `/feature-dev`, агенты code-explorer, code-architect, code-reviewer | агент code-explorer нашёл `src/stores/schedule.ts` | работает |
| code-simplifier | плагин `code-simplifier@claude-plugins-official`, агент | прочитал `src/features/training/hub.ts`, файлы не изменены | работает |
| code-review | плагин `code-review@claude-plugins-official`, команда для PR | команда работает только через `gh` CLI | **не работает в облаке**: токен `GH_TOKEN` недействителен. Вместо неё — встроенный `/code-review` (diff, PR через GitHub MCP) |
| Superpowers | плагин `superpowers@superpowers-marketplace` (obra), 15 навыков; при старте добавляет в контекст текст навыка `using-superpowers` | навык `verification-before-completion` загружается | работает |
| context7 | MCP-сервер проекта в `.mcp.json` (`https://mcp.context7.com/mcp`, без ключа) | нашёл `/expo/expo` версии `expo_58.0.0` и вернул документацию по модальным экранам expo-router SDK 58 | работает |
| typescript-lsp | плагин `typescript-lsp@claude-plugins-official` + `typescript-language-server` 4.4.1 | инструмента LSP нет, диагностика после правки не приходит | **не работает в облачной сессии**. На своём компьютере (Claude Code CLI / desktop) должен работать. Замена здесь — `npx tsc --noEmit` |
| GitHub | GitHub MCP + git | `get_me` → Sfontvielle; ветки `main` и `claude/exciting-brown-szjuk7` видны; push работает | работает (кроме `gh` CLI) |
| Figma | коннектор claude.ai | не подключён | нужен вход владельца аккаунта Figma |

Почему context7 подключён через `.mcp.json`, а не плагином: в плагине зашит адрес `…/mcp?client=claude-code-plugin`, который требует OAuth-вход. В облачном контейнере войти нельзя. Обычный адрес отвечает без ключа (с ограничением частоты запросов).

## Чтобы плагины были в каждой облачной сессии

Облачный контейнер создаётся заново. `enabledPlugins` в `.claude/settings.json` в облаке плагины сам не ставит (проверено). Нужен скрипт окружения:

1. В облачной сессии: меню окружения в заголовке → Edit → **Setup script**.
2. Вставить:

```bash
#!/bin/bash
claude plugin marketplace add anthropics/claude-plugins-official || true
claude plugin marketplace add obra/superpowers-marketplace || true
for p in frontend-design feature-dev code-review code-simplifier typescript-lsp; do
  claude plugin install "$p@claude-plugins-official" -y
done
claude plugin install superpowers@superpowers-marketplace -y
npm i -g typescript-language-server@4
```

Тот же набор лежит в `scripts/setup-claude-tools.sh`; на своём компьютере достаточно `bash scripts/setup-claude-tools.sh`. Скрипт проверен с нуля: все 6 плагинов ставятся, новая сессия их видит.

context7 подключается сам из `.mcp.json` в репозитории.
