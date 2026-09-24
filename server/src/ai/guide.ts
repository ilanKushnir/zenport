/**
 * The guide: an AI mentor that looks back over how someone's practice has
 * actually gone - sessions, plans, courses, their intentions and, only when
 * they include it for that one review, their journal - and answers with what
 * is going well, what it notices, what to try next and where to head.
 *
 * - Everything it is told comes from records; the disclosure is computed from
 *   the very same context, so "what will be sent" is what is sent.
 * - Library items are named by handles ("m12"); a handle in the answer that
 *   is not in the catalogue is dropped.
 * - The journal is never a standing setting: each review asks again.
 */
import type {
  GuideDisclosureDto,
  GuideNextAction,
  GuideNoteDto,
  GuideTipDto,
  MeditationSummaryDto,
} from '@zenport/shared';
import { TIMER_ITEM_ID } from '@zenport/shared';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { libraryDto } from '../library/queries.js';
import { expandOccurrences } from '../plans/occurrences.js';
import { computeStats, dayKey } from '../stats/compute.js';
import { intentionsSummary, readIntentions } from './intentions.js';

const DAY_MS = 86_400_000;
const MOODS = ['', 'scattered', 'restless', 'present', 'settled', 'deeply still'];
const MAX_JOURNAL = 30;
const JOURNAL_CHARS = 12_000;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

interface SessionRow {
  item_id: string;
  started_at: string;
  listened_sec: number;
  status: 'completed' | 'abandoned' | 'active';
}

export interface GuideContext {
  text: string;
  disclosure: Omit<GuideDisclosureDto, 'canUse' | 'provider' | 'model'>;
  handles: Map<string, MeditationSummaryDto>;
}

function partOfDay(iso: string, timezone: string): string {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: timezone })
      .format(new Date(iso))
      .replace(/\D/g, ''),
  );
  return h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 22 ? 'evening' : 'night';
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Everything the guide is told, as text - and the counts of it, for the
 * disclosure. `journal` false leaves the journal out entirely (only its
 * count is taken, to say what including it would add).
 */
