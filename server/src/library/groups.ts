/**
 * Recordings that belong together but were filed apart: five folders side by
 * side called "Advanced Workshop - Vol. 1" to "Vol. 5", eleven numbered
 * "Energy Centers 01…11", or several "Morning Light - To …". Each is its own
 * recording because each is its own folder, and nothing in the folders says
 * they are one set - only their names do.
 *
 * Found from the names alone (no AI, nothing sent anywhere), within one
 * creator and one folder, among recordings not already in a series. Offered,
 * never done: the admin groups them as a series (named as they like) or says
 * they do not belong together, and is not asked again.
 */
import { createHash } from 'node:crypto';
import {
  naturalCompare,
  type GroupSuggestionDto,
  type MeditationSummaryDto,
} from '@zenport/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { libraryDto } from './queries.js';
import { numberedStem, plainTitle, sharedStem } from './setNames.js';

export { numberedStem, plainTitle, sharedStem };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/** The folder a recording sits in, as the scanner read it. */
function folderOf(db: Db, id: string): string {
  const row = db.prepare('SELECT root_id, item_key FROM items WHERE id = ?').get(id) as
    { root_id: number; item_key: string } | undefined;
  if (!row) return '';
  const parts = row.item_key.split('/');
  return `${row.root_id}:${parts.slice(0, -1).join('/')}`;
}

const keyOf = (creator: string, folder: string, stem: string, ids: string[]) =>
  createHash('sha256')
    .update([creator, folder, norm(stem), ...[...ids].sort()].join('|'))
    .digest('hex')
    .slice(0, 20);

export function findGroups(db: Db, config: Config, userId: number): GroupSuggestionDto[] {
  const dismissed = new Set(
    (db.prepare('SELECT group_key FROM group_dismissals').all() as { group_key: string }[]).map(
      (r) => r.group_key,
    ),
  );
  const loose = libraryDto(db, config, userId).items.filter((i) => !i.missing && !i.collection);
  // Within one creator and one folder.
  const shelves = new Map<string, MeditationSummaryDto[]>();
  for (const i of loose) {
    const k = `${i.creator}\u0000${folderOf(db, i.id)}`;
    shelves.set(k, [...(shelves.get(k) ?? []), i]);
  }
  const out: GroupSuggestionDto[] = [];
  for (const [k, items] of shelves) {
    const [creator, folder] = k.split('\u0000') as [string, string];
    const taken = new Set<string>();
    const offer = (
      stem: string,
      why: GroupSuggestionDto['why'],
      members: { item: MeditationSummaryDto; n: number | null }[],
    ) => {
      const ids = members.map((m) => m.item.id);
      const key = keyOf(creator, folder, stem, ids);
      for (const id of ids) taken.add(id);
      if (dismissed.has(key)) return;
      out.push({
        key,
        creator,
        name: stem,
        why,
        items: members
          .sort((a, b) => (a.n ?? 1e9) - (b.n ?? 1e9) || naturalCompare(a.item.title, b.item.title))
          .map((m) => ({ id: m.item.id, title: m.item.title, coverId: m.item.coverId })),
      });
    };

    // Numbered sets first: "Vol. 1" to "Vol. 5".
    const numbered = new Map<
      string,
      { stem: string; members: { item: MeditationSummaryDto; n: number }[] }
    >();
    for (const item of items) {
      const s = numberedStem(item.title);
      if (!s) continue;
      const g = numbered.get(norm(s.stem)) ?? { stem: s.stem, members: [] };
      g.members.push({ item, n: s.n });
      numbered.set(norm(s.stem), g);
    }
    for (const g of numbered.values()) {
      // At least two, and different numbers - two copies of "Part 1" are not a set.
      if (g.members.length >= 2 && new Set(g.members.map((m) => m.n)).size >= 2) {
        offer(g.stem, 'numbered', g.members);
      }
    }

    // Then three or more sharing the name before their dash.
    const named = new Map<string, { stem: string; members: MeditationSummaryDto[] }>();
    for (const item of items) {
      if (taken.has(item.id)) continue;
      const stem = sharedStem(item.title) ?? plainTitle(item.title);
      const g = named.get(norm(stem)) ?? { stem, members: [] };
      g.members.push(item);
      named.set(norm(stem), g);
    }
    for (const g of named.values()) {
      if (g.members.length >= 3) {
        offer(
          g.stem,
          'shared-name',
          g.members.map((item) => ({ item, n: null })),
        );
      }
    }
  }
  return out.sort((a, b) => naturalCompare(a.creator, b.creator) || naturalCompare(a.name, b.name));
}

export function dismissGroup(db: Db, key: string): void {
  db.prepare(
    `INSERT INTO group_dismissals (group_key, dismissed_at) VALUES (?, ?)
     ON CONFLICT(group_key) DO NOTHING`,
  ).run(key, new Date().toISOString());
}
