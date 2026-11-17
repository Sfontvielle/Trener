/**
 * Скан тела: геометрия по силуэту на синтетическом человеке с известными сечениями (эллипсы) —
 * обхваты должны восстановиться, плохие фото — давать причину, а не числа.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ellipse, measureFront, measureSide, scanResult, type Pt, type Row, type ScanView } from '../src/features/body/scan';
import { navyBodyFat } from '../src/features/progress/body';

const PX = 4; // пикселей на см
const H_CM = 180;
const TOP = 60;
const W = 900;
const IMG_H = TOP + H_CM * PX + 60;
const CX = W / 2;
const y = (cm: number) => TOP + cm * PX; // cm от макушки

// Сечения (ширина спереди / глубина сбоку, см) по высоте от макушки
const BODY: { at: number; w: number; d: number }[] = [
  { at: 0, w: 4, d: 4 }, { at: 5, w: 15, d: 18 }, { at: 20, w: 14, d: 18 }, { at: 25, w: 12, d: 12 }, { at: 27, w: 12.5, d: 12 }, { at: 29, w: 13, d: 12.5 },
  { at: 32, w: 40, d: 24 }, { at: 45, w: 34, d: 24 }, { at: 58, w: 30, d: 22 }, { at: 70, w: 31, d: 23 }, { at: 82, w: 36, d: 26 }, { at: 88, w: 37, d: 27 }, { at: 92, w: 34, d: 24 },
];
const lerp = (cm: number, key: 'w' | 'd') => {
  for (let i = 1; i < BODY.length; i++) if (cm <= BODY[i].at) {
    const a = BODY[i - 1], b = BODY[i];
    return a[key] + ((b[key] - a[key]) * (cm - a.at)) / (b.at - a.at);
  }
  return BODY[BODY.length - 1][key];
};

function lm(points: Record<number, [number, number]>): Pt[] {
  return Array.from({ length: 33 }, (_, i) => (points[i] ? { x: points[i][0], y: points[i][1], v: 0.95 } : { x: CX, y: TOP, v: 0.1 }));
}

/** Спереди: туловище по таблице, ниже 94 см — две ноги, руки «буквой А» (или прижаты) */
function front(armsAway = true): ScanView {
  const rows: Row[] = [];
  for (let cm = 0; cm <= H_CM; cm += 0.5) {
    const yy = y(cm);
    const runs: [number, number][] = [];
    if (cm <= 94) {
      const w = lerp(cm, 'w') * PX;
      let a = CX - w / 2, b = CX + w / 2;
      if (cm >= 34 && cm <= 100) {
        const off = armsAway ? 6 + (cm - 34) * 0.3 : 0;
        const arm = 9 * PX;
        if (armsAway) {
          runs.push([a - off * PX - arm, a - off * PX]);
          runs.push([b + off * PX, b + off * PX + arm]);
        } else {
          a -= arm; b += arm;
        }
      }
      runs.unshift([a, b]);
    } else {
      const leg = (cm < 120 ? 17 : 11) * PX;
      runs.push([CX - 2 * PX - leg, CX - 2 * PX], [CX + 2 * PX, CX + 2 * PX + leg]);
    }
    rows.push({ y: yy, runs: runs.sort((p, q) => p[0] - q[0]) });
  }
  return {
    width: W, height: IMG_H, top: y(0), bottom: y(H_CM), rows,
    landmarks: lm({ 0: [CX, y(12)], 7: [CX - 8 * PX, y(10)], 8: [CX + 8 * PX, y(10)], 11: [CX + 22 * PX, y(31)], 12: [CX - 22 * PX, y(31)], 13: [CX + 32 * PX, y(58)], 14: [CX - 32 * PX, y(58)], 23: [CX + 9 * PX, y(86)], 24: [CX - 9 * PX, y(86)], 25: [CX + 9 * PX, y(132)], 26: [CX - 9 * PX, y(132)], 27: [CX + 9 * PX, y(172)], 28: [CX - 9 * PX, y(172)] }),
  };
}

