/**
 * Creators (admin): list with their pictures and merged spellings, rename or
 * merge, undo a merge, and upload a picture. Setting one from an address and
 * removing it live with the AI enhancements (enhance.ts).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import path from 'node:path';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { ImageFetchError, storeSquare } from '../../ai/fetchImage.js';
import { CreatorError, dropAlias, listCreators, renameCreator } from '../../library/creators.js';

export function registerCreatorRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, config } = ctx;
  const admin = (req: FastifyRequest, reply: FastifyReply) => {
    if (req.user!.role !== 'admin') {
      void reply.code(403).send({ error: 'admin only' });
      return false;
    }
    return true;
  };

  app.get('/api/admin/creators', async (req, reply) => {
    if (!admin(req, reply)) return;
    return listCreators(db, config, req.user!.id);
  });

  app.post('/api/admin/creators/rename', async (req, reply) => {
    if (!admin(req, reply)) return;
    const body = z
      .object({ from: z.string().min(1).max(200), to: z.string().min(1).max(200) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Both names are needed.' });
    try {
      return renameCreator(db, body.data.from, body.data.to);
    } catch (err) {
      if (err instanceof CreatorError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.delete('/api/admin/creators/aliases/:from', async (req, reply) => {
    if (!admin(req, reply)) return;
    try {
      dropAlias(db, decodeURIComponent((req.params as { from: string }).from));
      return { ok: true };
    } catch (err) {
      if (err instanceof CreatorError) return reply.code(404).send({ error: err.message });
      throw err;
    }
  });

  // A picture uploaded as it is (JPEG, PNG, WebP, GIF, AVIF), kept as our own square.
  app.put('/api/creators/:name/image/upload', async (req, reply) => {
    if (!admin(req, reply)) return;
    const name = decodeURIComponent((req.params as { name: string }).name);
    const bytes = req.body;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
      return reply.code(400).send({ error: 'Choose an image.' });
    }
    try {
      const file = await storeSquare(bytes, path.join(config.dataDir, 'creators'));
      db.prepare(
        `INSERT INTO creator_images (name, file, source_url, updated_at) VALUES (?, ?, NULL, ?)
         ON CONFLICT(name) DO UPDATE SET file = excluded.file, source_url = NULL,
           updated_at = excluded.updated_at`,
      ).run(name, file, new Date().toISOString());
      return { ok: true, imageUrl: `/api/media/creator/${file}` };
    } catch (err) {
      if (err instanceof ImageFetchError) {
        return reply.code(400).send({ error: `That picture could not be used: ${err.message}.` });
      }
      throw err;
    }
  });
}
