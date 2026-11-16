"""Демо-ролик упражнения на ригованной модели: позы по фазам спецификации, тренажёр, свет, камера, рендер кадров.
python -I anim.py -- <rig.blend> <exercise.json> <atlas_map.json> <out_dir> [save.blend]
Переменные: W, H, SAMPLES, FRAMES (по умолчанию из спецификации), ONLY=0,36,… (номера кадров для проверки), CAM=0|1."""
import bpy, sys, os, json, math
import numpy as np
from mathutils import Vector, Matrix
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import posing, stage, look

a = sys.argv[sys.argv.index('--') + 1:]
src, spec_path, map_path, out = a[0], a[1], a[2], a[3]
save = a[4] if len(a) > 4 else None
bpy.ops.wm.open_mainfile(filepath=src, load_ui=False, use_scripts=False)
spec = json.load(open(spec_path)); amap = json.load(open(map_path))
ex = spec['exercise']
sc = bpy.context.scene
W = int(os.environ.get('W', 640)); H = int(os.environ.get('H', 480)); S = int(os.environ.get('SAMPLES', 16))
N = int(os.environ.get('FRAMES', spec['tempo']['frames']))
arm = bpy.data.objects['rig']; rig = posing.Rig(arm)
J = {k: np.array(v) for k, v in json.loads(arm['rynji_joints']).items()}

# --- позы по фазам ------------------------------------------------------------------------------------
SEATED = {'hip': 90, 'knee': 90, 'thigh_abd': 9, 'grip': 0.85}
if ex == 'pec_deck':
    def arms(p):
        return {'mode': 'horiz', 'abd': 80, 'hflex': p['h'], 'elbow': 18, 'scap_ret': p['r']}
    keys = [(0.0, {'h': -15, 'r': 4}), (0.45, {'h': 66, 'r': -3}), (0.55, {'h': 66, 'r': -3}), (1.0, {'h': -15, 'r': 4})]
    base = dict(SEATED, lean=0)
else:
    def arms(p):
        return {'mode': 'sag', 'flex': p['f'], 'abd': p['a'], 'elbow': p['e'], 'scap_ret': p['r'], 'scap_elev': p['v'], 'palm': [-1, 0, 0]}
    keys = [(0.0, {'f': 85, 'a': 20, 'e': 10, 'r': -9, 'v': 2}), (0.12, {'f': 80, 'a': 20, 'e': 12, 'r': 2, 'v': 0}),
            (0.45, {'f': -10, 'a': 25, 'e': 100, 'r': 12, 'v': -4}), (0.55, {'f': -10, 'a': 25, 'e': 100, 'r': 12, 'v': -4}),
            (1.0, {'f': 85, 'a': 20, 'e': 10, 'r': -9, 'v': 2})]
    base = dict(SEATED, lean=12)

def at(t):
    """Плавная интерполяция между фазами (ease-in-out), первый и последний кадр совпадают."""
    for (t0, p0), (t1, p1) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            u = 0 if t1 == t0 else (t - t0) / (t1 - t0)
            u = 0.5 - 0.5 * math.cos(math.pi * u)
            p = {k: p0[k] + (p1[k] - p0[k]) * u for k in p0}
            return dict(base, arms=arms(p))
    return dict(base, arms=arms(keys[-1][1]))

def grip_point(X, s):
    """Центр кулака: середина кисти со смещением к ладони — через него проходит рукоять."""
    w, tip = J['wrist' + s], J['hand_tip' + s]
    ax = (tip - w) / np.linalg.norm(tip - w)
    n0 = np.array([0, -1.0, 0]); n0 = n0 - n0.dot(ax) * ax; n0 /= np.linalg.norm(n0)
    p = w + 0.62 * (tip - w) + 0.028 * n0
    return rig.point(X, 'hand' + s, p)

def grip_rest(s):
    w, tip = J['wrist' + s], J['hand_tip' + s]
    ax = (tip - w) / np.linalg.norm(tip - w)
    n0 = np.array([0, -1.0, 0]); n0 = n0 - n0.dot(ax) * ax; n0 /= np.linalg.norm(n0)
    return w + 0.62 * (tip - w) + 0.028 * n0

def ease_keys(t, vals):
    for (t0, v0), (t1, v1) in zip(vals, vals[1:]):
        if t0 <= t <= t1:
            u = 0 if t1 == t0 else (t - t0) / (t1 - t0)
            return v0 + (v1 - v0) * (0.5 - 0.5 * math.cos(math.pi * u))
    return vals[-1][1]

