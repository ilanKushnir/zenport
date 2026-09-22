import { describe, expect, it } from 'vitest';
import { computeStats, dayKey, type SessionForStats } from './compute.js';

const s = (
  startedAt: string,
  listenedSec: number,
  over: Partial<SessionForStats> = {},
): SessionForStats => ({
  startedAt,
  listenedSec,
  status: 'completed',
  itemId: 'm1',
  creator: 'Mira Solen',
  title: 'Morning Ritual',
  ...over,
});

const NOW = new Date('2026-09-22T12:00:00Z');

describe('dayKey', () => {
  it('buckets timestamps by the configured timezone, not UTC', () => {
    // 02:00 UTC on Jan 2 is still Jan 1 in New York (UTC-5).
    expect(dayKey('2026-01-02T02:00:00Z', 'America/New_York')).toBe('2026-01-01');
    expect(dayKey('2026-01-02T02:00:00Z', 'UTC')).toBe('2026-01-02');
  });
});

describe('computeStats', () => {
  it('returns honest zeros for no sessions — never invented numbers', () => {
    const stats = computeStats([], 'UTC', NOW);
    expect(stats.totalMinutes).toBe(0);
    expect(stats.totalSessions).toBe(0);
    expect(stats.currentStreak).toBe(0);
    expect(stats.longestStreak).toBe(0);
    expect(stats.creatorMix).toEqual([]);
  });

  it('sums minutes and counts qualifying sessions', () => {
    const stats = computeStats(
      [s('2026-09-22T06:00:00Z', 600), s('2026-09-21T06:00:00Z', 1200)],
      'UTC',
      NOW,
    );
    expect(stats.totalMinutes).toBe(30);
    expect(stats.totalSessions).toBe(2);
    expect(stats.completedSessions).toBe(2);
  });

  it('does not count sub-minute abandoned touches as sessions', () => {
    const stats = computeStats(
      [s('2026-09-22T06:00:00Z', 30, { status: 'abandoned' })],
      'UTC',
      NOW,
    );
    expect(stats.totalSessions).toBe(0);
    expect(stats.currentStreak).toBe(0);
  });

  it('computes streaks over consecutive local days', () => {
    const stats = computeStats(
      [
        s('2026-09-22T06:00:00Z', 600),
        s('2026-09-21T06:00:00Z', 600),
        s('2026-09-20T06:00:00Z', 600),
        // gap on the 19th
        s('2026-09-18T06:00:00Z', 600),
        s('2026-09-17T06:00:00Z', 600),
        s('2026-09-16T06:00:00Z', 600),
        s('2026-09-15T06:00:00Z', 600),
      ],
      'UTC',
      NOW,
    );
    expect(stats.currentStreak).toBe(3);
    expect(stats.longestStreak).toBe(4);
  });

  it('keeps the current streak alive when today has no practice yet', () => {
    const stats = computeStats(
      [s('2026-09-21T06:00:00Z', 600), s('2026-09-20T06:00:00Z', 600)],
      'UTC',
      NOW,
    );
    expect(stats.currentStreak).toBe(2);
  });

  it('uses the configured timezone for streak day boundaries', () => {
    // 04:00 UTC = 23:00 previous day in New York: both sessions land on
    // consecutive NY days even though UTC sees a same-day pair with a gap.
    const stats = computeStats(
      [s('2026-09-22T04:00:00Z', 600), s('2026-09-21T04:00:00Z', 600)],
      'America/New_York',
      NOW,
    );
    expect(stats.currentStreak).toBe(2);
    expect(stats.dayBoundaryRule).toContain('midnight');
  });

  it('compares only against the user’s own previous period', () => {
    const stats = computeStats(
      [s('2026-09-20T06:00:00Z', 600), s('2026-08-01T06:00:00Z', 1200)],
      'UTC',
      NOW,
    );
    expect(stats.comparison.current.minutes).toBe(10);
    expect(stats.comparison.previous.minutes).toBe(20);
  });

  it('aggregates creator and meditation mixes by minutes', () => {
    const stats = computeStats(
      [
        s('2026-09-20T06:00:00Z', 600),
        s('2026-09-19T06:00:00Z', 600, { creator: 'Orin Vale', title: 'Body Scan', itemId: 'm2' }),
        s('2026-09-18T06:00:00Z', 1200),
      ],
      'UTC',
      NOW,
    );
    expect(stats.creatorMix[0]).toMatchObject({ name: 'Mira Solen', minutes: 30 });
    expect(stats.creatorMix[1]).toMatchObject({ name: 'Orin Vale', minutes: 10 });
    expect(stats.meditationMix[0]?.name).toBe('Morning Ritual');
  });

  it('produces 7 daily and 12 weekly trend buckets', () => {
    const stats = computeStats([s('2026-09-22T06:00:00Z', 600)], 'UTC', NOW);
    expect(stats.weekTrend).toHaveLength(7);
    expect(stats.weekTrend.at(-1)?.minutes).toBe(10);
    expect(stats.monthTrend).toHaveLength(12);
  });
});
