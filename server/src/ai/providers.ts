/**
 * The AI providers ZenPort can talk to, behind one small interface: list the
 * models a key can use, and ask for one structured (JSON) answer - with the
 * provider's own web search when a feature needs it and the provider has it.
 *
 * - OpenAI and OpenRouter: the chat completions API with a strict JSON schema;
 *   web search through OpenAI's Responses API / OpenRouter's web plugin.
 * - Anthropic: the Messages API; the answer comes back as a forced tool call
 *   whose input is the schema. Web search is Anthropic's own server tool.
 * - Google Gemini: generateContent with a JSON schema; web search is Google
 *   Search grounding (which cannot be combined with a schema, so the JSON is
 *   asked for in words and read out of the text).
 * - Any OpenAI-compatible server (Ollama, LM Studio, vLLM...) at an address
 *   the admin gives: strict schema if it supports one, plain JSON mode if not.
 *
 * Everything here is user-initiated; nothing is sent to anyone otherwise.
 */
import type { AiProvider } from '@zenport/shared';

export interface AiTarget {
  provider: AiProvider;
  /** Empty for a local server that needs none. */
  apiKey: string;
  /** Only for 'compatible': the server's OpenAI-style base URL (…/v1). */
  baseUrl?: string | null;
  model: string;
}

export interface AiJsonRequest {
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  /** Let the model look things up on the web first, where the provider can. */
  webSearch?: boolean;
  maxTokens?: number;
}

export interface AiClient {
  /** The chat models this key can use, best first. Throws AiError on a bad key. */
  listModels: (t: Omit<AiTarget, 'model'>) => Promise<string[]>;
  chatJson: (t: AiTarget, req: AiJsonRequest) => Promise<unknown>;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const PROVIDER_NAME: Record<AiProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Google Gemini',
  openrouter: 'OpenRouter',
  compatible: 'your AI server',
};

export const WEB_SEARCH: Record<AiProvider, boolean> = {
  openai: true,
  anthropic: true,
  gemini: true,
  openrouter: true,
  compatible: false,
};

const TIMEOUT = 240_000;

async function failure(res: Response, provider: AiProvider): Promise<AiError> {
  let detail = '';
  try {
    const body = (await res.json()) as {
      error?: { message?: string } | string;
      message?: string;
    };
    detail =
      typeof body.error === 'string' ? body.error : (body.error?.message ?? body.message ?? '');
  } catch {
    /* not json */
  }
  const who = PROVIDER_NAME[provider];
  if (res.status === 401 || res.status === 403) {
    return new AiError(`${who} did not accept that key.`, 400);
  }
  if (res.status === 429) {
    return new AiError(`${who} says the key is out of credit or rate-limited.`, 429);
  }
  if (res.status === 404 && detail) {
    return new AiError(`${who}: ${detail}`, 400);
  }
  return new AiError(`${who} returned ${res.status}${detail ? `: ${detail}` : ''}`, 502);
}

async function call(
  provider: AiProvider,
  url: string,
  init: RequestInit & { timeout?: number },
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(init.timeout ?? TIMEOUT) });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') throw err;
    throw new AiError(`Could not reach ${PROVIDER_NAME[provider]}.`, 502);
  }
  if (!res.ok) throw await failure(res, provider);
  return res.json();
}

/** A JSON answer written as text: bare, fenced, or wrapped in words. */
export function parseJsonText(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    /* look inside */
  }
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]!);
    } catch {
      /* keep looking */
    }
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1));
    } catch {
      /* give up below */
    }
  }
  throw new AiError('The answer was not the JSON that was asked for. Try again.', 502);
}

const inWords = (schema: Record<string, unknown>) =>
  `\n\nAnswer with one JSON object and nothing else. It must match this JSON Schema:\n${JSON.stringify(schema)}`;

// ── Ranking the models worth offering ─────────────────────────────────────

const version = (id: string) =>
  (id.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).reduce((a, n, i) => a + n / 10 ** (i * 3), 0);

function rankBy(ids: string[], families: RegExp[]): string[] {
  const fam = (id: string) => {
    const i = families.findIndex((r) => r.test(id));
    return i === -1 ? families.length : i;
  };
  return [...ids].sort((a, b) => fam(a) - fam(b) || version(b) - version(a) || a.localeCompare(b));
}

const OPENAI_PREFERRED = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.2',
  'gpt-5.1',
  'gpt-5',
  'gpt-5-mini',
  'gpt-4.1',
  'gpt-4o',
];

