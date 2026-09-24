import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { freshSince, itemDetail, libraryDto } from '../../library/queries.js';
import {
  CONTENT_TYPES,
  type LibraryFoldersDto,
  type RemovedLibraryDto,
  type ReviewSummaryDto,
} from '@zenport/shared';
import { lastFolderTree, readScanState, runScan } from '../../scanner/scan.js';
import {
  markReviewed,
  reviewDetail,
  reviewList,
  ReviewError,
  saveReview,
} from '../../library/review.js';

export function registerLibraryRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, config } = ctx;
  let scanning: Promise<unknown> | null = null;

  app.get('/api/library', async (req) => libraryDto(db, config, req.user!.id));

  app.get('/api/library/scan-state', async () => readScanState(db));

  // The Continue row: set something aside, or bring it back. Opening an item
  // (or playing it - see practice start) brings it back on its own.
  const continueKey = z.string().min(3).max(600);
  app.put('/api/continue/hidden', async (req, reply) => {
    const body = z.object({ key: continueKey }).safeParse(req.body);
    if (!body.success || !/^(item|series):/.test(body.data.key)) {
      return reply.code(400).send({ error: 'key required' });
    }
    db.prepare(
      'INSERT INTO continue_hidden (user_id, key) VALUES (?, ?) ON CONFLICT DO NOTHING',
    ).run(req.user!.id, body.data.key);
    return { ok: true };
  });
  app.post('/api/continue/shown', async (req, reply) => {
    const body = z.object({ keys: z.array(continueKey).max(50) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'keys required' });
    const del = db.prepare('DELETE FROM continue_hidden WHERE user_id = ? AND key = ?');
    for (const k of body.data.keys) del.run(req.user!.id, k);
    return { ok: true };
  });

  const rescan = (): Promise<unknown> => {
    if (!scanning) {
      scanning = runScan(db, config.libraryRoots, {
        coverCacheDir: path.join(config.dataDir, 'covers'),
      })
        .catch((err) => app.log.error(err, 'rescan failed'))
        .finally(() => {
          scanning = null;
        });
    }
    return scanning;
  };

  app.post('/api/library/rescan', async (req, reply) => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    void rescan();
    return readScanState(db);
  });

  // Every folder the last scan walked, excluded ones included, so they can be
  // put back. Read-only for everyone; changing it is the owner's call.
  app.get('/api/library/folders', async (): Promise<LibraryFoldersDto> => {
    const state = readScanState(db);
    return {
      scanning: state.status === 'scanning',
      roots: config.libraryRoots.map((r) => ({
        id: r.id,
        label: r.label,
        ok: state.roots.find((x) => x.id === r.id)?.ok ?? false,
        tree: lastFolderTree(r.id),
      })),
    };
  });

  // ── Library review (admin): how everything was read, and corrections.
  app.get('/api/admin/review', async (req, reply) => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    return reviewList(db, config, req.user!.id);
  });

  // Just the counts - for Admin's overview and the "scan finished" notice.
  app.get('/api/admin/review/summary', async (req, reply): Promise<ReviewSummaryDto | void> => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const list = reviewList(db, config, req.user!.id);
    return {
      new: list.items.filter((i) => i.isNew && !i.hidden).length,
      look: list.items.filter((i) => !i.hidden && !i.reviewedAt && i.flags.length > 0).length,
      lastScan: list.lastScan,
    };
  });

  app.get('/api/admin/items/:id', async (req, reply) => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const detail = reviewDetail(db, config, (req.params as { id: string }).id);
    return detail ?? reply.code(404).send({ error: 'meditation not found' });
  });

  app.put('/api/admin/items/:id', async (req, reply) => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const text = z.string().max(300);
    const body = z
      .object({
        title: text.optional(),
        creator: text.optional(),
        series: text.optional(),
        type: z.enum(CONTENT_TYPES).optional(),
        scope: z.enum(['item', 'series']).optional(),
        tracks: z
          .array(
            z.object({
              id: z.string().min(1).max(64),
              title: text.optional(),
              role: z.enum(['lesson', 'practice']).optional(),
            }),
          )
          .max(2000)
          .optional(),
        order: z.array(z.string().min(1).max(64)).max(2000).nullable().optional(),
        hidden: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid correction' });
    try {
      const { rescan: needsScan } = saveReview(
        db,
        config,
        (req.params as { id: string }).id,
        body.data,
      );
      if (needsScan) await rescan();
      return { ok: true };
    } catch (err) {
      if (err instanceof ReviewError) return reply.code(err.status).send({ error: err.message });
      throw err;
    }
  });

  // "These read right": clears items from New and Worth a look.
  app.post('/api/admin/review/reviewed', async (req, reply) => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const body = z
      .object({ ids: z.array(z.string().min(1).max(64)).max(5000) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'ids required' });
    markReviewed(db, body.data.ids);
    return { ok: true };
  });

  // Libraries mounted once and no longer in ZP_LIBRARY_DIRS, with what is
  // still kept about them. Kept means recognised: if the files come back -
  // at the same path or any other - everyone picks up where they were.
  app.get('/api/library/removed', async (req, reply): Promise<RemovedLibraryDto[] | void> => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const live = config.libraryRoots.map((r) => r.id);
    const rows = db
      .prepare(
        `SELECT lr.id, lr.label, lr.last_seen,
           (SELECT COUNT(*) FROM items i WHERE i.root_id = lr.id) AS items,
           (SELECT COUNT(*) FROM tracks t WHERE t.root_id = lr.id) AS tracks
         FROM library_roots lr
         WHERE lr.id NOT IN (${live.map(() => '?').join(', ') || 'NULL'})
         ORDER BY lr.last_seen DESC`,
      )
      .all(...live) as {
      id: number;
      label: string;
      last_seen: string;
      items: number;
      tracks: number;
    }[];
    return rows
      .filter((r) => r.items > 0)
      .map((r) => ({
        id: r.id,
        label: r.label,
        items: r.items,
        tracks: r.tracks,
        people: (
          db
            .prepare(
              `SELECT COUNT(DISTINCT user_id) AS n FROM (
                 SELECT user_id FROM playback_positions WHERE item_id IN (SELECT id FROM items WHERE root_id = ?)
                 UNION SELECT user_id FROM track_completions WHERE item_id IN (SELECT id FROM items WHERE root_id = ?)
                 UNION SELECT user_id FROM favorites WHERE item_id IN (SELECT id FROM items WHERE root_id = ?))`,
            )
            .get(r.id, r.id, r.id) as { n: number }
        ).n,
        lastSeen: r.last_seen,
      }));
  });

  // Forget a removed library for good: its recordings, and everyone's places,
  // ticks, favourites and the owner's types, roles and order for them. Their
  // ids come out of plans. Practice history and journal entries stay - they
  // are what happened. The files themselves are never touched (read-only).
  app.delete('/api/library/removed/:id', async (req, reply) => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const rootId = Number((req.params as { id: string }).id);
    if (!Number.isInteger(rootId)) return reply.code(400).send({ error: 'bad id' });
    if (config.libraryRoots.some((r) => r.id === rootId)) {
      return reply.code(409).send({ error: 'this library is still mounted' });
    }
    const itemIds = (
      db.prepare('SELECT id FROM items WHERE root_id = ?').all(rootId) as { id: string }[]
    ).map((r) => r.id);
    db.exec('BEGIN');
    try {
      const inItems = `IN (SELECT id FROM items WHERE root_id = ${rootId})`;
      const inTracks = `IN (SELECT id FROM tracks WHERE root_id = ${rootId} OR item_id ${inItems})`;
      db.exec(`DELETE FROM playback_positions WHERE item_id ${inItems} OR track_id ${inTracks}`);
      db.exec(`DELETE FROM track_completions WHERE item_id ${inItems} OR track_id ${inTracks}`);
      db.exec(`DELETE FROM track_roles WHERE track_id ${inTracks}`);
      db.exec(`DELETE FROM track_order WHERE item_id ${inItems} OR track_id ${inTracks}`);
      db.exec(`DELETE FROM track_durations_reported WHERE track_id ${inTracks}`);
      db.exec(`DELETE FROM favorites WHERE item_id ${inItems}`);
      db.exec(`DELETE FROM item_types WHERE item_id ${inItems}`);
      db.exec(`DELETE FROM assets WHERE item_id ${inItems}`);
      db.exec(`DELETE FROM tracks WHERE root_id = ${rootId} OR item_id ${inItems}`);
      db.exec(`DELETE FROM items WHERE root_id = ${rootId}`);
      db.prepare('DELETE FROM excluded_folders WHERE root_id = ?').run(rootId);
      db.prepare('DELETE FROM library_roots WHERE id = ?').run(rootId);
      if (itemIds.length > 0) {
        const gone = new Set(itemIds);
        const plans = db
          .prepare("SELECT id, meditation_ids FROM plans WHERE meditation_ids <> '[]'")
          .all() as { id: number; meditation_ids: string }[];
        const setIds = db.prepare('UPDATE plans SET meditation_ids = ? WHERE id = ?');
        for (const p of plans) {
          const ids = JSON.parse(p.meditation_ids) as string[];
          const kept = ids.filter((x) => !gone.has(x));
          if (kept.length !== ids.length) setIds.run(JSON.stringify(kept), p.id);
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return { ok: true, forgotten: itemIds.length };
  });

  app.put('/api/library/exclusions', async (req, reply) => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const body = z
      .object({
        rootId: z.number().int(),
        relPath: z.string().min(1).max(4096),
        excluded: z.boolean(),
      })
      .safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'rootId, relPath and excluded required' });
    const { rootId, relPath, excluded } = body.data;
    if (!config.libraryRoots.some((r) => r.id === rootId)) {
      return reply.code(404).send({ error: 'unknown library root' });
    }
    // Only folders the scan actually saw - never an arbitrary string.
    const known = (n: ReturnType<typeof lastFolderTree>): boolean =>
      !!n && (n.relPath === relPath || n.children.some(known));
    if (!known(lastFolderTree(rootId))) {
      return reply.code(404).send({ error: 'no such folder in the last scan' });
    }
    if (excluded) {
      db.prepare(
        'INSERT INTO excluded_folders (root_id, rel_path) VALUES (?, ?) ON CONFLICT DO NOTHING',
      ).run(rootId, relPath);
    } else {
      db.prepare('DELETE FROM excluded_folders WHERE root_id = ? AND rel_path = ?').run(
        rootId,
        relPath,
      );
    }
    // Wait for the rescan so the answer reflects the new shelves.
    if (scanning) await scanning;
    await rescan();
    return { ok: true, scan: readScanState(db) };
  });

  app.get('/api/items/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const detail = itemDetail(db, config, id, req.user!.id);
    if (!detail) return reply.code(404).send({ error: 'meditation not found' });
    return detail;
  });

  // The browser is the only place durations are known without probing
  // binaries server-side; the player reports them once loaded.
  app.patch('/api/tracks/:id/duration', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ durationSec: z.number().min(0).max(86_400) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'durationSec required' });
    const res = db
      .prepare('UPDATE tracks SET duration_sec = ? WHERE id = ?')
      .run(body.data.durationSec, id);
    if (res.changes > 0) {
      db.prepare(
        `INSERT INTO track_durations_reported (track_id, duration_sec, reported_at)
         VALUES (?, ?, ?)
         ON CONFLICT(track_id) DO UPDATE SET duration_sec = excluded.duration_sec,
           reported_at = excluded.reported_at`,
      ).run(id, body.data.durationSec, new Date().toISOString());
    }
    return { ok: true };
  });

  // What an item is for. The owner's correction is stored apart from the
  // scanner's guess, so a rescan never undoes it; null goes back to the guess.
  // scope 'collection' applies it to every item in the same series.
  app.put('/api/items/:id/type', async (req, reply) => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const { id } = req.params as { id: string };
    const body = z
      .object({
        type: z.enum(CONTENT_TYPES).nullable(),
        scope: z.enum(['item', 'collection']).default('item'),
      })
      .safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'type must be one of ' + CONTENT_TYPES.join(', ') });
    const item = db
      .prepare('SELECT id, root_id, creator, collection FROM items WHERE id = ?')
      .get(id) as
      { id: string; root_id: number; creator: string; collection: string | null } | undefined;
    if (!item) return reply.code(404).send({ error: 'meditation not found' });
    const ids =
      body.data.scope === 'collection' && item.collection
        ? (
            db
              .prepare('SELECT id FROM items WHERE root_id = ? AND creator = ? AND collection = ?')
              .all(item.root_id, item.creator, item.collection) as { id: string }[]
          ).map((r) => r.id)
        : [item.id];
    db.exec('BEGIN');
    try {
      for (const itemId of ids) {
        if (body.data.type === null) {
          db.prepare('DELETE FROM item_types WHERE item_id = ?').run(itemId);
        } else {
          db.prepare(
            `INSERT INTO item_types (item_id, type, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(item_id) DO UPDATE SET type = excluded.type, updated_at = excluded.updated_at`,
          ).run(itemId, body.data.type, new Date().toISOString());
        }
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return { ok: true, updated: ids.length };
  });

  // The owner's order for an item's parts, set by dragging them. Stored per
  // track id, apart from the scanner's order, so no rescan undoes it - and
  // ids follow files that move, so neither does reorganising the library.
  app.put('/api/items/:id/order', async (req, reply) => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const { id } = req.params as { id: string };
    const body = z
      .object({ trackIds: z.array(z.string().min(1).max(64)).min(1).max(2000) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'trackIds required' });
    const own = new Set(
      (db.prepare('SELECT id FROM tracks WHERE item_id = ?').all(id) as { id: string }[]).map(
        (t) => t.id,
      ),
    );
    if (own.size === 0) return reply.code(404).send({ error: 'meditation not found' });
    const ids = body.data.trackIds;
    if (new Set(ids).size !== ids.length || ids.some((t) => !own.has(t))) {
      return reply.code(400).send({ error: 'every id must be a part of this item, once' });
    }
    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM track_order WHERE item_id = ?').run(id);
      const put = db.prepare(
        'INSERT INTO track_order (track_id, item_id, pos, updated_at) VALUES (?, ?, ?, ?)',
      );
      const now = new Date().toISOString();
      ids.forEach((trackId, i) => put.run(trackId, id, i + 1, now));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return { ok: true };
  });

  // Back to the order the scanner reads from the file names.
  app.delete('/api/items/:id/order', async (req, reply) => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const { id } = req.params as { id: string };
    db.prepare('DELETE FROM track_order WHERE item_id = ?').run(id);
    return { ok: true };
  });

  // A track inside a course: a lesson or a meditation. The owner's choice;
  // null returns it to the scanner's guess. The parent item is untouched.
  app.put('/api/tracks/:id/role', async (req, reply) => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const { id } = req.params as { id: string };
    const body = z.object({ role: z.enum(['lesson', 'practice']).nullable() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'role must be lesson or practice' });
    if (!db.prepare('SELECT 1 FROM tracks WHERE id = ?').get(id)) {
      return reply.code(404).send({ error: 'track not found' });
    }
    if (body.data.role === null) {
      db.prepare('DELETE FROM track_roles WHERE track_id = ?').run(id);
    } else {
      db.prepare(
        `INSERT INTO track_roles (track_id, role, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(track_id) DO UPDATE SET role = excluded.role, updated_at = excluded.updated_at`,
      ).run(id, body.data.role, new Date().toISOString());
    }
    return { ok: true };
  });

  // A lesson (or any track) finished. The player marks it when a track plays
  // to its end; people can also tick or untick it by hand.
  app.put('/api/tracks/:id/completed', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = z.object({ completed: z.boolean() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'completed required' });
    const track = db.prepare('SELECT item_id FROM tracks WHERE id = ?').get(id) as
      { item_id: string } | undefined;
    if (!track) return reply.code(404).send({ error: 'track not found' });
    if (body.data.completed) {
      db.prepare(
        `INSERT INTO track_completions (user_id, track_id, item_id) VALUES (?, ?, ?)
         ON CONFLICT(user_id, track_id) DO NOTHING`,
      ).run(req.user!.id, id, track.item_id);
    } else {
      db.prepare('DELETE FROM track_completions WHERE user_id = ? AND track_id = ?').run(
        req.user!.id,
        id,
      );
    }
    return { ok: true };
  });

  /** Start over: forget where this person was in an item and which parts they ticked done.
   *  Practice history, stats and journal entries are kept. */
  app.delete('/api/items/:id/progress', async (req, reply) => {
    const { id } = req.params as { id: string };
    const exists = db.prepare('SELECT 1 FROM items WHERE id = ?').get(id);
    if (!exists) return reply.code(404).send({ error: 'not found' });
    db.prepare('DELETE FROM playback_positions WHERE user_id = ? AND item_id = ?').run(
      req.user!.id,
      id,
    );
    db.prepare('DELETE FROM track_completions WHERE user_id = ? AND item_id = ?').run(
      req.user!.id,
      id,
    );
    return { ok: true };
  });

  app.put('/api/progress/:trackId', async (req, reply) => {
    const { trackId } = req.params as { trackId: string };
    const body = z.object({ positionSec: z.number().min(0).max(86_400) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'positionSec required' });
    const track = db.prepare('SELECT item_id FROM tracks WHERE id = ?').get(trackId) as
      { item_id: string } | undefined;
    if (!track) return reply.code(404).send({ error: 'track not found' });
    db.prepare(
      `INSERT INTO playback_positions (user_id, track_id, item_id, position_sec, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, track_id) DO UPDATE SET position_sec = excluded.position_sec,
         updated_at = excluded.updated_at`,
    ).run(req.user!.id, trackId, track.item_id, body.data.positionSec, new Date().toISOString());
    // A meditation's place only covers an accidental exit; older ones go.
    db.prepare(
      `DELETE FROM playback_positions
       WHERE user_id = ? AND updated_at < ? AND item_id IN (
         SELECT i.id FROM items i LEFT JOIN item_types t ON t.item_id = i.id
         WHERE COALESCE(t.type, i.inferred_type) IN ('meditation', 'soundscape'))`,
    ).run(req.user!.id, freshSince());
    return { ok: true };
  });
}
