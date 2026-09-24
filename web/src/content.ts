/**
 * The four kinds of thing in a library, as the interface names them.
 * One place, so a course is called a course - with the same icon and the same
 * one-line explanation - on every screen.
 */
import type { ContentType, ItemLevel, MeditationSummaryDto } from '@zenport/shared';
import { CONTENT_TYPES } from '@zenport/shared';

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