export function rankModels(provider: AiProvider, all: string[]): string[] {
  switch (provider) {
    case 'openai': {
      const usable = all.filter(
        (m) =>
          /^(gpt-|o\d)/.test(m) &&
          !/(image|audio|realtime|tts|transcribe|search|embedding|instruct|codex|preview|live|\d{4}-\d{2}-\d{2}|-\d{4}$)/.test(
            m,
          ),
      );
      const rank = (m: string) => {
        const i = OPENAI_PREFERRED.indexOf(m);
        return i === -1 ? OPENAI_PREFERRED.length : i;
      };
      return usable.sort((a, b) => rank(a) - rank(b) || b.localeCompare(a));
    }
    case 'anthropic':
      return rankBy(
        all.filter((m) => /^claude-/.test(m)),
        [/sonnet/, /opus/, /haiku/],
      );
    case 'gemini':
      return rankBy(
        all.filter(
          (m) =>
            /^gemini-/.test(m) &&
            !/(embedding|image|tts|audio|live|vision|aqa|learnlm|thinking-exp)/.test(m),
        ),
        [/-pro(?!.*lite)/, /-flash(?!-lite)/, /flash-lite/],
      );
    case 'openrouter':
      return rankBy(all, [
        /^anthropic\/claude-sonnet/,
        /^openai\/gpt-5/,
        /^google\/gemini-[\d.]+-pro/,
        /^anthropic\/claude-opus/,
        /^google\/gemini-[\d.]+-flash/,
        /^anthropic\//,
        /^openai\//,
        /^google\//,
        /^(meta-llama|mistralai|deepseek|qwen)\//,
      ]);
    case 'compatible':
      return [...all].sort((a, b) => a.localeCompare(b));
  }
}

// ── The providers ─────────────────────────────────────────────────────────

const OPENAI = 'https://api.openai.com/v1';
const OPENROUTER = 'https://openrouter.ai/api/v1';
const ANTHROPIC = 'https://api.anthropic.com/v1';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';

function chatBase(t: Omit<AiTarget, 'model'>): string {
  if (t.provider === 'openrouter') return OPENROUTER;
  if (t.provider === 'compatible') return (t.baseUrl ?? '').replace(/\/+$/, '');
  return OPENAI;
}

function chatHeaders(t: Omit<AiTarget, 'model'>): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (t.apiKey) h.Authorization = `Bearer ${t.apiKey}`;
  if (t.provider === 'openrouter') {
    h['X-Title'] = 'ZenPort';
    h['HTTP-Referer'] = 'https://github.com/ilanKushnir/zenport';
  }
  return h;
}

