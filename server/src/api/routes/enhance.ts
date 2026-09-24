/**
 * AI library enhancements (admin): run fixes, research and creator-image
 * searches; list, apply and dismiss what they suggest; set a creator's
 * picture by hand. Serves creator pictures (to everyone signed in) and
 * candidates awaiting a decision (to admins).
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { EnhanceStatusDto } from '@zenport/shared';
import type { AppContext } from '../../context.js';
import {
  FIX_BATCH,
  applySuggestion,
  dismissSuggestion,
  listSuggestions,
  removeCreatorImage,
  runAbout,
  runCreatorImages,
  runFixes,
  setCreatorImage,
  type EnhanceCtx,
} from '../../ai/enhance.js';
import { targetFor } from '../../ai/connection.js';
import { ImageFetchError } from '../../ai/fetchImage.js';
import { AiError, WEB_SEARCH } from '../../ai/providers.js';
import { libraryDto } from '../../library/queries.js';

const FILE = /^[0-9a-f]{20}\.webp$/;

export function registerEnhanceRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, config, deps } = ctx;
  const secret = config.sessionSecret || 'zenport-dev-secret';
  const dataDir = config.dataDir;

  const admin = (req: FastifyRequest, reply: FastifyReply) => {
    if (req.user!.role !== 'admin') {
      void reply.code(403).send({ error: 'admin only' });
      return false;
    }
    return true;
  };
  const enhanceCtx = (userId: number): EnhanceCtx | null => {
    const target = targetFor(db, secret, userId);
    return target ? { db, config, ai: deps.ai, target, dataDir } : null;
  };
  const fail = (err: unknown, reply: FastifyReply) => {
    if (err instanceof AiError) return reply.code(err.status).send({ error: err.message });
    if (err instanceof ImageFetchError)
      return reply.code(400).send({ error: `That picture could not be used: ${err.message}.` });
    if (err instanceof Error && err.name === 'TimeoutError') {
      return reply.code(504).send({ error: 'The AI took too long to answer. Try again.' });
    }
    throw err;
  };

  app.get('/api/ai/library/status', async (req, reply) => {
    if (!admin(req, reply)) return;
    const target = targetFor(db, secret, req.user!.id);
    const items = libraryDto(db, config, req.user!.id).items.filter((i) => !i.missing);
    const counts = db
      .prepare(
        "SELECT kind, COUNT(*) AS n FROM ai_suggestions WHERE status = 'pending' GROUP BY kind",
      )
      .all() as { kind: string; n: number }[];
    return {
      canUse: !!target,
      webSearch: target ? WEB_SEARCH[target.provider] : false,
      items: items.length,
      batches: Math.max(1, Math.ceil(items.length / FIX_BATCH)),
      pending: Object.fromEntries(counts.map((c) => [c.kind, c.n])),
      aboutIds: (db.prepare('SELECT item_id FROM item_about').all() as { item_id: string }[]).map(
        (r) => r.item_id,
      ),
    } satisfies EnhanceStatusDto;
  });

  app.post('/api/ai/library/fixes', async (req, reply) => {
    if (!admin(req, reply)) return;
    const body = z.object({ batch: z.number().int().min(1).max(1000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'batch required' });
    const c = enhanceCtx(req.user!.id);
    if (!c) return reply.code(400).send({ error: 'Set up AI first.' });
    try {
      return await runFixes(c, req.user!.id, body.data.batch);
    } catch (err) {
      return fail(err, reply);
    }
  });

  app.post('/api/ai/library/about', async (req, reply) => {
    if (!admin(req, reply)) return;
    const body = z
      .object({ itemIds: z.array(z.string().min(1).max(64)).min(1).max(6) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'choose up to six recordings' });
    const c = enhanceCtx(req.user!.id);
    if (!c) return reply.code(400).send({ error: 'Set up AI first.' });
    try {
      return await runAbout(c, req.user!.id, body.data.itemIds);
    } catch (err) {
      return fail(err, reply);
    }
  });

  app.post('/api/ai/library/creator-images', async (req, reply) => {
    if (!admin(req, reply)) return;
    const body = z
      .object({ names: z.array(z.string().min(1).max(200)).min(1).max(4) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'choose up to four creators' });
    const c = enhanceCtx(req.user!.id);
    if (!c) return reply.code(400).send({ error: 'Set up AI first.' });
    try {
      return await runCreatorImages(c, req.user!.id, body.data.names);
    } catch (err) {
      return fail(err, reply);
    }
  });

  app.get('/api/ai/library/suggestions', async (req, reply) => {
    if (!admin(req, reply)) return;
    const q = req.query as { status?: string };
    const status = q.status === 'applied' || q.status === 'dismissed' ? q.status : 'pending';
    return listSuggestions(db, config, status);
  });

  app.post('/api/ai/library/suggestions/:id/apply', async (req, reply) => {
    if (!admin(req, reply)) return;
    try {
      await applySuggestion(db, config, dataDir, Number((req.params as { id: string }).id));
      return { ok: true };
    } catch (err) {
      return fail(err, reply);
    }
  });

  app.post('/api/ai/library/suggestions/:id/dismiss', async (req, reply) => {
    if (!admin(req, reply)) return;
    await dismissSuggestion(db, dataDir, Number((req.params as { id: string }).id));
    return { ok: true };
  });

  // Several at once ("apply all high-confidence"); stops at nothing - a
  // suggestion that cannot apply any more is simply left open.
  app.post('/api/ai/library/suggestions/apply', async (req, reply) => {
    if (!admin(req, reply)) return;
    const body = z
      .object({ ids: z.array(z.number().int().positive()).min(1).max(500) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'ids required' });
    let applied = 0;
    for (const id of body.data.ids) {
      try {
        await applySuggestion(db, config, dataDir, id);
        applied++;
      } catch {
        /* left open */
      }
    }
    return { ok: true, applied };
  });

  app.put('/api/creators/:name/image', async (req, reply) => {
    if (!admin(req, reply)) return;
    const body = z.object({ url: z.string().min(8).max(1000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'an image address is needed' });
    try {
      await setCreatorImage(
        db,
        dataDir,
        decodeURIComponent((req.params as { name: string }).name),
        body.data.url,
      );
      return { ok: true };
    } catch (err) {
      return fail(err, reply);
    }
  });

  app.delete('/api/creators/:name/image', async (req, reply) => {
    if (!admin(req, reply)) return;
    removeCreatorImage(db, decodeURIComponent((req.params as { name: string }).name));
    return { ok: true };
  });

  const serve = async (reply: FastifyReply, file: string, dir: string) => {
    if (!FILE.test(file)) return reply.code(404).send({ error: 'not found' });
    const abs = path.join(dir, file);
    try {
      await stat(abs);
    } catch {
      return reply.code(404).send({ error: 'not found' });
    }
    return reply
      .header('Content-Type', 'image/webp')
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .send(createReadStream(abs));
  };
  app.get('/api/media/creator/:file', async (req, reply) =>
    serve(reply, (req.params as { file: string }).file, path.join(dataDir, 'creators')),
  );
  app.get('/api/media/creator-candidate/:file', async (req, reply) => {
    if (!admin(req, reply)) return;
    return serve(
      reply,
      (req.params as { file: string }).file,
      path.join(dataDir, 'creators', 'candidates'),
    );
  });
}
