import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FolderNodeDto, ScanStateDto } from '@zenport/shared';
import type { Db } from '../db/index.js';
import { inferLibrary, type InferredTrack } from '../library/infer.js';
import { extractEmbeddedArt } from './artwork.js';
import { safeWalk, type WalkedFile } from './walk.js';

export interface ScanRoot {
  id: number;
  path: string;
  label: string;
}

export interface ScanOptions {
  /**
   * Where covers read out of the audio files' own tags are cached. Assets
   * under here carry EMBEDDED_ROOT_ID rather than a library root, and the
   * media route resolves them inside this directory. Omitted in tests that
   * do not care about artwork.
   */
  coverCacheDir?: string;
}

/** Pseudo-root for covers extracted from the files themselves. */
export const EMBEDDED_ROOT_ID = -1;

const COVER_EXTS = ['jpg', 'png', 'webp', 'gif'] as const;

/** Is `rel` the excluded folder itself or anything beneath it? */
export function underAny(rel: string, prefixes: string[]): boolean {
  return prefixes.some((p) => rel === p || rel.startsWith(p + '/'));
}

export function loadExclusions(db: Db, rootId: number): string[] {
  return (
    db.prepare('SELECT rel_path FROM excluded_folders WHERE root_id = ?').all(rootId) as {
      rel_path: string;
    }[]
  ).map((r) => r.rel_path);
}

/**
 * The folder tree of one root as the walk saw it, excluded folders included -
 * the folders screen has to show what was left out so it can be put back.
 */
export function buildFolderTree(
  files: WalkedFile[],
  label: string,
  excluded: string[],
): FolderNodeDto {
  const root: FolderNodeDto = {
    name: label,
    relPath: '',
    audioFiles: 0,
    excluded: false,
    children: [],
  };
  const byPath = new Map<string, FolderNodeDto>([['', root]]);
  const dirOf = (rel: string): FolderNodeDto => {
    const hit = byPath.get(rel);
    if (hit) return hit;
    const cut = rel.lastIndexOf('/');
    const parent = dirOf(cut < 0 ? '' : rel.slice(0, cut));
    const node: FolderNodeDto = {
      name: rel.slice(cut + 1),
      relPath: rel,
      audioFiles: 0,
      excluded: excluded.includes(rel),
      children: [],
    };
    parent.children.push(node);
    byPath.set(rel, node);
    return node;
  };
  for (const f of files) {
    const cut = f.relPath.lastIndexOf('/');
    let node: FolderNodeDto | undefined = dirOf(cut < 0 ? '' : f.relPath.slice(0, cut));
    if (f.kind !== 'audio') continue;
    // Count the file in its folder and every ancestor.
    for (let rel = node.relPath; ;) {
      node = byPath.get(rel);
      if (node) node.audioFiles++;
      if (rel === '') break;
      const c = rel.lastIndexOf('/');
      rel = c < 0 ? '' : rel.slice(0, c);
    }
  }
  return root;
}

/** Folder trees from the most recent scan, per root id. Rebuilt on every scan. */
const folderTrees = new Map<number, FolderNodeDto>();
export function lastFolderTree(rootId: number): FolderNodeDto | null {
  return folderTrees.get(rootId) ?? null;
}

/**
 * A cover for an item with no image file beside it, read out of its audio
 * (ID3 APIC / FLAC PICTURE) and cached once. The cache is checked first so
 * the hourly rescan costs one stat per item, not one tag parse.
 */
async function embeddedCover(
  cacheDir: string,
  itemId: string,
  rootPath: string,
  tracks: InferredTrack[],
): Promise<{ relPath: string; ext: string; size: number } | null> {
  for (const ext of COVER_EXTS) {
    const file = path.join(cacheDir, `${itemId}.${ext}`);
    try {
      await access(file);
      return { relPath: `${itemId}.${ext}`, ext, size: 0 };
    } catch {
      /* not cached under this extension */
    }
  }
  // The first few tracks are enough: an album's art is on every track or on none.
  for (const track of tracks.slice(0, 3)) {
    const art = await extractEmbeddedArt(path.join(rootPath, track.relPath), track.ext);
    if (!art) continue;
    await mkdir(cacheDir, { recursive: true });
    const rel = `${itemId}.${art.ext}`;
    await writeFile(path.join(cacheDir, rel), art.data);
    return { relPath: rel, ext: art.ext, size: art.data.length };
  }
  return null;
}