/** OpenAI-style chat completions: OpenAI, OpenRouter, and compatible servers. */
async function chatCompletions(t: AiTarget, req: AiJsonRequest): Promise<unknown> {
  const url = `${chatBase(t)}/chat/completions`;
  const messages = [
    { role: 'system', content: req.system },
    { role: 'user', content: req.user },
  ];
  const strict = {
    type: 'json_schema',
    json_schema: { name: req.schemaName, schema: req.schema, strict: true },
  };
  const body: Record<string, unknown> = { model: t.model, messages, response_format: strict };
  if (req.webSearch && t.provider === 'openrouter') body.plugins = [{ id: 'web' }];
  try {
    const data = (await call(t.provider, url, {
      method: 'POST',
      headers: chatHeaders(t),
      body: JSON.stringify(body),
    })) as { choices: { message: { content: string | null; refusal?: string | null } }[] };
    const msg = data.choices?.[0]?.message;
    if (!msg?.content) {
      throw new AiError(
        msg?.refusal ?? `${PROVIDER_NAME[t.provider]} returned an empty answer.`,
        502,
      );
    }
    return parseJsonText(msg.content);
  } catch (err) {
    // Not every model or local server takes a strict schema: ask for plain
    // JSON mode with the schema in words instead.
    if (!(err instanceof AiError) || err.status !== 502 || t.provider === 'openai') throw err;
    const data = (await call(t.provider, url, {
      method: 'POST',
      headers: chatHeaders(t),
      body: JSON.stringify({
        model: t.model,
        messages: [
          { role: 'system', content: req.system + inWords(req.schema) },
          { role: 'user', content: req.user },
        ],
        response_format: { type: 'json_object' },
      }),
    })) as { choices: { message: { content: string | null } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new AiError(`${PROVIDER_NAME[t.provider]} returned an empty answer.`, 502);
    return parseJsonText(content);
  }
}

/** OpenAI with web search: the Responses API and its web_search tool. */
async function openAiResponses(t: AiTarget, req: AiJsonRequest): Promise<unknown> {
  const data = (await call('openai', `${OPENAI}/responses`, {
    method: 'POST',
    headers: chatHeaders(t),
    body: JSON.stringify({
      model: t.model,
      instructions: req.system,
      input: req.user,
      tools: [{ type: 'web_search' }],
      text: {
        format: { type: 'json_schema', name: req.schemaName, schema: req.schema, strict: true },
      },
    }),
  })) as {
    output_text?: string;
    output?: { type: string; content?: { type: string; text?: string }[] }[];
  };
  const text =
    data.output_text ??
    data.output
      ?.filter((o) => o.type === 'message')
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === 'output_text')
      .map((c) => c.text ?? '')
      .join('');
  if (!text) throw new AiError('OpenAI returned an empty answer.', 502);
  return parseJsonText(text);
}

async function anthropicJson(t: AiTarget, req: AiJsonRequest): Promise<unknown> {
  const tools: Record<string, unknown>[] = [
    {
      name: req.schemaName,
      description: 'Give the final answer in exactly this shape.',
      input_schema: req.schema,
    },
  ];
  if (req.webSearch)
    tools.unshift({ type: 'web_search_20250305', name: 'web_search', max_uses: 8 });
  const data = (await call('anthropic', `${ANTHROPIC}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': t.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: t.model,
      max_tokens: req.maxTokens ?? 16_000,
      system: req.webSearch
        ? `${req.system}\n\nSearch the web as needed, then call the ${req.schemaName} tool with the final answer.`
        : req.system,
      messages: [{ role: 'user', content: req.user }],
      tools,
      // Forced straight to the answer, unless it may search first.
      tool_choice: req.webSearch ? { type: 'any' } : { type: 'tool', name: req.schemaName },
    }),
  })) as { content: { type: string; name?: string; input?: unknown; text?: string }[] };
  const answer = [...(data.content ?? [])]
    .reverse()
    .find((c) => c.type === 'tool_use' && c.name === req.schemaName);
  if (answer?.input) return answer.input;
  const text = (data.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('');
  if (text) return parseJsonText(text);
  throw new AiError('Anthropic returned an empty answer.', 502);
}

async function geminiJson(t: AiTarget, req: AiJsonRequest): Promise<unknown> {
  const url = `${GEMINI}/models/${encodeURIComponent(t.model)}:generateContent`;
  const generationConfig: Record<string, unknown> = req.webSearch
    ? {}
    : { responseMimeType: 'application/json', responseJsonSchema: req.schema };
  const data = (await call('gemini', url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': t.apiKey },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: req.webSearch ? req.system + inWords(req.schema) : req.system }],
      },
      contents: [{ role: 'user', parts: [{ text: req.user }] }],
      generationConfig,
      ...(req.webSearch ? { tools: [{ google_search: {} }] } : {}),
    }),
  })) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) {
    const why = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason;
    throw new AiError(`Gemini returned an empty answer${why ? ` (${why})` : ''}.`, 502);
  }
  return parseJsonText(text);
}

export const aiClient: AiClient = {
  async listModels(t) {
    switch (t.provider) {
      case 'anthropic': {
        const data = (await call('anthropic', `${ANTHROPIC}/models?limit=100`, {
          headers: { 'x-api-key': t.apiKey, 'anthropic-version': '2023-06-01' },
          timeout: 15_000,
        })) as { data: { id: string }[] };
        return rankModels(
          'anthropic',
          data.data.map((m) => m.id),
        );
      }
      case 'gemini': {
        const data = (await call('gemini', `${GEMINI}/models?pageSize=200`, {
          headers: { 'x-goog-api-key': t.apiKey },
          timeout: 15_000,
        })) as { models: { name: string; supportedGenerationMethods?: string[] }[] };
        return rankModels(
          'gemini',
          data.models
            .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
            .map((m) => m.name.replace(/^models\//, '')),
        );
      }
      default: {
        const data = (await call(t.provider, `${chatBase(t)}/models`, {
          headers: chatHeaders(t),
          timeout: 15_000,
        })) as { data: { id: string }[] };
        // OpenRouter lists models without a key; a key check needs its own call.
        if (t.provider === 'openrouter') {
          await call('openrouter', `${OPENROUTER}/key`, {
            headers: chatHeaders(t),
            timeout: 15_000,
          });
        }
        return rankModels(
          t.provider,
          (data.data ?? []).map((m) => m.id),
        );
      }
    }
  },

  async chatJson(t, req) {
    if (t.provider === 'anthropic') return anthropicJson(t, req);
    if (t.provider === 'gemini') return geminiJson(t, req);
    if (t.provider === 'openai' && req.webSearch) return openAiResponses(t, req);
    return chatCompletions(t, req);
  },
};

/**
 * Web-search answers carry the provider's citations in the text itself -
 * "([site](https://…?utm_source=openai))" - which the app shows its own way
 * (as sources). Strip them, keep the words.
 */
export function stripCitations(text: string): string {
  return text
    .replace(/\s*\(\s*\[[^\]]*\]\([^)]*\)\s*\)/g, '')
    .replace(/\[([^\]]+)\]\((https?:[^)]*)\)/g, '$1')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Drop tracking parameters the provider adds to links it cites. */
export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) {
      if (/^utm_/i.test(k)) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return raw;
  }
}
