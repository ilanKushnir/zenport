import { afterEach, describe, expect, it, vi } from 'vitest';
import { frameHeight } from './viewport.ts';

/** An iPhone 15 Pro Max (430 x 932), as a page in Safari or a Home Screen app. */
function phone({
  standalone,
  inner,
  width = 430,
}: {
  standalone: boolean;
  inner: number;
  width?: number;
}) {
  vi.stubGlobal('window', {
    innerHeight: inner,
    innerWidth: width,
    matchMedia: (q: string) => ({ matches: standalone && q.includes('standalone') }),
  });
  vi.stubGlobal('navigator', { standalone });
  vi.stubGlobal('screen', { width: 430, height: 932 });
}

afterEach(() => vi.unstubAllGlobals());

describe('frame height', () => {
  it('in Safari, is the visible height', () => {
    phone({ standalone: false, inner: 760 });
    expect(frameHeight()).toBe(760);
  });

  it('as a Home Screen app, is the whole screen even when iOS reports less', () => {
    phone({ standalone: true, inner: 853 });
    expect(frameHeight()).toBe(932);
  });

  it('as a Home Screen app on its side, is the screen width', () => {
    phone({ standalone: true, inner: 398, width: 932 });
    expect(frameHeight()).toBe(430);
  });

  it('as a window beside another (not the whole screen), is the visible height', () => {
    phone({ standalone: true, inner: 853, width: 300 });
    expect(frameHeight()).toBe(853);
  });
});
