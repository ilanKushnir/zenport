import { describe, expect, it } from 'vitest';
import { hueIndex } from './hooks.ts';

describe('hueIndex', () => {
  it('is deterministic for the same seed', () => {
    expect(hueIndex('Mira Solen/Morning Ritual')).toBe(hueIndex('Mira Solen/Morning Ritual'));
  });

  it('stays within the bucket range', () => {
    for (const seed of ['a', 'Deep Sleep Journey', 'Juniper & Friends (live!)', '日本語', '']) {
      const idx = hueIndex(seed);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(4);
    }
  });

  it('spreads different titles across hues', () => {
    const hues = new Set(
      ['Morning Ritual', 'Body Scan', 'Deep Rest', 'Sound Bath #3', 'Evening Landing'].map((t) =>
        hueIndex(t),
      ),
    );
    expect(hues.size).toBeGreaterThan(1);
  });
});
