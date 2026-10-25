/**
 * RYNJI — тело атлета как единая гладкая поверхность (signed distance field).
 *
 * Тело — набор анатомических форм (эллипсоиды и скруглённые конусы), привязанных к суставам скелета.
 * Формы объединяются «мягким минимумом»: крупные — с широким сглаживанием (естественные переходы),
 * мышечные брюшки — с узким (видны рельеф и борозды между мышцами). На каждый кадр поверхность извлекается
 * сеткой (surface nets), нормали берутся из градиента поля, цвет вершины — от ближайшей мышечной группы.
 * Вся геометрия собственная — без сторонних моделей и лицензий.
 */
import * as THREE from 'three';

export const GROUPS = ['chest', 'deltoids', 'biceps', 'triceps', 'forearm', 'abs', 'obliques', 'upper-back', 'trapezius', 'lower-back', 'gluteal', 'quadriceps', 'hamstring', 'adductors', 'calves'];
const SKIN = 'skin';
const SHORTS = 'shorts';
const SHOE = 'shoe';

// ---------- скелет ----------

export function createSkeleton() {
  const joints = {};
  const J = (name, parent, x, y, z) => {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.set(x, y, z);
    if (parent) parent.add(o);
    joints[name] = o;
    return o;
  };
  const root = J('root', null, 0, 0, 0);
  const pelvis = J('pelvis', root, 0, 0.96, 0);
  const spine = J('spine', pelvis, 0, 0.1, -0.005);
  const chest = J('chest', spine, 0, 0.2, 0);
  const neck = J('neck', chest, 0, 0.215, -0.012);
  J('head', neck, 0, 0.085, 0.01);
  for (const [s, x] of [['L', 1], ['R', -1]]) {
    const sh = J(`shoulder${s}`, chest, x * 0.205, 0.198, -0.014);
    const el = J(`elbow${s}`, sh, 0, -0.295, 0);
    const wr = J(`wrist${s}`, el, 0, -0.255, 0);
    J(`hand${s}`, wr, 0, 0, 0);
    const hip = J(`hip${s}`, pelvis, x * 0.09, -0.07, 0);
    const kn = J(`knee${s}`, hip, 0, -0.43, 0);
    const an = J(`ankle${s}`, kn, 0, -0.42, 0);
    J(`foot${s}`, an, 0, 0, 0);
  }
  return { root, joints };
}

// ---------- анатомия: формы по суставам ----------
// e — эллипсоид: [сустав, центр, радиусы, поворот(эйлер), группа, k]; c — скруглённый конус: [сустав, a, b, r1, r2, группа, k]

const E = (joint, c, r, rot, group, k) => ({ t: 'e', joint, c, r, rot: rot || [0, 0, 0], group, k });
const C = (joint, a, b, r1, r2, group, k) => ({ t: 'c', joint, a, b, r1, r2, group, k });

/**
 * Телосложение (для иллюстраций целей): mass — объём мышц, lean — толщина «подкожного» слоя кожи туловища и бёдер
 * (меньше — рельефнее), def — сглаживание между мышцами (меньше — чётче борозды). По умолчанию — атлет сцен техники.
 */
