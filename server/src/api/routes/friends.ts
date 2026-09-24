/**
 * Friends: people on this ZenPort who chose to see each other's practice.
 *
 * - A friendship is one row per pair, the asker first; it is "pending" until
 *   the other person accepts, and either side can end it at any time.
 * - What a friend sees follows the *friend's* share level: full (titles, what
 *   is playing now, course progress), summary (minutes, streaks, days - no
 *   titles), or off (only that you are friends).
 * - Cheers are small and bounded: a bow on a session you can see, one nudge a
 *   day, and an invitation to sit with a particular recording.
 *
 * Days are each person's own local days, the same rule as their stats page.
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  TIMER_ITEM_ID,
  TIMER_ITEM_TITLE,
  type CheerDto,
  type ContentType,
  type FriendActivityDto,
  type FriendDto,
  type FriendProfileDto,
  type FriendsDto,
  type InboxDto,
  type PersonDto,
  type Relation,
  type ShareLevel,
} from '@zenport/shared';
import type { AppContext } from '../../context.js';
import { dayKey } from '../../stats/compute.js';
import { asShareLevel } from './auth.js';

const DAY_MS = 86_400_000;
const LIVE_MS = 2 * 60_000;

interface UserRow {
  id: number;
  username: string;
  display_name: string | null;
  avatar: string | null;
  share_level: string;
  timezone: string;
}

interface SessionRow {
  id: number;
  item_id: string;
  started_at: string;
  last_beat_at: string | null;
  listened_sec: number;
  status: string;
  title: string;
  creator: string;
  type: string;
  cover_id: string | null;
}

const nameOf = (u: { display_name: string | null; username: string }) =>
  u.display_name || u.username;

const asType = (t: string, itemId: string): ContentType | 'timer' =>
  itemId === TIMER_ITEM_ID
    ? 'timer'
    : t === 'course' || t === 'talk' || t === 'soundscape'
      ? t
      : 'meditation';

const isStudy = (t: string) => t === 'course' || t === 'talk';
const counts = (s: SessionRow) => s.status === 'completed' || s.listened_sec >= 60;

function addDays(date: string, n: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

/** Consecutive days with practice, ending today (or yesterday, if today is still open). */
function streakOf(days: Set<string>, today: string): number {
  let d = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function registerFriendRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { db } = ctx;

  const user = (id: number) =>
    db
      .prepare(
        'SELECT id, username, display_name, avatar, share_level, timezone FROM users WHERE id = ?',
      )
      .get(id) as UserRow | undefined;

  const relationOf = (me: number, other: number): Relation => {
    const row = db
      .prepare(
        `SELECT user_id, status FROM friendships
         WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
      )
      .get(me, other, other, me) as { user_id: number; status: string } | undefined;
    if (!row) return 'none';
    if (row.status === 'accepted') return 'friend';
    return row.user_id === me ? 'outgoing' : 'incoming';
  };

  const areFriends = (a: number, b: number) => relationOf(a, b) === 'friend';

  const person = (u: UserRow, me: number): PersonDto => ({
    id: u.id,
    name: nameOf(u),
    username: u.username,
    avatar: u.avatar,
    relation: relationOf(me, u.id),
  });

  const sessionsOf = (userId: number, sinceIso: string) =>
    db
      .prepare(
        `SELECT s.id, s.item_id, s.started_at, s.last_beat_at, s.listened_sec, s.status,
                COALESCE(i.title, CASE WHEN s.item_id = ? THEN ? WHEN s.item_id LIKE 'ai:%' THEN 'Made for you' ELSE 'Removed recording' END) AS title,
                COALESCE(i.creator, '') AS creator,
                COALESCE(t.type, i.inferred_type, 'meditation') AS type,
                (SELECT a.id FROM assets a WHERE a.item_id = s.item_id AND a.kind = 'cover'
                   AND a.missing = 0 LIMIT 1) AS cover_id
         FROM practice_sessions s
         LEFT JOIN items i ON i.id = s.item_id
         LEFT JOIN item_types t ON t.item_id = s.item_id
         WHERE s.user_id = ? AND s.started_at >= ?
         ORDER BY s.started_at DESC`,
      )
      .all(TIMER_ITEM_ID, TIMER_ITEM_TITLE, userId, sinceIso) as unknown as SessionRow[];

  /** Practice days (not study) in the person's own timezone, over a window. */
  const practiceDays = (u: UserRow, rows: SessionRow[]) => {
    const byDay = new Map<string, number>();
    for (const s of rows) {
      if (s.status === 'active' || !counts(s) || isStudy(s.type)) continue;
      const d = dayKey(s.started_at, u.timezone);
      byDay.set(d, (byDay.get(d) ?? 0) + s.listened_sec / 60);
    }
    return byDay;
  };

  const bowsFor = (sessionIds: number[], me: number) => {
    const out = new Map<number, { n: number; mine: boolean }>();
    if (sessionIds.length === 0) return out;
    const rows = db
      .prepare(
        `SELECT session_id, COUNT(*) AS n, MAX(from_id = ?) AS mine FROM cheers
         WHERE kind = 'bow' AND session_id IN (${sessionIds.map(() => '?').join(',')})
         GROUP BY session_id`,
      )
      .all(me, ...sessionIds) as { session_id: number; n: number; mine: number }[];
    for (const r of rows) out.set(r.session_id, { n: r.n, mine: r.mine === 1 });
    return out;
  };

  const activity = (
    u: UserRow,
    s: SessionRow,
    bows?: { n: number; mine: boolean },
  ): FriendActivityDto => ({
    sessionId: s.id,
    friendId: u.id,
    friendName: nameOf(u),
    friendAvatar: u.avatar,
    itemId: s.item_id,
    title: s.title,
    creator: s.creator,
    type: asType(s.type, s.item_id),
    coverId: s.cover_id,
    minutes: Math.max(1, Math.round(s.listened_sec / 60)),
    at: s.last_beat_at ?? s.started_at,
    completed: s.status === 'completed',
    bows: bows?.n ?? 0,
    bowedByMe: bows?.mine ?? false,
  });

  /** Everything a friend card shows, cut to what that friend shares. */
  const friendCard = (me: UserRow, f: UserRow, since: string): FriendDto => {
    const share: ShareLevel = asShareLevel(f.share_level);
    const now = new Date();
    const today = dayKey(now.toISOString(), f.timezone);
    const base: FriendDto = {
      id: f.id,
      name: nameOf(f),
      username: f.username,
      avatar: f.avatar,
      shareLevel: share,
      friendsSince: since,
      today: null,
      streak: null,
      week: [],
      together: null,
      now: null,
      last: null,
      learning: null,
      nudgedToday: nudgedToday(me.id, f.id),
    };
    if (share === 'off') return base;

    const rows = sessionsOf(f.id, new Date(now.getTime() - 400 * DAY_MS).toISOString());
    const days = practiceDays(f, rows);
    const todayRows = rows.filter(
      (s) => s.status !== 'active' && dayKey(s.started_at, f.timezone) === today,
    );
    base.today = {
      minutes: Math.round(days.get(today) ?? 0),
      studyMinutes: Math.round(
        todayRows.filter((s) => isStudy(s.type)).reduce((n, s) => n + s.listened_sec / 60, 0),
      ),
    };
    base.streak = streakOf(new Set(days.keys()), today);
    base.week = Array.from({ length: 7 }, (_, i) => {
      const day = addDays(today, i - 6);
      return { day, minutes: Math.round(days.get(day) ?? 0) };
    });

    // Together: days both of you practised, counted back from today in your days.
    const mine = practiceDays(
      me,
      sessionsOf(me.id, new Date(now.getTime() - 400 * DAY_MS).toISOString()),
    );
    const myToday = dayKey(now.toISOString(), me.timezone);
    const both = new Set([...mine.keys()].filter((d) => days.has(d)));
    base.together = streakOf(both, myToday);

    const live = rows.find(
      (s) =>
        s.status === 'active' &&
        now.getTime() - new Date(s.last_beat_at ?? s.started_at).getTime() < LIVE_MS,
    );
    if (live) {
      base.now = {
        title: share === 'full' ? live.title : null,
        type: share === 'full' ? asType(live.type, live.item_id) : null,
        since: live.started_at,
      };
    }
    if (share === 'full') {
      const last = rows.find((s) => s.status !== 'active' && counts(s));
      if (last) base.last = activity(f, last, bowsFor([last.id], me.id).get(last.id));
      const course = db
        .prepare(
          `SELECT c.item_id, i.title,
                  (SELECT COUNT(*) FROM track_completions x WHERE x.user_id = c.user_id AND x.item_id = c.item_id) AS done,
                  (SELECT COUNT(*) FROM tracks t WHERE t.item_id = c.item_id AND t.missing = 0) AS total
           FROM track_completions c JOIN items i ON i.id = c.item_id
           WHERE c.user_id = ? ORDER BY c.rowid DESC LIMIT 1`,
        )
        .get(f.id) as { item_id: string; title: string; done: number; total: number } | undefined;
      if (course && course.done < course.total) {
        base.learning = {
          itemId: course.item_id,
          title: course.title,
          done: course.done,
          total: course.total,
        };
      }
    }
    return base;
  };

  const nudgedToday = (from: number, to: number) =>
    !!db
      .prepare(
        `SELECT 1 FROM cheers WHERE from_id = ? AND to_id = ? AND kind = 'nudge' AND created_at >= ?`,
      )
      .get(from, to, new Date(Date.now() - 20 * 3_600_000).toISOString());

  const friendRows = (me: number) =>
    db
      .prepare(
        `SELECT CASE WHEN user_id = ? THEN friend_id ELSE user_id END AS other,
                COALESCE(accepted_at, created_at) AS since
         FROM friendships WHERE status = 'accepted' AND (user_id = ? OR friend_id = ?)`,
      )
      .all(me, me, me) as { other: number; since: string }[];

  const pending = (me: number) => {
    const rows = db
      .prepare(
        `SELECT user_id, friend_id FROM friendships
         WHERE status = 'pending' AND (user_id = ? OR friend_id = ?) ORDER BY created_at DESC`,
      )
      .all(me, me) as { user_id: number; friend_id: number }[];
    const incoming: PersonDto[] = [];
    const outgoing: PersonDto[] = [];
    for (const r of rows) {
      const other = user(r.user_id === me ? r.friend_id : r.user_id);
      if (!other) continue;
      (r.user_id === me ? outgoing : incoming).push(person(other, me));
    }
    return { incoming, outgoing };
  };

  // --- Directory and requests ---

  app.get('/api/people', async (req): Promise<PersonDto[]> => {
    const me = req.user!.id;
    const rows = db
      .prepare(
        'SELECT id, username, display_name, avatar, share_level, timezone FROM users WHERE id != ? ORDER BY COALESCE(display_name, username) COLLATE NOCASE',
      )
      .all(me) as unknown as UserRow[];
    return rows.map((u) => person(u, me));
  });

  app.post('/api/friends/:id', async (req, reply) => {
    const me = req.user!.id;
    const other = Number((req.params as { id: string }).id);
    if (other === me || !user(other)) return reply.code(404).send({ error: 'no such person' });
    const rel = relationOf(me, other);
    const now = new Date().toISOString();
    if (rel === 'incoming') {
      // They already asked: asking back is saying yes.
      db.prepare(
        `UPDATE friendships SET status = 'accepted', accepted_at = ? WHERE user_id = ? AND friend_id = ?`,
      ).run(now, other, me);
    } else if (rel === 'none') {
      db.prepare(
        `INSERT INTO friendships (user_id, friend_id, status, created_at) VALUES (?, ?, 'pending', ?)`,
      ).run(me, other, now);
    }
    return { relation: relationOf(me, other) };
  });

  app.post('/api/friends/:id/accept', async (req, reply) => {
    const me = req.user!.id;
    const other = Number((req.params as { id: string }).id);
    const res = db
      .prepare(
        `UPDATE friendships SET status = 'accepted', accepted_at = ?
         WHERE user_id = ? AND friend_id = ? AND status = 'pending'`,
      )
      .run(new Date().toISOString(), other, me);
    if (res.changes === 0) return reply.code(404).send({ error: 'no request from them' });
    return { relation: 'friend' };
  });

  // Decline, cancel or unfriend - all the same act: the pair's row goes.
  app.delete('/api/friends/:id', async (req) => {
    const me = req.user!.id;
    const other = Number((req.params as { id: string }).id);
    db.prepare(
      'DELETE FROM friendships WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
    ).run(me, other, other, me);
    return { relation: 'none' };
  });

  // --- Dashboard, profile, feed ---

  app.get('/api/friends', async (req): Promise<FriendsDto> => {
    const me = user(req.user!.id)!;
    const friends = friendRows(me.id)
      .map((r) => {
        const f = user(r.other);
        return f ? friendCard(me, f, r.since) : null;
      })
      .filter((f): f is FriendDto => f !== null)
      // Sitting now first, then whoever practised most recently.
      .sort(
        (a, b) =>
          Number(!!b.now) - Number(!!a.now) ||
          (b.last?.at ?? '').localeCompare(a.last?.at ?? '') ||
          a.name.localeCompare(b.name),
      );
    return { friends, ...pending(me.id) };
  });

  app.get('/api/friends/:id', async (req, reply): Promise<FriendProfileDto | undefined> => {
    const me = user(req.user!.id)!;
    const id = Number((req.params as { id: string }).id);
    const f = user(id);
    const row = friendRows(me.id).find((r) => r.other === id);
    if (!f || !row) return reply.code(404).send({ error: 'not a friend' });
    const card = friendCard(me, f, row.since);
    const share = asShareLevel(f.share_level);
    if (share === 'off') {
      return {
        friend: card,
        days: [],
        totalMinutes: null,
        totalSessions: null,
        longestStreak: null,
        recent: [],
      };
    }
    const all = sessionsOf(f.id, '0000');
    const byDay = practiceDays(f, all);
    const today = dayKey(new Date().toISOString(), f.timezone);
    const days = Array.from({ length: 35 }, (_, i) => {
      const day = addDays(today, i - 34);
      return { day, minutes: Math.round(byDay.get(day) ?? 0) };
    });
    let longest = 0;
    let run = 0;
    let prev = '';
    for (const d of [...byDay.keys()].sort()) {
      run = prev && addDays(prev, 1) === d ? run + 1 : 1;
      longest = Math.max(longest, run);
      prev = d;
    }
    const finished = all.filter((s) => s.status !== 'active' && counts(s));
    const recentRows = share === 'full' ? finished.slice(0, 20) : [];
    const bows = bowsFor(
      recentRows.map((s) => s.id),
      me.id,
    );
    return {
      friend: card,
      days,
      totalMinutes: Math.round(
        finished.filter((s) => !isStudy(s.type)).reduce((n, s) => n + s.listened_sec / 60, 0),
      ),
      totalSessions: finished.filter((s) => !isStudy(s.type)).length,
      longestStreak: longest,
      recent: recentRows.map((s) => activity(f, s, bows.get(s.id))),
    };
  });

  app.get('/api/friends-feed', async (req): Promise<FriendActivityDto[]> => {
    const me = req.user!.id;
    const since = new Date(Date.now() - 14 * DAY_MS).toISOString();
    const out: { u: UserRow; s: SessionRow }[] = [];
    for (const r of friendRows(me)) {
      const f = user(r.other);
      if (!f || asShareLevel(f.share_level) !== 'full') continue;
      for (const s of sessionsOf(f.id, since)) {
        if (s.status !== 'active' && counts(s)) out.push({ u: f, s });
      }
    }
    out.sort((a, b) =>
      (b.s.last_beat_at ?? b.s.started_at).localeCompare(a.s.last_beat_at ?? a.s.started_at),
    );
    const top = out.slice(0, 40);
    const bows = bowsFor(
      top.map((x) => x.s.id),
      me,
    );
    return top.map(({ u, s }) => activity(u, s, bows.get(s.id)));
  });

  // --- Cheers: bows, nudges, invitations to sit ---

  app.post('/api/cheers', async (req, reply) => {
    const me = req.user!.id;
    const body = z
      .object({
        to: z.number().int(),
        kind: z.enum(['bow', 'nudge', 'sit']),
        sessionId: z.number().int().nullish(),
        itemId: z.string().max(200).nullish(),
        message: z.string().trim().max(140).nullish(),
      })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid cheer' });
    const { to, kind } = body.data;
    if (!areFriends(me, to)) return reply.code(403).send({ error: 'only between friends' });
    const now = new Date().toISOString();

    if (kind === 'bow') {
      const s = db
        .prepare('SELECT user_id FROM practice_sessions WHERE id = ?')
        .get(body.data.sessionId ?? -1) as { user_id: number } | undefined;
      const f = user(to);
      if (!s || s.user_id !== to || !f || asShareLevel(f.share_level) !== 'full') {
        return reply.code(404).send({ error: 'no such session' });
      }
      db.prepare(
        `INSERT OR IGNORE INTO cheers (from_id, to_id, session_id, kind, created_at)
         VALUES (?, ?, ?, 'bow', ?)`,
      ).run(me, to, body.data.sessionId ?? null, now);
      return { ok: true };
    }
    if (kind === 'nudge') {
      if (nudgedToday(me, to)) return reply.code(429).send({ error: 'one nudge a day is plenty' });
      db.prepare(
        `INSERT INTO cheers (from_id, to_id, kind, message, created_at) VALUES (?, ?, 'nudge', ?, ?)`,
      ).run(me, to, body.data.message || null, now);
      return { ok: true };
    }
    const item = db
      .prepare('SELECT id FROM items WHERE id = ? AND excluded = 0')
      .get(body.data.itemId ?? '');
    if (!item) return reply.code(404).send({ error: 'no such recording' });
    const recent = db
      .prepare(
        `SELECT 1 FROM cheers WHERE from_id = ? AND to_id = ? AND kind = 'sit' AND item_id = ? AND created_at >= ?`,
      )
      .get(me, to, body.data.itemId ?? '', new Date(Date.now() - 3_600_000).toISOString());
    if (recent) return reply.code(429).send({ error: 'already sent' });
    db.prepare(
      `INSERT INTO cheers (from_id, to_id, item_id, kind, message, created_at) VALUES (?, ?, ?, 'sit', ?, ?)`,
    ).run(me, to, body.data.itemId ?? '', body.data.message || null, now);
    return { ok: true };
  });

  // Unbow: a bow can be taken back.
  app.delete('/api/cheers/bow/:sessionId', async (req) => {
    db.prepare("DELETE FROM cheers WHERE from_id = ? AND session_id = ? AND kind = 'bow'").run(
      req.user!.id,
      Number((req.params as { sessionId: string }).sessionId),
    );
    return { ok: true };
  });

  app.get('/api/inbox', async (req): Promise<InboxDto> => {
    const me = req.user!.id;
    const rows = db
      .prepare(
        `SELECT c.id, c.kind, c.from_id, c.message, c.created_at, c.seen_at, c.item_id,
                u.username, u.display_name, u.avatar,
                COALESCE(i.title, CASE WHEN s.item_id = ? THEN ? WHEN s.item_id LIKE 'ai:%' THEN 'Made for you' END) AS session_title,
                ci.title AS item_title,
                (SELECT a.id FROM assets a WHERE a.item_id = c.item_id AND a.kind = 'cover'
                   AND a.missing = 0 LIMIT 1) AS item_cover
         FROM cheers c
         JOIN users u ON u.id = c.from_id
         LEFT JOIN practice_sessions s ON s.id = c.session_id
         LEFT JOIN items i ON i.id = s.item_id
         LEFT JOIN items ci ON ci.id = c.item_id
         WHERE c.to_id = ? AND c.created_at >= ?
         ORDER BY c.created_at DESC LIMIT 30`,
      )
      .all(
        TIMER_ITEM_ID,
        TIMER_ITEM_TITLE,
        me,
        new Date(Date.now() - 14 * DAY_MS).toISOString(),
      ) as {
      id: number;
      kind: string;
      from_id: number;
      message: string | null;
      created_at: string;
      seen_at: string | null;
      item_id: string | null;
      username: string;
      display_name: string | null;
      avatar: string | null;
      session_title: string | null;
      item_title: string | null;
      item_cover: string | null;
    }[];
    const cheers: CheerDto[] = rows.map((r) => ({
      id: r.id,
      kind: r.kind === 'nudge' ? 'nudge' : r.kind === 'sit' ? 'sit' : 'bow',
      from: { id: r.from_id, name: nameOf(r), avatar: r.avatar },
      sessionTitle: r.session_title,
      item:
        r.item_id && r.item_title
          ? { id: r.item_id, title: r.item_title, coverId: r.item_cover }
          : null,
      message: r.message,
      at: r.created_at,
      seen: !!r.seen_at,
    }));
    const { incoming } = pending(me);
    return {
      requests: incoming,
      cheers,
      unseen: incoming.length + cheers.filter((c) => !c.seen).length,
    };
  });

  app.post('/api/inbox/seen', async (req) => {
    db.prepare('UPDATE cheers SET seen_at = ? WHERE to_id = ? AND seen_at IS NULL').run(
      new Date().toISOString(),
      req.user!.id,
    );
    return { ok: true };
  });
}
