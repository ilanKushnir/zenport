import { describe, expect, it } from 'vitest';
import { looksSequential, practiceParts, sequenceNumber } from './structure.js';

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