export function guideContext(
  db: Db,
  config: Config,
  user: { id: number; timezone: string },
  days: number,
  journal: boolean,
  now = new Date(),
): GuideContext {
  const tz = user.timezone;
  const today = dayKey(now.toISOString(), tz);
  const from = addDays(today, -(days - 1));
  const fromIso = new Date(Date.parse(`${from}T00:00:00Z`) - DAY_MS).toISOString(); // a day early; filtered by local day below
  const prevFrom = addDays(from, -days);

  const items = libraryDto(db, config, user.id).items.filter((i) => !i.missing);
  const byId = new Map(items.map((i) => [i.id, i]));
  const handles = new Map<string, MeditationSummaryDto>();
  const handleOf = new Map<string, string>();
  items.forEach((i, n) => {
    handles.set(`m${n + 1}`, i);
    handleOf.set(i.id, `m${n + 1}`);
  });
  const sitTitles = new Map(
    (
      db.prepare('SELECT id, title FROM ai_sits WHERE user_id = ?').all(user.id) as {
        id: string;
        title: string;
      }[]
    ).map((r) => [`ai:${r.id}`, r.title]),
  );
  const name = (id: string) =>
    id === TIMER_ITEM_ID
      ? 'Unguided timer'
      : sitTitles.has(id)
        ? `a meditation made for them, "${clip(sitTitles.get(id)!, 60)}"`
        : byId.has(id)
          ? `${handleOf.get(id)} "${clip(byId.get(id)!.title, 80)}" (${byId.get(id)!.type})`
          : 'a recording no longer in the library';

  const all = db
    .prepare(
      `SELECT item_id, started_at, listened_sec, status FROM practice_sessions
       WHERE user_id = ? AND status != 'active' ORDER BY started_at`,
    )
    .all(user.id) as unknown as SessionRow[];
  const real = (s: SessionRow) => s.status === 'completed' || s.listened_sec >= 60;
  const local = all.map((s) => ({ ...s, day: dayKey(s.started_at, tz) }));
  const inPeriod = local.filter((s) => s.day >= from && s.day <= today && real(s));
  const before = local.filter((s) => s.day >= prevFrom && s.day < from && real(s));
  const minutes = (list: SessionRow[]) =>
    Math.round(list.reduce((n, s) => n + s.listened_sec, 0) / 60);
  const practiceDays = new Set(inPeriod.map((s) => s.day)).size;
  const stats = computeStats(
    all.map((s) => ({
      startedAt: s.started_at,
      listenedSec: s.listened_sec,
      status: s.status,
      itemId: s.item_id,
      creator: '',
      title: '',
    })),
    tz,
    now,
  );

  const lines: string[] = [];
  const weekday = WEEKDAYS[new Date(`${today}T00:00:00Z`).getUTCDay()];
  lines.push(
    `Today is ${weekday} ${today}. Looking back over the last ${days} days (${from} to ${today}).`,
  );
  lines.push('');

  const intentions = readIntentions(db, user.id);
  lines.push(
    intentions ? intentionsSummary(intentions) : 'They have not written down their intentions.',
  );
  lines.push('');

  // ── Practice ──
  lines.push('Practice and study in this period:');
  if (inPeriod.length === 0) {
    lines.push(`- Nothing practised or studied in these ${days} days.`);
  } else {
    lines.push(
      `- ${inPeriod.length} sessions on ${practiceDays} of ${days} days, ${minutes(inPeriod)} minutes in all (average ${Math.round(minutes(inPeriod) / inPeriod.length)} min).`,
    );
    const parts = new Map<string, number>();
    const wd = new Map<string, number>();
    for (const s of inPeriod) {
      const p = partOfDay(s.started_at, tz);
      parts.set(p, (parts.get(p) ?? 0) + 1);
      const w = WEEKDAYS[new Date(`${s.day}T00:00:00Z`).getUTCDay()]!;
      wd.set(w, (wd.get(w) ?? 0) + 1);
    }
    lines.push(
      `- When: ${[...parts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([p, n]) => `${p} ${n}`)
        .join(', ')}; by weekday ${WEEKDAYS.filter((w) => wd.has(w))
        .map((w) => `${w} ${wd.get(w)}`)
        .join(', ')}.`,
    );
    const stopped = local.filter(
      (s) => s.day >= from && s.status === 'abandoned' && s.listened_sec >= 60,
    ).length;
    if (stopped) lines.push(`- ${stopped} of them were ended before the recording finished.`);
  }
  lines.push(
    `- The ${days} days before: ${before.length} sessions, ${minutes(before)} minutes. Current streak ${stats.currentStreak} days, longest ever ${stats.longestStreak}.`,
  );
  const perItem = new Map<string, { n: number; min: number; last: string }>();
  for (const s of inPeriod) {
    const cur = perItem.get(s.item_id) ?? { n: 0, min: 0, last: s.day };
    cur.n += 1;
    cur.min += s.listened_sec / 60;
    cur.last = s.day;
    perItem.set(s.item_id, cur);
  }
  if (perItem.size) {
    lines.push('- What they did:');
    for (const [id, v] of [...perItem.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 25)) {
      lines.push(`    ${name(id)}: ${v.n}x, ${Math.round(v.min)} min, last ${v.last}`);
    }
  }

  // ── Courses ──
  const lessonsInPeriod = (
    db
      .prepare('SELECT completed_at FROM track_completions WHERE user_id = ? AND completed_at >= ?')
      .all(user.id, fromIso) as { completed_at: string }[]
  ).filter((r) => dayKey(r.completed_at, tz) >= from).length;
  const courses = items.filter(
    (i) => (i.type === 'course' || i.type === 'talk') && i.completedCount > 0,
  );
  if (courses.length || lessonsInPeriod) {
    lines.push('');
    lines.push(`Courses (${lessonsInPeriod} lessons finished in this period):`);
    for (const c of courses.slice(0, 15)) {
      lines.push(
        `- ${name(c.id)}: ${c.completedCount >= c.trackCount ? 'finished' : `${c.completedCount} of ${c.trackCount} lessons done`}`,
      );
    }
  }

  // ── Plans ──
  const plans = db
    .prepare(
      `SELECT * FROM plans WHERE user_id = ? AND status != 'paused' AND start_date <= ?
       AND (end_date IS NULL OR end_date >= ?) ORDER BY COALESCE(path_name, name), COALESCE(path_step, 0)`,
    )
    .all(user.id, today, from) as unknown as {
    id: number;
    name: string;
    status: string;
    start_date: string;
    end_date: string | null;
    days_of_week: string;
    meditation_ids: string;
    shifts: string | null;
    focus: string;
    target_minutes: number | null;
    path_name: string | null;
  }[];
  lines.push('');
  if (plans.length === 0) {
    lines.push('Plans: none running.');
  } else {
    lines.push('Plans running in this period, and how they went:');
    const entryStmt = db.prepare(
      'SELECT date, status, moved_to, moved_from, session_id FROM plan_entries WHERE plan_id = ?',
    );
    for (const p of plans) {
      const dow = JSON.parse(p.days_of_week) as number[];
      const occ = expandOccurrences(
        {
          id: p.id,
          name: p.name,
          status: p.status as 'active',
          startDate: p.start_date,
          endDate: p.end_date,
          daysOfWeek: dow,
          meditationIds: JSON.parse(p.meditation_ids) as string[],
          shifts: JSON.parse(p.shifts ?? '[]'),
        },
        (
          entryStmt.all(p.id) as {
            date: string;
            status: 'completed' | 'skipped' | null;
            moved_to: string | null;
            moved_from: string | null;
            session_id: number | null;
          }[]
        ).map((e) => ({
          date: e.date,
          status: e.status,
          movedTo: e.moved_to,
          movedFrom: e.moved_from,
          sessionId: e.session_id,
        })),
        today,
        0,
      ).filter((o) => o.date >= from && o.date <= today);
      const count = (st: string) => occ.filter((o) => o.status === st).length;
      const cadence = dow.length ? dow.map((d) => WEEKDAYS[d]).join('/') : 'every day';
      lines.push(
        `- ${p.focus === 'learning' ? 'Learning' : 'Practice'} plan "${clip(p.name, 60)}"${p.path_name ? ` (part of the path "${clip(p.path_name, 60)}")` : ''}, ${cadence}${p.target_minutes ? `, ${p.target_minutes} min` : ''}, ${p.start_date} to ${p.end_date ?? 'open'}: ${count('completed')} done, ${count('missed')} missed, ${count('skipped')} skipped in this period.`,
      );
      const ids = (JSON.parse(p.meditation_ids) as string[]).slice(0, 8);
      if (ids.length) lines.push(`    with ${ids.map(name).join('; ')}`);
    }
  }

  // ── Journal ──
  const journalRows = db
    .prepare(
      `SELECT j.id, j.created_at, j.title, j.body, j.mood, j.item_id,
              (SELECT group_concat(v.transcript, ' / ') FROM voice_notes v
               WHERE v.entry_id = j.id AND v.transcript IS NOT NULL) AS voice
       FROM journal_entries j WHERE j.user_id = ? AND j.created_at >= ? ORDER BY j.created_at DESC`,
    )
    .all(user.id, fromIso) as {
    id: number;
    created_at: string;
    title: string | null;
    body: string;
    mood: number | null;
    item_id: string | null;
    voice: string | null;
  }[];
  const journalInPeriod = journalRows.filter((r) => dayKey(r.created_at, tz) >= from);
  if (journal) {
    lines.push('');
    if (journalInPeriod.length === 0) {
      lines.push('Their journal: no entries in this period.');
    } else {
      lines.push('Their journal in this period (newest first, shared for this review only):');
      let used = 0;
      for (const r of journalInPeriod.slice(0, MAX_JOURNAL)) {
        const text = [r.title, r.body, r.voice ? `(spoken) ${r.voice}` : null]
          .filter(Boolean)
          .join(' - ')
          .replace(/\s+/g, ' ')
          .trim();
        const line = `- ${dayKey(r.created_at, tz)}${r.mood ? `, felt ${MOODS[r.mood]}` : ''}${r.item_id ? `, after ${name(r.item_id)}` : ''}: ${clip(text || '(no words)', 600)}`;
        if (used + line.length > JOURNAL_CHARS) break;
        used += line.length;
        lines.push(line);
      }
    }
  }

  // ── Library, to point at ──
  lines.push('');
  lines.push('Their library (handle | type | creator > series > title | length | progress):');
  for (const [h, i] of handles) {
    const played = perItem.get(i.id);
    lines.push(
      `${h} | ${i.type} | ${clip(i.creator, 50)}${i.collection ? ` > ${clip(i.collection, 60)}` : ''} > ${clip(i.title, 80)} | ${i.totalDurationSec ? `${Math.round(i.totalDurationSec / 60)} min` : '?'}${i.trackCount > 1 ? `, ${i.trackCount} parts` : ''}${i.completedCount > 0 ? `, ${i.completedCount}/${i.trackCount} done` : ''}${i.practiceCount > 0 ? `, done ${i.practiceCount}x` : ''}${played ? ' [this period]' : ''}`,
    );
  }

  return {
    text: lines.join('\n'),
    handles,
    disclosure: {
      days,
      sessions: inPeriod.length,
      practiceDays,
      minutes: minutes(inPeriod),
      lessons: lessonsInPeriod,
      plans: plans.length,
      intentions: !!intentions,
      journalEntries: journalInPeriod.length,
      journalIncluded: journal,
      libraryItems: handles.size,
    },
  };
}

