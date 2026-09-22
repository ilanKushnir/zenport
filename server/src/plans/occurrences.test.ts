import { describe, expect, it } from 'vitest';
import { expandOccurrences, type PlanForExpansion, type PlanEntryRow } from './occurrences.js';

const basePlan: PlanForExpansion = {
  id: 1,
  name: 'Morning sits',
  status: 'active',
  startDate: '2026-09-14',
  endDate: null,
  daysOfWeek: [],
  meditationIds: ['m1'],
};

const expand = (
  plan: Partial<PlanForExpansion>,
  entries: PlanEntryRow[] = [],
  today = '2026-09-22',
  horizon = 7,
) => expandOccurrences({ ...basePlan, ...plan }, entries, today, horizon);

describe('expandOccurrences', () => {
  it('expands a daily plan from start through the horizon', () => {
    const occ = expand({});
    expect(occ[0]?.date).toBe('2026-09-14');
    expect(occ.at(-1)?.date).toBe('2026-09-29'); // today + 7
    expect(occ).toHaveLength(16);
  });

  it('respects days-of-week cadence', () => {
    // Mondays (1) and Thursdays (4) only. 2026-09-14 is a Monday.
    const occ = expand({ daysOfWeek: [1, 4] });
    expect(occ.map((o) => o.date)).toEqual([
      '2026-09-14',
      '2026-09-17',
      '2026-09-21',
      '2026-09-24',
      '2026-09-28',
    ]);
  });

  it('statuses: past unmarked is missed, today is today, future is upcoming', () => {
    const occ = expand({});
    expect(occ.find((o) => o.date === '2026-09-15')?.status).toBe('missed');
    expect(occ.find((o) => o.date === '2026-09-22')?.status).toBe('today');
    expect(occ.find((o) => o.date === '2026-09-25')?.status).toBe('upcoming');
  });

  it('reflects completed and skipped entries', () => {
    const occ = expand({}, [
      { date: '2026-09-15', status: 'completed', movedTo: null, movedFrom: null, sessionId: 42 },
      { date: '2026-09-16', status: 'skipped', movedTo: null, movedFrom: null, sessionId: null },
    ]);
    const done = occ.find((o) => o.date === '2026-09-15');
    expect(done?.status).toBe('completed');
    expect(done?.completedSessionId).toBe(42);
    expect(occ.find((o) => o.date === '2026-09-16')?.status).toBe('skipped');
  });

  it('rescheduling moves an occurrence without duplicating it', () => {
    const occ = expand({ daysOfWeek: [1] }, [
      { date: '2026-09-21', status: null, movedTo: '2026-09-23', movedFrom: null, sessionId: null },
      { date: '2026-09-23', status: null, movedTo: null, movedFrom: '2026-09-21', sessionId: null },
    ]);
    expect(occ.find((o) => o.date === '2026-09-21')?.movedTo).toBe('2026-09-23');
    const moved = occ.find((o) => o.date === '2026-09-23');
    expect(moved?.movedFrom).toBe('2026-09-21');
    expect(moved?.status).toBe('upcoming');
    // The moved-away date no longer counts as missed.
    expect(occ.find((o) => o.date === '2026-09-21')?.status).not.toBe('missed');
  });

  it('honors a finite end date', () => {
    const occ = expand({ endDate: '2026-09-16' });
    expect(occ.at(-1)?.date).toBe('2026-09-16');
  });

  it('a paused plan keeps history but shows no future occurrences', () => {
    const occ = expand({ status: 'paused' }, [
      { date: '2026-09-15', status: 'completed', movedTo: null, movedFrom: null, sessionId: 1 },
    ]);
    expect(occ.find((o) => o.date === '2026-09-15')?.status).toBe('completed');
    expect(occ.some((o) => o.status === 'upcoming' || o.status === 'today')).toBe(false);
  });

  it('an ended plan shows history only', () => {
    const occ = expand({ status: 'ended' });
    expect(occ.every((o) => o.date < '2026-09-22')).toBe(true);
  });
});
