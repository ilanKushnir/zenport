/**
 * The AI enhancing the library - always as suggestions the admin decides on:
 *
 * - Fixes: the index, read in batches, with concrete corrections where the
 *   scanner read something wrong (type, title, creator, series, part names,
 *   order). Applied through the same corrections as the review page
 *   (saveReview), so a rescan never undoes them.
 * - About: a short description, a level and sources, looked up on the web.
 * - Creator images: a portrait or logo for each creator, found on the web,
 *   downloaded safely (fetchImage.ts) and shown for approval.
 *
 * Nothing changes until the admin applies a suggestion; a dismissed one is
 * remembered so it does not come back.
 */
import { createHash } from 'node:crypto';
import { rename, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  CONTENT_TYPES,
  naturalCompare,
  type ContentType,
  type EnhanceRunDto,
  type ItemAboutDto,
  type ItemLevel,
  type MeditationSummaryDto,
  type ReviewSaveDto,
  type SuggestionDto,
  type SuggestionField,
  type SuggestionKind,
} from '@zenport/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { libraryDto } from '../library/queries.js';
import { reviewDetail, saveReview } from '../library/review.js';
import { downloadImage, storeSquare } from './fetchImage.js';
import {
  AiError,
  WEB_SEARCH,
  cleanUrl,
  stripCitations,
  type AiClient,
  type AiTarget,
} from './providers.js';

export interface EnhanceCtx {
  db: Db;
  config: Config;
  ai: AiClient;
  target: AiTarget;
  dataDir: string;
}

export const FIX_BATCH = 25;
const LEVELS: ItemLevel[] = ['beginner', 'intermediate', 'advanced', 'all'];
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const creatorDir = (dataDir: string) => path.join(dataDir, 'creators');
const candidateDir = (dataDir: string) => path.join(dataDir, 'creators', 'candidates');

/** Items the enhancements work on: present, in the library, in a stable order. */
function libraryItems(db: Db, config: Config, userId: number) {
  return libraryDto(db, config, userId)
    .items.filter((i) => !i.missing)
    .sort(
      (a, b) =>
        naturalCompare(a.creator, b.creator) ||
        naturalCompare(a.collection ?? '', b.collection ?? '') ||
        naturalCompare(a.title, b.title),
    );
}

interface SaveInput {
  kind: SuggestionKind;
  target: string;
  field: SuggestionField;
  value: unknown;
  current: unknown;
  reason: string;
  confidence: 'high' | 'medium';
  model: string;
}

/**
 * Keep one pending suggestion per target and field (a newer run replaces
 * it), never one that was dismissed with the same value, and none that
 * changes nothing.
 */
