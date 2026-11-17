/**
 * Анатомическая фигура RYNJI: спереди и сзади, мужская и женская — обведена по атласу Z-Anatomy
 * (CC BY-SA 4.0, мышцы и кости — BodyParts3D © DBCLS), поэтому пропорции и форма каждой мышцы — анатомические.
 *
 * Данные — в atlas.ts (генерируются tools/anatomy3d/map). Здесь — гладкие пути из точек контура и рамки.
 * Каждая мышца и её сторона — отдельный контур; группа мышц приложения (slug) — для подсветки по упражнению,
 * base — для уточнения по головкам (detail.ts). Мышцы атласа без группы приложения (base «x-…») рисуются
 * нейтральными. Координаты: макушка y = 0, стопы y = 400, центр x = 0.
 */
import type { MuscleSlug, Sex } from '@/types';
import { ATLAS, type AtlasShape } from './atlas';

export type ShapeKind = 'skin' | 'neutral' | 'muscle' | 'tendon' | 'line' | 'hair' | 'contour';
export type View = 'front' | 'back';

export interface Shape {
  id: string;
  /** id контура без стороны и номера — по нему уточнение по головкам */
  base: string;
  slug?: MuscleSlug;
  /** Рамка контура: x0, y0, x1, y1 */
  box: [number, number, number, number];
  kind: ShapeKind;
  d: string;
  /** Волокна одной строкой путей (у фигуры по атласу их нет — форма читается контурами) */
  fib?: string;
}

const KIND: Record<AtlasShape['k'], ShapeKind> = { s: 'skin', n: 'neutral', h: 'hair', t: 'tendon', m: 'muscle', l: 'line', c: 'contour' };

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Замкнутый гладкий контур через точки (Catmull-Rom → кубические Безье) */
function smooth(p: number[][]): string {
  const n = p.length;
  let d = `M${r1(p[0][0])} ${r1(p[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = p[(i - 1 + n) % n];
    const p1 = p[i];
    const p2 = p[(i + 1) % n];
    const p3 = p[(i + 2) % n];
    d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d}Z`;
}

function build(a: AtlasShape): Shape {
  const v = a.p.split(' ').map(Number);
  const pts: number[][] = [];
  for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
  const xs = pts.map((q) => q[0]);
  const ys = pts.map((q) => q[1]);
  const d = a.o
    ? `M${pts[0][0]} ${pts[0][1]}${pts.length === 3 ? `Q${pts[1][0]} ${pts[1][1]} ${pts[2][0]} ${pts[2][1]}` : pts.slice(1).map((q) => `L${q[0]} ${q[1]}`).join('')}`
    : smooth(pts);
  return { id: a.i, base: a.b, slug: a.g, kind: KIND[a.k], box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], d };
}

const cache = new Map<string, Shape[]>();

/** Контуры фигуры по порядку рисования: силуэт → голова/кисти/стопы → сухожилия → мышцы → линии и контур груди */
export function figure(sex: Sex, view: View): Shape[] {
  const key = `${sex}-${view}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const shapes = ATLAS[sex === 'female' ? 'female' : 'male'][view].map(build);
  cache.set(key, shapes);
  return shapes;
}

/** Какие группы мышц видны с этой стороны (для подписи «есть нагруженные мышцы») */
export function slugsOn(view: View): Set<MuscleSlug> {
  return new Set(figure('male', view).map((s) => s.slug).filter((s): s is MuscleSlug => !!s));
}

/** Рамка всей фигуры (x, y, ширина, высота) */
export const FIGURE_BOX = { x: -88, y: -8, w: 176, h: 412 } as const;

/** Атрибуция атласа — под крупной фигурой (CC BY-SA требует указать авторство) */
export const ATLAS_CREDIT = 'Анатомия по атласу Z-Anatomy и BodyParts3D © DBCLS · CC BY-SA 4.0';
