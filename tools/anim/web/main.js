/** Точка входа страницы рендера: window.rynji.* вызывает node-скрипт через Playwright */
import * as THREE from 'three';
import { createStage } from './stage.js';
import { anatomy, bodyMaterial, buildMesh, clothVolumes, createSkeleton, preparePrims } from './body.js';
import { applyPose, phase } from './rig.js';
import { MOTIONS } from './motions.js';
import { STILLS } from './stills.js';

const params = new URLSearchParams(location.search);
const W = Number(params.get('w') || 960);
const H = Number(params.get('h') || 720);
const stage = createStage({ width: W, height: H });
const skel = createSkeleton();
stage.scene.add(skel.root);
const PRIMS = anatomy();
const CLOTH = clothVolumes();
const mat = bodyMaterial();
let bodyMesh = null;
let current = null;

function rebuild(primary, secondary, h, opts = {}) {
  skel.root.updateMatrixWorld(true);
  const prims = preparePrims(opts.prims || PRIMS, skel.joints);
  const geo = buildMesh(prims, { primary, secondary, h, cloth: preparePrims(CLOTH, skel.joints), skin: opts.skin });
  if (bodyMesh) {
    bodyMesh.geometry.dispose();
    bodyMesh.geometry = geo;
  } else {
    bodyMesh = new THREE.Mesh(geo, mat);
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    stage.scene.add(bodyMesh);
  }
  return geo.attributes.position.count;
}

window.rynji = {
  THREE,
  stage,
  skel,
  rest() {
    for (const o of Object.values(skel.joints)) if (o.name !== 'root' && o.name !== 'pelvis') o.rotation.set(0, 0, 0);
    skel.joints.shoulderL.rotation.z = 0.12;
    skel.joints.shoulderR.rotation.z = -0.12;
    skel.joints.elbowL.rotation.x = -0.15;
    skel.joints.elbowR.rotation.x = -0.15;
  },
  build: (p = [], s = [], h = 0.009) => rebuild(p, s, h),
  /** Упражнение: снаряды на сцену, камера */
  load(id) {
    const m = MOTIONS[id];
    if (!m) throw new Error(`нет движения: ${id}`);
    current = { id, m, ctx: m.setup(stage.scene) };
    stage.camera.position.set(...m.camera.pos);
    stage.camera.lookAt(new THREE.Vector3(...m.camera.target));
    return { primary: m.primary, secondary: m.secondary };
  },
  /** Кадр цикла: t ∈ [0, 1) */
  frame(t, h = 0.009) {
    const { m, ctx } = current;
    const p = phase(t);
    applyPose(skel, m.pose(p));
    rebuild(m.primary, m.secondary, h);
    m.after?.(ctx, skel, p);
    stage.render();
    return stage.canvas.toDataURL('image/png');
  },
  /** Иллюстрация (приветствие, цели, главная): поза, телосложение, свет, камера; PNG с прозрачным фоном */
  still(id, h = 0.006) {
    const st = STILLS[id];
    if (!st) throw new Error(`нет иллюстрации: ${id}`);
    for (const o of Object.values(skel.joints)) if (o.name !== 'root') o.rotation.set(0, 0, 0);
    applyPose(skel, st.pose);
    const ctx = st.setup?.(stage.scene) ?? {};
    if (bodyMesh) bodyMesh.visible = !st.noBody;
    if (!st.noBody) rebuild(st.primary || [], st.secondary || [], h, { prims: anatomy(st.build), skin: st.skin });
    st.after?.(ctx, skel);
    st.light?.(stage);
    stage.camera.fov = st.fov || 28;
    stage.camera.updateProjectionMatrix();
    stage.camera.position.set(...st.camera.pos);
    stage.camera.lookAt(new THREE.Vector3(...st.camera.target));
    const bg = stage.scene.background;
    stage.scene.background = null;
    stage.floor.visible = false;
    stage.disc.visible = false;
    stage.renderer.setClearColor(0x000000, 0);
    stage.render();
    const url = stage.canvas.toDataURL('image/png');
    stage.scene.background = bg;
    return url;
  },
  view(pos, target) {
    stage.camera.position.set(...pos);
    stage.camera.lookAt(new THREE.Vector3(...target));
  },
  shot() {
    stage.render();
    return stage.canvas.toDataURL('image/png');
  },
};
window.rynjiReady = true;