ARC = None
if ex == 'machine_row':
    # рукоять идёт по дуге рычага (ось впереди-снизу), кисть держит рукоять — рука решается ИК
    gs = grip_point(posing.pose(rig, at(0.0)), '.L'); gp = grip_point(posing.pose(rig, at(0.45)), '.L')
    gp = gp + np.array([0, -0.03, 0.0])
    mid = (gs + gp) / 2; ch = gp - gs; c_len = np.hypot(ch[1], ch[2])
    nrm = np.array([0, ch[2], -ch[1]]) / c_len                 # перпендикуляр к хорде в плоскости Y–Z
    if nrm[2] > 0:
        nrm = -nrm                                             # центр — ниже хорды
    R = 0.85
    C = mid + nrm * math.sqrt(R ** 2 - (c_len / 2) ** 2)
    phi = lambda g: math.atan2(g[2] - C[2], g[1] - C[1])
    p0, p1 = phi(gs), phi(gp)
    hx = (gs[0] + gp[0]) / 2
    ARC = dict(C=C, R=R, p=[(0.0, p0), (0.12, p0 + 0.12 * (p1 - p0)), (0.45, p1), (0.55, p1), (1.0, p0)], x=hx)
    reach = {s: float(np.linalg.norm(grip_rest(s) - J['elbow' + s])) for s in ('.L', '.R')}
    def ang(u, v):
        return math.degrees(math.acos(np.clip(np.dot(u, v) / np.linalg.norm(u) / np.linalg.norm(v), -1, 1)))
    elbow0 = {s: ang(J['elbow' + s] - J['gh' + s], grip_rest(s) - J['elbow' + s]) for s in ('.L', '.R')}
    print('ARC centre', np.round(C, 3), 'R', R, 'deg', round(math.degrees(p0), 1), '→', round(math.degrees(p1), 1))

def handle(t, s):
    ph = ease_keys(t, ARC['p'])
    sg = 1 if s == '.L' else -1
    return np.array([sg * abs(ARC['x']), ARC['C'][1] + ARC['R'] * math.cos(ph), ARC['C'][2] + ARC['R'] * math.sin(ph)])

frames = []
worst = 0.0
for i in range(N):
    t = i / N                                                   # шов цикла: кадр N совпал бы с кадром 0
    sp = at(t)
    if ARC:
        Hd = {s: handle(t, s) for s in ('.L', '.R')}
        tgt = dict(Hd)
        for _ in range(4):                                      # уточнение: ошибка центра кулака → сдвиг цели
            arms_ = dict(sp['arms'], mode='ik', target=tgt, reach=reach, elbow0=elbow0, pole=[0.45, 0.25, -1.0])
            X = posing.pose(rig, dict(sp, arms=arms_))
            g = {s: grip_point(X, s) for s in ('.L', '.R')}
            tgt = {s: tgt[s] + (Hd[s] - g[s]) for s in ('.L', '.R')}
        worst = max(worst, max(np.linalg.norm(Hd[s] - g[s]) for s in ('.L', '.R')))
    else:
        X = posing.pose(rig, sp)
    frames.append({'X': X, 'g': {s: grip_point(X, s) for s in ('.L', '.R')}})
    for pb in arm.pose.bones:
        pb.keyframe_insert('rotation_quaternion', frame=i + 1); pb.keyframe_insert('location', frame=i + 1)
sc.frame_start = 1; sc.frame_end = N; sc.render.fps = spec['tempo']['fps']

# опорные точки тела в позе (по костям рига)
X0 = frames[0]['X']
hipz = J['hip.L'][2]
sole = min(rig.point(X0, 'foot' + s, J['ankle' + s])[2] for s in ('.L', '.R')) - 0.075
seat_top = hipz - 0.095                                         # седалищные бугры ~9–10 см ниже центра тазобедренного
pel_y = J['pelvis'][1]

