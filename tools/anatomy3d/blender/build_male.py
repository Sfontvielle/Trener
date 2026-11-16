"""Сборка рабочей мужской модели из атласа Z-Anatomy (CC BY-SA 4.0, мышцы — BodyParts3D, CC BY-SA 2.1 JP).
Оставляет поверхностные мышцы, сухожилия и кожу головы, кистей и стоп; материал — серо-белый с волокнами по мышце.
Запуск: python -I build_male.py -- <Startup.blend> <out.blend>"""
import bpy, sys, re, math
import numpy as np
from mathutils import Matrix, Vector

src, out = sys.argv[-2], sys.argv[-1]
bpy.ops.wm.open_mainfile(filepath=src, load_ui=False, use_scripts=False)

MUSCLES = """Clavicular head of pectoralis major muscle|Sternocostal head of pectoralis major muscle|(Abdominal part of pectoralis major muscle)
Clavicular part of deltoid muscle|Acromial part of deltoid muscle|Scapular spinal part of deltoid muscle
Descending part of trapezius muscle|Transverse part of trapezius muscle|Ascending part of trapezius muscle
Latissimus dorsi muscle|Teres major muscle|Teres minor muscle|Infraspinatus muscle|Supraspinatus muscle|Rhomboid major muscle|Rhomboid minor muscle|Levator scapulae|Serratus anterior muscle
Sternocleidomastoid muscle|Splenius capitis muscle|Scalenus anterior muscle|Scalenus medius muscle|Scalenus posterior muscle|Omohyoid muscle|Sternohyoid muscle
Long head of biceps brachii|Short head of biceps brachii|Brachialis muscle|Coracobrachialis muscle|Long head of triceps brachii|Lateral head of triceps brachii|Medial head of triceps brachii|Anconeus muscle
Brachioradialis muscle|Extensor carpi radialis longus|Extensor carpi radialis brevis|Extensor digitorum|Extensor digiti minimi|Humeral head of extensor carpi ulnaris|Humeral head of flexor carpi ulnaris|Flexor carpi radialis|Palmaris longus muscle|Humero-ulnar head of flexor digitorum superficialis|Superficial head of pronator teres|Abductor pollicis longus|Extensor pollicis brevis|Extensor pollicis longus
Rectus abdominis muscle|External abdominal oblique muscle|Pyramidalis muscle|Iliocostalis lumborum muscle|Iliocostalis thoracis muscle|Longissimus thoracis muscle|Spinalis thoracis muscle
Gluteus maximus muscle|Gluteus medius muscle|Tensor fasciae latae|Sartorius muscle|Rectus femoris muscle|Vastus lateralis muscle|Vastus medialis muscle|Pectineus muscle|Adductor longus|Adductor magnus|Adductor brevis|Gracilis muscle|Psoas major muscle|Iliacus muscle
Long head of biceps femoris|Short head of biceps femoris|Semitendinosus muscle|Semimembranosus muscle
Tibialis anterior muscle|Extensor digitorum longus|Extensor hallucis longus|Fibularis longus muscle|Fibularis brevis muscle|Medial head of gastrocnemius|Lateral head of gastrocnemius|Soleus muscle|Plantaris muscle|Popliteus muscle"""
DEEP = """External intercostal muscles|Internal abdominal oblique muscle|Subscapularis muscle|Gluteus minimus muscle|Vastus intermedius muscle|Tibialis posterior muscle|Flexor digitorum longus|Flexor hallucis longus|Flexor digitorum profundus|Supinator muscle|Flexor pollicis longus|Pronator quadratus muscle|Semispinalis capitis muscle|Longissimus capitis muscle|Splenius colli muscle|Longus colli muscle|Thyrohyoid muscle|Sternothyroid muscle|Quadratus lumborum muscle|Multifidus lumborum muscle|Obturator internus|Piriformis muscle|Quadratus femoris muscle|Serratus posterior inferior muscle|Deep head of pronator teres|Extensor indicis|Fibularis tertius muscle"""
MUSCLES = MUSCLES + "\n" + DEEP
TENDONS = "Calcaneal tendon|Linea alba|Iliotibial tract|Thoracolumbar fascia|Bicipital aponeurosis|Patellar ligament|Plantar aponeurosis|Thyroid cartilage|Cricoid cartilage|Trachea|Thyroid gland|Hyoid bone"
# глаза: склера, радужка, роговица (иначе на лице тёмные провалы)
EYES = {'Sclera': 'eye', 'Iris': 'iris', 'Cornea': 'cornea'}
SKIN_WORDS = ('hand', 'Palm', 'Thenar', 'Hypothenar', 'Nail plate', 'Perionyx', 'Carpal region', 'foot', 'Sole', 'Heel region', 'Hallucial eminence', 'Metatarsal region', 'region of ankle', 'retromalleolar', 'malleolus')
NOT_HEAD = ('neck', 'Carotid', 'triangle', 'Sternocleidomastoid region', 'fossa', 'Suprahyoid', 'Infrahyoid', 'Submental', 'Submandibular', 'Muscular triangle')
BONE_SKIP = ('tooth', 'Teeth', 'incisor', 'canine', 'molar', 'Malleus', 'Incus', 'Stapes', 'cartilage', 'Hyoid',
             # части атласа под CC BY-NC(-SA) (внутреннее ухо Университета Данди, почка) — не берём, чтобы не тянуть некоммерческую лицензию
             'labyrinth', 'Cochlea', 'cochlea', 'semicircular', 'Vestibul', 'Kidney')

