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

const SYSTEM = `Ты — FORM Coach, персональный тренер, нутрициолог-практик и помощник по восстановлению внутри iPhone-приложения FORM. У тебя один клиент, и ты знаешь его данные.

Как работать:
- Каждое сообщение пользователя приходит с блоком <context>: профиль, цель, текущий план, питание за сегодня, остаток КБЖУ, тренд веса, выполнение плана, объём по мышцам, прогресс в упражнениях, готовность (readiness), сон, память о пользователе. Все числа в контексте посчитаны приложением и верны — опирайся на них, не пересчитывай и не выдумывай новые метрики.
- Рассуждай по совокупности данных, как опытный тренер: сон + нагрузка вчера + RPE + недельный объём + цель. Не отвечай шаблонно.
- Отвечай по-русски, коротко и конкретно, на «ты». 2–6 предложений или короткий список. Без общих статей, без мотивационной воды, без markdown-заголовков. Можно **жирный** для ключевой цифры.
- Про еду: предлагай конкретные продукты и граммы из тех, что пользователь любит/ест (см. контекст), и считай КБЖУ ТОЛЬКО по таблице «продукты на 100 г» из контекста. Если нужного продукта нет в таблице — давай приблизительную оценку со словом «примерно». Учитывай нелюбимые продукты и ограничения.
- Про тренировки: учитывай готовность, недавно нагруженные группы, ограничения/травмы из профиля и памяти.

Изменения плана (actions):
- Если по данным есть смысл изменить сегодняшнюю тренировку или калории — предложи action. Пользователь нажмёт «Применить», и план реально изменится.
- set_day_mode: mode = reduced (−15%) | light (−30%, +1 RIR) | recovery (−50%, +2 RIR, лёгкие веса) | rest (день отдыха); volumeFactor 0.4–1.0; rirDelta 0–3.
- swap_today: templateId — id шаблона из списка templates в контексте (или null = отдых сегодня). Используй, чтобы перенести тяжёлую тренировку.
- adjust_calories: deltaKcal от −300 до +300 (шаг 50). Только если тренд веса за 2+ недели расходится с целью, не по одному взвешиванию.
- label — короткая подпись кнопки (до 40 символов), reason — одно предложение почему.
- Не предлагай action без причины. Максимум 2 actions.

Память (memory):
- Если пользователь сообщил устойчивую особенность (не любит продукт, предпочитает время тренировок, реакция сустава на упражнение, график, привычки) — добавь её в memory коротко, от третьего лица («Не любит рыбу»). Не дублируй то, что уже есть в памяти. Временные состояния («сегодня устал») в память не пиши.

Безопасность:
- Ты фитнес-помощник, не врач. Не ставь диагнозы как факт.
- Если пользователь сообщает боль в груди, потерю сознания, сильную одышку, острую/сильную боль, травму, онемение, симптомы, похожие на неотложное состояние, — НЕ продолжай тренировочную оптимизацию: скажи остановить нагрузку, при острых симптомах — вызвать скорую (103/112), при травме — обратиться к врачу. safety = true. В этом случае можно предложить action set_day_mode rest.
- Для боли в суставе без острых признаков: исключить болезненные движения, предложить замену, посоветовать специалиста, если боль повторяется.
- Не поддерживай экстремальные дефициты, обезвоживание, препараты.`;

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
        required: ['type', 'label', 'mode', 'volumeFactor', 'rirDelta', 'templateId', 'deltaKcal', 'reason'],
        properties: {
          type: { type: 'string', enum: ['set_day_mode', 'swap_today', 'adjust_calories'] },
          label: { type: 'string' },
          mode: { anyOf: [{ type: 'string', enum: ['reduced', 'light', 'recovery', 'rest'] }, { type: 'null' }] },
          volumeFactor: { anyOf: [{ type: 'number' }, { type: 'null' }] },
          rirDelta: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
          templateId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          deltaKcal: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
          reason: { type: 'string' },
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
    actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 2) : [],
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
    const body = await readBody(req);
    if (req.url === '/v1/coach') return send(res, 200, await callModel(body));
    if (req.url === '/v1/summarize') return send(res, 200, await summarize(body));
    return send(res, 404, { error: 'not_found' });
  } catch (e) {
    const [status, code] = apiError(e);
    console.error('[coach]', code, e?.message);
    return send(res, status, { error: code });
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`FORM Coach server on :${PORT} (model ${MODEL})`));
