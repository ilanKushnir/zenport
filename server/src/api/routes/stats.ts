import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../../context.js';
import { computeStats, type SessionForStats } from '../../stats/compute.js';

export function registerStatsRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;

  app.get('/api/stats', async (req) => {
    const rows = db
      .prepare(
        `SELECT s.started_at, s.listened_sec, s.status, s.item_id,
                COALESCE(i.creator, '') AS creator, COALESCE(i.title, 'Removed meditation') AS title
         FROM practice_sessions s LEFT JOIN items i ON i.id = s.item_id
         WHERE s.user_id = ? AND s.status != 'active'`,
      )
      .all(req.user!.id) as {
      started_at: string;
      listened_sec: number;
      status: string;
      item_id: string;
      creator: string;
      title: string;
    }[];
    const sessions: SessionForStats[] = rows.map((r) => ({
      startedAt: r.started_at,
      listenedSec: r.listened_sec,
      status: r.status as SessionForStats['status'],
      itemId: r.item_id,
      creator: r.creator,
      title: r.title,
    }));
    return computeStats(sessions, req.user!.timezone, new Date());
  });
}
