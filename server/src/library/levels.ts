/**
 * A recording's level - who it suits: beginner, intermediate, advanced, or
 * every level. From the strongest word down:
 *
 * 1. an admin's choice (item_levels, source 'manual');
 * 2. its name: libraries often say it outright - "(ADV)", "Advanced",
 *    "Beginners", "Basics", "Level 2" - in the title, series or folder;
 * 3. web research an admin approved (item_about.level);
 * 4. the AI's reading (item_levels, source 'ai').
 */
import type { ItemLevel, LevelSource, Structure, StructureSource } from '@zenport/shared';
import { looksSequential, practiceParts } from '@zenport/shared';
import type { Db } from '../db/index.js';

export const LEVELS: ItemLevel[] = ['beginner', 'intermediate', 'advanced', 'all'];

/** What a name says about level, if anything. */
export function levelFromName(...texts: (string | null | undefined)[]): ItemLevel | null {
  const t = texts.filter(Boolean).join(' / ');
  if (/\((?:[A-Z]{2,5}-)?ADV\)|\badvanced\b|\blevel\s*(?:3|iii)\b/i.test(t)) return 'advanced';
  if (/\bintermediate\b|\blevel\s*(?:2|ii)\b/i.test(t)) return 'intermediate';
  if (
    /\b(?:beginners?|beginner'?s|basics|foundations?|getting started|first steps|for newcomers|level\s*(?:1|i))\b/i.test(
      t,
    )
  )
    return 'beginner';
  if (/\b(?:all|every|any) levels?\b/i.test(t)) return 'all';
  return null;
}

export function levelOf(
  db: Db,
  row: { id: string; title: string; collection: string | null; item_key: string },
): { level: ItemLevel | null; levelSource: LevelSource | null } {
  const set = db.prepare('SELECT level, source FROM item_levels WHERE item_id = ?').get(row.id) as
    { level: ItemLevel; source: 'manual' | 'ai' } | undefined;
  if (set?.source === 'manual') return { level: set.level, levelSource: 'manual' };
  const named = levelFromName(row.title, row.collection, row.item_key);
  if (named) return { level: named, levelSource: 'name' };
  const researched = db.prepare('SELECT level FROM item_about WHERE item_id = ?').get(row.id) as
    { level: ItemLevel | null } | undefined;
  if (researched?.level) return { level: researched.level, levelSource: 'research' };
  if (set) return { level: set.level, levelSource: 'ai' };
  return { level: null, levelSource: null };
}

/** An admin's choice for one or more recordings; null gives the choice back. */
export function setLevels(db: Db, ids: string[], level: ItemLevel | null): void {
  const now = new Date().toISOString();
  for (const id of ids) {
    if (level === null) {
      db.prepare("DELETE FROM item_levels WHERE item_id = ? AND source = 'manual'").run(id);
    } else {
      db.prepare(
        `INSERT INTO item_levels (item_id, level, source, updated_at) VALUES (?, ?, 'manual', ?)
         ON CONFLICT(item_id) DO UPDATE SET level = excluded.level, source = 'manual',
           reason = NULL, model = NULL, updated_at = excluded.updated_at`,
      ).run(id, level, now);
    }
  }
}

/**
 * Programme or pack, for a recording of several parts: an admin's word, the
 * AI's, or what the parts' names say (numbered in sequence: a programme).
 */
export function structureOf(
  db: Db,
  itemId: string,
): { structure: Structure; structureSource: StructureSource | null } {
  const titles = (
    db
      .prepare('SELECT title FROM tracks WHERE item_id = ? AND missing = 0 ORDER BY ord')
      .all(itemId) as { title: string }[]
  ).map((r) => r.title);
  // An introduction and one meditation is one meditation, however it is filed.
  const practice = practiceParts(titles);
  if (titles.length <= 1 || practice.length <= 1)
    return { structure: 'single', structureSource: null };
  const set = db
    .prepare('SELECT structure, source FROM item_structures WHERE item_id = ?')
    .get(itemId) as { structure: Structure; source: 'manual' | 'ai' } | undefined;
  if (set && set.structure !== 'single')
    return { structure: set.structure, structureSource: set.source };
  return { structure: looksSequential(practice) ? 'programme' : 'pack', structureSource: 'name' };
}

export function setStructures(db: Db, ids: string[], structure: 'programme' | 'pack' | null): void {
  const now = new Date().toISOString();
  for (const id of ids) {
    if (structure === null) {
      db.prepare("DELETE FROM item_structures WHERE item_id = ? AND source = 'manual'").run(id);
    } else {
      db.prepare(
        `INSERT INTO item_structures (item_id, structure, source, updated_at) VALUES (?, ?, 'manual', ?)
         ON CONFLICT(item_id) DO UPDATE SET structure = excluded.structure, source = 'manual',
           updated_at = excluded.updated_at`,
      ).run(id, structure, now);
    }
  }
}

export function setSeriesStructure(
  db: Db,
  creator: string,
  collection: string,
  structure: 'programme' | 'pack' | null,
): void {
  if (structure === null) {
    db.prepare('DELETE FROM series_structures WHERE creator = ? AND collection = ?').run(
      creator,
      collection,
    );
    return;
  }
  db.prepare(
    `INSERT INTO series_structures (creator, collection, structure, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(creator, collection) DO UPDATE SET structure = excluded.structure,
       updated_at = excluded.updated_at`,
  ).run(creator, collection, structure, new Date().toISOString());
}
