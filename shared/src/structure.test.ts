import { describe, expect, it } from 'vitest';
import {
  looksSequential,
  meantInOrder,
  oneInVersions,
  practiceParts,
  sequenceNumber,
} from './structure.js';

describe('programme or pack', () => {
  it('reads a place in a sequence', () => {
    expect(sequenceNumber('Calm Start Day 7.mp3')).toBe(7);
    expect(sequenceNumber('Wave III - Freedom')).toBe(3);
    expect(sequenceNumber('Part 2')).toBe(2);
    expect(sequenceNumber('6 - Rest')).toBe(6);
    expect(sequenceNumber('audio-2408')).toBe(2408);
    expect(sequenceNumber('On Eating')).toBeNull();
  });
  it('tells a sequence from a set', () => {
    expect(looksSequential(['Day 1', 'Day 2', 'Day 3', 'Intro'])).toBe(true);
    expect(looksSequential(['audio-2408', 'audio-2409', 'audio-2410'])).toBe(true);
    expect(looksSequential(['Wave I', 'Wave II', 'Wave V'])).toBe(true);
    expect(looksSequential(['On Eating', 'On Sleep', 'On Walking'])).toBe(false);
    expect(looksSequential(['Morning', 'Evening'])).toBe(false);
    expect(looksSequential(['Only one'])).toBe(false);
  });

  it('does not count what frames the practice', () => {
    expect(practiceParts(['1. Introduction (4,57)', '2. Meditation (57,26)'])).toEqual([
      '2. Meditation (57,26)',
    ]);
    expect(practiceParts(['Welcome', 'Day 1', 'Day 2'])).toHaveLength(2);
  });
});

describe('one meditation in versions', () => {
  const practice = (names: string[]) => practiceParts(names);

  it('an introduction and the same meditation lying down or walking is one meditation', () => {
    expect(
      oneInVersions(
        practice([
          'SR - 1. Introduction',
          'SR-Lay Down Version - 2. Meditation',
          'SR-Non-Lay Down Version - 3. Meditation',
        ]),
      ),
    ).toBe(true);
  });

  it('a meditation with its live or music version is one meditation', () => {
    expect(oneInVersions(['Meditation', 'Meditation (Live Version)'])).toBe(true);
    expect(oneInVersions(['Meditation', 'Music, Quiet Harbour - Children’s Version'])).toBe(true);
    expect(oneInVersions(['Version 1', 'Version 2 - Retreat Recording'])).toBe(true);
  });

  it('breath, meditation and the two combined are one practice', () => {
    expect(oneInVersions(['Breath', 'Meditation', 'Combined Breath and Meditation'])).toBe(true);
  });

  it('different meditations stay a set', () => {
    expect(oneInVersions(['Morning Meditation', 'Evening Meditation'])).toBe(false);
    expect(oneInVersions(['Day Meditation', 'Night Meditation'])).toBe(false);
    expect(oneInVersions(['Rain Music', 'Ocean Music', 'Forest Music'])).toBe(false);
  });

  it('an explanation frames the practice', () => {
    expect(practiceParts(['Mira explains the practice', 'The Practice'])).toEqual(['The Practice']);
  });
});

describe('meant in order', () => {
  it('a path: days, weeks, sessions, parts, waves', () => {
    expect(meantInOrder(['Calm Start Day 1', 'Calm Start Day 2', 'Calm Start Day 3'])).toBe(true);
    expect(meantInOrder(['Session 1 Part 1', 'Session 2 Part 1'])).toBe(true);
    expect(meantInOrder(['Part 1', 'Part 2', 'Part 3'])).toBe(true);
    expect(meantInOrder(['Wave I - Arrival', 'Wave II - Threshold'])).toBe(true);
    expect(meantInOrder(['Harbour S1E1 Opening', 'Harbour S1E2 Tides'])).toBe(true);
    // Every step counts: day 3 of part 1, not "part 1" three times.
    expect(meantInOrder(['Calm Part 1 Day 1', 'Calm Part 1 Day 2', 'Calm Part 1 Day 3'])).toBe(
      true,
    );
    expect(meantInOrder(['Exploring #1 - Focus', 'Exploring #2 - Intuition'])).toBe(true);
    // Raw files recorded one after another.
    expect(meantInOrder(['audio-2248', 'audio-2249', 'audio-2250'])).toBe(true);
    // A short name and a rising number is a run too: ten minutes, then fifteen, then twenty.
    expect(meantInOrder(['Take 10', 'Take 15', 'Take 20'])).toBe(true);
  });

  it('a catalogue is not a path: volumes, bare numbers, track numbers', () => {
    expect(meantInOrder(['Energy Circles 01 - Unified', 'Energy Circles 02 - Heart'])).toBe(false);
    expect(meantInOrder(['Calm Harbour - Vol. 1', 'Calm Harbour - Vol. 2'])).toBe(false);
    expect(meantInOrder(['CH 1 - 1. Friday Morning', 'CH 1 - 2. Saturday Healing'])).toBe(false);
    expect(meantInOrder(['Morning Meditation', 'Evening Meditation'])).toBe(false);
  });
});
