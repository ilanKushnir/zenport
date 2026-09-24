import { describe, expect, it } from 'vitest';
import { openDb } from '../db/index.js';
import { resolveRoots } from './roots.js';

const r = (p: string, id: number) => ({ id, path: p, label: p.split('/').at(-1)! });

describe('resolveRoots', () => {
  it('seeds with list positions, then keeps each id by path', () => {
    const db = openDb(':memory:');
    expect(resolveRoots(db, [r('/library/a', 0), r('/library/b', 1)]).map((x) => x.id)).toEqual([
      0, 1,
    ]);
    // b first, a taken out, c added: b keeps 1, c gets a fresh id.
    expect(resolveRoots(db, [r('/library/b', 0), r('/library/c', 1)]).map((x) => x.id)).toEqual([
      1, 2,
    ]);
    // a comes back: its old id.
    expect(resolveRoots(db, [r('/library/a', 0)]).map((x) => x.id)).toEqual([0]);
    db.close();
  });
});