export function anatomy({ mass = 1, lean = 1, def = 1 } = {}) {
  const P = [];
  // Таз (шорты) и ягодицы
  P.push(E('pelvis', [0, 0.03, -0.005], [0.148, 0.115, 0.104], [0, 0, 0], SKIN, 0.05));
  P.push(E('pelvis', [0, -0.04, 0.035], [0.11, 0.07, 0.08], [0, 0, 0], SKIN, 0.05));
  for (const s of [1, -1]) P.push(E('pelvis', [s * 0.068, -0.03, -0.072], [0.083, 0.095, 0.07], [0.25, s * 0.15, s * -0.1], 'gluteal', 0.03));
  // Талия
  P.push(E('spine', [0, 0.08, 0.0], [0.125, 0.17, 0.09], [0, 0, 0], SKIN, 0.06));
  // Пресс: три ряда кубиков + нижняя часть
  for (let r = 0; r < 3; r++) for (const s of [1, -1]) P.push(E('spine', [s * 0.035, 0.175 - r * 0.066, 0.083 - r * 0.002], [0.033, 0.03, 0.019], [0.05, 0, 0], 'abs', 0.012));
  P.push(E('spine', [0, -0.035, 0.083], [0.058, 0.045, 0.02], [0, 0, 0], 'abs', 0.02));
  // Косые
  for (const s of [1, -1]) P.push(E('spine', [s * 0.1, 0.06, 0.03], [0.035, 0.1, 0.055], [0, s * 0.3, s * 0.08], 'obliques', 0.03));
  // Разгибатели спины
  for (const s of [1, -1]) P.push(C('spine', [s * 0.034, -0.04, -0.075], [s * 0.036, 0.2, -0.082], 0.03, 0.026, 'lower-back', 0.02));
  // Грудная клетка
  P.push(E('chest', [0, 0.115, 0.0], [0.152, 0.17, 0.104], [0, 0, 0], SKIN, 0.06));
  // Грудные: верх и низ, сходятся к плечу
  for (const s of [1, -1]) {
    P.push(E('chest', [s * 0.068, 0.15, 0.078], [0.082, 0.062, 0.04], [-0.1, s * 0.25, s * -0.22], 'chest', 0.016));
    P.push(E('chest', [s * 0.13, 0.18, 0.05], [0.045, 0.04, 0.035], [0, s * 0.5, s * -0.5], 'chest', 0.02));
  }
  // Широчайшие — «крылья» к подмышке
  for (const s of [1, -1]) {
    // широчайшие: верхняя часть у подмышки и нижняя — к пояснице (V-силуэт)
    P.push(E('chest', [s * 0.118, 0.125, -0.055], [0.042, 0.095, 0.034], [0.05, s * -0.7, s * 0.32], 'upper-back', 0.035));
    P.push(E('chest', [s * 0.088, 0.02, -0.07], [0.05, 0.105, 0.026], [0.12, s * -0.45, s * 0.12], 'upper-back', 0.035));
    // подостная / большая круглая — на лопатке
    P.push(E('chest', [s * 0.085, 0.165, -0.092], [0.052, 0.055, 0.022], [0.25, s * -0.3, s * 0.25], 'upper-back', 0.02));
  }
  // Ромбовидные / середина спины
  for (const s of [1, -1]) P.push(E('chest', [s * 0.045, 0.13, -0.094], [0.038, 0.07, 0.02], [0.1, 0, s * 0.35], 'upper-back', 0.02));
  // Трапеции: верх — от шеи к плечу, середина — по позвоночнику
  for (const s of [1, -1]) P.push(C('chest', [s * 0.03, 0.27, -0.03], [s * 0.15, 0.215, -0.02], 0.035, 0.024, 'trapezius', 0.02));
  P.push(E('chest', [0, 0.205, -0.08], [0.065, 0.06, 0.026], [0.3, 0, 0], 'trapezius', 0.025));
  P.push(E('chest', [0, 0.085, -0.098], [0.035, 0.095, 0.018], [0.0, 0, 0], 'trapezius', 0.02));
  // Шея и голова
  P.push(C('neck', [0, -0.03, 0], [0, 0.1, 0.008], 0.054, 0.05, SKIN, 0.04));
  for (const s of [1, -1]) P.push(C('neck', [s * 0.018, -0.01, 0.04], [s * 0.04, 0.085, 0.0], 0.015, 0.013, SKIN, 0.02));
  P.push(E('head', [0, 0.085, -0.004], [0.086, 0.108, 0.098], [0, 0, 0], SKIN, 0.03));
  P.push(E('head', [0, 0.015, 0.032], [0.063, 0.052, 0.07], [0.2, 0, 0], SKIN, 0.035));
  P.push(E('head', [0, 0.06, 0.092], [0.012, 0.022, 0.014], [0.25, 0, 0], SKIN, 0.012));
  // Руки
  for (const [sd, s] of [['L', 1], ['R', -1]]) {
    const sh = `shoulder${sd}`, el = `elbow${sd}`, ha = `hand${sd}`;
    P.push(E(sh, [s * 0.02, -0.045, 0.032], [0.042, 0.085, 0.04], [0.15, 0, s * 0.2], 'deltoids', 0.02));
    P.push(E(sh, [s * 0.03, -0.04, 0.0], [0.042, 0.09, 0.045], [0, 0, s * 0.22], 'deltoids', 0.02));
    P.push(E(sh, [s * 0.018, -0.045, -0.034], [0.04, 0.082, 0.038], [-0.15, 0, s * 0.18], 'deltoids', 0.02));
    P.push(C(sh, [0, -0.02, 0], [0, -0.28, 0], 0.04, 0.034, SKIN, 0.03));
    P.push(E(sh, [0, -0.158, 0.026], [0.036, 0.088, 0.036], [0.05, 0, 0], 'biceps', 0.016));
    P.push(E(sh, [s * 0.004, -0.13, -0.026], [0.041, 0.102, 0.038], [-0.05, 0, 0], 'triceps', 0.016));
    P.push(C(el, [0, 0, 0.004], [0, -0.235, 0], 0.043, 0.025, 'forearm', 0.025));
    P.push(E(el, [s * 0.014, -0.065, 0.012], [0.03, 0.075, 0.029], [0, 0, s * 0.12], 'forearm', 0.02));
    P.push(E(ha, [0, -0.05, 0.004], [0.041, 0.057, 0.029], [0, 0, 0], SKIN, 0.02));
    P.push(C(ha, [s * -0.03, -0.02, 0.015], [s * -0.035, -0.07, 0.03], 0.012, 0.01, SKIN, 0.012));
  }
  // Ноги
  for (const [sd, s] of [['L', 1], ['R', -1]]) {
    const hip = `hip${sd}`, kn = `knee${sd}`;
    P.push(C(hip, [0, 0.03, 0], [0, -0.18, 0.005], 0.09, 0.075, SKIN, 0.04));
    P.push(C(hip, [0, -0.1, 0.004], [0, -0.4, 0.006], 0.07, 0.045, SKIN, 0.04));
    P.push(E(hip, [0, -0.21, 0.05], [0.042, 0.155, 0.04], [0.02, 0, 0], 'quadriceps', 0.016));
    P.push(E(hip, [s * 0.048, -0.215, 0.012], [0.046, 0.165, 0.046], [0, 0, s * -0.04], 'quadriceps', 0.016));
    P.push(E(hip, [s * -0.036, -0.33, 0.032], [0.04, 0.082, 0.04], [0, 0, s * 0.15], 'quadriceps', 0.016));
    P.push(E(hip, [s * -0.05, -0.15, -0.004], [0.04, 0.13, 0.05], [0, 0, s * -0.1], 'adductors', 0.02));
    P.push(E(hip, [s * 0.022, -0.225, -0.045], [0.042, 0.158, 0.042], [0, 0, 0], 'hamstring', 0.016));
    P.push(E(hip, [s * -0.026, -0.235, -0.04], [0.036, 0.145, 0.037], [0, 0, 0], 'hamstring', 0.016));
    P.push(E(kn, [0, 0.0, 0.028], [0.04, 0.045, 0.032], [0, 0, 0], SKIN, 0.02));
    P.push(C(kn, [0, -0.02, 0], [0, -0.4, 0.004], 0.046, 0.03, SKIN, 0.035));
    for (const k of [1, -1]) P.push(E(kn, [k * 0.02, -0.12, -0.032], [0.032, 0.1, 0.035], [0.08, 0, 0], 'calves', 0.016));
    P.push(E(kn, [s * 0.012, -0.15, 0.03], [0.022, 0.11, 0.022], [0, 0, 0], SKIN, 0.015));
    // стопа в кроссовке
    const ft = `foot${sd}`;
    P.push(C(ft, [0, 0.04, 0], [0, -0.035, -0.01], 0.034, 0.042, SHOE, 0.02));
    P.push(E(ft, [0, -0.055, 0.06], [0.047, 0.035, 0.125], [0.05, 0, 0], SHOE, 0.02));
  }
  if (mass === 1 && lean === 1 && def === 1) return P;
  const TRUNK = ['pelvis', 'spine', 'chest', 'hipL', 'hipR'];
  return P.map((p) => {
    const muscle = GROUPS.includes(p.group);
    const f = muscle ? mass : p.group === SKIN && TRUNK.includes(p.joint) ? lean : 1;
    const k = muscle ? p.k * def : p.k;
    return p.t === 'e' ? { ...p, r: p.r.map((x) => x * f), k } : { ...p, r1: p.r1 * f, r2: p.r2 * f, k };
  });
}

