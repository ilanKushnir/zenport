import { describe, expect, it } from 'vitest';
import type { MeditationSummaryDto } from '@zenport/shared';
import { compareSeries, displayName, groupSeries, leadingNumber } from './content.ts';

const item = (collection: string, title: string, level: MeditationSummaryDto['level'] = null) =>
  ({
    id: `${collection}/${title}`,
    title,
    creator: 'Quiet Harbor',
    collection,
    type: 'meditation',
    trackCount: 10,
    completedCount: 0,
    level,
  }) as unknown as MeditationSummaryDto;

describe('walking a creator’s series', () => {
  it('reads order numbers and drops them from names', () => {
    expect(leadingNumber('1. Take Series')).toBe(1);
    expect(leadingNumber('6 - Rest')).toBe(6);
    expect(leadingNumber('Heart Series 2')).toBeNull();
    expect(displayName('1. Opening Series')).toBe('Opening Series');
    expect(displayName('6 - Rest')).toBe('Rest');
    expect(displayName('Extras / 2) Tips')).toBe('Tips');
  });
  it('puts easier first, then numbered, then 1 before 2', () => {
    const { series } = groupSeries([
      item('Heart Series 2', 'Part 1', 'intermediate'),
      item('Heart Series 2', 'Part 2', 'intermediate'),
      item('Heart Series 1', 'Part 1', 'intermediate'),
      item('Heart Series 1', 'Part 2', 'intermediate'),
      item('Deep Series', 'Part 1', 'advanced'),
      item('Deep Series', 'Part 2', 'advanced'),
      item('1. Opening Series', 'Part 1', 'beginner'),
      item('1. Opening Series', 'Part 2', 'beginner'),
      item('Basics Series', 'Part 1', 'beginner'),
      item('Basics Series', 'Part 2', 'beginner'),
    ]);
    expect(series.sort(compareSeries).map((s) => s.name)).toEqual([
      '1. Opening Series',
      'Basics Series',
      'Heart Series 1',
      'Heart Series 2',
      'Deep Series',
    ]);
  });
});
