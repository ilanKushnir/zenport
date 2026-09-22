import { describe, expect, it } from 'vitest';
import { DROPS, GAP, RING, STOPS, angleToSweep, dropColor, polar, spectrumAt } from './brand.js';

/**
 * Three renderers draw from this geometry — the React logo, the PNG/favicon
 * generator, and the generated cover art. These tests pin the invariants each
 * of them silently relies on, so a tweak to the mark cannot quietly push
 * droplets off an icon canvas or produce an unpaintable colour.
 */

describe('spectrum', () => {
  it('returns the endpoints exactly', () => {
    expect(spectrumAt(0)).toEqual([...STOPS[0]![1]]);
    expect(spectrumAt(1)).toEqual([...STOPS[STOPS.length - 1]![1]]);
  });

  it('clamps out-of-range input instead of extrapolating', () => {
    expect(spectrumAt(-3)).toEqual(spectrumAt(0));
    expect(spectrumAt(9)).toEqual(spectrumAt(1));
  });

  it('only ever yields paintable 8-bit channels', () => {
    for (let t = 0; t <= 1; t += 0.01) {
      for (const channel of spectrumAt(t)) {
        expect(Number.isInteger(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });

  it('is deterministic', () => {
    expect(spectrumAt(0.37)).toEqual(spectrumAt(0.37));
  });
});

describe('sweep mapping', () => {
  it('puts the amber pole at the left and the violet pole at the right', () => {
    expect(angleToSweep(180)).toBeCloseTo(0, 6); // 9 o'clock → amber
    expect(angleToSweep(0)).toBeCloseTo(1, 6); // 3 o'clock → violet
    expect(angleToSweep(360)).toBeCloseTo(1, 6);
  });

  it('travels the same sweep on both halves, so top and bottom match', () => {
    // 90° (bottom) and 270° (top) are equidistant from both poles.
    expect(angleToSweep(90)).toBeCloseTo(angleToSweep(270), 6);
  });

  it('normalises negative angles', () => {
    expect(angleToSweep(-90)).toBeCloseTo(angleToSweep(270), 6);
  });

  it('emits a parseable rgb() string', () => {
    expect(dropColor(180)).toMatch(/^rgb\(\d{1,3} \d{1,3} \d{1,3}\)$/);
  });
});

describe('ring geometry', () => {
  it('places points on the circle around the ring centre', () => {
    const [x, y] = polar(0, RING.r);
    expect(x).toBeCloseTo(RING.cx + RING.r, 6);
    expect(y).toBeCloseTo(RING.cy, 6);
    const [, y90] = polar(90, RING.r);
    expect(y90).toBeCloseTo(RING.cy + RING.r, 6); // SVG y grows downward
  });

  it('keeps the stroke, caps and every droplet inside the 64-unit viewBox', () => {
    const half = RING.width / 2;
    const extremes: [number, number][] = [
      ...DROPS.map(([angle, dist, r]) => {
        const [x, y] = polar(angle, dist);
        return [Math.max(x + r, y + r), Math.min(x - r, y - r)] as [number, number];
      }),
      [RING.cx + RING.r + half, RING.cx - RING.r - half],
    ];
    for (const [max, min] of extremes) {
      expect(max).toBeLessThanOrEqual(64);
      expect(min).toBeGreaterThanOrEqual(0);
    }
  });

  it('leaves a real gap in the stroke', () => {
    expect(GAP.to).toBeGreaterThan(GAP.from);
    expect(GAP.to - GAP.from).toBeGreaterThan(5);
    expect(GAP.to - GAP.from).toBeLessThan(180);
  });

  it('has droplets of varied size, not a mechanical ring of identical dots', () => {
    const radii = new Set(DROPS.map(([, , r]) => r));
    expect(radii.size).toBeGreaterThan(DROPS.length / 3);
    const gaps = DROPS.map(([a]) => a)
      .slice(1)
      .map((a, i) => a - DROPS[i]![0]);
    expect(new Set(gaps).size).toBeGreaterThan(4);
  });
});
