"""Рендер ракурсов модели: python -I render_views.py -- <model.blend> <out_dir> <views> [primary] [secondary]
views: front,back,q34,q34b,side; primary/secondary — базовые имена мышц через ';' (например «Latissimus dorsi muscle»)."""
import bpy, sys, math, os
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
src, out_dir, views = args[0], args[1], args[2].split(',')
prim = set(filter(None, (args[3] if len(args) > 3 else '').split(';')))
sec = set(filter(None, (args[4] if len(args) > 4 else '').split(';')))
W = int(os.environ.get('W', 720)); H = int(os.environ.get('H', 1280)); S = int(os.environ.get('SAMPLES', 64))
bpy.ops.wm.open_mainfile(filepath=src, load_ui=False, use_scripts=False)
sc = bpy.context.scene

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import look
look.apply(prim, sec)                         # материалы экорше: тень в бороздах, волокна, лёгкий блеск

# рамка фигуры
mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
for o in bpy.data.objects:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
center = (mn + mx) / 2
height = mx.z - mn.z
print('BBOX', tuple(round(x, 3) for x in mn), tuple(round(x, 3) for x in mx))

# мир — белый, пол — ловец тени
world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs[0].default_value = (1, 1, 1, 1); bg.inputs[1].default_value = 0.35
bpy.ops.mesh.primitive_plane_add(size=20, location=(center.x, center.y, mn.z))
floor = bpy.context.object; floor.is_shadow_catcher = True
sc.render.film_transparent = True  # фон — белый при сборке кадра, тень от ловца тени
sc.render.use_freestyle = False
# в файле атласа включены свой композитинг и видеоредактор — они подменяют кадр
sc.use_nodes = False
sc.render.use_sequencer = False
sc.render.use_compositing = False
sc.render.image_settings.color_mode = 'RGBA'

def area(name, loc, energy, size, target):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.size = size
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.location = loc
    dirv = (Vector(target) - Vector(loc)).normalized()
    o.rotation_euler = dirv.to_track_quat('-Z', 'Y').to_euler()
    return o

cam_d = bpy.data.cameras.new('cam'); cam_d.lens = 85
cam = bpy.data.objects.new('cam', cam_d); sc.collection.objects.link(cam); sc.camera = cam
sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = S; sc.cycles.use_denoising = True
sc.render.resolution_x = W; sc.render.resolution_y = H
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Base Contrast'; sc.view_settings.exposure = 0.0

# лицевая сторона: BodyParts3D смотрит в -Y (проверяется по рендеру)
FRONT = Vector((0, -1, 0))
VIEWS = {'front': 0, 'back': 180, 'q34': -35, 'q34b': 145, 'side': -90}
dist = height * 3.2
lights = []
for v in views:
    for l in lights: bpy.data.objects.remove(l, do_unlink=True)
    ang = math.radians(VIEWS[v])
    dirv = Vector((FRONT.x * math.cos(ang) - FRONT.y * math.sin(ang), FRONT.x * math.sin(ang) + FRONT.y * math.cos(ang), 0))
    tgt = Vector((center.x, center.y, mn.z + height * 0.52))
    cam.location = tgt + dirv * dist + Vector((0, 0, height * 0.05))
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    side = Vector((-dirv.y, dirv.x, 0))
    lights = [
        area('key', tgt + dirv * 3 + side * 2.2 + Vector((0, 0, 2.2)), 260, 2.0, tgt),
        area('fill', tgt + dirv * 3 - side * 2.6 + Vector((0, 0, 0.6)), 90, 3.0, tgt),
        area('rim', tgt - dirv * 2.5 + side * 1.2 + Vector((0, 0, 2.0)), 220, 1.5, tgt),
    ]
    look.light(sc)
    sc.render.filepath = os.path.join(out_dir, f'{v}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', v)
