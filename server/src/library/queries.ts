import type {
  CreatorDto,
  LibraryDto,
  MeditationDetailDto,
  MeditationSummaryDto,
  ResumeStateDto,
} from '@zenport/shared';
import { naturalCompare } from '@zenport/shared';
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
}

function rootLabel(config: Config, rootId: number): string {
  return config.libraryRoots.find((r) => r.id === rootId)?.label ?? `Library ${rootId + 1}`;
}

function summarize(db: Db, config: Config, row: ItemRow): MeditationSummaryDto {
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
  };
}

export function libraryDto(db: Db, config: Config): LibraryDto {
  const rows = db
    .prepare('SELECT * FROM items ORDER BY creator, title')
    .all() as unknown as ItemRow[];
  const items = rows.map((r) => summarize(db, config, r));
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
  const summary = summarize(db, config, row);
  const tracks = (
    db
      .prepare(
        `SELECT id, ord, title, name, ext, duration_sec, missing FROM tracks
         WHERE item_id = ? ORDER BY ord`,
      )
      .all(itemId) as {
      id: string;
      ord: number;
      title: string;
      name: string;
      ext: string;
      duration_sec: number | null;
      missing: number;
    }[]
  ).map((t) => ({
    id: t.id,
    ord: t.ord,
    title: t.title,
    fileName: t.name,
    ext: t.ext,
    durationSec: t.duration_sec,
    missing: t.missing === 1,
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

  const resumeRow = db
    .prepare(
      `SELECT track_id, position_sec, updated_at FROM playback_positions
       WHERE user_id = ? AND item_id = ? ORDER BY updated_at DESC LIMIT 1`,
    )
    .get(userId, itemId) as
    { track_id: string; position_sec: number; updated_at: string } | undefined;
  const resume: ResumeStateDto | null = resumeRow
    ? {
        trackId: resumeRow.track_id,
        positionSec: resumeRow.position_sec,
        updatedAt: resumeRow.updated_at,
      }
    : null;

  return {
    ...summary,
    breadcrumbs: JSON.parse(row.breadcrumbs),
    tracks,
    documents,
    evidence: JSON.parse(row.evidence),
    related: relatedRows.map((r) => summarize(db, config, r)),
    resume,
  };
}
