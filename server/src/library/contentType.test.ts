import { describe, expect, it } from 'vitest';
import { framingParts, inferContentType, inferTrackRole, scannedRoles } from './contentType.js';

const t = (...names: string[]) =>
  names.map((n) => ({ name: n, ext: n.split('.').at(-1)!.toLowerCase() }));
const guess = (path: string, ...names: string[]) =>
  inferContentType({ breadcrumbs: path.split('/'), tracks: t(...names) }).type;

describe('inferContentType', () => {
  it('reads the nearest telling name first', () => {
    // A course week that holds a meditation is still part of a course.
    expect(
      guess(
        'Mira Solen/Courses/The Long Road/Week 1',
        'Week 1 - Lecture.mp4',
        'Week 1 - Meditation.mp3',
      ),
    ).toBe('course');
    // "Workshop" is not a talk marker; "Meditations" is nearer and wins.
    expect(
      guess('Mira Solen/Meditations/Harbor Workshop Meditations - Vol. 1', 'HW 1 - 1. Morning.mp3'),
    ).toBe('meditation');
    expect(guess('Mira Solen/Livestreams/Evening Gathering.mp4', 'Evening Gathering.mp4')).toBe(
      'talk',
    );
    expect(
      guess('Orin Vale/A Lecture and a Meditation.mp4', 'A Lecture and a Meditation.mp4'),
    ).toBe('talk');
    expect(guess('Juniper & Friends/Sound Bath #3', '1 - opening.opus', '2 - closing.opus')).toBe(
      'soundscape',
    );
  });

  it('falls back to the files when no name says', () => {
    // A season of episodes.
    expect(
      guess(
        'Various/Inner Sight',
        'Inner_Sight_S1E1_Beginnings.mp4',
        'Inner_Sight_S1E2_Listening.mp4',
      ),
    ).toBe('course');
    // Numbered sessions, in Hebrew.
    expect(guess('Tomas Reyes/מסע פנימה', 'מפגש 1 - פתיחה.mp4', 'מפגש 2.mp4', 'מפגש 3.mp4')).toBe(
      'course',
    );
    expect(guess('Tomas Reyes/Evening Talk', 'recording.mp4')).toBe('talk');
    expect(guess('Orin Vale/Open Field', 'OF - 1. Welcome.mp3', 'OF - 2. Body scan.mp3')).toBe(
      'meditation',
    );
    // A meditation with an intro video and audio practice is still a meditation.
    expect(
      guess('Quiet Harbor/Kindness Series 1/Part 1', 'intro.mp4', 'day-1.mp3', 'day-2.mp3'),
    ).toBe('meditation');
  });

  it('numbered audio sessions stay a meditation programme', () => {
    expect(
      guess(
        'Quiet Harbor/Discovery Series/Part 1',
        'Session 1.mp3',
        'Session 2.mp3',
        'Session 3.mp3',
        'Session 4.mp3',
        'Session 5.mp3',
      ),
    ).toBe('meditation');
    // ...unless a name says course.
    expect(guess('Orin Vale/Audio Course/Part 1', 'Lesson 1.mp3', 'Lesson 2.mp3')).toBe('course');
  });

  it('explains itself', () => {
    const g = inferContentType({
      breadcrumbs: ['Mira Solen', 'Courses', 'The Long Road'],
      tracks: t('a.mp4'),
    });
    expect(g.reason).toContain('Courses');
  });
});

describe('inferTrackRole', () => {
  it('reads guided practices inside a course as meditations, teaching as lessons', () => {
    expect(inferTrackRole('Week 1 - Meditation')).toBe('practice');
    expect(inferTrackRole('Week 1 - Meditation Instructions + Meditation')).toBe('practice');
    expect(inferTrackRole('Session 1 Guided Breathwork')).toBe('practice');
    expect(inferTrackRole('מפגש 3 - מדיטציה')).toBe('practice');
    expect(inferTrackRole('Week 1 - Lecture')).toBe('lesson');
    expect(inferTrackRole('Week 2 - Q&A')).toBe('lesson');
    expect(inferTrackRole('A Lecture and Meditation')).toBe('lesson');
    expect(inferTrackRole('Inner Sight S1E2 Chapter 2')).toBe('lesson');
  });
});

