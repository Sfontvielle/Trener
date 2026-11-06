"""Риг анатомической модели: арматура по суставам скелета атласа (центры суставов — по контакту костей,
головки плечевой и бедренной — подгонкой сферы), кости скелета — жёстко на своей кости рига, мышцы, сухожилия,
кожа, одежда — смешиванием между ближайшими костями (обратные расстояния, 4-я степень, до 4 костей).
Запуск: python -I rig.py -- <in.blend> <out.blend>"""
import bpy, sys, re, math, json
import numpy as np
from mathutils import Vector, Matrix
from scipy.spatial import cKDTree

args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
bpy.ops.wm.open_mainfile(filepath=src, load_ui=False, use_scripts=False)

def base(n):
    return re.sub(r'\.(l|r)$', '', n)

def verts(o):
    a = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', a); return a.reshape(-1, 3)

FING = {'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5}
SEG = {'Proximal': 1, 'Middle': 2, 'Distal': 3}

def rig_bone(o):
    """Кость рига для кости скелета атласа."""
    n = o.name; b = base(n)
    s = '.L' if n.endswith('.l') else '.R' if n.endswith('.r') else ''
    if b in ('Clavicle', 'Scapula'):
        return 'shoulder' + s
    if b == 'Humerus':
        return 'upperarm' + s
    if b in ('Radius', 'Ulna'):
        return 'forearm' + s
    m = re.match(r'(Proximal|Middle|Distal) phalanx of (\w+) finger of hand$', b)
    if m:
        f = FING[m.group(2)]; k = SEG[m.group(1)]
        if f == 1 and k == 3:
            k = 2                       # у большого пальца две фаланги
        return f'f{f}_{k}' + s
    if re.search(r'(Scaphoid|Lunate|Triquetrum|Pisiform|Trapezium|Trapezoid|Capitate|Hamate) bone|metacarpal', b):
        return 'hand' + s
    if b in ('Femur', 'Patella'):
        return 'thigh' + s
    if b in ('Tibia', 'Fibula'):
        return 'shin' + s
    if re.search(r'Talus|Calcaneus|Navicular|Cuboid|cuneiform|metatarsal|of foot|Sesamoid bones of foot', b):
        return 'foot' + s
    return 'body'

bones = [o for o in bpy.data.objects if o.type == 'MESH' and o.get('rynji_kind') == 'bone']
group = {}
for o in bones:
    group.setdefault(rig_bone(o), []).append(o)
pts = {g: np.concatenate([verts(o) for o in obs]) for g, obs in group.items()}
by_name = {o.name: o for o in bones}

def P(name):
    return verts(by_name[name])

def contact(a, b, r=0.008):
    """Точки a, лежащие ближе r к b, и наоборот — поверхность сустава."""
    ta, tb = cKDTree(a), cKDTree(b)
    da, _ = tb.query(a, distance_upper_bound=r); db, _ = ta.query(b, distance_upper_bound=r)
    return a[np.isfinite(da)], b[np.isfinite(db)]

def sphere(p):
    A = np.c_[2 * p, np.ones(len(p))]; f = (p ** 2).sum(1)
    c = np.linalg.lstsq(A, f, rcond=None)[0][:3]
    return c

def joint(a, b, r=0.01):
    pa, pb = contact(a, b, r)
    if len(pa) + len(pb) < 6:
        return joint(a, b, r * 1.8) if r < 0.05 else (a.mean(0) + b.mean(0)) / 2
    return np.concatenate([pa, pb]).mean(0)

def far_end(p, ref):
    d = np.linalg.norm(p - ref, axis=1); return p[d > np.percentile(d, 97)].mean(0)

J = {}
for side, s in (('l', '.L'), ('r', '.R')):
    hum, scap, clav = P(f'Humerus.{side}'), P(f'Scapula.{side}'), P(f'Clavicle.{side}')
    manub = P('Manubrium of sternum')
    rad, uln = P(f'Radius.{side}'), P(f'Ulna.{side}')
    fa = np.concatenate([rad, uln])
    carp = np.concatenate([P(f'{n} bone.{side}') for n in ('Scaphoid', 'Lunate', 'Triquetrum')])
    gh_pts, _ = contact(hum, scap, 0.01)
    J['gh' + s] = sphere(gh_pts) if len(gh_pts) > 30 else hum[hum[:, 2] > hum[:, 2].max() - 0.04].mean(0)
    J['sc' + s] = joint(clav, manub)
    J['elbow' + s] = joint(hum, fa, 0.008)
    J['wrist' + s] = joint(fa, carp, 0.008)
    mc3 = P(f'Third metacarpal bone.{side}')
    J['hand_tip' + s] = far_end(mc3, J['wrist' + s])
    for fname, f in FING.items():
        segs = ['Proximal', 'Distal'] if f == 1 else ['Proximal', 'Middle', 'Distal']
        mc = P(f'{["First", "Second", "Third", "Fourth", "Fifth"][f - 1]} metacarpal bone.{side}')
        prev = mc
        for k, sg in enumerate(segs, 1):
            ph = P(f'{sg} phalanx of {fname} finger of hand.{side}')
            J[f'f{f}_{k}' + s] = joint(prev, ph, 0.006)
            prev = ph
        J[f'f{f}_tip' + s] = far_end(prev, J[f'f{f}_{len(segs)}' + s])
    fem, hip = P(f'Femur.{side}'), P(f'Hip bone.{side}')
    head_pts, _ = contact(fem, hip, 0.01)
    J['hip' + s] = sphere(head_pts) if len(head_pts) > 30 else fem[fem[:, 2] > fem[:, 2].max() - 0.05].mean(0)
    tib, fib = P(f'Tibia.{side}'), P(f'Fibula.{side}')
    J['knee' + s] = joint(fem, tib, 0.012)
    talus = P(f'Talus.{side}')
    J['ankle' + s] = joint(np.concatenate([tib, fib]), talus, 0.008)
    mts = np.concatenate([P(f'{n} metatarsal bone.{side}') for n in ('First', 'Second', 'Third', 'Fourth', 'Fifth')])
    J['toe' + s] = far_end(mts, J['ankle' + s])
J['pelvis'] = (J['hip.L'] + J['hip.R']) / 2
J['neck'] = P('Vertebra C7').mean(0)
for k, v in sorted(J.items()):
    print('JOINT', k, np.round(v, 3).tolist())

# --- арматура -----------------------------------------------------------------------------------------
arm_d = bpy.data.armatures.new('rig'); arm = bpy.data.objects.new('rig', arm_d)
bpy.context.scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_d.edit_bones

def add(name, head, tail, parent=None, roll_up=None):
    b = eb.new(name); b.head = Vector(head); b.tail = Vector(tail)
    if np.linalg.norm(np.array(tail) - np.array(head)) < 1e-3:
        b.tail = Vector(head) + Vector((0, 0, 0.02))
    if parent:
        b.parent = eb[parent]
    return b

add('body', J['pelvis'], J['neck'])
for s in ('.L', '.R'):
    add('shoulder' + s, J['sc' + s], J['gh' + s], 'body')
    add('upperarm' + s, J['gh' + s], J['elbow' + s], 'shoulder' + s)
    add('forearm' + s, J['elbow' + s], J['wrist' + s], 'upperarm' + s)
    add('hand' + s, J['wrist' + s], J['hand_tip' + s], 'forearm' + s)
    for f in range(1, 6):
        n = 2 if f == 1 else 3
        for k in range(1, n + 1):
            tail = J[f'f{f}_{k + 1}' + s] if k < n else J[f'f{f}_tip' + s]
            add(f'f{f}_{k}' + s, J[f'f{f}_{k}' + s], tail, 'hand' + s if k == 1 else f'f{f}_{k - 1}' + s)
    add('thigh' + s, J['hip' + s], J['knee' + s], 'body')
    add('shin' + s, J['knee' + s], J['ankle' + s], 'thigh' + s)
    add('foot' + s, J['ankle' + s], J['toe' + s], 'shin' + s)
bpy.ops.object.mode_set(mode='OBJECT')
arm['rynji_joints'] = json.dumps({k: [float(x) for x in v] for k, v in J.items()})

# --- веса ---------------------------------------------------------------------------------------------
RB = sorted(pts)
trees = {g: cKDTree(pts[g][:: max(1, len(pts[g]) // 40000)]) for g in RB}

def weights_for(v, cand, power=4, span=0.04, tr=None):
    tr = tr or trees
    D = np.stack([tr[g].query(v)[0] for g in cand], 1)
    D = np.maximum(D, 0.003)
    dmin = D.min(1, keepdims=True)
    W = np.where(D < dmin + span, (1 / D) ** power, 0)
    order = np.argsort(-W, 1)[:, :4]                 # не больше 4 костей на вершину
    mask = np.zeros_like(W, bool); np.put_along_axis(mask, order, True, 1)
    W = np.where(mask, W, 0); W /= W.sum(1, keepdims=True)
    return W

def assign(o, cand, W):
    o.vertex_groups.clear()
    for j, g in enumerate(cand):
        w = np.round(W[:, j], 2)
        if not (w > 0).any():
            continue
        vg = o.vertex_groups.new(name=g)
        for val in np.unique(w[w > 0]):
            vg.add(np.where(w == val)[0].tolist(), float(val), 'REPLACE')

# Поле весов: у каждого объекта — свой участок тела (рука, нога, туловище) по ближайшим костям, и только кости этого
# участка (толстая мышца бедра может оказаться ближе к кости висящей кисти, чем к своей бедренной). Веса сглаживаются
# по соседям в пространстве внутри совместимых участков — соседние мышцы двигаются согласованно, без разрывов.
def region_of(g):
    side = g[-2:] if g[-2:] in ('.L', '.R') else ''
    if g == 'body':
        return 'axial'
    if g.startswith(('thigh', 'shin', 'foot')):
        return 'leg' + side
    return 'arm' + side

# туловищу — только верхняя треть плечевой кости (там крепятся широчайшая и большая грудная): в позе покоя рука висит
# вплотную к боку, и иначе бок «тянется» за всей рукой
trees_ax = dict(trees)
for sd in ('.L', '.R'):
    hp = pts['upperarm' + sd]
    trees_ax['upperarm' + sd] = cKDTree(hp[np.linalg.norm(hp - J['gh' + sd], axis=1) < 0.10])
ALLOWED = {'axial': [g for g in RB if g == 'body' or g.startswith(('shoulder', 'upperarm', 'thigh'))]}
for sd in ('.L', '.R'):
    ALLOWED['arm' + sd] = [g for g in RB if region_of(g) == 'arm' + sd]   # мышцы руки — без кости туловища
    ALLOWED['leg' + sd] = [g for g in RB if g == 'body' or (region_of(g) == 'leg' + sd)]
GROUPS = {'axial': ['axial', 'arm.L', 'arm.R'], 'arm.L': ['arm.L', 'axial'], 'arm.R': ['arm.R', 'axial'],
          'leg.L': ['leg.L', 'axial'], 'leg.R': ['leg.R', 'axial']}

soft = [o for o in bpy.data.objects if o.type == 'MESH' and o.get('rynji_kind') != 'bone']
V = {o.name: verts(o) for o in soft}
REG = {}
for o in soft:
    sub = V[o.name][:: max(1, len(V[o.name]) // 300)]
    D = np.stack([trees[g].query(sub)[0] for g in RB], 1)
    regs = [region_of(RB[i]) for i in D.argmin(1)]
    REG[o.name] = max(set(regs), key=regs.count)

def dense(v, allowed, power=4):
    W = weights_for(v, allowed, power=power, span=0.03 if power > 4 else 0.04, tr=trees_ax if power > 4 else None)
    out = np.zeros((len(v), len(RB)), np.float32)
    for j, g in enumerate(allowed):
        out[:, RB.index(g)] = W[:, j]
    return out

SP_, SW, SR = [], [], []
for o in soft:
    v = V[o.name][:: 3]
    SP_.append(v); SW.append(dense(v, ALLOWED[REG[o.name]], 7 if REG[o.name] == 'axial' else 4)); SR += [REG[o.name]] * len(v)
SP_ = np.concatenate(SP_); SW = np.concatenate(SW); SR = np.array(SR)
gtrees = {}
for r, members in GROUPS.items():
    m = np.isin(SR, members)
    gtrees[r] = (cKDTree(SP_[m]), SW[m])
HANDISH = np.array([g.startswith(('hand', 'f1', 'f2', 'f3', 'f4', 'f5')) for g in RB])

n_obj = 0
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    if o.get('rynji_kind') == 'bone':
        o.vertex_groups.clear()
        vg = o.vertex_groups.new(name=rig_bone(o)); vg.add(list(range(len(o.data.vertices))), 1.0, 'REPLACE')
    else:
        v = V[o.name]; r = REG[o.name]
        raw = dense(v, ALLOWED[r], 7 if r == 'axial' else 4)
        tree, Wt = gtrees[r]
        d, idx = tree.query(v, k=8)
        w = 1.0 / np.maximum(d, 0.002) ** 2
        Wm = (Wt[idx] * w[..., None]).sum(1) / w.sum(1, keepdims=True)
        hand = (raw[:, HANDISH].sum(1) > 0.5)[:, None]        # кисть и пальцы — без сглаживания (иначе слипаются)
        W = np.where(hand, raw, Wm)
        order = np.argsort(-W, 1)[:, 4:]
        np.put_along_axis(W, order, 0, 1); W /= np.maximum(W.sum(1, keepdims=True), 1e-9)
        assign(o, RB, W)
    md = o.modifiers.new('rig', 'ARMATURE'); md.object = arm; md.use_deform_preserve_volume = True
    o.parent = arm
    n_obj += 1
import collections
print('REGIONS', collections.Counter(REG.values()))

for m in bpy.data.materials:
    if m.name.startswith('rynji_'):
        m.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
print('RIGGED', n_obj, 'bones', len(arm_d.bones), 'SAVED', out)
