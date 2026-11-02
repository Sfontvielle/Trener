#!/bin/bash
# Плагины Claude Code для работы над RYNJI: ставятся при каждом старте облачного контейнера
# (скрипт окружения) или вручную на своём компьютере. Повторный запуск безопасен.
set -u
claude plugin marketplace add anthropics/claude-plugins-official >/dev/null 2>&1 || true
claude plugin marketplace add obra/superpowers-marketplace >/dev/null 2>&1 || true
status=0
for p in frontend-design feature-dev code-review code-simplifier typescript-lsp; do
  claude plugin install "$p@claude-plugins-official" -y || status=1
done
claude plugin install superpowers@superpowers-marketplace -y || status=1
# Языковой сервер для typescript-lsp (сам плагин его не содержит)
command -v typescript-language-server >/dev/null 2>&1 || npm i -g typescript-language-server@4 || status=1
exit $status