def base(name):
    return re.sub(r'\.(l|r|j|g)$', '', name)

want_m = set(re.split(r'[|\n]', MUSCLES))
want_t = set(TENDONS.split('|'))
from mathutils import Vector as _V
def zc(o):
    zs = [(o.matrix_world @ _V(c)).z for c in o.bound_box]
    return (min(zs) + max(zs)) / 2
regions = {o.name for o in bpy.data.collections['9: Regions of human body'].all_objects if o.type == 'MESH'}
skeleton = {o.name for o in bpy.data.collections['1: Skeletal system'].all_objects if o.type == 'MESH'}
keep = {}
for o in bpy.data.objects:
    if o.type != 'MESH' or len(o.data.vertices) == 0 or o.name.endswith('.g'):
        continue
    b = base(o.name)
    kind = 'muscle' if b in want_m else 'tendon' if b in want_t else EYES.get(b) if o.name[-2:] in ('.l', '.r') else None
    if not kind and o.name in regions:
        if b.startswith('Hairs'):
            continue  # голова — бритая, как у классического экорше
        elif any(w in b for w in SKIN_WORDS) or (zc(o) > 1.47 and not any(w in b for w in NOT_HEAD) and not b.startswith('Hairs')):
            kind = 'skin'
    if not kind and o.name in skeleton and not re.search(r'\.(i|j)$', o.name) and not any(w in b for w in BONE_SKIP):
        kind = 'bone'
    if kind:
        keep[o.name] = kind
found = {base(n) for n in keep}
print('MISSING', sorted((want_m | want_t) - found))
import collections as _c
print('KINDS', _c.Counter(keep.values()))

# всё остальное — прочь (экономия памяти и рендера)
for o in list(bpy.data.objects):
    if o.name not in keep:
        bpy.data.objects.remove(o, do_unlink=True)
for c in list(bpy.data.collections):
    bpy.data.collections.remove(c)
scene = bpy.context.scene
for o in bpy.data.objects:
    if o.name not in scene.collection.objects:
        scene.collection.objects.link(o)
bpy.ops.outliner.orphans_purge(do_recursive=True) if hasattr(bpy.ops.outliner, 'orphans_purge') else None

# применяем модификаторы и трансформации, чтобы геометрия была в мире
for o in bpy.data.objects:
    o.hide_viewport = False
    o.hide_render = False
    o.hide_set(False)
for o in bpy.data.objects:
    bpy.context.view_layer.objects.active = o
    for m in list(o.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=m.name)
        except Exception as e:
            o.modifiers.remove(m)
    o.data = o.data.copy() if o.data.users > 1 else o.data
    o.data.transform(o.matrix_world)
    o.matrix_world = Matrix.Identity(4)
    o.parent = None
    for p in o.data.polygons:
        p.use_smooth = True
    # нормали наружу: в атласе часть сеток вывернута (давало красные пятна подповерхностного рассеивания)
    import bmesh
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free()

# направление волокон: главная ось точек мышцы → поворот, который кладёт её на ось X
for o in bpy.data.objects:
    o['rynji_kind'] = keep[o.name]
    o['rynji_id'] = base(o.name)
    o['rynji_side'] = 'L' if o.name.endswith('.l') else 'R' if o.name.endswith('.r') else ''
    if keep[o.name] != 'muscle':
        o['fiber_rot'] = (0.0, 0.0, 0.0)
        continue
    pts = np.array([v.co[:] for v in o.data.vertices])
    c = pts - pts.mean(0)
    w, v = np.linalg.eigh(c.T @ c)
    d = Vector(v[:, -1]).normalized()
    q = d.rotation_difference(Vector((1, 0, 0)))
    o['fiber_rot'] = tuple(q.to_euler('XYZ'))

