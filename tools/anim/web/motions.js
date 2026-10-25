/**
 * Движения упражнений: позы в начале (p=0) и в конце (p=1) амплитуды, снаряды, камера, мышцы.
 * Биомеханика каждого движения описана рядом с кодом позы. Камера подобрана так, чтобы были видны
 * работающие мышцы и траектория снаряда.
 */
import * as THREE from 'three';
import { barbell, bench, cable, dumbbell, latBar, pulldownMachine } from './props.js';
import { lerp, lerp3, palm } from './rig.js';

const deg = (d) => (d * Math.PI) / 180;
const dirFwd = (a) => [0, Math.cos(deg(a)), Math.sin(deg(a))]; // наклон оси корпуса вперёд на a°
const frontFwd = (a) => [0, -Math.sin(deg(a)), Math.cos(deg(a))];
const V = (a) => new THREE.Vector3(...a);

/** Мировая точка в системе сустава */
const at = (skel, joint, local) => {
  const j = skel.joints[joint];
  j.updateWorldMatrix(true, false);
  return new THREE.Vector3(...local).applyMatrix4(j.matrixWorld);
};
const axis = (skel, joint, local) => {
  const q = new THREE.Quaternion();
  skel.joints[joint].getWorldQuaternion(q);
  return new THREE.Vector3(...local).applyQuaternion(q);
};
const arr = (v) => [v.x, v.y, v.z];

/** Штанга по центру между ладонями, ось — от правой ладони к левой */
function holdBar(bar, skel) {
  const L = palm(skel, 'L'), R = palm(skel, 'R');
  bar.position.copy(L.clone().add(R).multiplyScalar(0.5));
  bar.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), L.clone().sub(R).normalize());
}
/** Гантель в ладони: ось — поперёк кисти */
function holdDumbbell(db, skel, s) {
  db.position.copy(palm(skel, s));
  const q = new THREE.Quaternion();
  skel.joints[`hand${s}`].getWorldQuaternion(q);
  db.quaternion.copy(q);
}

