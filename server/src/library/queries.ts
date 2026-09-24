import type {
  CreatorDto,
  LibraryDto,
  MeditationDetailDto,
  MeditationSummaryDto,
  ResumeStateDto,
} from '@zenport/shared';
import {
  CONTENT_TYPES,
  PRACTICE_RESUME_MINUTES,
  isPracticeType,
  isVideoExt,
  naturalCompare,
  type ContentType,
} from '@zenport/shared';
import type { Db } from '../db/index.js';
import type { Config } from '../config.js';
import { documentKind } from '../scanner/classify.js';
import { readScanState } from '../scanner/scan.js';

interface ItemRow {
  id: string;
  root_id: number;
  item_key: string;
  kind: string;
  title: string;
  creator: string;
  collection: string | null;
  breadcrumbs: string;
  evidence: string;
  missing: number;
  added_at: string;
  inferred_type: string;
  type_reason: string | null;
}

function rootLabel(config: Config, rootId: number): string {
  return config.libraryRoots.find((r) => r.id === rootId)?.label ?? `Library ${rootId + 1}`;
}

/**
 * Where to pick an item up: its most recently played track, if that track is
 * not ticked done and the place is past the opening seconds and short of the
 * end. A lesson played to its last seconds is finished, not "in progress".
 */
/** The oldest save a meditation's place may have and still be offered. */
export const freshSince = () =>
  new Date(Date.now() - PRACTICE_RESUME_MINUTES * 60_000).toISOString();

/** A saved place is worth returning to: past the opening seconds, short of the end. */
export function worthResuming(positionSec: number, durationSec: number | null): boolean {
  if (positionSec < 10) return false;
  return !(durationSec && (positionSec >= durationSec * 0.95 || positionSec >= durationSec - 15));
}

/**
 * Where to pick an item up: the most recently played track that is not ticked
 * done and holds a place worth returning to. (Not simply the last row - a
 * lesson just finished must not hide the one left half-watched before it.)
 */
export function resumePoint(
  db: Db,
  userId: number,
  itemId: string,
  practice = false,
): { trackId: string; positionSec: number; updatedAt: string } | null {
  // A meditation's place is only for an accidental exit: kept a few minutes.
  const since = practice ? freshSince() : '';
  const rows = db
    .prepare(
      `SELECT p.track_id, p.position_sec, p.updated_at, t.duration_sec
       FROM playback_positions p JOIN tracks t ON t.id = p.track_id
       WHERE p.user_id = ? AND p.item_id = ? AND t.missing = 0 AND p.updated_at >= ?
         AND NOT EXISTS (SELECT 1 FROM track_completions c
                         WHERE c.user_id = p.user_id AND c.track_id = p.track_id)
       ORDER BY p.updated_at DESC`,
    )
    .all(userId, itemId, since) as {
    track_id: string;
    position_sec: number;
    updated_at: string;
    duration_sec: number | null;
  }[];
  const row = rows.find((r) => worthResuming(r.position_sec, r.duration_sec));
  return row
    ? { trackId: row.track_id, positionSec: row.position_sec, updatedAt: row.updated_at }
    : null;
}

function summarize(db: Db, config: Config, row: ItemRow, userId: number): MeditationSummaryDto {
  const tracks = db
    .prepare(
      `SELECT COUNT(*) AS n, SUM(duration_sec) AS total,
              SUM(CASE WHEN duration_sec IS NULL THEN 1 ELSE 0 END) AS unknown
       FROM tracks WHERE item_id = ? AND missing = 0`,
    )
    .get(row.id) as { n: number; total: number | null; unknown: number };
  const cover = db
    .prepare(`SELECT id FROM assets WHERE item_id = ? AND kind = 'cover' AND missing = 0 LIMIT 1`)
    .get(row.id) as { id: string } | undefined;
  const docCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM assets WHERE item_id = ? AND kind = 'document' AND missing = 0`,
      )
      .get(row.id) as { n: number }
  ).n;
  const formats = (
    db
      .prepare(`SELECT DISTINCT ext FROM tracks WHERE item_id = ? AND missing = 0 ORDER BY ext`)
      .all(row.id) as { ext: string }[]
  ).map((r) => r.ext);
  const manual = db.prepare('SELECT type FROM item_types WHERE item_id = ?').get(row.id) as
    { type: string } | undefined;
  const type = asType(manual?.type ?? row.inferred_type);
  const completedCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM track_completions c JOIN tracks t ON t.id = c.track_id
         WHERE c.user_id = ? AND c.item_id = ? AND t.missing = 0`,
      )
      .get(userId, row.id) as { n: number }
  ).n;
  return {
    id: row.id,
    title: row.title,
    creator: row.creator,
    collection: row.collection,
    rootId: row.root_id,
    rootLabel: rootLabel(config, row.root_id),
    trackCount: tracks.n,
    totalDurationSec: tracks.n > 0 && tracks.unknown === 0 ? (tracks.total ?? null) : null,
    coverId: cover?.id ?? null,
    documentCount: docCount,
    formats,
    missing: row.missing === 1,
    addedAt: row.added_at,
    type,
    typeSource: manual ? 'manual' : 'auto',
    hasVideo: formats.some(isVideoExt),
    completedCount,
    resumeSec: resumePoint(db, userId, row.id, isPracticeType(type))?.positionSec ?? null,
    ...practiceCount(
      db,
      userId,
      row.id,
      tracks.n > 0 && tracks.unknown === 0 ? tracks.total : null,
    ),
  };
}

/**
 * Times this account has done an item: sessions that covered at least half of
 * its length - or, when the length is unknown, completed after a minute. A
 * sit abandoned in the first minutes is not a time.
 */
