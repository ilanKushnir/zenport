/**
 * The library, written compactly for a prompt. Every feature that lets the AI
 * point at recordings sends the whole library, and it is most of what those
 * requests cost - so say each thing once:
 *
 * - Recordings are grouped under "creator > series" headings, instead of
 *   repeating both on every line.
 * - A title that begins with its series name loses it ("Calm Pack - Day 3"
 *   under "Calm Pack" is "Day 3").
 * - A run of numbered parts is a range ("Day 1–30"), and parts of much the
 *   same length share one length ("~10m each").
 *
 * Nothing is dropped that an answer could depend on: every handle, every
 * part's number, what is done.
 */
import { naturalCompare, type MeditationSummaryDto } from '@zenport/shared';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** "Calm Pack - Day 3" under "Calm Pack" → "Day 3". Never to nothing. */
export function shortTitle(title: string, series: string | null): string {
  if (!series) return title;
  const t = title.trim();
  const s = series.trim();
  if (t.toLowerCase().startsWith(s.toLowerCase())) {
    const rest = t.slice(s.length).replace(/^[\s\-–—:.,|/·]+/, '');
    if (rest.length >= 2) return rest;
  }
  return t;
}

export interface ShelfRow {
  handle: string;
  item: MeditationSummaryDto;
  /** What follows the title on its line: "10 min, never tried". */
  tail: string;
  /** Lines beneath it (parts), already indented. */
  below?: string[];
}

/**
 * Rows grouped under "creator > series" headings, in library order. A heading
 * is written once; its rows follow, indented, as "m12 Title · tail".
 */
export function listByShelf(rows: ShelfRow[], titleLen = 80): string[] {
  const sorted = [...rows].sort(
    (a, b) =>
      naturalCompare(a.item.creator, b.item.creator) ||
      naturalCompare(a.item.collection ?? '', b.item.collection ?? '') ||
      naturalCompare(a.item.title, b.item.title),
  );
  const out: string[] = [];
  let shelf = '';
  for (const r of sorted) {
    const head = `${clip(r.item.creator, 60)}${r.item.collection ? ` > ${clip(r.item.collection, 80)}` : ''}`;
    if (head !== shelf) {
      out.push(`${head}:`);
      shelf = head;
    }
    const title = clip(shortTitle(r.item.title, r.item.collection), titleLen);
    out.push(`  ${r.handle} ${title}${r.tail ? ` · ${r.tail}` : ''}`);
    if (r.below) out.push(...r.below);
  }
  return out;
}

export interface Lesson {
  title: string;
  minutes: number | null;
  done: boolean;
  practice: boolean;
}

/** "Day 7" → { stem: "Day", n: 7 }; null when the name is not stem + number. */
function numbered(title: string): { stem: string; n: number } | null {
  const m = /^(.*?)[\s._-]*0*(\d{1,4})$/.exec(title.trim());
  if (!m) return null;
  return { stem: m[1]!.trim(), n: Number(m[2]) };
}

/**
 * A course's parts as one or two short lines. Numbered runs collapse to a
 * range; lengths that barely vary are said once; done and practice marks
 * stay on the parts they belong to.
 */
export function compactLessons(
  lessons: Lesson[],
  series: string | null,
  max = 150,
  indent = '    ',
): string[] {
  if (lessons.length <= 1) return [];
  const shown = lessons.slice(0, max);
  const titles = shown.map((l) => clip(shortTitle(l.title, series), 70));
  const mins = shown.map((l) => l.minutes).filter((m): m is number => m !== null);
  const even =
    mins.length === shown.length && mins.length > 0 && Math.max(...mins) - Math.min(...mins) <= 2;
  const each = even ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;

  // One stem numbered 1..n in order, nothing marked: a single range.
  const nums = titles.map(numbered);
  const stem = nums[0]?.stem;
  const plainRun =
    nums.every((x, k) => x && x.stem === stem && x.n === (nums[0]!.n ?? 1) + k) &&
    shown.every((l) => !l.done && !l.practice);
  const more = lessons.length > max ? `; … ${lessons.length - max} more` : '';
  if (plainRun) {
    const first = nums[0]!.n;
    return [
      `${indent}parts: ${stem ? `${stem} ` : ''}${first}–${first + shown.length - 1}${each ? `, ~${each}m each` : ''}${more}`,
    ];
  }
  const parts = shown.map(
    (l, k) =>
      `${k + 1}. ${titles[k]}${!each && l.minutes ? ` (${l.minutes}m)` : ''}${l.practice ? ' [guided practice]' : ''}${l.done ? ' [done]' : ''}`,
  );
  return [`${indent}parts${each ? ` (~${each}m each)` : ''}: ${parts.join('; ')}${more}`];
}
