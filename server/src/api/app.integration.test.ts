import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openDb, type Db } from '../db/index.js';
import { AiError, type AiClient } from '../ai/providers.js';
import { runScan } from '../scanner/scan.js';
import type { Config } from '../config.js';

let app: FastifyInstance;
let db: Db;
let libRoot: string;
let dataDir: string;
let cookie: string;

const CSRF = { 'x-zenport-csrf': '1' };

function makeConfig(): Config {
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
  };
}

async function setupAndLogin(): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/setup',
    headers: CSRF,
    payload: { username: 'astra', password: 'astra-demo-password-1' },
  });
  expect(res.statusCode).toBe(200);
  cookie = res.cookies.find((c) => c.name === 'zp_session')?.value ?? '';
  expect(cookie).toBeTruthy();
}

const auth = () => ({ cookie: `zp_session=${cookie}`, ...CSRF });

/** OpenAI without the network: any key starting "sk-good" works, and the plan
 * answer picks from whatever catalogue it was shown. */
let lastPrompt = '';
function fakeOpenAi(): AiClient {
  return {
    listModels: async ({ apiKey: key }) => {
      if (!key.startsWith('sk-good')) throw new AiError('OpenAI did not accept that key.', 400);
      // A real client ranks and filters (rankModels, unit-tested in ai.test.ts).
      return ['gpt-5.5', 'gpt-4o'];
    },
    chatJson: async (_t, { user }) => {
      lastPrompt = user;
      const handle = (word: string) =>
        user
          .split('\n')
          .find((l) => l.includes(word))
          ?.split(' | ')[0]
          ?.trim();
      return {
        name: 'Four weeks of mornings',
        intention: 'Arrive before the day does.',
        summary: 'Practice most mornings, learn twice a week.',
        weeks: 4,
        approach: 'together',
        why: 'The Long Road lays the foundations the talk builds on, so it comes first.',
        tips: ['Keep the same seat each morning.', 'Note one line after each lesson.'],
        stages: [
          {
            title: 'Mornings',
            focus: 'practice',
            startWeek: 1,
            weeks: 4,
            daysOfWeek: [1, 2, 3, 4, 5],
            minutesPerSession: 20,
            preferredTime: null,
            items: [
              { handle: handle('Morning Ritual'), why: 'Begin here.' },
              { handle: 'm404', why: 'invented' },
            ],
          },
          {
            title: 'Foundations',
            focus: 'learning',
            startWeek: 1,
            weeks: 4,
            daysOfWeek: [2, 4],
            minutesPerSession: 45,
            preferredTime: null,
            items: [
              { handle: handle('The Long Road'), why: 'Foundations.' },
              { handle: handle('Evening Gathering'), why: 'Then the talk.' },
            ],
          },
        ],
        outline: [{ week: 1, focus: 'Settle in' }],
      };
    },
  };
}

