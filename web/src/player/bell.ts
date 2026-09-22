/**
 * Interval bell, synthesized with WebAudio — no bundled recording, nothing
 * to license. A struck-bowl voice: a few inharmonic partials with slow
 * exponential decay.
 */

let ctx: AudioContext | null = null;

export function playBell(volume = 0.5): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = Math.min(1, Math.max(0, volume)) * 0.5;
    master.connect(ctx.destination);

    const partials: [number, number, number][] = [
      // [frequency, relative gain, decay seconds]
      [523.25, 1.0, 4.5],
      [1244.5, 0.4, 3.2],
      [1830.0, 0.18, 2.2],
      [2740.0, 0.08, 1.4],
    ];
    for (const [freq, gain, decay] of partials) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(gain, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.connect(g);
      g.connect(master);
      osc.start(now);
      osc.stop(now + decay + 0.1);
    }
  } catch {
    // Audio context unavailable (autoplay policy, etc.) — the bell is optional.
  }
}
