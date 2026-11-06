#!/usr/bin/env bash
# Скачивает открытый анатомический атлас Z-Anatomy (CC BY-SA 4.0; мышцы — BodyParts3D, CC BY-SA 2.1 JP)
# и распаковывает Startup.blend в ${ANATOMY_WORK:-~/.cache/rynji-anatomy}. В репозиторий атлас не кладётся (≈300 МБ).
set -euo pipefail
WORK="${ANATOMY_WORK:-$HOME/.cache/rynji-anatomy}"
mkdir -p "$WORK"
cd "$WORK"
[ -d The-blend ] || git clone --depth 1 https://github.com/Z-Anatomy/The-blend
unzip -o -q The-blend/Z-Anatomy.zip Z-Anatomy/Startup.blend
echo "$WORK/Z-Anatomy/Startup.blend"
