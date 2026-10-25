/**
 * Реестр 3D-анимаций: сверяет каталог упражнений с файлами assets/anim и пишет
 *  - src/data/exerciseAnimations.ts — карта id → анимация и постер (статичные require для Metro);
 *  - docs/ANIMATION_COVERAGE.md — полный реестр покрытия, без пропусков.
 * Запуск: npx tsx tools/anim/registry.ts
 */
import fs from 'fs';
import path from 'path';
import { EXERCISES, GROUP_LABEL } from '../../src/data/exercises';

const ROOT = path.resolve(__dirname, '../..');
const ANIM = path.join(ROOT, 'assets/anim');
const manifest: Record<string, { checked?: boolean; camera?: string; notes?: string }> = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const has = (id: string) => fs.existsSync(path.join(ANIM, `${id}.webp`)) && fs.existsSync(path.join(ANIM, 'posters', `${id}.jpg`));

async function main() {
// подсветка мышц берётся из самих сцен — легенда в приложении совпадает с тем, что окрашено на рендере
const { MOTIONS } = (await import('./web/motions.js')) as { MOTIONS: Record<string, { primary: string[]; secondary: string[] }> };
const done = EXERCISES.filter((e) => has(e.id));
const q = (a: string[]) => `[${a.map((x) => `'${x}'`).join(', ')}]`;
const ts = [
  '// Сгенерировано tools/anim/registry.ts — не редактировать вручную.',
  "import type { MuscleSlug } from '@/types';",
  '',
  '/**',
  ' * 3D-анимации техники (зацикленный WebP, офлайн) и постеры для списков. Собственный рендер RYNJI (tools/anim).',
  ' * primary / secondary — мышцы, подсвеченные на рендере (ярко-зелёные / бледные).',
  ' */',
  'export interface ExerciseAnimation {',
  '  loop: number;',
  '  poster: number;',
  '  primary: MuscleSlug[];',
  '  secondary: MuscleSlug[];',
  '  checked: boolean;',
  '}',
  '',
  'export const EXERCISE_ANIMATIONS: Record<string, ExerciseAnimation> = {',
  ...done.map((e) => {
    const m = MOTIONS[e.id];
    if (!m) throw new Error(`нет сцены для ${e.id}`);
    // подсветка сцены не должна расходиться с каталогом: основные мышцы сцены — из основных/вспомогательных упражнения
    const known = new Set<string>([...e.primary, ...e.secondary]);
    const extra = [...m.primary, ...m.secondary].filter((x) => !known.has(x));
    if (extra.length) throw new Error(`${e.id}: подсвечены мышцы не из каталога: ${extra.join(', ')}`);
    return `  ${e.id}: {\n    loop: require('../../assets/anim/${e.id}.webp'),\n    poster: require('../../assets/anim/posters/${e.id}.jpg'),\n    primary: ${q(m.primary)},\n    secondary: ${q(m.secondary)},\n    checked: ${!!manifest[e.id]?.checked},\n  },`;
  }),
  '};',
  '',
].join('\n');
fs.writeFileSync(path.join(ROOT, 'src/data/exerciseAnimations.ts'), ts);

const kb = (id: string) => (has(id) ? `${Math.round(fs.statSync(path.join(ANIM, `${id}.webp`)).size / 1024)} КБ` : '');
const g = (list: string[]) => list.map((x) => GROUP_LABEL[x as keyof typeof GROUP_LABEL] ?? x).join(', ') || '—';
const rows = EXERCISES.map((e) => {
  const m = manifest[e.id];
  return `| ${e.id} | ${e.name} | ${e.pattern}${e.metric === 'time' ? ' · на время' : ''} | ${g(e.primary)} / ${g(e.secondary)} | ${has(e.id) ? `assets/anim/${e.id}.webp (${kb(e.id)})` : '**нет — открытый пункт**'} | ${has(e.id) ? 'собственный 3D-рендер RYNJI (tools/anim), права наши' : '—'} | ${has(e.id) ? 'да' : '—'} | ${has(e.id) ? (m?.checked ? 'да' : 'нет') : '—'} |`;
});
const md = [
  '# Реестр 3D-анимаций техники',
  '',
  `Покрытие: **${done.length} из ${EXERCISES.length}** упражнений. Каждое отсутствующее — открытый пункт (не «готово»).`,
  '',
  'Источник всех файлов — собственный 3D-пайплайн RYNJI (`tools/anim`): процедурная анатомическая фигура (three.js), движения по биомеханике упражнения, рендер в headless Chromium (WebGL2) → зацикленный WebP. Сторонние модели, фото и лицензированные анимации не используются. Воспроизведение офлайн (файлы в сборке).',
  '',
  'Подсветка: основные мышцы — ярко-зелёные, вспомогательные — бледно-жёлто-зелёные, остальные — серые.',
  '',
  '| exercise_id | название | тип | мышцы (основные / вспомогательные) | animation_asset | источник / лицензия | offline_ok | checked |',
  '|---|---|---|---|---|---|---|---|',
  ...rows,
  '',
  '## Проверка биомеханики',
  '',
  ...done.map((e) => `- **${e.name}** (\`${e.id}\`): ${manifest[e.id]?.notes ?? 'нет заметок'}${manifest[e.id]?.camera ? ` Ракурс: ${manifest[e.id]!.camera}.` : ''}`),
  '',
].join('\n');
fs.writeFileSync(path.join(ROOT, 'docs/ANIMATION_COVERAGE.md'), md);
console.log(`анимаций: ${done.length}/${EXERCISES.length}`);
}

void main();