function practiceCount(
  db: Db,
  userId: number,
  itemId: string,
  totalSec: number | null,
): { practiceCount: number; lastPracticedAt: string | null } {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n, MAX(COALESCE(ended_at, last_beat_at, started_at)) AS last
       FROM practice_sessions
       WHERE user_id = ? AND item_id = ? AND status != 'active'
         AND (CASE WHEN ? IS NOT NULL THEN listened_sec >= ? * 0.5
                   ELSE status = 'completed' AND listened_sec >= 60 END)`,
    )
    .get(userId, itemId, totalSec, totalSec ?? 0) as { n: number; last: string | null };
  return { practiceCount: row.n, lastPracticedAt: row.last };
}

function asType(t: string): ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(t) ? (t as ContentType) : 'meditation';
}

export function libraryDto(db: Db, config: Config, userId: number): LibraryDto {
  const rows = db
    .prepare('SELECT * FROM items WHERE excluded = 0 ORDER BY creator, title')
    .all() as unknown as ItemRow[];
  const items = rows.map((r) => summarize(db, config, r, userId));
  items.sort((a, b) => naturalCompare(a.creator, b.creator) || naturalCompare(a.title, b.title));

  const creators = new Map<string, CreatorDto>();
  for (const item of items) {
    if (item.missing) continue;
    const cur = creators.get(item.creator) ?? {
      name: item.creator,
      itemCount: 0,
      totalDurationSec: 0,
      coverIds: [],
    };
    cur.itemCount++;
    if (cur.totalDurationSec !== null && item.totalDurationSec !== null) {
      cur.totalDurationSec += item.totalDurationSec;
    } else {
      cur.totalDurationSec = null;
    }
    if (item.coverId && cur.coverIds.length < 4) cur.coverIds.push(item.coverId);
    creators.set(item.creator, cur);
  }

  return {
    items,
    creators: [...creators.values()].sort((a, b) => naturalCompare(a.name, b.name)),
    scan: readScanState(db),
  };
}

export function itemDetail(
  db: Db,
  config: Config,
  itemId: string,
  userId: number,
): MeditationDetailDto | null {
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId) as ItemRow | undefined;
  if (!row) return null;
  const summary = summarize(db, config, row, userId);
  const done = new Set(
    (
      db
        .prepare('SELECT track_id FROM track_completions WHERE user_id = ? AND item_id = ?')
        .all(userId, itemId) as { track_id: string }[]
    ).map((r) => r.track_id),
  );
  const positions = new Map(
    (
      db
        .prepare(
          'SELECT track_id, position_sec FROM playback_positions WHERE user_id = ? AND item_id = ? AND updated_at >= ?',
        )
        .all(userId, itemId, isPracticeType(summary.type) ? freshSince() : '') as {
        track_id: string;
        position_sec: number;
      }[]
    ).map((r) => [r.track_id, r.position_sec]),
  );
  const tracks = (
    db
      .prepare(
        `SELECT t.id, t.ord, t.title, t.name, t.ext, t.duration_sec, t.missing, t.inferred_role,
                r.role AS manual_role
         FROM tracks t LEFT JOIN track_roles r ON r.track_id = t.id
         WHERE t.item_id = ? ORDER BY t.ord`,
      )
      .all(itemId) as {
      id: string;
      ord: number;
      title: string;
      name: string;
      ext: string;
      duration_sec: number | null;
      missing: number;
      inferred_role: string;
      manual_role: string | null;
    }[]
  ).map((t) => ({
    id: t.id,
    ord: t.ord,
    title: t.title,
    fileName: t.name,
    ext: t.ext,
    durationSec: t.duration_sec,
    missing: t.missing === 1,
    video: isVideoExt(t.ext),
    completed: done.has(t.id),
    // A meditation item's tracks are all practice; a course's are what the
    // owner said, else the scanner's guess.
    role:
      summary.type === 'meditation' || summary.type === 'soundscape'
        ? ('practice' as const)
        : (t.manual_role ?? t.inferred_role) === 'practice'
          ? ('practice' as const)
          : ('lesson' as const),
    roleSource: t.manual_role ? ('manual' as const) : ('auto' as const),
    positionSec:
      !done.has(t.id) && worthResuming(positions.get(t.id) ?? 0, t.duration_sec)
        ? (positions.get(t.id) ?? null)
        : null,
  }));
  const documents = (
    db
      .prepare(
        `SELECT id, name, ext, size_bytes, missing FROM assets
         WHERE item_id = ? AND kind = 'document' ORDER BY name`,
      )
      .all(itemId) as {
      id: string;
      name: string;
      ext: string;
      size_bytes: number;
      missing: number;
    }[]
  ).map((d) => ({
    id: d.id,
    name: d.name,
    kind: documentKind(d.ext),
    sizeBytes: d.size_bytes,
    missing: d.missing === 1,
  }));

  const relatedRows = db
    .prepare(
      `SELECT * FROM items WHERE creator = ? AND id != ? AND missing = 0 ORDER BY title LIMIT 8`,
    )
    .all(row.creator, itemId) as unknown as ItemRow[];

  const resume: ResumeStateDto | null = resumePoint(
    db,
    userId,
    itemId,
    isPracticeType(summary.type),
  );

  return {
    ...summary,
    breadcrumbs: JSON.parse(row.breadcrumbs),
    tracks,
    documents,
    evidence: [
      ...JSON.parse(row.evidence),
      ...(row.type_reason
        ? [
            {
              field: 'type' as const,
              value: row.inferred_type,
              rule: 'content-type',
              evidence: row.type_reason,
            },
          ]
        : []),
    ],
    related: relatedRows.map((r) => summarize(db, config, r, userId)),
    resume,
  };
}
