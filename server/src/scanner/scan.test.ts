import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/index.js';
import { EMBEDDED_ROOT_ID, lastFolderTree, runScan, underAny } from './scan.js';

let libRoot: string;
let db: Db;

function put(rel: string, content = 'x') {
  const abs = path.join(libRoot, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
}

const roots = () => [{ id: 0, path: libRoot, label: 'Meditations' }];

beforeEach(() => {
  libRoot = mkdtempSync(path.join(tmpdir(), 'zp-scan-'));
  db = openDb(':memory:');
});

afterEach(() => {
  db.close();
  rmSync(libRoot, { recursive: true, force: true });
});

describe('excluded folders', () => {
  it('leaves an excluded folder out entirely, then brings the same items back', async () => {
    put('Mira Solen/Morning/01.mp3');
    put('Mira Solen/Morning/02.mp3');
    put('Mira Solen/Unwanted Extras/talk.mp3');
    await runScan(db, roots());
    const before = db.prepare('SELECT id, title FROM items ORDER BY title').all() as {
      id: string;
      title: string;
    }[];
    expect(before.map((i) => i.title)).toEqual(['Morning', 'Unwanted Extras']);

    db.prepare('INSERT INTO excluded_folders (root_id, rel_path) VALUES (0, ?)').run(
      'Mira Solen/Unwanted Extras',
    );
    const state = await runScan(db, roots());
    expect(state.counts.items).toBe(1);
    expect(state.counts.excluded).toBe(1);
    expect(state.counts.missing).toBe(0); // left out on purpose is not "missing"

    // The tree still shows it, marked, so it can be put back.
    const tree = lastFolderTree(0)!;
    const creator = tree.children.find((c) => c.name === 'Mira Solen')!;
    expect(creator.audioFiles).toBe(3);
    expect(creator.children.find((c) => c.name === 'Unwanted Extras')?.excluded).toBe(true);
    expect(creator.children.find((c) => c.name === 'Morning')?.excluded).toBe(false);

    db.prepare('DELETE FROM excluded_folders').run();
    const back = await runScan(db, roots());
    expect(back.counts.excluded).toBe(0);
    const after = db.prepare('SELECT id, title FROM items WHERE missing = 0 ORDER BY title').all();
    expect(after).toEqual(before);
  });

  it('matches whole folder names, not prefixes', () => {
    expect(underAny('A/Bee/x.mp3', ['A/Bee'])).toBe(true);
    expect(underAny('A/Bee', ['A/Bee'])).toBe(true);
    expect(underAny('A/Beetle/x.mp3', ['A/Bee'])).toBe(false);
  });
});

describe('embedded covers', () => {
  const PNG = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0300050001ff2b4c6e0000000049454e44ae426082',
    'hex',
  );
  const syncsafe = (n: number) =>
    Buffer.from([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f]);
  const mp3WithArt = () => {
    const body = Buffer.concat([
      Buffer.from([0]),
      Buffer.from('image/png\0', 'latin1'),
      Buffer.from([3]),
      Buffer.from('\0', 'latin1'),
      PNG,
    ]);
    const frame = Buffer.concat([
      Buffer.from('APIC', 'latin1'),
      syncsafe(body.length),
      Buffer.from([0, 0]),
      body,
    ]);
    return Buffer.concat([
      Buffer.from('ID3', 'latin1'),
      Buffer.from([4, 0, 0]),
      syncsafe(frame.length),
      frame,
    ]);
  };

  it('reads a cover out of the audio when the folder has none, caches it, and serves it from the pseudo-root', async () => {
    const cache = path.join(libRoot, '.cache');
    const abs = path.join(libRoot, 'Mira Solen/Morning/01.mp3');
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, mp3WithArt());
    put('Mira Solen/Morning/02.mp3');

    await runScan(db, roots(), { coverCacheDir: cache });
    const covers = db
      .prepare("SELECT root_id, rel_path, ext, missing FROM assets WHERE kind = 'cover'")
      .all() as { root_id: number; rel_path: string; ext: string; missing: number }[];
    expect(covers).toHaveLength(1);
    expect(covers[0]!.root_id).toBe(EMBEDDED_ROOT_ID);
    expect(covers[0]!.ext).toBe('png');
    expect(covers[0]!.missing).toBe(0);
    expect(readdirSync(cache)).toEqual([covers[0]!.rel_path]);

    // Second scan: cache hit, still present, still not missing.
    await runScan(db, roots(), { coverCacheDir: cache });
    expect(
      (db.prepare("SELECT missing FROM assets WHERE kind = 'cover'").get() as { missing: number })
        .missing,
    ).toBe(0);

    // A real image beside the files wins over the embedded one.
    put('Mira Solen/Morning/cover.jpg');
    await runScan(db, roots(), { coverCacheDir: cache });
    const after = db
      .prepare("SELECT root_id, missing FROM assets WHERE kind = 'cover' ORDER BY root_id")
      .all() as { root_id: number; missing: number }[];
    expect(after).toEqual([
      { root_id: EMBEDDED_ROOT_ID, missing: 1 },
      { root_id: 0, missing: 0 },
    ]);
  });

  it('lists video containers as playable tracks', async () => {
    put('Tomas Reyes/Evening Talk/talk.mp4');
    await runScan(db, roots());
    const tracks = db.prepare('SELECT ext FROM tracks').all() as { ext: string }[];
    expect(tracks.map((t) => t.ext)).toEqual(['mp4']);
  });
});