function saveSuggestion(db: Db, s: SaveInput): boolean {
  const value = JSON.stringify(s.value);
  if (value === JSON.stringify(s.current)) return false;
  const dismissed = db
    .prepare(
      "SELECT 1 FROM ai_suggestions WHERE target = ? AND field = ? AND value = ? AND status = 'dismissed'",
    )
    .get(s.target, s.field, value);
  if (dismissed) return false;
  db.prepare(
    "DELETE FROM ai_suggestions WHERE target = ? AND field = ? AND status = 'pending'",
  ).run(s.target, s.field);
  db.prepare(
    `INSERT INTO ai_suggestions (kind, target, field, value, current, reason, confidence, model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    s.kind,
    s.target,
    s.field,
    value,
    JSON.stringify(s.current),
    clip(s.reason, 400),
    s.confidence,
    s.model,
  );
  return true;
}

// ── Fixes ─────────────────────────────────────────────────────────────────

const FIX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggestions'],
  properties: {
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['handle', 'field', 'value', 'parts', 'order', 'reason', 'confidence'],
        properties: {
          handle: { type: 'string' },
          field: {
            type: 'string',
            enum: ['type', 'title', 'creator', 'series', 'part-names', 'order'],
          },
          value: {
            type: ['string', 'null'],
            description: 'The new type, title, creator or series. Null for part-names and order.',
          },
          parts: {
            type: ['array', 'null'],
            description: 'For part-names: the parts to rename, by their number.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['number', 'name'],
              properties: { number: { type: 'integer' }, name: { type: 'string' } },
            },
          },
          order: {
            type: ['array', 'null'],
            description: 'For order: every part number, in the order they should play.',
            items: { type: 'integer' },
          },
          reason: { type: 'string', description: 'One short sentence: why.' },
          confidence: { type: 'string', enum: ['high', 'medium'] },
        },
      },
    },
  },
} as const;

const FIX_SYSTEM = [
  'You review how a personal library of meditations, courses and talks was indexed from its',
  'folders and file names, and suggest corrections where it was read wrongly. The library owner',
  'decides on each; suggest only what you are confident improves it, and nothing cosmetic.',
  '',
  'Types: meditation = a guided practice (possibly in parts); course = lessons worked through in',
  'order (often with practices inside); talk = a lecture, livestream, workshop or Q&A;',
  'soundscape = music, sound baths, ambient or sleep sound.',
  '',
  'You may suggest:',
  '- type: when the content is clearly another type (a numbered series of lessons that is marked a',
  '  meditation, a lecture marked a course).',
  '- title: when the title is a bare folder name that says nothing ("Part 1", "Season 2", "New",',
  '  "Audio") or is a raw file name - give a clear title, usually built from the series and the part',
  '  ("Discovery Series - Part 1"). Keep the language of the original.',
  '- creator: only when the creator is clearly wrong or "Unknown creator" and the folders or titles',
  '  make the real one plain.',
  '- series: when items obviously belong to a series and it is missing or garbled.',
  '- part-names: when parts carry raw file names ("audio-2248", "day 27 640x360-video"); give the',
  '  readable names by part number. If parts are only numbered uploads, name them by their order',
  '  and the series (e.g. "Day 1"), only if the series shows that pattern.',
  '- order: when parts clearly play in the wrong order (an introduction last, days out of order).',
  '',
  'Never touch fields marked [owner-set]: the owner already decided those.',
  'Use only handles given. Give at most one suggestion per item and field.',
].join('\n');

function describeForFixes(db: Db, config: Config, id: string, handle: string): string | null {
  const d = reviewDetail(db, config, id);
  if (!d) return null;
  const edits = db
    .prepare('SELECT title, creator, collection_set FROM item_edits WHERE item_id = ?')
    .get(id) as
    { title: string | null; creator: string | null; collection_set: number } | undefined;
  const typeSet = !!db.prepare('SELECT 1 FROM item_types WHERE item_id = ?').get(id);
  const orderSet = d.customOrder;
  const namesSet = !!db
    .prepare(
      'SELECT 1 FROM track_edits e JOIN tracks t ON t.id = e.track_id WHERE t.item_id = ? LIMIT 1',
    )
    .get(id);
  const own = (set: boolean) => (set ? ' [owner-set]' : '');
  const parts = d.tracks
    .slice(0, 40)
    .map((t, i) => `${i + 1}. ${clip(t.title, 80)}${t.video ? ' [video]' : ''}`)
    .join('; ');
  return [
    `${handle} | folder: ${clip([d.rootLabel, ...d.path].join('/'), 160)}`,
    `  title: "${clip(d.title, 120)}"${own(!!edits?.title)} | creator: "${clip(d.creator, 80)}"${own(!!edits?.creator)} | series: ${d.collection ? `"${clip(d.collection, 80)}"` : 'none'}${own(!!edits?.collection_set)} | type: ${d.type}${own(typeSet)}`,
    `  parts (${d.tracks.length})${own(orderSet || namesSet)}: ${parts}${d.tracks.length > 40 ? '; …' : ''}`,
  ].join('\n');
}

/** What an item looked like to the AI, as a short hash: it changes when the item does. */
const fingerprint = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 24);

/**
 * What still wants checking for fixes: recordings never checked, or changed
 * since (renamed, reordered, rescanned into new parts). An item is checked
 * as it read at the time; the same item, unchanged, is not sent again.
 */
export function fixCandidates(
  db: Db,
  config: Config,
  userId: number,
): { id: string; text: string; print: string }[] {
  const seen = new Map(
    (
      db.prepare("SELECT item_id, fingerprint FROM ai_reviewed WHERE kind = 'fixes'").all() as {
        item_id: string;
        fingerprint: string;
      }[]
    ).map((r) => [r.item_id, r.fingerprint]),
  );
  const out: { id: string; text: string; print: string }[] = [];
  for (const item of libraryItems(db, config, userId)) {
    const text = describeForFixes(db, config, item.id, '@');
    if (!text) continue;
    const print = fingerprint(text);
    if (seen.get(item.id) !== print) out.push({ id: item.id, text, print });
  }
  return out;
}

export async function runFixes(
  ctx: EnhanceCtx,
  userId: number,
  batch: number,
): Promise<EnhanceRunDto> {
  const all = fixCandidates(ctx.db, ctx.config, userId);
  const b = Math.max(1, batch);
  const batches = Math.max(1, b - 1 + Math.ceil(all.length / FIX_BATCH));
  const slice = all.slice(0, FIX_BATCH);
  if (slice.length === 0) {
    return { batch: b, batches: b, found: 0, notes: ['Nothing new or changed to check.'] };
  }
  const handles = new Map<string, string>();
  const lines: string[] = [];
  slice.forEach((c, i) => {
    const h = `i${i + 1}`;
    handles.set(h, c.id);
    lines.push(c.text.replace(/^@/, h));
  });
  const raw = (await ctx.ai.chatJson(ctx.target, {
    system: FIX_SYSTEM,
    user: `Library items (${lines.length}):\n${lines.join('\n')}`,
    schemaName: 'zenport_fixes',
    light: true,
    schema: FIX_SCHEMA as unknown as Record<string, unknown>,
  })) as {
    suggestions?: {
      handle: string;
      field: string;
      value: string | null;
      parts: { number: number; name: string }[] | null;
      order: number[] | null;
      reason: string;
      confidence: string;
    }[];
  };
  let found = 0;
  for (const s of raw.suggestions ?? []) {
    const id = handles.get(s.handle);
    if (!id) continue;
    const d = reviewDetail(ctx.db, ctx.config, id);
    if (!d) continue;
    const base = {
      kind: 'fix' as const,
      target: id,
      reason: String(s.reason ?? ''),
      confidence: s.confidence === 'high' ? ('high' as const) : ('medium' as const),
      model: ctx.target.model,
    };
    const text = (s.value ?? '').replace(/\s+/g, ' ').trim();
    let saved = false;
    switch (s.field) {
      case 'type':
        if ((CONTENT_TYPES as readonly string[]).includes(text)) {
          saved = saveSuggestion(ctx.db, { ...base, field: 'type', value: text, current: d.type });
        }
        break;
      case 'title':
      case 'creator':
      case 'series': {
        if (!text && s.field !== 'series') break;
        const current =
          s.field === 'title' ? d.title : s.field === 'creator' ? d.creator : (d.collection ?? '');
        saved = saveSuggestion(ctx.db, {
          ...base,
          field: s.field,
          value: clip(text, 200),
          current,
        });
        break;
      }
      case 'part-names': {
        const renames = (s.parts ?? [])
          .filter((p) => Number.isInteger(p.number) && p.number >= 1 && p.number <= d.tracks.length)
          .map((p) => ({
            id: d.tracks[p.number - 1]!.id,
            name: clip(p.name.replace(/\s+/g, ' ').trim(), 200),
          }))
          .filter((r) => r.name && r.name !== d.tracks.find((t) => t.id === r.id)?.title);
        if (renames.length > 0) {
          saved = saveSuggestion(ctx.db, {
            ...base,
            field: 'part-names',
            value: renames,
            current: renames.map((r) => ({
              id: r.id,
              name: d.tracks.find((t) => t.id === r.id)!.title,
            })),
          });
        }
        break;
      }
      case 'order': {
        const order = s.order ?? [];
        const n = d.tracks.length;
        const valid =
          order.length === n &&
          new Set(order).size === n &&
          order.every((k) => Number.isInteger(k) && k >= 1 && k <= n);
        if (valid) {
          saved = saveSuggestion(ctx.db, {
            ...base,
            field: 'order',
            value: order.map((k) => d.tracks[k - 1]!.id),
            current: d.tracks.map((t) => t.id),
          });
        }
        break;
      }
    }
    if (saved) found++;
  }
  // Checked, as they read now: not sent again until they change.
  const mark = ctx.db.prepare(
    `INSERT INTO ai_reviewed (item_id, kind, fingerprint, reviewed_at) VALUES (?, 'fixes', ?, ?)
     ON CONFLICT(item_id, kind) DO UPDATE SET fingerprint = excluded.fingerprint,
       reviewed_at = excluded.reviewed_at`,
  );
  const at = new Date().toISOString();
  for (const c of slice) mark.run(c.id, c.print, at);
  return { batch: b, batches, found, notes: [] };
}

// ── About (web research) ──────────────────────────────────────────────────

const ABOUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['handle', 'found', 'description', 'level', 'sources'],
        properties: {
          handle: { type: 'string' },
          found: { type: 'boolean' },
          description: { type: 'string', description: '2-3 plain, neutral sentences.' },
          level: { type: 'string', enum: [...LEVELS, 'unknown'] },
          sources: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'url'],
              properties: { title: { type: 'string' }, url: { type: 'string' } },
            },
          },
        },
      },
    },
  },
} as const;

export async function runAbout(
  ctx: EnhanceCtx,
  userId: number,
  itemIds: string[],
): Promise<EnhanceRunDto> {
  if (!WEB_SEARCH[ctx.target.provider]) {
    throw new AiError(
      'Looking things up needs a provider with web search - not your own server.',
      400,
    );
  }
  const items = libraryItems(ctx.db, ctx.config, userId)
    .filter((i) => itemIds.includes(i.id))
    .slice(0, 6);
  const handles = new Map(items.map((i, n) => [`i${n + 1}`, i]));
  const lines = [...handles.entries()].map(
    ([h, i]) =>
      `${h} | ${i.type} | creator: ${clip(i.creator, 80)}${i.collection ? ` | series: ${clip(i.collection, 80)}` : ''} | title: ${clip(i.title, 120)} | ${i.trackCount} part${i.trackCount === 1 ? '' : 's'}${i.totalDurationSec ? `, ${Math.round(i.totalDurationSec / 60)} min` : ''}`,
  );
  const raw = (await ctx.ai.chatJson(ctx.target, {
    system: [
      'You research recordings in a personal meditation library on the web: guided meditations,',
      'courses and talks by teachers and apps. For each item, find what it is from reliable pages',
      "(the teacher's or publisher's own site first) and write a short, neutral description of what",
      'it offers and who it suits, and its level. Give the pages you used. If you cannot find this',
      'exact item with confidence, set found to false - never guess or describe a different work.',
    ].join('\n'),
    user: `Items:\n${lines.join('\n')}`,
    schemaName: 'zenport_about',
    schema: ABOUT_SCHEMA as unknown as Record<string, unknown>,
    webSearch: true,
  })) as {
    items?: {
      handle: string;
      found: boolean;
      description: string;
      level: string;
      sources: { title: string; url: string }[];
    }[];
  };
  let found = 0;
  const notes: string[] = [];
  for (const r of raw.items ?? []) {
    const item = handles.get(r.handle);
    if (!item) continue;
    const sources = (r.sources ?? [])
      .filter((s) => /^https?:\/\//.test(s.url))
      .slice(0, 4)
      .map((s) => ({
        title: clip(stripCitations(String(s.title || s.url)), 120),
        url: cleanUrl(s.url).slice(0, 500),
      }));
    if (!r.found || !r.description?.trim() || sources.length === 0) {
      notes.push(`Nothing reliable found for "${item.title}".`);
      continue;
    }
    const about: ItemAboutDto = {
      description: clip(stripCitations(r.description), 700),
      level: (LEVELS as string[]).includes(r.level) ? (r.level as ItemLevel) : null,
      sources,
    };
    const cur = ctx.db
      .prepare('SELECT description FROM item_about WHERE item_id = ?')
      .get(item.id) as { description: string } | undefined;
    if (
      saveSuggestion(ctx.db, {
        kind: 'about',
        target: item.id,
        field: 'about',
        value: about,
        current: cur?.description ?? null,
        reason: `Found on ${sources.map((s) => new URL(s.url).host).join(', ')}.`,
        confidence: 'medium',
        model: ctx.target.model,
      })
    )
      found++;
  }
  return { batch: 1, batches: 1, found, notes };
}

// ── Creator images ────────────────────────────────────────────────────────

const IMAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['creators'],
  properties: {
    creators: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'kind', 'candidates'],
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', enum: ['person', 'organisation', 'unknown'] },
          candidates: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['imageUrl', 'pageUrl'],
              properties: {
                imageUrl: { type: 'string', description: 'A direct https link to the image file.' },
                pageUrl: { type: 'string', description: 'The page where it appears.' },
              },
            },
          },
        },
      },
    },
  },
} as const;

export async function runCreatorImages(
  ctx: EnhanceCtx,
  userId: number,
  names: string[],
): Promise<EnhanceRunDto> {
  if (!WEB_SEARCH[ctx.target.provider]) {
    throw new AiError(
      'Finding pictures needs a provider with web search - not your own server.',
      400,
    );
  }
  const items = libraryItems(ctx.db, ctx.config, userId);
  const wanted = [...new Set(names)].slice(0, 4);
  const lines = wanted.map((name) => {
    const titles = items
      .filter((i) => i.creator === name)
      .slice(0, 4)
      .map((i) => clip(i.collection ? `${i.collection} - ${i.title}` : i.title, 70));
    return `- "${name}": ${titles.join('; ')}`;
  });
  const raw = (await ctx.ai.chatJson(ctx.target, {
    system: [
      'You find one picture that represents each creator in a meditation library: for a person (a',
      'teacher, a voice) a clear portrait or profile photo; for an organisation, app or studio its',
      'logo or a representative cover. Use their official site, Wikipedia / Wikimedia Commons, or',
      'their publisher. Give direct https links to image files (jpg, png, webp) - up to three',
      'candidates, best first - and the page each came from. The sample titles show which creator',
      'is meant; if you cannot tell who this is with confidence, give no candidates.',
    ].join('\n'),
    user: `Creators:\n${lines.join('\n')}`,
    schemaName: 'zenport_creator_images',
    light: true,
    schema: IMAGE_SCHEMA as unknown as Record<string, unknown>,
    webSearch: true,
  })) as {
    creators?: {
      name: string;
      kind: string;
      candidates: { imageUrl: string; pageUrl: string }[];
    }[];
  };
  let found = 0;
  const notes: string[] = [];
  for (const name of wanted) {
    const r = (raw.creators ?? []).find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
    let file: string | null = null;
    let source: string | null = null;
    for (const c of (r?.candidates ?? []).slice(0, 3)) {
      try {
        file = await storeSquare(await downloadImage(c.imageUrl), candidateDir(ctx.dataDir));
        source = /^https:\/\//.test(c.pageUrl) ? c.pageUrl.slice(0, 500) : c.imageUrl.slice(0, 500);
        break;
      } catch {
        /* try the next */
      }
    }
    if (!file) {
      notes.push(`No picture could be found for ${name}.`);
      continue;
    }
    const cur = ctx.db.prepare('SELECT file FROM creator_images WHERE name = ?').get(name) as
      { file: string } | undefined;
    if (
      saveSuggestion(ctx.db, {
        kind: 'creator-image',
        target: name,
        field: 'image',
        value: { file, source },
        current: cur?.file ?? null,
        reason: r?.kind === 'organisation' ? 'Their logo or cover.' : 'A portrait of them.',
        confidence: 'medium',
        model: ctx.target.model,
      })
    )
      found++;
  }
  return { batch: 1, batches: 1, found, notes };
}

// ── Listing and deciding ─────────────────────────────────────────────────

interface SuggestionRow {
  id: number;
  kind: SuggestionKind;
  target: string;
  field: SuggestionField;
  value: string;
  current: string | null;
  reason: string;
  confidence: string;
  status: SuggestionDto['status'];
  model: string | null;
}

export function listSuggestions(
  db: Db,
  config: Config,
  status: SuggestionDto['status'] = 'pending',
): SuggestionDto[] {
  const rows = db
    .prepare('SELECT * FROM ai_suggestions WHERE status = ? ORDER BY kind, id')
    .all(status) as unknown as SuggestionRow[];
  const out: SuggestionDto[] = [];
  for (const r of rows) {
    const value = JSON.parse(r.value) as unknown;
    const current = r.current ? (JSON.parse(r.current) as unknown) : null;
    const base = {
      id: r.id,
      kind: r.kind,
      field: r.field,
      target: r.target,
      reason: r.reason,
      confidence: r.confidence === 'high' ? ('high' as const) : ('medium' as const),
      status: r.status,
      model: r.model,
    };
    if (r.kind === 'creator-image') {
      const v = value as { file: string; source: string | null };
      out.push({
        ...base,
        targetTitle: r.target,
        targetSub: 'Creator',
        coverId: null,
        from: current ? 'Has a picture' : 'No picture yet',
        to: 'This picture',
        imageUrl: `/api/media/creator-candidate/${v.file}`,
        sourceUrl: v.source,
      });
      continue;
    }
    const d = reviewDetail(db, config, r.target);
    if (!d) continue;
    const head = {
      ...base,
      targetTitle: d.title,
      targetSub: [d.creator, d.collection].filter(Boolean).join(' · '),
      coverId: d.coverId,
    };
    const name = (id: string) => d.tracks.find((t) => t.id === id)?.title ?? '?';
    if (r.field === 'part-names') {
      const v = value as { id: string; name: string }[];
      out.push({
        ...head,
        from: '',
        to: '',
        parts: v.map((p) => ({ from: name(p.id), to: p.name })),
      });
    } else if (r.field === 'order') {
      const v = value as string[];
      out.push({
        ...head,
        from: '',
        to: '',
        parts: v.map((id, i) => ({ from: name(d.tracks[i]?.id ?? ''), to: name(id) })),
      });
    } else if (r.field === 'about') {
      out.push({ ...head, from: String(current ?? ''), to: '', about: value as ItemAboutDto });
    } else {
      out.push({ ...head, from: String(current ?? ''), to: String(value) });
    }
  }
  return out;
}

/** Apply one suggestion. Returns whether the library needs a rescan (never, so far). */
export async function applySuggestion(
  db: Db,
  config: Config,
  dataDir: string,
  id: number,
): Promise<void> {
  const r = db.prepare('SELECT * FROM ai_suggestions WHERE id = ?').get(id) as unknown as
    SuggestionRow | undefined;
  if (!r || r.status !== 'pending') throw new AiError('That suggestion is no longer open.', 404);
  const value = JSON.parse(r.value) as unknown;
  if (r.kind === 'fix') {
    const body: ReviewSaveDto = {};
    if (r.field === 'type') body.type = value as ContentType;
    if (r.field === 'title') body.title = value as string;
    if (r.field === 'creator') body.creator = value as string;
    if (r.field === 'series') body.series = value as string;
    if (r.field === 'part-names') {
      body.tracks = (value as { id: string; name: string }[]).map((p) => ({
        id: p.id,
        title: p.name,
      }));
    }
    if (r.field === 'order') body.order = value as string[];
    saveReview(db, config, r.target, body);
  } else if (r.kind === 'about') {
    const a = value as ItemAboutDto;
    db.prepare(
      `INSERT INTO item_about (item_id, description, level, sources, model, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(item_id) DO UPDATE SET description = excluded.description, level = excluded.level,
         sources = excluded.sources, model = excluded.model, updated_at = excluded.updated_at`,
    ).run(
      r.target,
      a.description,
      a.level,
      JSON.stringify(a.sources),
      r.model,
      new Date().toISOString(),
    );
  } else if (r.kind === 'creator-image') {
    const v = value as { file: string; source: string | null };
    await rename(path.join(candidateDir(dataDir), v.file), path.join(creatorDir(dataDir), v.file));
    db.prepare(
      `INSERT INTO creator_images (name, file, source_url, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET file = excluded.file, source_url = excluded.source_url,
         updated_at = excluded.updated_at`,
    ).run(r.target, v.file, v.source, new Date().toISOString());
  }
  db.prepare("UPDATE ai_suggestions SET status = 'applied', decided_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    id,
  );
}

export async function dismissSuggestion(db: Db, dataDir: string, id: number): Promise<void> {
  const r = db.prepare('SELECT kind, value, status FROM ai_suggestions WHERE id = ?').get(id) as
    { kind: string; value: string; status: string } | undefined;
  if (!r || r.status !== 'pending') return;
  if (r.kind === 'creator-image') {
    const v = JSON.parse(r.value) as { file: string };
    await rm(path.join(candidateDir(dataDir), v.file), { force: true });
  }
  db.prepare("UPDATE ai_suggestions SET status = 'dismissed', decided_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    id,
  );
}

/** A creator's picture, set by hand from an address, or taken away. */
export async function setCreatorImage(
  db: Db,
  dataDir: string,
  name: string,
  url: string,
): Promise<void> {
  const file = await storeSquare(await downloadImage(url), creatorDir(dataDir));
  db.prepare(
    `INSERT INTO creator_images (name, file, source_url, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET file = excluded.file, source_url = excluded.source_url,
       updated_at = excluded.updated_at`,
  ).run(name, file, url, new Date().toISOString());
}

export function removeCreatorImage(db: Db, name: string): void {
  db.prepare('DELETE FROM creator_images WHERE name = ?').run(name);
}

// ── Levels ────────────────────────────────────────────────────────────────

export const LEVEL_BATCH = 40;

const LEVEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['handle', 'level', 'structure', 'reason'],
        properties: {
          handle: { type: 'string' },
          level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced', 'all'] },
          structure: {
            type: 'string',
            enum: ['programme', 'pack', 'single'],
            description:
              'For an item of several parts: programme if meant in order, pack if any order; single for one part.',
          },
          reason: { type: 'string', description: 'A few words: why this level.' },
        },
      },
    },
  },
} as const;

const LEVEL_SYSTEM = [
  'You judge the level of each recording in a personal library of meditations, courses and',
  'talks: who it suits.',
  '- beginner: introductions, foundations, basics, the first programmes of a sequence, short',
  '  and fully guided practices for someone new.',
  '- intermediate: builds on the basics - later programmes of a sequence, longer or less guided',
  '  sits, deeper themes.',
  '- advanced: long, lightly guided or unguided, retreat or workshop level, techniques that',
  '  assume practice; anything the names call advanced.',
  '- all: suits anyone equally - soundscapes, music, sleep sounds, short talks or tips.',
  '',
  'Also say how an item of several parts is meant: a programme (in order, each part building',
  'on the last - days, parts, weeks, a numbered path) or a pack (a set of meditations to choose',
  'from in any order). Single is one meditation however many files it has: one part; an',
  'introduction (or an explanation) and one meditation; or one meditation in versions - lying',
  'down and walking, live, with music, or its breath, its meditation and the two combined.',
  'Answer structure for every handle, fixed or not.',
  '',
  'Keep the parts of one series at one level unless they clearly progress; in a numbered',
  'sequence the earlier ones are easier. Use what you know of these teachers and works where',
  'you know them. Items marked [fixed] already have a level: keep that level in your answer.',
].join('\n');

/**
 * What still wants the AI's reading: no level from anywhere yet, or several
 * parts and nobody has said whether they are a programme or a pack. What is
 * settled is never sent again - a run over a read library costs nothing.
 */
export function levelCandidates(db: Db, config: Config, userId: number) {
  const seen = new Map(
    (
      db.prepare("SELECT item_id, fingerprint FROM ai_reviewed WHERE kind = 'levels'").all() as {
        item_id: string;
        fingerprint: string;
      }[]
    ).map((r) => [r.item_id, r.fingerprint]),
  );
  return libraryItems(db, config, userId).filter(
    (i) =>
      // No level, or a programme/pack guessed only from the names...
      (!i.levelSource || i.structureSource === 'name') &&
      // ...and not already read by the AI as it is now.
      seen.get(i.id) !== levelPrint(i),
  );
}

/** What a recording looked like for its level: it is read again if this changes. */
const levelPrint = (i: MeditationSummaryDto) =>
  fingerprint(`${i.creator}|${i.collection ?? ''}|${i.title}|${i.trackCount}|${i.type}`);

/**
 * The AI's reading of levels, a batch at a time; never over an admin's or a
 * name's. Each call takes the next batch of what is still unread, so a
 * sequence of calls (batch 1, 2, …) walks through it however many settle.
 */
export async function runLevels(
  ctx: EnhanceCtx,
  userId: number,
  batch: number,
): Promise<EnhanceRunDto> {
  const all = levelCandidates(ctx.db, ctx.config, userId);
  const batches = Math.max(1, batch - 1 + Math.ceil(all.length / LEVEL_BATCH));
  const b = Math.max(1, batch);
  const slice = all.slice(0, LEVEL_BATCH);
  if (slice.length === 0) {
    return { batch: b, batches: b, found: 0, notes: ['Every recording already has a level.'] };
  }
  const handles = new Map<string, (typeof slice)[number]>();
  const lines = slice.map((i, n) => {
    const h = `i${n + 1}`;
    handles.set(h, i);
    const fixed = i.levelSource === 'manual' || i.levelSource === 'name';
    const parts =
      i.trackCount > 1
        ? (
            ctx.db
              .prepare(
                'SELECT title FROM tracks WHERE item_id = ? AND missing = 0 ORDER BY ord LIMIT 4',
              )
              .all(i.id) as { title: string }[]
          )
            .map((t) => clip(t.title, 40))
            .join('; ')
        : '';
    return `${h} | ${i.type}${i.hasVideo ? ' (video)' : ''} | ${clip(i.creator, 60)}${i.collection ? ` > ${clip(i.collection, 80)}` : ''} > ${clip(i.title, 100)} | ${i.trackCount} part${i.trackCount === 1 ? '' : 's'}${i.totalDurationSec ? `, ${Math.round(i.totalDurationSec / 60)} min` : ''}${parts ? ` (${parts}${i.trackCount > 4 ? '; …' : ''})` : ''}${fixed ? ` [fixed: ${i.level}]` : ''}`;
  });

  const raw = (await ctx.ai.chatJson(ctx.target, {
    system: LEVEL_SYSTEM,
    user: `Library items (${lines.length}):\n${lines.join('\n')}`,
    schemaName: 'zenport_levels',
    light: true,
    schema: LEVEL_SCHEMA as unknown as Record<string, unknown>,
  })) as { items?: { handle: string; level: string; structure?: string; reason: string }[] };
  const now = new Date().toISOString();
  let found = 0;
  for (const r of raw.items ?? []) {
    const item = handles.get(r.handle);
    if (!item) continue;
    // Programme or pack, for several parts - never over an admin's word.
    if (item.trackCount > 1 && (r.structure === 'programme' || r.structure === 'pack')) {
      ctx.db
        .prepare(
          `INSERT INTO item_structures (item_id, structure, source, updated_at)
           VALUES (?, ?, 'ai', ?)
           ON CONFLICT(item_id) DO UPDATE SET structure = excluded.structure,
             updated_at = excluded.updated_at
           WHERE item_structures.source != 'manual'`,
        )
        .run(item.id, r.structure, now);
    }
    if (item.levelSource === 'manual' || item.levelSource === 'name') continue;
    if (!['beginner', 'intermediate', 'advanced', 'all'].includes(r.level)) continue;
    ctx.db
      .prepare(
        `INSERT INTO item_levels (item_id, level, source, reason, model, updated_at)
         VALUES (?, ?, 'ai', ?, ?, ?)
         ON CONFLICT(item_id) DO UPDATE SET level = excluded.level, reason = excluded.reason,
           model = excluded.model, updated_at = excluded.updated_at
         WHERE item_levels.source != 'manual'`,
      )
      .run(item.id, r.level, clip(String(r.reason ?? ''), 200), ctx.target.model, now);
    found++;
  }
  // Read, as they are now - whatever the answer was - so not sent again.
  const mark = ctx.db.prepare(
    `INSERT INTO ai_reviewed (item_id, kind, fingerprint, reviewed_at) VALUES (?, 'levels', ?, ?)
     ON CONFLICT(item_id, kind) DO UPDATE SET fingerprint = excluded.fingerprint,
       reviewed_at = excluded.reviewed_at`,
  );
  for (const i of slice) mark.run(i.id, levelPrint(i), now);
  return { batch: b, batches, found, notes: [] };
}
