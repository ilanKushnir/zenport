/**
 * Reading a set from recordings' names: "Calm Harbour - Vol. 3 (2015)" is the
 * third of "Calm Harbour"; "Open Sky - To Rest" shares "Open Sky" with its
 * siblings. Pure - used by the scanner (a numbered set becomes a series as
 * the library is read) and by the suggestions in Review (library/groups.ts).
 */

/** Trailing notes that say nothing about which set it is: a year, a language, "Updated Version". */
const NOTES =
  /(?:\s*[-–—]\s*(?:updated|new|short|long|extended|live)\s+version\b|\s*\((?:\d{4}|english|official|adv|advanced|updated version)\)|\s*[-–—]\s*(?:meditations?|audio|video)$)+\s*$/i;

export function plainTitle(title: string): string {
  let t = title.trim();
  for (let i = 0; i < 4; i++) {
    const next = t.replace(NOTES, '').trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

/**
 * "Advanced Workshop Meditations - Vol. 3 (2015)" → { stem: "Advanced Workshop Meditations", n: 3 }.
 * The number must be a set's number - after "Vol.", "Part", "Book", or on its
 * own after the name - not one inside a title ("Take 10").
 */
export function numberedStem(title: string): { stem: string; n: number } | null {
  const t = plainTitle(title);
  const m =
    /^(.{4,}?)[\s,:–—-]+(?:vol(?:ume)?\.?|part|pt\.?|book|chapter|no\.?|#)\s*(\d{1,3})\b/i.exec(
      t,
    ) ??
    // A bare number after the name needs a name of two words or more: "Quiet
    // Walk 04" is the fourth of a set, "Take 10" is a title.
    /^(\S+(?:\s+\S+)+?)\s+0*(\d{1,2})(?:\s*[-–—:]\s+.*)?$/.exec(t);
  if (!m) return null;
  const stem = m[1]!.replace(/[\s,:–—-]+$/, '').trim();
  if (stem.length < 4 || /^\d+$/.test(stem)) return null;
  return { stem, n: Number(m[2]) };
}

/** "Morning Light - To Health (2020)" → "Morning Light": the name before its first dash. */
export function sharedStem(title: string): string | null {
  const t = plainTitle(title);
  const m = /^(.{6,}?)\s+[-–—]\s+\S/.exec(t);
  return m ? m[1]!.trim() : null;
}
