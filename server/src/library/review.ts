/**
 * Library review: the owner's view of how every recording was read, and the
 * corrections they make to it.
 *
 * Corrections are kept apart from what the scanner reads - titles, creators
 * and series in item_edits, part names in track_edits, types in item_types,
 * roles in track_roles, order in track_order, hiding in excluded_folders -
 * all keyed by ids that follow files when they move. The scanner rewrites
 * its own reading on every scan and lays the corrections back over it
 * (applyEdits), so nothing the owner fixed is ever undone.
 */
import type {
  ContentType,
  ReviewDetailDto,
  ReviewEdit,
  ReviewFlag,
  ReviewItemDto,
  ReviewListDto,
  ReviewSaveDto,
} from '@zenport/shared';
import { isVideoExt, naturalCompare } from '@zenport/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { applyEdits, loadExclusions, underAny } from '../scanner/scan.js';
import { asType, summarize, TRACK_ORDER_BY, TRACK_ORDER_JOIN, type ItemRow } from './queries.js';

const UNKNOWN_CREATOR = 'Unknown creator';

export { looksRaw, tidyTitles } from './setNames.js';
import { looksRaw, tidyTitles } from './setNames.js';

const baseline = (db: Db) =>
  (
    db.prepare("SELECT value FROM app_settings WHERE key = 'library_baseline'").get() as
      { value: string } | undefined
  )?.value ?? '';

function hiddenIds(db: Db, config: Config): Set<string> {
  const out = new Set<string>();
  for (const root of config.libraryRoots) {
    const ex = loadExclusions(db, root.id);
    if (ex.length === 0) continue;
    const rows = db
      .prepare(
        `SELECT i.id, i.item_key FROM items i
         WHERE i.root_id = ? AND i.excluded = 1
           AND EXISTS (SELECT 1 FROM tracks t WHERE t.item_id = i.id)`,
      )
      .all(root.id) as { id: string; item_key: string }[];
    for (const r of rows) if (underAny(r.item_key, ex)) out.add(r.id);
  }
  return out;
}

function editsOf(db: Db, itemId: string): ReviewEdit[] {
  const e = db
    .prepare('SELECT title, creator, collection_set FROM item_edits WHERE item_id = ?')
    .get(itemId) as
    { title: string | null; creator: string | null; collection_set: number } | undefined;
  const has = (sql: string) => !!db.prepare(sql).get(itemId);
  const out: ReviewEdit[] = [];
  if (e?.title) out.push('title');
  if (e?.creator) out.push('creator');
  if (e?.collection_set) out.push('series');
  if (has('SELECT 1 FROM item_types WHERE item_id = ?')) out.push('type');
  if (has('SELECT 1 FROM track_order WHERE item_id = ? LIMIT 1')) out.push('order');
  if (
    has(
      'SELECT 1 FROM track_edits e JOIN tracks t ON t.id = e.track_id WHERE t.item_id = ? LIMIT 1',
    )
  )
    out.push('names');
  if (
    has(
      'SELECT 1 FROM track_roles r JOIN tracks t ON t.id = r.track_id WHERE t.item_id = ? LIMIT 1',
    )
  )
    out.push('roles');
  return out;
}

