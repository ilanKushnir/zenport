/**
 * The order a folder's parts play in, before anyone arranges it by hand.
 *
 * File names sort naturally ("Day 2" before "Day 10"), which is right for
 * the numbered parts of a series - but series also carry pieces that are not
 * numbered in the sequence: an intro video, a welcome, a closing talk, a
 * bonus. Sorted by name those land wherever their letters put them, so
 * "Discovery Series Intro-video" plays after "Discovery Part 1 Day 10".
 *
 * The rule: a part that is *not* numbered in the sequence goes first when it
 * reads as an introduction, or when it is a video among numbered parts (a
 * series' videos are its framing - explanations numbered into the middle of
 * a series carry their number, and keep their place). It goes last when it
 * reads as a closing or a bonus. Everything else keeps its natural order.
 *
 * "Numbered in the sequence" means a number that tells the parts apart: a
 * leading "03 -", or "Day 3", "Lesson 3", "Part 3"... - but not a number every
 * numbered part shares, such as the "Part 1" in "Discovery Part 1 Day 3".
 */
import { isVideoExt } from '@zenport/shared';

const INTRO =
  /\b(intro|introduction|introductory|welcome|overview|orientation|preface|prologue|foreword|trailer|start here|begin here|getting started|read ?me first)\b/i;
const OUTRO =
  /\b(outro|closing|conclusion|epilogue|afterword|final words|farewell|wrap[- ]?up|bonus|extras?)\b/i;
const SEQ_WORDS =
  'day|lesson|session|episode|ep|chapter|ch|week|track|class|module|part|pt|step|meditation|practice|talk|video|unit|level|stage|section|vol|volume|book|season|series';
const ALIAS: Record<string, string> = { ep: 'episode', pt: 'part', ch: 'chapter', vol: 'volume' };
const SEQ = new RegExp(`\\b(${SEQ_WORDS})[\\s._-]*(\\d+)`, 'gi');

function stem(name: string): string {
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : name).replace(/[_]+/g, ' ');
}

/** The numbers a name is ordered by, as "word:n" (a leading number is "#:n"). */
function sequenceMarks(name: string): Set<string> {
  const s = stem(name);
  const marks = new Set<string>();
  const lead = /^\s*(\d+)/.exec(s);
  if (lead) marks.add(`#:${Number(lead[1])}`);
  for (const m of s.matchAll(SEQ)) {
    const word = m[1]!.toLowerCase();
    marks.add(`${ALIAS[word] ?? word}:${Number(m[2])}`);
  }
  // A bare number anywhere ("Morning 3") still orders a part among its set.
  if (marks.size === 0) {
    for (const m of s.matchAll(/(?:^|[\s._-])(\d{1,3})(?=$|[\s._-])/g))
      marks.add(`n:${Number(m[1])}`);
  }
  return marks;
}

export type TrackPlacement = 'first' | 'middle' | 'last';

/**
 * Where each part belongs. Takes the parts already in natural order and
 * returns them re-placed, with how many were moved (for the scan's notes).
 */
export function orderTracks<T extends { name: string; ext: string }>(
  sorted: T[],
): { tracks: T[]; moved: number } {
  if (sorted.length < 2) return { tracks: sorted, moved: 0 };
  const marks = sorted.map((t) => sequenceMarks(t.name));
  const numbered = marks.filter((m) => m.size > 0);
  // Marks every numbered part carries tell nothing apart ("Part 1" of "Part 1 Day 3").
  const shared = new Set(
    numbered.length > 1
      ? [...numbered[0]!].filter((mark) => numbered.every((m) => m.has(mark)))
      : [],
  );
  const inSequence = marks.map((m) => [...m].some((mark) => !shared.has(mark)));
  const anyInSequence = inSequence.some(Boolean);
  const anyAudio = sorted.some((t) => !isVideoExt(t.ext));

  const place = (t: T, i: number): TrackPlacement => {
    if (inSequence[i]) return 'middle';
    const s = stem(t.name);
    if (INTRO.test(s)) return 'first';
    if (OUTRO.test(s)) return 'last';
    // An unnumbered video framing numbered audio parts.
    if (anyInSequence && anyAudio && isVideoExt(t.ext)) return 'first';
    return 'middle';
  };
  const placed = sorted.map((t, i) => ({ t, i, p: place(t, i) }));
  const rank = { first: 0, middle: 1, last: 2 } as const;
  const tracks = [...placed].sort((a, b) => rank[a.p] - rank[b.p] || a.i - b.i).map((x) => x.t);
  const moved = tracks.filter((t, i) => t !== sorted[i]).length;
  return { tracks, moved };
}