/** Боком: глубина по таблице, руки вытянуты вперёд на уровне плеч */
function side(): ScanView {
  const rows: Row[] = [];
  for (let cm = 0; cm <= H_CM; cm += 0.5) {
    const d = (cm <= 94 ? lerp(cm, 'd') : cm < 120 ? 18 : 12) * PX;
    const runs: [number, number][] = [[CX - d / 2, CX + d / 2]];
    if (cm >= 30 && cm <= 39) runs[0][1] += 60 * PX;
    rows.push({ y: y(cm), runs });
  }
  return { width: W, height: IMG_H, top: y(0), bottom: y(H_CM), rows, landmarks: lm({ 0: [CX + 8 * PX, y(12)], 11: [CX + 1 * PX, y(31)], 12: [CX - 1 * PX, y(31)], 23: [CX, y(86)], 24: [CX, y(86)] }) };
}

test('Скан: обхваты восстанавливаются по силуэту спереди и сбоку (эллипс), процент жира — формулой ВМС диапазоном', () => {
  const f = measureFront(front(), H_CM, 'male');
  assert.deepEqual(f.issues, []);
  assert.ok(Math.abs(f.scale - 1 / PX) < 1e-9, 'масштаб — рост / высота силуэта');
  const s = measureSide(side(), H_CM, f.level);
  assert.deepEqual(s.issues, []);
  const r = scanResult(f, s, 'male', H_CM);
  assert.deepEqual(r.issues, []);
  // талия у мужчины — на 72% от плеч к тазу (31 → 86 см): 70,6 см от макушки
  const at = 31 + 55 * 0.72;
  const expectWaist = ellipse(lerp(at, 'w'), lerp(at, 'd'));
  assert.ok(Math.abs(r.girths.waist!.value - expectWaist) < 1.2, `талия ${r.girths.waist!.value} ≈ ${expectWaist.toFixed(1)}`);
  // шея — самое узкое место: 12 × 12 см
  assert.ok(Math.abs(r.girths.neck!.value - ellipse(12, 12)) < 1.2, `шея ${r.girths.neck!.value}`);
  assert.ok(r.girths.hips && r.girths.hips.value > r.girths.waist!.value, 'бёдра шире талии');
  assert.ok(r.girths.thigh && r.girths.arm, 'бедро и рука — по ширине спереди');
  const bf = navyBodyFat('male', H_CM, r.girths.waist!.value, r.girths.neck!.value)!;
  assert.ok(r.bodyFat && Math.abs(r.bodyFat.value - bf) < 0.11);
  assert.ok(Math.abs(r.bodyFat!.high - r.bodyFat!.low - 10) < 1e-9, '±5 п.п.');
});

test('Скан: плохое фото — причина, а не числа', () => {
  // руки прижаты: талия и бёдра слились с руками — не считаем
  const f1 = measureFront(front(false), H_CM, 'male');
  assert.ok(f1.issues.includes('arms_close'));
  const r1 = scanResult(f1, measureSide(side(), H_CM, f1.level), 'male', H_CM);
  assert.equal(r1.girths.waist, undefined);
  assert.equal(r1.bodyFat, null);
  // ноги обрезаны краем кадра
  const cut = { ...front(), bottom: IMG_H - 1 };
  assert.ok(measureFront(cut, H_CM, 'male').issues.includes('not_full_body'));
  // на «боковом» фото человек стоит лицом
  const f = measureFront(front(), H_CM, 'male');
  const s = measureSide(front(), H_CM, f.level);
  assert.ok(s.issues.includes('not_profile'));
  assert.equal(scanResult(f, s, 'male', H_CM).bodyFat, null);
  // человека нет
  assert.deepEqual(measureFront({ width: 10, height: 10, top: 0, bottom: 0, rows: [], landmarks: [] }, H_CM, 'male').issues, ['no_person']);
});

test('Скан: эллипс — круг и вырожденные случаи', () => {
  assert.ok(Math.abs(ellipse(10, 10) - Math.PI * 10) < 1e-9);
  assert.ok(ellipse(30, 20) < Math.PI * 30 && ellipse(30, 20) > Math.PI * 20);
});

import { bmrKatch, computeNutritionTarget, freshBodyFat } from '../src/features/nutrition/targets';
import { estimateBodyFat } from '../src/features/progress/body';
import type { UserProfile } from '../src/types';
import { today } from '../src/utils/date';

