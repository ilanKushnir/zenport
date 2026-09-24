import { describe, expect, it } from 'vitest';
import { naturalCompare } from '@zenport/shared';
import { orderTracks } from './trackOrder.js';

const files = (...names: string[]) =>
  names
    .map((name) => ({ name, ext: name.split('.').at(-1)!.toLowerCase() }))
    .sort((a, b) => naturalCompare(a.name, b.name));
const order = (...names: string[]) => orderTracks(files(...names)).tracks.map((t) => t.name);

describe('orderTracks', () => {
  it('puts an unnumbered intro video before the numbered days of a series', () => {
    const days = Array.from({ length: 10 }, (_, i) => `Discovery Part 1 Day ${i + 1}.mp3`);
    const got = order(...days, 'Discovery Series Intro-video.mp4');
    expect(got[0]).toBe('Discovery Series Intro-video.mp4');
    expect(got.slice(1)).toEqual(days);
  });

  it('treats a number every part shares as no sequence at all', () => {
    expect(order('Part 1 Day 1.mp3', 'Part 1 Day 2.mp3', 'Part 1 Introduction.mp3')).toEqual([
      'Part 1 Introduction.mp3',
      'Part 1 Day 1.mp3',
      'Part 1 Day 2.mp3',
    ]);
  });

  it('keeps a numbered explanation video in the middle where its number puts it', () => {
    expect(
      order('01 Breath.mp3', '02 Body.mp3', '03 Intro to week two.mp4', '04 Heart.mp3'),
    ).toEqual(['01 Breath.mp3', '02 Body.mp3', '03 Intro to week two.mp4', '04 Heart.mp3']);
  });

  it('brings a welcome forward and sends closings and bonuses to the end', () => {
    expect(
      order(
        'Bonus - questions.mp3',
        'Lesson 1.mp3',
        'Lesson 2.mp3',
        'Welcome.mp3',
        'Closing words.mp3',
      ),
    ).toEqual([
      'Welcome.mp3',
      'Lesson 1.mp3',
      'Lesson 2.mp3',
      'Bonus - questions.mp3',
      'Closing words.mp3',
    ]);
  });

  it('leaves a plain numbered set and an all-video course alone', () => {
    expect(order('Day 2.mp3', 'Day 10.mp3', 'Day 1.mp3')).toEqual([
      'Day 1.mp3',
      'Day 2.mp3',
      'Day 10.mp3',
    ]);
    const course = ['Chapter 1.mp4', 'Chapter 2.mp4', 'Summary.mp4'];
    expect(order(...course)).toEqual(course);
    expect(orderTracks(files(...course)).moved).toBe(0);
  });

  it('orders named talks with the introduction first', () => {
    expect(order('Letting go.mp4', 'Introduction.mp4', 'Kindness.mp4')).toEqual([
      'Introduction.mp4',
      'Kindness.mp4',
      'Letting go.mp4',
    ]);
  });

  it('leads with an intro whose name carries the series number, among upload-numbered files', () => {
    const parts = Array.from({ length: 10 }, (_, i) => `audio-${2338 + i}.mp3`);
    const got = order(...parts, 'Heart Series 2 Intro-video.mp4');
    expect(got[0]).toBe('Heart Series 2 Intro-video.mp4');
    expect(got.slice(1)).toEqual(parts);
  });

  it('still reads an episode number inside a season', () => {
    expect(
      order('Season 1 Episode 2.mp4', 'Season 1 Episode 1.mp4', 'Season 1 Trailer.mp4'),
    ).toEqual(['Season 1 Trailer.mp4', 'Season 1 Episode 1.mp4', 'Season 1 Episode 2.mp4']);
  });

  it('reads #4, "2." and S01E12 numbering as a sequence and leaves those parts where they are', () => {
    const wave = [
      'Exploring #1 - Advanced.flac',
      'Exploring #2 - Patterning.flac',
      'Exploring #4 - Introduction to Focus 15.flac',
    ];
    expect(order(...wave)).toEqual(wave);
    const box = ['IM - 0. Bonus Material.mp3', 'IM - 1. Our Mission.mp3', 'IM - 2. Beyond.mp3'];
    expect(order(...box)).toEqual(box);
    const course = [
      'S01E1 - What is change.mp4',
      'S01E2 - Intro to practice.mp4',
      'S01E3 - Final words.mp4',
    ];
    expect(order(...course)).toEqual(course);
  });
});
