import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FolderNodeDto, ScanProgressDto, ScanStateDto } from '@zenport/shared';
import type { Db } from '../db/index.js';
import { inferLibrary, looseDocuments, type InferredTrack } from '../library/infer.js';
import { inferContentType, inferTrackRole } from '../library/contentType.js';
import { extractEmbeddedArt } from './artwork.js';
import { fingerprintFile, inPool } from './fingerprint.js';
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
  /** Told how far the scan has got, as it goes (for a live progress view). */
  onProgress?: (p: ScanProgressDto) => void;
  /**
   * After the index was cleared to read the library afresh: the ids things
   * had, by "rootId:path", so what is still there keeps its id - and with it
   * the history, plans and journal that point at it.
   */
  idHints?: { items: Map<string, string>; tracks: Map<string, string> };
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

interface TrackRow {
  id: string;
  item_id: string;
  root_id: number;
  rel_path: string;
  name: string;
  size_bytes: number;
  fingerprint: string | null;
  fp_stamp: string | null;
}

const at = (rootId: number, rel: string) => `${rootId}\u0000${rel}`;

/**
 * Scan every configured root, infer the library, and persist it idempotently.
 *
 * Identity, in order of trust:
 * 1. Path. A file or folder still where it was keeps its id - even if it
 *    was retagged and its bytes changed.
 * 2. Content. A file at a path ZenPort has never seen, whose fingerprint
 *    matches a file that is gone from where it was (moved, renamed, or in a
 *    library that was unmounted and mounted back elsewhere), takes that
 *    file's id; a new folder most of whose files are such a match takes the
 *    old folder's id. Everything stored against those ids - places, ticks,
 *    history, favourites, types, roles, order, plans - carries across.
 *    A file whose fingerprint changed as well falls back to name + size.
 * 3. Otherwise it is new, with an id hashed from its root and path.
 *
 * Nothing is ever deleted here: what vanished is marked missing, so user
 * history survives a library hiccup, and comes back if the files do.
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

  // ── 1. Walk and read every root before touching anything, so a file that
  // moved from one root to another is known to be gone from the first.
  const passes: {
    root: ScanRoot;
    items: ReturnType<typeof inferLibrary>;
    loose: ReturnType<typeof looseDocuments>;
    files: Map<string, WalkedFile>;
  }[] = [];
  let filesBefore = 0;
  let itemsSoFar = 0;
  const creatorsMet = new Set<string>();
  let latest: string[] = [];
  for (const root of roots) {
    const rootIndex = roots.indexOf(root);
    const report = (p: Partial<ScanProgressDto>) =>
      opts.onProgress?.({
        phase: 'reading',
        root: root.label,
        rootIndex,
        roots: roots.length,
        files: filesBefore,
        items: itemsSoFar,
        done: 0,
        total: 0,
        creators: [...creatorsMet],
        latest,
        ...p,
      });
    report({});
    let lastTick = 0;
    const walk = await safeWalk(root.path, (n) => {
      if (n - lastTick >= 25) {
        lastTick = n;
        report({ files: filesBefore + n });
      }
    });
    filesBefore += walk.files.length;
    report({ phase: 'understanding', files: filesBefore });
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
    const kept = walk.files.filter((f) => !underAny(f.relPath, exclusions));
    const inferred = inferLibrary(kept);
    itemsSoFar += inferred.length;
    for (const it of inferred) creatorsMet.add(it.creator);
    latest = inferred
      .slice(0, 40)
      .map((it) => (it.collection ? `${it.collection} · ${it.title}` : it.title));
    report({ phase: 'understanding', files: filesBefore, items: itemsSoFar });
    passes.push({
      root,
      items: inferred,
      loose: looseDocuments(kept, inferred),
      files: new Map(walk.files.map((f) => [f.relPath, f])),
    });
  }
  const configured = new Set(roots.map((r) => r.id));
  const okRoots = new Set(passes.map((p) => p.root.id));

  // ── 2. What is already known, and what of it is gone from where it was.
  const known = db
    .prepare(
      'SELECT id, item_id, root_id, rel_path, name, size_bytes, fingerprint, fp_stamp FROM tracks',
    )
    .all() as unknown as TrackRow[];
  const trackAt = new Map(known.map((t) => [at(t.root_id, t.rel_path), t]));
  const itemAt = new Map(
    (
      db.prepare('SELECT id, root_id, item_key FROM items').all() as {
        id: string;
        root_id: number;
        item_key: string;
      }[]
    ).map((i) => [at(i.root_id, i.item_key), i.id]),
  );
  const takenItemIds = new Set(itemAt.values());
  const takenTrackIds = new Set(known.map((t) => t.id));
  // Gone: in a library no longer configured, or not under its path in a
  // library that scanned cleanly. A library that could not be read this time
  // gives nothing up - it may only be a network blip.
  const isGone = (t: TrackRow) =>
    !configured.has(t.root_id) ||
    (okRoots.has(t.root_id) && !passes.find((p) => p.root.id === t.root_id)!.files.has(t.rel_path));
  const gone = known.filter(isGone);
  const byFingerprint = new Map<string, TrackRow[]>();
  const byNameSize = new Map<string, TrackRow[]>();
  for (const t of gone) {
    if (t.fingerprint)
      byFingerprint.set(t.fingerprint, [...(byFingerprint.get(t.fingerprint) ?? []), t]);
    const ns = `${t.name}|${t.size_bytes}`;
    byNameSize.set(ns, [...(byNameSize.get(ns) ?? []), t]);
  }
  const liveItemIds = new Set(known.filter((t) => !isGone(t)).map((t) => t.item_id));
  const tracksPerItem = new Map<string, number>();
  for (const t of known) tracksPerItem.set(t.item_id, (tracksPerItem.get(t.item_id) ?? 0) + 1);

  // ── 3. Fingerprint every track this scan stores - read only when a file
  // is new or its size or modified time changed since it was last read.
  const prints = new Map<string, { fp: string | null; stamp: string }>();
  const toRead: { key: string; abs: string; size: number; stamp: string }[] = [];
  for (const pass of passes) {
    for (const item of pass.items) {
      for (const track of item.tracks) {
        const f = pass.files.get(track.relPath);
        const stamp = `${track.sizeBytes}:${f?.mtimeMs ?? 0}`;
        const key = at(pass.root.id, track.relPath);
        const row = trackAt.get(key);
        if (row?.fingerprint && row.fp_stamp === stamp) {
          prints.set(key, { fp: row.fingerprint, stamp });
        } else {
          toRead.push({
            key,
            abs: path.join(pass.root.path, track.relPath),
            size: track.sizeBytes,
            stamp,
          });
        }
      }
    }
  }
  await inPool(toRead, 8, async (r) => {
    prints.set(r.key, { fp: await fingerprintFile(r.abs, r.size), stamp: r.stamp });
  });

  const claimedItems = new Set<string>();
  const claimedTracks = new Set<string>();
  const freshId = (base: string, taken: Set<string>) => {
    let id = sid(base);
    for (let n = 1; taken.has(id); n++) id = sid(`${base}#${n}`);
    taken.add(id);
    return id;
  };
  let recognisedItems = 0;
  let newItems = 0;
  let recognisedTracks = 0;

  const itemIdentity = (rootId: number, item: (typeof passes)[number]['items'][number]) => {
    const here = itemAt.get(at(rootId, item.itemKey));
    if (here && !claimedItems.has(here)) {
      claimedItems.add(here);
      return { id: here, adopted: false };
    }
    // Which gone folder do most of these files come from?
    const votes = new Map<string, number>();
    for (const track of item.tracks) {
      const fp = prints.get(at(rootId, track.relPath))?.fp;
      const matches =
        (fp && byFingerprint.get(fp)) || byNameSize.get(`${track.name}|${track.sizeBytes}`) || [];
      for (const itemId of new Set(matches.map((m) => m.item_id))) {
        if (liveItemIds.has(itemId) || claimedItems.has(itemId)) continue;
        votes.set(itemId, (votes.get(itemId) ?? 0) + 1);
      }
    }
    let best: string | null = null;
    let bestVotes = 0;
    for (const [itemId, n] of votes) {
      if (n > bestVotes) [best, bestVotes] = [itemId, n];
    }
    if (best) {
      const size = Math.min(item.tracks.length, tracksPerItem.get(best) ?? 1);
      if (bestVotes / size >= 0.5) {
        claimedItems.add(best);
        recognisedItems++;
        return { id: best, adopted: true };
      }
    }
    const hinted = opts.idHints?.items.get(at(rootId, item.itemKey));
    if (hinted && !takenItemIds.has(hinted)) {
      takenItemIds.add(hinted);
      claimedItems.add(hinted);
      return { id: hinted, adopted: false };
    }
    newItems++;
    return { id: freshId(`item:${rootId}:${item.itemKey}`, takenItemIds), adopted: false };
  };

  const trackIdentity = (
    rootId: number,
    track: { relPath: string; name: string; sizeBytes: number },
    itemId: string,
  ) => {
    const here = trackAt.get(at(rootId, track.relPath));
    if (here && !claimedTracks.has(here.id)) {
      claimedTracks.add(here.id);
      return here.id;
    }
    const fp = prints.get(at(rootId, track.relPath))?.fp;
    const open = (rows: TrackRow[] | undefined) =>
      (rows ?? []).filter((r) => !claimedTracks.has(r.id));
    let candidates = fp ? open(byFingerprint.get(fp)) : [];
    if (candidates.length === 0)
      candidates = open(byNameSize.get(`${track.name}|${track.sizeBytes}`));
    if (candidates.length > 0) {
      // Prefer the same folder's own file, then the same name.
      const pick =
        candidates.find((c) => c.item_id === itemId) ??
        candidates.find((c) => c.name === track.name) ??
        candidates[0]!;
      claimedTracks.add(pick.id);
      recognisedTracks++;
      return pick.id;
    }
    const hinted = opts.idHints?.tracks.get(at(rootId, track.relPath));
    if (hinted && !takenTrackIds.has(hinted)) {
      takenTrackIds.add(hinted);
      claimedTracks.add(hinted);
      return hinted;
    }
    return freshId(`track:${rootId}:${track.relPath}`, takenTrackIds);
  };

  // ── 4. Persist, root by root.
  for (const { root, loose } of passes) {
    // Documents of folders (a creator's, a series'): what is here now, and
    // what is no longer.
    db.exec('BEGIN');
    try {
      db.prepare('UPDATE folder_docs SET missing = 1 WHERE root_id = ?').run(root.id);
      const put = db.prepare(
        `INSERT INTO folder_docs (id, root_id, folder, rel_path, name, ext, size_bytes, missing)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(root_id, rel_path) DO UPDATE SET folder = excluded.folder,
           name = excluded.name, ext = excluded.ext, size_bytes = excluded.size_bytes, missing = 0`,
      );
      for (const d of loose) {
        put.run(
          sid(`folderdoc:${root.id}:${d.relPath}`),
          root.id,
          d.folder,
          d.relPath,
          d.name,
          d.ext,
          d.sizeBytes,
        );
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
  for (const { root, items } of passes) {
    const ids = items.map((item) => itemIdentity(root.id, item));

    const embedded = new Map<string, { relPath: string; ext: string; size: number }>();
    const persistReport = (phase: ScanProgressDto['phase'], done: number, total: number) =>
      opts.onProgress?.({
        phase,
        root: root.label,
        rootIndex: roots.indexOf(root),
        roots: roots.length,
        files: filesBefore,
        items: itemsSoFar,
        done,
        total,
        creators: [...creatorsMet],
        latest,
      });
    if (opts.coverCacheDir) {
      for (const [n, item] of items.entries()) {
        if (n % 5 === 0) persistReport('artwork', n, items.length);
        if (item.coverRelPath) continue;
        const itemId = ids[n]!.id;
        const cover = await embeddedCover(opts.coverCacheDir, itemId, root.path, item.tracks);
        if (cover) embedded.set(itemId, cover);
      }
    }

    persistReport('saving', items.length, items.length);
    db.exec('BEGIN');
    try {
      const upsertItem = db.prepare(
        `INSERT INTO items (id, root_id, item_key, kind, title, creator, collection, breadcrumbs, evidence, missing, added_at, inferred_type, type_reason,
                            inferred_title, inferred_creator, inferred_collection)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           root_id = excluded.root_id, item_key = excluded.item_key,
           kind = excluded.kind, title = excluded.title, creator = excluded.creator,
           collection = excluded.collection, breadcrumbs = excluded.breadcrumbs,
           inferred_title = excluded.title, inferred_creator = excluded.creator,
           inferred_collection = excluded.collection,
           evidence = excluded.evidence, missing = 0, excluded = 0,
           inferred_type = excluded.inferred_type, type_reason = excluded.type_reason`,
      );
      const upsertTrack = db.prepare(
        `INSERT INTO tracks (id, item_id, root_id, rel_path, name, ext, ord, title, size_bytes, missing, inferred_role, fingerprint, fp_stamp, inferred_title)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           item_id = excluded.item_id, root_id = excluded.root_id, rel_path = excluded.rel_path,
           name = excluded.name, ext = excluded.ext, ord = excluded.ord, title = excluded.title,
           inferred_title = excluded.title,
           size_bytes = excluded.size_bytes, missing = 0, inferred_role = excluded.inferred_role,
           fingerprint = excluded.fingerprint, fp_stamp = excluded.fp_stamp`,
      );
      const upsertAsset = db.prepare(
        `INSERT INTO assets (id, item_id, root_id, rel_path, name, ext, kind, size_bytes, missing)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT(item_id, rel_path) DO UPDATE SET
           root_id = excluded.root_id, kind = excluded.kind, size_bytes = excluded.size_bytes, missing = 0`,
      );
      // An asset keeps the id it was first stored under (a remounted library
      // brings the same relative paths under a new root), so what counts as
      // seen is the id actually in the table.
      const assetIdAt = db.prepare('SELECT id FROM assets WHERE item_id = ? AND rel_path = ?');
      const putAsset = (
        id: string,
        itemId: string,
        rootId: number,
        relPath: string,
        name: string,
        ext: string,
        kind: 'cover' | 'document',
        size: number,
      ) => {
        upsertAsset.run(id, itemId, rootId, relPath, name, ext, kind, size);
        const row = assetIdAt.get(itemId, relPath) as { id: string } | undefined;
        seenAssets.add(row?.id ?? id);
      };
      // A file moving away frees its old path; clear it before anything
      // new may claim that path in the same pass.
      const vacate = db.prepare(
        'UPDATE tracks SET rel_path = rel_path || ?, missing = 1 WHERE root_id = ? AND rel_path = ? AND id <> ?',
      );

      for (const [n, item] of items.entries()) {
        const itemId = ids[n]!.id;
        seenItems.add(itemId);
        const guess = inferContentType({
          breadcrumbs: item.breadcrumbs,
          tracks: item.tracks.map((t) => ({
            name: t.relPath.split('/').at(-1) ?? t.relPath,
            ext: t.ext,
          })),
        });
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
          guess.type,
          guess.reason,
          item.title,
          item.creator,
          item.collection,
        );
        for (const track of item.tracks) {
          const trackId = trackIdentity(root.id, track, itemId);
          seenTracks.add(trackId);
          const print = prints.get(at(root.id, track.relPath));
          vacate.run(`\u0000moved:${trackId}`, root.id, track.relPath, trackId);
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
            inferTrackRole(track.title),
            print?.fp ?? null,
            print?.fp ? print.stamp : null,
            track.title,
          );
        }
        if (item.coverRelPath) {
          const name = item.coverRelPath.split('/').at(-1) as string;
          const ext = name.split('.').at(-1)?.toLowerCase() ?? '';
          const assetId = sid(`asset:${root.id}:${itemId}:${item.coverRelPath}`);
          putAsset(assetId, itemId, root.id, item.coverRelPath, name, ext, 'cover', 0);
        } else {
          const cover = embedded.get(itemId);
          if (cover) {
            const assetId = sid(`asset:embedded:${itemId}`);
            putAsset(
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
          putAsset(
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

  if (recognisedItems + recognisedTracks > 0) {
    const n = recognisedItems > 0 ? recognisedItems : recognisedTracks;
    const what = recognisedItems > 0 ? 'recording' : 'file';
    warnings.unshift(
      `Recognised ${n} ${what}${n === 1 ? '' : 's'} in a new place - progress, ticks, order and settings came with ${n === 1 ? 'it' : 'them'}.`,
    );
  }

  // The owner's corrections, laid over what the scan just wrote.
  applyEdits(db);

  // Mark anything not seen in this pass as missing — only for roots that
  // scanned cleanly, so a temporarily unreadable mount never masks a library.
  const okRootIds = [...okRoots];
  db.exec('BEGIN');
  try {
    for (const rootId of okRootIds) {
      const exclusions = excludedByRoot.get(rootId) ?? [];
      for (const row of db
        .prepare('SELECT id, item_key FROM items WHERE root_id = ?')
        .all(rootId) as { id: string; item_key: string }[]) {
        if (!seenItems.has(row.id)) {
          // Left out on purpose, regrouped, or genuinely gone. The shelves hide
          // all three, but only the last is worth a notice. An item whose
          // tracks all belong to other items now was regrouped by a smarter
          // scan (a "Livestreams" folder read as separate talks) - its files
          // are still here, so it is retired quietly, not reported missing.
          const regrouped =
            (
              db.prepare('SELECT COUNT(*) AS n FROM tracks WHERE item_id = ?').get(row.id) as {
                n: number;
              }
            ).n === 0;
          db.prepare('UPDATE items SET missing = 1, excluded = ? WHERE id = ?').run(
            underAny(row.item_key, exclusions) || regrouped ? 1 : 0,
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
    // A library taken out of ZP_LIBRARY_DIRS was taken out on purpose: its
    // recordings leave the shelves quietly (excluded, not "missing") and
    // everything about them is kept - Admin offers to forget it for good.
    const rootIds = [...configured, EMBEDDED_ROOT_ID];
    const notIn = `NOT IN (${rootIds.map(() => '?').join(', ')})`;
    db.prepare(`UPDATE items SET missing = 1, excluded = 1 WHERE root_id ${notIn}`).run(...rootIds);
    db.prepare(`UPDATE tracks SET missing = 1 WHERE root_id ${notIn}`).run(...rootIds);
    db.prepare(`UPDATE assets SET missing = 1 WHERE root_id ${notIn}`).run(...rootIds);
    db.prepare(`UPDATE folder_docs SET missing = 1 WHERE root_id ${notIn}`).run(...rootIds);
    db.prepare(
      `UPDATE assets SET missing = 1 WHERE root_id = ? AND item_id IN (SELECT id FROM items WHERE root_id ${notIn})`,
    ).run(EMBEDDED_ROOT_ID, ...rootIds);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const finishedAt = nowIso();
  db.prepare(
    `UPDATE scan_state SET status = 'idle', finished_at = ?, warnings = ?, ignored = ?, roots = ?, new_items = ? WHERE id = 1`,
  ).run(finishedAt, JSON.stringify(warnings), ignored, JSON.stringify(rootResults), newItems);

  return readScanState(db);
}

/**
 * Lay the owner's corrections over the visible columns: a title, creator or
 * series set by hand, and parts renamed by hand. What is not corrected shows
 * what the scanner read. Run after every scan and after every edit.
 */
