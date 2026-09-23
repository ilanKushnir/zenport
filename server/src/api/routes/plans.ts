import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PlanDto, PlanFocus, PlanOccurrenceDto } from '@zenport/shared';
import type { AppContext } from '../../context.js';
import { dayKey } from '../../stats/compute.js';
import {
  expandOccurrences,
  type PlanEntryRow,
  type PlanForExpansion,
} from '../../plans/occurrences.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

const planSchema = z.object({
  name: z.string().min(1).max(120),
  intention: z.string().max(500).nullish(),
  startDate: z.string().regex(DATE),
  endDate: z.string().regex(DATE).nullish(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  preferredTime: z.string().regex(TIME).nullish(),
  targetMinutes: z.number().int().min(1).max(600).nullish(),
  notes: z.string().max(2000).nullish(),
  // Ordered: a learning plan follows its items in this order.
  meditationIds: z.array(z.string()).max(400).default([]),
  focus: z.enum(['practice', 'learning']).default('practice'),
  path: z
    .object({ name: z.string().min(1).max(120), step: z.number().int().min(1).max(200) })
    .nullish(),
});

interface PlanRow {
  id: number;
  name: string;
  intention: string | null;
  start_date: string;
  end_date: string | null;
  days_of_week: string;
  preferred_time: string | null;
  target_minutes: number | null;
  notes: string | null;
  status: string;
  meditation_ids: string;
  created_at: string;
  focus: string;
  path_name: string | null;
  path_step: number | null;
}

function toDto(row: PlanRow): PlanDto {
  return {
    id: row.id,
    name: row.name,
    intention: row.intention,
    startDate: row.start_date,
    endDate: row.end_date,
    daysOfWeek: JSON.parse(row.days_of_week),
    preferredTime: row.preferred_time,
    targetMinutes: row.target_minutes,
    notes: row.notes,
    status: row.status as PlanDto['status'],
    focus: row.focus === 'learning' ? 'learning' : 'practice',
    meditationIds: JSON.parse(row.meditation_ids),
    path: row.path_name ? { name: row.path_name, step: row.path_step ?? 1 } : null,
    createdAt: row.created_at,
  };
}

export function registerPlanRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;

  const ownedPlan = (id: number, userId: number): PlanRow | undefined =>
    db.prepare('SELECT * FROM plans WHERE id = ? AND user_id = ?').get(id, userId) as
      PlanRow | undefined;

  app.get('/api/plans', async (req) => {
    const rows = db
      .prepare('SELECT * FROM plans WHERE user_id = ? ORDER BY created_at DESC')
      .all(req.user!.id) as unknown as PlanRow[];
    return rows.map(toDto);
  });

  app.post('/api/plans', async (req, reply) => {
    const body = planSchema.safeParse(req.body);
    if (!body.success)
      return reply.code(400).send({ error: 'plan needs a name and a valid start date' });
    const p = body.data;
    if (p.endDate && p.endDate < p.startDate) {
      return reply.code(400).send({ error: 'the end date is before the start date' });
    }
    const res = db
      .prepare(
        `INSERT INTO plans (user_id, name, intention, start_date, end_date, days_of_week,
           preferred_time, target_minutes, notes, status, meditation_ids, created_at, focus,
           path_name, path_step)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      )
      .run(
        req.user!.id,
        p.name.trim(),
        p.intention ?? null,
        p.startDate,
        p.endDate ?? null,
        JSON.stringify(p.daysOfWeek),
        p.preferredTime ?? null,
        p.targetMinutes ?? null,
        p.notes ?? null,
        JSON.stringify(p.meditationIds),
        new Date().toISOString(),
        p.focus,
        p.path?.name ?? null,
        p.path?.step ?? null,
      );
    return { id: Number(res.lastInsertRowid) };
  });

  app.patch('/api/plans/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!ownedPlan(id, req.user!.id)) return reply.code(404).send({ error: 'plan not found' });
    const body = planSchema
      .partial()
      .extend({ status: z.enum(['active', 'paused', 'ended']).optional() })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid plan update' });
    const p = body.data;
    const sets: string[] = [];
    const vals: unknown[] = [];
    const push = (col: string, val: unknown) => {
      sets.push(`${col} = ?`);
      vals.push(val);
    };
    if (p.name !== undefined) push('name', p.name.trim());
    if (p.intention !== undefined) push('intention', p.intention);
    if (p.startDate !== undefined) push('start_date', p.startDate);
    if (p.endDate !== undefined) push('end_date', p.endDate);
    if (p.daysOfWeek !== undefined) push('days_of_week', JSON.stringify(p.daysOfWeek));
    if (p.preferredTime !== undefined) push('preferred_time', p.preferredTime);
    if (p.targetMinutes !== undefined) push('target_minutes', p.targetMinutes);
    if (p.notes !== undefined) push('notes', p.notes);
    if (p.status !== undefined) push('status', p.status);
    if (p.meditationIds !== undefined) push('meditation_ids', JSON.stringify(p.meditationIds));
    if (p.focus !== undefined) push('focus', p.focus);
    if (sets.length === 0) return { ok: true };
    vals.push(id);
    db.prepare(`UPDATE plans SET ${sets.join(', ')} WHERE id = ?`).run(...(vals as never[]));
    return { ok: true };
  });

  app.delete('/api/plans/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const res = db.prepare('DELETE FROM plans WHERE id = ? AND user_id = ?').run(id, req.user!.id);
    if (res.changes === 0) return reply.code(404).send({ error: 'plan not found' });
    return { ok: true };
  });

  app.get('/api/plans/occurrences', async (req) => {
    const q = req.query as { days?: string };
    const horizon = Math.min(Number(q.days ?? 21) || 21, 60);
    const today = dayKey(new Date().toISOString(), req.user!.timezone);
    const rows = db
      .prepare('SELECT * FROM plans WHERE user_id = ?')
      .all(req.user!.id) as unknown as PlanRow[];
    const all: PlanOccurrenceDto[] = [];
    for (const row of rows) {
      const plan: PlanForExpansion = {
        id: row.id,
        name: row.name,
        status: row.status as PlanForExpansion['status'],
        startDate: row.start_date,
        endDate: row.end_date,
        daysOfWeek: JSON.parse(row.days_of_week),
        meditationIds: JSON.parse(row.meditation_ids),
      };
      const entries = (
        db.prepare('SELECT * FROM plan_entries WHERE plan_id = ?').all(row.id) as {
          date: string;
          status: 'completed' | 'skipped' | null;
          moved_to: string | null;
          moved_from: string | null;
          session_id: number | null;
        }[]
      ).map((e): PlanEntryRow => ({
        date: e.date,
        status: e.status,
        movedTo: e.moved_to,
        movedFrom: e.moved_from,
        sessionId: e.session_id,
      }));
      const focus: PlanFocus = row.focus === 'learning' ? 'learning' : 'practice';
      all.push(...expandOccurrences(plan, entries, today, horizon).map((o) => ({ ...o, focus })));
    }
    all.sort((a, b) => a.date.localeCompare(b.date) || a.planName.localeCompare(b.planName));
    return { today, occurrences: all };
  });

  const entryAction = z.object({ date: z.string().regex(DATE) });

  app.post('/api/plans/:id/complete', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!ownedPlan(id, req.user!.id)) return reply.code(404).send({ error: 'plan not found' });
    const body = entryAction.extend({ sessionId: z.number().int().nullish() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'date required' });
    db.prepare(
      `INSERT INTO plan_entries (plan_id, date, status, session_id) VALUES (?, ?, 'completed', ?)
       ON CONFLICT(plan_id, date) DO UPDATE SET status = 'completed',
         session_id = excluded.session_id, moved_to = NULL`,
    ).run(id, body.data.date, body.data.sessionId ?? null);
    return { ok: true };
  });

  app.post('/api/plans/:id/skip', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!ownedPlan(id, req.user!.id)) return reply.code(404).send({ error: 'plan not found' });
    const body = entryAction.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'date required' });
    db.prepare(
      `INSERT INTO plan_entries (plan_id, date, status) VALUES (?, ?, 'skipped')
       ON CONFLICT(plan_id, date) DO UPDATE SET status = 'skipped', moved_to = NULL`,
    ).run(id, body.data.date);
    return { ok: true };
  });

  app.post('/api/plans/:id/reschedule', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!ownedPlan(id, req.user!.id)) return reply.code(404).send({ error: 'plan not found' });
    const body = entryAction.extend({ to: z.string().regex(DATE) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'date and to required' });
    const existing = db
      .prepare('SELECT status FROM plan_entries WHERE plan_id = ? AND date = ?')
      .get(id, body.data.date) as { status: string | null } | undefined;
    if (existing?.status === 'completed') {
      return reply.code(400).send({ error: 'a completed practice stays where it happened' });
    }
    db.prepare(
      `INSERT INTO plan_entries (plan_id, date, status, moved_to) VALUES (?, ?, NULL, ?)
       ON CONFLICT(plan_id, date) DO UPDATE SET moved_to = excluded.moved_to, status = NULL`,
    ).run(id, body.data.date, body.data.to);
    db.prepare(
      `INSERT INTO plan_entries (plan_id, date, status, moved_from) VALUES (?, ?, NULL, ?)
       ON CONFLICT(plan_id, date) DO UPDATE SET moved_from = excluded.moved_from`,
    ).run(id, body.data.to, body.data.date);
    return { ok: true };
  });

  app.post('/api/plans/:id/unmark', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!ownedPlan(id, req.user!.id)) return reply.code(404).send({ error: 'plan not found' });
    const body = entryAction.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'date required' });
    db.prepare('DELETE FROM plan_entries WHERE plan_id = ? AND date = ?').run(id, body.data.date);
    db.prepare('DELETE FROM plan_entries WHERE plan_id = ? AND moved_from = ?').run(
      id,
      body.data.date,
    );
    return { ok: true };
  });
}
