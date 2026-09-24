import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiClient, parseJsonText, rankModels } from './providers.js';

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
    expect(calls[0]!.body.tools).toEqual([{ type: 'web_search' }]);
  });

  it('a rejected key reads as such', async () => {
    mockFetch({ status: 401, json: { error: { message: 'invalid x-api-key' } } });
    await expect(aiClient.listModels({ provider: 'anthropic', apiKey: 'nope' })).rejects.toThrow(
      'Anthropic did not accept that key.',
    );
  });
});
