import { describe, expect, it } from 'vitest';
import { naturalCompare, naturalSort, titleFromStem } from './natural-sort.js';

describe('naturalCompare', () => {
  it('orders plain numbers numerically, not lexically', () => {
    expect(['10', '2', '1'].sort(naturalCompare)).toEqual(['1', '2', '10']);
  });

  it('orders numbered filenames numerically', () => {
    const input = ['track 10.mp3', 'track 2.mp3', 'track 1.mp3'];
    expect(input.sort(naturalCompare)).toEqual(['track 1.mp3', 'track 2.mp3', 'track 10.mp3']);
  });

  it('handles zero-padded numbers as equal magnitude', () => {
    expect(['02 intro', '1 opening', '10 close'].sort(naturalCompare)).toEqual([
      '1 opening',
      '02 intro',
      '10 close',
    ]);
  });

  it('is case-insensitive for letters', () => {
    expect(['Beta', 'alpha', 'Gamma'].sort(naturalCompare)).toEqual(['alpha', 'Beta', 'Gamma']);
  });

  it('sorts mixed numeric/alpha segments deterministically', () => {
    expect(['part2b', 'part10a', 'part2a'].sort(naturalCompare)).toEqual([
      'part2a',
      'part2b',
      'part10a',
    ]);
  });

  it('is deterministic for equal-looking values (total order)', () => {
    // "01" and "1" compare equal numerically; the raw string breaks the tie.
    const a = ['1 a', '01 a'];
    const b = ['01 a', '1 a'];
    expect(a.sort(naturalCompare)).toEqual(b.sort(naturalCompare));
  });
});

describe('naturalSort', () => {
  it('does not mutate its input', () => {
    const input = ['b', 'a'];
    const out = naturalSort(input);
    expect(input).toEqual(['b', 'a']);
    expect(out).toEqual(['a', 'b']);
  });
});

describe('titleFromStem', () => {
  it('strips leading track numbers and separators', () => {
    expect(titleFromStem('01 - Morning Breath')).toBe('Morning Breath');
    expect(titleFromStem('2. Body Scan')).toBe('Body Scan');
    expect(titleFromStem('10_Evening Rest')).toBe('Evening Rest');
  });

  it('replaces underscores with spaces and trims', () => {
    expect(titleFromStem('deep_rest_session')).toBe('deep rest session');
  });

  it('keeps a purely numeric stem as-is', () => {
    expect(titleFromStem('03')).toBe('03');
  });

  it('leaves ordinary titles untouched', () => {
    expect(titleFromStem('Loving Kindness')).toBe('Loving Kindness');
  });
});
