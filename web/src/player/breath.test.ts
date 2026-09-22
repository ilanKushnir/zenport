import { describe, expect, it } from 'vitest';
import {
  BREATH,
  BREATH_CYCLE,
  BREATH_MIN_SCALE,
  breathPhaseAt,
  breathScaleAt,
  formatClock,
} from './breath.ts';

describe('breath phases', () => {
  it('walks in → hold → out across one cycle', () => {
    expect(breathPhaseAt(0)).toBe('in');
    expect(breathPhaseAt(BREATH.in - 0.01)).toBe('in');
    expect(breathPhaseAt(BREATH.in)).toBe('hold');
    expect(breathPhaseAt(BREATH.in + BREATH.hold - 0.01)).toBe('hold');
    expect(breathPhaseAt(BREATH.in + BREATH.hold)).toBe('out');
    expect(breathPhaseAt(BREATH_CYCLE - 0.01)).toBe('out');
  });

  it('repeats every cycle', () => {
    for (const t of [0, 2.5, 4, 5.5, 9]) {
      expect(breathPhaseAt(t)).toBe(breathPhaseAt(t + BREATH_CYCLE * 7));
    }
  });
});

describe('breath scale', () => {
  it('starts at the minimum and reaches full at the top of the in-breath', () => {
    expect(breathScaleAt(0)).toBeCloseTo(BREATH_MIN_SCALE, 5);
    expect(breathScaleAt(BREATH.in)).toBeCloseTo(1, 5);
  });

  it('holds at full through the hold', () => {
    expect(breathScaleAt(BREATH.in + 0.5)).toBe(1);
  });

  it('returns to the starting scale at the end of the cycle, so cycles do not jump', () => {
    // Just before the wrap the scale must already be back at the minimum.
    expect(breathScaleAt(BREATH_CYCLE - 0.001)).toBeCloseTo(BREATH_MIN_SCALE, 3);
    expect(breathScaleAt(BREATH_CYCLE)).toBeCloseTo(breathScaleAt(0), 5);
  });

  it('never leaves the min..1 range', () => {
    for (let t = 0; t < BREATH_CYCLE * 3; t += 0.05) {
      const s = breathScaleAt(t);
      expect(s).toBeGreaterThanOrEqual(BREATH_MIN_SCALE - 1e-9);
      expect(s).toBeLessThanOrEqual(1 + 1e-9);
    }
  });
});

describe('formatClock', () => {
  it('pads seconds', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(60)).toBe('1:00');
    expect(formatClock(599)).toBe('9:59');
    expect(formatClock(3600)).toBe('60:00');
  });

  it('clamps negatives rather than rendering a minus sign', () => {
    expect(formatClock(-4)).toBe('0:00');
  });
});
