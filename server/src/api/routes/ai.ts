/**
 * An account's own AI key, and planning with it.
 *
 * The key is validated against OpenAI when saved, stored encrypted, and never
 * returned - the settings answer says only that one is set and how it ends.
 * Planning sends the library catalogue (titles, creators, lengths, lesson
 * names) to OpenAI with that key, only when the person asks for a plan.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AiSettingsDto } from '@zenport/shared';
import type { AppContext } from '../../context.js';
import { AiError, chatModels } from '../../ai/openai.js';
import {
  PLAN_SCHEMA,
  buildCatalog,
  planPrompt,
  practiceHistory,
  renderCatalog,
  resolveProposal,
} from '../../ai/planner.js';
import { openSecret, sealSecret } from '../../ai/secret.js';
import { libraryDto } from '../../library/queries.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

const planRequest = z.object({
  goal: z.string().max(1200).default(''),
  weeks: z.number().int().min(1).max(52).nullable(),
  untilComplete: z.boolean().default(false),
  approach: z.enum(['together', 'learn-first', 'alternate', 'ai']).default('together'),
  startDate: z.string().regex(DATE),
  practice: z
    .object({
      daysPerWeek: z.number().int().min(1).max(7),
      minutes: z.number().int().min(1).max(180),
    })
    .nullable(),
  learning: z
    .object({
      minutesPerWeek: z.number().int().min(10).max(1800),
      daysPerWeek: z.number().int().min(1).max(7),
    })
    .nullable(),
  timeOfDay: z.enum(['morning', 'midday', 'evening', 'any']).default('any'),
  level: z.enum(['new', 'some', 'experienced']).default('some'),
  creators: z.array(z.string().max(200)).max(50).default([]),
  includeFinished: z.boolean().default(false),
});

interface Row {
  api_key_enc: string;
  key_hint: string;
  model: string;
}

export function registerAiRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, config, deps } = ctx;
  const secret = config.sessionSecret || 'zenport-dev-secret';
  // Models per key are cached briefly so the settings page is not a round trip.
  const modelCache = new Map<number, { at: number; models: string[] }>();

  const row = (userId: number) =>
    db
      .prepare('SELECT api_key_enc, key_hint, model FROM ai_settings WHERE user_id = ?')
      .get(userId) as Row | undefined;

  /** The owner's key, when they have chosen to share it with everyone here. */
  const sharedKey = (): { userId: number; name: string } | null => {
    const v = db.prepare("SELECT value FROM app_settings WHERE key = 'ai_shared_by'").get() as
      { value: string } | undefined;
    if (!v) return null;
    const owner = db
      .prepare(
        `SELECT u.id, COALESCE(u.display_name, u.username) AS name FROM users u
         JOIN ai_settings a ON a.user_id = u.id WHERE u.id = ? AND u.role = 'admin'`,
      )
      .get(Number(v.value)) as { id: number; name: string } | undefined;
    return owner ? { userId: owner.id, name: owner.name } : null;
  };

  const send = (
    err: unknown,
    reply: { code: (n: number) => { send: (b: unknown) => unknown } },
  ) => {
    if (err instanceof AiError) return reply.code(err.status).send({ error: err.message });
    if (err instanceof Error && err.name === 'TimeoutError') {
      return reply
        .code(504)
        .send({ error: 'OpenAI took too long to answer. Try again, or pick a faster model.' });
    }
    throw err;
  };

  app.get('/api/ai/settings', async (req): Promise<AiSettingsDto> => {
    const r = row(req.user!.id);
    const shared = sharedKey();
    if (!r) {
      return {
        configured: false,
        keyHint: null,
        model: null,
        models: [],
        sharedBy: shared && shared.userId !== req.user!.id ? shared.name : null,
      };
    }
    return {
      configured: true,
      keyHint: r.key_hint,
      model: r.model,
      models: modelCache.get(req.user!.id)?.models ?? [r.model],
      sharing: req.user!.role === 'admin' ? shared?.userId === req.user!.id : undefined,
    };
  });

  // The owner may let everyone on this ZenPort plan with their key. The key
  // itself is never shown to anyone; members only learn that planning works.
  app.put('/api/ai/sharing', async (req, reply) => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const body = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'enabled required' });
    if (body.data.enabled) {
      if (!row(req.user!.id)) return reply.code(400).send({ error: 'Add your key first.' });
      db.prepare(
        `INSERT INTO app_settings (key, value) VALUES ('ai_shared_by', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(String(req.user!.id));
    } else {
      db.prepare("DELETE FROM app_settings WHERE key = 'ai_shared_by'").run();
    }
    return { ok: true };
  });

  app.put('/api/ai/settings', async (req, reply) => {
    const body = z
      .object({
        apiKey: z.string().min(20).max(400).optional(),
        model: z.string().max(80).optional(),
      })
      .safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'That does not look like an API key.' });
    const existing = row(req.user!.id);
    const key =
      body.data.apiKey?.trim() ?? (existing ? openSecret(existing.api_key_enc, secret) : null);
    if (!key) return reply.code(400).send({ error: 'Add an API key first.' });
    let models: string[];
    try {
      models = chatModels(await deps.openai.listModels(key));
    } catch (err) {
      return send(err, reply);
    }
    if (models.length === 0)
      return reply.code(400).send({ error: 'This key cannot use any chat model.' });
    const model =
      body.data.model && models.includes(body.data.model)
        ? body.data.model
        : existing?.model && models.includes(existing.model)
          ? existing.model
          : models[0]!;
    db.prepare(
      `INSERT INTO ai_settings (user_id, api_key_enc, key_hint, model, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET api_key_enc = excluded.api_key_enc, key_hint = excluded.key_hint,
         model = excluded.model, updated_at = excluded.updated_at`,
    ).run(
      req.user!.id,
      sealSecret(key, secret),
      `…${key.slice(-4)}`,
      model,
      new Date().toISOString(),
    );
    modelCache.set(req.user!.id, { at: Date.now(), models });
    return {
      configured: true,
      keyHint: `…${key.slice(-4)}`,
      model,
      models,
    } satisfies AiSettingsDto;
  });

  app.delete('/api/ai/settings', async (req) => {
    db.prepare('DELETE FROM ai_settings WHERE user_id = ?').run(req.user!.id);
    modelCache.delete(req.user!.id);
    return { ok: true };
  });

  app.post('/api/ai/plan', async (req, reply) => {
    const body = planRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'The plan request is incomplete.' });
    if (!body.data.practice && !body.data.learning) {
      return reply.code(400).send({ error: 'Choose practice, learning, or both.' });
    }
    const shared = sharedKey();
    const r = row(req.user!.id) ?? (shared ? row(shared.userId) : undefined);
    const key = r ? openSecret(r.api_key_enc, secret) : null;
    if (!r || !key)
      return reply.code(400).send({ error: 'Add your OpenAI key in Settings first.' });

    const lib = libraryDto(db, config, req.user!.id);
    const wanted = body.data.creators.length ? new Set(body.data.creators) : null;
    const entries = buildCatalog(
      db,
      lib.items.filter((i) => !wanted || wanted.has(i.creator)),
      req.user!.id,
    );
    const history = practiceHistory(db, req.user!.id, req.user!.timezone);
    if (entries.length === 0)
      return reply.code(400).send({ error: 'There is nothing in the library to plan with.' });
    const { system, user } = planPrompt(
      body.data,
      renderCatalog(entries, history),
      history.summary,
    );
    try {
      const raw = await deps.openai.chatJson({
        apiKey: key,
        model: r.model,
        system,
        user,
        schemaName: 'zenport_plan',
        schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
      });
      const proposal = resolveProposal(raw, entries, body.data, r.model);
      if (proposal.stages.length === 0) {
        return reply
          .code(502)
          .send({ error: 'The answer did not use anything from your library. Try again.' });
      }
      return proposal;
    } catch (err) {
      return send(err, reply);
    }
  });
}
