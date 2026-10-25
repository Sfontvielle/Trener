/**
 * Иллюстрации интерфейса из той же 3D-фигуры: приветствие (атлет со спины), карточки целей (торсы разного
 * телосложения), карточка тренировки на главной. Фон прозрачный — свечение и энергетические волны рисует приложение.
 */
import { dumbbell } from './props.js';

const deg = (d) => (d * Math.PI) / 180;
const legs = {
  L: { foot: [0.12, 0.09, 0], knee: [0.12, 0.5, 0.6], footZ: [0.1, 0, 1] },
  R: { foot: [-0.12, 0.09, 0], knee: [-0.12, 0.5, 0.6], footZ: [-0.1, 0, 1] },
};
const relaxed = (abd = 9, bend = 12) => ({
  L: { fk: { shoulder: [deg(2), 0, deg(abd)], elbow: [-deg(bend), 0, 0] } },
  R: { fk: { shoulder: [deg(2), 0, deg(-abd)], elbow: [-deg(bend), 0, 0] } },
});
const standing = (extra = {}) => ({ pelvis: { pos: [0, 0.99, 0], y: [0, 1, 0], z: [0, 0, 1] }, legs, arms: relaxed(), ...extra });

/** Свет: ключевой, заполняющий, зелёный контровой, белый контровой — позиции и сила */
const lights = (cfg) => (stage) => {
  for (const [name, [pos, intensity]] of Object.entries(cfg)) {
    stage[name].position.set(...pos);
    stage[name].intensity = intensity;
  }
};

// торс на карточке цели: грудь — талия, руки чуть в стороны, взгляд в камеру
const torso = (build, skin) => ({
  build,
  skin,
  pose: standing({ arms: relaxed(13, 8) }),
  camera: { pos: [0.32, 1.34, 1.4], target: [0, 1.25, 0] },
  fov: 30,
  light: lights({ key: [[1.8, 3.0, 2.2], 1.9], fill: [[-2.4, 1.2, 1.8], 0.25], rim: [[-2.2, 2.0, -2.0], 2.2], rim2: [[2.4, 2.2, -2.2], 1.8] }),
});

export const STILLS = {
  // Приветствие: атлет со спины, голова повёрнута вправо; контур подсвечен зелёным спереди-сбоку (энергия перед ним)
  welcome: {
    build: { mass: 1.14, lean: 0.95, def: 0.8 },
    skin: 0x5d6168,
    pose: standing({ head: [deg(-4), deg(32), 0], neck: [0, deg(8), 0], chest: [deg(-3), deg(4), 0], arms: relaxed(14, 18) }),
    camera: { pos: [0.2, 1.42, -2.3], target: [0, 1.26, 0] },
    fov: 30,
    light: lights({ key: [[-0.8, 3.6, -2.6], 1.6], fill: [[1.8, 1.2, -2.4], 0.35], rim: [[-2.6, 1.9, 1.6], 3.4], rim2: [[2.6, 2.4, 1.4], 2.6] }),
  },
  // Главная, карточка тренировки: вполоборота, взгляд вверх-вправо
  home_hero: {
    build: { mass: 1.1, lean: 0.96, def: 0.85 },
    skin: 0x5d6168,
    pose: standing({ head: [deg(-16), deg(-28), 0], neck: [deg(-6), deg(-8), 0], chest: [0, deg(-6), 0], arms: relaxed(12, 15) }),
    camera: { pos: [0.95, 1.42, 1.5], target: [0.02, 1.36, 0] },
    fov: 30,
    light: lights({ key: [[1.4, 3.4, 2.2], 2.0], fill: [[-2.0, 1.4, 2.0], 0.4], rim: [[-2.4, 2.2, -1.6], 3.0], rim2: [[2.6, 2.6, -2.0], 1.4] }),
  },
  goal_bulk: torso({ mass: 1.2, lean: 1.06, def: 1.1 }, 0x4d5157),
  goal_cut: torso({ mass: 0.98, lean: 0.92, def: 0.85 }, 0x8a6b57),
  goal_recomp: torso({ mass: 1.06, lean: 0.97, def: 0.95 }, 0x667080),
  goal_maintain: {
    noBody: true,
    pose: standing(),
    setup(scene) {
      const d = dumbbell();
      d.scale.setScalar(1.6);
      d.position.set(0, 1.0, 0);
      d.rotation.set(deg(8), deg(-24), deg(4));
      scene.add(d);
      return { d };
    },
    camera: { pos: [0.05, 1.2, 1.5], target: [0, 1.0, 0] },
    fov: 30,
    light: lights({ key: [[1.2, 3.0, 2.0], 2.6], fill: [[-2.0, 1.0, 1.6], 0.6], rim: [[-2.0, 1.6, -1.4], 2.4], rim2: [[2.0, 2.0, -1.6], 1.6] }),
  },
};
