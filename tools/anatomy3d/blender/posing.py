"""Позы по суставным углам из спецификаций упражнений (tools/anatomy3d/exercises/*.json).
Система координат модели: X — влево (сторона .L), Y — назад, Z — вверх; лицо смотрит в −Y.
Каждой кости задаётся поворот в мировой системе относительно положения покоя; из него — matrix_basis Blender."""
import math
import numpy as np
from mathutils import Matrix, Vector

def rot(axis, deg):
    a = np.asarray(axis, float); a = a / np.linalg.norm(a); t = math.radians(deg)
    K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + math.sin(t) * K + (1 - math.cos(t)) * K @ K

def Rx(d): return rot((1, 0, 0), d)
def Rz(d): return rot((0, 0, 1), d)

def unit(v):
    v = np.asarray(v, float); return v / np.linalg.norm(v)

def frame_map(a0, f0, a1, f1):
    """Поворот, переводящий пару (ось a0, направление f0) в (a1, f1)."""
    def basis(a, f):
        a = unit(a); f = unit(np.asarray(f) - np.dot(f, a) * a); return np.stack([a, f, np.cross(a, f)], 1)
    return basis(a1, f1) @ basis(a0, f0).T

def signed_angle(u, v, axis):
    u = unit(u - np.dot(u, axis) * axis); v = unit(v - np.dot(v, axis) * axis)
    return math.degrees(math.atan2(np.dot(np.cross(u, v), axis), np.dot(u, v)))

class Rig:
    def __init__(self, arm):
        self.arm = arm
        self.rest = {b.name: np.array(b.matrix_local) for b in arm.data.bones}
        self.head = {b.name: np.array(b.head_local) for b in arm.data.bones}
        self.tail = {b.name: np.array(b.tail_local) for b in arm.data.bones}
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in arm.data.bones}
        self.order = [b.name for b in arm.data.bones]   # родители раньше детей

    def axis(self, b):
        return unit(self.tail[b] - self.head[b])

    def apply(self, D):
        """D: {кость: 3×3 поворот в мировой системе вокруг её головки}. Кости без D наследуют поворот родителя."""
        X = {}
        for b in self.order:
            p = self.parent[b]
            Xp = X[p] if p else np.eye(4)
            h = self.head[b]; hn = (Xp @ np.r_[h, 1])[:3]
            R = D.get(b, Xp[:3, :3])
            Xb = np.eye(4); Xb[:3, :3] = R; Xb[:3, 3] = hn - R @ h
            X[b] = Xb
        for b in self.order:
            p = self.parent[b]
            Pb = X[b] @ self.rest[b]
            if p:
                Pp = X[p] @ self.rest[p]
                L = np.linalg.inv(np.linalg.inv(self.rest[p]) @ self.rest[b]) @ np.linalg.inv(Pp) @ Pb
            else:
                L = np.linalg.inv(self.rest[b]) @ Pb
            pb = self.arm.pose.bones[b]
            pb.rotation_mode = 'QUATERNION'
            pb.matrix_basis = Matrix(L.tolist())
        self.X = X
        return X

    def point(self, X, b, p):
        """Положение точки p (в покое), движущейся с костью b."""
        return (X[b] @ np.r_[p, 1])[:3]

