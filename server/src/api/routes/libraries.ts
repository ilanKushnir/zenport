/**
 * Choosing libraries (admin): what is mounted, browsing inside it, and
 * adding, renaming or removing a library - each change followed by a scan.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../../context.js';
import { startScan } from '../../scanner/coordinator.js';
import {
  SourceError,
  addLibrary,
  browse,
  listLibraries,
  removeLibrary,
  renameLibrary,
} from '../../library/sources.js';

export function registerLibrarySourceRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, config } = ctx;
  const admin = (req: FastifyRequest, reply: FastifyReply) => {
    if (req.user!.role !== 'admin') {
      void reply.code(403).send({ error: 'admin only' });
      return false;
    }
    return true;
  };
  const fail = (err: unknown, reply: FastifyReply) => {
    if (err instanceof SourceError) return reply.code(400).send({ error: err.message });
    throw err;
  };
  const scan = () => void startScan(db, config, (err) => app.log.error(err, 'scan failed'));

  app.get('/api/admin/libraries', async (req, reply) => {
    if (!admin(req, reply)) return;
    return listLibraries(db, config);
  });

  app.get('/api/admin/libraries/browse', async (req, reply) => {
    if (!admin(req, reply)) return;
    const rel = String((req.query as { rel?: string }).rel ?? '');
    try {
      return await browse(db, config, rel);
    } catch (err) {
      return fail(err, reply);
    }
  });

  app.post('/api/admin/libraries', async (req, reply) => {
    if (!admin(req, reply)) return;
    const body = z
      .object({ rel: z.string().min(1).max(1000), label: z.string().max(80).optional() })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Choose a folder.' });
    try {
      await addLibrary(db, config, body.data.rel, body.data.label);
    } catch (err) {
      return fail(err, reply);
    }
    scan();
    return listLibraries(db, config);
  });

  app.patch('/api/admin/libraries', async (req, reply) => {
    if (!admin(req, reply)) return;
    const body = z
      .object({ rel: z.string().min(1).max(1000), label: z.string().min(1).max(80) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'A name is needed.' });
    try {
      renameLibrary(db, config, body.data.rel, body.data.label);
    } catch (err) {
      return fail(err, reply);
    }
    return listLibraries(db, config);
  });

  app.delete('/api/admin/libraries', async (req, reply) => {
    if (!admin(req, reply)) return;
    const rel = String((req.query as { rel?: string }).rel ?? '');
    if (!rel) return reply.code(400).send({ error: 'Which library?' });
    removeLibrary(db, config, rel);
    scan();
    return listLibraries(db, config);
  });
}
