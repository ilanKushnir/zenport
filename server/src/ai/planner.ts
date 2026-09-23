/**
 * AI-assisted planning.
 *
 * The model is given a compact catalogue of the library - every item's type,
 * title, creator, series, length and its lessons in order - plus what the
 * person asked for, and returns an ordered practice track and an ordered
 * learning track that fit their time. It chooses and orders; everything else
 * (ids, dates, the plans themselves) stays in the app's hands:
 *
 * - Items are named to the model by short handles ("m12"), never real ids, and
 *   every handle in the answer is checked against the catalogue - a made-up
 *   item is dropped, not trusted.
 * - The answer is a proposal. Nothing is saved until the person accepts it.
 */
import type {
  AiPlanItemDto,
  AiPlanProposalDto,
  AiPlanRequest,
  AiPlanTrackDto,
  ContentType,
  MeditationSummaryDto,
} from '@zenport/shared';
import { isPracticeType, naturalCompare } from '@zenport/shared';
import type { Db } from '../db/index.js';

export interface CatalogEntry {
  handle: string;
  item: MeditationSummaryDto;
  lessons: { title: string; minutes: number | null; done: boolean }[];
}

// Generous: a planner that cannot see a course's later lessons cannot order them.
const MAX_LESSONS = 150;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Library items (present, not excluded) with their tracks in order. */
export function buildCatalog(
  db: Db,
  items: MeditationSummaryDto[],
  userId: number,
): CatalogEntry[] {
  const done = new Set(
    (
      db.prepare('SELECT track_id FROM track_completions WHERE user_id = ?').all(userId) as {
        track_id: string;
      }[]
    ).map((r) => r.track_id),
  );
  const trackStmt = db.prepare(
    'SELECT id, title, duration_sec FROM tracks WHERE item_id = ? AND missing = 0 ORDER BY ord',
  );
  return items
    .filter((i) => !i.missing)
    .sort(
      (a, b) =>
        naturalCompare(a.creator, b.creator) ||
        naturalCompare(a.collection ?? '', b.collection ?? '') ||
        naturalCompare(a.title, b.title),
    )
    .map((item, n) => ({
      handle: `m${n + 1}`,
      item,
      lessons: (
        trackStmt.all(item.id) as { id: string; title: string; duration_sec: number | null }[]
      ).map((t) => ({
        title: t.title,
        minutes: t.duration_sec ? Math.max(1, Math.round(t.duration_sec / 60)) : null,
        done: done.has(t.id),
      })),
    }));
}

export interface PracticeHistory {
  /** Per item: sessions, minutes and the last day it was played. */
  byItem: Map<string, { sessions: number; minutes: number; last: string }>;
  /** A few plain lines about the person's practice overall. */
  summary: string;
}

/** What this account has actually practised and studied, for the planner. */
export function practiceHistory(db: Db, userId: number, timezone: string): PracticeHistory {
  const rows = db
    .prepare(
      `SELECT item_id, COUNT(*) AS sessions, SUM(listened_sec) AS secs, MAX(started_at) AS last
       FROM practice_sessions WHERE user_id = ? AND status != 'active' GROUP BY item_id`,
    )
    .all(userId) as { item_id: string; sessions: number; secs: number | null; last: string }[];
  const byItem = new Map(
    rows.map((r) => [
      r.item_id,
      { sessions: r.sessions, minutes: Math.round((r.secs ?? 0) / 60), last: r.last.slice(0, 10) },
    ]),
  );
  const recent = db
    .prepare(
      `SELECT COUNT(*) AS n, SUM(listened_sec) AS secs, COUNT(DISTINCT substr(started_at, 1, 10)) AS days
       FROM practice_sessions WHERE user_id = ? AND status != 'active' AND started_at >= ?`,
    )
    .get(userId, new Date(Date.now() - 30 * 86_400_000).toISOString()) as {
    n: number;
    secs: number | null;
    days: number;
  };
  const total = rows.reduce((n, r) => n + r.sessions, 0);
  const lessons = (
    db.prepare('SELECT COUNT(*) AS n FROM track_completions WHERE user_id = ?').get(userId) as {
      n: number;
    }
  ).n;
  const summary =
    total === 0
      ? 'History: nothing practised or studied in ZenPort yet.'
      : `History: ${total} sessions in all; in the last 30 days ${recent.n} sessions on ${recent.days} days, ${Math.round(
          (recent.secs ?? 0) / 60,
        )} minutes. ${lessons} lessons finished. (Time zone ${timezone}.)`;
  return { byItem, summary };
}

