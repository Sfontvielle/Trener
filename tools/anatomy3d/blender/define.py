"""Чёткость формы мышц (против «пластилина»):
1) сглаживание складок атласа (Taubin, без усадки): широкие плоские мышцы (широчайшая, трапеция, наружная косая…) — сильно,
   остальные — только мелкая рябь; тонкие волокна потом даёт рельеф материала;
2) борозды между соседними мышцами: там, где мышцы прилегают друг к другу боком (не слоями), поверхность уходит внутрь
   на ~2 мм — каждая мышца читается отдельной формой, тень в бороздах даёт свет.
Запуск: python -I define.py -- <in.blend> <out.blend>"""
import bpy, sys, re
import numpy as np
from scipy.spatial import cKDTree

args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
bpy.ops.wm.open_mainfile(filepath=src, load_ui=False, use_scripts=False)

BROAD = re.compile(r'Latissimus|trapezius|External abdominal oblique|Serratus posterior|Thoracolumbar fascia|Infraspinatus|'
                   r'Rhomboid|Gluteus maximus|Iliocostalis|Longissimus|Spinalis|Splenius|Teres major', re.I)
DEPTH = float(args[2]) if len(args) > 2 else 0.0018

objs = [o for o in bpy.data.objects if o.type == 'MESH' and o.get('rynji_kind') == 'muscle']

def verts(o):
    a = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', a); return a.reshape(-1, 3)

# 1) сглаживание складок — Taubin (λ/μ): форма не съёживается и тонкие сетки не «уплывают»; только широкие плоские мышцы
def taubin(o, iters, lam=0.5, mu=-0.53):
    me = o.data; n = len(me.vertices)
    e = np.empty(len(me.edges) * 2, np.int64); me.edges.foreach_get('vertices', e); e = e.reshape(-1, 2)
    deg = np.bincount(e.ravel(), minlength=n).astype(np.float64)[:, None]
    v = verts(o)
    for _ in range(iters):
        for f in (lam, mu):
            acc = np.zeros_like(v); np.add.at(acc, e[:, 0], v[e[:, 1]]); np.add.at(acc, e[:, 1], v[e[:, 0]])
            avg = np.where(deg > 0, acc / np.maximum(deg, 1), v)
            v = v + f * (avg - v)
    me.vertices.foreach_set('co', v.ravel()); me.update()

for o in objs:
    taubin(o, 12 if BROAD.search(o.get('rynji_id', o.name)) else 4)     # остальные — только мелкая «рябь»

# 2) борозды на стыках
P, I, NRM = [], [], []
for i, o in enumerate(objs):
    v = verts(o)
    n = np.empty(len(v) * 3); o.data.vertices.foreach_get('normal', n); n = n.reshape(-1, 3)
    _, nb = cKDTree(v).query(v, k=min(24, len(v)))
    n = n[nb].mean(1); n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
    P.append(v); NRM.append(n); I.append(np.full(len(v), i))
allP = np.concatenate(P); allI = np.concatenate(I)
tree = cKDTree(allP)
R = 0.007
for i, o in enumerate(objs):
    v, n = P[i], NRM[i]
    d, idx = tree.query(v, k=24, distance_upper_bound=R)
    ok = np.isfinite(d)
    idx = np.where(ok, idx, 0)
    other = ok & (allI[idx] != i)
    rel = allP[idx] - v[:, None, :]
    rl = np.maximum(np.linalg.norm(rel, axis=2), 1e-9)
    lateral = np.abs(np.einsum('ijk,ik->ij', rel, n)) / rl < 0.55          # сосед сбоку, а не слоем ниже/выше
    w = np.where(other & lateral, 1 - d / R, 0).max(1)
    if not (w > 0).any():
        continue
    # плавный профиль борозды: сглаживание веса по своей сетке
    _, nb = cKDTree(v).query(v, k=min(12, len(v)))
    w = w[nb].mean(1)
    o.data.vertices.foreach_set('co', (v - n * (DEPTH * np.clip(w * 1.6, 0, 1))[:, None]).ravel()); o.data.update()

for m in bpy.data.materials:
    if m.name.startswith('rynji_'):
        m.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
print('DEFINED', len(objs), 'SAVED', out)