/** Объёмы шорт: всё, что внутри, красится тканью (кроме подсвеченных мышц — их видно сквозь шорты) */
export function clothVolumes() {
  const V = [E('pelvis', [0, -0.005, -0.005], [0.172, 0.13, 0.13], [0, 0, 0], SHORTS, 0)];
  for (const sd of ['L', 'R']) V.push(C(`hip${sd}`, [0, 0.04, 0], [0, -0.17, 0.004], 0.125, 0.11, SHORTS, 0));
  return V;
}

// ---------- SDF примитивов ----------

const v = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

/** Подготовка форм к кадру: перевод в мировые координаты по текущей позе скелета */
export function preparePrims(prims, joints) {
  return prims.map((p) => {
    const j = joints[p.joint];
    j.updateWorldMatrix(true, false);
    if (p.t === 'c') {
      const a = new THREE.Vector3(...p.a).applyMatrix4(j.matrixWorld);
      const b = new THREE.Vector3(...p.b).applyMatrix4(j.matrixWorld);
      const r = Math.max(p.r1, p.r2) + 0.08;
      return { ...p, A: a, B: b, min: [Math.min(a.x, b.x) - r, Math.min(a.y, b.y) - r, Math.min(a.z, b.z) - r], max: [Math.max(a.x, b.x) + r, Math.max(a.y, b.y) + r, Math.max(a.z, b.z) + r] };
    }
    // эллипсоид: мир → локальные оси эллипсоида
    tmpQ.setFromEuler(tmpE.set(...p.rot));
    tmpM.compose(new THREE.Vector3(...p.c), tmpQ, new THREE.Vector3(1, 1, 1));
    const world = new THREE.Matrix4().multiplyMatrices(j.matrixWorld, tmpM);
    const inv = world.clone().invert();
    const center = new THREE.Vector3().setFromMatrixPosition(world);
    const r = Math.max(...p.r) + 0.08;
    return { ...p, inv: inv.elements.slice(), min: [center.x - r, center.y - r, center.z - r], max: [center.x + r, center.y + r, center.z + r] };
  });
}

