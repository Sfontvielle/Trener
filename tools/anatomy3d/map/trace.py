"""ID-рендер (map_render.py) → векторные контуры для 2D-карты мышц.
Каждый класс: маска → эрозия 1 px (между соседними мышцами остаётся тонкий просвет) → связные области →
внешний контур (маска чуть размыта — без ступенек пикселей) → упрощение → точки в координатах фигуры:
макушка y = 0, стопы y = 400, центр x = 0. Гладкий путь из точек строит приложение (anatomy/geometry.ts).
Запуск: python -I trace.py <render_dir> shape_views.json <out.json> [допуск упрощения, px = 1.5]"""
import json, sys, math
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage import measure

rd, ob_path, out_path = sys.argv[1:4]
TOL = float(sys.argv[4]) if len(sys.argv) > 4 else 1.5
OB = json.load(open(ob_path))
MUS = OB['muscles']
cl = json.load(open(f'{rd}/classes.json'))
meta = json.load(open(f'{rd}/meta.json'))
L = np.array([0, 42, 85, 127, 170, 212, 255])
rgb2i = {tuple(v['rgb']): int(i) for i, v in cl.items()}
key = {int(i): v['key'] for i, v in cl.items()}

W, H = meta['W'], meta['H']
mn, mx = meta['mn'], meta['mx']
px = meta['ortho'] / H                       # метров на пиксель
body_h = mx[2] - mn[2]
U = 400.0 / body_h                           # единиц фигуры на метр
top_px = (meta['center'][2] + meta['ortho'] / 2 - mx[2]) / px   # строка макушки


def to_fig(r, c):
    return ((c - W / 2) * px * U, (r - top_px) * px * U)


def load(name):
    im = np.array(Image.open(f'{rd}/{name}').convert('RGBA')).astype(int)
    snap = L[np.abs(im[..., :3, None] - L).argmin(-1)]
    idx = np.zeros((H, W), np.int32)
    a = im[..., 3] > 0
    flat = snap[a]
    idx[a] = [rgb2i.get(tuple(c), 0) for c in flat]
    return idx


def base_for(can, view):
    shapes = MUS.get(can, {}).get('shapes', [])
    cand = [s for s in shapes if s in OB[view]]
    return cand[0] if cand else (shapes[0] if shapes else can.replace('_', '-'))


def catmull(pts):
    n = len(pts)
    f = lambda v: f'{v:.1f}'.rstrip('0').rstrip('.') if abs(v) >= 0.05 else '0'
    d = [f'M{f(pts[0][0])} {f(pts[0][1])}']
    for i in range(n):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d.append(f'C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}')
    return ''.join(d) + 'Z'


def outline(mask, tol, sigma=1.4):
    padded = np.pad(mask, 4).astype(float)
    # сглаживание ступенек пикселей и мелкой «рвани» сетки атласа: размытие маски, контур по уровню 0,5
    if sigma:
        padded = ndi.gaussian_filter(padded, sigma)
    cs = measure.find_contours(padded, 0.5)
    if not cs:
        return None
    c = max(cs, key=len) - 4
    c = measure.approximate_polygon(c, tolerance=tol)
    if len(c) < 4:
        return None
    pts = [to_fig(r, cc) for r, cc in c[:-1]]
    return pts


