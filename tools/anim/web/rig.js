/**
 * Постановка позы: корпус — прямой кинематикой (наклоны таза, поясницы, груди, шеи), руки и ноги — обратной
 * кинематикой двухзвенной цепи (кисть держит снаряд, стопа стоит на полу) с управлением направлением локтя/колена.
 */
import * as THREE from 'three';

const V = (a) => new THREE.Vector3(...a);
const Y = new THREE.Vector3(0, 1, 0);

/** Кватернион по двум осям: куда смотрит локальная +Y и (примерно) локальная +Z */
export function basis(yDir, zDir) {
  const y = yDir.clone().normalize();
  const z0 = zDir.clone().sub(y.clone().multiplyScalar(zDir.dot(y))).normalize();
  const x = new THREE.Vector3().crossVectors(y, z0).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/** Назначить суставу мировую ориентацию */
function setWorldQuat(joint, qWorld) {
  joint.parent.updateWorldMatrix(true, false);
  const pq = new THREE.Quaternion();
  joint.parent.getWorldQuaternion(pq);
  joint.quaternion.copy(pq.invert().multiply(qWorld));
  joint.updateWorldMatrix(false, false);
}

const wpos = (o) => {
  o.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
};

/**
 * Двухзвенная IK: upper → mid → end. target — мировая позиция end, pole — точка, к которой выгибается mid.
 * frontToPole: локальная +Z верхнего звена смотрит к полюсу (колено) или от него (локоть — бицепс внутри сгиба).
 */
export function solveLimb(upper, mid, end, target, pole, frontToPole) {
  const U = wpos(upper);
  const l1 = mid.position.length();
  const l2 = end.position.length();
  const T = target.clone();
  const toT = T.clone().sub(U);
  let d = toT.length();
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-4), l1 + l2 - 1e-4);
  const n = toT.normalize();
  const P = pole.clone().sub(U);
  const bend = P.sub(n.clone().multiplyScalar(P.dot(n))).normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const M = U.clone().add(n.clone().multiplyScalar(l1 * cosA)).add(bend.clone().multiplyScalar(l1 * sinA));
  const E = U.clone().add(n.clone().multiplyScalar(d));
  // верхнее звено: −Y вдоль кости, +Z к полюсу/от полюса
  const y1 = U.clone().sub(M).normalize();
  const z1 = frontToPole ? bend.clone() : bend.clone().negate();
  const q1 = basis(y1, z1);
  setWorldQuat(upper, q1);
  // нижнее звено — чистый шарнир: та же ось X
  const x1 = new THREE.Vector3(1, 0, 0).applyQuaternion(q1);
  const y2 = M.clone().sub(E).normalize();
  const z2 = new THREE.Vector3().crossVectors(x1, y2).normalize();
  setWorldQuat(mid, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x1, y2, z2)));
  return { M, E };
}

/**
 * Применить позу. pose = {
 *   pelvis: { pos, y, z } — позиция таза и направления его осей (+Y — к голове, +Z — грудью),
 *   spine, chest, neck, head — локальные эйлеры [x, y, z],
 *   arms: { L: { hand, elbow } | { fk: { shoulder, elbow } }, R }, — hand: позиция центра ладони, elbow: полюс локтя
 *   legs: { L: { foot, knee, footY?, footZ? }, R } — foot: позиция голеностопа; footZ — куда смотрит носок,
 *   wrist: { L, R } — эйлер кисти (по умолчанию прямая)
 * }
 */
export function applyPose(skel, pose) {
  const J = skel.joints;
  J.pelvis.position.copy(V(pose.pelvis.pos));
  J.pelvis.quaternion.copy(basis(V(pose.pelvis.y || [0, 1, 0]), V(pose.pelvis.z || [0, 0, 1])));
  for (const k of ['spine', 'chest', 'neck', 'head']) J[k].rotation.set(...(pose[k] || [0, 0, 0]));
  skel.root.updateMatrixWorld(true);
  for (const s of ['L', 'R']) {
    const leg = pose.legs?.[s];
    if (leg) {
      solveLimb(J[`hip${s}`], J[`knee${s}`], J[`ankle${s}`], V(leg.foot), V(leg.knee), true);
      setWorldQuat(J[`ankle${s}`], basis(V(leg.footY || [0, 1, 0]), V(leg.footZ || [0, 0, 1])));
    }
  }
  skel.root.updateMatrixWorld(true);
  // цели рук могут зависеть от положения корпуса (гриф на трапециях, плечо при тяге) — считаем после корпуса
  const arms = pose.armsFn ? pose.armsFn(skel) : pose.arms;
  for (const s of ['L', 'R']) {
    const arm = arms?.[s];
    if (arm?.fk) {
      J[`shoulder${s}`].rotation.set(...(arm.fk.shoulder || [0, 0, 0]));
      J[`elbow${s}`].rotation.set(...(arm.fk.elbow || [0, 0, 0]));
    } else if (arm) {
      // ладонь держит снаряд: центр ладони ≈ запястье + 6 см вдоль предплечья — две итерации
      let wrist = V(arm.hand);
      for (let it = 0; it < 2; it++) {
        const { M } = solveLimb(J[`shoulder${s}`], J[`elbow${s}`], J[`wrist${s}`], wrist, V(arm.elbow), false);
        const dir = V(arm.hand).sub(M).normalize();
        wrist = V(arm.hand).sub(dir.multiplyScalar(0.06));
      }
    }
    J[`wrist${s}`].rotation.set(...(pose.wrist?.[s] || [0, 0, 0]));
  }
  skel.root.updateMatrixWorld(true);
}

/** Центр ладони (для привязки снаряда к руке) */
export function palm(skel, s) {
  const h = skel.joints[`hand${s}`];
  h.updateWorldMatrix(true, false);
  return new THREE.Vector3(0, -0.06, 0.006).applyMatrix4(h.matrixWorld);
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
/** Плавная фаза повторения 0→1→0 за цикл, с короткими паузами в крайних точках */
export function phase(t, hold = 0.08) {
  const c = (1 - Math.cos(2 * Math.PI * t)) / 2;
  const e = Math.min(1, Math.max(0, (c - hold) / (1 - 2 * hold)));
  return e * e * (3 - 2 * e);
}
export { Y };
