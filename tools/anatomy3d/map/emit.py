"""Контуры фигур (trace.py) → src/features/exercises/anatomy/atlas.ts.
Запуск: python -I emit.py <male.json> <female.json> <out.ts>"""
import json, sys
male, female, out = sys.argv[1:4]
data = {'male': json.load(open(male)), 'female': json.load(open(female))}
KIND = {'skin': 's', 'neutral': 'n', 'hair': 'h', 'tendon': 't', 'muscle': 'm', 'line': 'l', 'contour': 'c'}
lines = [
    '// Сгенерировано tools/anatomy3d/map (map_render.py → trace.py → emit.py) — не редактировать вручную.',
    '/**',
    ' * Контуры анатомической фигуры, обведённые по атласу Z-Anatomy (CC BY-SA 4.0; мышцы и кости — BodyParts3D',
    ' * © DBCLS, CC BY-SA 2.1 JP): ортографический вид спереди и сзади, каждая мышца и её сторона — отдельный контур.',
    ' * Производная работа, распространяется под CC BY-SA 4.0 (docs/ASSETS_LICENSES.md).',
    ' * Координаты: макушка y = 0, стопы y = 400, центр x = 0; p — точки контура «x y x y …» (гладкий путь строится',
    ' * в geometry.ts). k — вид: s кожа (силуэт), n голова/кисти/стопы, h волосы, t сухожилия и кости, m мышца,',
    ' * l линия (сухожильная перемычка), c контур (грудь). b — контур без стороны (по нему уточнение по головкам),',
    ' * g — группа мышц приложения.',
    ' */',
    "import type { MuscleSlug } from '@/types';",
    '',
    'export interface AtlasShape {',
    '  i: string;',
    '  b: string;',
    "  k: 's' | 'n' | 'h' | 't' | 'm' | 'l' | 'c';",
    '  g?: MuscleSlug;',
    '  p: string;',
    '  o?: 1;',
    '}',
    '',
    'export const ATLAS: Record<\'male\' | \'female\', Record<\'front\' | \'back\', AtlasShape[]>> = {',
]
for sx in ('male', 'female'):
    lines.append(f'  {sx}: {{')
    for v in ('front', 'back'):
        lines.append(f'    {v}: [')
        for s in data[sx][v]:
            o = {'i': s['id'], 'b': s['base'], 'k': KIND[s['kind']]}
            if s.get('slug'):
                o['g'] = s['slug']
            o['p'] = s['p']
            if s.get('open'):
                o['o'] = 1
            body = ', '.join(f"{k}: {json.dumps(val, ensure_ascii=False) if not isinstance(val, int) else val}".replace('"', "'") for k, val in o.items())
            lines.append(f'      {{ {body} }},')
        lines.append('    ],')
    lines.append('  },')
lines.append('};')
open(out, 'w').write('\n'.join(lines) + '\n')
print('written', out)
