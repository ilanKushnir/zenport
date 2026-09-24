/**
 * Discover: teachers, courses, books and retreats beyond the library, found
 * on the web by the person's AI and chosen for them - with why each suits
 * them. Every link is visited before it is shown (links.ts); a suggestion
 * whose page does not answer is dropped, not shown with a dead link.
 *
 * The AI is told what the person practises and hopes for, and who is already
 * in their library, so it looks beyond it; and what it suggested before, so
 * it does not repeat itself.
 */
import type {
  DiscoverItemDto,
  DiscoverKind,
  DiscoverRunDto,
  MeditationSummaryDto,
} from '@zenport/shared';
import { DISCOVER_KINDS } from '@zenport/shared';
import type { Db } from '../db/index.js';
import { intentionsSummary, readIntentions } from './intentions.js';
import { cleanUrl, stripCitations } from './providers.js';

const DAY_MS = 86_400_000;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const DISCOVER_MAX = 8;

export const DISCOVER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'title', 'by', 'why', 'url', 'format', 'cost'],
        properties: {
          kind: { type: 'string', enum: DISCOVER_KINDS.map((k) => k.id) },
          title: { type: 'string' },
          by: { type: ['string', 'null'], description: 'Teacher, author or organisation.' },
          why: {
            type: 'string',
            description:
              'Why it suits this person, to them ("you"): one or two short sentences, under 300 characters.',
          },
          url: {
            type: 'string',
            description: 'The official https page for it (the teacher, publisher or organiser).',
          },
          format: {
            type: ['string', 'null'],
            description: 'A few words: "online, 8 weeks", "book", "5-day retreat, in person"…',
          },
          cost: { type: 'string', enum: ['free', 'paid', 'unknown'] },
        },
      },
    },
  },
} as const;

export const DISCOVER_SYSTEM = [
  'You recommend meditation teachers, courses and programmes, books, and retreats or workshops',
  'that suit one person, beyond what is already in their personal library. Search the web and',
  'recommend only things that exist now, each with its official page.',
  '',
  '- Suit them: their intentions, experience, time, what they practise and enjoy. Say why in',
  '  their terms, specifically - not generic praise.',
  '- Beyond the library: not the creators listed as already in it, unless it is clearly a',
  '  different offering of theirs that fits much better than anything else.',
  '- Reputable and safe: established teachers and organisations; nothing that promises cures or',
  '  asks for large sums up front. Mix free and paid where possible.',
  '- Only the kinds asked for, and at least one of each kind asked for when something fitting',
  '  exists (a teacher is a person to learn from - their site or main teaching page - not one',
  '  recording of theirs). Nothing suggested before (listed).',
  '- Links: https, the official page for that exact item - never a search page or a guess.',
  '- Write in the language of their intentions; English if unsure.',
].join('\n');

/** What the AI is told: who they are, what they practise, what they have. */
export function discoverContext(
  db: Db,
  items: MeditationSummaryDto[],
  userId: number,
  kinds: DiscoverKind[],
  note: string | null,
): string {
  const lines: string[] = [];
  const intentions = readIntentions(db, userId);
  lines.push(
    intentions ? intentionsSummary(intentions) : 'They have not written down their intentions.',
  );
  lines.push('');

  const byId = new Map(items.map((i) => [i.id, i]));
  const rows = db
    .prepare(
      `SELECT item_id, COUNT(*) AS n, SUM(listened_sec) AS secs FROM practice_sessions
       WHERE user_id = ? AND status != 'active' AND started_at >= ?
         AND (status = 'completed' OR listened_sec >= 60)
       GROUP BY item_id ORDER BY n DESC`,
    )
    .all(userId, new Date(Date.now() - 180 * DAY_MS).toISOString()) as {
    item_id: string;
    n: number;
    secs: number | null;
  }[];
  if (rows.length === 0) {
    lines.push('Practice: little or nothing recorded in ZenPort yet.');
  } else {
    const sessions = rows.reduce((n, r) => n + r.n, 0);
    const byCreator = new Map<string, number>();
    const byType = new Map<string, number>();
    for (const r of rows) {
      const i = byId.get(r.item_id);
      if (!i) continue;
      byCreator.set(i.creator, (byCreator.get(i.creator) ?? 0) + r.n);
      byType.set(i.type, (byType.get(i.type) ?? 0) + r.n);
    }
    lines.push(
      `Practice, last 6 months: ${sessions} sessions. By kind: ${[...byType.entries()].map(([t, n]) => `${t} ${n}`).join(', ')}.`,
    );
    lines.push(
      `Most practised with: ${[...byCreator.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([c, n]) => `${clip(c, 50)} (${n})`)
        .join(', ')}.`,
    );
    const top = rows
      .slice(0, 8)
      .map((r) => byId.get(r.item_id))
      .filter(Boolean)
      .map((i) => `"${clip(i!.title, 60)}" (${i!.type})`);
    if (top.length) lines.push(`Favourite recordings: ${top.join(', ')}.`);
  }
  const finished = items.filter(
    (i) =>
      (i.type === 'course' || i.type === 'talk') &&
      i.trackCount > 0 &&
      i.completedCount >= i.trackCount,
  );
  if (finished.length) {
    lines.push(
      `Courses finished: ${finished
        .slice(0, 10)
        .map((i) => `"${clip(i.title, 60)}"`)
        .join(', ')}.`,
    );
  }
  lines.push('');

  const creators = [...new Set(items.map((i) => i.creator))].filter((c) => !/^unknown/i.test(c));
  lines.push(
    `Already in their library (${creators.length} creators): ${creators
      .slice(0, 120)
      .map((c) => clip(c, 50))
      .join('; ')}.`,
  );

  const before = (
    db
      .prepare('SELECT title, by FROM discover_items WHERE user_id = ? ORDER BY id DESC LIMIT 60')
      .all(userId) as { title: string; by: string | null }[]
  ).map((r) => `${r.title}${r.by ? ` (${r.by})` : ''}`);
  if (before.length) lines.push(`Suggested before, so not again: ${before.join('; ')}.`);
  lines.push('');

  const labels = kinds.map((k) => DISCOVER_KINDS.find((x) => x.id === k)!.label.toLowerCase());
  lines.push(`Recommend up to ${DISCOVER_MAX} in all, among: ${labels.join(', ')}.`);
  if (note) lines.push(`What they are looking for: ${note}`);
  return lines.join('\n');
}

