"""Облегающая одежда по фигуре: ткань натянута по выпуклой оболочке срезов тела (перекрывает впадины, как настоящая ткань).
male: плавки для позирования; female: спортивный топ с лямками и спортивные трусы.
Запуск: python -I garment.py -- <in.blend> <out.blend> male|female"""
import bpy, sys, math, re
import numpy as np
from scipy.spatial import ConvexHull
from scipy.ndimage import gaussian_filter1d

args = sys.argv[sys.argv.index('--') + 1:]
src, out, sex = args[0], args[1], args[2]
bpy.ops.wm.open_mainfile(filepath=src, load_ui=False, use_scripts=False)

ARM = re.compile(r'brachi|carpi|digiti minimi$|Extensor digitorum$|superficialis|profundus|pollicis|indicis|pronator|Supinator|Anconeus|Palmaris|hand|Palm|Thenar|Hypothenar|Nail|Carpal|Radius|Ulna|Humerus|etacarp|halan|Scaphoid|Lunate|Triquetrum|Pisiform|Trapezi(um|oid)$|Capitate|Hamate|Antebrachial|Perionyx', re.I)

def verts(o):
    a = np.empty(len(o.data.vertices) * 3); o.data.vertices.foreach_get('co', a); return a.reshape(-1, 3)

def body_points(lo, hi, axis=2, xlim=0.24, exclude=ARM):
    """Вершины тела без рук (и без волос/одежды) в полосе координаты axis."""
    pts = []
    for o in bpy.data.objects:
        if o.type != 'MESH' or o.get('rynji_kind') not in ('muscle', 'tendon', 'bone', 'skin'):
            continue
        if exclude.search(o.get('rynji_id', o.name)):
            continue
        a = verts(o)
        a = a[(a[:, axis] > lo) & (a[:, axis] < hi) & (np.abs(a[:, 0]) < xlim)]
        if len(a):
            pts.append(a)
    return np.concatenate(pts)

def bbox(pat):
    a = np.concatenate([verts(o) for o in bpy.data.objects if o.type == 'MESH' and re.search(pat, o.name)])
    return a.min(0), a.max(0)

def dirs(th):
    return np.stack([np.sin(th), -np.cos(th)], 1)

def radial_grid(pts, plane, s_axis, ss, c, th, half=0.003, wrap=True):
    """r(s, θ): расстояние от оси c до выпуклой оболочки среза (плоскость plane, срезы по s_axis)."""
    D = dirs(th)
    R = np.full((len(ss), len(th)), np.nan)
    for i, s in enumerate(ss):
        p = pts[np.abs(pts[:, s_axis] - s) < half][:, plane]
        if len(p) < 8:
            continue
        v = p[ConvexHull(p).vertices]; ed = np.roll(v, -1, 0) - v; oc = v - c
        den = D[:, None, 0] * ed[None, :, 1] - D[:, None, 1] * ed[None, :, 0]
        den = np.where(np.abs(den) < 1e-12, 1e-12, den)
        t = (oc[None, :, 0] * ed[None, :, 1] - oc[None, :, 1] * ed[None, :, 0]) / den
        u = (oc[None, :, 0] * D[:, None, 1] - oc[None, :, 1] * D[:, None, 0]) / den
        ok = (u >= -1e-6) & (u <= 1 + 1e-6) & (t > 0)
        tt = np.where(ok, t, -np.inf).max(1)
        R[i] = np.where(np.isfinite(tt), tt, np.nan)
    for j in range(len(th)):
        col = R[:, j]; good = np.isfinite(col)
        R[:, j] = np.interp(ss, ss[good], col[good]) if good.any() else np.nanmean(R)
    R = gaussian_filter1d(R, 2.0, axis=0)
    R = gaussian_filter1d(R, 1.2, axis=1, mode='wrap' if wrap else 'nearest')
    return R

def point(plane, s_axis, c, th, r, s):
    q = np.zeros(3); q[plane[0]] = c[0] + math.sin(th) * r; q[plane[1]] = c[1] - math.cos(th) * r; q[s_axis] = s
    return q

def surface(name, R, plane, s_axis, ss, c, th, lo, hi, off=0.0028, nv=48, thick=0.0018, wrap=True):
    """Ткань между краями lo(θ)…hi(θ) по оси срезов; нормали наружу, толщина — Solidify."""
    nt = len(th); V = []
    for j in range(nt):
        sv = np.linspace(lo[j], hi[j], nv)
        rr = np.interp(sv, ss, R[:, j]) + off
        V += [point(plane, s_axis, c, th[j], r, s) for s, r in zip(sv, rr)]
    F = []
    for j in range(nt if wrap else nt - 1):
        k = (j + 1) % nt
        for i in range(nv - 1):
            F.append((j * nv + i, k * nv + i, k * nv + i + 1, j * nv + i + 1))
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in V], [], F); me.update()
    # нормали — от оси наружу
    Va = np.array(V); cen = np.zeros(3); cen[plane[0]], cen[plane[1]] = c
    f0 = me.polygons[len(F) // 2]
    pc = Va[list(f0.vertices)].mean(0); radial = pc - cen; radial[s_axis] = 0
    if np.dot(np.array(f0.normal), radial) < 0:
        me.flip_normals()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    sol = o.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = thick; sol.offset = -1.0; sol.use_even_offset = True
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier='thick')
    o['rynji_kind'] = 'fabric'; o['rynji_id'] = name; o['rynji_side'] = ''
    o.data.materials.append(bpy.data.materials['rynji_fabric'])
    return o, Va.reshape(nt, nv, 3)