beforeEach(async () => {
  libRoot = mkdtempSync(path.join(tmpdir(), 'zp-api-lib-'));
  dataDir = mkdtempSync(path.join(tmpdir(), 'zp-api-data-'));
  const put = (rel: string, content: string | Buffer = 'audio-bytes-0123456789') => {
    const abs = path.join(libRoot, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  };
  put('Mira Solen/Morning Ritual/01 Intro.mp3', Buffer.alloc(4096, 7));
  put('Mira Solen/Morning Ritual/02 Practice.mp3');
  put('Mira Solen/Morning Ritual/cover.jpg');
  put('Mira Solen/Morning Ritual/notes.txt', '# Notes\nBreathe.');

  db = openDb(':memory:');
  await runScan(db, [{ id: 0, path: libRoot, label: 'Meditations' }]);
  app = buildApp({
    db,
    config: makeConfig(),
    version: 'test',
    deps: {
      fetchVideoMeta: async (id) =>
        id === 'dQw4w9WgXcQ' ? { title: 'Calm Video', author: 'Some Teacher' } : null,
      listPlaylist: async () => [
        { videoId: 'aaaaaaaaaaa', title: 'One', creator: 'T' },
        { videoId: 'bbbbbbbbbbb', title: 'Two', creator: 'T' },
      ],
      transcribe: null,
      ai: fakeOpenAi(),
    },
  });
  await app.ready();
});

afterEach(async () => {
  await app.close();
  db.close();
  rmSync(libRoot, { recursive: true, force: true });
  rmSync(dataDir, { recursive: true, force: true });
});

describe('first-start flow with a setup token', () => {
  it('advertises the token requirement, never the token, and enforces it', async () => {
    const locked = buildApp({
      db: openDb(':memory:'),
      config: { ...makeConfig(), setupToken: 'claim-me-please' },
      version: 'test',
      deps: {
        fetchVideoMeta: async () => null,
        listPlaylist: null,
        transcribe: null,
        ai: fakeOpenAi(),
      },
    });
    await locked.ready();
    try {
      const status = await locked.inject({ url: '/api/setup/status' });
      expect(status.json()).toEqual({ needsSetup: true, setupTokenRequired: true });
      expect(JSON.stringify(status.json())).not.toContain('claim-me-please');

      const noToken = await locked.inject({
        method: 'POST',
        url: '/api/setup',
        headers: CSRF,
        payload: { username: 'astra', password: 'astra-demo-password-1' },
      });
      expect(noToken.statusCode).toBe(403);
      const wrongToken = await locked.inject({
        method: 'POST',
        url: '/api/setup',
        headers: CSRF,
        payload: {
          username: 'astra',
          password: 'astra-demo-password-1',
          setupToken: 'wrong',
        },
      });
      expect(wrongToken.statusCode).toBe(403);

      const claimed = await locked.inject({
        method: 'POST',
        url: '/api/setup',
        headers: CSRF,
        payload: {
          username: 'astra',
          password: 'astra-demo-password-1',
          setupToken: 'claim-me-please',
        },
      });
      expect(claimed.statusCode).toBe(200);
      // Claiming signs the admin straight in via session cookie.
      const session = claimed.cookies.find((c) => c.name === 'zp_session');
      expect(session?.value).toBeTruthy();
      const me = await locked.inject({
        url: '/api/auth/me',
        headers: { cookie: `zp_session=${session?.value}` },
      });
      expect(me.json().username).toBe('astra');

      // Once claimed, the door is closed for good — token or not.
      const after = await locked.inject({ url: '/api/setup/status' });
      expect(after.json()).toEqual({ needsSetup: false, setupTokenRequired: false });
      const again = await locked.inject({
        method: 'POST',
        url: '/api/setup',
        headers: CSRF,
        payload: {
          username: 'mallory',
          password: 'mallory-password-1',
          setupToken: 'claim-me-please',
        },
      });
      expect(again.statusCode).toBe(403);
    } finally {
      await locked.close();
    }
  });
});

describe('setup and auth', () => {
  it('requires setup, creates the one admin, then closes signup for good', async () => {
    const status = await app.inject({ url: '/api/setup/status' });
    expect(status.json()).toEqual({ needsSetup: true, setupTokenRequired: false });
    await setupAndLogin();
    const again = await app.inject({
      method: 'POST',
      url: '/api/setup',
      headers: CSRF,
      payload: { username: 'mallory', password: 'mallory-password-1' },
    });
    expect(again.statusCode).toBe(403);
  });

  it('atomic claim: two racing setup requests create exactly one admin', async () => {
    // Password hashing suspends between the zero-users check and the insert
    // — exactly the window where two concurrent claims used to both return
    // 200 and create two admin accounts.
    const results = await Promise.all(
      ['first-racer', 'second-racer'].map((username) =>
        app.inject({
          method: 'POST',
          url: '/api/setup',
          headers: CSRF,
          payload: { username, password: `${username}-password-1` },
        }),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 403]);

    const users = db.prepare('SELECT username, role FROM users').all() as {
      username: string;
      role: string;
    }[];
    expect(users).toHaveLength(1);
    expect(users[0]?.role).toBe('admin');

    // Only the winner is signed in.
    const winner = results.find((r) => r.statusCode === 200);
    const loser = results.find((r) => r.statusCode === 403);
    expect(winner?.cookies.some((c) => c.name === 'zp_session')).toBe(true);
    expect(loser?.cookies.some((c) => c.name === 'zp_session')).toBe(false);
  });

  it('rejects unauthenticated API access', async () => {
    const res = await app.inject({ url: '/api/library' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects mutations without the CSRF header and cross-origin mutations', async () => {
    await setupAndLogin();
    const noHeader = await app.inject({
      method: 'POST',
      url: '/api/practice/start',
      headers: { cookie: `zp_session=${cookie}` },
      payload: { meditationId: 'x' },
    });
    expect(noHeader.statusCode).toBe(403);

    const crossOrigin = await app.inject({
      method: 'POST',
      url: '/api/practice/start',
      headers: { ...auth(), origin: 'https://evil.example', host: 'zenport.local' },
      payload: { meditationId: 'x' },
    });
    expect(crossOrigin.statusCode).toBe(403);
  });

  it('logs in and out', async () => {
    await setupAndLogin();
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: CSRF,
      payload: { username: 'astra', password: 'wrong-password-1' },
    });
    expect(bad.statusCode).toBe(401);
    const me = await app.inject({ url: '/api/auth/me', headers: auth() });
    expect(me.json().username).toBe('astra');
  });
});

describe('library and media', () => {
  it('serves the scanned library with creators and scan state', async () => {
    await setupAndLogin();
    const res = await app.inject({ url: '/api/library', headers: auth() });
    const lib = res.json();
    expect(lib.items).toHaveLength(1);
    expect(lib.items[0].creator).toBe('Mira Solen');
    expect(lib.creators[0].name).toBe('Mira Solen');
    expect(lib.scan.counts.tracks).toBe(2);
  });

  it('lists the folder tree and lets only the admin exclude a folder', async () => {
    await setupAndLogin();
    const folders = await app.inject({
      method: 'GET',
      url: '/api/library/folders',
      headers: auth(),
    });
    expect(folders.statusCode).toBe(200);
    const root = folders.json().roots[0];
    expect(root.tree.children[0].name).toBe('Mira Solen');
    expect(root.tree.audioFiles).toBe(2);

    const bogus = await app.inject({
      method: 'PUT',
      url: '/api/library/exclusions',
      headers: auth(),
      payload: { rootId: 0, relPath: '../etc', excluded: true },
    });
    expect(bogus.statusCode).toBe(404);

    const ex = await app.inject({
      method: 'PUT',
      url: '/api/library/exclusions',
      headers: auth(),
      payload: { rootId: 0, relPath: 'Mira Solen/Morning Ritual', excluded: true },
    });
    expect(ex.statusCode).toBe(200);
    expect(ex.json().scan.counts).toMatchObject({ items: 0, excluded: 1, missing: 0 });
    const lib = (await app.inject({ method: 'GET', url: '/api/library', headers: auth() })).json();
    expect(lib.items).toHaveLength(0);

    // A member may look but not change it.
    await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: auth(),
      payload: { username: 'guest', password: 'guest-password-1' },
    });
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: CSRF,
      payload: { username: 'guest', password: 'guest-password-1' },
    });
    const guest = login.cookies.find((c) => c.name === 'zp_session')?.value;
    const denied = await app.inject({
      method: 'PUT',
      url: '/api/library/exclusions',
      headers: { cookie: `zp_session=${guest}`, ...CSRF },
      payload: { rootId: 0, relPath: 'Mira Solen/Morning Ritual', excluded: false },
    });
    expect(denied.statusCode).toBe(403);
  });

  it('serves item detail with tracks, documents, and evidence', async () => {
    await setupAndLogin();
    const lib = (await app.inject({ url: '/api/library', headers: auth() })).json();
    const detail = (
      await app.inject({ url: `/api/items/${lib.items[0].id}`, headers: auth() })
    ).json();
    expect(detail.tracks).toHaveLength(2);
    expect(detail.documents).toHaveLength(1);
    expect(detail.evidence.length).toBeGreaterThan(0);
    expect(detail.breadcrumbs).toEqual(['Mira Solen', 'Morning Ritual']);
  });

  it('streams audio with byte ranges from opaque ids', async () => {
    await setupAndLogin();
    const lib = (await app.inject({ url: '/api/library', headers: auth() })).json();
    const detail = (
      await app.inject({ url: `/api/items/${lib.items[0].id}`, headers: auth() })
    ).json();
    const trackId = detail.tracks[0].id;
    const full = await app.inject({ url: `/api/media/track/${trackId}`, headers: auth() });
    expect(full.statusCode).toBe(200);
    expect(full.headers['content-type']).toBe('audio/mpeg');
    const ranged = await app.inject({
      url: `/api/media/track/${trackId}`,
      headers: { ...auth(), range: 'bytes=0-99' },
    });
    expect(ranged.statusCode).toBe(206);
    expect(ranged.headers['content-range']).toBe('bytes 0-99/4096');
    expect(ranged.rawPayload.length).toBe(100);
  });

  it('serves text documents through the safe reader endpoint', async () => {
    await setupAndLogin();
    const lib = (await app.inject({ url: '/api/library', headers: auth() })).json();
    const detail = (
      await app.inject({ url: `/api/items/${lib.items[0].id}`, headers: auth() })
    ).json();
    const doc = detail.documents[0];
    const res = await app.inject({ url: `/api/media/doc/${doc.id}/text`, headers: auth() });
    expect(res.json().content).toContain('Breathe.');
  });
});