/** Расстояние до одной формы */
export function primDist(p, x, y, z) {
  if (p.t === 'c') return roundCone(x, y, z, p.A, p.B, p.r1, p.r2);
  const m = p.inv;
  const lx = m[0] * x + m[4] * y + m[8] * z + m[12];
  const ly = m[1] * x + m[5] * y + m[9] * z + m[13];
  const lz = m[2] * x + m[6] * y + m[10] * z + m[14];
  const [rx, ry, rz] = p.r;
  const k0 = Math.hypot(lx / rx, ly / ry, lz / rz);
  const k1 = Math.hypot(lx / (rx * rx), ly / (ry * ry), lz / (rz * rz));
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

// Скруглённый конус (Inigo Quilez, sdRoundCone для двух точек)
function roundCone(px, py, pz, a, b, r1, r2) {
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = px - a.x, pay = py - a.y, paz = pz - a.z;
  const yv = pax * bax + pay * bay + paz * baz;
  const zv = yv - l2;
  const qx = pax * l2 - bax * yv, qy = pay * l2 - bay * yv, qz = paz * l2 - baz * yv;
  const x2 = qx * qx + qy * qy + qz * qz;
  const y2 = yv * yv * l2;
  const z2 = zv * zv * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zv) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(yv) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + yv * rr) * il2 - r1;
}

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

export function sdf(prims, x, y, z) {
  let d = 1;
  for (const p of prims) {
    if (x < p.min[0] || y < p.min[1] || z < p.min[2] || x > p.max[0] || y > p.max[1] || z > p.max[2]) continue;
    d = smin(d, primDist(p, x, y, z), p.k);
  }
  return d;
}

// ---------- извлечение поверхности (surface nets) ----------

