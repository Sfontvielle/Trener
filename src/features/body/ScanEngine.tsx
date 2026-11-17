'use dom';

import React, { useEffect, useRef } from 'react';
import type { Row, ScanView } from './scan';

/**
 * Распознавание для скана тела — на устройстве, во встроенном веб-компоненте (DOM component Expo):
 * MediaPipe Pose Landmarker (Google, Apache 2.0) — 33 точки скелета и маска силуэта человека.
 * Модель и движок (WebAssembly) загружаются один раз из открытых CDN; фото обрабатываются здесь же и никуда
 * не отправляются. Наружу — только срезы силуэта по строкам и точки скелета (scan.ts считает обхваты).
 */
const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
/** Шаг строк среза, px — компромисс точности и объёма данных */
const STEP = 2;

type Out = { front: ScanView | null; side: ScanView | null; error?: string };

// Движок MediaPipe пишет служебные сообщения (INFO/W) через console.error — это не ошибки: глушим только их,
// иначе в режиме разработки они всплывают красной плашкой
const ENGINE_NOISE = /TensorFlow Lite|XNNPACK|inference_feedback_manager|landmark_projection_calculator|GL Driver Message|^[IW]\d{4} /;
for (const level of ['error', 'warn', 'info'] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && ENGINE_NOISE.test(args[0])) return;
    orig(...args);
  };
}

const importUrl = new Function('u', 'return import(u)') as (u: string) => Promise<any>;

let landmarker: Promise<any> | null = null;
function getLandmarker(): Promise<any> {
  if (!landmarker) {
    landmarker = (async () => {
      const v = await importUrl(`${VISION}/vision_bundle.mjs`);
      const files = await v.FilesetResolver.forVisionTasks(`${VISION}/wasm`);
      return v.PoseLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        numPoses: 1,
        outputSegmentationMasks: true,
      });
    })().catch((e) => {
      landmarker = null;
      throw e;
    });
  }
  return landmarker;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('не удалось открыть фото'));
    img.src = src;
  });
}

async function analyze(src: string): Promise<ScanView | null> {
  const lm = await getLandmarker();
  const img = await loadImage(src);
  const res = lm.detect(img);
  const pts = res?.landmarks?.[0];
  const mask = res?.segmentationMasks?.[0];
  if (!pts || !mask) return null;
  const w: number = mask.width;
  const h: number = mask.height;
  const data: Float32Array = mask.getAsFloat32Array();
  const sx = img.naturalWidth / w;
  const sy = img.naturalHeight / h;
  const rows: Row[] = [];
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    let any = false;
    const runs: [number, number][] = [];
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && data[y * w + x] > 0.5;
      if (on) any = true;
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        // щели в 1–2 пикселя внутри силуэта — шум маски, сшиваем
        const last = runs[runs.length - 1];
        if (last && start - last[1] <= 2) last[1] = x;
        else if (x - start >= 3) runs.push([start, x]);
        start = -1;
      }
    }
    if (any) {
      if (top < 0) top = y;
      bottom = y;
    }
    if (y % STEP === 0 && runs.length) rows.push({ y: Math.round(y * sy), runs: runs.map(([a, b]) => [Math.round(a * sx), Math.round(b * sx)] as [number, number]) });
  }
  mask.close?.();
  if (top < 0) return null;
  return {
    width: img.naturalWidth,
    height: img.naturalHeight,
    top: Math.round(top * sy),
    bottom: Math.round(bottom * sy),
    rows,
    landmarks: pts.map((p: { x: number; y: number; visibility?: number }) => ({ x: p.x * img.naturalWidth, y: p.y * img.naturalHeight, v: p.visibility ?? 0 })),
  };
}

export default function ScanEngine({ front, side, job, onResult }: { front: string; side: string; job: number; onResult: (r: Out) => Promise<void>; dom?: import('expo/dom').DOMProps }) {
  const done = useRef(0);
  useEffect(() => {
    if (!job || done.current === job || !front || !side) return;
    done.current = job;
    void (async () => {
      try {
        const f = await analyze(front);
        const s = await analyze(side);
        await onResult({ front: f, side: s });
      } catch (e) {
        await onResult({ front: null, side: null, error: e instanceof Error ? e.message : String(e) });
      }
    })();
  }, [job, front, side, onResult]);
  return <div style={{ width: 1, height: 1 }} />;
}