/** One line per item, lessons indented beneath - dense but readable. */
export function renderCatalog(entries: CatalogEntry[], history?: PracticeHistory): string {
  const lines: string[] = [];
  for (const e of entries) {
    const i = e.item;
    const total = i.totalDurationSec
      ? `${Math.round(i.totalDurationSec / 60)} min`
      : 'length unknown';
    const h = history?.byItem.get(i.id);
    const progress =
      (i.completedCount > 0 ? `, ${i.completedCount}/${i.trackCount} done` : '') +
      (h ? `, played ${h.sessions}x (${h.minutes} min, last ${h.last})` : '');
    lines.push(
      `${e.handle} | ${i.type}${i.hasVideo ? ' (video)' : ''} | ${clip(i.creator, 60)}${
        i.collection ? ` > ${clip(i.collection, 80)}` : ''
      } > ${clip(i.title, 100)} | ${i.trackCount} track${i.trackCount === 1 ? '' : 's'}, ${total}${progress}`,
    );
    if (e.lessons.length > 1) {
      for (const [k, l] of e.lessons.slice(0, MAX_LESSONS).entries()) {
        lines.push(
          `    ${k + 1}. ${clip(l.title, 90)}${l.minutes ? ` (${l.minutes}m)` : ''}${l.done ? ' [done]' : ''}`,
        );
      }
      if (e.lessons.length > MAX_LESSONS)
        lines.push(`    … ${e.lessons.length - MAX_LESSONS} more`);
    }
  }
  return lines.join('\n');
}

const trackSchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['daysOfWeek', 'minutesPerSession', 'preferredTime', 'items'],
  properties: {
    daysOfWeek: { type: 'array', items: { type: 'integer', minimum: 0, maximum: 6 } },
    minutesPerSession: { type: 'integer', minimum: 1, maximum: 600 },
    preferredTime: { type: ['string', 'null'], description: 'HH:MM, 24h' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['handle', 'why'],
        properties: {
          handle: { type: 'string' },
          why: {
            type: 'string',
            description: 'One short sentence: why this, and why here in the order.',
          },
        },
      },
    },
  },
} as const;

export const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'intention', 'summary', 'weeks', 'practice', 'learning', 'outline'],
  properties: {
    weeks: {
      type: 'integer',
      minimum: 1,
      maximum: 52,
      description: 'How many weeks the plan runs.',
    },
    name: { type: 'string', description: 'Short plan name, at most 40 characters.' },
    intention: {
      type: 'string',
      description: 'One warm line in second person, at most 120 characters.',
    },
    summary: { type: 'string', description: 'Two or three sentences on the shape of the plan.' },
    practice: trackSchema,
    learning: trackSchema,
    outline: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['week', 'focus'],
        properties: { week: { type: 'integer' }, focus: { type: 'string' } },
      },
    },
  },
} as const;

const TIME = { morning: '07:00', midday: '12:30', evening: '20:00', any: null } as const;

