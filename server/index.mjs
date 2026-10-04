// FORM AI Coach — минимальный backend.
// Приложение само считает все числа (калории, тренд веса, объём, readiness) и присылает
// готовый структурированный контекст. Сервер только передаёт его модели и возвращает
// ответ + предложенные изменения плана + факты для долговременной памяти.
//
// Запуск:  ANTHROPIC_API_KEY=... node server/index.mjs   (порт 8787 по умолчанию)
// Опционально: FORM_APP_KEY=секрет — тогда клиент обязан слать заголовок x-form-key.

import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';

const PORT = Number(process.env.PORT || 8787);
const APP_KEY = process.env.FORM_APP_KEY || '';
const MODEL = process.env.FORM_COACH_MODEL || 'claude-opus-5-5';
const client = new Anthropic();

const SYSTEM = `Ты — RYNJI Coach, персональный тренер, нутрициолог-практик и помощник по восстановлению внутри iPhone-приложения RYNJI. У тебя один клиент, и ты знаешь его данные.

Как работать:
- Каждое сообщение пользователя приходит с блоком <context>: профиль, цель, текущий план, питание за сегодня, остаток КБЖУ, тренд веса, выполнение плана, объём по мышцам, прогресс в упражнениях, готовность (readiness), сон, память о пользователе. Все числа в контексте посчитаны приложением и верны — опирайся на них, не пересчитывай и не выдумывай новые метрики.
- Рассуждай по совокупности данных, как опытный тренер: сон + нагрузка вчера + RPE + недельный объём + цель. Не отвечай шаблонно.
- Отвечай по-русски, коротко и конкретно, на «ты». 2–6 предложений или короткий список. Без общих статей, без мотивационной воды, без markdown-заголовков. Можно **жирный** для ключевой цифры.
- Про еду: предлагай конкретные продукты и граммы из тех, что пользователь любит/ест (см. контекст), и считай КБЖУ ТОЛЬКО по таблице «продукты на 100 г» из контекста. Если нужного продукта нет в таблице — давай приблизительную оценку со словом «примерно». Учитывай нелюбимые продукты и ограничения.
- Про тренировки: учитывай готовность, недавно нагруженные группы, ограничения/травмы из профиля и памяти.

Изменения плана (actions):
- Ты не меняешь данные сам. Ты ПРЕДЛАГАЕШЬ action; приложение проверяет его по правилам (исключённые упражнения, ограничения, границы чисел) и показывает пользователю кнопки [Применить] [Не менять]. Недопустимое действие будет отклонено — поэтому сразу предлагай только допустимое.
- Упражнения указывай ТОЛЬКО по id из контекста (раздел «Упражнения сегодня», «План», «Допустимые замены»). Никогда не предлагай упражнения из «Исключено» и движения, запрещённые ограничениями. «Не нравится» — только если нет альтернативы.
- Числа считает приложение: подходы, объём, вес берутся из контекста. Ты выбираешь направление и объясняешь почему.
- Поля action: type, label (подпись кнопки до 40 символов), reason (одно предложение почему). Остальные поля указывай только нужные для типа:
  • set_day_mode: mode = reduced (−15%) | light (−30%, +1 RIR) | recovery (−50%, +2 RIR) | rest; volumeFactor 0.4–1.0; rirDelta 0–3.
  • swap_today / reschedule_workout: templateId из списка шаблонов (пустая строка = отдых сегодня).
  • replace_exercise: exerciseId → toExerciseId (та же мышца и движение, доступное оборудование), scope today|plan.
  • exclude_exercise / favorite_exercise: exerciseId.
  • change_sets (sets 1–6) / change_rep_range (repMin, repMax) / change_rest_time (restSec 30–300): exerciseId, scope.
  • change_target_weight: exerciseId, weightKg (не больше ±15% от последнего рабочего веса).
  • reorder_exercises: order — полный список exerciseId сегодняшней тренировки в новом порядке.
  • reduce_today_volume (volumeFactor 0.4–0.95) / increase_today_volume (1.05–1.25, только при хорошей готовности).
  • change_split: split = auto|fullbody|upper_lower|ppl|ul_ppl.
  • generate_workout: minutes 15–120.
  • apply_deload: только если несколько сигналов усталости/плато сразу, не из-за одного плохого дня.
  • adjust_weekly_volume: muscle (chest, lats, upper_back, front_delts, side_delts, rear_delts, biceps, triceps, quads, hamstrings, glutes, calves, abs), deltaSets −6…+6.
  • adjust_calories: deltaKcal −300…+300 (шаг 50) — только если тренд веса за 2+ недели расходится с целью.
  • suggest_meal: reason — что именно съесть (информационное).
- Не предлагай action без причины. Максимум 3 actions. Не повторяй предложения из раздела «Пользователь отказался».

Память (memory):
- Если пользователь сообщил устойчивую особенность (не любит продукт, предпочитает время тренировок, реакция сустава на упражнение, график, привычки) — добавь её в memory коротко, от третьего лица («Не любит рыбу»). Не дублируй то, что уже есть в памяти. Временные состояния («сегодня устал») в память не пиши.

Безопасность:
- Ты фитнес-помощник, не врач. Не ставь диагнозы как факт.
- Если пользователь сообщает боль в груди, потерю сознания, сильную одышку, острую/сильную боль, травму, онемение, симптомы, похожие на неотложное состояние, — НЕ продолжай тренировочную оптимизацию: скажи остановить нагрузку, при острых симптомах — вызвать скорую (103/112), при травме — обратиться к врачу. safety = true. В этом случае можно предложить action set_day_mode rest.
- Для боли в суставе без острых признаков: исключить болезненные движения, предложить замену, посоветовать специалиста, если боль повторяется.
- Не поддерживай экстремальные дефициты, обезвоживание, препараты.
- Если в контексте указано «повышенное восстановление» или режим Enhanced (AAS): это только контекст для внимательного мониторинга здоровья. Ты можешь: учитывать факт приёма, показывать тренды показателей, сообщать о потенциально неблагоприятной динамике и рекомендовать медицинскую оценку. Ты НЕ: составляешь циклы, не рассчитываешь и не советуешь дозировки, не советуешь увеличить дозы или добавить вещества, не подбираешь препараты от побочных эффектов, не превращаешь анализы в инструкцию по корректировке курса и не утверждаешь, что нормальные анализы делают AAS безопасными. Хороший прогресс — не доказательство, что со здоровьем всё в порядке. Плохой сон, низкая готовность или застой важнее статуса: не увеличивай объём при таких сигналах.

Решения и данные:
- Раздел «РЕШЕНИЯ ТРЕНЕРА» в контексте — результат детерминированных алгоритмов приложения (калории, тренды, прогрессия, объём, пересчёт единиц, история анализов). Объясняй их своими словами со ссылкой на данные и уверенность; не меняй эти числа и не придумывай свои.
- Никогда не выдумывай данные (тренировки, веса, анализы, сон). Если в контексте нужных данных нет — прямо скажи, что данных недостаточно, и что нужно записать.
- Анализы: «выше/ниже референса лаборатории» — не диагноз. Формулируй «Рекомендуется обсудить результат с врачом.» При значимых отклонениях здоровья не предлагай повышать нагрузку. Никогда не советуй начать, добавить или изменить препарат.`;

