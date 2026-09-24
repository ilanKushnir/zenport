/**
 * Library roots keep their id by path, not by their place in
 * ZP_LIBRARY_DIRS. Before this, ids were list positions: taking the first
 * entry out, or swapping two, gave every recording a new identity.
 *
 * The first time this runs the table is empty and is seeded with the ids the
 * list order gave, so everything stored so far keeps its meaning. A path seen
 * for the first time gets a fresh id, never one used before - a library that
 * went away keeps its id reserved, so its recordings are still its own if it
 * comes back (or are recognised by content if it comes back elsewhere).
 */
import type { LibraryRootConfig } from '../config.js';
import type { Db } from '../db/index.js';

export function resolveRoots(db: Db, roots: LibraryRootConfig[]): LibraryRootConfig[] {
  const count = (db.prepare('SELECT COUNT(*) AS n FROM library_roots').get() as { n: number }).n;
  if (count === 0) {
    const seed = db.prepare(
      'INSERT OR IGNORE INTO library_roots (id, path, label) VALUES (?, ?, ?)',
    );
    for (const r of roots) seed.run(r.id, r.path, r.label);
  }
  const find = db.prepare('SELECT id FROM library_roots WHERE path = ?');
  const touch = db.prepare(
    "UPDATE library_roots SET label = ?, last_seen = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?",
  );
  const add = db.prepare('INSERT INTO library_roots (id, path, label) VALUES (?, ?, ?)');
  return roots.map((r) => {
    const hit = find.get(r.path) as { id: number } | undefined;
    if (hit) {
      touch.run(r.label, hit.id);
      return { ...r, id: hit.id };
    }
    const next = (
      db
        .prepare(
          `SELECT MAX(m) AS m FROM (
             SELECT MAX(id) AS m FROM library_roots
             UNION ALL SELECT MAX(root_id) FROM items
             UNION ALL SELECT MAX(root_id) FROM tracks)`,
        )
        .get() as { m: number | null }
    ).m;
    const id = (next ?? -1) + 1;
    add.run(id, r.path, r.label);
    return { ...r, id };
  });
}