describe('runScan persistence', () => {
  it('persists items, tracks, and assets from a scan', async () => {
    put('Mira Solen/Morning/01.mp3');
    put('Mira Solen/Morning/02.mp3');
    put('Mira Solen/Morning/cover.jpg');
    put('Mira Solen/Morning/notes.pdf');
    const state = await runScan(db, roots());
    expect(state.counts.items).toBe(1);
    expect(state.counts.tracks).toBe(2);
    expect(state.counts.covers).toBe(1);
    expect(state.counts.documents).toBe(1);
    const item = db.prepare('SELECT * FROM items').get() as Record<string, unknown>;
    expect(item.creator).toBe('Mira Solen');
    expect(item.missing).toBe(0);
  });

  it('is idempotent: rescans keep stable ids and do not duplicate', async () => {
    put('Tara/Calm/a.mp3');
    await runScan(db, roots());
    const before = db.prepare('SELECT id, added_at FROM items').all() as {
      id: string;
      added_at: string;
    }[];
    await runScan(db, roots());
    const after = db.prepare('SELECT id, added_at FROM items').all() as {
      id: string;
      added_at: string;
    }[];
    expect(after).toEqual(before);
    expect((db.prepare('SELECT COUNT(*) c FROM tracks').get() as { c: number }).c).toBe(1);
  });

  it('marks vanished items missing without deleting them, and revives them on return', async () => {
    put('Tara/Calm/a.mp3');
    await runScan(db, roots());
    const { id } = db.prepare('SELECT id FROM items').get() as { id: string };

    // History exists for this item; it must survive the file going away.
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role) VALUES (1, 'astra', 'x', 'admin')`,
    ).run();
    db.prepare(
      `INSERT INTO practice_sessions (user_id, item_id, started_at, status, listened_sec)
       VALUES (1, ?, '2026-01-01T08:00:00Z', 'completed', 600)`,
    ).run(id);

    renameSync(path.join(libRoot, 'Tara'), path.join(libRoot, '..', 'Tara-moved'));
    await runScan(db, roots());
    const gone = db.prepare('SELECT missing FROM items WHERE id = ?').get(id) as {
      missing: number;
    };
    expect(gone.missing).toBe(1);
    expect((db.prepare('SELECT COUNT(*) c FROM practice_sessions').get() as { c: number }).c).toBe(
      1,
    );

    renameSync(path.join(libRoot, '..', 'Tara-moved'), path.join(libRoot, 'Tara'));
    await runScan(db, roots());
    const back = db.prepare('SELECT missing FROM items WHERE id = ?').get(id) as {
      missing: number;
    };
    expect(back.missing).toBe(0);
  });

  it('records warnings and ignored counts in scan state', async () => {
    put('a.mp3');
    put('junk.xyz');
    const state = await runScan(db, roots());
    expect(state.counts.ignored).toBeGreaterThanOrEqual(1);
    expect(state.status).toBe('idle');
    expect(state.finishedAt).toBeTruthy();
  });

  it('reports an unreadable root without crashing', async () => {
    const state = await runScan(db, [{ id: 0, path: path.join(libRoot, 'nope'), label: 'Bad' }]);
    expect(state.roots[0]?.ok).toBe(false);
    expect(state.counts.items).toBe(0);
  });
});
