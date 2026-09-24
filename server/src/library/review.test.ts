import { describe, expect, it } from 'vitest';
import { looksRaw, tidyTitles } from './review.js';

describe('raw names', () => {
  it('spots file names that were never tidied', () => {
    expect(looksRaw('Creativity Pack Day 27-video')).toBe(true);
    expect(looksRaw('creativity pack- tip- day 27 640x360-video')).toBe(true);
    expect(looksRaw('audio-2248')).toBe(true);
    expect(looksRaw('Welcome_to_the_course')).toBe(true);
    expect(looksRaw('Discovery Part 1 Day 3')).toBe(false);
    expect(looksRaw('Evening Gathering - A Lecture')).toBe(false);
  });

  it('offers tidier names, numbering bare upload numbers as sessions', () => {
    expect(
      tidyTitles([
        'creativity pack- tip- day 27 640x360-video',
        'Creativity Pack Day 27-video',
        'audio-2248',
        'audio-2249',
        'Already fine',
      ]),
    ).toEqual([
      'Creativity pack - tip - day 27',
      'Creativity Pack Day 27',
      'Session 1',
      'Session 2',
      null,
    ]);
  });
});
