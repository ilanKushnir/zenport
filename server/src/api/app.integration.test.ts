import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { openDb, type Db } from '../db/index.js';
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
      deps: { fetchVideoMeta: async () => null, listPlaylist: null, transcribe: null },
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
