import {
  shiftedDate,
  type OccurrenceStatus,
  type PlanOccurrenceDto,
  type PlanShift,
  type PlanStatus,
} from '@zenport/shared';

export interface PlanForExpansion {
  id: number;
  name: string;
  status: PlanStatus;
  startDate: string;
  endDate: string | null;
  daysOfWeek: number[];
  meditationIds: string[];
  /** Pushes, applied in order to the dates the cadence produces. */
  shifts?: PlanShift[];
}

export interface PlanEntryRow {
  date: string;
  status: 'completed' | 'skipped' | null;
  movedTo: string | null;
  movedFrom: string | null;
  sessionId: number | null;
}

const DAY_MS = 86_400_000;

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Date(d.getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function dow(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/**
 * Expand a plan's cadence into dated occurrences, overlaying stored entries
 * (completions, skips, reschedules). Pure and deterministic: history is
 * never rewritten — completed/skipped entries always win over recomputation.
 */
export function expandOccurrences(
  plan: PlanForExpansion,
  entries: PlanEntryRow[],
  today: string,
  horizonDays: number,
): PlanOccurrenceDto[] {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const horizonEnd = addDays(today, horizonDays);
  const end = plan.endDate && plan.endDate < horizonEnd ? plan.endDate : horizonEnd;

  // Pushes only move sessions later, so nothing beyond the horizon comes back into it.
  const shifts = plan.shifts ?? [];
  const dates = new Set<string>();
  for (let d = plan.startDate; d <= end; d = addDays(d, 1)) {
    if (plan.daysOfWeek.length === 0 || plan.daysOfWeek.includes(dow(d))) {
      const at = shiftedDate(d, shifts);
      if (at <= horizonEnd) dates.add(at);
    }
  }
  // Entries can exist off-cadence (reschedule targets, manual completions).
  for (const e of entries) dates.add(e.date);

  const out: PlanOccurrenceDto[] = [];
  for (const date of [...dates].sort()) {
    const entry = byDate.get(date);
    let status: OccurrenceStatus;
    if (entry?.status === 'completed') status = 'completed';
    else if (entry?.status === 'skipped') status = 'skipped';
    else if (entry?.movedTo) {
      // Moved away: keep the marker row so the timeline can explain it, but
      // it is not missed/upcoming on this date.
      out.push({
        planId: plan.id,
        planName: plan.name,
        date,
        status: date <= today ? 'skipped' : 'upcoming',
        meditationIds: plan.meditationIds,
        movedTo: entry.movedTo,
        movedFrom: null,
        completedSessionId: null,
      });
      continue;
    } else if (date < today) status = 'missed';
    else if (date === today) status = 'today';
    else status = 'upcoming';

    // Paused/ended plans keep their history but schedule nothing new.
    if (plan.status !== 'active' && (status === 'today' || status === 'upcoming')) continue;

    out.push({
      planId: plan.id,
      planName: plan.name,
      date,
      status,
      meditationIds: plan.meditationIds,
      movedTo: null,
      movedFrom: entry?.movedFrom ?? null,
      completedSessionId: entry?.sessionId ?? null,
    });
  }
  return out;
}
