"""ID-рендер фигуры для 2D-карты мышц: ортографически спереди и сзади. Каждый класс — мышца канонического id
(atlas_map.json) со своей стороной, прочие мышцы атласа, сухожилия, кожа головы/кистей/стоп, кости, волосы —
своим плоским цветом (эмиссия, 1 сэмпл, фильтр пикселя ~0: без смешивания цветов на границах).
Одежда не рендерится — карта показывает мышцы.
Запуск: python -I map_render.py -- <in.blend> <atlas_map.json> <out_dir> [H=2400]
Выход: <out_dir>/front.png, back.png, classes.json (индекс → класс, цвет), meta.json (масштаб)."""
import bpy, sys, json, os, re
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
src, amap_path, out = args[0], args[1], args[2]
H = int(args[3]) if len(args) > 3 else 2400
os.makedirs(out, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=src, load_ui=False, use_scripts=False)
sc = bpy.context.scene

amap = json.load(open(amap_path))
inv = {}
for can, names in amap.items():
    if can == '_':
        continue
    for n in names:
        inv[n] = can

L = [0, 42, 85, 127, 170, 212, 255]
def color(i):
    return (L[(i // 49) % 7], L[(i // 7) % 7], L[i % 7])

def lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

# Широкие фасции атласа закрывают мышцы целиком (подвздошно-большеберцовый тракт — латеральную широкую) — на карте их нет
HIDE = {'Iliotibial tract'}
# Мышцы, которые на карте рисуются поверх апоневроза: прямая мышца живота под листком наружной косой
OVERLAY = {'front': ['Rectus abdominis muscle']}

def basename(o):
    m = re.match(r'^(.*)\.(l|r|j)$', o.name)
    return m.group(1) if m else o.name

# Грудь (женская модель) на карте — только контур поверх грудных мышц: в основном проходе её нет, контур — отдельным проходом
CONTOUR = {'front': ['Breast']}

def key_of(o):
    kind = o.get('rynji_kind')
    if basename(o) in HIDE or basename(o) in CONTOUR['front']:
        return None
    m = re.match(r'^(.*)\.(l|r|j)$', o.name)
    base, side = (m.group(1), m.group(2)) if m else (o.name, '')
    side = side if side in ('l', 'r') else ''
    if kind == 'muscle':
        can = inv.get(base)
        return f'm:{can}:{side}' if can else f'x:{base}:{side}'
    if kind == 'tendon':
        return f't:{base}:{side}'
    if kind == 'hair':
        return 'h'
    if kind == 'fabric':
        return None
    if kind == 'bone':
        return 'b'
    return 's'

classes, mats = {}, {}
objs = [o for o in bpy.data.objects if o.type == 'MESH']
for o in objs:
    k = key_of(o)
    if k is None or o.hide_render:
        o.hide_render = True
        continue
    if k not in classes:
        idx = len(classes) + 1
        if idx >= 343:
            raise SystemExit('too many classes')
        classes[k] = idx
        mat = bpy.data.materials.new(f'id_{idx}')
        mat.use_nodes = True
        nt = mat.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        em = nt.nodes.new('ShaderNodeEmission')
        r, g, b = color(idx)
        em.inputs[0].default_value = (lin(r), lin(g), lin(b), 1)
        em.inputs[1].default_value = 1.0
        outn = nt.nodes.new('ShaderNodeOutputMaterial')
        nt.links.new(em.outputs[0], outn.inputs[0])
        mats[k] = mat
    if len(o.material_slots) == 0:
        o.data.materials.append(None)
    for slot in o.material_slots:
        slot.link = 'OBJECT'
        slot.material = mats[k]

vis = [o for o in objs if not o.hide_render]
mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
for o in vis:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
size = mx - mn
pad = 0.02
hgt = size.z * (1 + 2 * pad)
wid = size.x * (1 + 2 * pad)
W = int(round(H * wid / hgt))
W += W % 2

for o in [o for o in sc.objects if o.type == 'LIGHT']:
    o.hide_render = True
world = bpy.data.worlds.new('id'); sc.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs[1].default_value = 0.0
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 1
sc.cycles.use_denoising = False; sc.cycles.use_adaptive_sampling = False
sc.cycles.max_bounces = 0; sc.cycles.filter_width = 0.01
sc.render.film_transparent = True
sc.render.resolution_x = W; sc.render.resolution_y = H; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'; sc.view_settings.exposure = 0.0; sc.view_settings.gamma = 1.0
sc.render.image_settings.file_format = 'PNG'; sc.render.image_settings.color_mode = 'RGBA'; sc.render.image_settings.color_depth = '8'
sc.render.use_compositing = False; sc.render.use_sequencer = False
cam = bpy.data.objects.new('mapcam', bpy.data.cameras.new('mapcam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'; cam.data.ortho_scale = max(hgt, wid); cam.data.clip_end = 100
center = (mn + mx) / 2
for view, dy in (('front', -1), ('back', 1)):
    cam.location = Vector((center.x, center.y + dy * 10, center.z))
    cam.rotation_euler = (Vector((center.x, center.y, center.z)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(out, f'{view}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', view, W, H)

breasts = [o for o in objs if basename(o) in CONTOUR['front']]
if breasts:
    for o in vis:
        o.hide_render = True
    for o in breasts:
        o.hide_render = False
        if len(o.material_slots) == 0:
            o.data.materials.append(None)
        for slot in o.material_slots:
            slot.link = 'OBJECT'; slot.material = list(mats.values())[0]
    cam.location = Vector((center.x, center.y - 10, center.z))
    cam.rotation_euler = (Vector((center.x, center.y, center.z)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(out, 'front_contour.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED front contour')
    for o in breasts:
        o.hide_render = True
    for o in vis:
        o.hide_render = False

for view, names in OVERLAY.items():
    keep = [o for o in vis if basename(o) in names]
    for o in vis:
        o.hide_render = o not in keep
    dy = -1 if view == 'front' else 1
    cam.location = Vector((center.x, center.y + dy * 10, center.z))
    cam.rotation_euler = (Vector((center.x, center.y, center.z)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(out, f'{view}_over.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', view, 'overlay')
    for o in vis:
        o.hide_render = False

json.dump({str(i): {'key': k, 'rgb': color(i)} for k, i in classes.items()}, open(os.path.join(out, 'classes.json'), 'w'), ensure_ascii=False, indent=0)
json.dump({'W': W, 'H': H, 'mn': list(mn), 'mx': list(mx), 'ortho': max(hgt, wid), 'center': list(center)}, open(os.path.join(out, 'meta.json'), 'w'))
print('CLASSES', len(classes))
