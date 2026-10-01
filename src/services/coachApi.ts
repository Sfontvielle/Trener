import { useProfile } from '@/stores/profile';

import type { CoachActionType, VolumeMuscle } from '@/types';

/** Действие, как его возвращает модель: параметры необязательны (приложение валидирует) */
export interface CoachApiAction {
  type: CoachActionType;
  label: string;
  reason: string;
  mode?: 'normal' | 'reduced' | 'light' | 'recovery' | 'rest' | null;
  volumeFactor?: number | null;
  rirDelta?: number | null;
  templateId?: string | null;
  deltaKcal?: number | null;
  exerciseId?: string | null;
  toExerciseId?: string | null;
  scope?: 'today' | 'plan' | null;
  sets?: number | null;
  repMin?: number | null;
  repMax?: number | null;
  weightKg?: number | null;
  restSec?: number | null;
  order?: string[] | null;
  muscle?: VolumeMuscle | string | null;
  deltaSets?: number | null;
  split?: 'auto' | 'fullbody' | 'upper_lower' | 'ppl' | 'ul_ppl' | null;
  minutes?: number | null;
}

export interface CoachApiResponse {
  reply: string;
  safety: boolean;
  actions: CoachApiAction[];
  memory: { text: string; category: 'food' | 'training' | 'injury' | 'schedule' | 'preference' | 'other' }[];
}

export class CoachApiError extends Error {
  constructor(
    public kind: 'not_configured' | 'offline' | 'timeout' | 'server' | 'rate_limited' | 'bad_response',
    message: string,
  ) {
    super(message);
  }
}

export function coachBaseUrl(): string {
  const fromSettings = useProfile.getState().settings.coachApiUrl?.trim();
  const fromEnv = process.env.EXPO_PUBLIC_COACH_API_URL?.trim();
  return (fromSettings || fromEnv || '').replace(/\/+$/, '');
}

async function post<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
  const base = coachBaseUrl();
  if (!base) throw new CoachApiError('not_configured', 'Адрес AI-сервера не настроен');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(process.env.EXPO_PUBLIC_COACH_KEY ? { 'x-form-key': process.env.EXPO_PUBLIC_COACH_KEY } : {}) },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new CoachApiError('timeout', 'AI-сервер не ответил вовремя');
    throw new CoachApiError('offline', 'Нет связи с AI-сервером');
  } finally {
    clearTimeout(t);
  }
  if (res.status === 429) throw new CoachApiError('rate_limited', 'Слишком много запросов, попробуй через минуту');
  if (!res.ok) throw new CoachApiError('server', `AI-сервер ответил ошибкой ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new CoachApiError('bad_response', 'Некорректный ответ AI-сервера');
  }
}

export async function askCoach(payload: {
  history: { role: 'user' | 'assistant'; text: string }[];
  context: string;
  question?: string;
  summary?: string;
  memory: string[];
  mode: 'chat' | 'insight';
}): Promise<CoachApiResponse> {
  const r = await post<CoachApiResponse>('/v1/coach', payload, payload.mode === 'insight' ? 30000 : 90000);
  if (!r || typeof r.reply !== 'string' || !r.reply.trim()) throw new CoachApiError('bad_response', 'Пустой ответ AI');
  return { reply: r.reply, safety: !!r.safety, actions: Array.isArray(r.actions) ? r.actions : [], memory: Array.isArray(r.memory) ? r.memory : [] };
}

export async function summarizeConversation(messages: { role: string; text: string }[], summary: string): Promise<string> {
  const r = await post<{ summary: string }>('/v1/summarize', { messages, summary }, 60000);
  return typeof r?.summary === 'string' ? r.summary : summary;
}

export function coachErrorText(e: unknown): string {
  if (e instanceof CoachApiError) {
    if (e.kind === 'not_configured') return 'AI-сервер не подключён (Профиль → AI Coach). Ниже — ответ по расчётам FORM.';
    if (e.kind === 'offline') return 'Нет связи с AI. Ниже — ответ по расчётам FORM без AI.';
    if (e.kind === 'timeout') return 'AI долго не отвечает. Ниже — ответ по расчётам FORM.';
    if (e.kind === 'rate_limited') return e.message;
    return 'AI временно недоступен. Ниже — ответ по расчётам FORM.';
  }
  return 'AI временно недоступен.';
}
