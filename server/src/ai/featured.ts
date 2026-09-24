/**
 * For you today (opt-in): one meditation from the person's own library,
 * picked by their AI, with a line on why it fits now.
 *
 * Deliberately not the plan: the pick comes from what they have practised,
 * what they have not tried, their intentions and the time of day.
 *
 * A pick stays until one of three things happens - never on a timer alone:
 * - they begin it (a practice session of it after it was picked),
 * - they ask for another (refresh),
 * - it sat unopened for STALE_DAYS (opening its page counts as opened).
 * The last few picks are remembered so a new one is new.
 */
import type { FeaturedPickDto, MeditationSummaryDto } from '@zenport/shared';
import type { Config } from '../config.js';
import { listByShelf } from './catalog.js';
import type { Db } from '../db/index.js';
import { libraryDto } from '../library/queries.js';
import { dayKey } from '../stats/compute.js';
import { intentionsSummary, readIntentions } from './intentions.js';
import type { AiClient, AiTarget } from './providers.js';

export const STALE_DAYS = 3;
const REMEMBER = 8;
const DAY_MS = 86_400_000;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const FEATURED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['handle', 'why'],
  properties: {
    handle: { type: 'string' },
    why: {
      type: 'string',
      description: 'Why this, now: one or two short sentences, at most 140 characters.',
    },
  },
} as const;

export const FEATURED_SYSTEM = [
  "You choose one guided meditation from a person's own library for them to practise next,",
  'with a line on why it fits now. Draw on what they have practised (what they return to, what',
  'they have not touched in a while), what they have never tried, their intentions, and the day',
  'and time. Their plans are handled elsewhere: do not follow or repeat a schedule.',
  '',
  '- Use only a handle from the list, and none of those marked as not to pick.',
  '- "why" speaks to them ("you"), is specific and kind, at most 140 characters, never names a',
  '  handle. No emojis.',
  '- Write in the language their intentions are written in; English if unsure.',
].join('\n');

function partOfDay(hour: number): string {
  return hour < 5
    ? 'night'
    : hour < 12
      ? 'morning'
      : hour < 17
        ? 'afternoon'
        : hour < 22
          ? 'evening'
          : 'night';
}

/** Meditations to choose from (soundscapes too, if there are no meditations). */
export function candidates(items: MeditationSummaryDto[]): MeditationSummaryDto[] {
  const present = items.filter((i) => !i.missing);
  const meditations = present.filter((i) => i.type === 'meditation');
  return meditations.length > 0 ? meditations : present.filter((i) => i.type === 'soundscape');
}

/** What the picker is told: now, intentions, history - and the meditations. */
export function featuredContext(
  db: Db,
  items: MeditationSummaryDto[],
  user: { id: number; timezone: string },
  avoid: ReadonlySet<string>,
  now = new Date(),
): { text: string; handles: Map<string, MeditationSummaryDto> } {
  const tz = user.timezone;
  const today = dayKey(now.toISOString(), tz);
  const hm = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: tz,
  }).formatToParts(now);
  const part = (t: string) => hm.find((p) => p.type === t)?.value ?? '';

  const handles = new Map<string, MeditationSummaryDto>();
  const handleOf = new Map<string, string>();
  items.forEach((i, n) => {
    handles.set(`m${n + 1}`, i);
    handleOf.set(i.id, `m${n + 1}`);
  });

  const rows = db
    .prepare(
      `SELECT item_id, COUNT(*) AS n, MAX(started_at) AS last
       FROM practice_sessions WHERE user_id = ? AND status != 'active' AND started_at >= ?
         AND (status = 'completed' OR listened_sec >= 60)
       GROUP BY item_id`,
    )
    .all(user.id, new Date(now.getTime() - 60 * DAY_MS).toISOString()) as {
    item_id: string;
    n: number;
    last: string;
  }[];
  const recent = new Map(rows.map((r) => [r.item_id, r]));

  const lines: string[] = [];
  lines.push(
    `Now: ${part('weekday')} ${today}, ${part('hour')}:${part('minute')} (${partOfDay(Number(part('hour')))}).`,
  );
  const i = readIntentions(db, user.id);
  lines.push(i ? intentionsSummary(i) : 'They have not written down their intentions.');
  lines.push('');
  // What is not to be picked (just done, picked lately) is simply left out.
  lines.push(
    'Meditations to choose from, by creator > series (handle title · length · their history; no history = never tried):',
  );
  lines.push(
    ...listByShelf(
      [...handles]
        .filter(([, it]) => !avoid.has(it.id))
        .map(([h, it]) => {
          const r = recent.get(it.id);
          const history = r
            ? `${r.n}x in 60 days, last ${dayKey(r.last, tz)}`
            : it.practiceCount > 0
              ? `done ${it.practiceCount}x, not lately`
              : '';
          return {
            handle: h,
            item: it,
            tail: [
              `${it.totalDurationSec ? `${Math.round(it.totalDurationSec / 60)} min` : '?'}${it.trackCount > 1 ? `, ${it.trackCount} parts` : ''}`,
              history,
            ]
              .filter(Boolean)
              .join(' · '),
          };
        }),
    ),
  );
  return { text: lines.join('\n'), handles };
}

