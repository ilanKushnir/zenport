/**
 * What an item is for: meditation, course, talk or soundscape.
 *
 * A spiritual library mixes practice with teaching, and people file both the
 * same way, so this reads two kinds of evidence in order:
 *
 * 1. The owner's filing. A folder above the item whose whole name is a kind
 *    - "Courses", "Meditations", "Livestreams", "2. Talks" - is where they
 *    put it, and that wins: "Meditations/Love Heals (Livestream Extract)" is
 *    a meditation, "Courses/Week 1/Meditation.mp3" a course. The nearest
 *    such folder decides.
 * 2. Names. Walking from the item itself up through its parents, the nearest
 *    folder (or file) whose name says what it is wins: "Lecture",
 *    "Masterclass", "Sound bath", "Guided".
 * 3. The files. A run of episode-numbered videos is a course; one or two
 *    videos are a talk; audio is a meditation (numbered or not).
 *
 * It is a guess, and says so: the owner can correct any item, and a manual
 * choice is stored apart from this so a rescan never undoes it.
 */
import type { ContentType } from '@zenport/shared';
import { isVideoExt } from '@zenport/shared';

export interface TypeEvidence {
  /** Path segments from the root down to the item (a file item includes its file name). */
  breadcrumbs: string[];
  tracks: { name: string; ext: string }[];
}

export interface TypeGuess {
  type: ContentType;
  reason: string;
}

// Word-ish boundaries that also work next to Hebrew and punctuation.
const w = (words: string) => new RegExp(`(^|[^\\p{L}])(${words})($|[^\\p{L}])`, 'iu');
// A name that is only the kind: "Courses", "Meditations", "02 - Livestreams".
const only = (words: string) =>
  new RegExp(`^\\s*(?:\\d{1,3}\\s*[.)\\-–—]?\\s*)?(?:${words})\\s*$`, 'iu');

const KIND_WORDS: [ContentType, string][] = [
  [
    'course',
    'courses?|class(es)?|masterclass(es)?|curriculum|lessons?|modules?|training|academy|קורס(ים)?|שיעור(ים)?',
  ],
  [
    'talk',
    'live ?streams?|webinars?|talks?|lectures?|interviews?|podcasts?|keynotes?|q ?& ?a|q and a|documentar(y|ies)|הרצא(ה|ות)|ראיון',
  ],
  [
    'soundscape',
    'sound ?baths?|soundscapes?|music|ambient|binaural|nature sounds|sleep sounds|white noise|מוזיקה',
  ],
  ['meditation', 'meditations?|guided|practices?|מדיטצי(ה|ות)'],
];

const NAME_RULES: [ContentType, RegExp][] = KIND_WORDS.map(([t, words]) => [t, w(words)]);
const CATEGORY: [ContentType, RegExp][] = KIND_WORDS.map(([t, words]) => [t, only(words)]);

// Episode-style numbering: "S1E3", "Episode 4", "Session 2", "Part 3", "מפגש 1".
const EPISODE = w(
  's\\d+\\s*e\\d+|episode\\s*\\d+|ep\\.?\\s*\\d+|session\\s*\\d+|part\\s*\\d+|chapter\\s*\\d+|מפגש\\s*\\d+|פרק\\s*\\d+',
);

const stem = (name: string) => name.replace(/\.[a-z0-9]{1,5}$/i, '');

export function inferContentType(ev: TypeEvidence): TypeGuess {
  const levels = [...ev.breadcrumbs].reverse().map(stem);
  // 1. A folder above it named for a kind, nearest first.
  for (const [i, name] of levels.entries()) {
    if (i === 0) continue;
    for (const [type, rx] of CATEGORY) {
      if (rx.test(name)) return { type, reason: `filed under "${name}"` };
    }
  }

  // 2. Names, nearest first.
  for (const [i, name] of levels.entries()) {
    for (const [type, rx] of NAME_RULES) {
      if (rx.test(name)) {
        return { type, reason: `"${name}"${i === 0 ? '' : ' above it'} reads as a ${type}` };
      }
    }
  }

  // 3. The files.
  const videos = ev.tracks.filter((t) => isVideoExt(t.ext));
  const episodic = ev.tracks.filter((t) => EPISODE.test(stem(t.name))).length;
  if (videos.length > 0 && videos.length >= ev.tracks.length / 2) {
    if (videos.length >= 3 || episodic >= 2) {
      return { type: 'course', reason: `${videos.length} videos in a numbered run` };
    }
    return { type: 'talk', reason: videos.length === 1 ? 'a single video' : 'a pair of videos' };
  }
  // Numbered audio alone is not a course: in a meditation library it is far
  // more often a programme of sessions ("Part 1 … Part 10"). A course that is
  // audio only says so in a name, and rule 1 already caught it.
  return { type: 'meditation', reason: 'audio practice' };
}

export type TrackRole = 'lesson' | 'practice';

const PRACTICE_WORDS =
  /(^|[^\p{L}])(meditations?|meditate|guided|practices?|breath(ing|work)?|body ?scan|visuali[sz]ation|relaxation|yoga nidra|sitting)($|[^\p{L}])|מדיטצי(ה|ות)|תרגול/iu;
const TEACHING_WORDS =
  /(^|[^\p{L}])(lecture|lesson|q ?& ?a|q and a|interview|talk|webinar|livestream|keynote|discussion)($|[^\p{L}])|הרצא(ה|ות)/iu;

/**
 * Inside a course or talk, is this track a lesson or a meditation to do? A
 * name that says meditation, guided, breathwork… is a practice - unless it
 * also says lecture or Q&A, which is teaching about practice. The owner can
 * flip any track; the item stays a course either way.
 */
export function inferTrackRole(title: string): TrackRole {
  return PRACTICE_WORDS.test(title) && !TEACHING_WORDS.test(title) ? 'practice' : 'lesson';
}
