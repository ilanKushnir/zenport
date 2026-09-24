import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TIMER_ITEM_ID, TIMER_ITEM_TITLE, type PracticeSessionDto } from '@zenport/shared';
import type { AppContext } from '../../context.js';
import { activeSession, beatSession, finishSession, startSession } from '../../practice/service.js';

interface SessionRow {
  id: number;
  item_id: string;
  started_at: string;
  ended_at: string | null;
  listened_sec: number;
  status: string;
  reason: string | null;
  title: string | null;
  creator: string | null;
}

function toDto(row: SessionRow): PracticeSessionDto {
  const wall =
    row.ended_at !== null
      ? Math.round((new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()) / 1000)
      : null;
  return {
    id: row.id,
    meditationId: row.item_id,
    meditationTitle:
      row.title ?? (row.item_id === TIMER_ITEM_ID ? TIMER_ITEM_TITLE : 'Removed meditation'),
    creator: row.creator ?? '',
    startedAt: row.started_at,
    endedAt: row.ended_at,
    listenedSec: Math.round(row.listened_sec),
    wallClockSec: wall,
    status: row.status as PracticeSessionDto['status'],
    reason: row.reason,
  };
}

const SELECT = `SELECT s.id, s.item_id, s.started_at, s.ended_at, s.listened_sec, s.status, s.reason,
  i.title, i.creator FROM practice_sessions s LEFT JOIN items i ON i.id = s.item_id`;

export function registerPracticeRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;

  app.post('/api/practice/start', async (req, reply) => {
    const body = z.object({ meditationId: z.string().min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'meditationId required' });
    // An unguided sit has no library item behind it; everything else must
    // name one that exists, so a typo cannot create unreachable history.
    if (body.data.meditationId !== TIMER_ITEM_ID) {
      const item = db.prepare('SELECT id FROM items WHERE id = ?').get(body.data.meditationId);
      if (!item) return reply.code(404).send({ error: 'meditation not found' });
    }
    const id = startSession(db, req.user!.id, body.data.meditationId, new Date());
    return { id };
  });

  // Sits played with no connection, recorded on the device and sent once back
  // online. Each is checked for sense (a real item, times that fit together,
  // listening no longer than the sit) and a retried upload cannot add one twice.
  app.post('/api/practice/offline', async (req, reply) => {
    const body = z
      .object({
        sessions: z
          .array(
            z.object({
              clientId: z.string().min(8).max(64),
              itemId: z.string().min(1).max(200),
              startedAt: z.string().datetime(),
              endedAt: z.string().datetime(),
              listenedSec: z
                .number()
                .min(0)
                .max(6 * 3600),
              status: z.enum(['completed', 'abandoned']),
            }),
          )
          .max(100),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid offline sessions' });
    const now = Date.now();
    let imported = 0;
    const known = db.prepare('SELECT 1 FROM practice_sessions WHERE user_id = ? AND reason = ?');
    const insert = db.prepare(
      `INSERT INTO practice_sessions (user_id, item_id, started_at, ended_at, listened_sec, status, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const s of body.data.sessions) {
      const start = Date.parse(s.startedAt);
      const end = Date.parse(s.endedAt);
      if (!(end >= start) || start < now - 60 * 86_400_000 || end > now + 5 * 60_000) continue;
      const listened = Math.min(s.listenedSec, (end - start) / 1000 + 5);
      if (
        s.itemId !== TIMER_ITEM_ID &&
        !db.prepare('SELECT 1 FROM items WHERE id = ?').get(s.itemId)
      )
        continue;
      const reason = `offline:${s.clientId}`;
      if (known.get(req.user!.id, reason)) continue;
      insert.run(
        req.user!.id,
        s.itemId,
        new Date(start).toISOString(),
        new Date(end).toISOString(),
        listened,
        s.status,
        reason,
      );
      imported++;
    }
    return { imported };
  });

  app.post('/api/practice/:id/beat', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = z.object({ listenedSec: z.number().min(0).max(3600) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'listenedSec required' });
    beatSession(db, req.user!.id, id, body.data.listenedSec, new Date());
    return { ok: true };
  });

  app.post('/api/practice/:id/finish', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = z
      .object({
        status: z.enum(['completed', 'abandoned']),
        reason: z.string().max(120).nullish(),
        listenedSec: z.number().min(0).max(3600).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'status required' });
    if (body.data.listenedSec) {
      beatSession(db, req.user!.id, id, body.data.listenedSec, new Date());
    }
    const ok = finishSession(
      db,
      req.user!.id,
      id,
      body.data.status,
      body.data.reason ?? null,
      new Date(),
    );
    if (!ok) return reply.code(404).send({ error: 'no active session with that id' });
    return { ok: true };
  });

  app.get('/api/practice/active', async (req) => {
    return activeSession(db, req.user!.id);
  });

  app.get('/api/practice/history', async (req) => {
    const q = req.query as { limit?: string };
    const limit = Math.min(Number(q.limit ?? 200) || 200, 500);
    const rows = db
      .prepare(`${SELECT} WHERE s.user_id = ? ORDER BY s.started_at DESC LIMIT ?`)
      .all(req.user!.id, limit) as unknown as SessionRow[];
    return rows.map(toDto);
  });

  // Correcting one's own history: edit listened minutes or delete outright.
  app.patch('/api/practice/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = z
      .object({
        listenedSec: z.number().min(0).max(86_400).optional(),
        reason: z.string().max(120).optional(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid correction' });
    const owned = db
      .prepare(
        `SELECT 1 FROM practice_sessions WHERE id = ? AND user_id = ? AND status != 'active'`,
      )
      .get(id, req.user!.id);
    if (!owned) return reply.code(404).send({ error: 'session not found' });
    if (body.data.listenedSec !== undefined) {
      db.prepare('UPDATE practice_sessions SET listened_sec = ? WHERE id = ?').run(
        body.data.listenedSec,
        id,
      );
    }
    if (body.data.reason !== undefined) {
      db.prepare('UPDATE practice_sessions SET reason = ? WHERE id = ?').run(body.data.reason, id);
    }
    return { ok: true };
  });

  // Clear several at once - a whole day from the history page. Only the
  // person's own, and never a session still running.
  app.post('/api/practice/remove', async (req, reply) => {
    const body = z
      .object({ ids: z.array(z.number().int().positive()).min(1).max(500) })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'ids required' });
    const del = db.prepare(
      `DELETE FROM practice_sessions WHERE id = ? AND user_id = ? AND status != 'active'`,
    );
    let removed = 0;
    db.exec('BEGIN');
    try {
      for (const id of body.data.ids) removed += Number(del.run(id, req.user!.id).changes);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return { ok: true, removed };
  });

  app.delete('/api/practice/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const res = db
      .prepare('DELETE FROM practice_sessions WHERE id = ? AND user_id = ?')
      .run(id, req.user!.id);
    if (res.changes === 0) return reply.code(404).send({ error: 'session not found' });
    return { ok: true };
  });
}
