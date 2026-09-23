import type { MixSlice, PracticeStatus, StatsDto, TrendBucket } from '@zenport/shared';

export interface SessionForStats {
  startedAt: string;
  listenedSec: number;
  status: PracticeStatus;
  itemId: string;
  creator: string;
  title: string;
}

const DAY_MS = 86_400_000;
const DAY_BOUNDARY_RULE =
  'Days begin at midnight in your configured timezone; a session counts toward a day when at least one minute was practiced or the session completed.';

const keyFormatters = new Map<string, Intl.DateTimeFormat>();

/** YYYY-MM-DD of a timestamp in the given IANA timezone. */
export function dayKey(iso: string, timezone: string): string {
  let fmt = keyFormatters.get(timezone);
  if (!fmt) {
    // en-CA formats as YYYY-MM-DD.
    fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    keyFormatters.set(timezone, fmt);
  }
  return fmt.format(new Date(iso));
}

function addDays(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Does this session count as a real practice (for counts and streaks)? */
const qualifies = (s: SessionForStats) => s.status === 'completed' || s.listenedSec >= 60;

/**
 * All statistics derive from durable session records — nothing is seeded or
 * invented. Empty in, zeros out.
 */
export function computeStats(
  sessions: SessionForStats[],
  timezone: string,
  now: Date,
): Omit<StatsDto, 'learning'> {
  const today = dayKey(now.toISOString(), timezone);

  const qualifying = sessions.filter(qualifies);
  const totalMinutes = Math.round(sessions.reduce((sum, s) => sum + s.listenedSec, 0) / 60);
  const completedSessions = qualifying.filter((s) => s.status === 'completed').length;

  // Minutes per local day (qualifying sessions only, for streaks).
  const minutesByDay = new Map<string, { minutes: number; sessions: number }>();
  for (const s of qualifying) {
    const key = dayKey(s.startedAt, timezone);
    const cur = minutesByDay.get(key) ?? { minutes: 0, sessions: 0 };
    cur.minutes += s.listenedSec / 60;
    cur.sessions += 1;
    minutesByDay.set(key, cur);
  }

  // Streaks: walk practiced days. Current streak may end today or yesterday
  // (an unfinished today does not break it).
  const practicedDays = [...minutesByDay.keys()].sort();
  let longestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  const runEndingAt = new Map<string, number>();
  for (const day of practicedDays) {
    run = prev !== null && addDays(prev, 1) === day ? run + 1 : 1;
    runEndingAt.set(day, run);
    if (run > longestStreak) longestStreak = run;
    prev = day;
  }
  const currentStreak = runEndingAt.get(today) ?? runEndingAt.get(addDays(today, -1)) ?? 0;

  // Trends: last 7 days (daily) and last 12 weeks (weekly, Monday starts).
  const weekTrend: TrendBucket[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const bucket = minutesByDay.get(d);
    weekTrend.push({
      bucket: d,
      minutes: Math.round(bucket?.minutes ?? 0),
      sessions: bucket?.sessions ?? 0,
    });
  }
  const weekStart = (date: string) => {
    const dowNum = new Date(`${date}T00:00:00Z`).getUTCDay();
    return addDays(date, -((dowNum + 6) % 7)); // back to Monday
  };
  const monthTrend: TrendBucket[] = [];
  const thisWeek = weekStart(today);
  const byWeek = new Map<string, { minutes: number; sessions: number }>();
  for (const [day, v] of minutesByDay) {
    const wk = weekStart(day);
    const cur = byWeek.get(wk) ?? { minutes: 0, sessions: 0 };
    cur.minutes += v.minutes;
    cur.sessions += v.sessions;
    byWeek.set(wk, cur);
  }
  for (let i = 11; i >= 0; i--) {
    const wk = addDays(thisWeek, -7 * i);
    const v = byWeek.get(wk);
    monthTrend.push({
      bucket: wk,
      minutes: Math.round(v?.minutes ?? 0),
      sessions: v?.sessions ?? 0,
    });
  }

  // Own-previous-period comparison: last 30 local days vs the 30 before.
  const periodDays = 30;
  const currentStart = addDays(today, -(periodDays - 1));
  const previousStart = addDays(currentStart, -periodDays);
  const cmp = { current: { minutes: 0, sessions: 0 }, previous: { minutes: 0, sessions: 0 } };
  for (const s of qualifying) {
    const key = dayKey(s.startedAt, timezone);
    if (key >= currentStart && key <= today) {
      cmp.current.minutes += s.listenedSec / 60;
      cmp.current.sessions += 1;
    } else if (key >= previousStart && key < currentStart) {
      cmp.previous.minutes += s.listenedSec / 60;
      cmp.previous.sessions += 1;
    }
  }

  const mix = (keyOf: (s: SessionForStats) => string): MixSlice[] => {
    const acc = new Map<string, { minutes: number; sessions: number }>();
    for (const s of qualifying) {
      const k = keyOf(s);
      const cur = acc.get(k) ?? { minutes: 0, sessions: 0 };
      cur.minutes += s.listenedSec / 60;
      cur.sessions += 1;
      acc.set(k, cur);
    }
    return [...acc.entries()]
      .map(([name, v]) => ({ name, minutes: Math.round(v.minutes), sessions: v.sessions }))
      .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name))
      .slice(0, 8);
  };

  return {
    timezone,
    totalMinutes,
    totalSessions: qualifying.length,
    completedSessions,
    currentStreak,
    longestStreak,
    dayBoundaryRule: DAY_BOUNDARY_RULE,
    weekTrend,
    monthTrend,
    creatorMix: mix((s) => s.creator),
    meditationMix: mix((s) => s.title),
    comparison: {
      periodDays,
      current: {
        minutes: Math.round(cmp.current.minutes),
        sessions: cmp.current.sessions,
      },
      previous: {
        minutes: Math.round(cmp.previous.minutes),
        sessions: cmp.previous.sessions,
      },
    },
  };
}
