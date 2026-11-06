"""Женская фигура из мужской анатомии: деформируется всё вместе (кости, мышцы, сухожилия, кожа), поэтому крепления
мышц остаются на своих костях. Не масштабирование целиком: уже плечи и грудная клетка, тоньше талия и шея, шире таз
и бёдра (Q-угол), руки короче и тоньше, голова относительно крупнее, рост ниже.
Запуск: python -I morph_female.py -- <male_base.blend> <female_base.blend>"""
import bpy, sys, re
import numpy as np
from scipy.interpolate import PchipInterpolator

args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
bpy.ops.wm.open_mainfile(filepath=src, load_ui=False, use_scripts=False)

# ширина (x) и глубина (y) по высоте мужской фигуры (рост 1,74 м)
Z = [0.00, 0.20, 0.45, 0.62, 0.74, 0.84, 0.91, 0.97, 1.03, 1.10, 1.20, 1.32, 1.42, 1.50, 1.56, 1.62, 1.80]
SX = [0.95, 0.95, 0.97, 1.03, 1.07, 1.10, 1.10, 1.04, 0.88, 0.86, 0.89, 0.90, 0.86, 0.82, 0.92, 1.00, 1.00]
SY = [1.00, 0.98, 0.98, 1.01, 1.04, 1.07, 1.07, 1.02, 0.93, 0.92, 0.93, 0.94, 0.93, 0.88, 0.95, 1.00, 1.00]
sx = PchipInterpolator(Z, SX, extrapolate=True)
sy = PchipInterpolator(Z, SY, extrapolate=True)
HEIGHT = 0.93          # рост: 1,62 м
ARM_K = 0.95           # руки: короче и тоньше относительно плеча
HEAD_K = 1.035         # голова относительно крупнее тела

ARM = re.compile(r'brachi|carpi|digiti minimi$|Extensor digitorum$|superficialis|profundus|pollicis|indicis|pronator|Supinator|Anconeus|Palmaris|hand|Palm|Thenar|Hypothenar|Nail|Carpal|Radius|Ulna|Humerus|etacarp|halan|Scaphoid|Lunate|Triquetrum|Pisiform|Trapezi(um|oid)$|Capitate|Hamate|Antebrachial|Perionyx|deltoid|pectoralis major|Latissimus|Teres major', re.I)

def verts(o):
    a = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', a); return a.reshape(-1, 3)

def torso(p):
    q = p.copy()
    q[:, 0] *= sx(p[:, 2]); q[:, 1] *= sy(p[:, 2])
    return q

# плечевой сустав (центр головки плечевой кости) и ось плеча — по каждой стороне
joint, axis = {}, {}
for side, sgn in (('l', 1), ('r', -1)):
    h = verts(bpy.data.objects[f'Humerus.{side}'])
    top = h[h[:, 2] > h[:, 2].max() - 0.045].mean(0)
    elbow = h[h[:, 2] < h[:, 2].min() + 0.03].mean(0)
    joint[sgn] = top; axis[sgn] = (elbow - top) / np.linalg.norm(elbow - top)
    print('JOINT', side, np.round(top, 3), 'AXIS', np.round(axis[sgn], 2))

neck = np.array([0.0, 0.0, 1.53])
def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)

for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    p = verts(o)
    q = torso(p)
    cen = p.mean(0)
    # рука: по имени или по положению (всё, что висит сбоку от туловища ниже плеча, — кожа кисти, связки, сухожилия)
    nm = o.get('rynji_id', o.name)
    if 'foot' not in nm and (ARM.search(nm) or (abs(cen[0]) > 0.2 and cen[2] < joint[1][2] - 0.03)):
        for sgn in (1, -1):
            m = np.sign(p[:, 0]) == sgn
            if not m.any():
                continue
            J = joint[sgn]; Jn = torso(J[None])[0]
            t = (p[m] - J) @ axis[sgn]
            w = smooth(0.02, 0.14, t)[:, None]
            qa = Jn + ARM_K * (p[m] - J)
            q[m] = (1 - w) * q[m] + w * qa
    # голова: чуть крупнее, плавно от шеи
    hk = 1 + (HEAD_K - 1) * smooth(1.50, 1.60, p[:, 2])
    q = neck + (q - neck) * hk[:, None]
    q *= HEIGHT
    o.data.vertices.foreach_set('co', q.ravel()); o.data.update()

for m in bpy.data.materials:
    if m.name.startswith('rynji_'):
        m.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
print('FEMALE BASE SAVED', out)
