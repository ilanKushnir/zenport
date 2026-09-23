import { describe, expect, it } from 'vitest';
import { STOPS, spectrumAt } from './brand.js';

/**
 * The accent system and the generated cover art both read colours off this
 * sweep; these pin the behaviour they rely on.
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
