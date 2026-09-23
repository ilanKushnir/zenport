/**
 * The OpenAI calls, with the person's own key. Only two: list the models the
 * key can use (to validate it and offer a choice), and one structured chat
 * completion per plan. Both are user-initiated; nothing is sent otherwise.
 */
export interface ChatJsonRequest {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
}

export interface OpenAiClient {
  listModels: (apiKey: string) => Promise<string[]>;
  chatJson: (req: ChatJsonRequest) => Promise<unknown>;
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const BASE = 'https://api.openai.com/v1';

async function failure(res: Response): Promise<AiError> {
  let detail = '';
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    detail = body.error?.message ?? '';
  } catch {
    /* not json */
  }
  if (res.status === 401) return new AiError('OpenAI did not accept that key.', 400);
  if (res.status === 429)
    return new AiError('OpenAI says the key is out of quota or rate-limited.', 429);
  return new AiError(`OpenAI returned ${res.status}${detail ? `: ${detail}` : ''}`, 502);
}

export const openAiClient: OpenAiClient = {
  async listModels(apiKey) {
    const res = await fetch(`${BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw await failure(res);
    const data = (await res.json()) as { data: { id: string }[] };
    return data.data.map((m) => m.id);
  },

  async chatJson({ apiKey, model, system, user, schemaName, schema }) {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: schemaName, schema, strict: true },
        },
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) throw await failure(res);
    const data = (await res.json()) as {
      choices: { message: { content: string | null; refusal?: string | null } }[];
    };
    const msg = data.choices[0]?.message;
    if (!msg?.content) throw new AiError(msg?.refusal ?? 'OpenAI returned an empty answer.', 502);
    return JSON.parse(msg.content);
  },
};

/** The general chat models worth offering, best first. */
const PREFERRED = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.2',
  'gpt-5.1',
  'gpt-5',
  'gpt-5-mini',
  'gpt-4.1',
  'gpt-4o',
];

export function chatModels(all: string[]): string[] {
  const usable = all.filter(
    (m) =>
      /^(gpt-|o\d)/.test(m) &&
      !/(image|audio|realtime|tts|transcribe|search|embedding|instruct|codex|preview|live|\d{4}-\d{2}-\d{2}|-\d{4}$)/.test(
        m,
      ),
  );
  const rank = (m: string) => {
    const i = PREFERRED.indexOf(m);
    return i === -1 ? PREFERRED.length : i;
  };
  return usable.sort((a, b) => rank(a) - rank(b) || b.localeCompare(a));
}