const P: UserProfile = {
  name: 'Тест', sex: 'male', age: 30, heightCm: 180, weightKg: 80, goal: 'maintain', ratePctPerWeek: 0.35, level: 'intermediate', trainingYears: 2,
  daysPerWeek: 4, sessionMinutes: 60, location: 'gym', equipment: [], limitations: '', avoidExerciseIds: [], likedFoods: [], dislikedFoods: [], dietRestrictions: [],
  activity: 'moderate', stepsPerDay: 7000, workStyle: 'desk', preferredTime: 'any', preferredDays: [], createdAt: 0, updatedAt: 0,
};

test('Скан → питание: основной обмен по сухой массе (Кэтч — Макардл), только по свежему проценту жира', () => {
  assert.equal(bmrKatch(80, 20), 370 + 21.6 * 64);
  const ref = '2026-11-16';
  assert.ok(freshBodyFat({ bodyFat: { value: 20, low: 15, high: 25, method: 'scan', date: '2026-10-01' } }, ref), '46 дней — свежий');
  assert.equal(freshBodyFat({ bodyFat: { value: 20, low: 15, high: 25, method: 'scan', date: '2026-01-01' } }, ref), null, 'старше 120 дней — по Миффлину');
  assert.equal(freshBodyFat({ bodyFat: null }, ref), null);
  const lean = computeNutritionTarget({ ...P, bodyFat: { value: 12, low: 7, high: 17, method: 'scan', date: today() } });
  const fat = computeNutritionTarget({ ...P, bodyFat: { value: 30, low: 25, high: 35, method: 'scan', date: today() } });
  assert.ok(lean.kcal > fat.kcal, 'при том же весе у сухого тела расход выше');
  assert.ok(lean.steps.some((s) => /Кэтча — Макардла/.test(s.note ?? '') && /скан тела/.test(s.note ?? '')), 'в расчёте видно формулу и источник');
});

test('Скан → «Тело»: обхваты со скана дают процент жира с более широким диапазоном (±5)', () => {
  const d = '2026-11-16';
  const m = (kind: 'waist' | 'neck', value: number, source?: 'scan') => ({ id: kind, date: d, kind, value, ...(source ? { source } : {}) });
  const tape = estimateBodyFat({ sex: 'male', age: 30, heightCm: 180, weightKg: 80, metrics: [m('waist', 84), m('neck', 39)], today: d });
  const scan = estimateBodyFat({ sex: 'male', age: 30, heightCm: 180, weightKg: 80, metrics: [m('waist', 84, 'scan'), m('neck', 39, 'scan')], today: d });
  assert.equal(tape.method, 'navy');
  assert.equal(scan.method, 'scan');
  assert.equal(scan.value, tape.value);
  assert.ok(scan.high - scan.low > tape.high - tape.low);
});

test('Скан: настоящий вывод MediaPipe (рендер нашей модели 172 см спереди и боком) — обхваты в пределах ±4% от «ленты» по 3D-модели', async () => {
  const fs = await import('node:fs');
  // fixtures/scan-model-male.json — силуэт и точки скелета, распознанные MediaPipe Pose на рендере male.blend;
  // «лента» — периметр выпуклой оболочки сечения 3D-модели на тех же уровнях (tools/anatomy3d/map, проверка раунда 7)
  const v = JSON.parse(fs.readFileSync(new URL('./fixtures/scan-model-male.json', import.meta.url), 'utf8'));
  const TAPE = { neck: 37.6, chest: 124.1, waist: 74.8, hips: 81.5 };
  const f = measureFront(v.front, 172.2, 'male');
  const s = measureSide(v.side, 172.2, f.level);
  const r = scanResult(f, s, 'male', 172.2);
  assert.deepEqual(r.issues, []);
  for (const [site, tape] of Object.entries(TAPE) as [keyof typeof TAPE, number][]) {
    const got = r.girths[site]!.value;
    assert.ok(Math.abs(got - tape) / tape <= 0.04, `${site}: ${got} против ленты ${tape}`);
  }
  const truth = navyBodyFat('male', 172.2, TAPE.waist, TAPE.neck)!;
  assert.ok(r.bodyFat!.low <= truth && truth <= r.bodyFat!.high, `диапазон ${r.bodyFat!.low}–${r.bodyFat!.high} включает ${truth.toFixed(1)}`);
});
