import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from './index.js';

// Regression: deleting a member must remove every private row they own.
// v1 declared user_id columns with no FOREIGN KEY on the private tables, so
// enforcement never applied and deletion left orphans behind.

const T = '2026-09-22T10:00:00Z';

/** Insert one representative row in every user-owned table for `userId`. */
function seedUserData(db: Db, userId: number, tag: string): void {
  db.prepare(
    `INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?)`,
  ).run(`hash-${tag}`, userId, T, '2099-01-01T00:00:00Z');
  db.prepare(
    `INSERT INTO playback_positions (user_id, track_id, item_id, position_sec, updated_at)
     VALUES (?, ?, ?, 42, ?)`,
  ).run(userId, `track-${tag}`, `item-${tag}`, T);
  db.prepare(
    `INSERT INTO practice_sessions (user_id, item_id, started_at, listened_sec, status)
     VALUES (?, ?, ?, 300, 'completed')`,
  ).run(userId, `item-${tag}`, T);
  const plan = db
    .prepare(
      `INSERT INTO plans (user_id, name, start_date, created_at) VALUES (?, ?, '2026-09-01', ?)`,
    )
    .run(userId, `plan-${tag}`, T);
  db.prepare(
    `INSERT INTO plan_entries (plan_id, date, status) VALUES (?, '2026-09-02', 'completed')`,
  ).run(plan.lastInsertRowid);
  const entry = db
    .prepare(
      `INSERT INTO journal_entries (user_id, body, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    )
    .run(userId, `private thoughts of ${tag}`, T, T);
  db.prepare(
    `INSERT INTO voice_notes (id, entry_id, user_id, file_name, mime, size_bytes, created_at)
     VALUES (?, ?, ?, ?, 'audio/webm', 1024, ?)`,
  ).run(`vn-${tag}`, entry.lastInsertRowid, userId, `${tag}.webm`, T);
  db.prepare(
    `INSERT INTO yt_sources (video_id, url, title, added_by, added_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(`vid-${tag}0000`, `https://youtu.be/vid-${tag}`, `Video ${tag}`, userId, T);
}

const PRIVATE_TABLES = [
  'auth_sessions',
  'playback_positions',
  'practice_sessions',
  'plans',
  'journal_entries',
  'voice_notes',
] as const;

describe('user deletion cascade', () => {
  let db: Db;

  beforeEach(() => {
    db = openDb(':memory:');
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role) VALUES (1, 'keeper', 'x', 'admin')`,
    ).run();
    db.prepare(
      `INSERT INTO users (id, username, password_hash, role) VALUES (2, 'leaver', 'x', 'member')`,
    ).run();
    seedUserData(db, 1, 'keeper');
    seedUserData(db, 2, 'leaver');
  });

  afterEach(() => db.close());

  it('enforces foreign keys on the opened connection', () => {
    const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(fk.foreign_keys).toBe(1);
    // And the schema is clean: no violations survive migration.
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('declares a users reference on every table that stores a user id', () => {
    // Schema drift guard: any table carrying user_id/added_by must declare
    // its FK, or enforcement silently stops covering it again.
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as {
      name: string;
    }[];
    for (const { name } of tables) {
      const cols = db.prepare(`PRAGMA table_info(${name})`).all() as { name: string }[];
      const hasUserCol = cols.some((c) => c.name === 'user_id' || c.name === 'added_by');
      if (!hasUserCol) continue;
      const fks = db.prepare(`PRAGMA foreign_key_list(${name})`).all() as { table: string }[];
      expect(
        fks.map((f) => f.table),
        `${name} must reference users`,
      ).toContain('users');
    }
  });

  it('deleting a member removes all of their private rows and nothing else', () => {
    db.prepare('DELETE FROM users WHERE id = 2').run();

    for (const table of PRIVATE_TABLES) {
      const orphaned = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE user_id = 2`).get() as {
        c: number;
      };
      expect(orphaned.c, `${table} must not keep rows for a deleted user`).toBe(0);
      const kept = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE user_id = 1`).get() as {
        c: number;
      };
      expect(kept.c, `${table} must keep the remaining user's rows`).toBe(1);
    }

    // plan_entries hang off plans, not users: the leaver's entries follow
    // their plan out, the keeper's stay.
    const entries = db
      .prepare(
        `SELECT COUNT(*) AS c FROM plan_entries
         WHERE plan_id IN (SELECT id FROM plans WHERE user_id = 1)`,
      )
      .get() as { c: number };
    expect(entries.c).toBe(1);
    const totalEntries = db.prepare('SELECT COUNT(*) AS c FROM plan_entries').get() as {
      c: number;
    };
    expect(totalEntries.c).toBe(1);

    // Shared YouTube sources survive with attribution nulled, not deleted.
    const sources = db
      .prepare('SELECT video_id, added_by FROM yt_sources ORDER BY video_id')
      .all() as { video_id: string; added_by: number | null }[];
    expect(sources).toHaveLength(2);
    expect(sources.find((s) => s.video_id === 'vid-leaver0000')?.added_by).toBeNull();
    expect(sources.find((s) => s.video_id === 'vid-keeper0000')?.added_by).toBe(1);
  });
});
