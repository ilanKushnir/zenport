/**
 * Made for you: a guided meditation written for this person, now - how they
 * arrive, how long they have, what they want to rest on - then spoken by
 * OpenAI's speech model and laid out in real time, with the silences a
 * meditation needs between the words.
 *
 * - The script is written by their AI (any provider) as short spoken
 *   passages, each with a relative pause after it.
 * - Every passage is spoken (a few at a time); its true length is known from
 *   the audio, so the silences are sized to land the whole on the minutes
 *   asked for - speech rarely more than a third of it.
 * - One MP3 comes out (mp3.ts): lead-in, words, silences, a quiet close.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SitDto, SitFeeling, SitFocus, SitRequest, SitVoice } from '@zenport/shared';
import { SIT_FEELINGS, SIT_FOCI } from '@zenport/shared';
import type { Db } from '../db/index.js';
import { dayKey } from '../stats/compute.js';
import { intentionsSummary, readIntentions } from './intentions.js';
import { durationOf, stitch } from './mp3.js';
import type { AiClient, AiTarget } from './providers.js';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const sitsDir = (dataDir: string) => path.join(dataDir, 'sits');

const LEAD_IN = 4;
const CLOSE = 8;
const MIN_PAUSE = 3;
/** Measured: a calm guided voice says about 1.7 words a second. */
const WORDS_PER_SEC = 1.7;

export const SIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'passages'],
  properties: {
    title: { type: 'string', description: 'Two to five words, gentle, no quotes.' },
    passages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'pause'],
        properties: {
          text: { type: 'string', description: 'What is said: one to four short sentences.' },
          pause: {
            type: 'integer',
            description: 'Silence after it, relative: 1 a breath, 3 a settle, 10 a long rest.',
          },
        },
      },
    },
  },
} as const;

export const SIT_SYSTEM = [
  'You are an experienced meditation teacher writing a guided meditation for one person, to be',
  'spoken aloud by a calm voice, with real silence between the passages.',
  '',
  '- Meet them where they are (how they arrive, what they wrote) without dwelling on it.',
  '- Plain, warm, spoken language; short sentences; present tense; "you". No jargon, no',
  '  lists, no stage directions, no emojis, nothing in brackets - every word is read out.',
  '- Shape: arrive and settle; the main practice with its focus, returning gently when the mind',
  '  wanders; widen out; a soft close that brings them back (for sleep: no waking, let them',
  '  drift). Longer sits leave longer silences in the middle, not more words.',
  '- Nothing medical or promised. If what they wrote suggests real distress, include one kind',
  '  line that talking to someone they trust can help too.',
  '- Write in the language of what they wrote (their note or intentions); English if unsure.',
].join('\n');

/** How many words and passages suit a length. */
export function sitShape(minutes: number): { words: number; passages: number } {
  const words = Math.round(minutes * 60 * 0.3 * WORDS_PER_SEC);
  const passages = Math.max(6, Math.min(28, Math.round(minutes * 1.6)));
  return { words, passages };
}

export function sitPrompt(
  db: Db,
  user: { id: number; timezone: string },
  req: SitRequest,
  now = new Date(),
): string {
  const { words, passages } = sitShape(req.minutes);
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: user.timezone })
      .format(now)
      .replace(/\D/g, ''),
  );
  const part =
    hour < 5
      ? 'night'
      : hour < 12
        ? 'morning'
        : hour < 17
          ? 'afternoon'
          : hour < 22
            ? 'evening'
            : 'night';
  const feel = req.feelings
    .map((f) => SIT_FEELINGS.find((x) => x.id === f)?.label.toLowerCase())
    .filter(Boolean);
  const focus = SIT_FOCI.find((f) => f.id === req.focus)!;
  const intentions = readIntentions(db, user.id);
  return [
    `It is ${part} (${dayKey(now.toISOString(), user.timezone)}). Length: ${req.minutes} minutes.`,
    feel.length ? `They arrive feeling: ${feel.join(', ')}.` : 'They did not say how they feel.',
    req.note?.trim() ? `In their words: ${clip(req.note.trim(), 600)}` : '',
    req.focus === 'any'
      ? 'Focus: choose what suits them now.'
      : `Focus: ${focus.label.toLowerCase()}.`,
    intentions ? intentionsSummary(intentions) : '',
    '',
    `Write about ${words} words in all, in about ${passages} passages. The pauses are relative;`,
    'the app sizes the silences to the length.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

interface RawSit {
  title?: string;
  passages?: { text: string; pause: number }[];
}

/** The script, checked: spoken text only, sensible pauses, a title. */
export function resolveScript(raw: unknown): {
  title: string;
  passages: { text: string; pause: number }[];
} {
  const r = (raw ?? {}) as RawSit;
  const passages = (r.passages ?? [])
    .map((p) => ({
      // Anything bracketed would be read aloud: drop it.
      text: String(p.text ?? '')
        .replace(/\[[^\]]*\]|\([^)]*pause[^)]*\)/gi, '')
        .replace(/\s+/g, ' ')
        .trim(),
      pause: Math.max(1, Math.min(20, Math.round(Number(p.pause) || 2))),
    }))
    .filter((p) => p.text.length > 0)
    .map((p) => ({ ...p, text: clip(p.text, 1200) }))
    .slice(0, 40);
  const title = clip(
    String(r.title ?? '')
      .replace(/["“”]/g, '')
      .trim() || 'A sit for now',
    60,
  );
  return { title, passages };
}

/**
 * Silences that land the whole on `target` seconds: lead-in, then each
 * passage's pause in proportion to its weight (never under MIN_PAUSE), and
 * a quiet close after the last.
 */
export function layPauses(speechSec: number[], weights: number[], target: number): number[] {
  const n = speechSec.length;
  const spoken = speechSec.reduce((a, b) => a + b, 0);
  const between = Math.max(0, target - LEAD_IN - CLOSE - spoken);
  const inner = weights.slice(0, n - 1);
  const total = inner.reduce((a, b) => a + b, 0) || 1;
  const out = inner.map((w) => Math.max(MIN_PAUSE, (between * w) / total));
  out.push(CLOSE);
  return out;
}

async function speakAll(
  ai: AiClient,
  apiKey: string,
  voice: SitVoice,
  texts: string[],
): Promise<Buffer[]> {
  const instructions =
    'Speak as an experienced meditation teacher guiding a session: slowly, softly and warmly, with calm, low energy. Let sentences breathe, with unhurried pauses between them. Never rushed, never theatrical.';
  const out: Buffer[] = new Array(texts.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(4, texts.length) }, async () => {
      while (next < texts.length) {
        const i = next++;
        out[i] = await ai.speak(apiKey, { text: texts[i]!, voice, instructions });
      }
    }),
  );
  return out;
}

