/**
 * Featured on Today (opt-in): a few recordings from the person's own library,
 * picked by their AI once a day, each with a line on why it fits now.
 *
 * Deliberately not the plan: the picks come from what they have practised,
 * what they have not tried, their intentions and the time of day - a gentle
 * alongside, never a second schedule. Picks are stored as ids and resolved
 * against the library on every read, so progress stays current and anything
 * removed simply drops out.
 */
import type { FeaturedPickDto, MeditationSummaryDto } from '@zenport/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { libraryDto } from '../library/queries.js';
import { dayKey } from '../stats/compute.js';
import { intentionsSummary, readIntentions } from './intentions.js';
import type { AiClient, AiTarget } from './providers.js';

export const FEATURED_COUNT = 3;
const DAY_MS = 86_400_000;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export const FEATURED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['picks'],
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['handle', 'why'],
        properties: {
          handle: { type: 'string' },
          why: {
            type: 'string',
            description: 'Why this, now: one short line, at most 90 characters.',
          },
        },
      },
    },
  },
} as const;

export const FEATURED_SYSTEM = [
  `You choose ${FEATURED_COUNT} recordings from a person's own meditation library for today, each`,
  'with one short line on why it fits now. Draw on what they have practised (what they return',
  'to, what they have not touched in a while), what they have never tried, their intentions and',
  'the day and time. Give a mix - not three of the same kind - and favour things they can do',
  'today; a course they are part-way through may be one of them. Their plans are handled',
  'elsewhere: do not try to follow or repeat a schedule.',
  '',
  '- Use only handles from the list. No recording twice.',
  '- "why" speaks to them ("you"), is specific and kind, at most 90 characters, and never names',
  '  a handle. No emojis.',
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

/** What the picker is told: now, intentions, history - and the library. */
export function featuredContext(
  db: Db,
  items: MeditationSummaryDto[],
  user: { id: number; timezone: string },
  now = new Date(),
): { text: string; handles: Map<string, MeditationSummaryDto>; exclude: Set<string> } {
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
  const hour = Number(part('hour'));

  const handles = new Map<string, MeditationSummaryDto>();
  const handleOf = new Map<string, string>();
  items.forEach((i, n) => {
    handles.set(`m${n + 1}`, i);
    handleOf.set(i.id, `m${n + 1}`);
  });

  const since = new Date(now.getTime() - 60 * DAY_MS).toISOString();
  const rows = db
    .prepare(
      `SELECT item_id, COUNT(*) AS n, SUM(listened_sec) AS secs, MAX(started_at) AS last
       FROM practice_sessions WHERE user_id = ? AND status != 'active' AND started_at >= ?
         AND (status = 'completed' OR listened_sec >= 60)
       GROUP BY item_id`,
    )
    .all(user.id, since) as { item_id: string; n: number; secs: number | null; last: string }[];
  const recent = new Map(rows.map((r) => [r.item_id, r]));
  const todayDone = rows.filter((r) => dayKey(r.last, tz) === today).map((r) => r.item_id);
  // Today already offers the last thing played ("Last time"): no need to pick it again.
  const last = db
    .prepare(
      `SELECT item_id FROM practice_sessions WHERE user_id = ? AND status != 'active'
       ORDER BY started_at DESC LIMIT 1`,
    )
    .get(user.id) as { item_id: string } | undefined;
  const exclude = new Set(last && handleOf.has(last.item_id) ? [last.item_id] : []);

  const lines: string[] = [];
  lines.push(
    `Now: ${part('weekday')} ${today}, ${part('hour')}:${part('minute')} (${partOfDay(hour)}).`,
  );
  const i = readIntentions(db, user.id);
  lines.push(i ? intentionsSummary(i) : 'They have not written down their intentions.');
  lines.push('');
  lines.push(
    rows.length === 0
      ? 'History: nothing practised in the last 60 days.'
      : `History, last 60 days: ${rows.reduce((n, r) => n + r.n, 0)} sessions with ${rows.length} recordings.${
          todayDone.length
            ? ` Already done today: ${todayDone
                .map((id) => handleOf.get(id))
                .filter(Boolean)
                .join(', ')}.`
            : ''
        }`,
  );
  if (exclude.size) {
    lines.push(
      `Already on their Today screen, so do not pick: ${[...exclude].map((id) => handleOf.get(id)).join(', ')}.`,
    );
  }
  lines.push('');
  lines.push('Library (handle | type | creator > series > title | length | their history):');
  for (const [h, it] of handles) {
    const r = recent.get(it.id);
    const history = r
      ? `${r.n}x in 60 days, last ${dayKey(r.last, tz)}`
      : it.practiceCount > 0
        ? `done ${it.practiceCount}x, not lately`
        : 'never tried';
    lines.push(
      `${h} | ${it.type}${it.hasVideo ? ' (video)' : ''} | ${clip(it.creator, 50)}${it.collection ? ` > ${clip(it.collection, 60)}` : ''} > ${clip(it.title, 80)} | ${it.totalDurationSec ? `${Math.round(it.totalDurationSec / 60)} min` : '?'}${it.trackCount > 1 ? `, ${it.trackCount} parts, ${it.completedCount} done` : ''} | ${history}`,
    );
  }
  return { text: lines.join('\n'), handles, exclude };
}

/** The answer, checked: known handles only, no repeats, lines capped. */
export function resolvePicks(
  raw: unknown,
  handles: Map<string, MeditationSummaryDto>,
  exclude: ReadonlySet<string> = new Set(),
): { id: string; why: string }[] {
  const seen = new Set<string>(exclude);
  const out: { id: string; why: string }[] = [];
  for (const p of ((raw ?? {}) as { picks?: { handle: string; why: string }[] }).picks ?? []) {
    const item = handles.get(String(p.handle).trim());
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    const why = String(p.why ?? '')
      .replace(/\bm\d+\b/g, 'it')
      .trim();
    out.push({ id: item.id, why: clip(why, 120) });
    if (out.length === FEATURED_COUNT) break;
  }
  return out;
}

interface CacheRow {
  day: string;
  body: string;
  created_at: string;
}

const inFlight = new Map<number, Promise<void>>();

/** Make (or remake) today's picks - one at a time per person. */
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
    const items = libraryDto(db, config, user.id).items.filter((i) => !i.missing);
    if (items.length === 0) return;
    const { text, handles, exclude } = featuredContext(db, items, user);
    const raw = await ai.chatJson(target, {
      system: FEATURED_SYSTEM,
      user: text,
      schemaName: 'zenport_featured',
      schema: FEATURED_SCHEMA as unknown as Record<string, unknown>,
    });
    const picks = resolvePicks(raw, handles, exclude);
    if (picks.length === 0) throw new Error('no usable picks');
    db.prepare(
      `INSERT INTO featured_picks (user_id, day, body, model, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET day = excluded.day, body = excluded.body,
         model = excluded.model, created_at = excluded.created_at`,
    ).run(
      user.id,
      dayKey(new Date().toISOString(), user.timezone),
      JSON.stringify(picks),
      target.model,
      new Date().toISOString(),
    );
  })();
  inFlight.set(user.id, job);
  try {
    await job;
  } finally {
    inFlight.delete(user.id);
  }
}

/** Today's picks as stored, resolved against the library now. */
export function readFeatured(
  db: Db,
  config: Config,
  user: { id: number; timezone: string },
): { fresh: boolean; picks: FeaturedPickDto[]; day: string | null; generatedAt: string | null } {
  const row = db
    .prepare('SELECT day, body, created_at FROM featured_picks WHERE user_id = ?')
    .get(user.id) as CacheRow | undefined;
  if (!row) return { fresh: false, picks: [], day: null, generatedAt: null };
  const today = dayKey(new Date().toISOString(), user.timezone);
  const byId = new Map(
    libraryDto(db, config, user.id)
      .items.filter((i) => !i.missing)
      .map((i) => [i.id, i]),
  );
  const picks = (JSON.parse(row.body) as { id: string; why: string }[])
    .filter((p) => byId.has(p.id))
    .map((p) => ({ item: byId.get(p.id)!, why: p.why }));
  return { fresh: row.day === today, picks, day: row.day, generatedAt: row.created_at };
}