export const GUIDE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'goingWell', 'patterns', 'tips', 'next', 'reflection'],
  properties: {
    summary: {
      type: 'string',
      description: 'Two to four sentences: how their practice has actually gone, in plain words.',
    },
    goingWell: { type: 'array', items: { type: 'string' }, description: 'Up to three.' },
    patterns: {
      type: 'array',
      description: 'Up to three things the records show that they may not have noticed.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'detail'],
        properties: { title: { type: 'string' }, detail: { type: 'string' } },
      },
    },
    tips: {
      type: 'array',
      description: 'One to four concrete things to try in the coming days.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'detail', 'handle'],
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          handle: {
            type: ['string', 'null'],
            description: 'A library handle (m12) when the tip is to do that recording, else null.',
          },
        },
      },
    },
    next: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'detail', 'action'],
      properties: {
        title: { type: 'string' },
        detail: {
          type: 'string',
          description: 'The next phase: where to head in the coming weeks.',
        },
        action: {
          type: 'string',
          enum: ['none', 'plan', 'adjust'],
          description:
            'plan: they have no plan and one would help; adjust: a running plan no longer fits; none otherwise.',
        },
      },
    },
    reflection: {
      type: 'string',
      description: 'One open question for them to sit with or write about.',
    },
  },
} as const;