export function polygonize(prims, h = 0.009) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of prims) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], p.min[i] + 0.06); hi[i] = Math.max(hi[i], p.max[i] - 0.06); }
  for (let i = 0; i < 3; i++) { lo[i] -= 2 * h; hi[i] += 2 * h; }
  const nx = Math.ceil((hi[0] - lo[0]) / h) + 1, ny = Math.ceil((hi[1] - lo[1]) / h) + 1, nz = Math.ceil((hi[2] - lo[2]) / h) + 1;
  const N = nx * ny * nz;
  const F = new Float32Array(N).fill(1);
  const idx = (i, j, k) => i + nx * (j + ny * k);
  // поле: по каждой форме — только внутри её границ
  for (const p of prims) {
    const i0 = Math.max(0, Math.floor((p.min[0] - lo[0]) / h)), i1 = Math.min(nx - 1, Math.ceil((p.max[0] - lo[0]) / h));
    const j0 = Math.max(0, Math.floor((p.min[1] - lo[1]) / h)), j1 = Math.min(ny - 1, Math.ceil((p.max[1] - lo[1]) / h));
    const k0 = Math.max(0, Math.floor((p.min[2] - lo[2]) / h)), k1 = Math.min(nz - 1, Math.ceil((p.max[2] - lo[2]) / h));
    for (let k = k0; k <= k1; k++) {
      const z = lo[2] + k * h;
      for (let j = j0; j <= j1; j++) {
        const y = lo[1] + j * h;
        let o = idx(i0, j, k);
        for (let i = i0; i <= i1; i++, o++) {
          const d = primDist(p, lo[0] + i * h, y, z);
          F[o] = smin(F[o], d, p.k);
        }
      }
    }
  }
  // вершины в ячейках со сменой знака
  const vid = new Int32Array(N).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const [a, b, e] = corners[c];
          cv[c] = F[idx(i + a, j + b, k + e)];
          if (cv[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of edges) {
          const da = cv[a], db = cv[b];
          if (da < 0 === db < 0) continue;
          const t = da / (da - db);
          const ca = corners[a], cb = corners[b];
          sx += ca[0] + (cb[0] - ca[0]) * t;
          sy += ca[1] + (cb[1] - ca[1]) * t;
          sz += ca[2] + (cb[2] - ca[2]) * t;
          n++;
        }
        vid[idx(i, j, k)] = pos.length / 3;
        pos.push(lo[0] + (i + sx / n) * h, lo[1] + (j + sy / n) * h, lo[2] + (k + sz / n) * h);
      }
  // грани: на каждом ребре сетки со сменой знака — четырёхугольник из 4 соседних ячеек
  const tri = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tri.push(a, c, b, a, d, c);
    else tri.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const o = idx(i, j, k);
        const inside = F[o] < 0;
        if (inside !== F[idx(i + 1, j, k)] < 0) quad(vid[idx(i, j - 1, k - 1)], vid[idx(i, j, k - 1)], vid[idx(i, j, k)], vid[idx(i, j - 1, k)], !inside);
        if (inside !== F[idx(i, j + 1, k)] < 0) quad(vid[idx(i - 1, j, k - 1)], vid[idx(i - 1, j, k)], vid[idx(i, j, k)], vid[idx(i, j, k - 1)], !inside);
        if (inside !== F[idx(i, j, k + 1)] < 0) quad(vid[idx(i - 1, j - 1, k)], vid[idx(i, j - 1, k)], vid[idx(i, j, k)], vid[idx(i - 1, j, k)], !inside);
      }
  return { pos: new Float32Array(pos), index: tri };
}

// ---------- сетка кадра: уточнение вершин, нормали, цвета групп ----------

const lin = (hex) => { const c = new THREE.Color(); c.setHex(hex, THREE.SRGBColorSpace); return [c.r, c.g, c.b]; };
export const COLORS = {
  skin: lin(0x6c7178),
  shorts: lin(0x16181b),
  shoe: lin(0x1d2024),
  muscle: lin(0x868c94),
  primary: lin(0xa6ea2a),
  secondary: lin(0xd8d58a),
};