export function reviewList(db: Db, config: Config, userId: number): ReviewListDto {
  const roots = config.libraryRoots.map((r) => r.id);
  if (roots.length === 0) {
    return { items: [], creators: [], series: [], lastScan: { finishedAt: null, newItems: 0 } };
  }
  const hidden = hiddenIds(db, config);
  const since = baseline(db);
  const rows = db
    .prepare(`SELECT * FROM items WHERE root_id IN (${roots.map(() => '?').join(', ')})`)
    .all(...roots) as unknown as ItemRow[];
  const reviewed = new Map(
    (
      db.prepare('SELECT item_id, reviewed_at FROM item_reviews').all() as {
        item_id: string;
        reviewed_at: string;
      }[]
    ).map((r) => [r.item_id, r.reviewed_at]),
  );
  const trackTitles = db.prepare('SELECT title, ext FROM tracks WHERE item_id = ? AND missing = 0');
  const items: ReviewItemDto[] = [];
  for (const row of rows) {
    const isHidden = hidden.has(row.id);
    if (row.missing === 1 && !isHidden) continue;
    const s = summarize(db, config, row, userId);
    const parts = trackTitles.all(row.id) as { title: string; ext: string }[];
    const edited = editsOf(db, row.id);
    const flags: ReviewFlag[] = [];
    if (row.creator === UNKNOWN_CREATOR) flags.push('unknown-creator');
    if (looksRaw(row.title) || parts.some((p) => looksRaw(p.title))) flags.push('raw-names');
    const video = parts.some((p) => isVideoExt(p.ext));
    if (video && parts.some((p) => !isVideoExt(p.ext)) && !edited.includes('order')) {
      flags.push('mixed-media');
    }
    const reviewedAt = reviewed.get(row.id) ?? null;
    items.push({
      ...s,
      hidden: isHidden,
      isNew: !reviewedAt && !!since && row.added_at >= since,
      reviewedAt,
      edited,
      flags,
    });
  }
  items.sort(
    (a, b) =>
      naturalCompare(a.creator, b.creator) ||
      naturalCompare(a.collection ?? '', b.collection ?? '') ||
      naturalCompare(a.title, b.title),
  );
  const live = items.filter((i) => !i.hidden);
  const series = new Map<string, { creator: string; collection: string }>();
  for (const i of live) {
    if (i.collection)
      series.set(`${i.creator}\u0000${i.collection}`, {
        creator: i.creator,
        collection: i.collection,
      });
  }
  const scan = db.prepare('SELECT finished_at, new_items FROM scan_state WHERE id = 1').get() as {
    finished_at: string | null;
    new_items: number;
  };
  return {
    items,
    creators: [...new Set(live.map((i) => i.creator))].sort(naturalCompare),
    series: [...series.values()],
    lastScan: { finishedAt: scan.finished_at, newItems: scan.new_items },
  };
}

export function reviewDetail(db: Db, config: Config, id: string): ReviewDetailDto | null {
  const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as
    | (ItemRow & {
        inferred_title: string | null;
        inferred_creator: string | null;
        inferred_collection: string | null;
      })
    | undefined;
  if (!row) return null;
  const manual = db.prepare('SELECT type FROM item_types WHERE item_id = ?').get(id) as
    { type: string } | undefined;
  const tracks = db
    .prepare(
      `SELECT t.id, t.title, t.inferred_title, t.ext, t.duration_sec, t.missing, t.inferred_role,
              r.role AS manual_role
       FROM tracks t LEFT JOIN track_roles r ON r.track_id = t.id
       ${TRACK_ORDER_JOIN}
       WHERE t.item_id = ? ORDER BY ${TRACK_ORDER_BY}`,
    )
    .all(id) as {
    id: string;
    title: string;
    inferred_title: string | null;
    ext: string;
    duration_sec: number | null;
    missing: number;
    inferred_role: string;
    manual_role: string | null;
  }[];
  const live = tracks.filter((t) => t.missing === 0);
  const suggestions = tidyTitles(live.map((t) => t.inferred_title ?? t.title));
  const cover = db
    .prepare(`SELECT id FROM assets WHERE item_id = ? AND kind = 'cover' AND missing = 0 LIMIT 1`)
    .get(id) as { id: string } | undefined;
  const seriesSize = row.collection
    ? (
        db
          .prepare(
            'SELECT COUNT(*) AS n FROM items WHERE creator = ? AND collection = ? AND missing = 0',
          )
          .get(row.creator, row.collection) as { n: number }
      ).n
    : 0;
  const scannedType = asType(row.inferred_type);
  return {
    id,
    title: row.title,
    creator: row.creator,
    collection: row.collection,
    type: asType(manual?.type ?? row.inferred_type),
    coverId: cover?.id ?? null,
    hidden: hiddenIds(db, config).has(id),
    hasVideo: live.some((t) => isVideoExt(t.ext)),
    rootLabel: config.libraryRoots.find((r) => r.id === row.root_id)?.label ?? 'Library',
    path: row.item_key.split('/'),
    scanned: {
      title: row.inferred_title ?? row.title,
      creator: row.inferred_creator ?? row.creator,
      collection: row.inferred_collection ?? null,
      type: scannedType,
    },
    customOrder: !!db.prepare('SELECT 1 FROM track_order WHERE item_id = ? LIMIT 1').get(id),
    scannedOrder: (
      db
        .prepare('SELECT id FROM tracks WHERE item_id = ? AND missing = 0 ORDER BY ord')
        .all(id) as {
        id: string;
      }[]
    ).map((r) => r.id),
    seriesSize,
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
    tracks: live.map((t, i) => ({
      id: t.id,
      title: t.title,
      scannedTitle: t.inferred_title ?? t.title,
      suggestion: suggestions[i] ?? null,
      video: isVideoExt(t.ext),
      ext: t.ext,
      durationSec: t.duration_sec,
      role: (t.manual_role ?? t.inferred_role) === 'practice' ? 'practice' : 'lesson',
      scannedRole: t.inferred_role === 'practice' ? 'practice' : 'lesson',
      missing: false,
    })),
  };
}

