import { describe, expect, it } from 'vitest';
import { inferContentType } from './contentType.js';

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

  it('explains itself', () => {
    const g = inferContentType({
      breadcrumbs: ['Mira Solen', 'Courses', 'The Long Road'],
      tracks: t('a.mp4'),
    });
    expect(g.reason).toContain('Courses');
  });
});