interface RawItem {
  kind: string;
  title: string;
  by: string | null;
  why: string;
  url: string;
  format: string | null;
  cost: string;
}

/** The answer, checked: asked-for kinds, https links, no repeats, capped. */
export function resolveDiscover(
  raw: unknown,
  kinds: DiscoverKind[],
): Omit<DiscoverItemDto, 'id' | 'saved' | 'host'>[] {
  const seen = new Set<string>();
  const out: Omit<DiscoverItemDto, 'id' | 'saved' | 'host'>[] = [];
  for (const r of ((raw ?? {}) as { items?: RawItem[] }).items ?? []) {
    const kind = r.kind as DiscoverKind;
    if (!kinds.includes(kind)) continue;
    const title = clip(stripCitations(String(r.title ?? '')), 160);
    const url = cleanUrl(String(r.url ?? '').trim());
    if (!title || !/^https:\/\/[^\s]+$/.test(url) || url.length > 800) continue;
    const key = `${title.toLowerCase()}|${url.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      kind,
      title,
      by: r.by?.trim() ? clip(stripCitations(r.by), 120) : null,
      why: clip(stripCitations(String(r.why ?? '')), 600),
      url,
      // "course" on a course says nothing.
      format:
        r.format?.trim() && r.format.trim().toLowerCase() !== kind
          ? clip(stripCitations(r.format), 80)
          : null,
      cost: r.cost === 'free' || r.cost === 'paid' ? r.cost : 'unknown',
    });
    if (out.length === DISCOVER_MAX) break;
  }
  return out;
}

interface ItemRow {
  id: number;
  run_id: number | null;
  kind: DiscoverKind;
  title: string;
  by: string | null;
  why: string;
  url: string;
  format: string | null;
  cost: DiscoverItemDto['cost'];
  saved: number;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const itemDto = (r: ItemRow): DiscoverItemDto => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  by: r.by,
  why: r.why,
  url: r.url,
  host: hostOf(r.url),
  format: r.format,
  cost: r.cost,
  saved: r.saved === 1,
});

export function saveRun(
  db: Db,
  userId: number,
  kinds: DiscoverKind[],
  note: string | null,
  model: string,
  items: Omit<DiscoverItemDto, 'id' | 'saved' | 'host'>[],
): number {
  const now = new Date().toISOString();
  const runId = Number(
    db
      .prepare(
        'INSERT INTO discover_runs (user_id, created_at, kinds, note, model) VALUES (?, ?, ?, ?, ?)',
      )
      .run(userId, now, JSON.stringify(kinds), note, model).lastInsertRowid,
  );
  const ins = db.prepare(
    `INSERT INTO discover_items (user_id, run_id, kind, title, by, why, url, format, cost, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const i of items) {
    ins.run(userId, runId, i.kind, i.title, i.by, i.why, i.url, i.format, i.cost, now);
  }
  return runId;
}

export function listDiscover(
  db: Db,
  userId: number,
): { saved: DiscoverItemDto[]; runs: DiscoverRunDto[] } {
  const runs = db
    .prepare('SELECT * FROM discover_runs WHERE user_id = ? ORDER BY created_at DESC LIMIT 12')
    .all(userId) as {
    id: number;
    created_at: string;
    kinds: string;
    note: string | null;
    model: string | null;
  }[];
  const items = db
    .prepare('SELECT * FROM discover_items WHERE user_id = ? ORDER BY id')
    .all(userId) as unknown as ItemRow[];
  return {
    saved: items
      .filter((i) => i.saved === 1)
      .map(itemDto)
      .reverse(),
    runs: runs.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      kinds: JSON.parse(r.kinds) as DiscoverKind[],
      note: r.note,
      model: r.model,
      items: items.filter((i) => i.run_id === r.id).map(itemDto),
    })),
  };
}

/** Forget a search: what was saved from it stays saved. */
export function deleteRun(db: Db, userId: number, runId: number): boolean {
  const run = db
    .prepare('SELECT id FROM discover_runs WHERE id = ? AND user_id = ?')
    .get(runId, userId);
  if (!run) return false;
  db.prepare('DELETE FROM discover_items WHERE run_id = ? AND saved = 0').run(runId);
  db.prepare('DELETE FROM discover_runs WHERE id = ?').run(runId);
  return true;
}
