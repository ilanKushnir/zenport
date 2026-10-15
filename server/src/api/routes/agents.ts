/**
 * AI agents. Two sides:
 *
 * - /api/agents (signed-in person): add, rename, reconnect and remove one's
 *   own agents. Adding or reconnecting answers a one-time connect code and
 *   the brief that carries it - never a key.
 * - /api/agent (the agent, with its bearer key): a small API made for
 *   agents, acting as its owner. /connect (trade a code for a key) and
 *   /skill.md are open; the key reaches nothing outside /api/agent, and a
 *   session cookie reaches nothing inside it.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  CONTENT_TYPES,
  TIMER_ITEM_ID,
  TIMER_ITEM_TITLE,
  type AgentConnectDto,
  type AgentDto,
} from '@zenport/shared';
import type { AppContext } from '../../context.js';
import { RateLimiter } from '../../auth/ratelimit.js';
import {
  AgentError,
  createAgent,
  issueCode,
  listAgents,
  ownedAgent,
  redeemCode,
  type AgentRow,
} from '../../agents/service.js';
import { agentUrls, buildBrief, buildSkill } from '../../agents/skill.js';
import { dayKey } from '../../stats/compute.js';
import { planOccurrences, toDto as planDto, type PlanRow } from './plans.js';
import { statsFor } from './stats.js';

/** Most agents a person can have. */
const MAX_AGENTS = 10;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function agentDto(a: AgentRow, now = Date.now()): AgentDto {
  const waiting =
    a.connect_hash !== null &&
    a.connect_expires_at !== null &&
    a.connect_redeemed_at === null &&
    Date.parse(a.connect_expires_at) > now;
  return {
    id: a.id,
    name: a.name,
    journal: a.journal === 1,
    connected: a.key_hash !== null,
    keyHint: a.key_hint,
    connectedAt: a.connected_at,
    lastSeenAt: a.last_seen_at,
    createdAt: a.created_at,
    codeExpiresAt: waiting ? a.connect_expires_at : null,
  };
}

interface ItemRow {
  id: string;
  title: string;
  creator: string;
  collection: string | null;
  type: string;
  seconds: number | null;
  parts: number;
}

const ITEM_SELECT = `SELECT i.id, i.title, i.creator, i.collection,
    COALESCE(t.type, i.inferred_type, 'meditation') AS type,
    (SELECT SUM(duration_sec) FROM tracks WHERE item_id = i.id AND missing = 0) AS seconds,
    (SELECT COUNT(*) FROM tracks WHERE item_id = i.id AND missing = 0) AS parts
  FROM items i LEFT JOIN item_types t ON t.item_id = i.id`;
const LISTED = 'i.missing = 0 AND i.excluded = 0';

const mins = (sec: number | null | undefined) => Math.round((sec ?? 0) / 60);

interface SitRow {
  id: number;
  item_id: string;
  started_at: string;
  ended_at: string | null;
  listened_sec: number;
  status: string;
  title: string | null;
  creator: string | null;
}

const SIT_SELECT = `SELECT s.id, s.item_id, s.started_at, s.ended_at, s.listened_sec, s.status,
    COALESCE(i.title, a.title) AS title,
    COALESCE(i.creator, CASE WHEN a.id IS NOT NULL THEN 'Made for you' END) AS creator
  FROM practice_sessions s LEFT JOIN items i ON i.id = s.item_id
  LEFT JOIN ai_sits a ON s.item_id = 'ai:' || a.id`;

const sitDto = (r: SitRow) => ({
  id: r.id,
  at: r.started_at,
  meditationId: r.item_id === TIMER_ITEM_ID ? null : r.item_id,
  title: r.title ?? (r.item_id === TIMER_ITEM_ID ? TIMER_ITEM_TITLE : 'Removed meditation'),
  creator: r.creator ?? '',
  minutes: mins(r.listened_sec),
  completed: r.status === 'completed',
});