const ACTION_TYPES = [
  'set_day_mode', 'swap_today', 'adjust_calories', 'replace_exercise', 'exclude_exercise', 'favorite_exercise', 'change_sets', 'change_rep_range',
  'change_target_weight', 'change_rest_time', 'reorder_exercises', 'reduce_today_volume', 'increase_today_volume', 'change_split',
  'reschedule_workout', 'generate_workout', 'apply_deload', 'adjust_weekly_volume', 'suggest_meal',
];
// Обязательны только type/label/reason; параметры — опциональные (лимит structured outputs на union-типы)
const ACTION_FIELDS = ['type', 'label', 'reason'];
const nullable = (t) => t;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'actions', 'memory', 'safety'],
  properties: {
    reply: { type: 'string', description: 'Ответ пользователю' },
    safety: { type: 'boolean', description: 'true, если сработал протокол безопасности' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ACTION_FIELDS,
        properties: {
          type: { type: 'string', enum: ACTION_TYPES },
          label: { type: 'string' },
          reason: { type: 'string' },
          mode: nullable({ type: 'string', enum: ['normal', 'reduced', 'light', 'recovery', 'rest'] }),
          volumeFactor: nullable({ type: 'number' }),
          rirDelta: nullable({ type: 'integer' }),
          templateId: nullable({ type: 'string', description: 'id шаблона; пустая строка = отдых' }),
          deltaKcal: nullable({ type: 'integer' }),
          exerciseId: nullable({ type: 'string' }),
          toExerciseId: nullable({ type: 'string' }),
          scope: nullable({ type: 'string', enum: ['today', 'plan'] }),
          sets: nullable({ type: 'integer' }),
          repMin: nullable({ type: 'integer' }),
          repMax: nullable({ type: 'integer' }),
          weightKg: nullable({ type: 'number' }),
          restSec: nullable({ type: 'integer' }),
          order: nullable({ type: 'array', items: { type: 'string' } }),
          muscle: nullable({ type: 'string' }),
          deltaSets: nullable({ type: 'integer' }),
          split: nullable({ type: 'string', enum: ['auto', 'fullbody', 'upper_lower', 'ppl', 'ul_ppl'] }),
          minutes: nullable({ type: 'integer' }),
        },
      },
    },
    memory: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'category'],
        properties: {
          text: { type: 'string' },
          category: { type: 'string', enum: ['food', 'training', 'injury', 'schedule', 'preference', 'other'] },
        },
      },
    },
  },
};

