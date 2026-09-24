/**
 * Programme or pack? Several meditations can be one of two things:
 *
 * - a programme: meant in order, each building on the last - days, parts,
 *   weeks, a numbered sequence (Day 1…10, Part 1…4, Wave I…VIII);
 * - a pack (or, for a folder of several, a collection): a set to choose
 *   from, in any order.
 *
 * Names usually tell: a programme's parts carry their place in the
 * sequence. This reads that; the AI and an admin can say otherwise.
 */

const ROMAN: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
};

const MARKER =
  /\b(?:day|part|session|week|lesson|episode|ep|chapter|module|step|stage|level|wave|volume|vol|track|take|month)\.?\s*(\d{1,3}|[ivx]{1,4})\b/i;

/** The place a name gives itself in a sequence, if it gives one. */
export function sequenceNumber(name: string): number | null {
  const n = name.replace(/\.[a-z0-9]{2,4}$/i, '');
  const m = MARKER.exec(n);
  if (m) {
    const v = m[1]!.toLowerCase();
    return /^\d+$/.test(v) ? Number(v) : (ROMAN[v] ?? null);
  }
  const lead = /^\s*(\d{1,3})(?:\s*[.):\-–—]|\s+)/.exec(n);
  if (lead) return Number(lead[1]);
  const tail = /(?:^|[\s_-])(\d{1,5})\s*$/.exec(n);
  if (tail) return Number(tail[1]);
  return null;
}

/**
 * Do these names read as a sequence? Most carry a number, and those numbers
 * are distinct - the marks of parts meant in order.
 */
export function looksSequential(names: string[]): boolean {
  if (names.length < 2) return false;
  const nums = names.map(sequenceNumber).filter((n): n is number => n !== null);
  if (nums.length / names.length < 0.6) return false;
  return new Set(nums).size >= Math.max(2, Math.ceil(nums.length * 0.6));
}

export type Structure = 'programme' | 'pack' | 'single';
export type StructureSource = 'manual' | 'ai' | 'name';

/** A part that frames the practice rather than being one: an introduction, instructions, a close. */
export const isFramingPart = (name: string): boolean =>
  /\b(?:intro|introduction|instructions?|instructional|explanation|explained|explains?|preparation|prepare|welcome|outro|closing|tutorial|how to use|read first|booklet|overview|q&a)\b/i.test(
    name,
  );

/** The parts that are practice - several of them make a programme or a pack. */
export const practiceParts = (names: string[]): string[] => names.filter((n) => !isFramingPart(n));

/** A part that is another way of doing the same practice: lying down or not, live, with music. */
const VARIANT =
  /\b(?:versions?|lay[\s-]?down|non[\s-]lay|live|music|without (?:music|voice|words)|no (?:music|voice)|silent)\b/i;

/**
 * Several practice parts that are one meditation all the same: the same
 * practice in versions ("Lay Down Version" and "Non-Lay Down Version"; a
 * meditation and its live or music version), or its pieces and their
 * combination ("Breath", "Meditation", "Combined Breath and Meditation").
 * A set of different meditations - morning and evening, day and night -
 * is not.
 */
export function oneInVersions(practice: string[]): boolean {
  if (practice.length < 2) return false;
  if (practice.some((n) => /\bcombined\b/i.test(n))) return true;
  if (practice.every((n) => /\bversion\b/i.test(n))) return true;
  // One plain practice and the rest its versions.
  return practice.filter((n) => !VARIANT.test(n)).length === 1;
}
