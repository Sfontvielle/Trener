# Анатомическая карта RYNJI по атласу — архитектура

Фигура карты мышц (мужская и женская, спереди и сзади) обведена по собственным моделям, собранным из открытого атласа
**Z-Anatomy / BodyParts3D** (CC BY-SA). Ничего не покупается, 3D в приложении нет (решение владельца, раунд 7):
в приложение попадают только векторные контуры. Лицензии и атрибуция — `docs/ASSETS_LICENSES.md`.

```
атлас Z-Anatomy (≈7 200 объектов, CC BY-SA)
  │ blender/build_all.sh — отбор мышц, костей, сухожилий; телосложение; женские пропорции; грудь и волосы; одежда
  ▼
male.blend, female.blend (вне репозитория, воспроизводятся сценариями)
  │ map/map_render.py — ортографический ID-рендер спереди и сзади: каждая мышца (канонический id из atlas_map.json
  │                     и сторона) — своим плоским цветом; одежда скрыта; широкая фасция бедра не закрывает мышцы;
  │                     прямая мышца живота — поверх апоневроза наружной косой; грудь — отдельным проходом (контур)
  ▼
front.png, back.png (+ front_over.png, front_contour.png), classes.json, meta.json
  │ map/trace.py      — маска каждого класса → эрозия 1 px (просвет между мышцами) → контур → упрощение → точки;
  │                     сухожильные перемычки пресса — три линии; мышцы без группы приложения — «x-…» (нейтральные)
  ▼
male.json, female.json
  │ map/emit.py       — src/features/exercises/anatomy/atlas.ts (≈145 КБ: точки контуров, вид, группа мышц)
  ▼
anatomy/geometry.ts строит гладкие пути (Catmull-Rom → Безье), Anatomy.tsx подсвечивает по упражнению,
AtlasHero.tsx рисует атлета со спины на приветствии
```

```bash
M=~/.cache/rynji-anatomy/models   # после blender/build_all.sh
for sx in male female; do
  python -I map/map_render.py -- $M/$sx.blend atlas_map.json out/$sx 2400
  python -I map/trace.py out/$sx map/shape_views.json out/$sx.json 1.5   # numpy, scipy, scikit-image, Pillow
done
python -I map/emit.py out/male.json out/female.json ../../src/features/exercises/anatomy/atlas.ts
```

- **Подсветка** — по каноническим id (`src/features/exercises/anatomy/muscleIds.ts`) через `atlas_map.json`
  (id → объекты атласа); имя контура для вида — по `map/shape_views.json`. Уточнение по головкам — `anatomy/detail.ts`.
- **Атрибуция** — подпись под крупной фигурой в «Технике»: «Анатомия по атласу Z-Anatomy и BodyParts3D © DBCLS · CC BY-SA 4.0».
