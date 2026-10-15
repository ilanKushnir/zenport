import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openDb, type Db } from '../db/index.js';
import { runScan } from '../scanner/scan.js';
import { createSession } from '../auth/sessions.js';
import { RETRY_GRACE_MS, redeemCode } from '../agents/service.js';
import type { Config } from '../config.js';
import type { AgentConnectDto, AgentDto } from '@zenport/shared';

let app: FastifyInstance;
let db: Db;
let libRoot: string;
let dataDir: string;
let cookie: string;

const CSRF = { 'x-zenport-csrf': '1' };
const asPerson = (c = cookie) => ({ cookie: `zp_session=${c}`, ...CSRF });
const asAgent = (key: string) => ({ authorization: `Bearer ${key}` });

function makeConfig(over: Partial<Config> = {}): Config {
  return {
    host: '127.0.0.1',
    port: 0,
    dataDir,
    libraryRoots: [{ id: 0, path: libRoot, label: 'Meditations' }],
    sessionSecret: 'test-secret-0123456789abcdef0123456789abcdef',
    sessionDays: 30,
    trustHttps: false,
    setupToken: null,
    scanIntervalMinutes: 0,
    ytdlpPath: null,
    transcribeUrl: null,
    transcribeApiKey: null,
    transcribeModel: 'whisper-1',
    logLevel: 'silent',
    webDistDir: null,
    ...over,
  };
}

async function start(over: Partial<Config> = {}) {
  app = buildApp({
    db,
    config: makeConfig(over),
    version: '9.9.9',
    deps: {
      fetchVideoMeta: async () => null,
      listPlaylist: null,
      transcribe: null,
      ai: {
        listModels: async () => [],
        speak: async () => Buffer.alloc(0),
        chatJson: async () => ({}),
      } as never,
    },
  });
  await app.ready();
  const res = await app.inject({
    method: 'POST',
    url: '/api/setup',
    headers: CSRF,
    payload: { username: 'ilan', password: 'ilan-demo-password-1', timezone: 'Asia/Jerusalem' },
  });
  cookie = res.cookies.find((c) => c.name === 'zp_session')!.value;
}

/** Add an agent as the signed-in person, redeem its code, and return the key. */
async function connectAgent(journal = false): Promise<{ key: string; dto: AgentConnectDto }> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/agents',
    headers: asPerson(),
    payload: { name: 'Astra', journal },
  });
  expect(created.statusCode).toBe(200);
  const dto = created.json<AgentConnectDto>();
  const res = await app.inject({
    method: 'POST',
    url: '/api/agent/connect',
    payload: { code: dto.code },
  });
  expect(res.statusCode).toBe(200);
  return { key: res.json<{ apiKey: string }>().apiKey, dto };
}

beforeEach(async () => {
  libRoot = mkdtempSync(path.join(tmpdir(), 'zp-agent-lib-'));
  dataDir = mkdtempSync(path.join(tmpdir(), 'zp-agent-data-'));
  const put = (rel: string) => {
    const abs = path.join(libRoot, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, 'audio-bytes-0123456789');
  };
  put('Mira Solen/Morning Ritual/01 Intro.mp3');
  put('Mira Solen/Morning Ritual/02 Practice.mp3');
  put('Orin Vale/Body Scan.mp3');
  db = openDb(':memory:');
  await runScan(db, [{ id: 0, path: libRoot, label: 'Meditations' }]);
});

