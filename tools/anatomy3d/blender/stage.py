"""Общая сцена рендера: белый фон с мягкой тенью, студийный свет, камера по азимуту/возвышению, подсветка мышц."""
import bpy, math
from mathutils import Vector

def tint(mats, name, color, emit, strength):
    m = mats.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Emission Color'].default_value = (*emit, 1)
    b.inputs['Emission Strength'].default_value = strength
    b.inputs['Roughness'].default_value = 0.42
    mats[name] = m
    return m

def highlight(prim, sec):
    """Основные — насыщенный красно-оранжевый, вспомогательные — светлый оранжевый, остальные — серо-белые."""
    mats = {m.name: m for m in bpy.data.materials}
    tint(mats, 'rynji_primary', (0.78, 0.085, 0.018), (1.0, 0.16, 0.02), 0.22)
    tint(mats, 'rynji_secondary', (0.96, 0.40, 0.11), (1.0, 0.45, 0.12), 0.08)
    for o in bpy.data.objects:
        if o.get('rynji_kind') != 'muscle':
            continue
        b = o.get('rynji_id')
        o.data.materials.clear()
        o.data.materials.append(mats['rynji_primary'] if b in prim else mats['rynji_secondary'] if b in sec else mats['rynji_muscle'])

def area(sc, name, loc, energy, size, target):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.size = size
    o = bpy.data.objects.new(name, d); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o

def setup(sc, W, H, samples, floor_z=0.0):
    world = bpy.data.worlds.new('w'); sc.world = world; world.use_nodes = True
    bg = world.node_tree.nodes['Background']; bg.inputs[0].default_value = (1, 1, 1, 1); bg.inputs[1].default_value = 0.35
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, floor_z))
    bpy.context.object.is_shadow_catcher = True
    sc.render.film_transparent = True
    sc.render.use_freestyle = False
    sc.use_nodes = False; sc.render.use_sequencer = False; sc.render.use_compositing = False
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples; sc.cycles.use_denoising = True
    sc.render.resolution_x = W; sc.render.resolution_y = H
    sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Base Contrast'

def camera(sc, target, azimuth, elevation, dist, lens=60):
    """Азимут 0° — спереди (камера в −Y), 90° — слева модели (+X), 180° — сзади."""
    cam = sc.camera
    if cam is None:
        cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.lens = lens
    a, e = math.radians(azimuth), math.radians(elevation)
    d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
    t = Vector(target)
    cam.location = t + d * dist
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
    # свет — от камеры: ключевой сверху-сбоку, заполняющий, контровой
    for o in [o for o in sc.objects if o.type == 'LIGHT']:
        bpy.data.objects.remove(o, do_unlink=True)
    dh = Vector((d.x, d.y, 0)).normalized(); side = Vector((-dh.y, dh.x, 0))
    area(sc, 'key', t + dh * 3 + side * 2.2 + Vector((0, 0, 2.2)), 260, 2.0, t)
    area(sc, 'fill', t + dh * 3 - side * 2.6 + Vector((0, 0, 0.6)), 90, 3.0, t)
    area(sc, 'rim', t - dh * 2.5 + side * 1.2 + Vector((0, 0, 2.0)), 220, 1.5, t)
    return cam
