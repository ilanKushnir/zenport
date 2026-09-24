import type { DatabaseSync } from 'node:sqlite';

/**
 * Sequential migrations. Each entry runs once, tracked in schema_version.
 * v0.1 ships one migration; future releases append, never edit.
 */
export const MIGRATIONS: string[] = [
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

  // v3: per-account preferences and favourites.
  //
  // Preferences are one row per user rather than columns on `users`, so the
  // set can grow without rebuilding the account table every release, and so
  // an account deletion takes its preferences with it through the same
  // cascade contract as the rest of the private data.
  //
  // `onboarded_at` is what gates the welcome flow. It is deliberately a
  // timestamp and not a boolean: knowing WHEN someone first set the app up
  // is what lets a later release show a "what's new since" pass without
  // guessing, and NULL still reads as "never onboarded".
  //
  // Favourites carry no FOREIGN KEY to `items` on purpose. A library item
  // disappears whenever the file behind it is unmounted, and a favourite must
  // survive that — the same reasoning practice_sessions already uses for
  // item_id. Rows for items that never come back are harmless; the API joins
  // them away.
  `
  CREATE TABLE user_prefs (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    onboarded_at TEXT,
    accent TEXT NOT NULL DEFAULT 'spectrum',
    start_page TEXT NOT NULL DEFAULT 'today',
    daily_goal_minutes INTEGER,
    default_timer_minutes INTEGER NOT NULL DEFAULT 10,
    bell_enabled INTEGER NOT NULL DEFAULT 1,
    bell_volume REAL NOT NULL DEFAULT 0.5,
    interval_bell_minutes INTEGER,
    autoplay_next INTEGER NOT NULL DEFAULT 1,
    calm_motion INTEGER NOT NULL DEFAULT 0,
    ambient_background INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  CREATE TABLE favorites (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    PRIMARY KEY (user_id, item_id)
  );

  -- Existing accounts predate onboarding. Giving them a non-NULL
  -- onboarded_at means an upgrade does not ambush someone mid-practice with
  -- a welcome tour for an app they already use.
  INSERT INTO user_prefs (user_id, onboarded_at)
    SELECT id, strftime('%Y-%m-%dT%H:%M:%SZ','now') FROM users;
  `,

  // v4: the last release each account was told about, for the "What's new"
  // dialog. Left NULL for every existing account on purpose: NULL reads as
  // "was here before the dialog existed", and those are exactly the people
  // who should see it once. A brand-new account has the current version
  // stamped by the welcome tour when it finishes.
  `
  ALTER TABLE user_prefs ADD COLUMN seen_version TEXT;
  `,

  // v5: folders the owner has chosen to leave out of the library.
  //
  // A path is stored per root, relative and posix-style, and covers the whole
  // subtree beneath it. The scanner drops those files before inference, so
  // what remains is read as if the folder were not there at all.
  //
  // `items.excluded` is what separates "left out on purpose" from "missing":
  // both are gone from the shelves, but only a missing item is reported as
  // something to worry about. Practice history keeps pointing at the item
  // either way, and un-excluding a folder brings the same item ids back.
  `
  CREATE TABLE excluded_folders (
    root_id INTEGER NOT NULL,
    rel_path TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    PRIMARY KEY (root_id, rel_path)
  );
  ALTER TABLE items ADD COLUMN excluded INTEGER NOT NULL DEFAULT 0;
  `,

  // v6: what each item is for, how far each account got through it, what a
  // plan is for, and the account's own AI key.
  //
  // `items.inferred_type` is the scanner's guess and is rewritten on every
  // scan. The owner's correction lives in `item_types`, apart from it, so a
  // rescan can never undo a choice someone made on purpose; no foreign key,
  // for the same reason favourites have none (an unmounted item must keep it).
  //
  // `track_completions` is per account: a lesson one person finished is not
  // finished for the household.
  //
  // `ai_settings.api_key_enc` is AES-GCM ciphertext under a key derived from
  // the session secret. The plaintext key is never returned by the API.
  `
  ALTER TABLE items ADD COLUMN inferred_type TEXT NOT NULL DEFAULT 'meditation';
  ALTER TABLE items ADD COLUMN type_reason TEXT;

  CREATE TABLE item_types (
    item_id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );

  CREATE TABLE track_completions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    completed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    PRIMARY KEY (user_id, track_id)
  );
  CREATE INDEX idx_track_completions_item ON track_completions(user_id, item_id);

  ALTER TABLE plans ADD COLUMN focus TEXT NOT NULL DEFAULT 'practice';

  CREATE TABLE ai_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    api_key_enc TEXT NOT NULL,
    key_hint TEXT NOT NULL,
    model TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
  `,

  // v7: what each track is inside a course or talk - a lesson to study, or a
  // meditation to do (a guided practice that belongs to the course). The
  // scanner's guess is rewritten each scan; the owner's choice lives apart in
  // track_roles, so the parent stays a course whatever its tracks are.
  `
  ALTER TABLE tracks ADD COLUMN inferred_role TEXT NOT NULL DEFAULT 'lesson';
  CREATE TABLE track_roles (
    track_id TEXT PRIMARY KEY,
    role TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
  `,

  // v8: people. Invitations instead of open signup (single-use links, stored
  // only as a hash), a name and avatar to show friends, how much each person
  // shares with friends, friendships (one row per pair: the asker first),
  // cheers (a bow on a session, or a nudge), plans grouped into an AI path,
  // and instance settings such as sharing the owner's AI key.
  `
  ALTER TABLE users ADD COLUMN display_name TEXT;
  ALTER TABLE users ADD COLUMN avatar TEXT;
  ALTER TABLE users ADD COLUMN share_level TEXT NOT NULL DEFAULT 'full';

  ALTER TABLE plans ADD COLUMN path_name TEXT;
  ALTER TABLE plans ADD COLUMN path_step INTEGER;

  CREATE TABLE invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL DEFAULT 'join',
    note TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    befriend INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    for_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    revoked_at TEXT
  );

  CREATE TABLE friendships (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    friend_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    accepted_at TEXT,
    PRIMARY KEY (user_id, friend_id),
    CHECK (user_id != friend_id)
  );
  CREATE INDEX idx_friendships_friend ON friendships(friend_id);

  CREATE TABLE cheers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id INTEGER REFERENCES practice_sessions(id) ON DELETE CASCADE,
    item_id TEXT,
    kind TEXT NOT NULL,
    message TEXT,
    created_at TEXT NOT NULL,
    seen_at TEXT
  );
  CREATE INDEX idx_cheers_to ON cheers(to_id, created_at);
  CREATE UNIQUE INDEX idx_cheers_once ON cheers(from_id, session_id, kind) WHERE session_id IS NOT NULL;

  CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,

  // v9: "push the rest" - a plan's later sessions slid by some days from a
  // date on. Kept as an ordered list of {from, days} applied in turn to the
  // dates the cadence produces, so history before each push never moves.
  `
  ALTER TABLE plans ADD COLUMN shifts TEXT NOT NULL DEFAULT '[]';
  `,

  // v10: the AI planner's own account of a plan - why this order, what to
  // expect, a few tips - kept apart from the person's notes and read-only.
  // Plans the planner made before this kept its summary in notes
  // ("Planned with <model>. <summary>"); that moves across, notes go empty.
  `
  ALTER TABLE plans ADD COLUMN guide TEXT;
  UPDATE plans
     SET guide = json_object(
           'model', substr(notes, 14, instr(notes, '. ') - 14),
           'summary', substr(notes, instr(notes, '. ') + 2),
           'why', '',
           'tips', json('[]')
         ),
         notes = NULL
   WHERE notes LIKE 'Planned with %' AND instr(notes, '. ') > 14;
  `,

  // v11: identity that survives the library moving.
  //
  // `library_roots` gives each mounted folder an id that follows its path,
  // not its place in ZP_LIBRARY_DIRS - reordering or removing an entry no
  // longer renumbers the others. The first boot seeds it with the ids the
  // list order gave, so nothing already stored changes meaning.
  //
  // `tracks.fingerprint` is a hash of a file's size, first 64 KiB and last
  // 64 KiB: cheap to read over SMB, and the same wherever the file lives.
  // When a file or a whole folder turns up at a new path - moved, renamed, or
  // a library unmounted and mounted back somewhere else - the scanner gives
  // it the identity it had, so progress, ticks, favourites, types, roles and
  // order all stay. `fp_stamp` (size:mtime) says when it must be re-read.
  //
  // `track_order` is the owner's own order for an item's parts, apart from
  // the scanner's guess (tracks.ord) like item_types and track_roles, so no
  // rescan can undo it. Parts it does not list (added later) follow it.
  `
  CREATE TABLE library_roots (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    last_seen TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
  ALTER TABLE tracks ADD COLUMN fingerprint TEXT;
  ALTER TABLE tracks ADD COLUMN fp_stamp TEXT;
  CREATE INDEX idx_tracks_fingerprint ON tracks(fingerprint);
  CREATE TABLE track_order (
    track_id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    pos INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
  CREATE INDEX idx_track_order_item ON track_order(item_id);
  `,

  // v12: the owner's corrections, and what has been looked at.
  //
  // The scanner writes what it read into `inferred_*` and the visible columns
  // alike; the owner's corrections live apart, in `item_edits` and
  // `track_edits` keyed by id, and are laid over the visible columns after
  // every scan - so a rescan never undoes them, and since ids follow files
  // that move, neither does reorganising the library. Clearing a correction
  // puts the scanner's reading back. (`collection_set` tells "no series" -
  // a deliberate null - from "not corrected".)
  //
  // `item_reviews` is when the owner last said an item reads right (or
  // saved a correction). What was added after `library_baseline` and has not
  // been reviewed is "new"; installs upgrading today start with nothing new.
  // `scan_state.new_items` is how many recordings the last scan found that
  // were never seen before, for the "scan finished" notice.
  `
  ALTER TABLE items ADD COLUMN inferred_title TEXT;
  ALTER TABLE items ADD COLUMN inferred_creator TEXT;
  ALTER TABLE items ADD COLUMN inferred_collection TEXT;
  UPDATE items SET inferred_title = title, inferred_creator = creator, inferred_collection = collection;
  ALTER TABLE tracks ADD COLUMN inferred_title TEXT;
  UPDATE tracks SET inferred_title = title;
  CREATE TABLE item_edits (
    item_id TEXT PRIMARY KEY,
    title TEXT,
    creator TEXT,
    collection TEXT,
    collection_set INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
  CREATE TABLE track_edits (
    track_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
  CREATE TABLE item_reviews (
    item_id TEXT PRIMARY KEY,
    reviewed_at TEXT NOT NULL
  );
  ALTER TABLE scan_state ADD COLUMN new_items INTEGER NOT NULL DEFAULT 0;
  INSERT OR IGNORE INTO app_settings (key, value)
    VALUES ('library_baseline', strftime('%Y-%m-%dT%H:%M:%SZ','now'));
  `,

  // v13: things someone set aside from their Continue row. A key is
  // 'item:<id>' or 'series:<creator>\u001f<series>'. It stays hidden until
  // they open it again or play any of it - then the row is simply removed.
  `
  CREATE TABLE continue_hidden (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    hidden_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    PRIMARY KEY (user_id, key)
  );
  `,

  // v14: more than one AI provider, and why someone practises.
  //
  // `ai_keys` holds one connection per account and provider (OpenAI,
  // Anthropic, Gemini, OpenRouter, or an OpenAI-compatible server at
  // `base_url`), each key sealed as before; `ai_active` says which one is in
  // use, so switching never means pasting a key again. The one OpenAI key
  // each account had moves across; `ai_settings` is left in place, unused.
  //
  // `user_intentions` is a few answers about why the person practises and
  // what they hope for - context for everything the AI does for them.
  `
  CREATE TABLE ai_keys (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    api_key_enc TEXT,
    key_hint TEXT,
    base_url TEXT,
    model TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    PRIMARY KEY (user_id, provider)
  );
  CREATE TABLE ai_active (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL
  );
  INSERT INTO ai_keys (user_id, provider, api_key_enc, key_hint, base_url, model, updated_at)
    SELECT user_id, 'openai', api_key_enc, key_hint, NULL, model, updated_at FROM ai_settings;
  INSERT INTO ai_active (user_id, provider) SELECT user_id, 'openai' FROM ai_settings;
  CREATE TABLE user_intentions (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
  `,

  // v15: AI enhancing the library, always as suggestions the admin decides.
  //
  // `ai_suggestions` holds each proposed change - a fix to how something was
  // read, a description and level found on the web, a creator's picture -
  // with the reason, until it is applied or dismissed. A dismissed one is
  // remembered so the same suggestion does not come back.
  //
  // `item_about` is what research found for a recording (description, level,
  // sources); `creator_images` the picture chosen for a creator, a file under
  // the data dir. Both are keyed like everything else the owner decides.
  `
  CREATE TABLE ai_suggestions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    target TEXT NOT NULL,
    field TEXT NOT NULL,
    value TEXT NOT NULL,
    current TEXT,
    reason TEXT NOT NULL DEFAULT '',
    confidence TEXT NOT NULL DEFAULT 'medium',
    status TEXT NOT NULL DEFAULT 'pending',
    model TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
    decided_at TEXT
  );
  CREATE INDEX idx_ai_suggestions ON ai_suggestions(status, kind);
  CREATE TABLE item_about (
    item_id TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    level TEXT,
    sources TEXT NOT NULL DEFAULT '[]',
    model TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
  CREATE TABLE creator_images (
    name TEXT PRIMARY KEY,
    file TEXT NOT NULL,
    source_url TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  );
  `,
  // v16: the guide's notes - one per review, kept for their owner only.
  `
  CREATE TABLE guide_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    days INTEGER NOT NULL,
    used_journal INTEGER NOT NULL DEFAULT 0,
    question TEXT,
    body TEXT NOT NULL,
    model TEXT
  );
  CREATE INDEX idx_guide_notes_user ON guide_notes(user_id, created_at);
  `,
  // v17: featured on Today - an opt-in, and the day's picks (one row a person).
  `
  ALTER TABLE user_prefs ADD COLUMN ai_featured INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE featured_picks (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    day TEXT NOT NULL,
    body TEXT NOT NULL,
    model TEXT,
    created_at TEXT NOT NULL
  );
  `,
  // v18: Discover - each search, and what it found (saved ones outlive their search).
  `
  CREATE TABLE discover_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    kinds TEXT NOT NULL,
    note TEXT,
    model TEXT
  );
  CREATE TABLE discover_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    run_id INTEGER REFERENCES discover_runs(id) ON DELETE SET NULL,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    by TEXT,
    why TEXT NOT NULL,
    url TEXT NOT NULL,
    format TEXT,
    cost TEXT NOT NULL DEFAULT 'unknown',
    saved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX idx_discover_items_user ON discover_items(user_id, saved);
  `,
  // v19: whether a Discover search had the web, or only the AI's own knowledge.
  `
  ALTER TABLE discover_runs ADD COLUMN web INTEGER NOT NULL DEFAULT 1;
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
