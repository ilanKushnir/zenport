/**
 * A person's intentions - why they practise, what they hope for, what they
 * enjoy and have time for - stored as a few answers and handed to every AI
 * feature as a short paragraph, so plans, reviews and picks speak to *them*.
 */
import { z } from 'zod';
import { INTENTION_LIKES, INTENTION_REASONS, type IntentionsDto } from '@zenport/shared';
import type { Db } from '../db/index.js';

const reasonIds = INTENTION_REASONS.map((r) => r.id) as [string, ...string[]];
const likeIds = INTENTION_LIKES.map((l) => l.id) as [string, ...string[]];

export const intentionsSchema = z.object({
  reasons: z.array(z.enum(reasonIds)).max(INTENTION_REASONS.length).default([]),
  hope: z.string().max(600).default(''),
  experience: z.enum(['new', 'some', 'experienced', 'deep']).default('some'),
  minutes: z.enum(['5', '15', '30', '60']).default('15'),
  daysPerWeek: z.number().int().min(1).max(7).default(5),
  likes: z.array(z.enum(likeIds)).max(INTENTION_LIKES.length).default([]),
  notes: z.string().max(600).default(''),
});

export function readIntentions(db: Db, userId: number): IntentionsDto | null {
  const row = db
    .prepare('SELECT data, updated_at FROM user_intentions WHERE user_id = ?')
    .get(userId) as { data: string; updated_at: string } | undefined;
  if (!row) return null;
  const parsed = intentionsSchema.safeParse(JSON.parse(row.data));
  return parsed.success ? { ...parsed.data, updatedAt: row.updated_at } : null;
}

export function saveIntentions(db: Db, userId: number, data: IntentionsDto): void {
  db.prepare(
    `INSERT INTO user_intentions (user_id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
  ).run(userId, JSON.stringify(data), new Date().toISOString());
}

const label = (list: readonly { id: string; label: string }[], ids: string[]) =>
  ids.map((id) => list.find((x) => x.id === id)?.label.toLowerCase()).filter(Boolean);

const EXPERIENCE = {
  new: 'new to meditation',
  some: 'has some experience',
  experienced: 'an experienced practitioner',
  deep: 'a long-time, dedicated practitioner',
} as const;

/** The intentions as a few plain sentences for a prompt; '' when there are none. */
export function intentionsSummary(i: IntentionsDto | null): string {
  if (!i) return '';
  const lines = ['About me and why I practise:'];
  const reasons = label(INTENTION_REASONS, i.reasons);
  if (reasons.length) lines.push(`- I practise for: ${reasons.join(', ')}.`);
  if (i.hope.trim()) lines.push(`- A year from now I would love: ${i.hope.trim()}`);
  lines.push(`- Experience: ${EXPERIENCE[i.experience]}.`);
  lines.push(
    `- Time: about ${i.minutes === '60' ? 'an hour or more' : `${i.minutes} minutes`} on a usual day, ${i.daysPerWeek} days a week.`,
  );
  const likes = label(INTENTION_LIKES, i.likes);
  if (likes.length) lines.push(`- I enjoy: ${likes.join(', ')}.`);
  if (i.notes.trim()) lines.push(`- Please keep in mind: ${i.notes.trim()}`);
  return lines.join('\n');
}
