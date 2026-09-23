import { describe, expect, it } from 'vitest';
import { CHANGELOG, LATEST_RELEASE_VERSION, shouldAnnounce } from './changelog.ts';

describe('changelog', () => {
  it('is newest first and every release has notes', () => {
    for (const r of CHANGELOG) {
      expect(r.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(r.items.length).toBeGreaterThan(0);
      for (const item of r.items) expect(item.text.trim()).not.toBe('');
    }
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(shouldAnnounce(CHANGELOG[i]!.version), `${CHANGELOG[i]!.version} < top`).toBe(true);
    }
  });

  it('leads with the package version, so a release cannot ship without its notes', () => {
    // __ZP_VERSION__ is injected from the root package.json by vite.config.ts,
    // for the build and for vitest alike.
    expect(LATEST_RELEASE_VERSION).toBe(__ZP_VERSION__);
  });
});

describe('shouldAnnounce', () => {
  it('stays quiet until preferences have loaded', () => {
    expect(shouldAnnounce(undefined)).toBe(false);
  });
  it('tells an account that predates the feature', () => {
    expect(shouldAnnounce(null)).toBe(true);
  });
  it('tells an account that last saw an older release, and nobody else', () => {
    expect(shouldAnnounce('0.0.1')).toBe(true);
    expect(shouldAnnounce(LATEST_RELEASE_VERSION)).toBe(false);
    expect(shouldAnnounce('99.0.0')).toBe(false);
  });
});