NT = 192
TH = np.linspace(0, 2 * np.pi, NT, endpoint=False)  # θ=0 — вперёд (−Y), θ=π/2 — влево (+X)
XY = [0, 1]
side = np.abs(np.sin(TH))           # 0 — центр спереди/сзади, 1 — бок
back = (1 - np.cos(TH)) / 2         # 0 — спереди, 1 — сзади

hip_lo, hip_hi = bbox(r'^Hip bone\.(l|r)$')
crotch = hip_lo[2] - 0.012          # чуть ниже лобкового симфиза/седалищных бугров
crest = hip_hi[2]                   # гребни подвздошных костей
c = np.array([0.0, (hip_lo[1] + hip_hi[1]) / 2])
zs = np.arange(crotch - 0.03, crest + 0.03, 0.0025)
R = radial_grid(body_points(zs[0] - 0.01, zs[-1] + 0.01), XY, 2, zs, c, TH)

if sex == 'male':
    ztop = crest - 0.062 + 0.010 * side + 0.010 * back                       # пояс почти горизонтальный, низкая посадка
    zbot = crotch - 0.004 + (ztop - 0.045 - crotch + 0.004) * side ** 0.85    # высокий вырез: на боку полоса ~4,5 см
    surface('Posing trunks', R, XY, 2, zs, c, TH, zbot, ztop, off=0.0045)
else:
    ztop = crest - 0.040 + 0.008 * side + 0.008 * back
    zbot = crotch - 0.004 + (ztop - 0.055 - crotch + 0.004) * side ** 0.9
    surface('Sport briefs', R, XY, 2, zs, c, TH, zbot, ztop, off=0.0045)

    # спортивный топ: из-под груди до выреза; по бокам — до подмышек, сзади — до середины лопаток
    br_lo, br_hi = bbox(r'^Breast\.')
    sc_lo, sc_hi = bbox(r'^Scapula\.')
    hu_lo, hu_hi = bbox(r'^Humerus\.')
    axilla = hu_hi[2] - 0.085
    c2 = np.array([0.0, (br_lo[1] + sc_hi[1]) / 2])
    zb = br_lo[2] - 0.022
    ang = np.degrees(np.minimum(TH, 2 * np.pi - TH))                       # 0…180°, симметрично
    zt = np.interp(ang, [0, 28, 90, 150, 180],
                   [br_hi[2] - 0.004, br_hi[2] + 0.026, axilla - 0.02, sc_lo[2] + 0.45 * (sc_hi[2] - sc_lo[2]), sc_lo[2] + 0.42 * (sc_hi[2] - sc_lo[2])])
    zs2 = np.arange(zb - 0.02, zt.max() + 0.02, 0.0025)
    R2 = radial_grid(body_points(zs2[0] - 0.01, zs2[-1] + 0.01, xlim=0.155), XY, 2, zs2, c2, TH)
    top, TV = surface('Sport top', R2, XY, 2, zs2, c2, TH, np.full(NT, zb), zt, off=0.0045)

    # лямки: срезы по X, оболочка в плоскости (Y, Z) — лямка ложится через надплечье мостиком над ямками
    edge = TV[:, -1, :]                                                     # верхний край топа
    for sgn in (1, -1):
        xs = sgn * 0.083
        w = 0.026
        c3 = np.array([(br_lo[1] + sc_hi[1]) / 2, axilla + 0.02])
        th3 = np.radians(np.linspace(35, 325, 140))
        xr = np.arange(xs - w / 2 - 0.006, xs + w / 2 + 0.006, 0.002)
        sp = body_points(xr[0] - 0.004, xr[-1] + 0.004, axis=0, xlim=0.2)
        sp = sp[sp[:, 2] < hu_hi[2] + 0.085]                                 # только надплечье: голову и шею выше не трогаем
        R3 = radial_grid(sp, [1, 2], 0, xr, c3, th3, half=0.004, wrap=False)
        mid = len(xr) // 2
        zline = c3[1] - np.cos(th3) * R3[mid]
        # концы лямки — чуть ниже верхнего края топа (спереди и сзади) в точке x = xs
        fr = edge[edge[:, 1] < c2[1]]; bk = edge[edge[:, 1] >= c2[1]]
        zf = fr[np.argmin(np.abs(fr[:, 0] - xs)), 2] - 0.012
        zk = bk[np.argmin(np.abs(bk[:, 0] - xs)), 2] - 0.012
        keep = ((th3 > np.pi) & (zline >= zf)) | ((th3 <= np.pi) & (zline >= zk))
        idx = np.where(keep)[0]
        th3 = th3[idx[0]:idx[-1] + 1]; R3 = R3[:, idx[0]:idx[-1] + 1]
        surface(f'Sport top strap.{"l" if sgn > 0 else "r"}', R3, [1, 2], 0, xr, c3, th3,
                np.full(len(th3), xs - w / 2), np.full(len(th3), xs + w / 2), off=0.0058, nv=8, wrap=False)

for m in bpy.data.materials:
    if m.name.startswith('rynji_'):
        m.use_fake_user = True
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
print('GARMENT', sex, 'crotch', round(crotch, 3), 'crest', round(crest, 3), 'SAVED', out)
