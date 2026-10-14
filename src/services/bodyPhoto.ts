import type { ISODate } from '@/types';
import type { ProgressPhoto } from '@/stores/body';
import { parsePhotoAnalysis, type PhotoAnalysis } from '@/features/progress/body';
import { uid } from '@/utils/id';
import { CoachApiError, coachBaseUrl } from './coachApi';
import { readBase64 } from './labExtract';

/**
 * Анализ фото прогресса на сервере RYNJI (если подключён в сборке). Отправляются только последние фото
 * каждого ракурса и короткий контекст (пол, возраст, рост, вес, замеры) — по явному нажатию пользователя.
 * Ответ модели проверяется на устройстве (parsePhotoAnalysis) и хранится только здесь.
 */
export const photoAnalysisAvailable = () => !!coachBaseUrl();

const MAX_B64 = 6_500_000; // ≈ 4,8 МБ JPEG — лимит одного изображения в API с запасом

/** Последнее фото каждого ракурса (до 3) */
export function latestByPose(photos: ProgressPhoto[]): ProgressPhoto[] {
  const out: ProgressPhoto[] = [];
  for (const pose of ['front', 'side', 'back'] as const) {
    const p = photos.filter((x) => x.pose === pose).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt))[0];
    if (p) out.push(p);
  }
  return out;
}

export async function analyzeBodyPhotos(photos: ProgressPhoto[], context: string, today: ISODate): Promise<PhotoAnalysis> {
  const base = coachBaseUrl();
  if (!base) throw new CoachApiError('not_configured', 'Анализ фото недоступен в этой сборке');
  const picked = latestByPose(photos);
  if (!picked.length) throw new CoachApiError('bad_response', 'Добавь хотя бы одно фото');
  const files = [];
  for (const p of picked) {
    const data = await readBase64(p.uri);
    if (data.length > MAX_B64) throw new CoachApiError('bad_response', 'Фото слишком большое — сними заново или выбери другое');
    files.push({ pose: p.pose, date: p.date, mediaType: /\.png$/i.test(p.uri) ? 'image/png' : 'image/jpeg', data });
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 150_000);
  let res: Response;
  try {
    res = await fetch(`${base}/v1/body/analyze`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(process.env.EXPO_PUBLIC_COACH_KEY ? { 'x-form-key': process.env.EXPO_PUBLIC_COACH_KEY } : {}) },
      body: JSON.stringify({ photos: files, context }),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new CoachApiError('timeout', 'Анализ занял слишком много времени');
    throw new CoachApiError('offline', 'Нет связи с сервером');
  } finally {
    clearTimeout(t);
  }
  if (res.status === 429) throw new CoachApiError('rate_limited', 'Слишком много запросов, попробуй через минуту');
  if (!res.ok) throw new CoachApiError('server', `Сервер ответил ошибкой ${res.status}`);
  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    throw new CoachApiError('bad_response', 'Некорректный ответ сервера');
  }
  const a = parsePhotoAnalysis(raw, { id: uid('pa_'), date: today, createdAt: Date.now(), photoIds: picked.map((p) => p.id) });
  if (!a) throw new CoachApiError('bad_response', 'Некорректный ответ сервера');
  return a;
}
