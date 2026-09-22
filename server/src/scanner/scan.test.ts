import { mkdtempSync, mkdirSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/index.js';
import { runScan } from './scan.js';

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
