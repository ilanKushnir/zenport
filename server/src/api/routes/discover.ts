/**
 * Discover (any signed-in person with an AI that can search the web):
 * search, list what was found, save or unsave, forget a search.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DISCOVER_KINDS, type DiscoverDto, type DiscoverKind } from '@zenport/shared';
import type { AppContext } from '../../context.js';
import { targetFor } from '../../ai/connection.js';
import {
  DISCOVER_SCHEMA,
  DISCOVER_SYSTEM,
  deleteRun,
  discoverContext,
  listDiscover,
  resolveDiscover,
  saveRun,
} from '../../ai/discover.js';
import { checkLinks } from '../../ai/links.js';
import { AiError, WEB_SEARCH } from '../../ai/providers.js';
import { libraryDto } from '../../library/queries.js';

const KIND_IDS = DISCOVER_KINDS.map((k) => k.id) as [DiscoverKind, ...DiscoverKind[]];

export function registerDiscoverRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, config, deps } = ctx;
  const secret = config.sessionSecret || 'zenport-dev-secret';
  const check = deps.checkLinks ?? checkLinks;

  const state = (userId: number): DiscoverDto => {
    const target = targetFor(db, secret, userId);
    return {
      canUse: !!target,
      webSearch: target ? WEB_SEARCH[target.provider] : false,
      ...listDiscover(db, userId),
    };
  };

  app.get('/api/ai/discover', async (req) => state(req.user!.id));

  app.post('/api/ai/discover', async (req, reply) => {
    const body = z
      .object({
        kinds: z.array(z.enum(KIND_IDS)).min(1).max(KIND_IDS.length),
        note: z.string().max(600).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Choose what to look for.' });
    const userId = req.user!.id;
    const target = targetFor(db, secret, userId);
    if (!target) return reply.code(400).send({ error: 'Set up AI first.' });
    if (!WEB_SEARCH[target.provider]) {
      return reply.code(400).send({
        error: 'Discover needs a provider that can search the web - not your own server.',
      });
    }
    const kinds = [...new Set(body.data.kinds)];
    const note = body.data.note?.trim() || null;
    const items = libraryDto(db, config, userId).items.filter((i) => !i.missing);
    try {
      const raw = await deps.ai.chatJson(target, {
        system: DISCOVER_SYSTEM,
        user: discoverContext(db, items, userId, kinds, note),
        schemaName: 'zenport_discover',
        schema: DISCOVER_SCHEMA as unknown as Record<string, unknown>,
        webSearch: true,
      });
      const found = resolveDiscover(raw, kinds);
      const live = await check(found.map((f) => f.url));
      const kept = found.filter((f) => live.get(f.url));
      if (kept.length === 0) {
        return reply.code(502).send({
          error: found.length
            ? 'None of the links the AI found would open. Try again.'
            : 'The AI found nothing this time. Try again, or ask for something broader.',
        });
      }
      const runId = saveRun(db, userId, kinds, note, target.model, kept);
      const run = listDiscover(db, userId).runs.find((r) => r.id === runId)!;
      return { ...run, dropped: found.length - kept.length };
    } catch (err) {
      if (err instanceof AiError) return reply.code(err.status).send({ error: err.message });
      if (err instanceof Error && err.name === 'TimeoutError') {
        return reply
          .code(504)
          .send({ error: 'The AI took too long to answer. Try again, or pick a faster model.' });
      }
      throw err;
    }
  });

  app.put('/api/ai/discover/items/:id', async (req, reply) => {
    const body = z.object({ saved: z.boolean() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'saved required' });
    const id = Number((req.params as { id: string }).id);
    const row = db
      .prepare('SELECT run_id FROM discover_items WHERE id = ? AND user_id = ?')
      .get(id, req.user!.id) as { run_id: number | null } | undefined;
    if (!row) return reply.code(404).send({ error: 'not found' });
    // Unsaved, and its search already forgotten: nothing left to keep it for.
    if (!body.data.saved && row.run_id === null) {
      db.prepare('DELETE FROM discover_items WHERE id = ?').run(id);
    } else {
      db.prepare('UPDATE discover_items SET saved = ? WHERE id = ?').run(
        body.data.saved ? 1 : 0,
        id,
      );
    }
    return { ok: true };
  });

  app.delete('/api/ai/discover/runs/:id', async (req, reply) => {
    const ok = deleteRun(db, req.user!.id, Number((req.params as { id: string }).id));
    if (!ok) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });
}
