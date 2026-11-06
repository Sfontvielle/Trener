"""Атлетическое телосложение: объём каждой мышцы растёт по её брюшку (в середине больше, к сухожилиям — ноль),
вдоль нормалей поверхности. Места крепления не сдвигаются, поэтому анатомия сохраняется.
Запуск: python -I physique.py -- <in.blend> <out.blend> [scale] [male|female]"""
import bpy, sys, re
import numpy as np

args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
K = float(args[2]) if len(args) > 2 else 1.0
PROFILE = args[3] if len(args) > 3 else 'male'
bpy.ops.wm.open_mainfile(filepath=src, load_ui=False, use_scripts=False)

# прирост толщины в середине брюшка, метры (атлет-бодибилдер, без карикатурной гипертрофии)
GAIN = {
    'Clavicular head of pectoralis major muscle': 0.012, 'Sternocostal head of pectoralis major muscle': 0.014, '(Abdominal part of pectoralis major muscle)': 0.008,
    'Clavicular part of deltoid muscle': 0.014, 'Acromial part of deltoid muscle': 0.016, 'Scapular spinal part of deltoid muscle': 0.012,
    'Descending part of trapezius muscle': 0.013, 'Transverse part of trapezius muscle': 0.006, 'Ascending part of trapezius muscle': 0.005,
    'Latissimus dorsi muscle': 0.014, 'Teres major muscle': 0.01, 'Teres minor muscle': 0.005, 'Infraspinatus muscle': 0.006, 'Supraspinatus muscle': 0.005,
    'Rhomboid major muscle': 0.004, 'Rhomboid minor muscle': 0.003, 'Levator scapulae': 0.004, 'Serratus anterior muscle': 0.005,
    'Sternocleidomastoid muscle': 0.005, 'Splenius capitis muscle': 0.004,
    'Long head of biceps brachii': 0.015, 'Short head of biceps brachii': 0.014, 'Brachialis muscle': 0.008, 'Coracobrachialis muscle': 0.004,
    'Long head of triceps brachii': 0.015, 'Lateral head of triceps brachii': 0.015, 'Medial head of triceps brachii': 0.006, 'Anconeus muscle': 0.003,
    'Brachioradialis muscle': 0.008, 'Extensor carpi radialis longus': 0.006, 'Extensor carpi radialis brevis': 0.005, 'Extensor digitorum': 0.004,
    'Humeral head of extensor carpi ulnaris': 0.004, 'Humeral head of flexor carpi ulnaris': 0.005, 'Flexor carpi radialis': 0.005, 'Palmaris longus muscle': 0.003,
    'Humero-ulnar head of flexor digitorum superficialis': 0.005, 'Superficial head of pronator teres': 0.005,
    'Rectus abdominis muscle': 0.004, 'External abdominal oblique muscle': 0.005,
    'Iliocostalis lumborum muscle': 0.007, 'Iliocostalis thoracis muscle': 0.005, 'Longissimus thoracis muscle': 0.008, 'Spinalis thoracis muscle': 0.004,
    'Gluteus maximus muscle': 0.012, 'Gluteus medius muscle': 0.008, 'Tensor fasciae latae': 0.005,
    'Rectus femoris muscle': 0.013, 'Vastus lateralis muscle': 0.016, 'Vastus medialis muscle': 0.015, 'Vastus intermedius muscle': 0.008, 'Sartorius muscle': 0.004,
    'Adductor longus': 0.008, 'Adductor magnus': 0.009, 'Adductor brevis': 0.005, 'Gracilis muscle': 0.005, 'Pectineus muscle': 0.004,
    'Long head of biceps femoris': 0.011, 'Short head of biceps femoris': 0.007, 'Semitendinosus muscle': 0.010, 'Semimembranosus muscle': 0.010,
    'Medial head of gastrocnemius': 0.013, 'Lateral head of gastrocnemius': 0.011, 'Soleus muscle': 0.008, 'Tibialis anterior muscle': 0.006,
    'Fibularis longus muscle': 0.005, 'Fibularis brevis muscle': 0.003, 'Extensor digitorum longus': 0.004,
}

# женский профиль: относительно больше ягодицы и ноги, меньше верх тела (при общем K≈0,5 — подтянутая спортсменка)
if PROFILE == 'female':
    for k in GAIN:
        if re.search(r'Gluteus|Tensor', k):
            GAIN[k] *= 2.0
        elif re.search(r'Vastus|Rectus femoris|femoris|Semi|Adductor|Gracilis|Sartorius|gastrocnemius|Soleus|Pectineus', k):
            GAIN[k] *= 1.35
        elif re.search(r'pectoralis|Latissimus|Teres major|trapezius|triceps|biceps brachii|Brachi', k):
            GAIN[k] *= 0.8

