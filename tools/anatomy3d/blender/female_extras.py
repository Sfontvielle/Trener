"""Женская фигура: грудь (молочная железа и жир поверх большой грудной — под спортивным топом) и волосы,
вылепленные как у скульптуры: гладкая «шапка» по черепу с линией роста волос и пучок на затылке.
Запуск: python -I female_extras.py -- <in.blend> <out.blend>"""
import bpy, sys, re, math
import numpy as np
import bmesh
from mathutils import Matrix
from scipy.ndimage import gaussian_filter, gaussian_filter1d

args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
bpy.ops.wm.open_mainfile(filepath=src, load_ui=False, use_scripts=False)

def verts(o):
    a = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', a); return a.reshape(-1, 3)

def objs(pat, kind=None):
    return [o for o in bpy.data.objects if o.type == 'MESH' and re.search(pat, o.name) and (kind is None or o.get('rynji_kind') == kind)]

def add_object(name, V, F, kind, mat):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in V], [], [tuple(f) for f in F]); me.update()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    o['rynji_kind'] = kind; o['rynji_id'] = name; o['rynji_side'] = ''
    o.data.materials.append(bpy.data.materials[mat])
    return o

def sphere(n_u=48, n_v=32):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=n_u, v_segments=n_v, radius=1.0)
    V = np.array([v.co[:] for v in bm.verts]); F = [[v.index for v in f.verts] for f in bm.faces]; bm.free()
    return V, F

# --- грудь ---------------------------------------------------------------------------------------
st = np.concatenate([verts(o) for o in objs(r'^(Body of sternum|Manubrium of sternum|Xiphoid process)$')])
zlo, zhi = st[:, 2].min(), st[:, 2].max()
zb = zlo + 0.40 * (zhi - zlo)                       # уровень сосков ≈ 4-е межреберье
front = np.concatenate([verts(o) for o in objs(r'pectoralis major|Serratus anterior|External abdominal oblique|Rectus abdominis', 'muscle')])
ribs = np.concatenate([verts(o) for o in objs(r'(?i)\brib\b', 'bone')] or [front])
band = ribs[np.abs(ribs[:, 2] - zb) < 0.01]
half = np.abs(band[:, 0]).max() if len(band) else 0.13
for sgn in (1, -1):
    xb = sgn * 0.62 * half
    near = front[(np.abs(front[:, 0] - xb) < 0.015) & (np.abs(front[:, 2] - zb) < 0.015)]
    ys = near[:, 1].min()                            # передняя поверхность большой грудной в этой точке
    V, F = sphere()
    a, b, c = 0.062, 0.056, 0.034                     # полуоси: ширина, высота, выступ (спортивная, небольшая)
    lower = V[:, 2] < 0
    V = V * np.array([a, c, b])
    V[:, 1] *= np.where(lower, 1.08, 0.82)            # верхний скат положе, низ полнее
    V[:, 2] *= np.where(lower, 1.0, 1.05)
    rot = Matrix.Rotation(math.radians(-14 * sgn), 3, 'Z')  # смотрит чуть наружу
    V = V @ np.array(rot).T
    V += np.array([xb, ys + 0.010, zb - 0.006])
    add_object(f'Breast.{"l" if sgn > 0 else "r"}', V, F, 'skin', 'rynji_skin')
    print('BREAST', 'L' if sgn > 0 else 'R', np.round([xb, ys, zb], 3))

# --- волосы ----------------------------------------------------------------------------------------
EAR = re.compile(r'auricle|Auricular|Lobule|Concha|auricular groove|notch|tubercle', re.I)
skin = [o for o in bpy.data.objects if o.get('rynji_kind') == 'skin' and not EAR.search(o.name) and not o.name.startswith('Breast')]
pts = np.concatenate([verts(o) for o in skin])
ztop = pts[:, 2].max()
head = pts[pts[:, 2] > ztop - 0.26]
# уши (завиток, мочка — не все части уха помечены в атласе) не должны поднимать «шапку»: сбоку на высоте уха берём череп
cz0 = ztop - 0.105
cy0 = head[head[:, 2] > ztop - 0.12][:, 1].mean()
ear = (np.abs(head[:, 0]) > 0.052) & (head[:, 2] < cz0 + 0.035) & (np.abs(head[:, 1] - cy0 - 0.005) < 0.045)
head = head[~ear]
skull = np.concatenate([verts(o) for o in objs(r'^(Frontal bone|Parietal bone\.(l|r)|Occipital bone|Temporal bone\.(l|r))$', 'bone')])
head = np.concatenate([head, skull + (skull - np.array([0, cy0, cz0])) / np.linalg.norm(skull - np.array([0, cy0, cz0]), axis=1, keepdims=True) * 0.0055])
cz = ztop - 0.105
cy = head[head[:, 2] > ztop - 0.12][:, 1].mean()
C = np.array([0.0, cy, cz])
d = head - C
r = np.linalg.norm(d, axis=1)
al = np.mod(np.arctan2(d[:, 0], -d[:, 1]), 2 * np.pi)       # 0 — лицо (−Y), π/2 — левый бок (+X)
be = np.arcsin(np.clip(d[:, 2] / r, -1, 1))
NA, NB = 160, 72
A = np.linspace(0, 2 * np.pi, NA, endpoint=False)
B = np.linspace(math.radians(-70), math.radians(89), NB)
ia = np.round(al / (2 * np.pi) * NA).astype(int) % NA
ib = np.clip(np.round((be - B[0]) / (B[1] - B[0])).astype(int), 0, NB - 1)
R = np.full((NB, NA), np.nan)
np.fmax.at(R, (ib, ia), r)
for _ in range(60):                                          # дыры — соседями
    if not np.isnan(R).any():
        break
    P = np.pad(R, ((1, 1), (0, 0)), mode='edge')
    nb = np.stack([np.roll(R, 1, 1), np.roll(R, -1, 1), P[:-2], P[2:]])
    fill = np.nanmean(nb, 0)
    R = np.where(np.isnan(R), fill, R)