describe('practice, plans, journal, stats', () => {
  it("keeps a meditation's place only for a few minutes, and counts the times it was done", async () => {
    await setupAndLogin();
    const lib = (await app.inject({ url: '/api/library', headers: auth() })).json();
    const med = lib.items.find((i: { title: string }) => i.title === 'Morning Ritual');
    const url = `/api/items/${med.id}`;
    const detail = (await app.inject({ url, headers: auth() })).json();
    for (const t of detail.tracks as { id: string }[]) {
      db.prepare('UPDATE tracks SET duration_sec = 600 WHERE id = ?').run(t.id);
    }
    const track = detail.tracks[1].id as string;
    await app.inject({
      method: 'PUT',
      url: `/api/progress/${track}`,
      headers: auth(),
      payload: { positionSec: 200 },
    });
    expect((await app.inject({ url, headers: auth() })).json().resume).toMatchObject({
      positionSec: 200,
    });
    // Eleven minutes later it is no longer offered - and the next save clears it away.
    db.prepare('UPDATE playback_positions SET updated_at = ?').run(
      new Date(Date.now() - 11 * 60_000).toISOString(),
    );
    const later = (await app.inject({ url, headers: auth() })).json();
    expect(later.resume).toBeNull();
    expect(later.tracks[1].positionSec).toBeNull();
    await app.inject({
      method: 'PUT',
      url: `/api/progress/${detail.tracks[0].id}`,
      headers: auth(),
      payload: { positionSec: 1 },
    });
    const left = db
      .prepare('SELECT COUNT(*) AS n FROM playback_positions WHERE track_id = ?')
      .get(track) as { n: number };
    expect(left.n).toBe(0);

    // Times done: at least half of its 20 minutes; a two-minute sit is not a time.
    const sit = async (minutes: number) => {
      const s = (
        await app.inject({
          method: 'POST',
          url: '/api/practice/start',
          headers: auth(),
          payload: { meditationId: med.id },
        })
      ).json();
      await app.inject({
        method: 'POST',
        url: `/api/practice/${s.id}/finish`,
        headers: auth(),
        payload: { status: 'completed', reason: 'finished' },
      });
      db.prepare('UPDATE practice_sessions SET listened_sec = ? WHERE id = ?').run(
        minutes * 60,
        s.id,
      );
    };
    await sit(19);
    await sit(11);
    await sit(2);
    const counted = (await app.inject({ url, headers: auth() })).json();
    expect(counted.practiceCount).toBe(2);
    expect(counted.lastPracticedAt).toBeTruthy();
  });

  it('runs a full practice session lifecycle into history and stats', async () => {
    await setupAndLogin();
    const lib = (await app.inject({ url: '/api/library', headers: auth() })).json();
    const itemId = lib.items[0].id;
    const started = (
      await app.inject({
        method: 'POST',
        url: '/api/practice/start',
        headers: auth(),
        payload: { meditationId: itemId },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/api/practice/${started.id}/finish`,
      headers: auth(),
      payload: { status: 'completed', reason: 'finished', listenedSec: 3 },
    });
    const history = (await app.inject({ url: '/api/practice/history', headers: auth() })).json();
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('completed');

    const stats = (await app.inject({ url: '/api/stats', headers: auth() })).json();
    expect(stats.totalSessions).toBe(1); // completed qualifies regardless of length
    expect(stats.creatorMix[0].name).toBe('Mira Solen');
  });

  it('takes sits played offline once, and only when they make sense', async () => {
    await setupAndLogin();
    const lib = (await app.inject({ url: '/api/library', headers: auth() })).json();
    const itemId = lib.items[0].id;
    const at = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();
    const sessions = [
      {
        clientId: 'dev-aaaaaaaa',
        itemId,
        startedAt: at(40),
        endedAt: at(20),
        listenedSec: 1200,
        status: 'completed',
      },
      // Claims more listening than the sit lasted: capped.
      {
        clientId: 'dev-bbbbbbbb',
        itemId,
        startedAt: at(10),
        endedAt: at(5),
        listenedSec: 3000,
        status: 'abandoned',
      },
      // Ends in the future: dropped.
      {
        clientId: 'dev-cccccccc',
        itemId,
        startedAt: at(5),
        endedAt: at(-60),
        listenedSec: 60,
        status: 'completed',
      },
      // No such item: dropped.
      {
        clientId: 'dev-dddddddd',
        itemId: 'nope',
        startedAt: at(9),
        endedAt: at(8),
        listenedSec: 60,
        status: 'completed',
      },
    ];
    const first = await app.inject({
      method: 'POST',
      url: '/api/practice/offline',
      headers: auth(),
      payload: { sessions },
    });
    expect(first.json()).toEqual({ imported: 2 });
    const again = await app.inject({
      method: 'POST',
      url: '/api/practice/offline',
      headers: auth(),
      payload: { sessions },
    });
    expect(again.json()).toEqual({ imported: 0 });
    const rows = db
      .prepare('SELECT listened_sec FROM practice_sessions ORDER BY started_at')
      .all() as { listened_sec: number }[];
    expect(rows.map((r) => Math.round(r.listened_sec))).toEqual([1200, 305]);
    const detail = (await app.inject({ url: `/api/items/${itemId}`, headers: auth() })).json();
    expect(detail.tracks[0].sizeBytes).toBeGreaterThan(0);
  });

  it('creates a plan and walks entry actions', async () => {
    await setupAndLogin();
    const created = (
      await app.inject({
        method: 'POST',
        url: '/api/plans',
        headers: auth(),
        payload: { name: 'Morning sits', startDate: '2026-09-01', daysOfWeek: [] },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/api/plans/${created.id}/complete`,
      headers: auth(),
      payload: { date: '2026-09-02' },
    });
    const occ = (
      await app.inject({ url: '/api/plans/occurrences?days=3', headers: auth() })
    ).json();
    const completed = occ.occurrences.find((o: { date: string }) => o.date === '2026-09-02');
    expect(completed.status).toBe('completed');

    const invalid = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: auth(),
      payload: { name: 'Bad', startDate: '2026-09-10', endDate: '2026-09-01' },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('journal CRUD with voice upload and transcription disabled state', async () => {
    await setupAndLogin();
    const entry = (
      await app.inject({
        method: 'POST',
        url: '/api/journal',
        headers: auth(),
        payload: { body: 'Felt settled today.', mood: 4, tags: ['calm'] },
      })
    ).json();
    expect(entry.body).toContain('settled');

    const voiceRes = await app.inject({
      method: 'POST',
      url: `/api/journal/${entry.id}/voice`,
      headers: { ...auth(), 'content-type': 'audio/webm', 'x-zp-duration': '12' },
      payload: Buffer.alloc(2048, 1),
    });
    expect(voiceRes.statusCode).toBe(200);
    const withVoice = voiceRes.json();
    expect(withVoice.voice.sizeBytes).toBe(2048);

    const transcribe = await app.inject({
      method: 'POST',
      url: `/api/journal/voice/${withVoice.voice.id}/transcribe`,
      headers: auth(),
    });
    expect(transcribe.statusCode).toBe(409); // disabled by default, honestly

    const play = await app.inject({
      url: `/api/media/voice/${withVoice.voice.id}`,
      headers: auth(),
    });
    expect(play.statusCode).toBe(200);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/journal/${entry.id}`,
      headers: auth(),
    });
    expect(del.statusCode).toBe(200);
  });
});

describe('youtube sources', () => {
  it('saves a video with fetched metadata and deduplicates', async () => {
    await setupAndLogin();
    const saved = (
      await app.inject({
        method: 'POST',
        url: '/api/youtube/sources',
        headers: auth(),
        payload: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      })
    ).json();
    expect(saved.title).toBe('Calm Video');
    expect(saved.creator).toBe('Some Teacher');

    const dup = await app.inject({
      method: 'POST',
      url: '/api/youtube/sources',
      headers: auth(),
      payload: { url: 'https://youtu.be/dQw4w9WgXcQ' },
    });
    expect(dup.statusCode).toBe(409);
  });

  it('asks for a manual title when metadata is unavailable', async () => {
    await setupAndLogin();
    const res = await app.inject({
      method: 'POST',
      url: '/api/youtube/sources',
      headers: auth(),
      payload: { url: 'https://www.youtube.com/watch?v=zzzzzzzzzzz' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().needsTitle).toBe(true);
  });

  it('previews and commits a playlist import with dedupe and provenance', async () => {
    await setupAndLogin();
    const preview = (
      await app.inject({
        method: 'POST',
        url: '/api/youtube/import/preview',
        headers: auth(),
        payload: { url: 'https://www.youtube.com/playlist?list=PL12345678901' },
      })
    ).json();
    expect(preview.entries).toHaveLength(2);

    const commit = (
      await app.inject({
        method: 'POST',
        url: '/api/youtube/import/commit',
        headers: auth(),
        payload: {
          kind: 'playlist',
          ref: preview.ref,
          entries: preview.entries.map((e: { videoId: string; title: string }) => ({
            videoId: e.videoId,
            title: e.title,
          })),
        },
      })
    ).json();
    expect(commit.added).toBe(2);

    const again = (
      await app.inject({
        method: 'POST',
        url: '/api/youtube/import/commit',
        headers: auth(),
        payload: {
          kind: 'playlist',
          ref: preview.ref,
          entries: [{ videoId: 'aaaaaaaaaaa', title: 'One' }],
        },
      })
    ).json();
    expect(again.added).toBe(0);
    expect(again.skipped).toBe(1);

    const sources = (await app.inject({ url: '/api/youtube/sources', headers: auth() })).json();
    expect(
      sources.find((s: { videoId: string }) => s.videoId === 'aaaaaaaaaaa').provenance,
    ).toEqual({
      kind: 'playlist',
      ref: preview.ref,
    });
  });
});

describe('content types, lessons and AI planning', () => {
  const put = (rel: string, content: string | Buffer = 'bytes-0123456789') => {
    const abs = path.join(libRoot, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  };

  beforeEach(async () => {
    put('Mira Solen/Courses/The Long Road/Session 1.mp4');
    put('Mira Solen/Courses/The Long Road/Session 2.mp4');
    put('Mira Solen/Courses/The Long Road/Session 3.mp4');
    put('Mira Solen/Livestreams/Evening Gathering.mp4');
    await runScan(db, [{ id: 0, path: libRoot, label: 'Meditations' }]);
  });

  it('recognises each type, lets the admin correct one, and a rescan keeps the correction', async () => {
    await setupAndLogin();
    const lib = (await app.inject({ method: 'GET', url: '/api/library', headers: auth() })).json();
    const by = (t: string) => lib.items.find((i: { title: string }) => i.title === t);
    expect(by('Morning Ritual').type).toBe('meditation');
    expect(by('The Long Road')).toMatchObject({ type: 'course', hasVideo: true, trackCount: 3 });
    expect(by('Evening Gathering').type).toBe('talk');

    const put1 = await app.inject({
      method: 'PUT',
      url: `/api/items/${by('Evening Gathering').id}/type`,
      headers: auth(),
      payload: { type: 'course' },
    });
    expect(put1.statusCode).toBe(200);
    await runScan(db, [{ id: 0, path: libRoot, label: 'Meditations' }]);
    const after = (
      await app.inject({ method: 'GET', url: '/api/library', headers: auth() })
    ).json();
    expect(
      after.items.find((i: { title: string }) => i.title === 'Evening Gathering'),
    ).toMatchObject({
      type: 'course',
      typeSource: 'manual',
    });
  });

  it('marks lessons done per account and counts them', async () => {
    await setupAndLogin();
    const lib = (await app.inject({ method: 'GET', url: '/api/library', headers: auth() })).json();
    const course = lib.items.find((i: { title: string }) => i.title === 'The Long Road');
    const detail = (
      await app.inject({ method: 'GET', url: `/api/items/${course.id}`, headers: auth() })
    ).json();
    expect(detail.tracks.every((t: { video: boolean }) => t.video)).toBe(true);
    await app.inject({
      method: 'PUT',
      url: `/api/tracks/${detail.tracks[0].id}/completed`,
      headers: auth(),
      payload: { completed: true },
    });
    const again = (
      await app.inject({ method: 'GET', url: `/api/items/${course.id}`, headers: auth() })
    ).json();
    expect(again.completedCount).toBe(1);
    expect(again.tracks[0].completed).toBe(true);
    const stats = (await app.inject({ method: 'GET', url: '/api/stats', headers: auth() })).json();
    expect(stats.learning.lessonsCompleted).toBe(1);
  });

  it('resumes an unfinished place, not a finished one, and starts over on request', async () => {
    await setupAndLogin();
    const lib = (await app.inject({ method: 'GET', url: '/api/library', headers: auth() })).json();
    const course = lib.items.find((i: { title: string }) => i.title === 'The Long Road');
    const url = `/api/items/${course.id}`;
    const detail = (await app.inject({ method: 'GET', url, headers: auth() })).json();
    const [t1, t2] = detail.tracks as { id: string }[];
    const at = (trackId: string, positionSec: number) =>
      app.inject({
        method: 'PUT',
        url: `/api/progress/${trackId}`,
        headers: auth(),
        payload: { positionSec },
      });
    await app.inject({
      method: 'PUT',
      url: `/api/tracks/${t1!.id}/completed`,
      headers: auth(),
      payload: { completed: true },
    });
    await at(t2!.id, 125);
    const mid = (await app.inject({ method: 'GET', url, headers: auth() })).json();
    expect(mid.resume).toMatchObject({ trackId: t2!.id, positionSec: 125 });
    const shelf = (
      await app.inject({ method: 'GET', url: '/api/library', headers: auth() })
    ).json();
    expect(shelf.items.find((i: { id: string }) => i.id === course.id).resumeSec).toBe(125);

    // Played to its last seconds: finished, so nothing to resume.
    db.prepare('UPDATE tracks SET duration_sec = 130 WHERE id = ?').run(t2!.id);
    const end = (await app.inject({ method: 'GET', url, headers: auth() })).json();
    expect(end.resume).toBeNull();
    expect(end.resumeSec).toBeNull();

    db.prepare('UPDATE tracks SET duration_sec = 600 WHERE id = ?').run(t2!.id);
    const reset = await app.inject({ method: 'DELETE', url: `${url}/progress`, headers: auth() });
    expect(reset.statusCode).toBe(200);
    const fresh = (await app.inject({ method: 'GET', url, headers: auth() })).json();
    expect(fresh.resume).toBeNull();
    expect(fresh.completedCount).toBe(0);
    expect(fresh.tracks.some((t: { completed: boolean }) => t.completed)).toBe(false);
  });

  it('a lesson finished later does not hide one left half-watched, and each lesson keeps its place', async () => {
    await setupAndLogin();
    const lib = (await app.inject({ method: 'GET', url: '/api/library', headers: auth() })).json();
    const course = lib.items.find((i: { title: string }) => i.title === 'The Long Road');
    const url = `/api/items/${course.id}`;
    const detail = (await app.inject({ method: 'GET', url, headers: auth() })).json();
    const [t1, t2, t3] = detail.tracks as { id: string }[];
    for (const t of detail.tracks as { id: string }[]) {
      db.prepare('UPDATE tracks SET duration_sec = 2400 WHERE id = ?').run(t.id);
    }
    const at = (trackId: string, positionSec: number) =>
      app.inject({
        method: 'PUT',
        url: `/api/progress/${trackId}`,
        headers: auth(),
        payload: { positionSec },
      });
    await at(t1!.id, 900);
    await new Promise((r) => setTimeout(r, 5));
    await at(t3!.id, 300);
    await new Promise((r) => setTimeout(r, 5));
    await at(t2!.id, 2390);
    await app.inject({
      method: 'PUT',
      url: `/api/tracks/${t2!.id}/completed`,
      headers: auth(),
      payload: { completed: true },
    });
    const after = (await app.inject({ method: 'GET', url, headers: auth() })).json();
    expect(after.resume).toMatchObject({ trackId: t3!.id, positionSec: 300 });
    expect(after.tracks.map((t: { positionSec: number | null }) => t.positionSec)).toEqual([
      900,
      null,
      300,
    ]);
  });

  it('keeps the AI key secret and plans only with real library items', async () => {
    await setupAndLogin();
    const bad = await app.inject({
      method: 'PUT',
      url: '/api/ai/settings',
      headers: auth(),
      payload: { apiKey: 'sk-bad-000000000000000000' },
    });
    expect(bad.statusCode).toBe(400);
    const ok = await app.inject({
      method: 'PUT',
      url: '/api/ai/settings',
      headers: auth(),
      payload: { apiKey: 'sk-good-1111111111111111abcd' },
    });
    expect(ok.json()).toMatchObject({
      configured: true,
      keyHint: '…abcd',
      model: 'gpt-5.5',
      models: ['gpt-5.5', 'gpt-4o'],
    });
    const settings = await app.inject({ method: 'GET', url: '/api/ai/settings', headers: auth() });
    expect(settings.body).not.toContain('sk-good');
    const stored = db.prepare('SELECT api_key_enc FROM ai_keys').get() as {
      api_key_enc: string;
    };
    expect(stored.api_key_enc).not.toContain('sk-good');

    const plan = await app.inject({
      method: 'POST',
      url: '/api/ai/plan',
      headers: auth(),
      payload: {
        goal: 'calm mornings and some study',
        weeks: 4,
        startDate: '2026-10-01',
        practice: { daysPerWeek: 5, minutes: 20 },
        learning: { minutesPerWeek: 90, daysPerWeek: 2 },
        timeOfDay: 'morning',
        level: 'some',
        creators: [],
        includeFinished: false,
      },
    });
    expect(plan.statusCode).toBe(200);
    const p = plan.json();
    const practice = p.stages.find((st: { focus: string }) => st.focus === 'practice');
    const learning = p.stages.find((st: { focus: string }) => st.focus === 'learning');
    expect(practice.items.map((i: { item: { title: string } }) => i.item.title)).toEqual([
      'Morning Ritual',
    ]);
    expect(learning.items.map((i: { item: { title: string } }) => i.item.title)).toEqual([
      'The Long Road',
      'Evening Gathering',
    ]);
    expect(practice.preferredTime).toBe('07:00');
    expect(lastPrompt).toContain('Practice: 5 days a week, about 20 minutes each.');
    expect(lastPrompt).not.toMatch(/[0-9a-f]{20}/); // real ids never leave the server

    // Accepting is ordinary plan creation, with a focus.
    const created = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: auth(),
      payload: {
        name: p.name,
        startDate: '2026-10-01',
        daysOfWeek: learning.daysOfWeek,
        focus: 'learning',
        meditationIds: learning.items.map((i: { id: string }) => i.id),
        path: { name: p.name, step: 2 },
        guide: { summary: p.summary, why: p.why, tips: p.tips, model: p.model },
      },
    });
    expect(created.statusCode).toBe(200);
    const plans = (await app.inject({ method: 'GET', url: '/api/plans', headers: auth() })).json();
    expect(p.why).toContain('foundations');
    expect(p.tips).toHaveLength(2);
    expect(plans[0]).toMatchObject({
      focus: 'learning',
      path: { name: p.name, step: 2 },
      guide: { why: p.why, tips: p.tips },
      notes: null,
    });
    // The planner's account is read-only: an edit cannot change it.
    await app.inject({
      method: 'PATCH',
      url: `/api/plans/${plans[0].id}`,
      headers: auth(),
      payload: { name: 'Renamed', guide: { why: 'tampered' } },
    });
    const after = (await app.inject({ method: 'GET', url: '/api/plans', headers: auth() })).json();
    expect(after[0]).toMatchObject({ name: 'Renamed', guide: { why: p.why } });
  });
});

describe('people: invitations, roles and friends', () => {
  type Who = { cookie: string; id: number };
  const as = (w: Who) => ({ cookie: `zp_session=${w.cookie}`, ...CSRF });
  const sessionFrom = (res: { cookies: { name: string; value: string }[] }) =>
    res.cookies.find((c) => c.name === 'zp_session')?.value ?? '';

  /** Admin invites; the invited person joins through the public link. */
  async function invite(admin: Who, username: string, opts: Record<string, unknown> = {}) {
    const made = await app.inject({
      method: 'POST',
      url: '/api/invites',
      headers: as(admin),
      payload: { note: `For ${username}`, ...opts },
    });
    expect(made.statusCode).toBe(200);
    const { token } = made.json() as { token: string };
    const info = await app.inject({ method: 'GET', url: `/api/join/${token}` });
    expect(info.statusCode).toBe(200);
    expect(info.json()).toMatchObject({
      kind: 'join',
      note: `For ${username}`,
      invitedBy: 'astra',
    });
    const joined = await app.inject({
      method: 'POST',
      url: `/api/join/${token}`,
      headers: CSRF,
      payload: {
        username,
        password: `${username}-password-123`,
        displayName: username.toUpperCase(),
      },
    });
    expect(joined.statusCode).toBe(200);
    const cookie = sessionFrom(joined);
    const me = (
      await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { cookie: `zp_session=${cookie}` },
      })
    ).json();
    return { who: { cookie, id: me.id } as Who, token, me };
  }

  async function admin(): Promise<Who> {
    await setupAndLogin();
    const me = (await app.inject({ method: 'GET', url: '/api/auth/me', headers: auth() })).json();
    return { cookie, id: me.id };
  }

  async function sit(w: Who, minutes: number) {
    const lib = (await app.inject({ method: 'GET', url: '/api/library', headers: as(w) })).json();
    const started = (
      await app.inject({
        method: 'POST',
        url: '/api/practice/start',
        headers: as(w),
        payload: { meditationId: lib.items[0].id },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/api/practice/${started.id}/finish`,
      headers: as(w),
      payload: { status: 'completed', reason: 'finished' },
    });
    // Beats are capped by wall-clock time; a test sit states its minutes directly.
    db.prepare('UPDATE practice_sessions SET listened_sec = ? WHERE id = ?').run(
      minutes * 60,
      started.id,
    );
    return started.id as number;
  }

  it('an invitation works once, makes a member, and can make friends on the way in', async () => {
    const a = await admin();
    const { who: dana, token, me } = await invite(a, 'dana');
    expect(me).toMatchObject({ username: 'dana', role: 'member', displayName: 'DANA' });

    const again = await app.inject({
      method: 'POST',
      url: `/api/join/${token}`,
      headers: CSRF,
      payload: { username: 'dana2', password: 'another-password-1' },
    });
    expect(again.statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/api/join/${token}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: '/api/join/not-a-real-token-xx' })).statusCode,
    ).toBe(404);

    const friends = (
      await app.inject({ method: 'GET', url: '/api/friends', headers: as(dana) })
    ).json();
    expect(friends.friends.map((f: { name: string }) => f.name)).toEqual(['astra']);

    const list = (await app.inject({ method: 'GET', url: '/api/invites', headers: as(a) })).json();
    expect(list[0]).toMatchObject({ status: 'used', usedBy: 'DANA' });
    // Only the hash is stored.
    const stored = db.prepare('SELECT token_hash FROM invites').all() as { token_hash: string }[];
    expect(stored.some((r) => r.token_hash === token)).toBe(false);
  });

  it('a revoked or expired invitation opens nothing', async () => {
    const a = await admin();
    const made = (
      await app.inject({ method: 'POST', url: '/api/invites', headers: as(a), payload: {} })
    ).json();
    await app.inject({ method: 'DELETE', url: `/api/invites/${made.invite.id}`, headers: as(a) });
    expect((await app.inject({ method: 'GET', url: `/api/join/${made.token}` })).statusCode).toBe(
      404,
    );
    const old = (
      await app.inject({ method: 'POST', url: '/api/invites', headers: as(a), payload: {} })
    ).json();
    db.prepare('UPDATE invites SET expires_at = ? WHERE id = ?').run(
      '2000-01-01T00:00:00Z',
      old.invite.id,
    );
    expect((await app.inject({ method: 'GET', url: `/api/join/${old.token}` })).statusCode).toBe(
      404,
    );
  });

  it('members practise, plan and befriend - but do not manage the library or people', async () => {
    const a = await admin();
    const { who: m } = await invite(a, 'dana');
    const lib = (await app.inject({ method: 'GET', url: '/api/library', headers: as(m) })).json();
    const itemId = lib.items[0].id;
    const forbidden = [
      ['POST', '/api/library/rescan', {}],
      ['PUT', '/api/library/exclusions', { excluded: [] }],
      ['PUT', `/api/items/${itemId}/type`, { type: 'course' }],
      ['POST', '/api/invites', {}],
      ['GET', '/api/users', undefined],
      ['PATCH', `/api/users/${a.id}`, { role: 'member' }],
      ['POST', `/api/users/${a.id}/reset-link`, {}],
      ['POST', '/api/youtube/sources', { url: 'https://youtu.be/dQw4w9WgXcQ' }],
      ['PUT', '/api/ai/sharing', { enabled: true }],
      ['GET', '/api/admin/review', undefined],
      ['GET', `/api/admin/items/${itemId}`, undefined],
      ['PUT', `/api/admin/items/${itemId}`, { title: 'Mine now' }],
      ['POST', '/api/admin/review/reviewed', { ids: [itemId] }],
      ['PUT', `/api/items/${itemId}/order`, { trackIds: ['x'] }],
      ['GET', '/api/library/removed', undefined],
    ] as const;
    for (const [method, url, payload] of forbidden) {
      const res = await app.inject({ method, url, headers: as(m), payload });
      expect(`${method} ${url} ${res.statusCode}`).toBe(`${method} ${url} 403`);
    }
    const plan = await app.inject({
      method: 'POST',
      url: '/api/plans',
      headers: as(m),
      payload: { name: 'Mine', startDate: '2026-10-01', meditationIds: [itemId] },
    });
    expect(plan.statusCode).toBe(200);
    expect(await sit(m, 12)).toBeGreaterThan(0);
  });

  it('there is always an admin, and a reset link signs the old sessions out', async () => {
    const a = await admin();
    const { who: m } = await invite(a, 'dana');
    const selfDemote = await app.inject({
      method: 'PATCH',
      url: `/api/users/${a.id}`,
      headers: as(a),
      payload: { role: 'member' },
    });
    expect(selfDemote.statusCode).toBe(400);

    const link = (
      await app.inject({ method: 'POST', url: `/api/users/${m.id}/reset-link`, headers: as(a) })
    ).json();
    const info = (await app.inject({ method: 'GET', url: `/api/join/${link.token}` })).json();
    expect(info).toMatchObject({ kind: 'reset', username: 'dana' });
    const reset = await app.inject({
      method: 'POST',
      url: `/api/join/${link.token}`,
      headers: CSRF,
      payload: { password: 'a-brand-new-password' },
    });
    expect(reset.statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: as(m) })).statusCode,
    ).toBe(401);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: CSRF,
      payload: { username: 'dana', password: 'a-brand-new-password' },
    });
    expect(login.statusCode).toBe(200);
  });

  it('friends: request, accept, see each other as shared, bow and nudge', async () => {
    const a = await admin();
    const { who: dana } = await invite(a, 'dana', { befriend: false });
    const { who: noa } = await invite(a, 'noa', { befriend: false });

    const people = (
      await app.inject({ method: 'GET', url: '/api/people', headers: as(noa) })
    ).json();
    expect(people.map((p: { username: string }) => p.username).sort()).toEqual(['astra', 'dana']);

    await app.inject({ method: 'POST', url: `/api/friends/${dana.id}`, headers: as(noa) });
    const inbox = (
      await app.inject({ method: 'GET', url: '/api/inbox', headers: as(dana) })
    ).json();
    expect(inbox.requests.map((p: { username: string }) => p.username)).toEqual(['noa']);
    // Not friends yet: nothing to see, nothing to send.
    expect(
      (await app.inject({ method: 'GET', url: `/api/friends/${noa.id}`, headers: as(dana) }))
        .statusCode,
    ).toBe(404);
    await app.inject({ method: 'POST', url: `/api/friends/${noa.id}/accept`, headers: as(dana) });

    const sessionId = await sit(dana, 15);
    await sit(noa, 10);
    const board = (
      await app.inject({ method: 'GET', url: '/api/friends', headers: as(noa) })
    ).json();
    const d = board.friends.find((f: { username: string }) => f.username === 'dana');
    expect(d).toMatchObject({ streak: 1, together: 1, today: { minutes: 15 } });
    expect(d.last).toMatchObject({ sessionId, title: 'Morning Ritual' });

    const bow = await app.inject({
      method: 'POST',
      url: '/api/cheers',
      headers: as(noa),
      payload: { to: dana.id, kind: 'bow', sessionId },
    });
    expect(bow.statusCode).toBe(200);
    const nudge = { to: dana.id, kind: 'nudge', message: 'Sit with me tonight?' };
    expect(
      (await app.inject({ method: 'POST', url: '/api/cheers', headers: as(noa), payload: nudge }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'POST', url: '/api/cheers', headers: as(noa), payload: nudge }))
        .statusCode,
    ).toBe(429);
    const got = (await app.inject({ method: 'GET', url: '/api/inbox', headers: as(dana) })).json();
    expect(got.cheers.map((c: { kind: string }) => c.kind).sort()).toEqual(['bow', 'nudge']);
    expect(got.unseen).toBe(2);
    await app.inject({ method: 'POST', url: '/api/inbox/seen', headers: as(dana) });
    expect(
      (await app.inject({ method: 'GET', url: '/api/inbox', headers: as(dana) })).json().unseen,
    ).toBe(0);

    // Summary sharing: numbers, never titles; off: nothing.
    await app.inject({
      method: 'PATCH',
      url: '/api/auth/me',
      headers: as(dana),
      payload: { shareLevel: 'summary' },
    });
    const summary = (
      await app.inject({ method: 'GET', url: `/api/friends/${dana.id}`, headers: as(noa) })
    ).json();
    expect(summary.friend.today.minutes).toBe(15);
    expect(summary.friend.last).toBeNull();
    expect(summary.recent).toEqual([]);
    expect(JSON.stringify(summary)).not.toContain('Morning Ritual');
    await app.inject({
      method: 'PATCH',
      url: '/api/auth/me',
      headers: as(dana),
      payload: { shareLevel: 'off' },
    });
    const off = (
      await app.inject({ method: 'GET', url: `/api/friends/${dana.id}`, headers: as(noa) })
    ).json();
    expect(off.friend).toMatchObject({ today: null, streak: null });
    expect(off.days).toEqual([]);

    // Either side can end it.
    await app.inject({ method: 'DELETE', url: `/api/friends/${noa.id}`, headers: as(dana) });
    expect(
      (await app.inject({ method: 'GET', url: '/api/friends', headers: as(noa) })).json().friends,
    ).toHaveLength(0);
  });

  it('the owner can let everyone plan with their AI key, without anyone seeing it', async () => {
    const a = await admin();
    const { who: m } = await invite(a, 'dana');
    await app.inject({
      method: 'PUT',
      url: '/api/ai/settings',
      headers: as(a),
      payload: { apiKey: 'sk-good-1111111111111111abcd' },
    });
    expect(
      (await app.inject({ method: 'GET', url: '/api/ai/settings', headers: as(m) })).json()
        .sharedBy,
    ).toBeNull();
    await app.inject({
      method: 'PUT',
      url: '/api/ai/sharing',
      headers: as(a),
      payload: { enabled: true },
    });
    const seen = await app.inject({ method: 'GET', url: '/api/ai/settings', headers: as(m) });
    expect(seen.json()).toMatchObject({ configured: false, sharedBy: 'astra' });
    expect(seen.body).not.toContain('abcd');
  });
});

