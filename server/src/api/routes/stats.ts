import type { FastifyInstance } from 'fastify';
import { TIMER_ITEM_ID, TIMER_ITEM_TITLE } from '@zenport/shared';
import type { AppContext } from '../../context.js';
import { computeStats, type SessionForStats } from '../../stats/compute.js';

export function registerStatsRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;

  app.get('/api/stats', async (req) => {
    const rows = db
      .prepare(
        `SELECT s.started_at, s.listened_sec, s.status, s.item_id,
                COALESCE(i.creator, '') AS creator,
                COALESCE(i.title, CASE WHEN s.item_id = ? THEN ? WHEN s.item_id LIKE 'ai:%' THEN 'Made for you' ELSE 'Removed meditation' END) AS title,
                COALESCE(t.type, i.inferred_type, 'meditation') AS type
         FROM practice_sessions s
         LEFT JOIN items i ON i.id = s.item_id
         LEFT JOIN item_types t ON t.item_id = s.item_id
         WHERE s.user_id = ? AND s.status != 'active'`,
      )
      .all(TIMER_ITEM_ID, TIMER_ITEM_TITLE, req.user!.id) as {
      started_at: string;
      listened_sec: number;
      status: string;
      item_id: string;
      creator: string;
      title: string;
      type: string;
    }[];
    const learningType = (t: string) => t === 'course' || t === 'talk';
    const toStats = (r: (typeof rows)[number]): SessionForStats => ({
      startedAt: r.started_at,
      listenedSec: r.listened_sec,
      status: r.status as SessionForStats['status'],
      itemId: r.item_id,
      creator: r.creator,
      title: r.title,
    });
    const practice = rows.filter((r) => !learningType(r.type)).map(toStats);
    const study = computeStats(
      rows.filter((r) => learningType(r.type)).map(toStats),
      req.user!.timezone,
      new Date(),
    );
    const lessonsCompleted = (
      db
        .prepare('SELECT COUNT(*) AS n FROM track_completions WHERE user_id = ?')
        .get(req.user!.id) as {
        n: number;
      }
    ).n;
    return {
      ...computeStats(practice, req.user!.timezone, new Date()),
      learning: {
        totalMinutes: study.totalMinutes,
        sessions: study.totalSessions,
        lessonsCompleted,
        weekTrend: study.weekTrend,
      },
    };
  });
}