export function registerAgentRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db, config } = ctx;
  const connectLimiter = new RateLimiter(20, 10 * 60_000);

  const ownerName = (userId: number) =>
    (
      db
        .prepare('SELECT COALESCE(display_name, username) AS name FROM users WHERE id = ?')
        .get(userId) as { name: string }
    ).name;

  const connectAnswer = (req: FastifyRequest, agentId: number): AgentConnectDto => {
    const { code, expiresAt } = issueCode(db, agentId);
    const agent = db
      .prepare('SELECT * FROM agents WHERE id = ?')
      .get(agentId) as unknown as AgentRow;
    return {
      agent: agentDto(agent),
      code,
      expiresAt,
      brief: buildBrief({
        agentName: agent.name,
        ownerName: ownerName(agent.user_id),
        code,
        expiresAt,
        urls: agentUrls(config, req),
      }),
    };
  };

  // --- The person's own agents ---

  app.get('/api/agents', async (req): Promise<AgentDto[]> =>
    listAgents(db, req.user!.id).map((a) => agentDto(a)),
  );

  const agentBody = z.object({
    name: z.string().trim().min(1).max(60),
    journal: z.boolean().default(false),
  });

  app.post('/api/agents', async (req, reply) => {
    const body = agentBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'give the agent a name' });
    if (listAgents(db, req.user!.id).length >= MAX_AGENTS) {
      return reply.code(400).send({ error: `at most ${MAX_AGENTS} agents` });
    }
    const id = createAgent(db, req.user!.id, body.data.name, body.data.journal);
    return connectAnswer(req, id);
  });

  app.patch('/api/agents/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!ownedAgent(db, id, req.user!.id)) return reply.code(404).send({ error: 'no such agent' });
    const body = agentBody.partial().safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid change' });
    if (body.data.name !== undefined) {
      db.prepare('UPDATE agents SET name = ? WHERE id = ?').run(body.data.name, id);
    }
    if (body.data.journal !== undefined) {
      db.prepare('UPDATE agents SET journal = ? WHERE id = ?').run(body.data.journal ? 1 : 0, id);
    }
    return agentDto(ownedAgent(db, id, req.user!.id)!);
  });

  app.post('/api/agents/:id/connect', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!ownedAgent(db, id, req.user!.id)) return reply.code(404).send({ error: 'no such agent' });
    return connectAnswer(req, id);
  });

  app.delete('/api/agents/:id', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const res = db.prepare('DELETE FROM agents WHERE id = ? AND user_id = ?').run(id, req.user!.id);
    if (res.changes === 0) return reply.code(404).send({ error: 'no such agent' });
    return { ok: true };
  });

  // --- Open to anyone: the code is the credential; the skill holds no secrets ---

  app.post('/api/agent/connect', async (req, reply) => {
    if (!connectLimiter.tryTake(req.ip)) {
      return reply
        .code(429)
        .send({ error: 'too many attempts - wait a few minutes', code: 'rate_limited' });
    }
    const code = (req.body as { code?: unknown } | undefined)?.code;
    if (typeof code !== 'string' || !code.trim()) {
      return reply
        .code(400)
        .send({ error: 'send {"code":"zpc_..."} from the connect message', code: 'missing_code' });
    }
    try {
      const { agentId, key } = redeemCode(db, code);
      const agent = db
        .prepare('SELECT * FROM agents WHERE id = ?')
        .get(agentId) as unknown as AgentRow;
      const urls = agentUrls(config, req);
      void reply.header('Cache-Control', 'no-store');
      return {
        apiKey: key,
        ...urls,
        service: { name: 'ZenPort', version: ctx.version },
        agent: { id: agent.id, name: agent.name, journal: agent.journal === 1 },
        storeAs: { apiKey: 'ZENPORT_API_KEY', baseUrl: 'ZENPORT_URL' },
        next: [
          'Store apiKey as ZENPORT_API_KEY and baseUrl as ZENPORT_URL in your secret store now. Never echo the key into chat.',
          `Install the skill: ${urls.skillUrl}`,
          "GET {baseUrl}/me with 'Authorization: Bearer <apiKey>' to check, then tell your person you are connected.",
        ],
      };
    } catch (err) {
      if (err instanceof AgentError) {
        return reply.code(err.status).send({ error: err.message, code: err.code });
      }
      throw err;
    }
  });

  app.get('/api/agent/skill.md', async (req, reply) => {
    void reply
      .header('Content-Type', 'text/markdown; charset=utf-8')
      .header('Cache-Control', 'no-cache');
    return buildSkill({ version: ctx.version, urls: agentUrls(config, req) });
  });

  // --- The agent, acting for its owner (app.ts checked the key) ---

  const me = (req: FastifyRequest) => req.user!;
  const appUrl = (req: FastifyRequest) => agentUrls(config, req).appUrl;
  const meditation = (req: FastifyRequest, r: ItemRow) => ({
    id: r.id,
    title: r.title,
    creator: r.creator,
    series: r.collection,
    type: r.type,
    minutes: mins(r.seconds),
    parts: r.parts,
    url: `${appUrl(req)}/m/${encodeURIComponent(r.id)}`,
  });
  const needJournal = (req: FastifyRequest, reply: FastifyReply) => {
    if (req.agent?.journal === 1) return false;
    void reply.code(403).send({
      error: 'This agent may not use the journal. Your person can allow it in Settings -> Agents.',
      code: 'journal_not_allowed',
    });
    return true;
  };

  app.get('/api/agent/me', async (req) => {
    const a = req.agent!;
    return {
      service: { name: 'ZenPort', version: ctx.version },
      agent: { id: a.id, name: a.name, journal: a.journal === 1 },
      person: { name: ownerName(me(req).id), timezone: me(req).timezone },
      ...agentUrls(config, req),
    };
  });

  app.get('/api/agent/today', async (req) => {
    const { id, timezone } = me(req);
    const { today, occurrences } = planOccurrences(db, id, timezone, 0);
    const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 7 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const item = db.prepare(`${ITEM_SELECT} WHERE i.id = ?`);
    const planned = occurrences
      .filter((o) => o.date === today && o.movedTo === null)
      .map((o) => ({
        planId: o.planId,
        plan: o.planName,
        focus: o.focus ?? 'practice',
        status: o.status,
        meditations: o.meditationIds
          .map((m) => item.get(m) as ItemRow | undefined)
          .filter((r): r is ItemRow => !!r)
          .map((r) => meditation(req, r)),
      }));
    const missed = occurrences
      .filter((o) => o.status === 'missed' && o.date >= weekAgo && o.date < today)
      .map((o) => ({ planId: o.planId, plan: o.planName, date: o.date }));
    const stats = statsFor(db, id, timezone);
    const todays = stats.weekTrend.find((b) => b.bucket === today);
    const last = db
      .prepare(
        `${SIT_SELECT} WHERE s.user_id = ? AND s.status != 'active' ORDER BY s.started_at DESC LIMIT 1`,
      )
      .get(id) as SitRow | undefined;
    return {
      date: today,
      timezone,
      planned,
      missed,
      sat: { sessions: todays?.sessions ?? 0, minutes: todays?.minutes ?? 0 },
      streak: { current: stats.currentStreak, longest: stats.longestStreak },
      week: {
        minutes: stats.weekTrend.reduce((n, b) => n + b.minutes, 0),
        sessions: stats.weekTrend.reduce((n, b) => n + b.sessions, 0),
      },
      lastSit: last
        ? { at: last.started_at, title: sitDto(last).title, minutes: sitDto(last).minutes }
        : null,
    };
  });

  app.get('/api/agent/library', async (req, reply) => {
    const q = z
      .object({
        q: z.string().trim().max(200).optional(),
        creator: z.string().trim().max(200).optional(),
        type: z.enum(CONTENT_TYPES).optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: 'invalid search', code: 'bad_request' });
    const where = [LISTED];
    const args: string[] = [];
    const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    for (const word of (q.data.q ?? '').split(/\s+/).filter(Boolean)) {
      where.push(
        "(i.title LIKE ? ESCAPE '\\' OR i.creator LIKE ? ESCAPE '\\' OR COALESCE(i.collection, '') LIKE ? ESCAPE '\\')",
      );
      args.push(like(word), like(word), like(word));
    }
    if (q.data.creator) {
      where.push("i.creator LIKE ? ESCAPE '\\'");
      args.push(like(q.data.creator));
    }
    if (q.data.type) {
      where.push("COALESCE(t.type, i.inferred_type, 'meditation') = ?");
      args.push(q.data.type);
    }
    const sql = `${ITEM_SELECT} WHERE ${where.join(' AND ')}`;
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM (${sql})`).get(...args) as { n: number })
      .n;
    const order = q.data.q ? 'i.creator, i.collection, i.title' : 'i.added_at DESC, i.title';
    const rows = db
      .prepare(`${sql} ORDER BY ${order} LIMIT ?`)
      .all(...args, q.data.limit) as unknown as ItemRow[];
    return { total, items: rows.map((r) => meditation(req, r)) };
  });

  app.get('/api/agent/items/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const row = db.prepare(`${ITEM_SELECT} WHERE i.id = ? AND ${LISTED}`).get(id) as
      ItemRow | undefined;
    if (!row) return reply.code(404).send({ error: 'no such meditation', code: 'not_found' });
    const parts = db
      .prepare(
        'SELECT title, duration_sec FROM tracks WHERE item_id = ? AND missing = 0 ORDER BY ord',
      )
      .all(id) as { title: string; duration_sec: number | null }[];
    return {
      ...meditation(req, row),
      parts: parts.map((p) => ({ title: p.title, minutes: mins(p.duration_sec) })),
    };
  });

  app.get('/api/agent/history', async (req) => {
    const days = Math.min(Math.max(Number((req.query as { days?: string }).days) || 30, 1), 365);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = db
      .prepare(
        `${SIT_SELECT} WHERE s.user_id = ? AND s.status != 'active' AND s.started_at >= ?
         ORDER BY s.started_at DESC LIMIT 200`,
      )
      .all(me(req).id, since) as unknown as SitRow[];
    return { sits: rows.map(sitDto) };
  });

  app.get('/api/agent/stats', async (req) => {
    const s = statsFor(db, me(req).id, me(req).timezone);
    return {
      timezone: s.timezone,
      totalMinutes: s.totalMinutes,
      totalSessions: s.totalSessions,
      currentStreak: s.currentStreak,
      longestStreak: s.longestStreak,
      [`last${s.comparison.periodDays}Days`]: s.comparison.current,
      [`previous${s.comparison.periodDays}Days`]: s.comparison.previous,
      days: s.weekTrend.map((b) => ({ date: b.bucket, minutes: b.minutes, sessions: b.sessions })),
      topCreators: s.creatorMix.slice(0, 5).map((c) => ({ name: c.name, minutes: c.minutes })),
      learning: {
        totalMinutes: s.learning.totalMinutes,
        sessions: s.learning.sessions,
        lessonsCompleted: s.learning.lessonsCompleted,
      },
    };
  });

  app.get('/api/agent/plans', async (req) => {
    const rows = db
      .prepare('SELECT * FROM plans WHERE user_id = ? ORDER BY created_at DESC')
      .all(me(req).id) as unknown as PlanRow[];
    const title = db.prepare('SELECT title FROM items WHERE id = ?');
    return {
      plans: rows.map(planDto).map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        focus: p.focus,
        intention: p.intention,
        days: p.daysOfWeek,
        preferredTime: p.preferredTime,
        targetMinutes: p.targetMinutes,
        startDate: p.startDate,
        endDate: p.endDate,
        meditations: p.meditationIds.map((m) => ({
          id: m,
          title: (title.get(m) as { title: string } | undefined)?.title ?? 'Removed meditation',
        })),
      })),
    };
  });

  const ownsPlan = (id: number, userId: number) =>
    !!db.prepare('SELECT 1 FROM plans WHERE id = ? AND user_id = ?').get(id, userId);
  const markPlan = (
    planId: number,
    date: string,
    status: 'completed' | 'skipped',
    sitId?: number,
  ) =>
    db
      .prepare(
        `INSERT INTO plan_entries (plan_id, date, status, session_id) VALUES (?, ?, ?, ?)
         ON CONFLICT(plan_id, date) DO UPDATE SET status = excluded.status,
           session_id = COALESCE(excluded.session_id, session_id), moved_to = NULL`,
      )
      .run(planId, date, status, sitId ?? null);

  app.post('/api/agent/sits', async (req, reply) => {
    const body = z
      .object({
        minutes: z.number().min(1).max(600),
        meditationId: z.string().min(1).max(200).nullish(),
        endedAt: z.string().datetime({ offset: true }).optional(),
        planId: z.number().int().optional(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({
        error: 'send {"minutes": 1-600} and optionally meditationId, endedAt, planId',
        code: 'bad_request',
      });
    }
    const { id: userId, timezone } = me(req);
    const b = body.data;
    const itemId = b.meditationId ?? TIMER_ITEM_ID;
    if (itemId !== TIMER_ITEM_ID && !db.prepare('SELECT 1 FROM items WHERE id = ?').get(itemId)) {
      return reply.code(404).send({ error: 'no such meditation', code: 'not_found' });
    }
    if (b.planId !== undefined && !ownsPlan(b.planId, userId)) {
      return reply.code(404).send({ error: 'no such plan', code: 'not_found' });
    }
    const now = Date.now();
    const end = b.endedAt ? Date.parse(b.endedAt) : now;
    if (end > now + 5 * 60_000 || end < now - 60 * 86_400_000) {
      return reply
        .code(400)
        .send({ error: 'endedAt must be within the last 60 days', code: 'bad_request' });
    }
    const start = end - b.minutes * 60_000;
    const res = db
      .prepare(
        `INSERT INTO practice_sessions (user_id, item_id, started_at, ended_at, listened_sec, status, reason)
         VALUES (?, ?, ?, ?, ?, 'completed', ?)`,
      )
      .run(
        userId,
        itemId,
        new Date(start).toISOString(),
        new Date(end).toISOString(),
        b.minutes * 60,
        `agent:${req.agent!.id}`,
      );
    const sitId = Number(res.lastInsertRowid);
    if (b.planId !== undefined) {
      markPlan(b.planId, dayKey(new Date(start).toISOString(), timezone), 'completed', sitId);
    }
    const row = db.prepare(`${SIT_SELECT} WHERE s.id = ?`).get(sitId) as unknown as SitRow;
    return { sit: sitDto(row) };
  });

  const planDay = z.object({ date: z.string().regex(DATE).optional() });
  for (const [verb, status] of [
    ['done', 'completed'],
    ['skip', 'skipped'],
  ] as const) {
    app.post(`/api/agent/plans/:id/${verb}`, async (req, reply) => {
      const id = Number((req.params as { id: string }).id);
      if (!ownsPlan(id, me(req).id)) {
        return reply.code(404).send({ error: 'no such plan', code: 'not_found' });
      }
      const body = planDay.safeParse(req.body ?? {});
      if (!body.success) {
        return reply.code(400).send({ error: 'date is YYYY-MM-DD', code: 'bad_request' });
      }
      const date = body.data.date ?? dayKey(new Date().toISOString(), me(req).timezone);
      markPlan(id, date, status);
      return { ok: true };
    });
  }

  app.get('/api/agent/journal', async (req, reply) => {
    if (needJournal(req, reply)) return reply;
    const days = Math.min(Math.max(Number((req.query as { days?: string }).days) || 30, 1), 365);
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const rows = db
      .prepare(
        `SELECT j.id, j.created_at, j.title, j.body, j.mood, j.tags, j.item_id,
                COALESCE(i.title, a.title) AS med_title
         FROM journal_entries j
         LEFT JOIN items i ON i.id = j.item_id
         LEFT JOIN ai_sits a ON j.item_id = 'ai:' || a.id AND a.user_id = j.user_id
         WHERE j.user_id = ? AND j.created_at >= ? ORDER BY j.created_at DESC LIMIT 200`,
      )
      .all(me(req).id, since) as {
      id: number;
      created_at: string;
      title: string | null;
      body: string;
      mood: number | null;
      tags: string;
      item_id: string | null;
      med_title: string | null;
    }[];
    return {
      entries: rows.map((r) => ({
        id: r.id,
        at: r.created_at,
        title: r.title,
        body: r.body,
        mood: r.mood,
        tags: JSON.parse(r.tags) as string[],
        meditation: r.item_id
          ? { id: r.item_id, title: r.med_title ?? 'Removed meditation' }
          : null,
      })),
    };
  });

  app.post('/api/agent/journal', async (req, reply) => {
    if (needJournal(req, reply)) return reply;
    const body = z
      .object({
        body: z.string().trim().min(1).max(20_000),
        title: z.string().max(200).nullish(),
        mood: z.number().int().min(1).max(5).nullish(),
        tags: z.array(z.string().min(1).max(40)).max(20).default([]),
        meditationId: z.string().max(200).nullish(),
        sitId: z.number().int().nullish(),
      })
      .safeParse(req.body);
    if (!body.success) {
      return reply.code(400).send({ error: 'send {"body": "..."}', code: 'bad_request' });
    }
    const e = body.data;
    const userId = me(req).id;
    if (
      e.sitId != null &&
      !db
        .prepare('SELECT 1 FROM practice_sessions WHERE id = ? AND user_id = ?')
        .get(e.sitId, userId)
    ) {
      return reply.code(404).send({ error: 'no such sit', code: 'not_found' });
    }
    const now = new Date().toISOString();
    const res = db
      .prepare(
        `INSERT INTO journal_entries (user_id, session_id, item_id, title, body, mood, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        e.sitId ?? null,
        e.meditationId ?? null,
        e.title ?? null,
        e.body,
        e.mood ?? null,
        JSON.stringify(e.tags),
        now,
        now,
      );
    return { id: Number(res.lastInsertRowid) };
  });
}
