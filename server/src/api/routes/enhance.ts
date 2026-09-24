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
import type { EnhanceStatusDto, EnhanceStepKey } from '@zenport/shared';
import type { AppContext } from '../../context.js';
import {
  FIX_BATCH,
  LEVEL_BATCH,
  fixCandidates,
  levelCandidates,
  runLevels,
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
import { setLevels, setSeriesStructure, setStructures } from '../../library/levels.js';
import { jobState, startJob } from '../../ai/job.js';
import { startOver } from '../../library/reset.js';
import { isScanning, onScanned, startScan } from '../../scanner/coordinator.js';

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
      // What a run would send: only what is still unread or changed.
      batches: Math.ceil(fixCandidates(db, config, req.user!.id).length / FIX_BATCH),
      levelBatches: Math.ceil(levelCandidates(db, config, req.user!.id).length / LEVEL_BATCH),
      levels: {
        set: items.filter((i) => i.level).length,
        byName: items.filter((i) => i.levelSource === 'name').length,
        byAi: items.filter((i) => i.levelSource === 'ai').length,
        byYou: items.filter((i) => i.levelSource === 'manual').length,
      },
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

  app.post('/api/ai/library/levels', async (req, reply) => {
    if (!admin(req, reply)) return;
    const body = z.object({ batch: z.number().int().min(1).max(1000) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'batch required' });
    const c = enhanceCtx(req.user!.id);
    if (!c) return reply.code(400).send({ error: 'Set up AI first.' });
    try {
      return await runLevels(c, req.user!.id, body.data.batch);
    } catch (err) {
      return fail(err, reply);
    }
  });

  // An admin's level for recordings (a series at once, too); null gives it back.
  app.put('/api/admin/items/level', async (req, reply) => {
    if (!admin(req, reply)) return;
    const body = z
      .object({
        ids: z.array(z.string().min(1).max(64)).min(1).max(500),
        level: z.enum(['beginner', 'intermediate', 'advanced', 'all']).nullable(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'ids and level required' });
    setLevels(db, body.data.ids, body.data.level);
    return { ok: true };
  });

  app.put('/api/admin/items/structure', async (req, reply) => {
    if (!admin(req, reply)) return;
    const body = z
      .object({
        ids: z.array(z.string().min(1).max(64)).min(1).max(500),
        structure: z.enum(['programme', 'pack']).nullable(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'ids and structure required' });
    setStructures(db, body.data.ids, body.data.structure);
    return { ok: true };
  });

  app.put('/api/admin/series/structure', async (req, reply) => {
    if (!admin(req, reply)) return;
    const body = z
      .object({
        creator: z.string().min(1).max(200),
        collection: z.string().min(1).max(400),
        structure: z.enum(['programme', 'pack']).nullable(),
      })
      .safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'creator, collection and structure required' });
    setSeriesStructure(db, body.data.creator, body.data.collection, body.data.structure);
    return { ok: true };
  });

  // Everything at once, on the server (onboarding; Admin can run it again).
  app.post('/api/ai/library/job', async (req, reply) => {
    if (!admin(req, reply)) return;
    const body = z
      .object({
        steps: z
          .array(z.enum(['levels', 'pictures', 'fixes', 'about']))
          .min(1)
          .max(4),
        apply: z.boolean(),
        aboutLimit: z.number().int().min(1).max(120).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Choose what to enhance.' });
    const c = enhanceCtx(req.user!.id);
    if (!c) return reply.code(400).send({ error: 'Set up AI first.' });
    const needsSearch = body.data.steps.some((s) => s === 'pictures' || s === 'about');
    if (needsSearch && !WEB_SEARCH[c.target.provider]) {
      return reply.code(400).send({
        error: 'Pictures and descriptions need a provider that can search the web.',
      });
    }
    return startJob(c, req.user!.id, body.data);
  });

  // Start the library over: forget how it was read (and what the AI made of
  // it), read it afresh, and - if asked - let the AI go through it again.
  app.post('/api/admin/library/start-over', async (req, reply) => {
    if (!admin(req, reply)) return;
    const body = z
      .object({
        keepCorrections: z.boolean(),
        enhance: z
          .object({
            steps: z
              .array(z.enum(['levels', 'pictures', 'fixes', 'about']))
              .min(1)
              .max(4),
            apply: z.boolean(),
            aboutLimit: z.number().int().min(1).max(120).optional(),
          })
          .nullable(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Choose how to start over.' });
    if (isScanning() || jobState()?.running) {
      return reply.code(409).send({
        error: 'The library is being read or enhanced right now - try again when it is done.',
      });
    }
    const { backup, idHints } = startOver(db, dataDir, {
      keepCorrections: body.data.keepCorrections,
    });
    req.log.info({ backup }, 'library started over');
    void startScan(db, config, (err) => req.log.error(err, 'fresh scan failed'), idHints);
    let aiStarted = false;
    const c = body.data.enhance ? enhanceCtx(req.user!.id) : null;
    if (c && body.data.enhance) {
      const needsSearch = body.data.enhance.steps.some((s) => s === 'pictures' || s === 'about');
      const steps =
        needsSearch && !WEB_SEARCH[c.target.provider]
          ? body.data.enhance.steps.filter((s) => s !== 'pictures' && s !== 'about')
          : body.data.enhance.steps;
      if (steps.length > 0) {
        // It waits for the fresh scan to finish before it starts.
        startJob(c, req.user!.id, { ...body.data.enhance, steps });
        aiStarted = true;
      }
    }
    return { ok: true, backup, aiStarted };
  });

  // Keeping it organized: after a scan that brought new recordings, the
  // admin's AI sets their levels, finds pictures for new creators and writes
  // a few descriptions - on its own, unless switched off. Not during the
  // welcome (that has its own step), and never over a run already going.
  const autoOn = () =>
    (
      db.prepare("SELECT value FROM app_settings WHERE key = 'auto_enhance'").get() as
        { value: string } | undefined
    )?.value !== '0';
  const stopListening = onScanned(({ startedAt }) => {
    if (!autoOn() || jobState()?.running) return;
    const admin = db
      .prepare(
        `SELECT u.id FROM users u JOIN ai_active a ON a.user_id = u.id
         JOIN user_prefs p ON p.user_id = u.id
         WHERE u.role = 'admin' AND p.onboarded_at IS NOT NULL ORDER BY u.id LIMIT 1`,
      )
      .get() as { id: number } | undefined;
    if (!admin) return;
    const fresh = (
      db
        .prepare('SELECT id FROM items WHERE missing = 0 AND excluded = 0 AND added_at >= ?')
        .all(startedAt) as { id: string }[]
    ).map((r) => r.id);
    if (fresh.length === 0) return;
    const c = enhanceCtx(admin.id);
    if (!c) return;
    const steps: EnhanceStepKey[] = WEB_SEARCH[c.target.provider]
      ? ['levels', 'pictures', 'about']
      : ['levels'];
    startJob(c, admin.id, { steps, apply: true, aboutLimit: 12, only: fresh });
    app.log.info({ recordings: fresh.length }, 'organizing new recordings');
  });
  app.addHook('onClose', async () => stopListening());

  app.get('/api/admin/auto-enhance', async (req, reply) => {
    if (!admin(req, reply)) return;
    return { on: autoOn() };
  });

  app.put('/api/admin/auto-enhance', async (req, reply) => {
    if (!admin(req, reply)) return;
    const body = z.object({ on: z.boolean() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'on required' });
    db.prepare(
      `INSERT INTO app_settings (key, value) VALUES ('auto_enhance', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    ).run(body.data.on ? '1' : '0');
    return { on: body.data.on };
  });

  app.get('/api/ai/library/job', async (req, reply) => {
    if (!admin(req, reply)) return;
    return jobState();
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
