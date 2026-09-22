import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/index.js';
import { startSession, beatSession, finishSession, activeSession } from './service.js';

let db: Db;
const USER = 1;

beforeEach(() => {
  db = openDb(':memory:');
  // Sessions cascade from their owner, so the owner must exist.
  db.prepare(
    `INSERT INTO users (id, username, password_hash, role) VALUES (1, 'astra', 'x', 'admin')`,
  ).run();
  db.prepare(
    `INSERT INTO items (id, root_id, item_key, kind, title, creator, collection, breadcrumbs, evidence, added_at)
     VALUES ('itemA', 0, 'A', 'folder', 'A', 'C', NULL, '[]', '[]', '2026-01-01T00:00:00Z')`,
  ).run();
});

describe('practice sessions', () => {
  it('records start, heartbeats, and completion', () => {
    const t0 = new Date('2026-09-22T08:00:00Z');
    const id = startSession(db, USER, 'itemA', t0);
    beatSession(db, USER, id, 60, new Date('2026-09-22T08:01:00Z'));
    beatSession(db, USER, id, 60, new Date('2026-09-22T08:02:00Z'));
    finishSession(db, USER, id, 'completed', 'finished', new Date('2026-09-22T08:02:30Z'));
    const row = db.prepare('SELECT * FROM practice_sessions WHERE id = ?').get(id) as Record<
      string,
      unknown
    >;
    expect(row.status).toBe('completed');
    expect(row.listened_sec).toBe(120);
    expect(row.ended_at).toBe('2026-09-22T08:02:30.000Z');
  });

  it('clamps heartbeat deltas to elapsed wall time — no double counting replays', () => {
    const t0 = new Date('2026-09-22T08:00:00Z');
    const id = startSession(db, USER, 'itemA', t0);
    // Client claims 10 minutes listened after 1 minute of wall time.
    beatSession(db, USER, id, 600, new Date('2026-09-22T08:01:00Z'));
    const row = db.prepare('SELECT listened_sec FROM practice_sessions WHERE id = ?').get(id) as {
      listened_sec: number;
    };
    expect(row.listened_sec).toBeLessThanOrEqual(65); // wall + small tolerance
  });

  it('starting a new session closes a dangling active one as abandoned', () => {
    const a = startSession(db, USER, 'itemA', new Date('2026-09-22T08:00:00Z'));
    beatSession(db, USER, a, 120, new Date('2026-09-22T08:02:00Z'));
    const b = startSession(db, USER, 'itemA', new Date('2026-09-22T09:00:00Z'));
    const rowA = db
      .prepare('SELECT status, listened_sec FROM practice_sessions WHERE id = ?')
      .get(a) as { status: string; listened_sec: number };
    expect(rowA.status).toBe('abandoned');
    expect(rowA.listened_sec).toBe(120);
    expect(activeSession(db, USER)?.id).toBe(b);
  });

  it('ignores beats from another user', () => {
    const id = startSession(db, USER, 'itemA', new Date('2026-09-22T08:00:00Z'));
    beatSession(db, 999, id, 60, new Date('2026-09-22T08:01:00Z'));
    const row = db.prepare('SELECT listened_sec FROM practice_sessions WHERE id = ?').get(id) as {
      listened_sec: number;
    };
    expect(row.listened_sec).toBe(0);
  });
});
