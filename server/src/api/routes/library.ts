import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { freshSince, itemDetail, libraryDto } from '../../library/queries.js';
import { CONTENT_TYPES, type LibraryFoldersDto } from '@zenport/shared';
import { lastFolderTree, readScanState, runScan } from '../../scanner/scan.js';

export function registerLibraryRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, config } = ctx;
  let scanning: Promise<unknown> | null = null;

  app.get('/api/library', async (req) => libraryDto(db, config, req.user!.id));

  app.get('/api/library/scan-state', async () => readScanState(db));

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