export function applyEdits(db: Db, itemId?: string): void {
  const one = itemId ? ' AND items.id = ?' : '';
  const args = itemId ? [itemId] : [];
  db.prepare(
    `UPDATE items SET
       title = COALESCE(e.title, items.inferred_title, items.title),
       creator = COALESCE(e.creator, items.inferred_creator, items.creator),
       collection = CASE WHEN e.collection_set = 1 THEN e.collection ELSE items.inferred_collection END
     FROM item_edits e WHERE e.item_id = items.id${one}`,
  ).run(...args);
  db.prepare(
    `UPDATE tracks SET title = e.title FROM track_edits e
     WHERE e.track_id = tracks.id${itemId ? ' AND tracks.item_id = ?' : ''}`,
  ).run(...args);
  // Creators renamed or merged by hand: whatever the name read, the one chosen.
  db.prepare(
    `UPDATE items SET creator = a.to_name FROM creator_aliases a
     WHERE a.from_name = items.creator${one}`,
  ).run(...args);
}

export function readScanState(db: Db): ScanStateDto {
  const row = db.prepare('SELECT * FROM scan_state WHERE id = 1').get() as {
    status: string;
    started_at: string | null;
    finished_at: string | null;
    warnings: string;
    ignored: number;
    roots: string;
    new_items: number;
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
    newItems: row.new_items ?? 0,
  };
}
