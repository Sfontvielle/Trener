/**
 * Канонические id мышц → tools/anatomy3d/muscles.json для скриптов Blender (обе стороны, подпись, группа приложения).
 * Запуск: npx tsx tools/anatomy3d/export-muscles.ts
 */
import fs from 'fs';
import path from 'path';
import { MUSCLES, MUSCLE_IDS, bothSides } from '../../src/features/exercises/anatomy/muscleIds';

const out = MUSCLE_IDS.map((id) => ({ id, sided: bothSides(id), label: MUSCLES[id].label, slug: MUSCLES[id].slug, view: MUSCLES[id].view, depth: MUSCLES[id].depth }));
const file = path.join(__dirname, 'muscles.json');
fs.writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(`мышц: ${out.length} → ${path.relative(process.cwd(), file)}`);
