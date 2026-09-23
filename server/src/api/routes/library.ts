import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { itemDetail, libraryDto } from '../../library/queries.js';
import type { LibraryFoldersDto } from '@zenport/shared';
import { lastFolderTree, readScanState, runScan } from '../../scanner/scan.js';

export function registerLibraryRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, config } = ctx;
  let scanning: Promise<unknown> | null = null;

  app.get('/api/library', async () => libraryDto(db, config));

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

  app.post('/api/library/rescan', async () => {
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
    return { ok: true };
  });
}
