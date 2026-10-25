/**
 * Снаряды и тренажёры для сцен техники: штанга, гантель, скамья, блочная станция, тренажёр тяги сверху.
 * Простая собственная геометрия в тёмной гамме с фирменным акцентом на дисках.
 */
import * as THREE from 'three';

const steel = new THREE.MeshPhysicalMaterial({ color: 0xb9bec4, metalness: 0.9, roughness: 0.28 });
const darkSteel = new THREE.MeshPhysicalMaterial({ color: 0x3b4046, metalness: 0.7, roughness: 0.4 });
const plateMat = new THREE.MeshPhysicalMaterial({ color: 0x15171a, metalness: 0.2, roughness: 0.55, clearcoat: 0.4 });
const rimMat = new THREE.MeshPhysicalMaterial({ color: 0x6f9e1a, emissive: 0x1d3300, emissiveIntensity: 0.35, roughness: 0.45 });
const padMat = new THREE.MeshPhysicalMaterial({ color: 0x1e2125, roughness: 0.7, sheen: 0.5, sheenColor: new THREE.Color(0x40464d) });
const frameMat = new THREE.MeshPhysicalMaterial({ color: 0x2a2e33, metalness: 0.6, roughness: 0.45 });
const cableMat = new THREE.MeshPhysicalMaterial({ color: 0x0f1012, roughness: 0.5 });

const shadow = (o) => {
  o.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return o;
};

/** Штанга вдоль оси X, центр в (0,0,0) */
export function barbell({ plates = 2 } = {}) {
  const g = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 2.0, 24), steel);
  bar.rotation.z = Math.PI / 2;
  g.add(bar);
  for (const s of [1, -1]) {
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.42, 24), steel);
    sleeve.rotation.z = Math.PI / 2;
    sleeve.position.x = s * 0.86;
    g.add(sleeve);
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 24), darkSteel);
    collar.rotation.z = Math.PI / 2;
    collar.position.x = s * 0.655;
    g.add(collar);
    for (let i = 0; i < plates; i++) {
      const r = i === 0 ? 0.225 : 0.16;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.045, 48), plateMat);
      p.rotation.z = Math.PI / 2;
      p.position.x = s * (0.69 + i * 0.05);
      g.add(p);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 0.012, 0.0035, 8, 64), rimMat);
      rim.rotation.y = Math.PI / 2;
      rim.position.x = s * (0.69 + i * 0.05 + 0.0235);
      g.add(rim);
    }
  }
  return shadow(g);
}

/** Гантель вдоль оси X */
export function dumbbell() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 20), steel);
  handle.rotation.z = Math.PI / 2;
  g.add(handle);
  for (const s of [1, -1]) {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.068, 0.08, 6), plateMat);
    head.rotation.z = Math.PI / 2;
    head.rotation.x = Math.PI / 6;
    head.position.x = s * 0.12;
    g.add(head);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, 6, 32), rimMat);
    rim.rotation.y = Math.PI / 2;
    rim.position.x = s * 0.161;
    g.add(rim);
  }
  return shadow(g);
}

/** Горизонтальная скамья: длина вдоль X, верх подушки на высоте top */
export function bench({ length = 1.2, top = 0.45, width = 0.3 } = {}) {
  const g = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.BoxGeometry(length, 0.07, width), padMat);
  pad.position.y = top - 0.035;
  g.add(pad);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(length * 0.9, 0.05, 0.08), frameMat);
  beam.position.y = top - 0.1;
  g.add(beam);
  for (const s of [1, -1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, top - 0.1, 0.06), frameMat);
    leg.position.set(s * length * 0.38, (top - 0.1) / 2, 0);
    g.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, width + 0.1), frameMat);
    foot.position.set(s * length * 0.38, 0.02, 0);
    g.add(foot);
  }
  return shadow(g);
}

/** Тренажёр тяги верхнего блока: сиденье, валики над бёдрами, стойка с блоком перед атлетом (атлет смотрит в +Z) */
export function pulldownMachine({ seatY = 0.47, padY = 0.68, topY = 2.25 } = {}) {
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.4), padMat);
  seat.position.set(0, seatY - 0.035, 0.02);
  g.add(seat);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, seatY - 0.07, 0.08), frameMat);
  post.position.set(0, (seatY - 0.07) / 2, 0.05);
  g.add(post);
  const padPost = new THREE.Mesh(new THREE.BoxGeometry(0.06, padY, 0.06), frameMat);
  padPost.position.set(0, padY / 2, 0.5);
  g.add(padPost);
  const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.56, 24), padMat);
  roller.rotation.z = Math.PI / 2;
  roller.position.set(0, padY, 0.34);
  g.add(roller);
  const rollerArm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.2), frameMat);
  rollerArm.position.set(0, padY, 0.42);
  g.add(rollerArm);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.12, topY, 0.12), frameMat);
  tower.position.set(0, topY / 2, 0.72);
  g.add(tower);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.66), frameMat);
  arm.position.set(0, topY, 0.42);
  g.add(arm);
  const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 32), darkSteel);
  pulley.rotation.z = Math.PI / 2;
  pulley.position.set(0, topY - 0.07, 0.14);
  g.add(pulley);
  const stack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, 0.12), plateMat);
  stack.position.set(0, 0.3, 0.86);
  g.add(stack);
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 1.3), frameMat);
  base.position.set(0, 0.025, 0.4);
  g.add(base);
  g.userData.pulley = new THREE.Vector3(0, topY - 0.07, 0.14);
  return shadow(g);
}

/** Широкая рукоять тяги сверху вдоль X */
export function latBar() {
  const g = new THREE.Group();
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.9, 20), steel);
  mid.rotation.z = Math.PI / 2;
  g.add(mid);
  for (const s of [1, -1]) {
    const end = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.32, 20), steel);
    end.rotation.z = Math.PI / 2 + s * 0.35;
    end.position.set(s * 0.58, -0.055, 0);
    g.add(end);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.16, 20), plateMat);
    grip.rotation.z = Math.PI / 2 + s * 0.35;
    grip.position.set(s * 0.64, -0.075, 0);
    g.add(grip);
  }
  return shadow(g);
}

/** Трос между двумя точками */
export function cable() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1, 8), cableMat);
  m.castShadow = true;
  m.userData.set = (a, b) => {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    m.position.copy(mid);
    const dir = b.clone().sub(a);
    m.scale.set(1, dir.length(), 1);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  };
  return m;
}
