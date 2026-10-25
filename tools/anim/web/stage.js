/**
 * Сцена рендера: тёмная студия RYNJI — графитовый фон с мягким зелёным свечением за фигурой, ключевой свет,
 * контровой свет, отражения от окружения, мягкая тень на полу. Рендер в canvas фиксированного размера.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createStage({ width = 960, height = 720, glow = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  document.body.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, alpha: true, premultipliedAlpha: false });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = backgroundTexture(width, height, glow);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.25;

  const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 50);

  // Ключевой свет — сверху спереди слева, тёплый белый
  const key = new THREE.DirectionalLight(0xfff6ea, 2.0);
  key.position.set(2.2, 4.2, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -2.5;
  key.shadow.camera.right = 2.5;
  key.shadow.camera.top = 2.5;
  key.shadow.camera.bottom = -2.5;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 6;
  scene.add(key);
  // Заполняющий — холодный, слабый
  const fill = new THREE.DirectionalLight(0xb9c6d6, 0.6);
  fill.position.set(-3, 2, 2);
  scene.add(fill);
  // Контровые — подчёркивают силуэт (один с фирменным зелёным оттенком)
  const rim = new THREE.DirectionalLight(0xc8f53c, 0.55);
  rim.position.set(-2.5, 2.5, -3.5);
  scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xffffff, 1.3);
  rim2.position.set(3, 3, -3);
  scene.add(rim2);
  scene.add(new THREE.HemisphereLight(0x8a96a3, 0x0a0b0d, 0.25));

  // Пол: тёмный, принимает тень, плавно растворяется в фоне
  const floorMat = new THREE.ShadowMaterial({ opacity: 0.55 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.6, 96), new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, depthWrite: false }));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.001;
  scene.add(disc);

  return {
    canvas,
    renderer,
    scene,
    camera,
    key,
    fill,
    rim,
    rim2,
    floor,
    disc,
    render() {
      renderer.render(scene, camera);
      return canvas;
    },
  };
}

function backgroundTexture(w, h, glow) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const lin = g.createLinearGradient(0, 0, 0, h);
  lin.addColorStop(0, '#111417');
  lin.addColorStop(1, '#07080a');
  g.fillStyle = lin;
  g.fillRect(0, 0, w, h);
  if (glow) {
    const r = g.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.42, Math.max(w, h) * 0.55);
    r.addColorStop(0, 'rgba(160,230,40,0.16)');
    r.addColorStop(0.45, 'rgba(120,200,30,0.05)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  }
  // виньетка
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(256, 256, 0, 256, 256, 256);
  r.addColorStop(0, 'rgba(40,46,52,0.9)');
  r.addColorStop(0.55, 'rgba(24,28,32,0.6)');
  r.addColorStop(1, 'rgba(10,11,13,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