describe('order and libraries that move', () => {
  const mainRoots = () => [{ id: 0, path: libRoot, label: 'Meditations' }];
  const put = (root: string, rel: string) => {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, `${rel}:${'q'.repeat(300)}`);
  };

  it('keeps the owner order through a rescan and a moved folder, and resets it', async () => {
    for (const n of [
      'Discovery Part 1 Day 1',
      'Discovery Part 1 Day 2',
      'Discovery Part 1 Day 3',
    ]) {
      put(libRoot, `Series/Discovery/${n}.mp3`);
    }
    put(libRoot, 'Series/Discovery/Discovery Series Intro-video.mp4');
    await runScan(db, mainRoots());
    await setupAndLogin();
    const lib = (await app.inject({ method: 'GET', url: '/api/library', headers: auth() })).json();
    const item = lib.items.find((i: { title: string }) => i.title === 'Discovery');
    const get = async () =>
      (await app.inject({ method: 'GET', url: `/api/items/${item.id}`, headers: auth() })).json();
    const d0 = await get();
    // The unnumbered intro video leads the numbered days on its own.
    expect(d0.tracks.map((t: { title: string }) => t.title)[0]).toMatch(/Intro/);
    expect(d0.customOrder).toBe(false);

    const wanted = [d0.tracks[1].id, d0.tracks[0].id, d0.tracks[3].id, d0.tracks[2].id];
    const put1 = await app.inject({
      method: 'PUT',
      url: `/api/items/${item.id}/order`,
      headers: auth(),
      payload: { trackIds: wanted },
    });
    expect(put1.statusCode).toBe(200);
    const bad = await app.inject({
      method: 'PUT',
      url: `/api/items/${item.id}/order`,
      headers: auth(),
      payload: { trackIds: [wanted[0], wanted[0]] },
    });
    expect(bad.statusCode).toBe(400);

    // Move the folder: same item, same order.
    const { renameSync } = await import('node:fs');
    mkdirSync(path.join(libRoot, 'Elsewhere'), { recursive: true });
    renameSync(
      path.join(libRoot, 'Series/Discovery'),
      path.join(libRoot, 'Elsewhere/Discovery Part 1'),
    );
    await runScan(db, mainRoots());
    const d1 = await get();
    expect(d1.title).toBe('Discovery Part 1');
    expect(d1.customOrder).toBe(true);
    expect(d1.tracks.map((t: { id: string }) => t.id)).toEqual(wanted);
    expect(d1.tracks.map((t: { ord: number }) => t.ord)).toEqual([1, 2, 3, 4]);

    const reset = await app.inject({
      method: 'DELETE',
      url: `/api/items/${item.id}/order`,
      headers: auth(),
    });
    expect(reset.statusCode).toBe(200);
    const d2 = await get();
    expect(d2.customOrder).toBe(false);
    expect(d2.tracks.map((t: { id: string }) => t.id)).toEqual(
      d0.tracks.map((t: { id: string }) => t.id),
    );
  });

  it('lists a library taken out of the list, and forgets it only when asked', async () => {
    const other = mkdtempSync(path.join(tmpdir(), 'zp-api-other-'));
    try {
      put(other, 'Juniper/Rain/rain.mp3');
      await runScan(db, [...mainRoots(), { id: 7, path: other, label: 'other' }]);
      db.prepare("INSERT INTO library_roots (id, path, label) VALUES (7, ?, 'other')").run(other);
      await setupAndLogin();
      const rain = db.prepare("SELECT id FROM items WHERE title = 'Rain'").get() as { id: string };
      const fav = await app.inject({
        method: 'PUT',
        url: `/api/favorites/${rain.id}`,
        headers: auth(),
      });
      expect(fav.statusCode).toBe(200);

      // Mounted no more: off the shelves, kept, and listed for the admin.
      await runScan(db, mainRoots());
      const removed = (
        await app.inject({ method: 'GET', url: '/api/library/removed', headers: auth() })
      ).json();
      expect(removed).toEqual([
        expect.objectContaining({ id: 7, label: 'other', items: 1, tracks: 1 }),
      ]);
      const stillMounted = await app.inject({
        method: 'DELETE',
        url: '/api/library/removed/0',
        headers: auth(),
      });
      expect(stillMounted.statusCode).toBe(409);
      const forget = await app.inject({
        method: 'DELETE',
        url: '/api/library/removed/7',
        headers: auth(),
      });
      expect(forget.json()).toMatchObject({ ok: true, forgotten: 1 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM items WHERE root_id = 7').get()).toEqual({
        n: 0,
      });
      expect(
        db.prepare('SELECT COUNT(*) AS n FROM favorites WHERE item_id = ?').get(rain.id),
      ).toEqual({ n: 0 });
      const after = (
        await app.inject({ method: 'GET', url: '/api/library/removed', headers: auth() })
      ).json();
      expect(after).toEqual([]);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

describe('library review', () => {
  const put = (rel: string) => {
    const abs = path.join(libRoot, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, `${rel}:${'r'.repeat(300)}`);
  };
  const roots = () => [{ id: 0, path: libRoot, label: 'Meditations' }];

  it('lists what wants a look, saves every kind of correction, and a rescan keeps them', async () => {
    put('Quiet Harbor/Creativity/Creativity Pack Day 27-video.mp4');
    put('Quiet Harbor/Creativity/audio-2248.mp3');
    put('Quiet Harbor/Creativity/audio-2249.mp3');
    await runScan(db, roots());
    await setupAndLogin();
    const list = (
      await app.inject({ method: 'GET', url: '/api/admin/review', headers: auth() })
    ).json();
    const item = list.items.find((i: { title: string }) => i.title === 'Creativity');
    expect(item.flags).toEqual(expect.arrayContaining(['raw-names', 'mixed-media']));
    expect(item.isNew).toBe(true);

    const d = (
      await app.inject({ method: 'GET', url: `/api/admin/items/${item.id}`, headers: auth() })
    ).json();
    const part = (name: string) =>
      d.tracks.find((t: { scannedTitle: string }) => t.scannedTitle === name) as {
        id: string;
        suggestion: string | null;
      };
    expect(part('Creativity Pack Day 27-video').suggestion).toBe('Creativity Pack Day 27');
    expect(part('audio-2248').suggestion).toBe('Session 1');
    expect(part('audio-2249').suggestion).toBe('Session 2');
    const [video, a1, a2] = ['Creativity Pack Day 27-video', 'audio-2248', 'audio-2249'].map(
      (n) => part(n).id,
    );
    const save = await app.inject({
      method: 'PUT',
      url: `/api/admin/items/${item.id}`,
      headers: auth(),
      payload: {
        title: 'Creativity Pack',
        creator: 'Quiet Harbor Studio',
        series: 'Creative Month',
        type: 'course',
        tracks: [
          { id: video, title: 'Welcome to day 27' },
          { id: a1, title: 'Day 27', role: 'practice' },
        ],
        order: [video, a2, a1],
      },
    });
    expect(save.statusCode).toBe(200);

    await runScan(db, roots());
    const after = (
      await app.inject({ method: 'GET', url: `/api/items/${item.id}`, headers: auth() })
    ).json();
    expect(after).toMatchObject({
      title: 'Creativity Pack',
      creator: 'Quiet Harbor Studio',
      collection: 'Creative Month',
      type: 'course',
    });
    expect(after.tracks.map((t: { title: string }) => t.title)).toEqual([
      'Welcome to day 27',
      'audio-2249',
      'Day 27',
    ]);
    expect(after.tracks[2].role).toBe('practice');
    const again = (
      await app.inject({ method: 'GET', url: '/api/admin/review', headers: auth() })
    ).json();
    const row = again.items.find((i: { id: string }) => i.id === item.id);
    expect(row.isNew).toBe(false);
    expect(row.edited).toEqual(
      expect.arrayContaining(['title', 'creator', 'series', 'type', 'order', 'names', 'roles']),
    );
    expect(again.creators).toContain('Quiet Harbor Studio');

    // Giving back what the scanner read clears the correction.
    await app.inject({
      method: 'PUT',
      url: `/api/admin/items/${item.id}`,
      headers: auth(),
      payload: { title: 'Creativity', creator: 'Quiet Harbor', series: '', order: null },
    });
    const reset = (
      await app.inject({ method: 'GET', url: `/api/admin/items/${item.id}`, headers: auth() })
    ).json();
    expect(reset).toMatchObject({
      title: 'Creativity',
      creator: 'Quiet Harbor',
      collection: null,
      customOrder: false,
    });

    // Hide it, then bring it back.
    await app.inject({
      method: 'PUT',
      url: `/api/admin/items/${item.id}`,
      headers: auth(),
      payload: { hidden: true },
    });
    const lib = (await app.inject({ method: 'GET', url: '/api/library', headers: auth() })).json();
    expect(lib.items.some((i: { id: string }) => i.id === item.id)).toBe(false);
    const hiddenRow = (
      await app.inject({ method: 'GET', url: '/api/admin/review', headers: auth() })
    )
      .json()
      .items.find((i: { id: string }) => i.id === item.id);
    expect(hiddenRow.hidden).toBe(true);
    await app.inject({
      method: 'PUT',
      url: `/api/admin/items/${item.id}`,
      headers: auth(),
      payload: { hidden: false },
    });
    const back = (await app.inject({ method: 'GET', url: '/api/library', headers: auth() })).json();
    expect(back.items.some((i: { id: string }) => i.id === item.id)).toBe(true);
  });
});

describe('clearing practice history', () => {
  it("removes several of your own sessions at once, and nobody else's", async () => {
    await setupAndLogin();
    const lib = (await app.inject({ method: 'GET', url: '/api/library', headers: auth() })).json();
    const itemId = lib.items[0].id;
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const s = (
        await app.inject({
          method: 'POST',
          url: '/api/practice/start',
          headers: auth(),
          payload: { meditationId: itemId },
        })
      ).json();
      await app.inject({
        method: 'POST',
        url: `/api/practice/${s.id}/finish`,
        headers: auth(),
        payload: { listenedSec: 120, status: 'completed' },
      });
      ids.push(s.id);
    }
    const res = await app.inject({
      method: 'POST',
      url: '/api/practice/remove',
      headers: auth(),
      payload: { ids: [ids[0], ids[1], 99999] },
    });
    expect(res.json()).toEqual({ ok: true, removed: 2 });
    const left = (
      await app.inject({ method: 'GET', url: '/api/practice/history', headers: auth() })
    ).json();
    expect(left.map((s: { id: number }) => s.id)).toEqual([ids[2]]);
    const bad = await app.inject({
      method: 'POST',
      url: '/api/practice/remove',
      headers: auth(),
      payload: { ids: [] },
    });
    expect(bad.statusCode).toBe(400);
  });
});

describe('the Continue row', () => {
  it('sets an item aside until it is shown again or played', async () => {
    await setupAndLogin();
    const lib = () =>
      app.inject({ method: 'GET', url: '/api/library', headers: auth() }).then((r) => r.json());
    const item = (await lib()).items[0];
    const key = `item:${item.id}`;
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/continue/hidden',
          headers: auth(),
          payload: { key },
        })
      ).statusCode,
    ).toBe(200);
    expect((await lib()).continueHidden).toEqual([key]);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/continue/hidden',
          headers: auth(),
          payload: { key: 'nonsense' },
        })
      ).statusCode,
    ).toBe(400);
    await app.inject({
      method: 'POST',
      url: '/api/continue/shown',
      headers: auth(),
      payload: { keys: [key] },
    });
    expect((await lib()).continueHidden).toEqual([]);
    await app.inject({
      method: 'PUT',
      url: '/api/continue/hidden',
      headers: auth(),
      payload: { key },
    });
    await app.inject({
      method: 'POST',
      url: '/api/practice/start',
      headers: auth(),
      payload: { meditationId: item.id },
    });
    expect((await lib()).continueHidden).toEqual([]);
    // A series key survives the round trip whole (a NUL would have cut it short).
    const sk = 'series:Mira Solen\u001fThe Long Road';
    await app.inject({
      method: 'PUT',
      url: '/api/continue/hidden',
      headers: auth(),
      payload: { key: sk },
    });
    expect((await lib()).continueHidden).toEqual([sk]);
  });
});

