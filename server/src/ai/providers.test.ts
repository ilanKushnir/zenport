import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  aiClient,
  cleanUrl,
  geminiThinking,
  lightModel,
  parseJsonText,
  rankModels,
  stripCitations,
} from './providers.js';

const schema = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] };
const req = { system: 'sys', user: 'hi', schemaName: 'answer', schema };

function mockFetch(...answers: unknown[]) {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] =
    [];
  let n = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({
        url,
        body: init.body ? JSON.parse(String(init.body)) : {},
        headers: (init.headers ?? {}) as Record<string, string>,
      });
      const a = answers[Math.min(n++, answers.length - 1)] as { status?: number; json: unknown };
      return new Response(JSON.stringify(a.json), { status: a.status ?? 200 });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('providers', () => {
  it('reads JSON out of text, fenced or wrapped in words', () => {
    expect(parseJsonText('{"ok":true}')).toEqual({ ok: true });
    expect(parseJsonText('Here you go:\n```json\n{"ok":true}\n```')).toEqual({ ok: true });
    expect(parseJsonText('Sure! {"ok":true} Hope that helps.')).toEqual({ ok: true });
    expect(() => parseJsonText('no json here')).toThrow();
  });

  it('ranks each provider’s models, best first', () => {
    expect(
      rankModels('anthropic', [
        'claude-haiku-4-5',
        'claude-opus-5-5',
        'claude-sonnet-5',
        'claude-sonnet-4-5',
      ]),
    ).toEqual(['claude-sonnet-5', 'claude-sonnet-4-5', 'claude-opus-5-5', 'claude-haiku-4-5']);
    expect(
      rankModels('gemini', [
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'text-embedding-004',
        'gemini-2.5-flash-lite',
        'gemini-3-pro',
      ]),
    ).toEqual(['gemini-3-pro', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });

  it('Anthropic: forces the answer tool and reads its input', async () => {
    const calls = mockFetch({
      json: { content: [{ type: 'tool_use', name: 'answer', input: { ok: true } }] },
    });
    const out = await aiClient.chatJson(
      { provider: 'anthropic', apiKey: 'k', model: 'claude-sonnet-5' },
      req,
    );
    expect(out).toEqual({ ok: true });
    expect(calls[0]!.url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0]!.headers['x-api-key']).toBe('k');
    expect(calls[0]!.body.tool_choice).toEqual({ type: 'tool', name: 'answer' });
  });

  it('Anthropic with web search: search tool first, then the answer', async () => {
    const calls = mockFetch({
      json: {
        content: [
          { type: 'server_tool_use', name: 'web_search' },
          { type: 'text', text: 'Looked it up.' },
          { type: 'tool_use', name: 'answer', input: { ok: true } },
        ],
      },
    });
    await aiClient.chatJson(
      { provider: 'anthropic', apiKey: 'k', model: 'm' },
      { ...req, webSearch: true },
    );
    const tools = calls[0]!.body.tools as { name: string }[];
    expect(tools.map((t) => t.name)).toEqual(['web_search', 'answer']);
  });

  it('Gemini: a JSON schema, and plain JSON in words when searching', async () => {
    const calls = mockFetch({
      json: { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }] },
    });
    expect(
      await aiClient.chatJson({ provider: 'gemini', apiKey: 'g', model: 'gemini-2.5-pro' }, req),
    ).toEqual({
      ok: true,
    });
    expect(calls[0]!.url).toContain('/models/gemini-2.5-pro:generateContent');
    expect(calls[0]!.body.generationConfig).toMatchObject({ responseMimeType: 'application/json' });
    await aiClient.chatJson(
      { provider: 'gemini', apiKey: 'g', model: 'm' },
      { ...req, webSearch: true },
    );
    expect(calls[1]!.body.tools).toEqual([{ google_search: {} }]);
  });

  it('A compatible server that refuses a strict schema gets plain JSON mode instead', async () => {
    const calls = mockFetch(
      { status: 400, json: { error: { message: 'response_format json_schema not supported' } } },
      { json: { choices: [{ message: { content: '{"ok":true}' } }] } },
    );
    const out = await aiClient.chatJson(
      {
        provider: 'compatible',
        apiKey: '',
        baseUrl: 'http://ollama.lan:11434/v1',
        model: 'llama3.3',
      },
      req,
    );
    expect(out).toEqual({ ok: true });
    expect(calls[0]!.url).toBe('http://ollama.lan:11434/v1/chat/completions');
    expect(calls[0]!.headers.Authorization).toBeUndefined();
    expect(calls[1]!.body.response_format).toEqual({ type: 'json_object' });
  });

  it('OpenAI with web search uses the Responses API', async () => {
    const calls = mockFetch({ json: { output_text: '{"ok":true}' } });
    await aiClient.chatJson(
      { provider: 'openai', apiKey: 'o', model: 'gpt-5.5' },
      { ...req, webSearch: true },
    );
    expect(calls[0]!.url).toBe('https://api.openai.com/v1/responses');
    // The lean search, and little thinking.
    expect(calls[0]!.body.tools).toEqual([{ type: 'web_search', search_context_size: 'low' }]);
  });

  it('a rejected key reads as such', async () => {
    mockFetch({ status: 401, json: { error: { message: 'invalid x-api-key' } } });
    await expect(aiClient.listModels({ provider: 'anthropic', apiKey: 'nope' })).rejects.toThrow(
      'Anthropic did not accept that key.',
    );
  });
});