def pose(rig, spec):
    """spec: lean, hip, knee, thigh_abd, arms: {flex, abd, hflex, mode, elbow, scap_ret, scap_elev, palm}, grip."""
    D = {}
    B = Rx(spec.get('lean', 0))                         # наклон корпуса вперёд вокруг тазобедренных
    D['body'] = B
    up = np.array([0, 0, 1.0]); front = np.array([0, -1.0, 0])
    for s, sg in (('.L', 1), ('.R', -1)):
        a = spec['arms']
        # лопатка и ключица: ретракция (назад) и подъём — поворот вокруг грудино-ключичного сустава
        # плече-лопаточный ритм: при подъёме руки выше 30° ключица с лопаткой поднимаются (≈1/6 угла)
        raise_ = max(0.0, (a['abd'] if a.get('mode') == 'horiz' else max(a.get('flex', 0), a.get('abd', 0))) - 30) / 6
        Dsh = B @ Rz(sg * a.get('scap_ret', 0)) @ rot((0, 1, 0), -sg * (a.get('scap_elev', 0) + raise_))
        D['shoulder' + s] = Dsh
        a0 = rig.axis('upperarm' + s)
        f0 = front - np.dot(front, a0) * a0                   # анатомическая поза: локоть сгибается вперёд
        if a.get('mode') == 'horiz':                          # отведение + горизонтальное сгибание (бабочка)
            al, h = math.radians(a['abd']), math.radians(a['hflex'])
            d = np.array([sg * math.cos(h) * math.sin(al), -math.sin(h) * math.sin(al), -math.cos(al)])
            hint = Rz(-sg * a['hflex']) @ front
        elif a.get('mode') == 'ik':                           # кисть на рукояти: аналитическая ИК двух звеньев
            hb = rig.head['body']; sc0 = rig.head['shoulder' + s]; gh0 = rig.head['upperarm' + s]
            ghp = (B @ (sc0 - hb) + hb) + Dsh @ (gh0 - sc0)
            T = np.array(a['target'][s])
            P = ghp + np.array(a.get('pole', [0.35, 0.1, -1.0])) * np.array([sg, 1, 1])
            la = np.linalg.norm(rig.head['forearm' + s] - gh0); lb = a['reach'][s]
            L = min(np.linalg.norm(T - ghp), la + lb - 1e-4)
            u = unit(T - ghp); w = P - ghp; w = unit(w - np.dot(w, u) * u)
            al = math.acos(np.clip((la ** 2 + L ** 2 - lb ** 2) / (2 * la * L), -1, 1))
            dw = math.cos(al) * u + math.sin(al) * w
            E = ghp + la * dw
            a = dict(a, elbow=180 - math.degrees(math.acos(np.clip((la ** 2 + lb ** 2 - L ** 2) / (2 * la * lb), -1, 1))) - a['elbow0'][s])
            Dua = frame_map(a0, f0, dw, T - E)
            hint = np.linalg.inv(B) @ (T - E)
        else:                                                 # сгибание вперёд + отведение (тяга)
            fl, ab = math.radians(a['flex']), math.radians(a['abd'])
            d = np.array([sg * math.sin(ab), -math.cos(ab) * math.sin(fl), -math.cos(ab) * math.cos(fl)])
            hint = Rx(-a['flex']) @ front
        if a.get('mode') != 'ik':
            Dua = B @ frame_map(a0, f0, d, hint)
        D['upperarm' + s] = Dua
        k = unit(np.cross(a0, f0))                            # ось сгибания локтя в покое
        Dfa = Dua @ rot(k, a.get('elbow', 0))
        fa_axis = Dfa @ rig.axis('forearm' + s)
        # кисть: ладонь — к заданному направлению; предплечье берёт половину скручивания
        n0 = front - np.dot(front, rig.axis('hand' + s)) * rig.axis('hand' + s)
        palm = B @ (np.array(a['palm']) * np.array([sg, 1, 1]) if a.get('palm') is not None else hint)
        tw = signed_angle(Dfa @ n0, palm, fa_axis)
        D['forearm' + s] = rot(fa_axis, tw * 0.5) @ Dfa
        Dh = rot(fa_axis, tw) @ Dfa
        D['hand' + s] = Dh
        # хват: пальцы сгибаются к ладони
        g = spec.get('grip', 0.0)
        for f in range(1, 6):
            n = 2 if f == 1 else 3
            prev = Dh
            fax = rig.axis(f'f{f}_1' + s)
            kf = unit(np.cross(fax, n0)) if f > 1 else unit(np.cross(fax, n0 + 0.8 * sg * np.array([-1.0, 0, 0])))
            curls = [55, 75, 45] if f > 1 else [25, 35]
            for j in range(1, n + 1):
                prev = prev @ rot(kf, g * curls[j - 1])
                D[f'f{f}_{j}' + s] = prev
        # ноги: сидя
        Dth = Rz(sg * spec.get('thigh_abd', 0)) @ Rx(-spec.get('hip', 0))
        D['thigh' + s] = Dth
        Dsn = Dth @ Rx(spec.get('knee', 0))
        D['shin' + s] = Dsn
        D['foot' + s] = Rz(sg * spec.get('thigh_abd', 0) * 0.5) @ Rx(spec.get('ankle', 0))
    return rig.apply(D)