from scipy.spatial import cKDTree

# Покрытые мышцы (и сухожилия) не растут сами, а сдвигаются вместе с тем, что их покрывает, — слои не пересекаются
COVERED = {'Rhomboid major muscle', 'Rhomboid minor muscle', 'Supraspinatus muscle', 'Teres minor muscle', 'Gluteus medius muscle', 'Soleus muscle',
           'Vastus intermedius muscle', 'Brachialis muscle', 'Coracobrachialis muscle', 'Medial head of triceps brachii', 'Levator scapulae',
           'Adductor brevis', 'Short head of biceps femoris', 'Iliocostalis thoracis muscle', 'Spinalis thoracis muscle'}

def arr(me, attr):
    a = np.empty(len(me.vertices) * 3); me.vertices.foreach_get(attr, a); return a.reshape(-1, 3)

# 1) собственный прирост поверхностных мышц: наружная сторона растёт, внутренняя стоит
objs = [o for o in bpy.data.objects if o.type == 'MESH' and o.get('rynji_kind') in ('muscle', 'tendon')]
own, nrm = {}, {}
for o in objs:
    co = arr(o.data, 'co')
    kt = cKDTree(co)
    _, nb = kt.query(co, k=min(96, len(co)))
    n0 = arr(o.data, 'normal')[nb].mean(1)
    n0 /= np.maximum(np.linalg.norm(n0, axis=1, keepdims=True), 1e-9)
    nrm[o.name] = n0
    rid = o.get('rynji_id', '')
    g = GAIN.get(rid)
    if not g or rid in COVERED or o.get('rynji_kind') != 'muscle':
        own[o.name] = np.zeros_like(co)
        continue
    cen = co.mean(0); c = co - cen
    w, v = np.linalg.eigh(c.T @ c)
    t = c @ v[:, -1]; t = (t - t.min()) / max(1e-9, t.max() - t.min())
    prof = np.sin(np.pi * np.clip(t, 0, 1)) ** 0.75
    cd = c / np.maximum(np.linalg.norm(c, axis=1, keepdims=True), 1e-9)
    outer = np.clip(np.einsum('ij,ij->i', n0, cd) * 4 + 0.5, 0, 1); outer = outer * outer * (3 - 2 * outer)
    own[o.name] = n0 * (g * K * prof * outer)[:, None]

# 2) лежащее поверх выросшей мышцы выталкивается на её прирост (два прохода — до трёх слоёв)
names = [o.name for o in objs]
disp = dict(own)
for _ in range(2):
    P, N, D, OWN = [], [], [], []
    for i, nm in enumerate(names):
        d = disp[nm]; mag = np.linalg.norm(d, axis=1); sel = mag > 1e-4
        co = arr(bpy.data.objects[nm].data, 'co')
        P.append(co[sel]); N.append(nrm[nm][sel]); D.append(d[sel]); OWN.append(np.full(sel.sum(), i))
    P = np.concatenate(P); N = np.concatenate(N); D = np.concatenate(D); OWN = np.concatenate(OWN)
    tree = cKDTree(P)
    new = {}
    for i, nm in enumerate(names):
        co = arr(bpy.data.objects[nm].data, 'co')
        dist, idx = tree.query(co, k=16, distance_upper_bound=0.015)
        ok = np.isfinite(dist)
        idx = np.where(ok, idx, 0)
        rel = co[:, None, :] - P[idx]
        above = np.einsum('ijk,ijk->ij', rel, N[idx]) > -0.0015
        ok &= above & (OWN[idx] != i)
        w = np.where(ok, 1.0 / (dist + 2e-3), 0.0)
        ws = w.sum(1, keepdims=True)
        cand = (D[idx] * w[..., None]).sum(1) / np.maximum(ws, 1e-9)
        cur = disp[nm]
        take = (np.linalg.norm(cand, axis=1) > np.linalg.norm(cur, axis=1)) & (ws[:, 0] > 0)
        res = cur.copy(); res[take] = cand[take]
        new[nm] = res
    disp = new

# 3) сглаживание поля смещений по каждой сетке (без ступенек на границах слоёв)
for nm in names:
    co = arr(bpy.data.objects[nm].data, 'co')
    if len(co) < 4:
        continue
    _, nb = cKDTree(co).query(co, k=min(24, len(co)))
    disp[nm] = disp[nm][nb].mean(1)

for nm, d in disp.items():
    o = bpy.data.objects[nm]
    co = arr(o.data, 'co') + d
    o.data.vertices.foreach_set('co', co.ravel()); o.data.update()
done = sum(1 for d in disp.values() if np.abs(d).max() > 1e-5)
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
print('INFLATED', done, 'SAVED', out)