const INSIGHT_INSTRUCTION = `Сформулируй ОДИН короткий инсайт дня для главного экрана (до 180 символов): самое полезное наблюдение по данным на сегодня — про тренировку, прогрессию веса в упражнении, восстановление или питание. Конкретно, с цифрой, без приветствий. actions и memory — пустые массивы, если нет явной необходимости.`;

function send(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, x-form-key',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 400_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('payload too large'), { status: 413 });
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function textOf(resp) {
  return resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

async function callModel({ history, context, question, summary, memory, mode }) {
  const msgs = [];
  for (const m of (history || []).slice(-16)) {
    if (!m || typeof m.text !== 'string' || !m.text.trim()) continue;
    const role = m.role === 'assistant' ? 'assistant' : 'user';
    if (msgs.length === 0 && role === 'assistant') continue;
    msgs.push({ role, content: m.text.slice(0, 4000) });
  }
  const mem = (memory || []).map((m) => `- ${m}`).join('\n') || '—';
  const final = [
    `<context>\n${String(context || '').slice(0, 60_000)}\n</context>`,
    `<long_term_memory>\n${mem}\n</long_term_memory>`,
    summary ? `<earlier_conversation_summary>\n${String(summary).slice(0, 4000)}\n</earlier_conversation_summary>` : '',
    mode === 'insight' ? INSIGHT_INSTRUCTION : `Сообщение пользователя: ${String(question || '').slice(0, 4000)}`,
  ].filter(Boolean).join('\n\n');
  msgs.push({ role: 'user', content: final });

  const resp = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: mode === 'insight' ? 'low' : 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: msgs,
  });

  if (resp.stop_reason === 'refusal') {
    return { reply: 'Не могу помочь с этим запросом. Спроси про тренировки, питание или восстановление.', actions: [], memory: [], safety: false };
  }
  if (resp.stop_reason === 'max_tokens') throw Object.assign(new Error('truncated'), { status: 502 });
  let parsed;
  try {
    parsed = JSON.parse(textOf(resp));
  } catch {
    throw Object.assign(new Error('bad model output'), { status: 502 });
  }
  return {
    reply: String(parsed.reply || '').trim(),
    safety: !!parsed.safety,
    actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 3) : [],
    memory: Array.isArray(parsed.memory) ? parsed.memory.slice(0, 5) : [],
  };
}

async function summarize({ messages, summary }) {
  const transcript = (messages || []).map((m) => `${m.role === 'assistant' ? 'Coach' : 'User'}: ${String(m.text).slice(0, 1500)}`).join('\n');
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    output_config: { effort: 'low' },
    system: 'Сожми диалог фитнес-тренера с клиентом в краткое резюме (до 800 символов, по-русски): договорённости, изменения плана, жалобы, решения. Без воды.',
    messages: [{ role: 'user', content: `Предыдущее резюме: ${summary || '—'}\n\nНовые сообщения:\n${transcript}` }],
  });
  return { summary: textOf(resp).trim().slice(0, 1200) };
}