describe('AI providers and intentions', () => {
  it('connects several providers, switches between them, and never returns a key', async () => {
    await setupAndLogin();
    const settings = () =>
      app.inject({ method: 'GET', url: '/api/ai/settings', headers: auth() }).then((r) => r.json());
    const bad = await app.inject({
      method: 'POST',
      url: '/api/ai/connect',
      headers: auth(),
      payload: { provider: 'anthropic', apiKey: 'sk-bad-0000000000000000' },
    });
    expect(bad.statusCode).toBe(400);
    const a = await app.inject({
      method: 'POST',
      url: '/api/ai/connect',
      headers: auth(),
      payload: { provider: 'anthropic', apiKey: 'sk-good-anthropic-1111' },
    });
    expect(a.json()).toMatchObject({ configured: true, provider: 'anthropic', keyHint: '…1111' });
    await app.inject({
      method: 'POST',
      url: '/api/ai/connect',
      headers: auth(),
      payload: { provider: 'gemini', apiKey: 'sk-good-gemini-2222' },
    });
    let s = await settings();
    expect(s.provider).toBe('gemini');
    expect(s.connections.map((c: { provider: string }) => c.provider).sort()).toEqual([
      'anthropic',
      'gemini',
    ]);
    expect(JSON.stringify(s)).not.toContain('sk-good');
    // Switch back without pasting the key again, and pick a model.
    const sw = await app.inject({
      method: 'PUT',
      url: '/api/ai/settings',
      headers: auth(),
      payload: { provider: 'anthropic', model: 'gpt-4o' },
    });
    expect(sw.json()).toMatchObject({ provider: 'anthropic', model: 'gpt-4o' });
    // Forget the one in use: the other takes over.
    await app.inject({ method: 'DELETE', url: '/api/ai/connections/anthropic', headers: auth() });
    s = await settings();
    expect(s).toMatchObject({ provider: 'gemini', canUse: true });
    await app.inject({ method: 'DELETE', url: '/api/ai/connections/gemini', headers: auth() });
    expect(await settings()).toMatchObject({ configured: false, canUse: false, provider: null });
  });

  it('lets only an admin connect a server by address, and checks the address', async () => {
    await setupAndLogin();
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/connect',
      headers: auth(),
      payload: { provider: 'compatible', baseUrl: 'not a url', apiKey: 'sk-good-local' },
    });
    expect(res.statusCode).toBe(400);
    const ok = await app.inject({
      method: 'POST',
      url: '/api/ai/connect',
      headers: auth(),
      payload: {
        provider: 'compatible',
        baseUrl: 'http://ollama.lan:11434/v1/',
        apiKey: 'sk-good-local',
        model: 'llama3.3',
      },
    });
    expect(ok.json()).toMatchObject({ provider: 'compatible', model: 'llama3.3' });
    expect(ok.json().connections[0].baseUrl).toBe('http://ollama.lan:11434/v1');
  });

  it('keeps intentions and plans with them', async () => {
    await setupAndLogin();
    expect(
      (await app.inject({ method: 'GET', url: '/api/me/intentions', headers: auth() })).json(),
    ).toBeNull();
    const bad = await app.inject({
      method: 'PUT',
      url: '/api/me/intentions',
      headers: auth(),
      payload: { reasons: ['world-domination'] },
    });
    expect(bad.statusCode).toBe(400);
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/me/intentions',
      headers: auth(),
      payload: {
        reasons: ['sleep', 'calm'],
        hope: 'Fall asleep without my phone.',
        experience: 'new',
        minutes: '15',
        daysPerWeek: 5,
        likes: ['guided', 'body'],
        notes: 'No long lectures please.',
      },
    });
    expect(saved.json()).toMatchObject({ reasons: ['sleep', 'calm'], experience: 'new' });
    await app.inject({
      method: 'PUT',
      url: '/api/ai/settings',
      headers: auth(),
      payload: { apiKey: 'sk-good-0000000000abcd' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/ai/plan',
      headers: auth(),
      payload: {
        goal: '',
        weeks: 4,
        startDate: '2026-10-05',
        practice: { daysPerWeek: 5, minutes: 15 },
        learning: null,
      },
    });
    expect(lastPrompt).toContain('I practise for: better sleep, calm and less stress.');
    expect(lastPrompt).toContain('Fall asleep without my phone.');
    expect(lastPrompt).toContain('No long lectures please.');
  });
});
