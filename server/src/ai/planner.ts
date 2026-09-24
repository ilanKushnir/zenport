/**
 * AI-assisted planning.
 *
 * The model is given a compact catalogue of the library - every item's type,
 * title, creator, series, length and its lessons in order - plus what the
 * person asked for, and returns a path: stages of practice or learning, each
 * with its own start week and length, running side by side or one after
 * another as the person chose. It chooses and orders; everything else
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
  AiPlanStageDto,
  PlanApproach,
  MeditationSummaryDto,
} from '@zenport/shared';
import { isPracticeType, naturalCompare } from '@zenport/shared';
import type { Db } from '../db/index.js';

export interface CatalogEntry {
  handle: string;
  item: MeditationSummaryDto;
  lessons: { title: string; minutes: number | null; done: boolean; practice: boolean }[];
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
    `SELECT t.id, t.title, t.duration_sec, COALESCE(r.role, t.inferred_role) AS role
     FROM tracks t LEFT JOIN track_roles r ON r.track_id = t.id
     WHERE t.item_id = ? AND t.missing = 0 ORDER BY t.ord`,
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
        trackStmt.all(item.id) as {
          id: string;
          title: string;
          duration_sec: number | null;
          role: string;
        }[]
      ).map((t) => ({
        title: t.title,
        minutes: t.duration_sec ? Math.max(1, Math.round(t.duration_sec / 60)) : null,
        done: done.has(t.id),
        practice: !isPracticeType(item.type) && t.role === 'practice',
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
export function renderCatalog(
  entries: CatalogEntry[],
  history?: PracticeHistory,
  planned?: Map<string, string[]>,
): string {
  const lines: string[] = [];
  for (const e of entries) {
    const i = e.item;
    const total = i.totalDurationSec
      ? `${Math.round(i.totalDurationSec / 60)} min`
      : 'length unknown';
    const h = history?.byItem.get(i.id);
    const progress =
      (i.completedCount > 0 ? `, ${i.completedCount}/${i.trackCount} done` : '') +
      (h ? `, played ${h.sessions}x (${h.minutes} min, last ${h.last})` : '') +
      (planned?.get(i.id)?.length
        ? `, [in another plan: ${planned
            .get(i.id)!
            .map((n) => `"${clip(n, 40)}"`)
            .join(', ')}]`
        : '');
    lines.push(
      `${e.handle} | ${i.type}${i.hasVideo ? ' (video)' : ''} | ${clip(i.creator, 60)}${
        i.collection ? ` > ${clip(i.collection, 80)}` : ''
      } > ${clip(i.title, 100)} | ${i.trackCount} track${i.trackCount === 1 ? '' : 's'}, ${total}${progress}`,
    );
    if (e.lessons.length > 1) {
      for (const [k, l] of e.lessons.slice(0, MAX_LESSONS).entries()) {
        lines.push(
          `    ${k + 1}. ${clip(l.title, 90)}${l.minutes ? ` (${l.minutes}m)` : ''}${l.practice ? ' [guided practice]' : ''}${l.done ? ' [done]' : ''}`,
        );
      }
      if (e.lessons.length > MAX_LESSONS)
        lines.push(`    … ${e.lessons.length - MAX_LESSONS} more`);
    }
  }
  return lines.join('\n');
}

/** Longest path the planner may lay out: three years, for "until it's done". */
export const MAX_WEEKS = 156;

const stageSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'focus',
    'startWeek',
    'weeks',
    'daysOfWeek',
    'minutesPerSession',
    'preferredTime',
    'items',
  ],
  properties: {
    title: { type: 'string', description: 'A few words naming this stage, e.g. "Foundations".' },
    focus: { type: 'string', enum: ['practice', 'learning'] },
    startWeek: { type: 'integer', minimum: 1, maximum: MAX_WEEKS },
    weeks: { type: 'integer', minimum: 1, maximum: MAX_WEEKS },
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
  required: [
    'name',
    'intention',
    'summary',
    'why',
    'tips',
    'weeks',
    'approach',
    'stages',
    'outline',
  ],
  properties: {
    weeks: {
      type: 'integer',
      minimum: 1,
      maximum: MAX_WEEKS,
      description: 'How many weeks the whole path runs.',
    },
    name: { type: 'string', description: 'Short plan name, at most 40 characters.' },
    intention: {
      type: 'string',
      description: 'One warm line in second person, at most 120 characters.',
    },
    summary: { type: 'string', description: 'Two or three sentences on the shape of the path.' },
    why: {
      type: 'string',
      description:
        "The reasoning, in 3-6 plain sentences to the person: why these items come first and in this order, what each stage prepares for the next, and - where you know it from the teacher's published work - the path students of this teacher usually follow. Name items by their titles.",
    },
    tips: {
      type: 'array',
      items: { type: 'string' },
      description: '2-4 short, practical tips for following this path well.',
    },
    approach: { type: 'string', enum: ['together', 'learn-first', 'alternate'] },
    stages: { type: 'array', items: stageSchema },
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

const APPROACH_RULES: Record<PlanApproach, string> = {
  together:
    'Approach "together": one practice stage and one learning stage, both from week 1 to the end, side by side. Return approach "together".',
  'learn-first':
    'Approach "learn-first": learning comes first - one learning stage per course or talk series, one after another from the widest foundations to the most advanced, each long enough to finish at the weekly study time. Guided practices inside a course are done as they come. Only after the last learning stage does a practice stage begin: a steady routine that climbs the meditations in order of level. A light practice stage alongside the learning is fine only if the person asked for it. Return approach "learn-first".',
  alternate:
    'Approach "alternate": take turns - a learning stage for one course, then a practice stage of a few weeks deepening what it taught (its creator\'s meditations at the matching level), then the next course, and so on. Stages do not overlap. Return approach "alternate".',
  ai: 'Approach: your call - choose "together", "learn-first" or "alternate", whichever best serves the goal, experience and library, and lay the stages out accordingly. Return the approach you chose.',
};

const TIME = { morning: '07:00', midday: '12:30', evening: '20:00', any: null } as const;

export function planPrompt(
  req: AiPlanRequest,
  catalog: string,
  history = '',
): { system: string; user: string } {
  const both = Boolean(req.practice && req.learning);
  const system = [
    'You are a thoughtful meditation teacher and curriculum designer. You build a personal path',
    "strictly from the person's own library, described in the catalogue below.",
    '',
    'A path is a list of stages. Each stage is practice (meditations, soundscapes) or learning',
    '(courses, talks), starts in a week of the path and runs for some weeks, on set days, in order.',
    'Stages may run side by side or one after another. Week 1 is the first week.',
    '',
    'Rules:',
    '- Use only handles that appear in the catalogue. Never invent items.',
    '- Practice stages hold only meditations or soundscapes; learning stages only courses or talks.',
    '- Order each stage in the sequence it should be consumed: a series and its lessons in their own order,',
    '  foundations before advanced work, an introduction before the practice it introduces. Where',
    '  titles carry levels, parts or numbers, climb them in order.',
    '- Lessons marked [guided practice] are meditations inside a course; they are done as the course',
    '  reaches them, so do not schedule them again elsewhere.',
    '- Fit the time given: practices whose length suits the minutes per session, and learning stages',
    '  long enough to finish their courses at the weekly study time (sum the lesson minutes).',
    '- Use the history: build on what the person already practises, continue courses where they left off,',
    '  and do not repeat what is finished unless asked. Items played often are favourites - use them wisely.',
    '- Spread the days of the week evenly (0 = Sunday). Stages must end by the last week of the path.',
    '- Write each item\'s "why" as one short, specific sentence. Keep the tone warm, plain and unhyped.',
    '- Write dates in words (Monday 28 September), never as YYYY-MM-DD.',
    '- Explain the whole path in "why": the reasoning behind the order and the foundations, so the person',
    '  can trust it. Draw on what you genuinely know about the teachers and courses in the catalogue (for',
    '  example which course is usually taken first); never invent facts, and say "usually" rather than',
    '  claiming certainty. Then give 2-4 practical "tips" for following it.',
  ].join('\n');
  const length = req.weeks
    ? `Length: ${req.weeks} week${req.weeks === 1 ? '' : 's'}, starting ${req.startDate}. Return weeks = ${req.weeks}.`
    : req.untilComplete
      ? `Length: as long as it takes. Lay out the whole path to the goal - every course and practice it needs, in order - at this pace, however many weeks that is (up to ${MAX_WEEKS}), starting ${req.startDate}. Return the total as weeks.`
      : `Length: your call - a sensible first stretch for this goal at this pace (1 to 52 weeks), starting ${req.startDate}. Return it as weeks.`;
  const user = [
    `What I want: ${req.goal.trim() || 'a steady, balanced practice'}`,
    length,
    req.practice
      ? `Practice: ${req.practice.daysPerWeek} days a week, about ${req.practice.minutes} minutes each.`
      : 'Practice: none - no practice stages.',
    req.learning
      ? `Learning: about ${req.learning.minutesPerWeek} minutes a week over ${req.learning.daysPerWeek} days.`
      : 'Learning: none - no learning stages.',
    both
      ? APPROACH_RULES[req.approach ?? 'together']
      : 'Only one kind is wanted: stages of that kind, one after another where the content has a natural order. Return approach "together".',
    `Time of day: ${req.timeOfDay}${TIME[req.timeOfDay] ? ` (use ${TIME[req.timeOfDay]})` : ''}.`,
    `Experience: ${{ new: 'new to meditation', some: 'some experience', experienced: 'experienced' }[req.level]}.`,
    req.creators.length ? `Only use these creators: ${req.creators.join(', ')}.` : '',
    req.includeFinished
      ? 'Finished items may be repeated.'
      : 'Avoid items marked done unless nothing else fits.',
    req.includePlanned
      ? 'Items marked [in another plan] may be used again.'
      : 'Leave out courses and talks marked [in another plan] - they are already scheduled.',
    history,
    '',
    'Catalogue (handle | type | creator > series > title | tracks, length, progress, history; lessons listed beneath):',
    catalog,
  ]
    .filter(Boolean)
    .join('\n');
  return { system, user };
}

interface RawStage {
  title: string;
  focus: string;
  startWeek: number;
  weeks: number;
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
  approach: string;
  why: string;
  tips: string[];
  stages: RawStage[];
  outline: { week: number; focus: string }[];
}

const int = (v: unknown, lo: number, hi: number, fallback: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
};

/**
 * Turn the model's answer into a proposal, trusting nothing: unknown handles
 * and wrong-kind items are dropped (so is a kind the person switched off),
 * weeks, days and minutes are clamped into the path, and an empty stage goes.
 */
export function resolveProposal(
  raw: unknown,
  entries: CatalogEntry[],
  req: AiPlanRequest,
  model: string,
  planned: ReadonlySet<string> = new Set(),
): AiPlanProposalDto {
  const plan = raw as RawPlan;
  const byHandle = new Map(entries.map((e) => [e.handle, e.item]));
  const cap = req.weeks ?? (req.untilComplete ? MAX_WEEKS : 52);
  let total = req.weeks ?? int(plan.weeks, 1, cap, 4);
  const learningMinutes = req.learning
    ? Math.round(req.learning.minutesPerWeek / Math.max(1, req.learning.daysPerWeek))
    : 30;
  const stages: AiPlanStageDto[] = [];
  for (const st of Array.isArray(plan.stages) ? plan.stages : []) {
    const focus = st.focus === 'learning' ? 'learning' : 'practice';
    if (focus === 'practice' ? !req.practice : !req.learning) continue;
    const want = (t: MeditationSummaryDto['type']) =>
      focus === 'practice' ? isPracticeType(t) : !isPracticeType(t);
    const seen = new Set<string>();
    const items: AiPlanItemDto[] = [];
    for (const { handle, why } of st.items ?? []) {
      const item = byHandle.get(handle);
      if (!item || seen.has(item.id) || !want(item.type)) continue;
      // A course already scheduled elsewhere is not planned twice unless asked.
      if (focus === 'learning' && !req.includePlanned && planned.has(item.id)) continue;
      seen.add(item.id);
      items.push({ id: item.id, why: clip(String(why ?? ''), 240), item });
    }
    if (items.length === 0) continue;
    const startWeek = int(st.startWeek, 1, cap, 1);
    const weeks = int(st.weeks, 1, cap - startWeek + 1, 1);
    // A chosen length is fixed; a planner-chosen one grows to fit its stages.
    if (!req.weeks) total = Math.max(total, startWeek + weeks - 1);
    const days = [
      ...new Set((st.daysOfWeek ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
    ].sort();
    stages.push({
      title: clip(String(st.title ?? '') || (focus === 'learning' ? 'Learning' : 'Practice'), 60),
      focus,
      startWeek,
      weeks: Math.min(weeks, total - startWeek + 1),
      daysOfWeek: days,
      minutesPerSession: int(
        st.minutesPerSession,
        1,
        600,
        focus === 'practice' ? (req.practice?.minutes ?? 20) : learningMinutes,
      ),
      preferredTime: /^\d{2}:\d{2}$/.test(st.preferredTime ?? '')
        ? st.preferredTime
        : TIME[req.timeOfDay],
      items,
    });
  }
  stages.sort((a, b) => a.startWeek - b.startWeek || (a.focus === 'learning' ? -1 : 1));
  const approach: PlanApproach = (['together', 'learn-first', 'alternate'] as const).includes(
    plan.approach as 'together',
  )
    ? (plan.approach as PlanApproach)
    : (req.approach ?? 'together');
  return {
    name: clip(String(plan.name ?? 'My plan'), 60),
    intention: clip(String(plan.intention ?? ''), 160),
    summary: clip(String(plan.summary ?? ''), 600),
    approach,
    why: clip(String(plan.why ?? ''), 1500),
    tips: (Array.isArray(plan.tips) ? plan.tips : [])
      .map((t) => clip(String(t ?? '').trim(), 240))
      .filter(Boolean)
      .slice(0, 5),
    stages: stages.filter((st) => st.startWeek <= total),
    outline: (plan.outline ?? [])
      .filter((o) => Number.isInteger(o.week) && o.week >= 1 && o.week <= total)
      .slice(0, MAX_WEEKS)
      .map((o) => ({ week: o.week, focus: clip(String(o.focus ?? ''), 160) })),
    weeks: total,
    model,
  };
}
