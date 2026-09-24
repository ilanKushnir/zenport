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

/** Words too common to make a set's name on their own. */
const FILLER = new Set(
  'the a an my your our his her their this that of in on for to and with from by love light life meditation meditations guided walking morning evening deep new'.split(
    ' ',
  ),
);

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const normWord = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/**
 * Siblings that share a lead name - "Generating Change", "Generating Flow",
 * "Generating Joy"; "Open Sky - To Rest", "Open Sky - To Joy" - grouped by
 * that name. A set needs three or more, a lead that says something (not
 * "The" or "Love" alone; at least 7 letters), and each title only a few
 * words past it: the lead names the set, the rest names the one.
 * Returns the lead for each title in a set (by index).
 */
export function sharedLeads(titles: string[]): Map<number, string> {
  const plain = titles.map((t) => plainTitle(t));
  const toks = plain.map((t) => words(t.replace(/\s+[-–—:]\s+/g, ' ')));
  // How many titles begin with each run of words.
  const counts = new Map<string, number>();
  toks.forEach((ws) => {
    for (let n = 1; n <= ws.length; n++) {
      const key = ws.slice(0, n).map(normWord).join(' ');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  });
  const out = new Map<number, string>();
  toks.forEach((ws, i) => {
    // The longest lead three or more share.
    for (let n = ws.length; n >= 1; n--) {
      // A lead never ends on a joining word ("Open Sky - To …" is "Open Sky").
      let m = n;
      while (m > 1 && FILLER.has(normWord(ws[m - 1]!))) m--;
      const lead = ws.slice(0, m);
      const key = lead.map(normWord).join(' ');
      if ((counts.get(key) ?? 0) < 3) continue;
      const letters = key.replace(/\s/g, '').length;
      if (lead.every((w) => FILLER.has(normWord(w))) || letters < 7) break;
      if (ws.length - m > 5) break;
      // Keep the lead as the first title wrote it, dash and all trimmed.
      out.set(i, plain[i]!.slice(0, plain[i]!.indexOf(lead.at(-1)!) + lead.at(-1)!.length).trim());
      break;
    }
  });
  // Only leads that still gather three (a longer title's lead can differ).
  const size = new Map<string, number>();
  for (const l of out.values()) size.set(l.toLowerCase(), (size.get(l.toLowerCase()) ?? 0) + 1);
  for (const [i, l] of out) if ((size.get(l.toLowerCase()) ?? 0) < 3) out.delete(i);
  return out;
}