const sid = (input: string) => createHash('sha1').update(input).digest('hex').slice(0, 20);
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * Scan every configured root, infer the library, and persist it idempotently.
 * Item/track/asset identities are stable hashes of (rootId, source-relative
 * path); files that vanish are marked missing rather than deleted, so user
 * history, plans, and journals always survive a library hiccup.
 */
export async function runScan(
  db: Db,
  roots: ScanRoot[],
  opts: ScanOptions = {},
): Promise<ScanStateDto> {
  const startedAt = nowIso();
  db.prepare(`UPDATE scan_state SET status = 'scanning', started_at = ? WHERE id = 1`).run(
    startedAt,
  );

  const warnings: string[] = [];
  let ignored = 0;
  const rootResults: { id: number; label: string; ok: boolean; note: string | null }[] = [];
  const seenItems = new Set<string>();
  const seenTracks = new Set<string>();
  const seenAssets = new Set<string>();
  const excludedByRoot = new Map<number, string[]>();

  for (const root of roots) {
    const walk = await safeWalk(root.path);
    if (!walk.ok) {
      rootResults.push({
        id: root.id,
        label: root.label,
        ok: false,
        note: 'not readable - check the mount and permissions',
      });
      continue;
    }
    rootResults.push({ id: root.id, label: root.label, ok: true, note: null });
    ignored += walk.ignored;
    for (const w of walk.warnings) warnings.push(`${root.label}: ${w}`);

    const exclusions = loadExclusions(db, root.id);
    excludedByRoot.set(root.id, exclusions);
    folderTrees.set(root.id, buildFolderTree(walk.files, root.label, exclusions));
    const items = inferLibrary(walk.files.filter((f) => !underAny(f.relPath, exclusions)));

    const embedded = new Map<string, { relPath: string; ext: string; size: number }>();
    if (opts.coverCacheDir) {
      for (const item of items) {
        if (item.coverRelPath) continue;
        const itemId = sid(`item:${root.id}:${item.itemKey}`);
        const cover = await embeddedCover(opts.coverCacheDir, itemId, root.path, item.tracks);
        if (cover) embedded.set(itemId, cover);
      }
    }

    db.exec('BEGIN');
    try {
      const upsertItem = db.prepare(
        `INSERT INTO items (id, root_id, item_key, kind, title, creator, collection, breadcrumbs, evidence, missing, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(root_id, item_key) DO UPDATE SET
           kind = excluded.kind, title = excluded.title, creator = excluded.creator,
           collection = excluded.collection, breadcrumbs = excluded.breadcrumbs,
           evidence = excluded.evidence, missing = 0, excluded = 0`,
      );
      const upsertTrack = db.prepare(
        `INSERT INTO tracks (id, item_id, root_id, rel_path, name, ext, ord, title, size_bytes, missing)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(root_id, rel_path) DO UPDATE SET
           item_id = excluded.item_id, ord = excluded.ord, title = excluded.title,
           size_bytes = excluded.size_bytes, missing = 0`,
      );
      const upsertAsset = db.prepare(
        `INSERT INTO assets (id, item_id, root_id, rel_path, name, ext, kind, size_bytes, missing)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(item_id, rel_path) DO UPDATE SET
           kind = excluded.kind, size_bytes = excluded.size_bytes, missing = 0`,
      );

      for (const item of items) {
        const itemId = sid(`item:${root.id}:${item.itemKey}`);
        seenItems.add(itemId);
        upsertItem.run(
          itemId,
          root.id,
          item.itemKey,
          item.kind,
          item.title,
          item.creator,
          item.collection,
          JSON.stringify(item.breadcrumbs),
          JSON.stringify(item.decisions),
          nowIso(),
        );
        for (const track of item.tracks) {
          const trackId = sid(`track:${root.id}:${track.relPath}`);
          seenTracks.add(trackId);
          upsertTrack.run(
            trackId,
            itemId,
            root.id,
            track.relPath,
            track.name,
            track.ext,
            track.ord,
            track.title,
            track.sizeBytes,
          );
        }
        if (item.coverRelPath) {
          const name = item.coverRelPath.split('/').at(-1) as string;
          const ext = name.split('.').at(-1)?.toLowerCase() ?? '';
          const assetId = sid(`asset:${root.id}:${itemId}:${item.coverRelPath}`);
          seenAssets.add(assetId);
          upsertAsset.run(assetId, itemId, root.id, item.coverRelPath, name, ext, 'cover', 0);
        } else {
          const cover = embedded.get(itemId);
          if (cover) {
            const assetId = sid(`asset:embedded:${itemId}`);
            seenAssets.add(assetId);
            upsertAsset.run(
              assetId,
              itemId,
              EMBEDDED_ROOT_ID,
              cover.relPath,
              `cover.${cover.ext}`,
              cover.ext,
              'cover',
              cover.size,
            );
          }
        }
        for (const doc of item.documents) {
          const assetId = sid(`asset:${root.id}:${itemId}:${doc.relPath}`);
          seenAssets.add(assetId);
          upsertAsset.run(
            assetId,
            itemId,
            root.id,
            doc.relPath,
            doc.name,
            doc.ext,
            'document',
            doc.sizeBytes,
          );
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  // Mark anything not seen in this pass as missing — only for roots that
  // scanned cleanly, so a temporarily unreadable mount never masks a library.
  const okRootIds = rootResults.filter((r) => r.ok).map((r) => r.id);
  db.exec('BEGIN');
  try {
    for (const rootId of okRootIds) {
      const exclusions = excludedByRoot.get(rootId) ?? [];
      for (const row of db
        .prepare('SELECT id, item_key FROM items WHERE root_id = ?')
        .all(rootId) as { id: string; item_key: string }[]) {
        if (!seenItems.has(row.id)) {
          // Left out on purpose, or genuinely gone - the shelves hide both,
          // but only the second is worth a notice.
          db.prepare('UPDATE items SET missing = 1, excluded = ? WHERE id = ?').run(
            underAny(row.item_key, exclusions) ? 1 : 0,
            row.id,
          );
        }
      }
      for (const row of db.prepare('SELECT id FROM tracks WHERE root_id = ?').all(rootId) as {
        id: string;
      }[]) {
        if (!seenTracks.has(row.id)) {
          db.prepare('UPDATE tracks SET missing = 1 WHERE id = ?').run(row.id);
        }
      }
      for (const row of db.prepare('SELECT id FROM assets WHERE root_id = ?').all(rootId) as {
        id: string;
      }[]) {
        if (!seenAssets.has(row.id)) {
          db.prepare('UPDATE assets SET missing = 1 WHERE id = ?').run(row.id);
        }
      }
      // Cached covers follow their item's root, not their own pseudo-root.
      for (const row of db
        .prepare(
          'SELECT a.id FROM assets a JOIN items i ON i.id = a.item_id WHERE a.root_id = ? AND i.root_id = ?',
        )
        .all(EMBEDDED_ROOT_ID, rootId) as { id: string }[]) {
        if (!seenAssets.has(row.id)) {
          db.prepare('UPDATE assets SET missing = 1 WHERE id = ?').run(row.id);
        }
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const finishedAt = nowIso();
  db.prepare(
    `UPDATE scan_state SET status = 'idle', finished_at = ?, warnings = ?, ignored = ?, roots = ? WHERE id = 1`,
  ).run(finishedAt, JSON.stringify(warnings), ignored, JSON.stringify(rootResults));

  return readScanState(db);
}

export function readScanState(db: Db): ScanStateDto {
  const row = db.prepare('SELECT * FROM scan_state WHERE id = 1').get() as {
    status: string;
    started_at: string | null;
    finished_at: string | null;
    warnings: string;
    ignored: number;
    roots: string;
  };
  const counts = db
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM items WHERE missing = 0) AS items,
        (SELECT COUNT(*) FROM tracks WHERE missing = 0) AS tracks,
        (SELECT COUNT(*) FROM assets WHERE kind = 'cover' AND missing = 0) AS covers,
        (SELECT COUNT(*) FROM assets WHERE kind = 'document' AND missing = 0) AS documents,
        (SELECT COUNT(*) FROM items WHERE missing = 1 AND excluded = 0) AS missing,
        (SELECT COUNT(*) FROM items WHERE excluded = 1) AS excluded`,
    )
    .get() as {
    items: number;
    tracks: number;
    covers: number;
    documents: number;
    missing: number;
    excluded: number;
  };
  return {
    status: row.status as 'idle' | 'scanning',
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    roots: JSON.parse(row.roots),
    counts: { ...counts, ignored: row.ignored },
    warnings: JSON.parse(row.warnings),
  };
}