export class ReviewError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/**
 * Save the owner's corrections to one item, all at once. A value equal to
 * what the scanner read clears the correction rather than storing it, so an
 * item only counts as corrected where it actually differs. Saving marks the
 * item reviewed. Returns whether hiding changed (which needs a rescan).
 */
export function saveReview(
  db: Db,
  config: Config,
  id: string,
  body: ReviewSaveDto,
): { rescan: boolean } {
  const row = db
    .prepare(
      'SELECT id, root_id, item_key, creator, collection, inferred_title, inferred_creator, inferred_collection, inferred_type FROM items WHERE id = ?',
    )
    .get(id) as
    | {
        id: string;
        root_id: number;
        item_key: string;
        creator: string;
        collection: string | null;
        inferred_title: string | null;
        inferred_creator: string | null;
        inferred_collection: string | null;
        inferred_type: string;
      }
    | undefined;
  if (!row) throw new ReviewError('meditation not found', 404);
  const now = new Date().toISOString();
  const clean = (s: string | undefined) =>
    s === undefined ? undefined : s.replace(/\s+/g, ' ').trim();

  // The items this change reaches: creator, series and type may go to the
  // whole series; everything else is this item's own.
  const siblings =
    body.scope === 'series' && row.collection
      ? (
          db
            .prepare('SELECT id FROM items WHERE root_id = ? AND creator = ? AND collection = ?')
            .all(row.root_id, row.creator, row.collection) as { id: string }[]
        ).map((r) => r.id)
      : [id];

  let rescan = false;
  db.exec('BEGIN');
  try {
    const edit = db.prepare(
      `INSERT INTO item_edits (item_id, updated_at) VALUES (?, ?) ON CONFLICT(item_id) DO NOTHING`,
    );
    const scannedOf = db.prepare(
      'SELECT inferred_title, inferred_creator, inferred_collection, inferred_type FROM items WHERE id = ?',
    );
    const title = clean(body.title);
    if (title !== undefined) {
      edit.run(id, now);
      db.prepare('UPDATE item_edits SET title = ?, updated_at = ? WHERE item_id = ?').run(
        title && title !== row.inferred_title ? title : null,
        now,
        id,
      );
    }
    const creator = clean(body.creator);
    const series = clean(body.series);
    const type = body.type;
    for (const target of siblings) {
      const scanned = scannedOf.get(target) as {
        inferred_title: string | null;
        inferred_creator: string | null;
        inferred_collection: string | null;
        inferred_type: string;
      };
      if (creator !== undefined) {
        edit.run(target, now);
        db.prepare('UPDATE item_edits SET creator = ?, updated_at = ? WHERE item_id = ?').run(
          creator && creator !== scanned.inferred_creator ? creator : null,
          now,
          target,
        );
      }
      if (series !== undefined) {
        edit.run(target, now);
        const value = series || null;
        const same = value === (scanned.inferred_collection ?? null);
        db.prepare(
          'UPDATE item_edits SET collection = ?, collection_set = ?, updated_at = ? WHERE item_id = ?',
        ).run(same ? null : value, same ? 0 : 1, now, target);
      }
      if (type !== undefined) {
        if (type === (scanned.inferred_type as ContentType)) {
          db.prepare('DELETE FROM item_types WHERE item_id = ?').run(target);
        } else {
          db.prepare(
            `INSERT INTO item_types (item_id, type, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(item_id) DO UPDATE SET type = excluded.type, updated_at = excluded.updated_at`,
          ).run(target, type, now);
        }
      }
    }
    // Nothing left corrected: no row at all.
    db.exec(
      'DELETE FROM item_edits WHERE title IS NULL AND creator IS NULL AND collection_set = 0',
    );

    if (body.tracks) {
      const own = db.prepare(
        'SELECT id, inferred_title, title, inferred_role FROM tracks WHERE id = ? AND item_id = ?',
      );
      for (const t of body.tracks) {
        const tr = own.get(t.id, id) as
          | { id: string; inferred_title: string | null; title: string; inferred_role: string }
          | undefined;
        if (!tr) throw new ReviewError('a part does not belong to this item');
        const name = clean(t.title);
        if (name !== undefined) {
          if (!name || name === (tr.inferred_title ?? tr.title)) {
            db.prepare('DELETE FROM track_edits WHERE track_id = ?').run(t.id);
          } else {
            db.prepare(
              `INSERT INTO track_edits (track_id, title, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(track_id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at`,
            ).run(t.id, name, now);
          }
        }
        if (t.role !== undefined) {
          if (t.role === tr.inferred_role) {
            db.prepare('DELETE FROM track_roles WHERE track_id = ?').run(t.id);
          } else {
            db.prepare(
              `INSERT INTO track_roles (track_id, role, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(track_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at`,
            ).run(t.id, t.role, now);
          }
        }
      }
    }

    if (body.order !== undefined) {
      db.prepare('DELETE FROM track_order WHERE item_id = ?').run(id);
      if (body.order) {
        const auto = (
          db.prepare('SELECT id FROM tracks WHERE item_id = ? ORDER BY ord').all(id) as {
            id: string;
          }[]
        ).map((r) => r.id);
        const own = new Set(auto);
        if (new Set(body.order).size !== body.order.length || body.order.some((t) => !own.has(t))) {
          throw new ReviewError('every id must be a part of this item, once');
        }
        const isAuto =
          body.order.length === auto.length && body.order.every((t, i) => t === auto[i]);
        if (!isAuto) {
          const put = db.prepare(
            'INSERT INTO track_order (track_id, item_id, pos, updated_at) VALUES (?, ?, ?, ?)',
          );
          body.order.forEach((t, i) => put.run(t, id, i + 1, now));
        }
      }
    }

    if (body.hidden !== undefined && config.libraryRoots.some((r) => r.id === row.root_id)) {
      const isHidden = underAny(row.item_key, loadExclusions(db, row.root_id));
      if (body.hidden && !isHidden) {
        db.prepare(
          'INSERT INTO excluded_folders (root_id, rel_path) VALUES (?, ?) ON CONFLICT DO NOTHING',
        ).run(row.root_id, row.item_key);
        rescan = true;
      } else if (!body.hidden && isHidden) {
        db.prepare('DELETE FROM excluded_folders WHERE root_id = ? AND rel_path = ?').run(
          row.root_id,
          row.item_key,
        );
        rescan = true;
      }
    }

    // Back to the scanner's reading, then the corrections over it.
    for (const target of siblings) {
      db.prepare(
        `UPDATE items SET title = COALESCE(inferred_title, title), creator = COALESCE(inferred_creator, creator),
           collection = inferred_collection WHERE id = ?`,
      ).run(target);
      db.prepare('UPDATE tracks SET title = COALESCE(inferred_title, title) WHERE item_id = ?').run(
        target,
      );
      applyEdits(db, target);
    }
    markReviewed(db, [id], now);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { rescan };
}

export function markReviewed(db: Db, ids: string[], at = new Date().toISOString()): void {
  const put = db.prepare(
    `INSERT INTO item_reviews (item_id, reviewed_at) VALUES (?, ?)
     ON CONFLICT(item_id) DO UPDATE SET reviewed_at = excluded.reviewed_at`,
  );
  for (const id of ids) put.run(id, at);
}