# --- тренажёр -----------------------------------------------------------------------------------------
def mat(name, color, rough, metal=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m
M_FRAME = mat('eq_frame', (0.10, 0.105, 0.11), 0.35, 0.85)
M_PAD = mat('eq_pad', (0.035, 0.035, 0.038), 0.62)
M_GRIP = mat('eq_grip', (0.02, 0.02, 0.02), 0.8)
M_PLATE = mat('eq_plate', (0.05, 0.05, 0.055), 0.5, 0.3)

def finish(o, m, bevel=0.0):
    o.data.materials.append(m)
    if bevel:
        bv = o.modifiers.new('bv', 'BEVEL'); bv.width = bevel; bv.segments = 3
    for p in o.data.polygons:
        p.use_smooth = True
    o['rynji_kind'] = 'equipment'
    return o

def box(center, size, m, bevel=0.012, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    o = bpy.context.object; o.scale = size
    if rot is not None:
        o.rotation_euler = rot
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, bevel)

def tube(p0, p1, r, m, verts=24):
    p0, p1 = Vector(p0), Vector(p1); d = p1 - p0
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d.length, vertices=verts, location=(p0 + p1) / 2)
    o = bpy.context.object
    o.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    return finish(o, m, r * 0.15)

def pivot(name, loc):
    e = bpy.data.objects.new(name, None); sc.collection.objects.link(e); e.location = loc
    return e

def parent(o, e):
    o.parent = e; o.matrix_parent_inverse = e.matrix_world.inverted()

levers = []
if ex == 'pec_deck':
    back_y = J['gh.L'][1] + 0.12                               # спина к спинке
    box((0, pel_y - 0.02, seat_top - 0.04), (0.44, 0.42, 0.08), M_PAD)
    box((0, back_y + 0.04, seat_top + 0.40), (0.38, 0.07, 0.62), M_PAD)
    box((0, back_y + 0.12, (sole + seat_top) / 2), (0.08, 0.08, seat_top - sole), M_FRAME, 0.006)
    top_z = J['gh.L'][2] + 0.34
    box((0, back_y + 0.12, (seat_top + top_z) / 2), (0.07, 0.07, top_z - seat_top), M_FRAME, 0.006)
    box((0, back_y + 0.12, sole + 0.02), (0.6, 0.7, 0.04), M_FRAME, 0.006)
    for s, sg in (('.L', 1), ('.R', -1)):
        gh = rig.point(X0, 'shoulder' + s, J['gh' + s])
        tube((0, back_y + 0.12, top_z), (gh[0], gh[1], top_z), 0.03, M_FRAME)
        e = pivot('pivot' + s, (gh[0], gh[1], top_z))
        g0 = frames[0]['g'][s]
        rr = np.mean([np.linalg.norm((f['g'][s] - gh)[:2]) for f in frames])
        ang0 = math.atan2(g0[1] - gh[1], g0[0] - gh[0])
        hx, hy = gh[0] + rr * math.cos(ang0), gh[1] + rr * math.sin(ang0)
        gz = np.mean([f['g'][s][2] for f in frames])
        low = gz - 0.15                                          # рычаг ниже кисти: не закрывает грудь в пике
        parts = [tube((gh[0], gh[1], top_z), (gh[0], gh[1], low), 0.026, M_FRAME),
                 tube((gh[0], gh[1], low), (hx, hy, low), 0.022, M_FRAME),
                 tube((hx, hy, low), (hx, hy, gz - 0.09), 0.018, M_FRAME),
                 tube((hx, hy, gz - 0.09), (hx, hy, gz + 0.08), 0.02, M_GRIP)]
        for p in parts:
            parent(p, e)
        levers.append((e, s, 'z', gh, ang0))
