/**
 * Creators, managed by an admin: rename one, merge two that are the same
 * person or studio spelled differently, undo a merge, and choose a picture.
 *
 * A rename or merge is kept as an alias (old name -> chosen name) and laid
 * over what the scanner reads after every scan (applyEdits), so a recording
 * found later under the old spelling lands under the chosen one - and a merge
 * can be undone by dropping its alias. The creator's picture follows the name.
 */
import type { AdminCreatorDto } from '@zenport/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { libraryDto } from './queries.js';
import { applyEdits } from '../scanner/scan.js';

export class CreatorError extends Error {}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export function listCreators(db: Db, config: Config, userId: number): AdminCreatorDto[] {
  const lib = libraryDto(db, config, userId);
  const aliases = db
    .prepare('SELECT from_name, to_name FROM creator_aliases ORDER BY from_name')
    .all() as { from_name: string; to_name: string }[];
  const series = new Map<string, Set<string>>();
  for (const i of lib.items) {
    if (i.missing) continue;
    const set = series.get(i.creator) ?? new Set<string>();
    if (i.collection) set.add(i.collection);
    series.set(i.creator, set);
  }
  return lib.creators.map((c) => ({
    ...c,
    seriesCount: series.get(c.name)?.size ?? 0,
    aliases: aliases.filter((a) => a.to_name === c.name).map((a) => a.from_name),
  }));
}

/** Everyone's creator shown fresh: scanner reading, corrections, aliases. */
function recompute(db: Db): void {
  db.prepare(
    `UPDATE items SET creator = COALESCE(
       (SELECT e.creator FROM item_edits e WHERE e.item_id = items.id),
       inferred_creator, creator)`,
  ).run();
  applyEdits(db);
}

/**
 * Rename `from` to `to`. When `to` is already a creator, this is a merge: the
 * two become one. Their picture: `to` keeps its own; if it has none, it takes
 * the one `from` had.
 */
export function renameCreator(db: Db, fromRaw: string, toRaw: string): { merged: boolean } {
  const from = clean(fromRaw);
  const to = clean(toRaw);
  if (!from || !to) throw new CreatorError('A name is needed.');
  if (to.length > 120) throw new CreatorError('That name is too long.');
  if (from === to) throw new CreatorError('That is already its name.');
  const exists = (name: string) =>
    !!db.prepare('SELECT 1 FROM items WHERE creator = ? AND missing = 0 LIMIT 1').get(name);
  if (!exists(from)) throw new CreatorError('No creator by that name.');
  const merged = exists(to);
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    // Names already pointing at `from` now point at `to`; nothing points at itself.
    db.prepare('UPDATE creator_aliases SET to_name = ? WHERE to_name = ?').run(to, from);
    db.prepare(
      `INSERT INTO creator_aliases (from_name, to_name, created_at) VALUES (?, ?, ?)
       ON CONFLICT(from_name) DO UPDATE SET to_name = excluded.to_name`,
    ).run(from, to, now);
    db.prepare('DELETE FROM creator_aliases WHERE from_name = to_name').run();
    // An item corrected by hand to `from` follows through the alias too, so
    // undoing the merge gives it back its own name.

    const pic = (name: string) =>
      db.prepare('SELECT name FROM creator_images WHERE name = ?').get(name);
    if (pic(from)) {
      if (pic(to)) db.prepare('DELETE FROM creator_images WHERE name = ?').run(from);
      else db.prepare('UPDATE creator_images SET name = ? WHERE name = ?').run(to, from);
    }
    db.prepare(
      "UPDATE ai_suggestions SET target = ? WHERE kind = 'creator-image' AND target = ? AND status = 'pending'",
    ).run(to, from);
    recompute(db);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { merged };
}

/** Undo a rename or merge: the old name stands on its own again. */
export function dropAlias(db: Db, fromRaw: string): void {
  const from = clean(fromRaw);
  db.exec('BEGIN');
  try {
    const res = db.prepare('DELETE FROM creator_aliases WHERE from_name = ?').run(from);
    if (res.changes === 0) throw new CreatorError('That name is not merged into another.');
    recompute(db);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
