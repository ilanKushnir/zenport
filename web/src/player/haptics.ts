/**
 * Breath you can feel.
 *
 * What a web page can do differs by platform, and the setting says so:
 *
 * - Android (Chrome, Firefox): the Vibration API takes on/off patterns but no
 *   intensity, so a swell is drawn with rhythm instead - taps that come closer
 *   together and slightly longer through the in-breath, and spread apart
 *   through the out-breath.
 * - iPhone: Safari has no Vibration API. Since iOS 18, toggling a native
 *   `<input type="checkbox" switch>` plays the system's light haptic, and a
 *   click on its label toggles it - so the same rhythm arrives as light taps.
 *   It needs iOS 18+ and the screen on; nothing is guaranteed beyond that.
 * - Elsewhere: nothing to feel, and the option is not offered.
 */
export type HapticKind = 'vibrate' | 'ios-switch' | 'none';

const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export function hapticKind(): HapticKind {
  if (typeof navigator === 'undefined') return 'none';
  if (typeof navigator.vibrate === 'function' && !isIOS()) return 'vibrate';
  if (isIOS()) return 'ios-switch';
  return 'none';
}

let switchLabel: HTMLLabelElement | null = null;

/** One light tap. On iPhone, via the switch control; elsewhere, a short buzz. */
export function tap(ms = 12): void {
  const kind = hapticKind();
  if (kind === 'vibrate') {
    navigator.vibrate(ms);
    return;
  }
  if (kind === 'ios-switch') {
    if (!switchLabel) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.id = 'zp-haptic-switch';
      input.tabIndex = -1;
      input.setAttribute('aria-hidden', 'true');
      const label = document.createElement('label');
      label.htmlFor = input.id;
      label.setAttribute('aria-hidden', 'true');
      const box = document.createElement('div');
      box.style.cssText =
        'position:fixed;inline-size:1px;block-size:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9999px';
      box.append(input, label);
      document.body.appendChild(box);
      switchLabel = label;
    }
    switchLabel.click();
  }
}

/**
 * Tap times (ms from the phase start) and lengths for one phase. In: the gaps
 * shrink and the taps lengthen; out: the reverse, over its longer span. Eased,
 * so the change is gradual rather than linear.
 */
export function breathPattern(phase: 'in' | 'out', seconds: number): { at: number; ms: number }[] {
  const total = seconds * 1000;
  const n = phase === 'in' ? 9 : 11;
  const ease = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;
  const out: { at: number; ms: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // Position along the phase: inhale bunches taps towards the end, exhale towards the start.
    const pos = phase === 'in' ? ease(Math.sqrt(t)) : 1 - ease(Math.sqrt(1 - t));
    const strength = phase === 'in' ? ease(t) : ease(1 - t);
    out.push({ at: Math.round(pos * total * 0.96), ms: Math.round(8 + strength * 22) });
  }
  return out;
}

/** Plays one phase of the breath; returns a cancel function. */
export function playBreathPhase(phase: 'in' | 'hold' | 'out', seconds: number): () => void {
  const kind = hapticKind();
  if (kind === 'none' || phase === 'hold' || seconds <= 0) return () => {};
  const steps = breathPattern(phase, seconds);
  if (kind === 'vibrate') {
    // One pattern call: vibrate, pause, vibrate, pause… - led by a 0ms
    // vibration so the first entry is the silence before the first tap.
    const pattern: number[] = [0];
    let cursor = 0;
    for (const step of steps) {
      pattern.push(Math.max(0, step.at - cursor), step.ms);
      cursor = step.at + step.ms;
    }
    navigator.vibrate(pattern);
    return () => navigator.vibrate(0);
  }
  const timers = steps.map((s) => window.setTimeout(() => tap(), s.at));
  return () => timers.forEach((t) => window.clearTimeout(t));
}
