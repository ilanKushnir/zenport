/**
 * The guide (any signed-in person, with their own AI or a shared one):
 * preview what a review would send, ask for one, and keep or delete the
 * notes it wrote. Notes belong to their owner only.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { GUIDE_PERIODS, type GuideDisclosureDto } from '@zenport/shared';
import type { AppContext } from '../../context.js';
import { targetFor } from '../../ai/connection.js';
import {
  GUIDE_SCHEMA,
  GUIDE_SYSTEM,
  guideContext,
  listNotes,
  resolveGuide,
  saveNote,
} from '../../ai/guide.js';
import { AiError } from '../../ai/providers.js';

const period = z.coerce
  .number()
  .int()
  .refine((n) => (GUIDE_PERIODS as readonly number[]).includes(n));

export function registerGuideRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, config, deps } = ctx;
  const secret = config.sessionSecret || 'zenport-dev-secret';

  app.get('/api/ai/guide/preview', async (req, reply) => {
    const q = z
      .object({ days: period.default(30), journal: z.enum(['0', '1']).default('0') })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'Choose a week, a month or three.' });
    const target = targetFor(db, secret, req.user!.id);
    const c = guideContext(db, config, req.user!, q.data.days, q.data.journal === '1');
    return {
      canUse: !!target,
      provider: target?.provider ?? null,
      model: target?.model ?? null,
      ...c.disclosure,
    } satisfies GuideDisclosureDto;
  });

  app.post('/api/ai/guide', async (req, reply) => {
    const body = z
      .object({
        days: period,
        journal: z.boolean(),
        question: z.string().max(1000).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Choose a week, a month or three.' });
    const target = targetFor(db, secret, req.user!.id);
    if (!target) return reply.code(400).send({ error: 'Set up AI first.' });
    const question = body.data.question?.trim() || null;
    const c = guideContext(db, config, req.user!, body.data.days, body.data.journal);
    try {
      const raw = await deps.ai.chatJson(target, {
        system: GUIDE_SYSTEM,
        user: `${c.text}${question ? `\n\nWhat is on their mind right now: ${question}` : ''}`,
        schemaName: 'zenport_guide',
        schema: GUIDE_SCHEMA as unknown as Record<string, unknown>,
      });
      const note = resolveGuide(raw, c.handles);
      if (!note.summary) {
        return reply.code(502).send({ error: 'The answer came back empty. Try again.' });
      }
      return saveNote(
        db,
        req.user!.id,
        body.data.days,
        body.data.journal,
        question,
        note,
        target.model,
      );
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

  app.get('/api/ai/guide/notes', async (req) => listNotes(db, req.user!.id));

  app.delete('/api/ai/guide/notes/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const res = db
      .prepare('DELETE FROM guide_notes WHERE id = ? AND user_id = ?')
      .run(id, req.user!.id);
    if (res.changes === 0) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });
}
