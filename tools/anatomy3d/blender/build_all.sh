#!/usr/bin/env bash
# Полная сборка обеих моделей из открытого атласа. Женская фигура — из мужской анатомии (не масштабированием целиком).
# Результат — .blend вне репозитория: ${OUT:-~/.cache/rynji-anatomy/models}/{male,female}.blend
set -euo pipefail
cd "$(dirname "$0")"
PY=${PY:-python}
OUT=${OUT:-${ANATOMY_WORK:-$HOME/.cache/rynji-anatomy}/models}
mkdir -p "$OUT"
ATLAS=$(./fetch_atlas.sh)
$PY -I build_male.py -- "$ATLAS" "$OUT/male_base.blend"                           # отбор слоёв атласа, материалы
$PY -I physique.py -- "$OUT/male_base.blend" "$OUT/male_athlete.blend" 1.5 male    # масса атлета-бодибилдера
$PY -I garment.py -- "$OUT/male_athlete.blend" "$OUT/male.blend" male              # плавки
$PY -I morph_female.py -- "$OUT/male_base.blend" "$OUT/female_base.blend"         # женские пропорции скелета и мышц
$PY -I physique.py -- "$OUT/female_base.blend" "$OUT/female_athlete.blend" 0.5 female
$PY -I female_extras.py -- "$OUT/female_athlete.blend" "$OUT/female_extras.blend" # грудь, волосы с пучком
$PY -I garment.py -- "$OUT/female_extras.blend" "$OUT/female.blend" female        # топ с лямками, трусы
echo "$OUT/male.blend $OUT/female.blend"