describe('web-search citations', () => {
  it('keeps the words and drops the inline citations and tracking', () => {
    expect(
      stripCitations(
        'A 13-minute body scan for sleep. ([uclahealth.org](https://www.uclahealth.org/x?utm_source=openai)) Also see [the page](https://example.org/p).',
      ),
    ).toBe('A 13-minute body scan for sleep. Also see the page.');
    expect(cleanUrl('https://example.org/a?utm_source=openai&id=3')).toBe(
      'https://example.org/a?id=3',
    );
    expect(cleanUrl('https://example.org/a?utm_source=openai')).toBe('https://example.org/a');
  });

  it('picks the cheaper sibling of the chosen model, where the key has one', () => {
    const openai = ['gpt-5.5', 'gpt-5', 'gpt-5-mini', 'gpt-5.4-mini', 'gpt-4o'];
    expect(lightModel('openai', 'gpt-5.5', openai)).toBe('gpt-5.4-mini');
    expect(lightModel('openai', 'gpt-5-mini', openai)).toBe('gpt-5-mini');
    expect(lightModel('openai', 'gpt-5.5', ['gpt-5.5'])).toBe('gpt-5.5');
    expect(
      lightModel('anthropic', 'claude-sonnet-5', ['claude-sonnet-5', 'claude-haiku-4-5']),
    ).toBe('claude-haiku-4-5');
    expect(
      lightModel('gemini', 'gemini-3-pro', ['gemini-3-pro', 'gemini-2.5-flash', 'gemini-3-flash']),
    ).toBe('gemini-3-flash');
    expect(lightModel('compatible', 'llama3', ['llama3', 'tiny'])).toBe('llama3');
  });

  it('keeps thinking small, per model family', () => {
    expect(geminiThinking('gemini-3-pro', 'low')).toEqual({ thinkingLevel: 'low' });
    expect(geminiThinking('gemini-2.5-flash', 'low')).toEqual({ thinkingBudget: 0 });
    expect(geminiThinking('gemini-2.5-pro', 'low')).toEqual({ thinkingBudget: 128 });
    expect(geminiThinking('gemini-2.0-flash', 'low')).toBeNull();
  });

  it('asks a thinking model to think little, and only thinking models', async () => {
    const answer = { json: { choices: [{ message: { content: '{"ok":true}' } }] } };
    let calls = mockFetch(answer);
    await aiClient.chatJson({ provider: 'openai', apiKey: 'k', model: 'gpt-5.5' }, req);
    expect(calls[0]!.body.reasoning_effort).toBe('low');
    calls = mockFetch(answer);
    await aiClient.chatJson(
      { provider: 'openai', apiKey: 'k', model: 'gpt-5.5' },
      { ...req, effort: 'medium' },
    );
    expect(calls[0]!.body.reasoning_effort).toBe('medium');
    calls = mockFetch(answer);
    await aiClient.chatJson({ provider: 'openai', apiKey: 'k', model: 'gpt-4o' }, req);
    expect(calls[0]!.body.reasoning_effort).toBeUndefined();
  });

  it('asks again without the savings when a model turns a setting down', async () => {
    const calls = mockFetch(
      { status: 400, json: { error: { message: "Unsupported parameter: 'reasoning_effort'" } } },
      { json: { choices: [{ message: { content: '{"ok":true}' } }] } },
    );
    const out = await aiClient.chatJson({ provider: 'openai', apiKey: 'k', model: 'o9' }, req);
    expect(out).toEqual({ ok: true });
    expect(calls[0]!.body.reasoning_effort).toBe('low');
    expect(calls[1]!.body.reasoning_effort).toBeUndefined();
  });

  it('runs a light task on the mini, and on the chosen model if the mini is refused', async () => {
    const models = { json: { data: [{ id: 'gpt-5.5' }, { id: 'gpt-5-mini' }] } };
    const ok = { json: { choices: [{ message: { content: '{"ok":true}' } }] } };
    let calls = mockFetch(models, ok);
    await aiClient.chatJson(
      { provider: 'openai', apiKey: 'key-light-1', model: 'gpt-5.5' },
      { ...req, light: true },
    );
    expect(calls.at(-1)!.body.model).toBe('gpt-5-mini');
    calls = mockFetch(
      models,
      { status: 404, json: { error: { message: 'The model gpt-5-mini does not exist' } } },
      ok,
    );
    const out = await aiClient.chatJson(
      { provider: 'openai', apiKey: 'key-light-2', model: 'gpt-5.5' },
      { ...req, light: true },
    );
    expect(out).toEqual({ ok: true });
    expect(calls.at(-1)!.body.model).toBe('gpt-5.5');
  });
});
