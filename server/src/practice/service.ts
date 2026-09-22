import type { Db } from '../db/index.js';

/**
 * Durable practice sessions. Listened time only ever grows by heartbeats
 * clamped to elapsed wall time (small tolerance for timer jitter), so
 * replaying a segment or a confused client can never double-count.
 */

const BEAT_TOLERANCE_SEC = 5;

export function startSession(db: Db, userId: number, itemId: string, now: Date): number {
  // A dangling active session (page closed mid-practice) is finalized
  // honestly as abandoned, keeping whatever listening it accumulated.
  db.prepare(
    `UPDATE practice_sessions
     SET status = 'abandoned', ended_at = COALESCE(last_beat_at, started_at), reason = 'superseded'
     WHERE user_id = ? AND status = 'active'`,
  ).run(userId);
  const res = db
    .prepare(
      `INSERT INTO practice_sessions (user_id, item_id, started_at, status, listened_sec)
       VALUES (?, ?, ?, 'active', 0)`,
    )
    .run(userId, itemId, now.toISOString());
  return Number(res.lastInsertRowid);
}

export function beatSession(
  db: Db,
  userId: number,
  sessionId: number,
  listenedDeltaSec: number,
  now: Date,
): void {
  const row = db
    .prepare(
      `SELECT started_at, last_beat_at FROM practice_sessions
       WHERE id = ? AND user_id = ? AND status = 'active'`,
    )
    .get(sessionId, userId) as { started_at: string; last_beat_at: string | null } | undefined;
  if (!row) return;
  const since = new Date(row.last_beat_at ?? row.started_at).getTime();
  const wallSec = Math.max(0, (now.getTime() - since) / 1000);
  const credited = Math.min(Math.max(0, listenedDeltaSec), wallSec + BEAT_TOLERANCE_SEC);
  db.prepare(
    `UPDATE practice_sessions SET listened_sec = listened_sec + ?, last_beat_at = ? WHERE id = ?`,
  ).run(credited, now.toISOString(), sessionId);
}

export function finishSession(
  db: Db,
  userId: number,
  sessionId: number,
  status: 'completed' | 'abandoned',
  reason: string | null,
  now: Date,
): boolean {
  const res = db
    .prepare(
      `UPDATE practice_sessions SET status = ?, reason = ?, ended_at = ?
       WHERE id = ? AND user_id = ? AND status = 'active'`,
    )
    .run(status, reason, now.toISOString(), sessionId, userId);
  return res.changes > 0;
}

export function activeSession(db: Db, userId: number): { id: number; itemId: string } | null {
  const row = db
    .prepare(
      `SELECT id, item_id FROM practice_sessions WHERE user_id = ? AND status = 'active'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(userId) as { id: number; item_id: string } | undefined;
  return row ? { id: row.id, itemId: row.item_id } : null;
}
