/**
 * Invitations: the only way in after the first admin.
 *
 * An admin makes a link; the link carries a random token that exists only in
 * the answer to that request (the server keeps its SHA-256). Each link works
 * once, until it expires or is revoked. A "join" link creates an account with
 * the role the admin chose (and, if asked, a friendship with them); a "reset"
 * link sets a new password for one existing account and signs it out
 * everywhere. The join endpoints are public by necessity, so they are rate
 * limited and answer the same for unknown, used, expired and revoked tokens.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  InviteCreatedDto,
  InviteDto,
  InviteKind,
  InviteStatus,
  JoinInfoDto,
  Role,
} from '@zenport/shared';
import { hashPassword } from '../../auth/passwords.js';
import { createSession, destroyAllSessions } from '../../auth/sessions.js';
import { RateLimiter } from '../../auth/ratelimit.js';
import type { AppContext } from '../../context.js';
import { SESSION_COOKIE, sessionCookieOptions } from '../app.js';

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

interface InviteRow {
  id: number;
  kind: string;
  note: string | null;
  role: string;
  befriend: number;
  created_by: number;
  for_user_id: number | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by_name: string | null;
  for_user_name: string | null;
  revoked_at: string | null;
}

function statusOf(r: InviteRow, now = Date.now()): InviteStatus {
  if (r.used_at) return 'used';
  if (r.revoked_at) return 'revoked';
  if (new Date(r.expires_at).getTime() < now) return 'expired';
  return 'open';
}

function toDto(r: InviteRow): InviteDto {
  return {
    id: r.id,
    kind: r.kind === 'reset' ? 'reset' : 'join',
    note: r.note,
    role: r.role === 'admin' ? 'admin' : 'member',
    befriend: r.befriend === 1,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    usedAt: r.used_at,
    usedBy: r.used_by_name,
    forUser: r.for_user_name,
    status: statusOf(r),
  };
}

const SELECT = `SELECT i.*, COALESCE(u.display_name, u.username) AS used_by_name,
                       COALESCE(f.display_name, f.username) AS for_user_name
                FROM invites i
                LEFT JOIN users u ON u.id = i.used_by
                LEFT JOIN users f ON f.id = i.for_user_id`;

export function registerInviteRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;
  const joinLimiter = new RateLimiter(20, 10 * 60_000);

  const adminOnly = (role: Role) => role === 'admin';

  const make = (
    kind: InviteKind,
    by: number,
    opts: { note: string | null; role: Role; befriend: boolean; days: number; forUser?: number },
  ): InviteCreatedDto => {
    const token = randomBytes(24).toString('base64url');
    const now = new Date();
    const expires = new Date(now.getTime() + opts.days * 86_400_000);
    const res = db
      .prepare(
        `INSERT INTO invites (token_hash, kind, note, role, befriend, created_by, for_user_id,
                              created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        hashToken(token),
        kind,
        opts.note,
        opts.role,
        opts.befriend ? 1 : 0,
        by,
        opts.forUser ?? null,
        now.toISOString(),
        expires.toISOString(),
      );
    const row = db
      .prepare(`${SELECT} WHERE i.id = ?`)
      .get(Number(res.lastInsertRowid)) as unknown as InviteRow;
    return { invite: toDto(row), token };
  };

  /** A usable invite for this token, or null - one answer for every kind of "no". */
  const usable = (
    token: string,
  ): (InviteRow & { inviter: string; for_username: string | null }) | null => {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
    const row = db
      .prepare(
        `SELECT i.*, COALESCE(c.display_name, c.username) AS inviter, f.username AS for_username,
                NULL AS used_by_name, NULL AS for_user_name
         FROM invites i JOIN users c ON c.id = i.created_by
         LEFT JOIN users f ON f.id = i.for_user_id
         WHERE i.token_hash = ?`,
      )
      .get(hashToken(token)) as
      (InviteRow & { inviter: string; for_username: string | null }) | undefined;
    if (!row || statusOf(row) !== 'open') return null;
    if (row.kind === 'reset' && !row.for_user_id) return null;
    return row;
  };

  // --- Admin ---

  app.get('/api/invites', async (req, reply) => {
    if (!adminOnly(req.user!.role)) return reply.code(403).send({ error: 'admin only' });
    const rows = db
      .prepare(`${SELECT} ORDER BY i.created_at DESC LIMIT 100`)
      .all() as unknown as InviteRow[];
    return rows.map(toDto);
  });

  app.post('/api/invites', async (req, reply) => {
    if (!adminOnly(req.user!.role)) return reply.code(403).send({ error: 'admin only' });
    const body = z
      .object({
        note: z.string().trim().max(80).nullish(),
        role: z.enum(['member', 'admin']).default('member'),
        befriend: z.boolean().default(true),
        days: z.number().int().min(1).max(30).default(7),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid invitation' });
    return make('join', req.user!.id, {
      note: body.data.note || null,
      role: body.data.role,
      befriend: body.data.befriend,
      days: body.data.days,
    });
  });

  app.delete('/api/invites/:id', async (req, reply) => {
    if (!adminOnly(req.user!.role)) return reply.code(403).send({ error: 'admin only' });
    const id = Number((req.params as { id: string }).id);
    db.prepare('UPDATE invites SET revoked_at = ? WHERE id = ? AND used_at IS NULL').run(
      new Date().toISOString(),
      id,
    );
    return { ok: true };
  });

  // A password-reset link for someone who forgot theirs. Any earlier open
  // reset link for the same person stops working.
  app.post('/api/users/:id/reset-link', async (req, reply) => {
    if (!adminOnly(req.user!.role)) return reply.code(403).send({ error: 'admin only' });
    const id = Number((req.params as { id: string }).id);
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!target) return reply.code(404).send({ error: 'no such person' });
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE invites SET revoked_at = ?
       WHERE kind = 'reset' AND for_user_id = ? AND used_at IS NULL AND revoked_at IS NULL`,
    ).run(now, id);
    return make('reset', req.user!.id, {
      note: null,
      role: 'member',
      befriend: false,
      days: 2,
      forUser: id,
    });
  });

  // --- Public: the invited person's side ---

  app.get('/api/join/:token', async (req, reply): Promise<JoinInfoDto | undefined> => {
    if (!joinLimiter.tryTake(req.ip)) {
      return reply.code(429).send({ error: 'too many attempts - wait a few minutes' });
    }
    const row = usable((req.params as { token: string }).token);
    if (!row) {
      return reply
        .code(404)
        .send({ error: 'This link has expired or was already used. Ask for a new one.' });
    }
    return {
      kind: row.kind === 'reset' ? 'reset' : 'join',
      note: row.note,
      invitedBy: row.inviter,
      username: row.kind === 'reset' ? row.for_username : null,
      expiresAt: row.expires_at,
    };
  });

  app.post('/api/join/:token', async (req, reply) => {
    if (!joinLimiter.tryTake(req.ip)) {
      return reply.code(429).send({ error: 'too many attempts - wait a few minutes' });
    }
    const row = usable((req.params as { token: string }).token);
    if (!row) {
      return reply
        .code(404)
        .send({ error: 'This link has expired or was already used. Ask for a new one.' });
    }
    const now = new Date().toISOString();

    if (row.kind === 'reset') {
      const body = z.object({ password: z.string().min(10).max(200) }).safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send({ error: 'the password needs at least 10 characters' });
      }
      const hash = await hashPassword(body.data.password);
      // Claim the link in the same statement that checks it is still open.
      const claimed = db
        .prepare(
          'UPDATE invites SET used_at = ?, used_by = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL',
        )
        .run(now, row.for_user_id, row.id);
      if (claimed.changes === 0) return reply.code(404).send({ error: 'This link was just used.' });
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.for_user_id);
      destroyAllSessions(db, row.for_user_id!);
      const token = createSession(db, row.for_user_id!, ctx.config.sessionDays);
      reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(ctx));
      return { ok: true };
    }

    const body = z
      .object({
        username: z
          .string()
          .trim()
          .min(2)
          .max(60)
          .regex(/^[\p{L}\p{N}._-]+$/u),
        password: z.string().min(10).max(200),
        displayName: z.string().trim().max(40).nullish(),
        timezone: z.string().max(80).optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({
        error:
          'Pick a username (letters, numbers, dots or dashes) and a password of at least 10 characters.',
      });
    }
    const taken = db
      .prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE')
      .get(body.data.username);
    if (taken) return reply.code(409).send({ error: 'That username is taken - try another.' });
    const hash = await hashPassword(body.data.password);
    let tz = 'UTC';
    try {
      if (body.data.timezone) {
        new Intl.DateTimeFormat('en-US', { timeZone: body.data.timezone });
        tz = body.data.timezone;
      }
    } catch {
      /* keep UTC */
    }

    let userId = 0;
    db.exec('BEGIN');
    try {
      const claimed = db
        .prepare(
          'UPDATE invites SET used_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL',
        )
        .run(now, row.id);
      if (claimed.changes === 0) throw new Error('used');
      const res = db
        .prepare(
          `INSERT INTO users (username, password_hash, role, timezone, display_name)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          body.data.username,
          hash,
          row.role === 'admin' ? 'admin' : 'member',
          tz,
          body.data.displayName || null,
        );
      userId = Number(res.lastInsertRowid);
      db.prepare('UPDATE invites SET used_by = ? WHERE id = ?').run(userId, row.id);
      if (row.befriend === 1) {
        db.prepare(
          `INSERT OR IGNORE INTO friendships (user_id, friend_id, status, created_at, accepted_at)
           VALUES (?, ?, 'accepted', ?, ?)`,
        ).run(row.created_by, userId, now, now);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      if (err instanceof Error && err.message === 'used') {
        return reply.code(404).send({ error: 'This link was just used.' });
      }
      throw err;
    }
    const token = createSession(db, userId, ctx.config.sessionDays);
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(ctx));
    return { ok: true };
  });
}