export const MOTIONS = {
  // ПРИСЕДАНИЯ СО ШТАНГОЙ: гриф на верхней части трапеций, стопы на ширине плеч, носки чуть врозь.
  // Вниз: таз назад и вниз до параллели бедра с полом, колени по направлению носков, пятки на полу,
  // корпус наклоняется ~40°, спина нейтральна. Вверх — тем же путём.
  back_squat: {
    primary: ['quadriceps', 'gluteal'],
    secondary: ['adductors', 'hamstring', 'lower-back'],
    camera: { pos: [2.49, 1.36, 3.35], target: [0, 0.91, 0] },
    setup(scene) {
      const bar = barbell();
      scene.add(bar);
      return { bar };
    },
    pose(p) {
      const lean = lerp(4, 40, p);
      return {
        pelvis: { pos: [0, lerp(1.0, 0.6, p), lerp(0, -0.2, p)], y: dirFwd(lean), z: frontFwd(lean) },
        spine: [deg(lerp(0, -4, p)), 0, 0],
        chest: [deg(lerp(0, -2, p)), 0, 0],
        neck: [deg(lerp(0, -28, p)), 0, 0],
        legs: {
          L: { foot: [0.17, 0.09, 0], knee: [0.35, 0.6, 0.6], footZ: [0.26, 0, 0.97] },
          R: { foot: [-0.17, 0.09, 0], knee: [-0.35, 0.6, 0.6], footZ: [-0.26, 0, 0.97] },
        },
        armsFn: (skel) => {
          const barC = at(skel, 'chest', [0, 0.255, -0.1]);
          const x = axis(skel, 'chest', [1, 0, 0]);
          const L = barC.clone().add(x.clone().multiplyScalar(0.31)), R = barC.clone().add(x.clone().multiplyScalar(-0.31));
          const down = axis(skel, 'chest', [0, -0.35, -0.25]);
          return { L: { hand: arr(L), elbow: arr(L.clone().add(down)) }, R: { hand: arr(R), elbow: arr(R.clone().add(down)) } };
        },
      };
    },
    after(ctx, skel) {
      holdBar(ctx.bar, skel);
    },
  },

  // РУМЫНСКАЯ ТЯГА: стопы на ширине таза, колени слегка согнуты и почти неподвижны. Таз уходит назад,
  // корпус наклоняется с ровной спиной, гриф скользит вдоль бёдер до середины голени; подъём — разгибанием таза.
  romanian_deadlift: {
    primary: ['hamstring', 'gluteal'],
    secondary: ['lower-back', 'forearm'],
    camera: { pos: [3.68, 1.35, -1.24], target: [0, 0.9, 0] },
    setup(scene) {
      const bar = barbell();
      scene.add(bar);
      return { bar };
    },
    pose(p) {
      const lean = lerp(3, 72, p);
      const barY = lerp(0.78, 0.36, p);
      return {
        pelvis: { pos: [0, lerp(0.99, 0.93, p), lerp(0, -0.2, p)], y: dirFwd(lean), z: frontFwd(lean) },
        spine: [deg(lerp(0, 2, p)), 0, 0],
        neck: [deg(lerp(0, -22, p)), 0, 0],
        legs: {
          L: { foot: [0.11, 0.09, 0.02], knee: [0.12, 0.5, 0.7] },
          R: { foot: [-0.11, 0.09, 0.02], knee: [-0.12, 0.5, 0.7] },
        },
        armsFn: () => ({
          L: { hand: [0.235, barY, 0.1], elbow: [0.4, barY + 0.3, -0.4] },
          R: { hand: [-0.235, barY, 0.1], elbow: [-0.4, barY + 0.3, -0.4] },
        }),
      };
    },
    after(ctx, skel) {
      holdBar(ctx.bar, skel);
    },
  },

  // ЖИМ ШТАНГИ ЛЁЖА: лопатки сведены, небольшой прогиб в пояснице, стопы на полу. Гриф опускается к нижней
  // части груди, локти под ~45° к корпусу; выжим вверх и чуть к голове — до прямых рук над плечами.
  bench_press: {
    primary: ['chest'],
    secondary: ['triceps', 'deltoids'],
    camera: { pos: [2.3, 2.35, 1.45], target: [-0.12, 0.66, 0] },
    setup(scene) {
      const b = bench({ length: 1.25, top: 0.45 });
      b.position.x = -0.1;
      scene.add(b);
      const bar = barbell();
      scene.add(bar);
      return { bar };
    },
    pose(p) {
      const barX = lerp(-0.34, -0.2, p);
      const barY = lerp(1.17, 0.74, p);
      return {
        pelvis: { pos: [0.16, 0.56, 0], y: [-1, 0, 0], z: [0, 1, 0] },
        spine: [deg(-9), 0, 0],
        chest: [deg(-6), 0, 0],
        neck: [deg(12), 0, 0],
        legs: {
          L: { foot: [0.58, 0.09, -0.32], knee: [0.7, 0.9, -0.3], footY: [0, 1, 0], footZ: [1, 0, -0.2] },
          R: { foot: [0.58, 0.09, 0.32], knee: [0.7, 0.9, 0.3], footY: [0, 1, 0], footZ: [1, 0, 0.2] },
        },
        armsFn: () => ({
          L: { hand: [barX, barY, -0.4], elbow: [barX + 0.12, 0.2, -0.75] },
          R: { hand: [barX, barY, 0.4], elbow: [barX + 0.12, 0.2, 0.75] },
        }),
      };
    },
    after(ctx, skel) {
      holdBar(ctx.bar, skel);
    },
  },

  // ТЯГА ГАНТЕЛИ ОДНОЙ РУКОЙ: левые колено и ладонь на скамье, правая стопа на полу, спина параллельна полу.
  // Локоть ведётся вверх и назад к поясу вдоль корпуса, лопатка сводится; опускание — до прямой руки.
  db_row: {
    primary: ['upper-back'],
    secondary: ['biceps', 'deltoids'],
    camera: { pos: [1.2, 1.69, -2.49], target: [0, 0.62, 0] },
    setup(scene) {
      const b = bench({ length: 1.2, top: 0.45, width: 0.32 });
      b.position.set(-0.05, 0, 0.12);
      scene.add(b);
      const db = dumbbell();
      scene.add(db);
      return { db };
    },
    pose(p) {
      return {
        pelvis: { pos: [0.3, 0.93, -0.02], y: [-1, -0.05, 0], z: [0, -1, 0] },
        neck: [deg(-35), 0, 0],
        legs: {
          L: { foot: [0.68, 0.53, 0.1], knee: [0.3, 0.3, 0.12], footY: [0, 0, 1], footZ: [1, -1, 0] },
          R: { foot: [0.55, 0.09, -0.36], knee: [0.1, 0.55, -0.4], footZ: [-0.2, 0, -1] },
        },
        armsFn: (skel) => {
          const sh = at(skel, 'shoulderR', [0, 0, 0]);
          const bottom = sh.clone().add(V([0.02, -0.6, -0.03]));
          const top = sh.clone().add(V([0.23, -0.14, -0.03]));
          const hand = bottom.clone().lerp(top, p);
          const elbow = sh.clone().add(V([lerp(0.05, 0.35, p), lerp(-0.1, 0.45, p), -0.15]));
          const shL = at(skel, 'shoulderL', [0, 0, 0]);
          return { R: { hand: arr(hand), elbow: arr(elbow) }, L: { hand: [shL.x - 0.04, 0.47, 0.17], elbow: [shL.x + 0.3, shL.y, 0.4] } };
        },
      };
    },
    after(ctx, skel) {
      holdDumbbell(ctx.db, skel, 'R');
      ctx.db.rotateY(Math.PI / 2);
    },
  },

  // ТЯГА ВЕРХНЕГО БЛОКА: бёдра зафиксированы валиками, хват шире плеч. Гриф тянется к верху груди, локти вниз
  // и чуть назад, корпус отклоняется ~15°; вверх — до почти прямых рук, лопатки поднимаются.
  lat_pulldown: {
    primary: ['upper-back'],
    secondary: ['biceps', 'forearm'],
    camera: { pos: [-1.56, 1.64, -2.75], target: [0, 1.06, 0.15] },
    setup(scene) {
      const m = pulldownMachine({ seatY: 0.47, padY: 0.66, topY: 2.25 });
      scene.add(m);
      const bar = latBar();
      scene.add(bar);
      const c = cable();
      scene.add(c);
      return { bar, c, pulley: m.userData.pulley };
    },
    pose(p) {
      const lean = lerp(-4, -16, p);
      const barY = lerp(1.68, 1.22, p);
      const barZ = lerp(0.1, 0.2, p);
      return {
        pelvis: { pos: [0, 0.55, 0], y: dirFwd(lean), z: frontFwd(lean) },
        spine: [deg(-4), 0, 0],
        neck: [deg(lerp(-10, -4, p)), 0, 0],
        legs: {
          L: { foot: [0.15, 0.09, 0.47], knee: [0.15, 0.6, 0.8] },
          R: { foot: [-0.15, 0.09, 0.47], knee: [-0.15, 0.6, 0.8] },
        },
        armsFn: () => ({
          L: { hand: [0.47, barY, barZ], elbow: [0.9, lerp(1.6, 0.6, p), -0.2] },
          R: { hand: [-0.47, barY, barZ], elbow: [-0.9, lerp(1.6, 0.6, p), -0.2] },
        }),
      };
    },
    after(ctx, skel) {
      holdBar(ctx.bar, skel);
      ctx.bar.position.y += 0.04;
      ctx.c.userData.set(ctx.pulley, ctx.bar.position.clone());
    },
  },

  // СГИБАНИЯ РУК С ГАНТЕЛЯМИ: стоя, локти прижаты к корпусу и неподвижны, ладони смотрят вперёд.
  // Подъём — только сгибанием в локте до ~140°, без раскачки корпусом; опускание медленное до почти прямых рук.
  db_curl: {
    primary: ['biceps'],
    secondary: ['forearm'],
    camera: { pos: [1.28, 1.39, 2.55], target: [0, 1.12, 0] },
    setup(scene) {
      const L = dumbbell(), R = dumbbell();
      scene.add(L, R);
      return { L, R };
    },
    pose(p) {
      const flex = lerp(8, 138, p);
      return {
        pelvis: { pos: [0, 0.99, 0], y: [0, 1, 0], z: [0, 0, 1] },
        legs: {
          L: { foot: [0.13, 0.09, 0], knee: [0.13, 0.5, 0.6], footZ: [0.12, 0, 1] },
          R: { foot: [-0.13, 0.09, 0], knee: [-0.13, 0.5, 0.6], footZ: [-0.12, 0, 1] },
        },
        arms: {
          L: { fk: { shoulder: [deg(-4 - 6 * p), 0, deg(7)], elbow: [-deg(flex), 0, 0] } },
          R: { fk: { shoulder: [deg(-4 - 6 * p), 0, deg(-7)], elbow: [-deg(flex), 0, 0] } },
        },
      };
    },
    after(ctx, skel) {
      holdDumbbell(ctx.L, skel, 'L');
      holdDumbbell(ctx.R, skel, 'R');
    },
  },
};

export { lerp3 };