export async function makeSit(
  db: Db,
  dataDir: string,
  ai: AiClient,
  target: AiTarget,
  speechKey: string,
  user: { id: number; timezone: string },
  req: SitRequest,
): Promise<SitDto> {
  const raw = await ai.chatJson(target, {
    system: SIT_SYSTEM,
    user: sitPrompt(db, user, req),
    schemaName: 'zenport_sit',
    schema: SIT_SCHEMA as unknown as Record<string, unknown>,
  });
  const script = resolveScript(raw);
  if (script.passages.length < 3) throw new Error('script too short');
  const audio = await speakAll(
    ai,
    speechKey,
    req.voice,
    script.passages.map((p) => p.text),
  );
  const pauses = layPauses(
    audio.map((a) => durationOf(a)),
    script.passages.map((p) => p.pause),
    req.minutes * 60,
  );
  const joined = stitch(
    audio.map((mp3, i) => ({ mp3, pauseAfter: pauses[i]! })),
    LEAD_IN,
  );
  const id = randomBytes(10).toString('hex');
  const file = `${id}.mp3`;
  await mkdir(sitsDir(dataDir), { recursive: true });
  await writeFile(path.join(sitsDir(dataDir), file), joined.mp3);
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO ai_sits (id, user_id, created_at, title, minutes, duration_sec, feelings, focus, voice,
       note, script, file, size_bytes, model) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    user.id,
    createdAt,
    script.title,
    req.minutes,
    joined.durationSec,
    JSON.stringify(req.feelings),
    req.focus,
    req.voice,
    req.note?.trim() || null,
    JSON.stringify(script.passages.map((p) => p.text)),
    file,
    joined.mp3.length,
    target.model,
  );
  return readSit(db, user.id, id)!;
}

interface SitRow {
  id: string;
  created_at: string;
  title: string;
  minutes: number;
  duration_sec: number;
  feelings: string;
  focus: SitFocus;
  voice: SitVoice;
  note: string | null;
  script: string;
  file: string;
  size_bytes: number;
  sat: number;
}

const SIT_SELECT = `SELECT a.*, (SELECT COUNT(*) FROM practice_sessions s
    WHERE s.user_id = a.user_id AND s.item_id = 'ai:' || a.id AND s.status != 'active'
      AND (s.status = 'completed' OR s.listened_sec >= 60)) AS sat
  FROM ai_sits a`;

const toDto = (r: SitRow): SitDto => ({
  id: r.id,
  createdAt: r.created_at,
  title: r.title,
  minutes: r.minutes,
  durationSec: r.duration_sec,
  feelings: JSON.parse(r.feelings) as SitFeeling[],
  focus: r.focus,
  voice: r.voice,
  note: r.note,
  script: JSON.parse(r.script) as string[],
  sat: r.sat,
});

export function listSits(db: Db, userId: number): SitDto[] {
  return (
    db
      .prepare(`${SIT_SELECT} WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 60`)
      .all(userId) as unknown as SitRow[]
  ).map(toDto);
}

export function readSit(db: Db, userId: number, id: string): SitDto | null {
  const r = db.prepare(`${SIT_SELECT} WHERE a.id = ? AND a.user_id = ?`).get(id, userId) as
    SitRow | undefined;
  return r ? toDto(r) : null;
}

export function sitFile(db: Db, userId: number, id: string): { file: string; size: number } | null {
  const r = db
    .prepare('SELECT file, size_bytes FROM ai_sits WHERE id = ? AND user_id = ?')
    .get(id, userId) as { file: string; size_bytes: number } | undefined;
  return r ? { file: r.file, size: r.size_bytes } : null;
}
