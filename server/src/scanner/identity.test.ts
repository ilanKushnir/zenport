import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/index.js';
import { runScan } from './scan.js';

let base: string;
let db: Db;

/** Distinct bytes per file - identical content would share a fingerprint. */
function put(root: string, rel: string, body = rel) {
  const abs = path.join(base, root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, `${body}:${'z'.repeat(200)}`);
}
const lib = (dir: string, id = 0) => ({ id, path: path.join(base, dir), label: dir });
const trackIds = () =>
  Object.fromEntries(
    (
      db.prepare('SELECT id, name FROM tracks WHERE missing = 0').all() as {
        id: string;
        name: string;
      }[]
    ).map((t) => [t.name, t.id]),
  );
const liveItems = () =>
  db.prepare('SELECT id, title FROM items WHERE missing = 0 ORDER BY title').all() as {
    id: string;
    title: string;
  }[];

beforeEach(() => {
  base = mkdtempSync(path.join(tmpdir(), 'zp-id-'));
  db = openDb(':memory:');
  db.prepare(
    "INSERT INTO users (id, username, password_hash, role, created_at) VALUES (1, 'a', 'x', 'admin', '')",
  ).run();
});
afterEach(() => {
  db.close();
  rmSync(base, { recursive: true, force: true });
});

describe('identity across moves', () => {
  it('a folder renamed and moved keeps its item and track ids - and so its progress', async () => {
    for (const d of ['Day 1.mp3', 'Day 2.mp3', 'Day 3.mp3'])
      put('spirit', `Mira Solen/Discovery/${d}`);
    await runScan(db, [lib('spirit')]);
    const [item] = liveItems();
    const before = trackIds();
    db.prepare('INSERT INTO track_completions (user_id, track_id, item_id) VALUES (1, ?, ?)').run(
      before['Day 1.mp3']!,
      item!.id,
    );
    mkdirSync(path.join(base, 'spirit/Series'), { recursive: true });
    renameSync(
      path.join(base, 'spirit/Mira Solen/Discovery'),
      path.join(base, 'spirit/Series/Discovery Part 1'),
    );
    const state = await runScan(db, [lib('spirit')]);

    expect(liveItems()).toEqual([{ id: item!.id, title: 'Discovery Part 1' }]);
    expect(trackIds()).toEqual(before);
    expect(state.counts.missing).toBe(0);
    expect(state.warnings[0]).toMatch(/Recognised 1 recording in a new place/);
    const done = db.prepare('SELECT track_id FROM track_completions').all();
    expect(done).toEqual([{ track_id: before['Day 1.mp3'] }]);
  });

  it('a file renamed inside its folder keeps its id', async () => {
    put('spirit', 'Quiet Harbor/Evening/01 Breath.mp3');
    put('spirit', 'Quiet Harbor/Evening/02 Body.mp3');
    await runScan(db, [lib('spirit')]);
    const before = trackIds();
    renameSync(
      path.join(base, 'spirit/Quiet Harbor/Evening/02 Body.mp3'),
      path.join(base, 'spirit/Quiet Harbor/Evening/02 Body scan.mp3'),
    );
    await runScan(db, [lib('spirit')]);
    expect(trackIds()['02 Body scan.mp3']).toBe(before['02 Body.mp3']);
    expect(trackIds()['01 Breath.mp3']).toBe(before['01 Breath.mp3']);
  });

  it('a library mounted back at another path (a new root) brings everything with it', async () => {
    for (const d of ['a.mp3', 'b.mp3']) put('old', `Tomas Reyes/Stillness/${d}`);
    put('old', 'Tomas Reyes/Single talk.mp3');
    await runScan(db, [lib('old', 0)]);
    const items = liveItems();
    const tracks = trackIds();

    renameSync(path.join(base, 'old'), path.join(base, 'new'));
    const state = await runScan(db, [lib('new', 1)]);
    expect(liveItems()).toEqual(items);
    expect(trackIds()).toEqual(tracks);
    expect(state.counts.missing).toBe(0);
    const roots = db.prepare('SELECT DISTINCT root_id FROM tracks WHERE missing = 0').all();
    expect(roots).toEqual([{ root_id: 1 }]);
  });

  it('a library taken out of the list leaves the shelves quietly and keeps its rows', async () => {
    put('keep', 'Juniper/One/x.mp3');
    put('gone', 'Juniper/Two/y.mp3');
    await runScan(db, [lib('keep', 0), lib('gone', 1)]);
    const state = await runScan(db, [lib('keep', 0)]);
    expect(liveItems().map((i) => i.title)).toEqual(['One']);
    expect(state.counts.missing).toBe(0);
    const kept = db.prepare('SELECT missing, excluded FROM items WHERE root_id = 1').get();
    expect(kept).toEqual({ missing: 1, excluded: 1 });
  });

  it('a retagged file at the same path keeps its id and gets a new fingerprint', async () => {
    put('spirit', 'Mira Solen/Long Sit.mp3', 'v1');
    await runScan(db, [lib('spirit')]);
    const before = db.prepare('SELECT id, fingerprint FROM tracks').get() as {
      id: string;
      fingerprint: string;
    };
    expect(before.fingerprint).toMatch(/^[0-9a-f]{32}$/);
    put('spirit', 'Mira Solen/Long Sit.mp3', 'v2-with-a-longer-tag');
    await runScan(db, [lib('spirit')]);
    const after = db.prepare('SELECT id, fingerprint FROM tracks').get() as {
      id: string;
      fingerprint: string;
    };
    expect(after.id).toBe(before.id);
    expect(after.fingerprint).not.toBe(before.fingerprint);
  });

  it('two copies of the same file keep separate identities', async () => {
    put('spirit', 'A/One/same.mp3', 'same');
    put('spirit', 'B/Two/same.mp3', 'same');
    await runScan(db, [lib('spirit')]);
    const first = trackIds();
    await runScan(db, [lib('spirit')]);
    const rows = db.prepare('SELECT id FROM tracks WHERE missing = 0').all();
    expect(rows).toHaveLength(2);
    expect(Object.values(trackIds())).toEqual(Object.values(first));
  });

  it('a new folder where a moved one used to be gets an id of its own', async () => {
    put('spirit', 'Mira Solen/Morning/a.mp3', 'a');
    await runScan(db, [lib('spirit')]);
    const [first] = liveItems();
    renameSync(
      path.join(base, 'spirit/Mira Solen/Morning'),
      path.join(base, 'spirit/Mira Solen/Dawn'),
    );
    await runScan(db, [lib('spirit')]);
    put('spirit', 'Mira Solen/Morning/other.mp3', 'other');
    await runScan(db, [lib('spirit')]);
    const now = liveItems();
    expect(now.find((i) => i.title === 'Dawn')!.id).toBe(first!.id);
    expect(now.find((i) => i.title === 'Morning')!.id).not.toBe(first!.id);
  });
});
