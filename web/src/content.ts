/**
 * The four kinds of thing in a library, as the interface names them.
 * One place, so a course is called a course - with the same icon and the same
 * one-line explanation - on every screen.
 */
import type { ContentType, ItemLevel, MeditationSummaryDto } from '@zenport/shared';
import {
  CONTENT_TYPES,
  LEVEL_ORDER,
  looksSequential,
  naturalCompare,
  sequenceNumber,
} from '@zenport/shared';

export interface TypeMeta {
  label: string;
  plural: string;
  icon: string;
  /** What it is, for the type picker. */
  blurb: string;
  /** What a track is called inside one. */
  part: string;
  parts: string;
}

export const TYPE_META: Record<ContentType, TypeMeta> = {
  meditation: {
    label: 'Meditation',
    plural: 'Meditations',
    icon: 'lotus',
    blurb: 'A guided practice - intro tracks and all.',
    part: 'track',
    parts: 'tracks',
  },
  course: {
    label: 'Course',
    plural: 'Courses',
    icon: 'book',
    blurb: 'Lessons worked through in order, video or audio.',
    part: 'lesson',
    parts: 'lessons',
  },
  talk: {
    label: 'Talk',
    plural: 'Talks',
    icon: 'talk',
    blurb: 'A lecture, livestream, workshop or Q&A.',
    part: 'part',
    parts: 'parts',
  },
  soundscape: {
    label: 'Soundscape',
    plural: 'Soundscapes',
    icon: 'waves',
    blurb: 'Music, sound baths, ambient or sleep sound.',
    part: 'track',
    parts: 'tracks',
  },
};

export const TYPES = CONTENT_TYPES;

/** Series are items sharing a creator and a collection; a lone item is not one. */
export interface Series {
  key: string;
  creator: string;
  name: string;
  items: MeditationSummaryDto[];
  type: ContentType;
  trackCount: number;
  completedCount: number;
  coverId: string | null;
  hasVideo: boolean;
}

export const seriesKey = (creator: string, name: string) => `${creator}\u0000${name}`;
export const seriesPath = (creator: string, name: string) =>
  `/series/${encodeURIComponent(creator)}/${encodeURIComponent(name)}`;

/** Group items into series (2+ items sharing creator and collection) and singles. */
export function groupSeries(items: MeditationSummaryDto[]): {
  series: Series[];
  singles: MeditationSummaryDto[];
} {
  const groups = new Map<string, MeditationSummaryDto[]>();
  const singles: MeditationSummaryDto[] = [];
  for (const i of items) {
    if (!i.collection) {
      singles.push(i);
      continue;
    }
    const k = seriesKey(i.creator, i.collection);
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const series: Series[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) {
      singles.push(...list);
      continue;
    }
    const counts = new Map<ContentType, number>();
    for (const i of list) counts.set(i.type, (counts.get(i.type) ?? 0) + 1);
    const type = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    series.push({
      key,
      creator: list[0]!.creator,
      name: list[0]!.collection!,
      items: list,
      type,
      trackCount: list.reduce((n, i) => n + i.trackCount, 0),
      completedCount: list.reduce((n, i) => n + i.completedCount, 0),
      coverId: list.find((i) => i.coverId)?.coverId ?? null,
      hasVideo: list.some((i) => i.hasVideo),
    });
  }
  return { series, singles };
}

/** "3 of 12 lessons" style progress, or null when nothing is done yet. */
export function progressLabel(done: number, total: number, type: ContentType): string | null {
  if (done <= 0 || total <= 1) return null;
  const m = TYPE_META[type];
  return done >= total ? `All ${total} ${m.parts} done` : `${done} of ${total} ${m.parts}`;
}

/**
 * A title that says which thing it is, out of context. "Part 1" alone could be
 * any series; "Focus Series · Part 1" cannot.
 */
export function itemLabel(i: { title: string; collection: string | null }): string {
  const generic = /^(part|week|day|session|module|lesson|chapter|episode|vol\.?|volume)\s*\d+\b/i;
  return i.collection && generic.test(i.title.trim()) ? `${i.collection} · ${i.title}` : i.title;
}

/** A recording's level, as the AI research found it. */
export const LEVEL_LABEL: Record<ItemLevel, string> = {
  beginner: 'For beginners',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  all: 'For every level',
};

/** A level as a short tag on a card. */
export const LEVEL_SHORT: Record<ItemLevel, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  all: 'All levels',
};

/** Beginner first; unknown between "all levels" and intermediate. */
export const levelRank = (l: ItemLevel | null | undefined): number => (l ? LEVEL_ORDER[l] : 1.5);

/** A series' parts in the order they are meant: numbered first, then by name. */
export function inOrder(items: MeditationSummaryDto[]): MeditationSummaryDto[] {
  return [...items].sort(
    (a, b) =>
      (sequenceNumber(a.title) ?? 9999) - (sequenceNumber(b.title) ?? 9999) ||
      naturalCompare(a.title, b.title),
  );
}

/**
 * A series' level is where it starts: its first part's (a path that opens
 * for beginners is one to begin with), else the one most parts share.
 */
export function seriesLevel(items: MeditationSummaryDto[]): ItemLevel | null {
  const first = inOrder(items).find((i) => i.level)?.level;
  if (first) return first;
  return null;
}

/** Programme (in order) or collection (any order) - an admin's word, else the names'. */
export function seriesStructure(
  series: Pick<Series, 'creator' | 'name' | 'items' | 'type'>,
  overrides?: { creator: string; collection: string; structure: 'programme' | 'pack' }[],
): 'programme' | 'pack' {
  const set = overrides?.find((o) => o.creator === series.creator && o.collection === series.name);
  if (set) return set.structure;
  if (series.type === 'course') return 'programme';
  return looksSequential(series.items.map((i) => i.title)) ? 'programme' : 'pack';
}

/** A number a name leads with to say its place: "1. Opening", "6 - Rest" → 1, 6. */
export function leadingNumber(name: string): number | null {
  const m = /^\s*(\d{1,3})\s*(?:[.):\-–—]\s*|\s+-\s+)/.exec(name);
  return m ? Number(m[1]) : null;
}

/** A name without its ordering prefix, and a nested collection by its own name. */
export function displayName(name: string): string {
  const last = name.split(' / ').pop() ?? name;
  const stripped = last.replace(/^\s*\d{1,3}\s*(?:[.):\-–—]\s*|\s+-\s+)/, '').trim();
  return stripped || last;
}

/** The shelf a nested collection sits on ("Extras / Tips" → "Extras"), or null. */
export const shelfOf = (collection: string | null): string | null =>
  collection && collection.includes(' / ') ? collection.split(' / ')[0]! : null;

/** The way a creator's series are best walked: easier first, then as numbered, then by name. */
export function compareSeries(a: Series, b: Series): number {
  return (
    levelRank(seriesLevel(a.items)) - levelRank(seriesLevel(b.items)) ||
    (leadingNumber(a.name) ?? 999) - (leadingNumber(b.name) ?? 999) ||
    naturalCompare(displayName(a.name), displayName(b.name))
  );
}

/** Single recordings the same way: by level, then as numbered, then by title. */
export function compareItems(a: MeditationSummaryDto, b: MeditationSummaryDto): number {
  return (
    levelRank(a.level) - levelRank(b.level) ||
    (leadingNumber(a.title) ?? 999) - (leadingNumber(b.title) ?? 999) ||
    naturalCompare(displayName(a.title), displayName(b.title))
  );
}

/** Every part of it done. */
export const isFinished = (x: { trackCount: number; completedCount: number }) =>
  x.trackCount > 0 && x.completedCount >= x.trackCount;