export const GUIDE_SYSTEM = [
  'You are a meditation guide: warm, grounded and honest, like a teacher who has known this',
  'person for a while. You are given the records of their practice in ZenPort, their',
  'intentions, the plans they follow, sometimes their journal, and their library.',
  '',
  '- Base every word on the records. Never invent sessions, feelings or progress. If there is',
  '  little to go on, say so simply and keep the advice small.',
  '- Speak to them as "you", plainly, without jargon, emojis or flattery. Be kind about gaps -',
  '  never scold - and specific about what went well.',
  '- Tips must be concrete and doable in the coming days (a time, a length, a recording).',
  '  Point to their own library by handle when a recording fits; never name one not listed.',
  '  Handles are for the handle field only: in your words, call a recording by its title.',
  '- The next phase looks further: what to deepen, begin or let go of over the coming weeks,',
  '  in line with their intentions.',
  '- If they share a journal, reflect it gently and never quote it at length. You are not a',
  '  therapist: if it shows real distress, say kindly that talking with someone they trust or',
  '  a professional can help, alongside practice. No medical claims.',
  '- Write in the language they write in (their intentions or journal); English if unsure.',
].join('\n');

interface RawGuide {
  summary?: string;
  goingWell?: string[];
  patterns?: { title: string; detail: string }[];
  tips?: { title: string; detail: string; handle: string | null }[];
  next?: { title: string; detail: string; action: string };
  reflection?: string;
}

