import { createHash, randomBytes } from 'node:crypto';
import type { Role } from '@zenport/shared';
import type { Db } from '../db/index.js';

export interface SessionUser {
  id: number;
  username: string;
  role: Role;
  timezone: string;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** Create a session and return the raw bearer token (only the hash is stored). */
export function createSession(db: Db, userId: number, days: number): string {
  const token = randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + days * 86_400_000);
  db.prepare(
    `INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
  ).run(hashToken(token), userId, now.toISOString(), expires.toISOString());
  return token;
}

export function verifySession(db: Db, token: string): SessionUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.role, u.timezone, s.expires_at
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(hashToken(token)) as
    { id: number; username: string; role: Role; timezone: string; expires_at: string } | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    destroySession(db, token);
    return null;
  }
  return { id: row.id, username: row.username, role: row.role, timezone: row.timezone };
}

export function destroySession(db: Db, token: string): void {
  db.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hashToken(token));
}
