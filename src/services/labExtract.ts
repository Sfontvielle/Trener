import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import type { ISODate, LabReport } from '@/types';
import { draftFromExtracted, draftFromParsed, type ExtractedLab, type LabDraft } from '@/features/labs/report';
import { parseLabText } from '@/features/labs/parse';
import { CoachApiError, coachBaseUrl } from './coachApi';

/**
 * Загрузка анализов: PDF / фото / скриншоты (несколько страниц).
 * • Текст (вставка из PDF или сообщения лаборатории) разбирается на устройстве детерминированно — parseLabText.
 * • PDF и изображения распознаёт сервер RYNJI (если он подключён в сборке): модель только переписывает бланк.
 * В любом случае результат — ЧЕРНОВИК: пользователь проверяет и правит его на экране «Проверьте распознанные данные».
 */
export interface LabFile {
  name: string;
  mediaType: string;
  data: string;
}

const MAX_BYTES = 20 * 1024 * 1024;

export const labRecognitionAvailable = () => !!coachBaseUrl();

function mediaTypeOf(name: string, mime?: string | null): string {
  const m = (mime || '').toLowerCase();
  if (m === 'application/pdf' || /\.pdf$/i.test(name)) return 'application/pdf';
  if (m === 'image/png' || /\.png$/i.test(name)) return 'image/png';
  if (m === 'image/webp' || /\.webp$/i.test(name)) return 'image/webp';
  if (m === 'image/heic' || m === 'image/heif' || /\.hei[cf]$/i.test(name)) return 'image/heic';
  return 'image/jpeg';
}

async function readBase64(uri: string, webFile?: Blob): Promise<string> {
  if (Platform.OS === 'web') {
    const blob = webFile ?? (await (await fetch(uri)).blob());
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result).replace(/^data:[^,]*,/, ''));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  return await new File(uri).base64();
}

/** PDF или изображения из «Файлов» */
export async function pickLabDocuments(): Promise<LabFile[] | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return null;
  const out: LabFile[] = [];
  for (const a of res.assets.slice(0, 10)) {
    if (a.size && a.size > MAX_BYTES) throw new Error(`Файл «${a.name}» больше 20 МБ`);
    const mediaType = mediaTypeOf(a.name, a.mimeType);
    if (mediaType === 'image/heic') throw new Error('Формат HEIC не поддерживается — выберите фото из галереи (оно будет сконвертировано) или сделайте скриншот');
    out.push({ name: a.name, mediaType, data: await readBase64(a.uri, a.file) });
  }
  return out;
}

/** Фото бланка: камера или галерея (несколько страниц). JPEG, без редактирования */
export async function pickLabPhotos(camera: boolean): Promise<LabFile[] | null> {
  const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error(camera ? 'Нет доступа к камере — разрешите его в настройках' : 'Нет доступа к фото — разрешите его в настройках');
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.8, base64: true, allowsMultipleSelection: !camera, selectionLimit: 10 };
  const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets?.length) return null;
  const out: LabFile[] = [];
  for (const [i, a] of r.assets.entries()) {
    const data = a.base64 ?? (await readBase64(a.uri, (a as { file?: Blob }).file));
    out.push({ name: a.fileName ?? `page-${i + 1}.jpg`, mediaType: 'image/jpeg', data });
  }
  return out;
}

/** Распознать файлы на сервере → черновик */
export async function recognizeLabFiles(files: LabFile[], today: ISODate): Promise<LabDraft> {
  const base = coachBaseUrl();
  if (!base) throw new CoachApiError('not_configured', 'Распознавание файлов недоступно');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 180_000);
  let res: Response;
  try {
    res = await fetch(`${base}/v1/labs/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(process.env.EXPO_PUBLIC_COACH_KEY ? { 'x-form-key': process.env.EXPO_PUBLIC_COACH_KEY } : {}) },
      body: JSON.stringify({ files: files.map((f) => ({ mediaType: f.mediaType, data: f.data })) }),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new CoachApiError('timeout', 'Распознавание заняло слишком много времени');
    throw new CoachApiError('offline', 'Нет связи с сервером распознавания');
  } finally {
    clearTimeout(t);
  }
  if (res.status === 429) throw new CoachApiError('rate_limited', 'Слишком много запросов, попробуйте через минуту');
  if (!res.ok) throw new CoachApiError('server', `Сервер распознавания ответил ошибкой ${res.status}`);
  let body: ExtractedLab & { refused?: boolean };
  try {
    body = await res.json();
  } catch {
    throw new CoachApiError('bad_response', 'Некорректный ответ сервера распознавания');
  }
  const kind: LabReport['source']['kind'] = files.some((f) => f.mediaType === 'application/pdf') ? 'pdf' : 'image';
  return draftFromExtracted(body, { kind, files: files.map((f) => f.name), pages: files.length }, today);
}

/** Вставленный текст → черновик (на устройстве) */
export function draftFromText(text: string, today: ISODate): LabDraft {
  return draftFromParsed(parseLabText(text), { kind: 'text' }, today);
}

/** Пустой черновик для ручного ввода */
export function manualDraft(today: ISODate): LabDraft {
  return { date: today, lab: '', source: { kind: 'manual' }, rows: [] };
}