from scipy.ndimage import maximum_filter
R = maximum_filter(R, size=(3, 3), mode=('nearest', 'wrap'))   # шапка не проваливается в кожу между редкими точками
R = gaussian_filter1d(gaussian_filter1d(R, 1.5, axis=0), 1.5, axis=1, mode='wrap')

HAIRLINE = ([0, 20, 38, 55, 70, 80, 95, 115, 140, 180],     # азимут от лица, °
            [34, 36, 40, 30, 14, 2, 10, -2, -28, -40])      # возвышение линии роста волос, °: лоб, залысины у висков,
                                                            # перед ухом, над ухом, за ухом, затылок
def beta_min(a):
    deg = np.degrees(min(a, 2 * np.pi - a))
    return np.radians(np.interp(deg, *HAIRLINE))

NV = 40
V, F = [], []
for j, a in enumerate(A):
    b0 = beta_min(a)
    bs = np.linspace(b0, B[-1], NV)
    rr = np.array([np.interp(bb, B, R[:, j]) for bb in bs])
    th = (0.0018 + 0.0030 * np.clip(np.sin(bs), 0, 1)) * np.clip((bs - b0) / math.radians(10), 0, 1) ** 0.7
    for bb, rv, t in zip(bs, rr, th):
        rv = rv + t + 0.0006
        V.append(C + rv * np.array([math.sin(a) * math.cos(bb), -math.cos(a) * math.cos(bb), math.sin(bb)]))
for j in range(NA):
    k = (j + 1) % NA
    for i in range(NV - 1):
        F.append([j * NV + i, k * NV + i, k * NV + i + 1, j * NV + i + 1])
top = len(V); V.append(C + np.array([0, 0, R[-1].mean() + 0.008]))
for j in range(NA):
    F.append([j * NV + NV - 1, ((j + 1) % NA) * NV + NV - 1, top])
add_object('Hair cap', np.array(V), F, 'hair', 'rynji_hair')

# пучок на затылке, чуть выше середины
ab, bb = math.pi, math.radians(18)
jb = int(round(ab / (2 * np.pi) * NA)) % NA
rb = np.interp(bb, B, R[:, jb])
cen = C + (rb + 0.016) * np.array([math.sin(ab) * math.cos(bb), -math.cos(ab) * math.cos(bb), math.sin(bb)])
V2, F2 = sphere(40, 24)
V2 = V2 * np.array([0.029, 0.024, 0.026])
V2[:, 1] += 0.004 * (V2[:, 2] / 0.03) ** 2                  # слегка прижат к голове
add_object('Hair bun', V2 + cen, F2, 'hair', 'rynji_hair')

# фактура волос: зачёсанные назад пряди (полосы вдоль сагиттального направления)
m = bpy.data.materials['rynji_hair']
nt = m.node_tree
bsdf = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
bsdf.inputs['Base Color'].default_value = (0.20, 0.19, 0.18, 1)
tc = nt.nodes.new('ShaderNodeTexCoord')
wave = nt.nodes.new('ShaderNodeTexWave'); wave.wave_type = 'BANDS'; wave.bands_direction = 'X'
wave.inputs['Scale'].default_value = 90; wave.inputs['Distortion'].default_value = 5; wave.inputs['Detail'].default_value = 3
nt.links.new(tc.outputs['Object'], wave.inputs['Vector'])
bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35; bump.inputs['Distance'].default_value = 0.0008
nt.links.new(wave.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

for mm in bpy.data.materials:
    if mm.name.startswith('rynji_'):
        mm.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
print('EXTRAS SAVED', out, 'head top', round(ztop, 3))
