import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES } from '../src/data/exercises';
import { figure } from '../src/features/exercises/anatomy/geometry';
import { DETAIL, HEADS, roleOf, type HeadId } from '../src/features/exercises/anatomy/detail';
import { ACCENTS, paletteFor, type AccentName } from '../src/theme/tokens';
import type { Sex } from '../src/types';
import { readFileSync } from 'node:fs';
import { MUSCLES, MUSCLE_IDS, bothSides, musclesOfSlug } from '../src/features/exercises/anatomy/muscleIds';

const SEXES: Sex[] = ['male', 'female'];

test('Анатомия: у каждого упражнения на фигуре (мужской и женской) подсвечена хотя бы одна работающая мышца', () => {
  for (const sex of SEXES) {
    const shapes = [...figure(sex, 'front'), ...figure(sex, 'back')].filter((s) => s.kind === 'muscle');
    for (const ex of EXERCISES) {
      const P = new Set<string>(ex.primary);
      const S = new Set<string>(ex.secondary);
      const hot = shapes.filter((s) => roleOf(s.base, s.slug, P, S, DETAIL[ex.id]) === 'p');
      assert.ok(hot.length > 0, `${sex}: ${ex.id} — ни одна мышца не подсвечена`);
    }
  }
});

test('Анатомия: каждая группа мышц приложения есть на фигуре', () => {
  const slugs = new Set(EXERCISES.flatMap((e) => [...e.primary, ...e.secondary]));
  for (const sex of SEXES) {
    const drawn = new Set([...figure(sex, 'front'), ...figure(sex, 'back')].map((s) => s.slug).filter(Boolean));
    for (const s of slugs) assert.ok(drawn.has(s), `${sex}: группа «${s}» не нарисована`);
  }
});

test('Анатомия: уточнения по головкам ссылаются на существующие контуры и упражнения', () => {
  const bases = new Set([...figure('male', 'front'), ...figure('male', 'back')].map((s) => s.base));
  for (const h of Object.keys(HEADS) as HeadId[]) for (const sh of HEADS[h].shapes) assert.ok(bases.has(sh), `головка ${h}: нет контура ${sh}`);
  const ids = new Set(EXERCISES.map((e) => e.id));
  for (const id of Object.keys(DETAIL)) assert.ok(ids.has(id), `уточнение для неизвестного упражнения ${id}`);
});

test('Анатомия: женская фигура — те же мышцы, плюс причёска и контур груди', () => {
  for (const side of ['front', 'back'] as const) {
    const m = figure('male', side).filter((s) => s.kind === 'muscle').map((s) => s.id).sort();
    const f = figure('female', side).filter((s) => s.kind === 'muscle').map((s) => s.id).sort();
    assert.deepEqual(f, m, `${side}: набор мышц одинаковый`);
    assert.ok(figure('female', side).some((s) => s.kind === 'hair'), `${side}: причёска`);
  }
  assert.ok(figure('female', 'front').some((s) => s.kind === 'contour'), 'контур груди');
  // пропорции: плечи уже, таз шире
  const width = (sex: Sex, id: string) => {
    const s = figure(sex, 'front').find((x) => x.id === id)!;
    return s.box[2] - s.box[0];
  };
  assert.ok(width('female', 'torso') <= width('male', 'torso'), 'плечи у женской фигуры не шире');
});

test('Анатомия: цвета мышц не зависят от акцента темы (зелёный — работает, светло-жёлтый — слегка)', () => {
  for (const scheme of ['dark', 'light'] as const) {
    const accents = Object.keys(ACCENTS[scheme]) as AccentName[];
    const base = paletteFor(scheme, accents[0]);
    for (const a of accents) {
      const p = paletteFor(scheme, a);
      assert.equal(p.musclePrimary, base.musclePrimary, `${scheme}/${a}: основной цвет`);
      assert.equal(p.muscleSecondary, base.muscleSecondary, `${scheme}/${a}: слегка`);
    }
    // зелёный: G — главная составляющая; жёлтый: R и G высокие, B низкий
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [r1, g1, b1] = rgb(base.musclePrimary);
    assert.ok(g1 > r1 && g1 > b1, `${scheme}: основной — зелёный`);
    const [r2, g2, b2] = rgb(base.muscleSecondary);
    assert.ok(r2 > 180 && g2 > 150 && b2 < 140, `${scheme}: слегка — жёлтый`);
  }
});

// ---- Канонические id мышц (общие для 2D-карты и 3D-моделей) ----

test('Канонические id: формат snake_case, обе стороны с суффиксом .L/.R', () => {
  for (const id of MUSCLE_IDS) {
    assert.match(id, /^[a-z]+(_[a-z]+)*$/, id);
    assert.deepEqual(bothSides(id), [`${id}.L`, `${id}.R`]);
  }
});

test('Канонические id: контуры 2D-фигуры существуют, каждая мышца фигуры имеет канонический id', () => {
  const muscleShapes = new Set([...figure('male', 'front'), ...figure('male', 'back')].filter((s) => s.kind === 'muscle').map((s) => s.base));
  const mapped = new Set<string>();
  for (const id of MUSCLE_IDS) for (const sh of MUSCLES[id].shapes) {
    assert.ok(muscleShapes.has(sh), `${id}: нет контура ${sh}`);
    mapped.add(sh);
  }
  for (const sh of muscleShapes) assert.ok(mapped.has(sh), `контур ${sh} без канонического id`);
  for (const id of MUSCLE_IDS) if (MUSCLES[id].depth === 'superficial') assert.ok(MUSCLES[id].shapes.length > 0 || ['teres_minor'].includes(id), `${id}: поверхностная мышца без контура`);
});

test('Канонические id: у каждой группы приложения есть мышцы', () => {
  const slugs = new Set(EXERCISES.flatMap((e) => [...e.primary, ...e.secondary]));
  for (const s of slugs) assert.ok(musclesOfSlug(s).length > 0, `группа ${s} без канонических мышц`);
});

test('Спецификации демо-роликов: упражнения из каталога, подсветка — канонические id, цикл замкнут', () => {
  const ids = new Set(EXERCISES.map((e) => e.id));
  for (const name of ['machine_row', 'pec_deck']) {
    const spec = JSON.parse(readFileSync(`tools/anatomy3d/exercises/${name}.json`, 'utf8'));
    assert.equal(spec.exercise, name);
    assert.ok(ids.has(spec.exercise), `${name}: нет в каталоге`);
    for (const m of [...spec.highlight.primary, ...spec.highlight.secondary]) assert.ok((MUSCLE_IDS as string[]).includes(m), `${name}: неизвестная мышца ${m}`);
    assert.ok(spec.highlight.primary.length > 0, `${name}: нет основных мышц`);
    const first = spec.phases[0];
    const last = spec.phases[spec.phases.length - 1];
    assert.equal(first.t, 0);
    assert.equal(last.t, 1);
    for (const k of Object.keys(first.joints)) assert.equal(last.joints[k], first.joints[k], `${name}: первая и последняя поза расходятся по ${k}`);
    assert.ok(spec.cameras.length >= 2, `${name}: нужно минимум два ракурса`);
  }
});
