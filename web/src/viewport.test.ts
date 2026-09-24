import { afterEach, describe, expect, it, vi } from 'vitest';
import { frameHeight } from './viewport.ts';

afterEach(() => vi.unstubAllGlobals());

describe('frame height', () => {
  it('is what iOS shows - never the screen, which can be taller than the view', () => {
    vi.stubGlobal('window', { innerHeight: 872, innerWidth: 430 });
    vi.stubGlobal('screen', { width: 430, height: 932 });
    expect(frameHeight()).toBe(872);
  });
});
