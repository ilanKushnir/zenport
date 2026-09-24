import { describe, expect, it } from 'vitest';
import { numberedStem, plainTitle, sharedStem } from './groups.js';

describe('recordings that belong together, by name', () => {
  it('reads a set and its number, past years and versions', () => {
    expect(numberedStem('Calm Harbour - Vol. 3 (2015)')).toEqual({ stem: 'Calm Harbour', n: 3 });
    expect(numberedStem('Open Sky Volume 2 - Updated Version (2021)')).toEqual({
      stem: 'Open Sky',
      n: 2,
    });
    expect(numberedStem('Energy Circles 04 - Unified (2017)')).toEqual({
      stem: 'Energy Circles',
      n: 4,
    });
    expect(numberedStem('Quiet Walk 11 - Body Light (ADV) (2021)')).toEqual({
      stem: 'Quiet Walk',
      n: 11,
    });
  });

  it('does not take a number inside a title for a set', () => {
    expect(numberedStem('Take 10')).toBeNull();
    expect(numberedStem('Evening Light')).toBeNull();
    expect(numberedStem('The 5 Senses of Rest')).toBeNull();
  });

  it('finds the name several share, and leaves years and versions off', () => {
    expect(sharedStem('Open Sky - To Rest (2021)')).toBe('Open Sky');
    expect(plainTitle('Changing Rooms - Short Version (2023)')).toBe('Changing Rooms');
    expect(sharedStem('Evening Light')).toBeNull();
  });
});
