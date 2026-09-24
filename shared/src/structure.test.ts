import { describe, expect, it } from 'vitest';
import { looksSequential, oneInVersions, practiceParts, sequenceNumber } from './structure.js';

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
