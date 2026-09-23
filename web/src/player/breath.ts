/**
 * Breath-guide pacing for the unguided timer.
 *
 * Kept apart from the timer component so the cycle maths can be tested
 * directly: the phase boundaries and the orb's scale are the two things a
 * person actually follows with their body, and an off-by-one at a boundary is
 * the kind of bug you feel rather than see.
 */

/** Seconds per stage. A common calming ratio — longer out-breath than in. */
export const BREATH = { in: 4, hold: 1, out: 6 } as const;

export const BREATH_CYCLE = BREATH.in + BREATH.hold + BREATH.out;

export type BreathPhase = 'in' | 'hold' | 'out';

/** Which stage of the cycle a given elapsed time falls in. */
export function breathPhaseAt(elapsedSec: number): BreathPhase {
  const t = ((elapsedSec % BREATH_CYCLE) + BREATH_CYCLE) % BREATH_CYCLE;
  if (t < BREATH.in) return 'in';
  if (t < BREATH.in + BREATH.hold) return 'hold';
  return 'out';
}

export const BREATH_LABEL: Record<BreathPhase, string> = {
  in: 'Breathe in',
  hold: 'Hold',
  out: 'Breathe out',
};

/** Smallest and largest scale the orb reaches. */
export const BREATH_MIN_SCALE = 0.58;
const RANGE = 1 - BREATH_MIN_SCALE;

/**
 * Orb scale across the cycle: grows through the in-breath, holds at full,
 * shrinks through the out-breath, and returns to exactly the starting scale so
 * consecutive cycles do not jump.
 */
export function breathScaleAt(elapsedSec: number): number {
  const t = ((elapsedSec % BREATH_CYCLE) + BREATH_CYCLE) % BREATH_CYCLE;
  if (t < BREATH.in) return BREATH_MIN_SCALE + RANGE * (t / BREATH.in);
  if (t < BREATH.in + BREATH.hold) return 1;
  const k = (t - BREATH.in - BREATH.hold) / BREATH.out;
  return 1 - RANGE * k;
}

/** m:ss for the countdown. Negative input clamps to zero rather than showing "-0:01". */
export function formatClock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
