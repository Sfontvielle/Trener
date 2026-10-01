import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useProfile } from '@/stores/profile';
import { usePlan } from '@/stores/plan';
import { useCheckins } from '@/stores/checkins';
import { useBody } from '@/stores/body';
import { useNutrition } from '@/stores/nutrition';
import { useWorkouts } from '@/stores/workouts';
import { useCoach } from '@/stores/coach';
import { today } from '@/utils/date';

/**
 * Резервная копия всех локальных данных в один JSON-файл.
 * Данные FORM живут только на iPhone — копия защищает от потери телефона и переустановки.
 */
const FORMAT = 'form-backup';
const VERSION = 1;

export interface BackupFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  data: {
    profile: { profile: unknown; settings: unknown };
    plan: { plan: unknown; target: unknown; overrides: unknown; adjustments: unknown };
    checkins: { byDate: unknown };
    body: { weights: unknown; metrics: unknown };
    nutrition: { entries: unknown; products: unknown; recent: unknown; lastGrams: unknown };
    workouts: { sessions: unknown; draft: unknown; customExercises: unknown };
    coach: { messages: unknown; summary: unknown; summarizedUntil: unknown; memory: unknown };
  };
}

export function buildBackup(): BackupFile {
  const p = useProfile.getState();
  const pl = usePlan.getState();
  const n = useNutrition.getState();
  const w = useWorkouts.getState();
  const c = useCoach.getState();
  const b = useBody.getState();
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      profile: { profile: p.profile, settings: p.settings },
      plan: { plan: pl.plan, target: pl.target, overrides: pl.overrides, adjustments: pl.adjustments },
      checkins: { byDate: useCheckins.getState().byDate },
      body: { weights: b.weights, metrics: b.metrics },
      nutrition: { entries: n.entries, products: n.products, recent: n.recent, lastGrams: n.lastGrams },
      // активная тренировка не входит в копию — это незавершённое состояние
      workouts: { sessions: w.sessions, draft: w.draft, customExercises: w.customExercises },
      coach: { messages: c.messages, summary: c.summary, summarizedUntil: c.summarizedUntil, memory: c.memory },
    },
  };
}

export function backupStats(b: BackupFile): string {
  const d = b.data as any;
  const s = (d.workouts?.sessions ?? []).length;
  const f = (d.nutrition?.entries ?? []).length;
  const w = (d.body?.weights ?? []).length;
  return `${s} тренировок · ${f} записей еды · ${w} взвешиваний`;
}

export async function exportBackup(): Promise<'shared' | 'downloaded'> {
  const json = JSON.stringify(buildBackup());
  const name = `form-backup-${today()}.json`;
  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return 'downloaded';
  }
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Шаринг недоступен на этом устройстве');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Резервная копия FORM' });
  return 'shared';
}

export function parseBackup(text: string): BackupFile {
  let obj: any;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('Файл повреждён или это не JSON');
  }
  if (!obj || obj.format !== FORMAT || typeof obj.version !== 'number' || !obj.data) throw new Error('Это не резервная копия FORM');
  if (obj.version > VERSION) throw new Error('Копия сделана более новой версией FORM — обнови приложение');
  if (!obj.data.profile?.profile) throw new Error('В копии нет профиля');
  return obj as BackupFile;
}

/** Выбор файла → разбор. Возвращает null, если пользователь отменил выбор */
export async function pickBackup(): Promise<BackupFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], copyToCacheDirectory: true });
  if (res.canceled) return null;
  const asset = res.assets[0];
  const text = Platform.OS === 'web' && asset.file ? await asset.file.text() : await new File(asset.uri).text();
  return parseBackup(text);
}

/** Полная замена локальных данных содержимым копии */
export function restoreBackup(b: BackupFile): void {
  const d = b.data as any;
  const arr = (x: unknown) => (Array.isArray(x) ? x : []);
  const obj = (x: unknown): Record<string, any> => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, any>) : {});
  useProfile.setState({ profile: d.profile.profile, settings: { ...useProfile.getState().settings, ...obj(d.profile.settings) } });
  usePlan.setState({ plan: d.plan?.plan ?? null, target: d.plan?.target ?? null, overrides: obj(d.plan?.overrides), adjustments: arr(d.plan?.adjustments) });
  useCheckins.setState({ byDate: obj(d.checkins?.byDate) });
  useBody.setState({ weights: arr(d.body?.weights), metrics: arr(d.body?.metrics) });
  useNutrition.setState({ entries: arr(d.nutrition?.entries), products: obj(d.nutrition?.products), recent: arr(d.nutrition?.recent), lastGrams: obj(d.nutrition?.lastGrams) });
  useWorkouts.setState({ sessions: arr(d.workouts?.sessions), draft: d.workouts?.draft ?? null, customExercises: arr(d.workouts?.customExercises), active: null, rest: null });
  useCoach.setState({ messages: arr(d.coach?.messages), summary: d.coach?.summary ?? '', summarizedUntil: d.coach?.summarizedUntil ?? 0, memory: arr(d.coach?.memory), insight: null });
}