afterEach(async () => {
  await app.close();
  db.close();
  rmSync(libRoot, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
});

describe('connecting an agent', () => {
  it('hands out a code and a brief, never a key, and the code buys the key once', async () => {
    await start();
    const created = await app.inject({
      method: 'POST',
      url: '/api/agents',
      headers: asPerson(),
      payload: { name: 'Astra' },
    });
    const dto = created.json<AgentConnectDto>();
    expect(dto.code).toMatch(/^zpc_/);
    expect(dto.brief).toContain(dto.code);
    expect(dto.brief).toContain('/api/agent/connect');
    expect(dto.brief).toContain('/api/agent/skill.md');
    expect(dto.brief).not.toMatch(/zpa_/);
    expect(dto.agent).toMatchObject({ connected: false, journal: false });
    expect(dto.agent.codeExpiresAt).toBe(dto.expiresAt);
    // Only hashes are kept.
    const row = db.prepare('SELECT * FROM agents').get() as Record<string, unknown>;
    expect(JSON.stringify(row)).not.toContain(dto.code);

    // No CSRF header, no cookie: the code is the credential.
    const res = await app.inject({
      method: 'POST',
      url: '/api/agent/connect',
      payload: { code: dto.code },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json();
    expect(body.apiKey).toMatch(/^zpa_[A-Za-z0-9_-]{43}$/);
    expect(body.baseUrl).toMatch(/\/api\/agent$/);
    expect(body.skillUrl).toBe(`${body.baseUrl}/skill.md`);
    expect(body.storeAs).toEqual({ apiKey: 'ZENPORT_API_KEY', baseUrl: 'ZENPORT_URL' });
    expect(JSON.stringify(db.prepare('SELECT * FROM agents').get())).not.toContain(body.apiKey);

    const me = await app.inject({
      method: 'GET',
      url: '/api/agent/me',
      headers: asAgent(body.apiKey),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      service: { name: 'ZenPort', version: '9.9.9' },
      agent: { name: 'Astra', journal: false },
      person: { name: 'ilan', timezone: 'Asia/Jerusalem' },
    });

    const list = (
      await app.inject({ method: 'GET', url: '/api/agents', headers: asPerson() })
    ).json<AgentDto[]>();
    expect(list[0]).toMatchObject({ connected: true, codeExpiresAt: null });
    expect(list[0]!.keyHint).toBe(`…${body.apiKey.slice(-4)}`);
  });

  it('rejects unknown, expired and spent codes', async () => {
    await start();
    const bad = await app.inject({
      method: 'POST',
      url: '/api/agent/connect',
      payload: { code: 'zpc_nope' },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().code).toBe('invalid_code');
    expect(
      (await app.inject({ method: 'POST', url: '/api/agent/connect', payload: {} })).statusCode,
    ).toBe(400);

    const { dto, key } = await connectAgent();
    // A retry inside the grace window mints a new key and retires the old.
    const again = redeemCode(db, dto.code, new Date(Date.now() + RETRY_GRACE_MS / 2));
    expect(again.key).not.toBe(key);
    expect(
      (await app.inject({ method: 'GET', url: '/api/agent/me', headers: asAgent(key) })).statusCode,
    ).toBe(401);
    expect(() => redeemCode(db, dto.code, new Date(Date.now() + RETRY_GRACE_MS * 2))).toThrow(
      /expired/,
    );

    const fresh = (
      await app.inject({
        method: 'POST',
        url: `/api/agents/${dto.agent.id}/connect`,
        headers: asPerson(),
      })
    ).json<AgentConnectDto>();
    expect(() => redeemCode(db, fresh.code, new Date(Date.now() + 25 * 3_600_000))).toThrow(
      /expired/,
    );
  });

  it('a new code leaves the running key working until it is redeemed', async () => {
    await start();
    const { dto, key } = await connectAgent();
    const fresh = (
      await app.inject({
        method: 'POST',
        url: `/api/agents/${dto.agent.id}/connect`,
        headers: asPerson(),
      })
    ).json<AgentConnectDto>();
    expect(fresh.code).not.toBe(dto.code);
    expect(
      (await app.inject({ method: 'GET', url: '/api/agent/me', headers: asAgent(key) })).statusCode,
    ).toBe(200);
    // The first code died with the new one.
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/agent/connect',
          payload: { code: dto.code },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('serves the skill with this server’s addresses, a direct one when set', async () => {
    await start({ publicUrl: 'https://zen.example', agentUrl: 'http://10.0.0.5:8484' });
    const res = await app.inject({ method: 'GET', url: '/api/agent/skill.md' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/markdown');
    const md = res.body;
    expect(md).toMatch(/^---\nname: zenport\ndescription: .+\nversion: 9\.9\.9\n---/);
    expect(md).toContain('http://10.0.0.5:8484/api/agent');
    expect(md).toContain('https://zen.example/api/agent');
    expect(md).toContain('https://zen.example/m/');

    const { dto } = await connectAgent();
    expect(dto.brief).toContain('http://10.0.0.5:8484/api/agent/connect');
    expect(dto.brief).toContain('https://zen.example/api/agent');
  });
});

describe('what an agent can reach', () => {
  it('needs its key, and the key opens only /api/agent', async () => {
    await start();
    const { key } = await connectAgent();
    expect((await app.inject({ method: 'GET', url: '/api/agent/today' })).json().code).toBe(
      'missing_key',
    );
    expect(
      (await app.inject({ method: 'GET', url: '/api/agent/today', headers: asAgent('zpa_x') }))
        .statusCode,
    ).toBe(401);
    // A person's cookie does not open the agent API ...
    expect(
      (await app.inject({ method: 'GET', url: '/api/agent/today', headers: asPerson() }))
        .statusCode,
    ).toBe(401);
    // ... and the agent's key opens nothing else.
    for (const url of ['/api/auth/me', '/api/journal', '/api/agents', '/api/users']) {
      expect((await app.inject({ method: 'GET', url, headers: asAgent(key) })).statusCode).toBe(
        401,
      );
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/agents',
          headers: { ...asAgent(key), ...CSRF },
          payload: { name: 'Sneaky' },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('cannot be smuggled across the line by spelling a path differently', async () => {
    await start();
    const { key } = await connectAgent();
    for (const url of ['/api/agent/../agents', '/api/agent/%2e%2e/agents', '/api//agent/me']) {
      const withKey = await app.inject({ method: 'GET', url, headers: asAgent(key) });
      expect(withKey.statusCode).not.toBe(200);
    }
    for (const url of ['/api//agent/me', '/api/x/../agent/me']) {
      const withCookie = await app.inject({ method: 'GET', url, headers: asPerson() });
      expect(withCookie.statusCode).not.toBe(200);
    }
  });

  it('removing an agent cuts it off', async () => {
    await start();
    const { key, dto } = await connectAgent();
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/agents/${dto.agent.id}`,
      headers: asPerson(),
    });
    expect(del.statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/agent/me', headers: asAgent(key) })).json()
        .code,
    ).toBe('invalid_key');
  });

  it('acts for its own person only', async () => {
    await start();
    const { dto } = await connectAgent();
    db.prepare(
      "INSERT INTO users (username, password_hash, role, timezone) VALUES ('dana', 'x', 'member', 'UTC')",
    ).run();
    const dana = createSession(db, 2, 1);
    for (const [method, url] of [
      ['POST', `/api/agents/${dto.agent.id}/connect`],
      ['PATCH', `/api/agents/${dto.agent.id}`],
      ['DELETE', `/api/agents/${dto.agent.id}`],
    ] as const) {
      const res = await app.inject({ method, url, headers: asPerson(dana), payload: {} });
      expect(res.statusCode).toBe(404);
    }
    expect(
      (await app.inject({ method: 'GET', url: '/api/agents', headers: asPerson(dana) })).json(),
    ).toEqual([]);
  });
});

describe('the agent API', () => {
  it('searches the library, logs a sit and reports the day', async () => {
    await start({ publicUrl: 'https://zen.example' });
    const { key } = await connectAgent();
    const get = async (url: string) =>
      (await app.inject({ method: 'GET', url, headers: asAgent(key) })).json();

    const lib = await get('/api/agent/library?q=body');
    expect(lib.total).toBe(1);
    expect(lib.items[0]).toMatchObject({ title: 'Body Scan', creator: 'Orin Vale', parts: 1 });
    expect(lib.items[0].url).toBe(`https://zen.example/m/${encodeURIComponent(lib.items[0].id)}`);
    expect((await get('/api/agent/library?creator=mira')).total).toBe(1);
    expect((await get('/api/agent/library')).total).toBe(2);
    // LIKE wildcards in a query are literal.
    expect((await get('/api/agent/library?q=%25')).total).toBe(0);

    const ritual = (await get('/api/agent/library?q=ritual')).items[0];
    const item = await get(`/api/agent/items/${encodeURIComponent(ritual.id)}`);
    expect(item.parts.map((p: { title: string }) => p.title)).toEqual(['Intro', 'Practice']);

    // A plan for every day, holding the ritual.
    const today = (await get('/api/agent/today')).date as string;
    const plan = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: asPerson(),
      payload: { name: 'Mornings', startDate: today, meditationIds: [ritual.id] },
    });
    const planId = plan.json().id as number;

    let day = await get('/api/agent/today');
    expect(day.planned).toEqual([
      expect.objectContaining({
        planId,
        plan: 'Mornings',
        status: 'today',
        meditations: [expect.objectContaining({ id: ritual.id })],
      }),
    ]);
    expect(day.sat).toEqual({ sessions: 0, minutes: 0 });
    expect(day.lastSit).toBeNull();

    const sit = await app.inject({
      method: 'POST',
      url: '/api/agent/sits',
      headers: asAgent(key),
      payload: { minutes: 15, meditationId: ritual.id, planId },
    });
    expect(sit.statusCode).toBe(200);
    expect(sit.json().sit).toMatchObject({ minutes: 15, title: 'Morning Ritual', completed: true });

    const unguided = await app.inject({
      method: 'POST',
      url: '/api/agent/sits',
      headers: asAgent(key),
      payload: { minutes: 10 },
    });
    expect(unguided.json().sit).toMatchObject({ meditationId: null, title: 'Unguided sit' });

    day = await get('/api/agent/today');
    expect(day.planned[0].status).toBe('completed');
    expect(day.sat).toEqual({ sessions: 2, minutes: 25 });
    expect(day.streak.current).toBe(1);
    expect(day.lastSit).toMatchObject({ minutes: expect.any(Number) });

    const hist = await get('/api/agent/history?days=7');
    expect(hist.sits).toHaveLength(2);
    const stats = await get('/api/agent/stats');
    expect(stats).toMatchObject({ totalMinutes: 25, totalSessions: 2, currentStreak: 1 });
    expect(stats.last30Days).toEqual({ minutes: 25, sessions: 2 });

    const plans = await get('/api/agent/plans');
    expect(plans.plans[0]).toMatchObject({
      id: planId,
      name: 'Mornings',
      status: 'active',
      meditations: [{ id: ritual.id, title: 'Morning Ritual' }],
    });

    // Skip tomorrow, then undo by marking it done.
    const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    const skip = await app.inject({
      method: 'POST',
      url: `/api/agent/plans/${planId}/skip`,
      headers: asAgent(key),
      payload: { date: tomorrow },
    });
    expect(skip.statusCode).toBe(200);
    const entry = db
      .prepare('SELECT status FROM plan_entries WHERE plan_id = ? AND date = ?')
      .get(planId, tomorrow) as { status: string };
    expect(entry.status).toBe('skipped');

    // Bad input and other people's things.
    for (const payload of [{}, { minutes: 0 }, { minutes: 5, endedAt: '2001-01-01T00:00:00Z' }]) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/agent/sits',
        headers: asAgent(key),
        payload,
      });
      expect(res.statusCode).toBe(400);
    }
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/agent/sits',
          headers: asAgent(key),
          payload: { minutes: 5, meditationId: 'nope' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/agent/plans/999/done',
          headers: asAgent(key),
        })
      ).statusCode,
    ).toBe(404);
  });

  it('keeps out of the journal unless allowed', async () => {
    await start();
    const { key, dto } = await connectAgent(false);
    const write = () =>
      app.inject({
        method: 'POST',
        url: '/api/agent/journal',
        headers: asAgent(key),
        payload: { body: 'Calm morning.', mood: 4, tags: ['morning'] },
      });
    expect((await write()).statusCode).toBe(403);
    expect(
      (await app.inject({ method: 'GET', url: '/api/agent/journal', headers: asAgent(key) })).json()
        .code,
    ).toBe('journal_not_allowed');

    const patched = await app.inject({
      method: 'PATCH',
      url: `/api/agents/${dto.agent.id}`,
      headers: asPerson(),
      payload: { journal: true },
    });
    expect(patched.json<AgentDto>().journal).toBe(true);
    expect((await write()).statusCode).toBe(200);
    const read = (
      await app.inject({ method: 'GET', url: '/api/agent/journal', headers: asAgent(key) })
    ).json();
    expect(read.entries).toEqual([
      expect.objectContaining({ body: 'Calm morning.', mood: 4, tags: ['morning'] }),
    ]);
  });
});