export function planPrompt(
  req: AiPlanRequest,
  catalog: string,
  history = '',
): { system: string; user: string } {
  const system = [
    'You are a thoughtful meditation teacher and curriculum designer. You build a personal plan',
    "strictly from the person's own library, described in the catalogue below.",
    '',
    'Rules:',
    '- Use only handles that appear in the catalogue. Never invent items.',
    '- Practice items must be meditations or soundscapes. Learning items must be courses or talks.',
    '- Order each list in the sequence it should be consumed: a series and its lessons in their own order,',
    '  foundations before advanced work, an introduction before the practice it introduces.',
    '- Fit the time given: pick practices whose length suits the minutes per session, and enough learning',
    '  to fill the weekly study time for the number of weeks - not much more.',
    '- Use the history: build on what the person already practises, continue courses where they left off,',
    '  and do not repeat what is finished unless asked. Items played often are favourites - use them wisely.',
    '- Prefer unfinished items unless asked to include finished ones.',
    '- Spread the days of the week evenly (0 = Sunday). If a track is not requested, return null for it.',
    '- Write "why" as one short, specific sentence. Keep the tone warm, plain and unhyped.',
  ].join('\n');
  const user = [
    `What I want: ${req.goal.trim() || 'a steady, balanced practice'}`,
    req.weeks
      ? `Length: ${req.weeks} week${req.weeks === 1 ? '' : 's'}, starting ${req.startDate}. Return weeks = ${req.weeks}.`
      : `Length: your call - as long as the chosen content needs at this pace (1 to 52 weeks), starting ${req.startDate}. Return it as weeks.`,
    req.practice
      ? `Practice: ${req.practice.daysPerWeek} days a week, about ${req.practice.minutes} minutes each.`
      : 'Practice: none - return null for practice.',
    req.learning
      ? `Learning: about ${req.learning.minutesPerWeek} minutes a week over ${req.learning.daysPerWeek} days.`
      : 'Learning: none - return null for learning.',
    `Time of day: ${req.timeOfDay}${TIME[req.timeOfDay] ? ` (use ${TIME[req.timeOfDay]})` : ''}.`,
    `Experience: ${{ new: 'new to meditation', some: 'some experience', experienced: 'experienced' }[req.level]}.`,
    req.creators.length ? `Only use these creators: ${req.creators.join(', ')}.` : '',
    req.includeFinished
      ? 'Finished items may be repeated.'
      : 'Avoid items marked done unless nothing else fits.',
    history,
    '',
    'Catalogue (handle | type | creator > series > title | tracks, length, progress, history; lessons listed beneath):',
    catalog,
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

interface RawTrack {
  daysOfWeek: number[];
  minutesPerSession: number;
  preferredTime: string | null;
  items: { handle: string; why: string }[];
}

interface RawPlan {
  name: string;
  weeks: number;
  intention: string;
  summary: string;
  practice: RawTrack | null;
  learning: RawTrack | null;
  outline: { week: number; focus: string }[];
}

/**
 * Turn the model's answer into a proposal, trusting nothing: unknown handles
 * and wrong-kind items are dropped, days and minutes are clamped, and a track
 * that ends up empty becomes null.
 */
export function resolveProposal(
  raw: unknown,
  entries: CatalogEntry[],
  req: AiPlanRequest,
  model: string,
): AiPlanProposalDto {
  const plan = raw as RawPlan;
  const byHandle = new Map(entries.map((e) => [e.handle, e.item]));
  const track = (t: RawTrack | null, want: (type: ContentType) => boolean, fallbackMin: number) => {
    if (!t) return null;
    const seen = new Set<string>();
    const items: AiPlanItemDto[] = [];
    for (const { handle, why } of t.items ?? []) {
      const item = byHandle.get(handle);
      if (!item || seen.has(item.id) || !want(item.type)) continue;
      seen.add(item.id);
      items.push({ id: item.id, why: clip(String(why ?? ''), 240), item });
    }
    if (items.length === 0) return null;
    const days = [
      ...new Set((t.daysOfWeek ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
    ].sort();
    const out: AiPlanTrackDto = {
      daysOfWeek: days,
      minutesPerSession: Math.min(600, Math.max(1, Math.round(t.minutesPerSession || fallbackMin))),
      preferredTime: /^\d{2}:\d{2}$/.test(t.preferredTime ?? '')
        ? t.preferredTime
        : TIME[req.timeOfDay],
      items,
    };
    return out;
  };
  const learningMinutes = req.learning
    ? Math.round(req.learning.minutesPerWeek / Math.max(1, req.learning.daysPerWeek))
    : 30;
  return {
    name: clip(String(plan.name ?? 'My plan'), 60),
    intention: clip(String(plan.intention ?? ''), 160),
    summary: clip(String(plan.summary ?? ''), 600),
    practice: req.practice ? track(plan.practice, isPracticeType, req.practice.minutes) : null,
    learning: req.learning
      ? track(plan.learning, (t) => !isPracticeType(t), learningMinutes)
      : null,
    outline: (plan.outline ?? [])
      .filter((o) => Number.isInteger(o.week) && o.week >= 1 && o.week <= 52)
      .slice(0, 52)
      .map((o) => ({ week: o.week, focus: clip(String(o.focus ?? ''), 160) })),
    weeks: req.weeks ?? Math.min(52, Math.max(1, Math.round(Number(plan.weeks) || 4))),
    model,
  };
}