def shapes_for(view):
    idx = load(f'{view}.png')
    try:
        over = load(f'{view}_over.png')
        cover = {i for i, k in key.items() if k.startswith('m:external_oblique') or k.startswith('m:internal_oblique')}
        m = (over > 0) & np.isin(idx, list(cover))
        idx[m] = over[m]
    except FileNotFoundError:
        pass
    out = []
    # силуэт — подложка (просветы между мышцами видны её цветом)
    body = idx > 0
    body = ndi.binary_closing(body, structure=np.ones((9, 9)), iterations=1)
    body = ndi.binary_fill_holes(body)
    lab, n = ndi.label(body)
    for j in range(1, n + 1):
        comp = lab == j
        if comp.sum() < 400:
            continue
        pts = outline(comp, 1.0, 1.0)
        if pts:
            out.append({'id': f'body-{j}', 'base': 'body', 'kind': 'skin', 'pts': pts})
    used = {}
    order = {'skin': 0, 'neutral': 1, 'hair': 2, 'tendon': 3, 'muscle': 4, 'line': 5, 'contour': 6}
    for i, k in key.items():
        m = idx == i
        if not m.any():
            continue
        parts = k.split(':')
        t = parts[0]
        side = parts[2] if len(parts) > 2 else ''
        if t == 'm':
            can = parts[1]; kind = 'muscle'; base = base_for(can, view); slug = MUS.get(can, {}).get('slug')
        elif t == 'x':
            kind = 'muscle'; base = 'x-' + parts[1].lower().replace(' muscle', '').replace(' ', '-'); slug = None; can = None
        elif t == 't':
            kind = 'tendon'; base = 't-' + parts[1].lower().replace(' ', '-'); slug = None; can = None
        elif t == 'b':
            kind = 'tendon'; base = 'bone'; slug = None; can = None
        elif t == 'h':
            kind = 'hair'; base = 'hair'; slug = None; can = None
        else:
            kind = 'neutral'; base = 'skin'; slug = None; can = None
        er = ndi.binary_erosion(m, iterations=1) if kind in ('muscle', 'tendon') else m
        lab, n = ndi.label(er, structure=np.ones((3, 3)))
        sizes = ndi.sum(er, lab, range(1, n + 1))
        big = max(sizes) if n else 0
        for j, sz in enumerate(sizes, 1):
            # осколки мышцы за средней линией и в щелях между соседями — не рисуем
            if kind == 'muscle' and sz < 0.05 * big:
                continue
            if sz < (60 if kind == 'muscle' else 300 if base == 'bone' else 40):
                continue
            comp = lab == j
            pts = outline(comp, TOL)
            if not pts:
                continue
            stem = f'{base}{"-" + side if side else ""}'
            used[stem] = used.get(stem, 0) + 1
            sid = f'{stem}-{used[stem]}'
            sh = {'id': sid, 'base': base, 'kind': kind, 'pts': pts, 'area': int(sz)}
            if slug:
                sh['slug'] = slug
            if can:
                sh['muscle'] = can
            out.append(sh)
            # сухожильные перемычки прямой мышцы живота — три линии поперёк
            if can == 'rectus_abdominis':
                rows = np.where(comp.any(1))[0]
                r0, r1 = rows.min(), rows.max()
                for fr in (0.16, 0.34, 0.53):
                    r = int(r0 + (r1 - r0) * fr)
                    cols = np.where(comp[r])[0]
                    if len(cols) < 6:
                        continue
                    a, b = to_fig(r, cols.min() + 1.5), to_fig(r, cols.max() - 1.5)
                    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 1.2)
                    out.append({'id': f'{sid}-x{int(fr * 100)}', 'base': 'line', 'kind': 'line', 'open': [a, mid, b]})
    # контур груди (женская фигура) — линия поверх грудных мышц
    try:
        im = np.array(Image.open(f'{rd}/{view}_contour.png').convert('RGBA'))[..., 3] > 0
        lab, n = ndi.label(im)
        for j in range(1, n + 1):
            comp = lab == j
            if comp.sum() < 400:
                continue
            pts = outline(comp, 1.25)
            if pts:
                out.append({'id': f'breast-{j}', 'base': 'breast', 'kind': 'contour', 'pts': pts})
    except FileNotFoundError:
        pass
    out.sort(key=lambda s: order[s['kind']])
    return out


def fmt(v):
    return float(f'{v:.1f}')


def num(v):
    t = f'{v:.1f}'
    if t.endswith('.0'):
        t = t[:-2]
    return '0' if t in ('-0', '') else t.replace('0.', '.', 1) if t.startswith('0.') else t.replace('-0.', '-.', 1)


res = {}
for view in ('front', 'back'):
    shs = shapes_for(view)
    for s in shs:
        pts = s.pop('pts', None) or s.pop('open')
        if 'open' in s or s['kind'] == 'line':
            s['open'] = 1
        s['p'] = ' '.join(f'{num(x)} {num(y)}' for x, y in pts)
        s.pop('area', None)
    res[view] = shs
    print(view, len(shs), 'shapes', sum(len(s['p']) for s in shs), 'chars')
json.dump(res, open(out_path, 'w'), ensure_ascii=False)