export function buildMesh(prims, { primary = [], secondary = [], h = 0.009, cloth = [], skin = null } = {}) {
  // иллюстрации: единый тон кожи и мышц (без подсветки), мышцы чуть светлее — читается рельеф
  const SK = skin ? lin(skin) : COLORS.skin;
  const MU = skin ? SK.map((x) => Math.min(1, x * 1.12)) : COLORS.muscle;
  const { pos, index } = polygonize(prims, h);
  const n = pos.length / 3;
  const nor = new Float32Array(pos.length);
  const col = new Float32Array(pos.length);
  const emi = new Float32Array(n);
  const e = 0.0015;
  for (let i = 0; i < n; i++) {
    let x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
    // проекция на поверхность (один шаг Ньютона) — гладкость выше разрешения сетки
    for (let it = 0; it < 2; it++) {
      const d = sdf(prims, x, y, z);
      const gx = sdf(prims, x + e, y, z) - sdf(prims, x - e, y, z);
      const gy = sdf(prims, x, y + e, z) - sdf(prims, x, y - e, z);
      const gz = sdf(prims, x, y, z + e) - sdf(prims, x, y, z - e);
      const g2 = (gx * gx + gy * gy + gz * gz) / (4 * e * e);
      if (g2 < 1e-8) break;
      const s = d / g2 / (2 * e);
      x -= gx * s;
      y -= gy * s;
      z -= gz * s;
    }
    pos[3 * i] = x;
    pos[3 * i + 1] = y;
    pos[3 * i + 2] = z;
    const gx = sdf(prims, x + e, y, z) - sdf(prims, x - e, y, z);
    const gy = sdf(prims, x, y + e, z) - sdf(prims, x, y - e, z);
    const gz = sdf(prims, x, y, z + e) - sdf(prims, x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    nor[3 * i] = gx / gl;
    nor[3 * i + 1] = gy / gl;
    nor[3 * i + 2] = gz / gl;
    // цвет: мягкое взвешивание ближайших форм (переходы без ступенек)
    let wsum = 0, r = 0, g = 0, b = 0, em = 0;
    let dmin = Infinity;
    const ds = [];
    for (const p of prims) {
      if (x < p.min[0] || y < p.min[1] || z < p.min[2] || x > p.max[0] || y > p.max[1] || z > p.max[2]) continue;
      const d = primDist(p, x, y, z);
      ds.push([p, d]);
      if (d < dmin) dmin = d;
    }
    for (const [p, d] of ds) {
      // ткань (шорты, кроссовки) — чёткая граница, мышцы и кожа — мягкий переход
      const cloth = p.group === SHORTS || p.group === SHOE;
      const w = Math.exp(-Math.max(0, d - dmin) / (cloth ? 0.0012 : 0.004)) * (cloth ? 1.6 : 1);
      if (w < 1e-3) continue;
      const c = p.group === SKIN ? SK : p.group === SHORTS ? COLORS.shorts : p.group === SHOE ? COLORS.shoe : primary.includes(p.group) ? COLORS.primary : secondary.includes(p.group) ? COLORS.secondary : MU;
      r += c[0] * w;
      g += c[1] * w;
      b += c[2] * w;
      em += (primary.includes(p.group) ? 1 : secondary.includes(p.group) ? 0.35 : 0) * w;
      wsum += w;
    }
    r /= wsum;
    g /= wsum;
    b /= wsum;
    em /= wsum;
    // шорты: ткань поверх, подсвеченная мышца видна приглушённо
    const inCloth = cloth.some((c) => x >= c.min[0] && y >= c.min[1] && z >= c.min[2] && x <= c.max[0] && y <= c.max[1] && z <= c.max[2] && primDist(c, x, y, z) < 0);
    if (inCloth) {
      const k = Math.min(1, em * 1.4) * 0.7;
      r = COLORS.shorts[0] * (1 - k) + r * k;
      g = COLORS.shorts[1] * (1 - k) + g * k;
      b = COLORS.shorts[2] * (1 - k) + b * k;
      em *= 0.55;
    }
    col[3 * i] = r;
    col[3 * i + 1] = g;
    col[3 * i + 2] = b;
    emi[i] = em;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('emi', new THREE.BufferAttribute(emi, 1));
  geo.setIndex(index);
  return geo;
}

/** Материал тела: цвет вершин + свечение основных мышц (атрибут emi) */
export function bodyMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.46, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.5, sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color(0x9aa3ad) });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float emi;\nvarying float vEmi;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvEmi = emi;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vEmi;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.33, 0.62, 0.02) * vEmi * 0.75;');
  };
  return m;
}
