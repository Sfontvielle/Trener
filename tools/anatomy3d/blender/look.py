"""Материалы экорше без «пластилина»: тень в бороздах между мышцами (ambient occlusion в шейдере), волокна вдоль
главной оси каждой мышцы (рельеф по координатам покоя — не «плывут» при анимации), лёгкий блеск вместо матовой глины."""
import bpy
import numpy as np

def _rest_attr(o):
    """Координаты покоя как атрибут вершин: рельеф волокон привязан к мышце и при деформации ригом."""
    me = o.data
    if 'rest' in me.attributes:
        return
    a = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', a)
    at = me.attributes.new('rest', 'FLOAT_VECTOR', 'POINT'); at.data.foreach_set('vector', a)

def _shader(name, color, rough=0.36, emit=None, fibers=0.0, ao=0.72, coat=0.12):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True; m.use_fake_user = True
    nt = m.node_tree; nt.nodes.clear(); N = nt.nodes; L = nt.links
    out = N.new('ShaderNodeOutputMaterial'); b = N.new('ShaderNodeBsdfPrincipled')
    L.new(b.outputs[0], out.inputs['Surface'])
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat; b.inputs['Coat Roughness'].default_value = 0.3
    # затенение борозд: цвет × (1 − ao·(1 − AO))
    occ = N.new('ShaderNodeAmbientOcclusion'); occ.inside = False; occ.samples = 12
    occ.inputs['Distance'].default_value = 0.03
    mr = N.new('ShaderNodeMapRange'); mr.inputs['To Min'].default_value = 1 - ao; mr.inputs['To Max'].default_value = 1.0
    L.new(occ.outputs['AO'], mr.inputs['Value'])
    rgb = N.new('ShaderNodeRGB'); rgb.outputs[0].default_value = (*color, 1)
    mul = N.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    L.new(rgb.outputs[0], mul.inputs['A']); L.new(mr.outputs['Result'], mul.inputs['B'])
    L.new(mul.outputs['Result'], b.inputs['Base Color'])
    if emit:
        b.inputs['Emission Color'].default_value = (*emit[0], 1); b.inputs['Emission Strength'].default_value = emit[1]
    if fibers > 0:
        rest = N.new('ShaderNodeAttribute'); rest.attribute_type = 'GEOMETRY'; rest.attribute_name = 'rest'
        fr = N.new('ShaderNodeAttribute'); fr.attribute_type = 'OBJECT'; fr.attribute_name = 'fiber_rot'
        vr = N.new('ShaderNodeVectorRotate'); vr.rotation_type = 'EULER_XYZ'
        L.new(rest.outputs['Vector'], vr.inputs['Vector']); L.new(fr.outputs['Vector'], vr.inputs['Rotation'])
        mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (0.08, 1.0, 1.0)   # вытянуто вдоль волокон (ось X)
        L.new(vr.outputs[0], mp.inputs['Vector'])
        nz = N.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 650; nz.inputs['Detail'].default_value = 3
        nz.inputs['Roughness'].default_value = 0.55
        L.new(mp.outputs[0], nz.inputs['Vector'])
        bump = N.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = fibers; bump.inputs['Distance'].default_value = 0.0005
        L.new(nz.outputs['Fac'], bump.inputs['Height']); L.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m

MUSCLE = (0.80, 0.80, 0.79)
PRIMARY = ((0.80, 0.075, 0.015), ((1.0, 0.16, 0.02), 0.25))
SECONDARY = ((0.97, 0.40, 0.10), ((1.0, 0.45, 0.12), 0.08))

def apply(prim=frozenset(), sec=frozenset()):
    """Перестроить материалы модели и назначить подсветку (основные/вспомогательные — базовые имена мышц атласа)."""
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.get('rynji_kind') == 'muscle':
            _rest_attr(o)
    mats = {
        'muscle': _shader('rynji_muscle', MUSCLE, fibers=0.22),
        'primary': _shader('rynji_primary', PRIMARY[0], emit=PRIMARY[1], fibers=0.18, ao=0.6),
        'secondary': _shader('rynji_secondary', SECONDARY[0], emit=SECONDARY[1], fibers=0.18, ao=0.6),
        'tendon': _shader('rynji_tendon', (0.90, 0.89, 0.86), rough=0.28, coat=0.25),
        'skin': _shader('rynji_skin', (0.80, 0.80, 0.79), rough=0.45, coat=0.05, ao=0.55),
        'bone': _shader('rynji_bone', (0.84, 0.82, 0.78), rough=0.45),
    }
    for o in bpy.data.objects:
        k = o.get('rynji_kind')
        if o.type != 'MESH' or k not in ('muscle', 'tendon', 'skin', 'bone'):
            continue
        if k == 'muscle':
            b = o.get('rynji_id')
            m = mats['primary'] if b in prim else mats['secondary'] if b in sec else mats['muscle']
        else:
            m = mats[k]
        o.data.materials.clear(); o.data.materials.append(m)

def light(sc, energy_key=420, size_key=0.9, fill=45, rim=300, world=0.18, look='AgX - Medium High Contrast'):
    """Более жёсткий ключевой свет и слабый заполняющий — объём читается тенями, а не размывается."""
    for o in sc.objects:
        if o.type == 'LIGHT':
            if o.name.startswith('key'):
                o.data.energy = energy_key; o.data.size = size_key
            elif o.name.startswith('fill'):
                o.data.energy = fill
            elif o.name.startswith('rim'):
                o.data.energy = rim
    if sc.world and sc.world.node_tree:
        sc.world.node_tree.nodes['Background'].inputs[1].default_value = world
    sc.view_settings.look = look
