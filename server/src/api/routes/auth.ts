import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AdminUserDto, SetupStatusDto, ShareLevel, UserInfo } from '@zenport/shared';
import { hashPassword, verifyPassword } from '../../auth/passwords.js';
import { createSession, destroyOtherSessions, destroySession } from '../../auth/sessions.js';
import { RateLimiter } from '../../auth/ratelimit.js';
import type { AppContext } from '../../context.js';
import { SESSION_COOKIE, sessionCookieOptions } from '../app.js';

const credentialsSchema = z.object({
  username: z.string().min(2).max(60),
  password: z.string().min(10).max(200),
  setupToken: z.string().max(200).optional(),
  timezone: z.string().max(80).optional(),
});

const loginSchema = z.object({
  username: z.string().min(1).max(60),
  password: z.string().min(1).max(200),
});

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;
  const loginLimiter = new RateLimiter(10, 5 * 60_000);
  const setupLimiter = new RateLimiter(10, 5 * 60_000);

  const userCount = () => (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;

  // First-start contract (mirrors ReadPort): the status names whether the
  // unclaimed instance demands a setup token — never the token itself.
  app.get('/api/setup/status', async (): Promise<SetupStatusDto> => {
    const needsSetup = userCount() === 0;
    return {
      needsSetup,
      setupTokenRequired: needsSetup && ctx.config.setupToken !== null,
    };
  });

  // First-run creation of the one admin account. The window closes for good
  // once any account exists — there is no open signup.
  app.post('/api/setup', async (req, reply) => {
    if (!setupLimiter.tryTake(req.ip)) {
      return reply.code(429).send({ error: 'too many attempts - wait a few minutes' });
    }
    if (userCount() > 0) {
      return reply.code(403).send({ error: 'setup is already complete' });
    }
    const body = credentialsSchema.safeParse(req.body);
    if (!body.success) {
      return reply
        .code(400)
        .send({ error: 'username (2+ chars) and password (10+ chars) are required' });
    }
    if (ctx.config.setupToken && !tokenMatches(body.data.setupToken, ctx.config.setupToken)) {
      return reply.code(403).send({ error: 'setup token does not match' });
    }
    const hash = await hashPassword(body.data.password);
    const timezone = sanitizeTimezone(body.data.timezone) ?? 'UTC';
    // The userCount() check above is only a fast path: hashing suspends, so
    // two racing requests can both pass it. The zero-users check and the
    // insert must land in this single statement — whoever arrives second
    // inserts nothing, and the claim stays first-come-only.
    const res = db
      .prepare(
        `INSERT INTO users (username, password_hash, role, timezone)
         SELECT ?, ?, 'admin', ?
         WHERE NOT EXISTS (SELECT 1 FROM users)`,
      )
      .run(body.data.username.trim(), hash, timezone);
    if (res.changes === 0) {
      return reply.code(403).send({ error: 'setup is already complete' });
    }
    const token = createSession(db, Number(res.lastInsertRowid), ctx.config.sessionDays);
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(ctx));
    return { ok: true };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = loginSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'username and password required' });
    if (!loginLimiter.tryTake(`${req.ip}:${body.data.username.toLowerCase()}`)) {
      return reply.code(429).send({ error: 'too many attempts - wait a few minutes' });
    }
    const row = db
      .prepare('SELECT id, password_hash FROM users WHERE username = ?')
      .get(body.data.username.trim()) as { id: number; password_hash: string } | undefined;
    const ok = row ? await verifyPassword(body.data.password, row.password_hash) : false;
    if (!row || !ok) {
      return reply.code(401).send({ error: 'that username and password do not match' });
    }
    const token = createSession(db, row.id, ctx.config.sessionDays);
    reply.setCookie(SESSION_COOKIE, token, sessionCookieOptions(ctx));
    return { ok: true };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) destroySession(db, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/me', async (req): Promise<UserInfo> => {
    const u = req.user!;
    const row = db
      .prepare('SELECT created_at, display_name, avatar, share_level FROM users WHERE id = ?')
      .get(u.id) as {
      created_at: string;
      display_name: string | null;
      avatar: string | null;
      share_level: string;
    };
    return {
      id: u.id,
      username: u.username,
      role: u.role,
      timezone: u.timezone,
      createdAt: row.created_at,
      displayName: row.display_name,
      avatar: row.avatar,
      shareLevel: asShareLevel(row.share_level),
    };
  });

  app.patch('/api/auth/me', async (req, reply) => {
    const schema = z.object({
      timezone: z.string().max(80).optional(),
      displayName: z.string().trim().max(40).nullable().optional(),
      avatar: z.string().max(16).nullable().optional(),
      shareLevel: z.enum(['full', 'summary', 'off']).optional(),
    });
    const body = schema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid settings' });
    const d = body.data;
    if (d.timezone !== undefined) {
      const tz = sanitizeTimezone(d.timezone);
      if (!tz) return reply.code(400).send({ error: 'unknown timezone' });
      db.prepare('UPDATE users SET timezone = ? WHERE id = ?').run(tz, req.user!.id);
    }
    if (d.displayName !== undefined) {
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(
        d.displayName || null,
        req.user!.id,
      );
    }
    if (d.avatar !== undefined) {
      // One emoji (a grapheme may be several code points), never markup.
      const ok = d.avatar === null || /^\p{Extended_Pictographic}/u.test(d.avatar);
      if (!ok) return reply.code(400).send({ error: 'an avatar is one emoji' });
      db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(d.avatar, req.user!.id);
    }
    if (d.shareLevel !== undefined) {
      db.prepare('UPDATE users SET share_level = ? WHERE id = ?').run(d.shareLevel, req.user!.id);
    }
    return { ok: true };
  });

  // Change your own password: the current one is required, and every other
  // signed-in device is signed out.
  app.post('/api/auth/password', async (req, reply) => {
    const body = z
      .object({ current: z.string().min(1).max(200), next: z.string().min(10).max(200) })
      .safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'the new password needs at least 10 characters' });
    }
    if (!loginLimiter.tryTake(`pw:${req.user!.id}`)) {
      return reply.code(429).send({ error: 'too many attempts - wait a few minutes' });
    }
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as {
      password_hash: string;
    };
    if (!(await verifyPassword(body.data.current, row.password_hash))) {
      return reply.code(401).send({ error: 'the current password is not right' });
    }
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
      await hashPassword(body.data.next),
      req.user!.id,
    );
    destroyOtherSessions(db, req.user!.id, req.cookies[SESSION_COOKIE] ?? '');
    return { ok: true };
  });

  // --- Admin account management (never exposes other users' private data) ---

  app.get('/api/users', async (req, reply): Promise<AdminUserDto[] | undefined> => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    return db
      .prepare(
        `SELECT u.id, u.username, u.display_name AS displayName, u.avatar, u.role,
                u.created_at AS createdAt,
                MAX(COALESCE((SELECT MAX(COALESCE(last_beat_at, started_at)) FROM practice_sessions
                              WHERE user_id = u.id), ''),
                    COALESCE((SELECT MAX(created_at) FROM auth_sessions WHERE user_id = u.id), '')
                ) AS lastActiveAt
         FROM users u ORDER BY u.id`,
      )
      .all()
      .map((r) => {
        const row = r as unknown as AdminUserDto;
        return { ...row, lastActiveAt: row.lastActiveAt || null };
      });
  });

  // Promote or step someone down. There is always at least one admin.
  app.patch('/api/users/:id', async (req, reply) => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const id = Number((req.params as { id: string }).id);
    const body = z.object({ role: z.enum(['admin', 'member']) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'role required' });
    const target = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as
      { role: string } | undefined;
    if (!target) return reply.code(404).send({ error: 'no such person' });
    if (body.data.role === 'member' && target.role === 'admin') {
      const admins = (
        db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").get() as { c: number }
      ).c;
      if (admins <= 1) return reply.code(400).send({ error: 'ZenPort needs at least one admin' });
    }
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(body.data.role, id);
    return { ok: true };
  });

  app.post('/api/users', async (req, reply) => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const body = credentialsSchema.safeParse(req.body);
    if (!body.success) {
      return reply
        .code(400)
        .send({ error: 'username (2+ chars) and password (10+ chars) are required' });
    }
    const exists = db
      .prepare('SELECT 1 FROM users WHERE username = ?')
      .get(body.data.username.trim());
    if (exists) return reply.code(409).send({ error: 'that username is taken' });
    const hash = await hashPassword(body.data.password);
    db.prepare(
      `INSERT INTO users (username, password_hash, role, timezone) VALUES (?, ?, 'member', 'UTC')`,
    ).run(body.data.username.trim(), hash);
    return { ok: true };
  });

  app.delete('/api/users/:id', async (req, reply) => {
    if (req.user!.role !== 'admin') return reply.code(403).send({ error: 'admin only' });
    const id = Number((req.params as { id: string }).id);
    if (id === req.user!.id) return reply.code(400).send({ error: 'cannot remove yourself' });
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return { ok: true };
  });
}

export function asShareLevel(v: string): ShareLevel {
  return v === 'summary' || v === 'off' ? v : 'full';
}

function sanitizeTimezone(tz: string | undefined): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

/** Constant-time setup-token comparison over digests (length-independent). */
function tokenMatches(presented: string | undefined, expected: string): boolean {
  if (!presented) return false;
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