def material(name, color, rough, ss=0.0, emission=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    outn = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Subsurface Weight'].default_value = ss
    bsdf.inputs['Subsurface Radius'].default_value = (0.004, 0.002, 0.0015)
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission[0], 1)
        bsdf.inputs['Emission Strength'].default_value = emission[1]
    nt.links.new(bsdf.outputs[0], outn.inputs['Surface'])
    return m, nt, bsdf

def fibers(nt, bsdf, strength=0.35, scale=(0.15, 1.0, 1.0), freq=900.0):
    """Волокна: шум, вытянутый вдоль главной оси мышцы (атрибут объекта fiber_rot), → рельеф"""
    tc = nt.nodes.new('ShaderNodeTexCoord')
    attr = nt.nodes.new('ShaderNodeAttribute'); attr.attribute_type = 'OBJECT'; attr.attribute_name = 'fiber_rot'
    rot = nt.nodes.new('ShaderNodeVectorRotate'); rot.rotation_type = 'EULER_XYZ'
    nt.links.new(tc.outputs['Object'], rot.inputs['Vector'])
    nt.links.new(attr.outputs['Vector'], rot.inputs['Rotation'])
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = scale
    nt.links.new(rot.outputs[0], mp.inputs['Vector'])
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = freq; noise.inputs['Detail'].default_value = 2; noise.inputs['Roughness'].default_value = 0.4
    nt.links.new(mp.outputs[0], noise.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = strength; bump.inputs['Distance'].default_value = 0.0006
    nt.links.new(noise.outputs['Fac'], bump.inputs['Height'])
    nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])

M_IDLE, nt, b = material('rynji_muscle', (0.78, 0.78, 0.78), 0.5)
M_PRIM, nt, b = material('rynji_primary', (0.86, 0.22, 0.07), 0.45, emission=((0.9, 0.25, 0.05), 0.12))
M_SEC, nt, b = material('rynji_secondary', (0.95, 0.55, 0.30), 0.48, emission=((0.95, 0.5, 0.2), 0.05))
M_TEND, nt, b = material('rynji_tendon', (0.90, 0.88, 0.85), 0.35)
M_SKIN, nt, b = material('rynji_skin', (0.78, 0.78, 0.78), 0.55)
M_BONE, nt, b = material('rynji_bone', (0.84, 0.82, 0.78), 0.45)
M_HAIR, nt, b = material('rynji_hair', (0.22, 0.22, 0.23), 0.7)
M_EYE, nt, b = material('rynji_eye', (0.86, 0.86, 0.84), 0.3)
M_IRIS, nt, b = material('rynji_iris', (0.20, 0.21, 0.22), 0.4)
M_CORNEA, nt, b = material('rynji_cornea', (1, 1, 1), 0.02)
b.inputs['Transmission Weight'].default_value = 1.0; b.inputs['IOR'].default_value = 1.376
M_FABRIC, nt, b = material('rynji_fabric', (0.075, 0.08, 0.09), 0.75)
for o in bpy.data.objects:
    o.data.materials.clear()
    o.data.materials.append({'muscle': M_IDLE, 'tendon': M_TEND, 'skin': M_SKIN, 'bone': M_BONE, 'hair': M_HAIR, 'eye': M_EYE, 'iris': M_IRIS, 'cornea': M_CORNEA}[keep[o.name]])
# материалы без пользователей Blender не сохраняет — а подсветка и ткань понадобятся позже
for m in bpy.data.materials:
    if m.name.startswith('rynji_'):
        m.use_fake_user = True

# итоговое положение (в атласе у части объектов — дельта-трансформации и связи) → в вершины, трансформации — нулевые:
# иначе любые правки вершин (телосложение, женская фигура, риг) расходятся с тем, что видит рендер
dg = bpy.context.evaluated_depsgraph_get()
for o in bpy.data.objects:
    mw = o.evaluated_get(dg).matrix_world.copy()
    if any(abs(mw[i][j] - (1 if i == j else 0)) > 1e-7 for i in range(4) for j in range(4)):
        o.data.transform(mw)
    o.animation_data_clear(); o.constraints.clear(); o.parent = None
    o.delta_location = (0, 0, 0); o.delta_rotation_euler = (0, 0, 0); o.delta_rotation_quaternion = (1, 0, 0, 0); o.delta_scale = (1, 1, 1)
    o.location = (0, 0, 0); o.rotation_mode = 'XYZ'; o.rotation_euler = (0, 0, 0); o.scale = (1, 1, 1)

# в атласе включены контуры Freestyle — у нас объём даёт свет, а не линии
bpy.context.scene.render.use_freestyle = False
for vl in bpy.context.scene.view_layers:
    vl.use_freestyle = False
bpy.ops.wm.save_as_mainfile(filepath=out, compress=True)
print('SAVED', out, 'objects', len(bpy.data.objects), 'faces', sum(len(o.data.polygons) for o in bpy.data.objects))
