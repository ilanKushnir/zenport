/**
 * Starting the library over: forget how it was read and read it again, as if
 * for the first time - titles, creators, series, types, parts, covers,
 * lengths, the folders' guides - and everything the AI made of it (levels,
 * programme or pack, descriptions, pictures it found, suggested fixes), so
 * the AI can go through it afresh too.
 *
 * What is never touched: anyone's practice - sessions, finished parts,
 * places, favourites, plans, the journal, today's pick. It all points at
 * recordings by id, and the fresh scan gives everything still there the id it
 * had (idHints), so it all comes back attached. Hiding a folder is kept (it
 * is by path). The admin's own corrections are kept too, unless they ask for
 * those to go as well.
 *
 * The database is copied aside first (data/zenport-before-start-over-*.db),
 * the newest two kept.
 */
import { readdirSync, rmSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/index.js';

export interface StartOverOptions {
  /** Keep the admin's own corrections (titles, types, part names and order, levels, pictures set by hand). */
  keepCorrections: boolean;
}

export interface StartOverResult {
  backup: string;
  idHints: { items: Map<string, string>; tracks: Map<string, string> };
}

const key = (rootId: number, rel: string) => `${rootId}\u0000${rel}`;

export function startOver(db: Db, dataDir: string, opts: StartOverOptions): StartOverResult {
  // 1. A copy of everything as it was.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(dataDir, `zenport-before-start-over-${stamp}.db`);
  db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
  const olds = readdirSync(dataDir)
    .filter((f) => /^zenport-before-start-over-.*\.db$/.test(f))
    .sort()
    .reverse();
  for (const f of olds.slice(2)) rmSync(path.join(dataDir, f), { force: true });

  // 2. The ids things have, by where they are.
  const items = new Map(
    (
      db.prepare('SELECT id, root_id, item_key FROM items').all() as {
        id: string;
        root_id: number;
        item_key: string;
      }[]
    ).map((r) => [key(r.root_id, r.item_key), r.id]),
  );
  const tracks = new Map(
    (
      db.prepare('SELECT id, root_id, rel_path FROM tracks').all() as {
        id: string;
        root_id: number;
        rel_path: string;
      }[]
    ).map((r) => [key(r.root_id, r.rel_path), r.id]),
  );

  // Pictures found on the web (they carry where from); one set by hand does not.
  const pictures = (
    db
      .prepare(
        opts.keepCorrections
          ? 'SELECT file FROM creator_images WHERE source_url IS NOT NULL'
          : 'SELECT file FROM creator_images',
      )
      .all() as { file: string }[]
  ).map((r) => r.file);

  // 3. Forget it, all at once.
  db.exec('BEGIN');
  try {
    // How it was read (tracks and assets go with their recordings).
    db.exec(`
      DELETE FROM items;
      DELETE FROM folder_docs;
      UPDATE scan_state SET new_items = 0 WHERE id = 1;
    `);
    // What the AI made of it.
    db.exec(`
      DELETE FROM ai_suggestions;
      DELETE FROM ai_reviewed;
      DELETE FROM item_about;
      DELETE FROM item_levels WHERE source != 'manual';
      DELETE FROM item_structures WHERE source != 'manual';
    `);
    db.exec(
      opts.keepCorrections
        ? 'DELETE FROM creator_images WHERE source_url IS NOT NULL'
        : 'DELETE FROM creator_images',
    );
    if (!opts.keepCorrections) {
      db.exec(`
        DELETE FROM item_edits;
        DELETE FROM item_types;
        DELETE FROM track_edits;
        DELETE FROM track_roles;
        DELETE FROM track_order;
        DELETE FROM item_reviews;
        DELETE FROM item_levels;
        DELETE FROM item_structures;
        DELETE FROM series_structures;
        DELETE FROM creator_aliases;
        DELETE FROM group_dismissals;
      `);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  // Their files, and the covers read out of the audio (read again by the scan).
  for (const f of pictures) {
    try {
      unlinkSync(path.join(dataDir, 'creators', path.basename(f)));
    } catch {
      /* already gone */
    }
  }
  rmSync(path.join(dataDir, 'covers'), { recursive: true, force: true });

  return { backup: path.basename(backup), idHints: { items, tracks } };
}