describe('the owner’s filing comes first', () => {
  const guess = (p: string, tracks = ['a.mp3']) =>
    inferContentType({
      breadcrumbs: p.split('/'),
      tracks: tracks.map((n) => ({ name: n, ext: n.split('.').pop()! })),
    });

  it('a folder named for a kind wins over words in the recording’s own name', () => {
    expect(guess('Mira Solen/Meditations/Open Heart (Livestream Extract)').type).toBe('meditation');
    expect(guess('Mira Solen/Courses/Week 1', ['Meditation.mp3']).type).toBe('course');
    expect(guess('Mira Solen/2. Courses/Open Heart').type).toBe('course');
    expect(guess('Mira Solen/Livestreams/Evening Gathering.mp4', ['x.mp4']).type).toBe('talk');
  });

  it('a folder that only mentions a kind is still just a name', () => {
    expect(guess('Mira Solen/Talks and Meditations/Rest').type).toBe('talk');
    expect(guess('Mira Solen/Evening Lecture').type).toBe('talk');
  });
});

describe('framingParts: what in a meditation is not a sit', () => {
  const a = (title: string, durationSec = 1300) => ({ title, ext: 'mp3', durationSec });
  const v = (title: string, durationSec = 60) => ({ title, ext: 'mp4', durationSec });
  const set = (...n: number[]) => new Set(n);

  it('an intro video before the sessions', () => {
    expect(framingParts([v('Quiet Series Intro', 53), a('Session 1'), a('Session 2')])).toEqual(
      set(0),
    );
  });

  it('instructions and a welcome by name, audio or video', () => {
    expect(framingParts([a('Welcome', 200), a('Instructions', 400), a('The practice')])).toEqual(
      set(0, 1),
    );
    expect(framingParts([a('Intro to the meditation', 180), a('Meditation')])).toEqual(set(0));
  });

  it('an introduction to a state is an exercise, not an intro', () => {
    expect(
      framingParts([a('Wave #1 - Orientation'), a('Wave #2 - Introduction to Focus 10')]),
    ).toEqual(set());
    expect(framingParts([a('Introduction to the series', 300), a('Day 1')])).toEqual(set(0));
  });

  it('a part that says it holds the meditation too is a sit', () => {
    expect(framingParts([a('Instructions and guided meditation'), a('Guided meditation')])).toEqual(
      set(),
    );
    expect(framingParts([v('Introduction & breathwork', 900), a('Session 2')])).toEqual(set());
  });

  it('a short video among audio sits, whatever its name', () => {
    expect(framingParts([v('Opening', 240), a('Part 1'), a('Part 2')])).toEqual(set(0));
  });

  it('short videos through a pack of audio sits', () => {
    expect(
      framingParts([v('Day 1.1', 86), v('Day 1.2', 92), a('Day 1'), a('Day 2'), a('Day 3')]),
    ).toEqual(set(0, 1));
  });

  it('a long video is a video meditation, not an intro', () => {
    expect(framingParts([v('Opening', 1800), a('Part 1'), a('Part 2')])).toEqual(set());
  });

  it('a set of videos is not "a video among audio"', () => {
    expect(framingParts([v('One', 120), v('Two', 120), a('Part 1')])).toEqual(set());
  });

  it('never a single part, and never all of them', () => {
    expect(framingParts([v('Intro', 60)])).toEqual(set());
    expect(framingParts([a('Intro'), a('Instructions')])).toEqual(set());
  });
});

describe('scannedRoles', () => {
  const t = (title: string, inferredRole: string, ext = 'mp3', durationSec = 1300) => ({
    title,
    ext,
    durationSec,
    inferredRole,
  });

  it('a meditation: every part a sit but its intro', () => {
    expect(
      scannedRoles('meditation', [t('Intro', 'lesson', 'mp4', 50), t('Session 1', 'lesson')]),
    ).toEqual(['lesson', 'practice']);
  });

  it('a course: the guess by name made at scan time', () => {
    expect(scannedRoles('course', [t('Lecture', 'lesson'), t('Meditation', 'practice')])).toEqual([
      'lesson',
      'practice',
    ]);
  });
});
