import { DatabaseSync } from 'node:sqlite';
import { structureOf } from './library/levels.js';
const db = new DatabaseSync(process.argv[2]!, { readOnly: true });
const items = db.prepare(`SELECT id, creator, title FROM items WHERE missing = 0 AND excluded = 0
  AND (SELECT COUNT(*) FROM tracks t WHERE t.item_id = items.id AND t.missing = 0) > 1 ORDER BY creator, title`).all() as { id: string; creator: string; title: string }[];
const tally: Record<string, number> = {};
for (const i of items) {
  const s = structureOf(db as never, i.id);
  const k = `${s.structure}/${s.structureSource ?? '-'}`;
  tally[k] = (tally[k] ?? 0) + 1;
  if (process.argv[3]) console.log(k.padEnd(14), i.creator.slice(0, 12).padEnd(13), i.title.slice(0, 90));
}
console.log(tally);
