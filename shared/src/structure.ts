/**
 * Several meditations together are a **pack**. Some packs are meant **in
 * order** - a path taken a step at a time, each building on the last - and
 * the rest are a set to choose from, in any order. An introduction and one
 * meditation, or one meditation in versions, is not a pack at all: it is one
 * meditation.
 *
 * Whether a pack is in order is read from its parts' names, and only from
 * words that name a step - Day 3, Week 2, Session 1, Lesson 4, Part 2, Level
 * 1, Wave III, S1E2 - never from a bare number, a volume or a track number:
 * "Energy Centers 01…11" or "Vol. 1…5" are a catalogue, not a path. The same
 * names always give the same answer; an admin can say otherwise.
 * (Internally a pack in order is a 'programme'.)
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

const STEP =
  /\b(?:day|week|session|lesson|module|part|step|stage|level|chapter|class|episode|ep|wave|month)\.?\s*(\d{1,3}|[ivx]{1,4})\b|\bs(\d{1,2})\s*e(\d{1,3})\b|#\s*(\d{1,3})\b/gi;

/** A raw file name that is only a numbered run: "audio-2248", "track_07", "12". */
const RAW = /^[a-z]{0,12}[\s_-]*\d{1,6}(?:[\s_-]*(?:video|audio))?$/i;

/**
 * Meant in order: most names name a step ("Day 3", "Week 2", "Part 1",
 * "Exploring #4") and the steps differ - a path, not a catalogue. Every step
 * in a name counts ("Part 1 Day 3" is day 3 of part 1). A run of raw,
 * consecutively numbered files ("audio-2248", "audio-2249") reads the same.
 */
export function meantInOrder(names: string[]): boolean {
  if (names.length < 2) return false;
  const steps = names
    .map((n) => {
      const bare = n.replace(/\.[a-z0-9]{2,4}$/i, '');
      const found = [...bare.matchAll(STEP)].map((m) => {
        const v = (m[1] ?? (m[2] ? `${m[2]}x${m[3]}` : m[4]) ?? '').toLowerCase();
        return /^[\dx]+$/.test(v) ? v.replace(/^0+(?=\d)/, '') : String(ROMAN[v] ?? v);
      });
      return found.length ? found.join('.') : null;
    })
    .filter((x): x is string => x !== null);
  if (steps.length / names.length >= 0.6 && new Set(steps).size >= 2) return true;
  // A numbered run of raw files, recorded one after another.
  const raw = names.filter((n) => RAW.test(n.replace(/\.[a-z0-9]{2,4}$/i, '').trim()));
  return raw.length / names.length >= 0.6 && looksSequential(raw);
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