else:
    lean = math.radians(base['lean'])
    box((0, pel_y + 0.02, seat_top - 0.04), (0.42, 0.40, 0.08), M_PAD)
    box((0, pel_y + 0.02, (sole + seat_top) / 2 - 0.04), (0.08, 0.08, seat_top - sole - 0.08), M_FRAME, 0.006)
    # упор для груди — перед грудиной, наклонён вместе с корпусом
    st = rig.point(X0, 'body', np.array([0, J['gh.L'][1] - 0.17, J['gh.L'][2] - 0.17]))
    chest = box((0, st[1] - 0.045, st[2]), (0.30, 0.07, 0.34), M_PAD, rot=(-lean, 0, 0))
    box((0, st[1] - 0.16, (sole + st[2]) / 2), (0.07, 0.07, st[2] - sole), M_FRAME, 0.006)
    tube((0, st[1] - 0.16, st[2]), (0, st[1] - 0.08, st[2]), 0.025, M_FRAME)
    foot_y = rig.point(X0, 'foot.L', J['toe.L'])[1]
    box((0, foot_y - 0.02, sole - 0.01), (0.46, 0.34, 0.03), M_FRAME, 0.006)
    box((0, (pel_y + 0.2 + ARC['C'][1]) / 2, sole - 0.025), (0.08, abs(pel_y + 0.2 - ARC['C'][1]), 0.04), M_FRAME, 0.006)
    for s, sg in (('.L', 1), ('.R', -1)):
        G = np.array([f['g'][s] for f in frames])
        # ось рычага — центр окружности, лучше всего проходящей через траекторию рукояти (в плоскости Y–Z)
        cy, cz, rr = ARC['C'][1], ARC['C'][2], ARC['R']
        dd = np.hypot(G[:, 1] - cy, G[:, 2] - cz); err = dd.max() - dd.min()
        print('LEVER', s, 'pivot y,z', round(cy, 3), round(cz, 3), 'r', round(rr, 3), 'max err', round(err, 3))
        px = G[:, 0].mean() + sg * 0.06
        e = pivot('pivot' + s, (px, cy, cz))
        g0 = G[0]; ang0 = math.atan2(g0[2] - cz, g0[1] - cy)
        hy, hz = cy + rr * math.cos(ang0), cz + rr * math.sin(ang0)
        parts = [tube((px, cy, cz), (px, hy, hz), 0.028, M_FRAME),
                 tube((px, hy, hz), (G[:, 0].mean() - sg * 0.02, hy, hz), 0.02, M_FRAME),
                 tube((G[0, 0], hy, hz - 0.075), (G[0, 0], hy, hz + 0.075), 0.019, M_GRIP),
                 tube((px, cy + 0.32 * math.cos(ang0), cz + 0.32 * math.sin(ang0)), (px + sg * 0.16, cy + 0.32 * math.cos(ang0), cz + 0.32 * math.sin(ang0)), 0.025, M_FRAME)]
        bpy.ops.mesh.primitive_cylinder_add(radius=0.17, depth=0.045, vertices=48, location=(px + sg * 0.10, cy + 0.32 * math.cos(ang0), cz + 0.32 * math.sin(ang0)), rotation=(0, math.pi / 2, 0))
        parts.append(finish(bpy.context.object, M_PLATE, 0.005))
        floor = sole - 0.045
        tube((px + sg * 0.05, cy, cz), (px + sg * 0.05, cy, floor + 0.04), 0.035, M_FRAME)
        box((px + sg * 0.05, cy, floor + 0.02), (0.16, 0.30, 0.04), M_FRAME, 0.006)
        box(((px + sg * 0.05) / 2, cy, floor + 0.02), (abs(px) + 0.06, 0.06, 0.04), M_FRAME, 0.006)
        for p in parts:
            parent(p, e)
        levers.append((e, s, 'x', np.array([px, cy, cz]), ang0))

# поворот рычагов по кадрам — рукоять идёт за кистью
for i, f in enumerate(frames):
    for e, s, axis, c, ang0 in levers:
        g = f['g'][s]
        if axis == 'z':
            ang = math.atan2(g[1] - c[1], g[0] - c[0]); e.rotation_euler = (0, 0, ang - ang0)
        else:
            ang = math.atan2(g[2] - c[2], g[1] - c[1]); e.rotation_euler = (ang - ang0, 0, 0)
        e.keyframe_insert('rotation_euler', frame=i + 1)

# --- подсветка, свет, камера, рендер ----------------------------------------------------------------
names = lambda ids: {n for i in ids for n in amap.get(i, [])}
look.apply(names(spec['highlight']['primary']), names(spec['highlight']['secondary']))
stage.setup(sc, W, H, S, floor_z=sole - 0.045)
cam = spec['cameras'][int(os.environ.get('CAM', 0))]
target = (0, J['pelvis'][1] - 0.05, (J['gh.L'][2] + sole) / 2 + 0.12) if ex == 'pec_deck' else (0, J['pelvis'][1] - 0.05, (J['gh.L'][2] + sole) / 2 + 0.10)
stage.camera(sc, target, cam['azimuth_deg'], cam['elevation_deg'], float(os.environ.get('DIST', 3.9)), lens=50)
look.light(sc)                                                   # жёсткий ключевой свет — объём тенями, без «пластилина»
only = [int(x) for x in os.environ.get('ONLY', '').split(',') if x != '']
if save:
    bpy.ops.wm.save_as_mainfile(filepath=save, compress=True)
os.makedirs(out, exist_ok=True)
for i in (only or range(N)):
    sc.frame_set(i + 1)
    sc.render.filepath = os.path.join(out, f'{i:03d}.png')
    bpy.ops.render.render(write_still=True)
    print('FRAME', i, flush=True)
print('DONE', ex, N, 'grip error max', round(worst, 4))
