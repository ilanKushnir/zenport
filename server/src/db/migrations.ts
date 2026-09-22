import type { DatabaseSync } from 'node:sqlite';

/**
 * Sequential migrations. Each entry runs once, tracked in schema_version.
 * v0.1 ships one migration; future releases append, never edit.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    timezone TEXT NOT NULL DEFAULT 'UTC',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  CREATE TABLE auth_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE scan_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    status TEXT NOT NULL DEFAULT 'idle',
    started_at TEXT,
    finished_at TEXT,
    warnings TEXT NOT NULL DEFAULT '[]',
    ignored INTEGER NOT NULL DEFAULT 0,
    roots TEXT NOT NULL DEFAULT '[]'
  );
  INSERT INTO scan_state (id) VALUES (1);

  CREATE TABLE items (
    id TEXT PRIMARY KEY,
    root_id INTEGER NOT NULL,
    item_key TEXT NOT NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    creator TEXT NOT NULL,
    collection TEXT,
    breadcrumbs TEXT NOT NULL,
    evidence TEXT NOT NULL,
    missing INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL,
    UNIQUE (root_id, item_key)
  );
  CREATE INDEX idx_items_creator ON items(creator);

  CREATE TABLE tracks (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    root_id INTEGER NOT NULL,
    rel_path TEXT NOT NULL,
    name TEXT NOT NULL,
    ext TEXT NOT NULL,
    ord INTEGER NOT NULL,
    title TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    duration_sec REAL,
    missing INTEGER NOT NULL DEFAULT 0,
    UNIQUE (root_id, rel_path)
  );
  CREATE INDEX idx_tracks_item ON tracks(item_id);

  CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    root_id INTEGER NOT NULL,
    rel_path TEXT NOT NULL,
    name TEXT NOT NULL,
    ext TEXT NOT NULL,
    kind TEXT NOT NULL, -- 'cover' | 'document'
    size_bytes INTEGER NOT NULL,
    missing INTEGER NOT NULL DEFAULT 0,
    UNIQUE (item_id, rel_path)
  );
  CREATE INDEX idx_assets_item ON assets(item_id);

  CREATE TABLE playback_positions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    position_sec REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, track_id)
  );
  CREATE INDEX idx_positions_item ON playback_positions(user_id, item_id);

  CREATE TABLE practice_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    listened_sec REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    reason TEXT,
    last_beat_at TEXT
  );
  CREATE INDEX idx_sessions_user ON practice_sessions(user_id, started_at);

  CREATE TABLE plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    intention TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT,
    days_of_week TEXT NOT NULL DEFAULT '[]',
    preferred_time TEXT,
    target_minutes INTEGER,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    meditation_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );

  CREATE TABLE plan_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    status TEXT, -- 'completed' | 'skipped' | NULL (moved away)
    moved_to TEXT,
    moved_from TEXT,
    session_id INTEGER,
    UNIQUE (plan_id, date)
  );

  CREATE TABLE journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    session_id INTEGER,
    item_id TEXT,
    title TEXT,
    body TEXT NOT NULL DEFAULT '',
    mood INTEGER,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX idx_journal_user ON journal_entries(user_id, created_at);

  CREATE TABLE voice_notes (
    id TEXT PRIMARY KEY,
    entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL,
    file_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    duration_sec REAL,
    transcript TEXT,
    transcript_status TEXT NOT NULL DEFAULT 'none',
    transcript_error TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE yt_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    creator TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    collection TEXT,
    prov_kind TEXT NOT NULL DEFAULT 'manual',
    prov_ref TEXT,
    added_by INTEGER,
    added_at TEXT NOT NULL
  );

  CREATE TABLE track_durations_reported (
    track_id TEXT PRIMARY KEY,
    duration_sec REAL NOT NULL,
    reported_at TEXT NOT NULL
  );
  `,

  // v2: user-owned private tables carried user_id with no FOREIGN KEY, so
  // deleting a member orphaned their sessions, plans, journal entries and
  // voice notes. SQLite cannot add a constraint in place; each table is
  // rebuilt with the documented create-new/copy/drop/rename procedure
  // (migrations run with foreign_keys off, see migrate()). Pre-existing
  // orphans are deleted first: they are exactly the private rows the
  // cascade contract says must not outlive their owner.
  `
  DELETE FROM practice_sessions WHERE user_id NOT IN (SELECT id FROM users);
  DELETE FROM plans WHERE user_id NOT IN (SELECT id FROM users);
  DELETE FROM plan_entries WHERE plan_id NOT IN (SELECT id FROM plans);
  DELETE FROM journal_entries WHERE user_id NOT IN (SELECT id FROM users);
  DELETE FROM voice_notes
    WHERE user_id NOT IN (SELECT id FROM users)
       OR entry_id NOT IN (SELECT id FROM journal_entries);
  UPDATE yt_sources SET added_by = NULL
    WHERE added_by IS NOT NULL AND added_by NOT IN (SELECT id FROM users);

  CREATE TABLE practice_sessions_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    listened_sec REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    reason TEXT,
    last_beat_at TEXT
  );
  INSERT INTO practice_sessions_v2
    SELECT id, user_id, item_id, started_at, ended_at, listened_sec, status, reason, last_beat_at
    FROM practice_sessions;
  DROP TABLE practice_sessions;
  ALTER TABLE practice_sessions_v2 RENAME TO practice_sessions;
  CREATE INDEX idx_sessions_user ON practice_sessions(user_id, started_at);

  CREATE TABLE plans_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    intention TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT,
    days_of_week TEXT NOT NULL DEFAULT '[]',
    preferred_time TEXT,
    target_minutes INTEGER,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    meditation_ids TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  );
  INSERT INTO plans_v2
    SELECT id, user_id, name, intention, start_date, end_date, days_of_week,
           preferred_time, target_minutes, notes, status, meditation_ids, created_at
    FROM plans;
  DROP TABLE plans;
  ALTER TABLE plans_v2 RENAME TO plans;

  CREATE TABLE journal_entries_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id INTEGER,
    item_id TEXT,
    title TEXT,
    body TEXT NOT NULL DEFAULT '',
    mood INTEGER,
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  INSERT INTO journal_entries_v2
    SELECT id, user_id, session_id, item_id, title, body, mood, tags, created_at, updated_at
    FROM journal_entries;
  DROP TABLE journal_entries;
  ALTER TABLE journal_entries_v2 RENAME TO journal_entries;
  CREATE INDEX idx_journal_user ON journal_entries(user_id, created_at);

  CREATE TABLE voice_notes_v2 (
    id TEXT PRIMARY KEY,
    entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    duration_sec REAL,
    transcript TEXT,
    transcript_status TEXT NOT NULL DEFAULT 'none',
    transcript_error TEXT,
    created_at TEXT NOT NULL
  );
  INSERT INTO voice_notes_v2
    SELECT id, entry_id, user_id, file_name, mime, size_bytes, duration_sec,
           transcript, transcript_status, transcript_error, created_at
    FROM voice_notes;
  DROP TABLE voice_notes;
  ALTER TABLE voice_notes_v2 RENAME TO voice_notes;

  -- yt_sources are shared library data, not private: attribution goes null
  -- rather than deleting another member's contributed sources.
  CREATE TABLE yt_sources_v2 (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    video_id TEXT NOT NULL UNIQUE,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    creator TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    collection TEXT,
    prov_kind TEXT NOT NULL DEFAULT 'manual',
    prov_ref TEXT,
    added_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    added_at TEXT NOT NULL
  );
  INSERT INTO yt_sources_v2
    SELECT id, video_id, url, title, creator, tags, collection, prov_kind, prov_ref, added_by, added_at
    FROM yt_sources;
  DROP TABLE yt_sources;
  ALTER TABLE yt_sources_v2 RENAME TO yt_sources;
  `,
];

export function migrate(db: DatabaseSync): void {
  db.exec('PRAGMA journal_mode = WAL');
  // Table-rebuild migrations follow the SQLite ALTER TABLE procedure: they
  // must run with foreign_keys off (the pragma is a no-op inside a
  // transaction, so it is toggled out here), each one is verified with
  // foreign_key_check before it commits, and enforcement is switched back
  // on for the life of the connection afterwards.
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get() as
    { version: number } | undefined;
  let version = row?.version ?? 0;
  for (let i = version; i < MIGRATIONS.length; i++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[i] as string);
      const broken = db.prepare('PRAGMA foreign_key_check').all();
      if (broken.length > 0) {
        throw new Error(
          `migration ${i + 1} left foreign-key violations: ${JSON.stringify(broken)}`,
        );
      }
      version = i + 1;
      db.exec('DELETE FROM schema_version');
      db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(version);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  db.exec('PRAGMA foreign_keys = ON');
}
