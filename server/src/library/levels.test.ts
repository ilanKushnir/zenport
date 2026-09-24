import { describe, expect, it } from 'vitest';
import { levelFromName } from './levels.js';

describe('a level read from a name', () => {
  it('finds what libraries write outright', () => {
    expect(levelFromName('River Practice (ADV)')).toBe('advanced');
    expect(levelFromName('Lying Down (LDM-ADV) (2019)')).toBe('advanced');
    expect(levelFromName('Advanced Workshop Sits - Vol. 1')).toBe('advanced');
    expect(levelFromName('Breath Basics')).toBe('beginner');
    expect(levelFromName('Part 1', 'Meditation for Beginners')).toBe('beginner');
    expect(levelFromName("Beginner's Stories")).toBe('beginner');
    expect(levelFromName('Level 2 - Opening')).toBe('intermediate');
    expect(levelFromName('Quiet for all levels')).toBe('all');
  });
  it('says nothing when the name does not', () => {
    expect(levelFromName('Heart Series 2', 'Part 3')).toBeNull();
    expect(levelFromName('Advantage of Stillness')).toBeNull();
    expect(levelFromName('Foundational Breath? no', null)).toBeNull();
  });
});
