/**
 * AI for an account: connecting a provider (OpenAI, Anthropic, Gemini,
 * OpenRouter, or an OpenAI-compatible server), the person's intentions, and
 * planning with them.
 *
 * A key is validated with the provider when connected, stored sealed, and
 * never returned - the settings answer says only which providers are
 * connected and how each key ends. Nothing is sent to any provider except
 * when the person asks for something.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AI_PROVIDERS,
  type AiProvider,
  type AiSettingsDto,
  type IntentionsDto,
} from '@zenport/shared';
import type { AppContext } from '../../context.js';
import { AiError, PROVIDER_NAME } from '../../ai/providers.js';
import {
  activeProvider,
  activeRow,
  connections,
  sharedOwner,
  targetFor,
  toTarget,
} from '../../ai/connection.js';
import {
  intentionsSchema,
  intentionsSummary,
  readIntentions,
  saveIntentions,
} from '../../ai/intentions.js';
import {
  MAX_WEEKS,
  PLAN_SCHEMA,
  buildCatalog,
  ensureMustInclude,
  planPrompt,
  practiceHistory,
  renderCatalog,
  resolveProposal,
} from '../../ai/planner.js';
import { sealSecret } from '../../ai/secret.js';
import { libraryDto } from '../../library/queries.js';
import { expandOccurrences } from '../../plans/occurrences.js';
import { dayKey } from '../../stats/compute.js';
import { isPracticeType } from '@zenport/shared';

interface AdjustPlanRow {
  id: number;
  name: string;
  status: string;
  start_date: string;
  end_date: string | null;
  days_of_week: string;
  meditation_ids: string;
  shifts: string | null;
  focus: string;
  target_minutes: number | null;
  path_name: string | null;
}

/** The day after a date: a reworked path picks up tomorrow, the old plans end today. */
function tomorrow(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PROVIDERS = AI_PROVIDERS.map((p) => p.id) as [AiProvider, ...AiProvider[]];

const planRequest = z.object({
  goal: z.string().max(1200).default(''),
  weeks: z.number().int().min(1).max(MAX_WEEKS).nullable(),
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
  includePlanned: z.boolean().default(false),
  mustInclude: z.array(z.string().min(1).max(64)).max(60).default([]),
});

export function registerAiRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, config, deps } = ctx;
  const secret = config.sessionSecret || 'zenport-dev-secret';
  // Models per connection, cached so the settings page is not a round trip.
  const modelCache = new Map<string, string[]>();
  const cacheKey = (userId: number, p: AiProvider) => `${userId}:${p}`;

  /** Send an AI failure as a readable answer; anything else is a real error. */
  const send = (
    err: unknown,
    reply: { code: (n: number) => { send: (b: unknown) => unknown } },
  ) => {
    if (err instanceof AiError) return reply.code(err.status).send({ error: err.message });
    if (err instanceof Error && err.name === 'TimeoutError') {
      return reply
        .code(504)
        .send({ error: 'The AI took too long to answer. Try again, or pick a faster model.' });
    }
    throw err;
  };

  const settingsFor = (userId: number, role: string): AiSettingsDto => {
    const rows = connections(db, userId);
    const active = activeProvider(db, userId);
    const cur = rows.find((r) => r.provider === active) ?? null;
    const shared = sharedOwner(db);
    return {
      configured: !!cur,
      provider: cur?.provider ?? null,
      keyHint: cur?.key_hint ?? null,
      model: cur?.model ?? null,
      models: cur ? (modelCache.get(cacheKey(userId, cur.provider)) ?? [cur.model]) : [],
      connections: rows.map((r) => ({
        provider: r.provider,
        keyHint: r.key_hint,
        baseUrl: r.base_url,
        model: r.model,
        active: r.provider === active,
      })),
      sharing: role === 'admin' ? shared?.userId === userId : undefined,
      sharedBy: !cur && shared && shared.userId !== userId ? shared.name : null,
      canUse: !!cur || (!!shared && shared.userId !== userId),
    };
  };

  app.get('/api/ai/settings', async (req): Promise<AiSettingsDto> =>
    settingsFor(req.user!.id, req.user!.role),
  );

  /**
   * Connect a provider: check the key with it, keep it sealed, make it the one
   * in use. A provider already connected can be reconnected without pasting
   * its key again (to pick up new models, or a new address).
   */
  const connect = async (
    userId: number,
    role: string,
    input: { provider: AiProvider; apiKey?: string; baseUrl?: string; model?: string },
  ): Promise<AiSettingsDto> => {
    const info = AI_PROVIDERS.find((p) => p.id === input.provider)!;
    if (info.adminOnly && role !== 'admin') {
      throw new AiError('Only an admin can connect a server by its address.', 403);
    }
    const existing = connections(db, userId).find((c) => c.provider === input.provider);
    const kept = existing ? toTarget(existing, secret)?.apiKey : undefined;
    const apiKey = input.apiKey?.trim() || kept || '';
    if (info.needsKey && !apiKey) throw new AiError('Add an API key first.', 400);
    let baseUrl: string | null = null;
    if (info.needsBaseUrl) {
      const raw = (input.baseUrl ?? existing?.base_url ?? '').trim();
      let u: URL;
      try {
        u = new URL(raw);
      } catch {
        throw new AiError(
          'That address does not look right - e.g. http://ollama.lan:11434/v1',
          400,
        );
      }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new AiError('The address must start with http:// or https://', 400);
      }
      baseUrl = raw.replace(/\/+$/, '');
    }
    const models = await deps.ai.listModels({ provider: input.provider, apiKey, baseUrl });
    if (models.length === 0) {
      throw new AiError(`${PROVIDER_NAME[input.provider]} offers no chat model to this key.`, 400);
    }
    // A free-form model name is fine where the list is open-ended.
    const openList = input.provider === 'openrouter' || input.provider === 'compatible';
    const model =
      input.model && (models.includes(input.model) || openList)
        ? input.model
        : existing?.model && models.includes(existing.model)
          ? existing.model
          : models[0]!;
    db.prepare(
      `INSERT INTO ai_keys (user_id, provider, api_key_enc, key_hint, base_url, model, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider) DO UPDATE SET api_key_enc = excluded.api_key_enc,
         key_hint = excluded.key_hint, base_url = excluded.base_url, model = excluded.model,
         updated_at = excluded.updated_at`,
    ).run(
      userId,
      input.provider,
      apiKey ? sealSecret(apiKey, secret) : null,
      apiKey ? `…${apiKey.slice(-4)}` : null,
      baseUrl,
      model,
      new Date().toISOString(),
    );
    db.prepare(
      `INSERT INTO ai_active (user_id, provider) VALUES (?, ?)
       ON CONFLICT(user_id) DO UPDATE SET provider = excluded.provider`,
    ).run(userId, input.provider);
    modelCache.set(cacheKey(userId, input.provider), models);
    return settingsFor(userId, role);
  };

  app.post('/api/ai/connect', async (req, reply) => {
    const body = z
      .object({
        provider: z.enum(PROVIDERS),
        apiKey: z.string().max(400).optional(),
        baseUrl: z.string().max(400).optional(),
        model: z.string().max(160).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Choose a provider.' });
    try {
      return await connect(req.user!.id, req.user!.role, body.data);
    } catch (err) {
      return send(err, reply);
    }
  });

  // Choose the model, or switch to another connected provider. (Still takes
  // an OpenAI key directly, as the first version did.)
  app.put('/api/ai/settings', async (req, reply) => {
    const body = z
      .object({
        apiKey: z.string().min(20).max(400).optional(),
        model: z.string().max(160).optional(),
        provider: z.enum(PROVIDERS).optional(),
      })
      .safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'That does not look like an API key.' });
    const userId = req.user!.id;
    try {
      if (body.data.apiKey) {
        return await connect(userId, req.user!.role, {
          provider: body.data.provider ?? 'openai',
          apiKey: body.data.apiKey,
          model: body.data.model,
        });
      }
      const provider = body.data.provider ?? activeProvider(db, userId);
      const row = connections(db, userId).find((c) => c.provider === provider);
      if (!provider || !row) return reply.code(400).send({ error: 'Connect a provider first.' });
      if (body.data.model) {
        const known = modelCache.get(cacheKey(userId, provider));
        const openList = provider === 'openrouter' || provider === 'compatible';
        if (known && !known.includes(body.data.model) && !openList) {
          return reply.code(400).send({ error: 'That model is not offered to this key.' });
        }
        db.prepare('UPDATE ai_keys SET model = ? WHERE user_id = ? AND provider = ?').run(
          body.data.model,
          userId,
          provider,
        );
      }
      db.prepare(
        `INSERT INTO ai_active (user_id, provider) VALUES (?, ?)
         ON CONFLICT(user_id) DO UPDATE SET provider = excluded.provider`,
      ).run(userId, provider);
      if (!modelCache.has(cacheKey(userId, provider))) {
        const t = toTarget(row, secret);
        if (t) {
          modelCache.set(
            cacheKey(userId, provider),
            await deps.ai.listModels(t).catch(() => [row.model]),
          );
        }
      }
      return settingsFor(userId, req.user!.role);
    } catch (err) {
      return send(err, reply);
    }
  });

  /** Forget one provider's key; if it was in use, the next connected one takes over. */
  const disconnect = (userId: number, provider: AiProvider) => {
    db.prepare('DELETE FROM ai_keys WHERE user_id = ? AND provider = ?').run(userId, provider);
    modelCache.delete(cacheKey(userId, provider));
    if (activeProvider(db, userId) === provider) {
      const next = connections(db, userId)[0];
      if (next) {
        db.prepare('UPDATE ai_active SET provider = ? WHERE user_id = ?').run(
          next.provider,
          userId,
        );
      } else {
        db.prepare('DELETE FROM ai_active WHERE user_id = ?').run(userId);
        // An owner who shared their AI and has none left shares nothing.
        db.prepare("DELETE FROM app_settings WHERE key = 'ai_shared_by' AND value = ?").run(
          String(userId),
        );
      }
    }
  };

  app.delete('/api/ai/connections/:provider', async (req, reply) => {
    const p = z.enum(PROVIDERS).safeParse((req.params as { provider: string }).provider);
    if (!p.success) return reply.code(400).send({ error: 'unknown provider' });
    disconnect(req.user!.id, p.data);
    return settingsFor(req.user!.id, req.user!.role);
  });

  app.delete('/api/ai/settings', async (req) => {
    const p = activeProvider(db, req.user!.id);
    if (p) disconnect(req.user!.id, p);
    return { ok: true };
  });

  // The owner may let everyone on this ZenPort use their AI. The key itself
  // is never shown to anyone; members only learn that AI features work.
  app.put('/api/ai/sharing', async (req, reply) => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const body = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'enabled required' });
    if (body.data.enabled) {
      if (!activeRow(db, req.user!.id)) {
        return reply.code(400).send({ error: 'Connect a provider first.' });
      }
      db.prepare(
        `INSERT INTO app_settings (key, value) VALUES ('ai_shared_by', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ).run(String(req.user!.id));
    } else {
      db.prepare("DELETE FROM app_settings WHERE key = 'ai_shared_by'").run();
    }
    return { ok: true };
  });

  // ── Intentions ──
  app.get('/api/me/intentions', async (req): Promise<IntentionsDto | null> =>
    readIntentions(db, req.user!.id),
  );
  app.put('/api/me/intentions', async (req, reply) => {
    const body = intentionsSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Those answers are not complete.' });
    saveIntentions(db, req.user!.id, body.data);
    return readIntentions(db, req.user!.id);
  });

  app.post('/api/ai/plan', async (req, reply) => {
    const body = planRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'The plan request is incomplete.' });
    if (!body.data.practice && !body.data.learning) {
      return reply.code(400).send({ error: 'Choose practice, learning, or both.' });
    }
    const target = targetFor(db, secret, req.user!.id);
    if (!target) return reply.code(400).send({ error: 'Set up AI first.' });

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
    // What this person already has scheduled: current and upcoming plans.
    const planned = new Map<string, string[]>();
    const today = new Date().toISOString().slice(0, 10);
    for (const p of db
      .prepare(
        `SELECT name, meditation_ids FROM plans
         WHERE user_id = ? AND status != 'ended' AND (end_date IS NULL OR end_date >= ?)`,
      )
      .all(req.user!.id, today) as { name: string; meditation_ids: string }[]) {
      for (const id of JSON.parse(p.meditation_ids) as string[]) {
        planned.set(id, [...(planned.get(id) ?? []), p.name]);
      }
    }
    const must = new Set(body.data.mustInclude);
    const { system, user } = planPrompt(
      body.data,
      renderCatalog(entries, history, planned, must),
      history.summary,
      intentionsSummary(readIntentions(db, req.user!.id)),
    );
    try {
      const ask = (extra = '') =>
        deps.ai.chatJson(target, {
          system,
          user: user + extra,
          schemaName: 'zenport_plan',
          schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
        });
      const resolve = (raw: unknown) =>
        resolveProposal(raw, entries, body.data, target.model, new Set(planned.keys()));
      let proposal = resolve(await ask());
      // Everything the person said must be in it: one more try with a plain
      // reminder, then ZenPort places whatever is still missing itself.
      const left = () => {
        const got = new Set(proposal.stages.flatMap((s) => s.items.map((i) => i.id)));
        return entries.filter((e) => must.has(e.item.id) && !got.has(e.item.id));
      };
      if (left().length > 0) {
        const names = left()
          .map((e) => `${e.handle} (${e.item.title})`)
          .join(', ');
        proposal = resolve(
          await ask(
            `\n\nYour previous answer left out items marked [must include]: ${names}. Include every one of them this time, in the right place in the order.`,
          ),
        );
      }
      proposal = ensureMustInclude(proposal, entries, [...must], body.data);
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

  // ── Rework the rest of a path from how it went ──
  const adjustRequest = z.object({
    planIds: z.array(z.number().int().positive()).min(1).max(20),
    note: z.string().max(1200).default(''),
    practice: z
      .object({
        daysPerWeek: z.number().int().min(1).max(7),
        minutes: z.number().int().min(1).max(180),
      })
      .nullish(),
    learning: z
      .object({
        minutesPerWeek: z.number().int().min(10).max(1800),
        daysPerWeek: z.number().int().min(1).max(7),
      })
      .nullish(),
  });

  app.post('/api/ai/plan/adjust', async (req, reply) => {
    const body = adjustRequest.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Choose the plans to adjust.' });
    const target = targetFor(db, secret, req.user!.id);
    if (!target) return reply.code(400).send({ error: 'Set up AI first.' });
    const userId = req.user!.id;
    const rows = db
      .prepare(
        `SELECT * FROM plans WHERE user_id = ? AND id IN (${body.data.planIds.map(() => '?').join(', ')})
         ORDER BY COALESCE(path_step, 0), start_date`,
      )
      .all(userId, ...body.data.planIds) as unknown as AdjustPlanRow[];
    if (rows.length === 0) return reply.code(404).send({ error: 'plan not found' });

    const today = dayKey(new Date().toISOString(), req.user!.timezone);
    const lib = libraryDto(db, config, userId);
    const entries = buildCatalog(db, lib.items, userId);
    const handleOf = new Map(entries.map((e) => [e.item.id, e]));
    const history = practiceHistory(db, userId, req.user!.timezone);

    // The path as it stands, and how it has gone so far.
    const lines: string[] = ['The path so far, and how it went:'];
    const inPath = new Set<string>();
    const unfinishedLearning: string[] = [];
    let practicePace: { daysPerWeek: number; minutes: number } | null = null;
    let learningPace: { minutesPerWeek: number; daysPerWeek: number } | null = null;
    for (const row of rows) {
      const days = JSON.parse(row.days_of_week) as number[];
      const ids = JSON.parse(row.meditation_ids) as string[];
      const occ = expandOccurrences(
        {
          id: row.id,
          name: row.name,
          status: row.status as 'active',
          startDate: row.start_date,
          endDate: row.end_date,
          daysOfWeek: days,
          meditationIds: ids,
          shifts: JSON.parse(row.shifts ?? '[]'),
        },
        (
          db
            .prepare(
              'SELECT date, status, moved_to, moved_from, session_id FROM plan_entries WHERE plan_id = ?',
            )
            .all(row.id) as {
            date: string;
            status: 'completed' | 'skipped' | null;
            moved_to: string | null;
            moved_from: string | null;
            session_id: number | null;
          }[]
        ).map((e) => ({
          date: e.date,
          status: e.status,
          movedTo: e.moved_to,
          movedFrom: e.moved_from,
          sessionId: e.session_id,
        })),
        today,
        0,
      ).filter((o) => o.date <= today);
      const count = (st: string) => occ.filter((o) => o.status === st).length;
      const focus = row.focus === 'learning' ? 'learning' : 'practice';
      if (focus === 'practice' && !practicePace) {
        practicePace = {
          daysPerWeek: Math.max(1, days.length || 7),
          minutes: row.target_minutes ?? 20,
        };
      }
      if (focus === 'learning' && !learningPace) {
        const d = Math.max(1, days.length || 2);
        learningPace = {
          daysPerWeek: d,
          minutesPerWeek: Math.max(10, (row.target_minutes ?? 30) * d),
        };
      }
      lines.push(
        `- ${focus === 'learning' ? 'Learning' : 'Practice'} stage "${row.name}", ${row.start_date} to ${row.end_date ?? 'open'}${row.start_date > today ? ' (not started)' : ''}: ${count('completed')} sessions done, ${count('missed')} missed, ${count('skipped')} skipped so far.`,
      );
      for (const id of ids) {
        const e = handleOf.get(id);
        if (!e) continue;
        inPath.add(id);
        const i = e.item;
        const finished = i.trackCount > 0 && i.completedCount >= i.trackCount;
        const state = finished
          ? 'finished'
          : i.completedCount > 0
            ? `part-way, ${i.completedCount}/${i.trackCount} done`
            : 'not started';
        lines.push(`    ${e.handle} ${i.title} - ${state}`);
        if (!isPracticeType(i.type) && !finished) unfinishedLearning.push(id);
      }
    }

    const startDate = tomorrow(today);
    const request = {
      goal: body.data.note.trim()
        ? `Rework the rest of my path. What changed: ${body.data.note.trim()}`
        : 'Rework the rest of my path so it fits how it has actually gone.',
      weeks: null,
      untilComplete: true,
      approach: 'ai' as const,
      startDate,
      practice: body.data.practice === undefined ? practicePace : body.data.practice,
      learning: body.data.learning === undefined ? learningPace : body.data.learning,
      timeOfDay: 'any' as const,
      level: 'some' as const,
      creators: [],
      includeFinished: false,
      includePlanned: true,
      mustInclude: unfinishedLearning,
    };
    if (!request.practice && !request.learning) {
      return reply.code(400).send({ error: 'Keep practice, learning, or both.' });
    }
    const must = new Set(unfinishedLearning);
    const { system, user } = planPrompt(
      request,
      renderCatalog(entries, history, undefined, must),
      history.summary,
      intentionsSummary(readIntentions(db, userId)),
    );
    const rework = [
      '',
      ...lines,
      '',
      'Rework only what is still ahead, starting ' + startDate + ':',
      '- Leave out what is finished; continue part-way courses from where they are.',
      '- Keep the direction and order of the path unless the note or the progress says otherwise.',
      '- If many sessions were missed, make the pace gentler than before, unless the person asked for more.',
      '- Say in "why" what you changed and why, kindly and without blame.',
    ].join('\n');
    try {
      const raw = await deps.ai.chatJson(target, {
        system,
        user: user + rework,
        schemaName: 'zenport_plan',
        schema: PLAN_SCHEMA as unknown as Record<string, unknown>,
      });
      let proposal = resolveProposal(raw, entries, request, target.model, new Set());
      proposal = ensureMustInclude(proposal, entries, [...must], request);
      if (proposal.stages.length === 0) {
        return reply
          .code(502)
          .send({ error: 'The answer did not use anything from your library. Try again.' });
      }
      return { ...proposal, startDate, name: rows[0]!.path_name ?? rows[0]!.name };
    } catch (err) {
      return send(err, reply);
    }
  });
}