/** The answer, checked: a known handle, not one to avoid, a capped line. */
export function resolvePick(
  raw: unknown,
  handles: Map<string, MeditationSummaryDto>,
  avoid: ReadonlySet<string> = new Set(),
): { id: string; why: string } | null {
  const r = (raw ?? {}) as { handle?: string; why?: string };
  const item = handles.get(String(r.handle ?? '').trim());
  if (!item || avoid.has(item.id)) return null;
  const why = String(r.why ?? '')
    .replace(/\bm\d+\b/g, 'it')
    .trim();
  return { id: item.id, why: clip(why, 160) };
}

interface Row {
  day: string;
  body: string;
  created_at: string;
  opened_at: string | null;
}

interface Body {
  pick: { id: string; why: string } | null;
  previous: string[];
  /** Stored by the three-pick version: replaced at the next look. */
  legacy?: boolean;
}

function parseBody(raw: string): Body {
  const v = JSON.parse(raw) as unknown;
  // Before one pick, a list of three.
  if (Array.isArray(v)) {
    const list = v as { id: string; why: string }[];
    return { pick: list[0] ?? null, previous: list.map((p) => p.id), legacy: true };
  }
  return v as Body;
}

const read = (db: Db, userId: number) =>
  db
    .prepare('SELECT day, body, created_at, opened_at FROM featured_picks WHERE user_id = ?')
    .get(userId) as Row | undefined;

/** Does the current pick still stand, or is a new one due? */
export function pickIsDue(db: Db, userId: number, now = new Date()): boolean {
  const row = read(db, userId);
  if (!row) return true;
  const { pick, legacy } = parseBody(row.body);
  if (!pick || legacy) return true;
  const begun = db
    .prepare(
      'SELECT 1 FROM practice_sessions WHERE user_id = ? AND item_id = ? AND started_at >= ? LIMIT 1',
    )
    .get(userId, pick.id, row.created_at);
  if (begun) return true;
  const stale = !row.opened_at && now.getTime() - Date.parse(row.created_at) > STALE_DAYS * DAY_MS;
  return stale;
}

const inFlight = new Map<number, Promise<void>>();

/** Make a new pick - one at a time per person. */
export async function generateFeatured(
  db: Db,
  config: Config,
  ai: AiClient,
  target: AiTarget,
  user: { id: number; timezone: string },
): Promise<void> {
  const running = inFlight.get(user.id);
  if (running) return running;
  const job = (async () => {
    const items = candidates(libraryDto(db, config, user.id).items);
    if (items.length === 0) return;
    const row = read(db, user.id);
    const before = row ? parseBody(row.body) : { pick: null, previous: [] };
    // Not the one it replaces, not lately picked, not the last thing played.
    const last = db
      .prepare(
        `SELECT item_id FROM practice_sessions WHERE user_id = ? AND status != 'active'
         ORDER BY started_at DESC LIMIT 1`,
      )
      .get(user.id) as { item_id: string } | undefined;
    const avoid = new Set([
      ...before.previous,
      ...(before.pick ? [before.pick.id] : []),
      ...(last ? [last.item_id] : []),
    ]);
    // A small library cannot avoid everything: keep at least one to choose.
    if (items.every((i) => avoid.has(i.id))) avoid.clear();
    const { text, handles } = featuredContext(db, items, user, avoid);
    const ask = (extra = '') =>
      ai.chatJson(target, {
        system: FEATURED_SYSTEM,
        user: text + extra,
        schemaName: 'zenport_featured',
        schema: FEATURED_SCHEMA as unknown as Record<string, unknown>,
      });
    let pick = resolvePick(await ask(), handles, avoid);
    if (!pick) {
      pick = resolvePick(
        await ask('\n\nYour answer was not one of the handles allowed. Choose one from the list.'),
        handles,
        avoid,
      );
    }
    if (!pick) throw new Error('no usable pick');
    const previous = [
      ...(before.pick ? [before.pick.id] : []),
      ...before.previous.filter((id) => id !== before.pick?.id),
    ].slice(0, REMEMBER);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO featured_picks (user_id, day, body, model, created_at, opened_at)
       VALUES (?, ?, ?, ?, ?, NULL)
       ON CONFLICT(user_id) DO UPDATE SET day = excluded.day, body = excluded.body,
         model = excluded.model, created_at = excluded.created_at, opened_at = NULL`,
    ).run(
      user.id,
      dayKey(now, user.timezone),
      JSON.stringify({ pick, previous } satisfies Body),
      target.model,
      now,
    );
  })();
  inFlight.set(user.id, job);
  try {
    await job;
  } finally {
    inFlight.delete(user.id);
  }
}

/** The pick as stored, resolved against the library now. */
export function readFeatured(
  db: Db,
  config: Config,
  user: { id: number; timezone: string },
): { picks: FeaturedPickDto[]; day: string | null; generatedAt: string | null } {
  const row = read(db, user.id);
  if (!row) return { picks: [], day: null, generatedAt: null };
  const { pick } = parseBody(row.body);
  const item = pick
    ? libraryDto(db, config, user.id).items.find((i) => i.id === pick.id && !i.missing)
    : undefined;
  return {
    picks: item && pick ? [{ item, why: pick.why }] : [],
    day: row.day,
    generatedAt: row.created_at,
  };
}

/** Opening the pick's page (from anywhere) keeps it from going stale. */
export function markFeaturedOpened(db: Db, userId: number, itemId: string): void {
  const row = read(db, userId);
  if (!row || row.opened_at) return;
  if (parseBody(row.body).pick?.id !== itemId) return;
  db.prepare('UPDATE featured_picks SET opened_at = ? WHERE user_id = ?').run(
    new Date().toISOString(),
    userId,
  );
}