// ---------- Распознавание бланков анализов ----------
// Модель ТОЛЬКО переписывает то, что напечатано в бланке (название, значение, единица, референс, флаг).
// Не интерпретирует, не пересчитывает единицы, не добавляет показателей. Приложение затем сопоставляет
// показатели с каталогом, а пользователь ОБЯЗАТЕЛЬНО проверяет всё на экране «Проверьте распознанные данные».
const LAB_SYSTEM = `Ты извлекаешь данные из бланка лабораторных анализов (PDF, фото или скриншот, возможно несколько страниц; любые лаборатории — Инвитро, Хеликс, Гемотест, KDL, CMD, зарубежные и др.).
Правила:
- Переписывай ТОЛЬКО то, что напечатано. Ничего не придумывай, не пересчитывай единицы и не исправляй значения.
- Каждая строка результата: название показателя как в бланке, значение (как напечатано, с запятой или точкой; знаки < > сохраняй), единица как в бланке, референсный интервал как в бланке (refText) и флаг H/L, если в бланке есть пометка (H, L, ↑, ↓, *, «выше», «ниже», выделение).
- Если значение нечитаемо — пропусти строку. Качественные результаты (например «отрицательно») включай со значением-текстом.
- date — дата взятия биоматериала (если нет — дата выполнения/выдачи) в формате YYYY-MM-DD; пустая строка, если не найдена. Дату рождения не путай с датой анализа.
- lab — название лаборатории; пустая строка, если не указана.
- Не добавляй интерпретаций, советов, диагнозов. Только данные.`;

const LAB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['lab', 'date', 'rows'],
  properties: {
    lab: { type: 'string' },
    date: { type: 'string', description: 'YYYY-MM-DD или пустая строка' },
    rows: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'value', 'unit', 'refText', 'flag'],
        properties: {
          name: { type: 'string' },
          value: { type: 'string', description: 'значение как в бланке' },
          unit: { type: 'string' },
          refText: { type: 'string', description: 'референс как в бланке или пустая строка' },
          flag: { type: 'string', enum: ['H', 'L', ''] },
        },
      },
    },
  },
};

const LAB_MEDIA = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']);

async function extractLab({ files }) {
  if (!Array.isArray(files) || files.length === 0 || files.length > 10) throw Object.assign(new Error('files: 1–10'), { status: 400 });
  const content = [];
  for (const f of files) {
    const mediaType = String(f?.mediaType || '');
    const data = String(f?.data || '');
    if (!LAB_MEDIA.has(mediaType) || !data) throw Object.assign(new Error('unsupported file'), { status: 400 });
    content.push(
      mediaType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
        : { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
    );
  }
  content.push({ type: 'text', text: 'Извлеки все результаты анализов из этого бланка (все страницы).' });

  // Многостраничные бланки — длинный вход, поэтому стриминг + finalMessage()
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: LAB_SYSTEM,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: LAB_SCHEMA } },
    messages: [{ role: 'user', content }],
  });
  const resp = await stream.finalMessage();
  if (resp.stop_reason === 'refusal') return { lab: '', date: '', rows: [], refused: true };
  if (resp.stop_reason === 'max_tokens') throw Object.assign(new Error('truncated'), { status: 502 });
  let parsed;
  try {
    parsed = JSON.parse(textOf(resp));
  } catch {
    throw Object.assign(new Error('bad model output'), { status: 502 });
  }
  const rows = (Array.isArray(parsed.rows) ? parsed.rows : []).slice(0, 200).map((r) => ({
    name: String(r?.name || '').slice(0, 120),
    value: String(r?.value || '').slice(0, 40),
    unit: String(r?.unit || '').slice(0, 30),
    refText: String(r?.refText || '').slice(0, 60),
    flag: r?.flag === 'H' || r?.flag === 'L' ? r.flag : '',
  }));
  return { lab: String(parsed.lab || '').slice(0, 60), date: /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : '', rows };
}

function apiError(e) {
  if (e instanceof Anthropic.RateLimitError) return [429, 'rate_limited'];
  if (e instanceof Anthropic.AuthenticationError) return [500, 'server_auth'];
  if (e instanceof Anthropic.BadRequestError) return [502, 'bad_request'];
  if (e instanceof Anthropic.APIConnectionError) return [503, 'upstream_unavailable'];
  if (e instanceof Anthropic.APIError) return [502, 'upstream_error'];
  return [e.status || 500, e.message || 'error'];
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, model: MODEL });
  if (req.method !== 'POST') return send(res, 404, { error: 'not_found' });
  if (APP_KEY && req.headers['x-form-key'] !== APP_KEY) return send(res, 401, { error: 'unauthorized' });
  try {
    const body = await readBody(req, req.url === '/v1/labs/extract' ? 30_000_000 : 400_000);
    if (req.url === '/v1/coach') return send(res, 200, await callModel(body));
    if (req.url === '/v1/summarize') return send(res, 200, await summarize(body));
    if (req.url === '/v1/labs/extract') return send(res, 200, await extractLab(body));
    return send(res, 404, { error: 'not_found' });
  } catch (e) {
    const [status, code] = apiError(e);
    console.error('[coach]', code, e?.message);
    return send(res, status, { error: code });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`FORM Coach server on :${PORT} (model ${MODEL})`));