export type GuideBody = Omit<
  GuideNoteDto,
  'id' | 'createdAt' | 'days' | 'usedJournal' | 'question' | 'model'
>;

/** The model's answer, checked: handles resolved, lengths capped, blanks dropped. */
export function resolveGuide(raw: unknown, handles: Map<string, MeditationSummaryDto>): GuideBody {
  const r = (raw ?? {}) as RawGuide;
  // A handle that slipped into the words becomes the recording's title.
  const unhandle = (s: string) =>
    s.replace(/\b(m\d+)\b(\s+(["“])[^"”]*["”])?/g, (all, h: string, quoted?: string) => {
      const i = handles.get(h);
      if (!i) return all;
      return quoted ? quoted.trim() : `“${i.title}”`;
    });
  const str = (s: unknown, n: number) => clip(unhandle(String(s ?? '').trim()), n);
  const tips: GuideTipDto[] = (r.tips ?? [])
    .map((t) => {
      const i = t.handle ? handles.get(t.handle.trim()) : undefined;
      return {
        title: str(t.title, 120),
        detail: str(t.detail, 600),
        item: i ? { id: i.id, title: i.title, creator: i.creator, coverId: i.coverId } : null,
      };
    })
    .filter((t) => t.title || t.detail)
    .slice(0, 4);
  const action = (['none', 'plan', 'adjust'] as GuideNextAction[]).includes(
    r.next?.action as GuideNextAction,
  )
    ? (r.next!.action as GuideNextAction)
    : 'none';
  return {
    summary: str(r.summary, 1200),
    goingWell: (r.goingWell ?? [])
      .map((s) => str(s, 300))
      .filter(Boolean)
      .slice(0, 3),
    patterns: (r.patterns ?? [])
      .map((p) => ({ title: str(p.title, 120), detail: str(p.detail, 600) }))
      .filter((p) => p.title || p.detail)
      .slice(0, 3),
    tips,
    next: { title: str(r.next?.title, 120), detail: str(r.next?.detail, 800), action },
    reflection: str(r.reflection, 400),
  };
}

interface NoteRow {
  id: number;
  created_at: string;
  days: number;
  used_journal: number;
  question: string | null;
  body: string;
  model: string | null;
}

export function noteDto(r: NoteRow): GuideNoteDto {
  return {
    id: r.id,
    createdAt: r.created_at,
    days: r.days,
    usedJournal: r.used_journal === 1,
    question: r.question,
    model: r.model,
    ...(JSON.parse(r.body) as GuideBody),
  };
}

export function saveNote(
  db: Db,
  userId: number,
  days: number,
  usedJournal: boolean,
  question: string | null,
  body: GuideBody,
  model: string,
): GuideNoteDto {
  const createdAt = new Date().toISOString();
  const res = db
    .prepare(
      `INSERT INTO guide_notes (user_id, created_at, days, used_journal, question, body, model)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(userId, createdAt, days, usedJournal ? 1 : 0, question, JSON.stringify(body), model);
  return noteDto({
    id: Number(res.lastInsertRowid),
    created_at: createdAt,
    days,
    used_journal: usedJournal ? 1 : 0,
    question,
    body: JSON.stringify(body),
    model,
  });
}

export function listNotes(db: Db, userId: number): GuideNoteDto[] {
  return (
    db
      .prepare('SELECT * FROM guide_notes WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(userId) as unknown as NoteRow[]
  ).map(noteDto);
}
