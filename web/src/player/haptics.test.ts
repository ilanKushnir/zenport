import { describe, expect, it } from 'vitest';
import { breathPattern } from './haptics.ts';

describe('breathPattern', () => {
  it('in-breath: taps draw closer together and grow; out-breath: the reverse', () => {
    const inhale = breathPattern('in', 4);
    const gapsIn = inhale.slice(1).map((s, i) => s.at - inhale[i]!.at);
    expect(gapsIn[0]).toBeGreaterThan(gapsIn.at(-1)!);
    expect(inhale.at(-1)!.ms).toBeGreaterThan(inhale[0]!.ms);
    expect(inhale.at(-1)!.at).toBeLessThan(4000);

    const exhale = breathPattern('out', 6);
    const gapsOut = exhale.slice(1).map((s, i) => s.at - exhale[i]!.at);
    expect(gapsOut[0]).toBeLessThan(gapsOut.at(-1)!);
    expect(exhale[0]!.ms).toBeGreaterThan(exhale.at(-1)!.ms);
    expect(exhale.at(-1)!.at).toBeLessThan(6000);
  });
});
