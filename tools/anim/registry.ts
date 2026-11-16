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
/** Женская фигура: <id>_f.webp и posters/<id>_f.jpg (рендер SEX=female) */
const hasF = (id: string) => has(`${id}_f`);
/** Ролик собственной анатомической модели (Blender, атлас Z-Anatomy / BodyParts3D, CC BY-SA 4.0): есть спецификация
 *  tools/anatomy3d/exercises/<id>.json. Подсветка — красно-оранжевая (основные) и светло-оранжевая (вспомогательные). */
const ATLAS = (id: string) => fs.existsSync(path.join(ROOT, 'tools/anatomy3d/exercises', `${id}.json`));

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
  ' * 3D-анимации техники (зацикленный WebP, офлайн) и постеры для списков. Собственный рендер RYNJI (tools/anim, tools/anatomy3d).',
  ' * primary / secondary — мышцы, подсвеченные на рендере (зелёные / светло-жёлтые).',
  ' * loopF / posterF — тот же ролик с женской фигурой (для профиля женщины).',
  ' */',
  'export interface ExerciseAnimation {',
  '  loop: number;',
  '  poster: number;',
  '  loopF?: number;',
  '  posterF?: number;',
  "  /** 'atlas' — собственная анатомическая модель (Z-Anatomy / BodyParts3D, CC BY-SA 4.0): подсветка красно-оранжевая, нужна атрибуция */",
  "  source?: 'atlas';",
  '  primary: MuscleSlug[];',
  '  secondary: MuscleSlug[];',
  '  checked: boolean;',
  '}',
  '',
  'export const EXERCISE_ANIMATIONS: Record<string, ExerciseAnimation> = {',
  ...done.map((e) => {
    const atlas = ATLAS(e.id);
    // ролики анатомической модели: легенда — мышцы упражнения из каталога (подсветка в кадре — по головкам мышц)
    const m = atlas ? { primary: e.primary as string[], secondary: e.secondary as string[] } : MOTIONS[e.id];
    if (!m) throw new Error(`нет сцены для ${e.id}`);
    // подсветка сцены не должна расходиться с каталогом: основные мышцы сцены — из основных/вспомогательных упражнения
    const known = new Set<string>([...e.primary, ...e.secondary]);
    const extra = [...m.primary, ...m.secondary].filter((x) => !known.has(x));
    if (extra.length) throw new Error(`${e.id}: подсвечены мышцы не из каталога: ${extra.join(', ')}`);
    const female = hasF(e.id) ? `\n    loopF: require('../../assets/anim/${e.id}_f.webp'),\n    posterF: require('../../assets/anim/posters/${e.id}_f.jpg'),` : '';
    const src = atlas ? `\n    source: 'atlas',` : '';
    return `  ${e.id}: {\n    loop: require('../../assets/anim/${e.id}.webp'),\n    poster: require('../../assets/anim/posters/${e.id}.jpg'),${female}${src}\n    primary: ${q(m.primary)},\n    secondary: ${q(m.secondary)},\n    checked: ${!!manifest[e.id]?.checked},\n  },`;
  }),
  '};',
  '',
].join('\n');
fs.writeFileSync(path.join(ROOT, 'src/data/exerciseAnimations.ts'), ts);

const kb = (id: string) => (has(id) ? `${Math.round(fs.statSync(path.join(ANIM, `${id}.webp`)).size / 1024)} КБ` : '');
const g = (list: string[]) => list.map((x) => GROUP_LABEL[x as keyof typeof GROUP_LABEL] ?? x).join(', ') || '—';
const rows = EXERCISES.map((e) => {
  const m = manifest[e.id];
  return `| ${e.id} | ${e.name} | ${e.pattern}${e.metric === 'time' ? ' · на время' : ''} | ${g(e.primary)} / ${g(e.secondary)} | ${has(e.id) ? `assets/anim/${e.id}.webp (${kb(e.id)})` : '**нет — открытый пункт**'} | ${has(e.id) ? (ATLAS(e.id) ? 'собственная анатомическая модель RYNJI (tools/anatomy3d) на основе Z-Anatomy / BodyParts3D © DBCLS — CC BY-SA 4.0' : 'собственный 3D-рендер RYNJI (tools/anim), права наши') : '—'} | ${has(e.id) ? 'да' : '—'} | ${has(e.id) ? (m?.checked ? 'да' : 'нет') : '—'} |`;
});
const md = [
  '# Реестр 3D-анимаций техники',
  '',
  `Покрытие: **${done.length} из ${EXERCISES.length}** упражнений. Каждое отсутствующее — открытый пункт (не «готово»).`,
  '',
  'Источник всех файлов — собственный 3D-пайплайн RYNJI (`tools/anim`): процедурная анатомическая фигура (three.js), движения по биомеханике упражнения, рендер в headless Chromium (WebGL2) → зацикленный WebP. Сторонние модели, фото и лицензированные анимации не используются. Воспроизведение офлайн (файлы в сборке).',
  '',
  'Подсветка: основные мышцы — зелёные, вспомогательные — светло-жёлтые, остальные — серые (те же цвета, что у анатомической карты приложения, в любой теме). У каждого ролика есть версия с женской фигурой (`<id>_f.webp`) — для профиля женщины.',
  '',
  'Ролики собственной анатомической модели (`tools/anatomy3d`, демонстрационный этап: `machine_row`, `pec_deck`) — Blender, модели из открытого атласа Z-Anatomy / BodyParts3D: основные мышцы — красно-оранжевые, вспомогательные — светло-оранжевые, остальное — серо-белое, белый фон (как на референсах). Лицензия CC BY-SA 4.0, атрибуция показывается под роликом.',
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
