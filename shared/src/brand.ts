/**
 * ZenPort brand palette.
 *
 * The logo itself is `logo.png` at the repo root - a real drawing, not
 * geometry - and `scripts/generate-icons.mjs` derives every icon slot from
 * it. What lives here is only the colour sweep read off that drawing, amber
 * on its left pole through rose to violet on its right, so the parts of the
 * interface that borrow the logo's colours (the accent system in theme.css,
 * the generated cover art) all borrow the same ones.
 */

/** The sweep, amber → violet, as [position, rgb]. */
export const STOPS: readonly (readonly [number, readonly [number, number, number]])[] = [
  [0.0, [0xff, 0xc0, 0x4a]],
  [0.22, [0xfb, 0x8c, 0x3a]],
  [0.46, [0xf0, 0x4c, 0x8a]],
  [0.72, [0xb4, 0x4b, 0xd8]],
  [1.0, [0x7c, 0x3a, 0xed]],
] as const;

/** Colour at a point along the sweep, 0 → 1 travelling amber → violet. */
export function spectrumAt(t: number): [number, number, number] {
  const u = Math.min(1, Math.max(0, t));
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [p0, c0] = STOPS[i]!;
    const [p1, c1] = STOPS[i + 1]!;
    if (u <= p1) {
      const k = (u - p0) / (p1 - p0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * k),
        Math.round(c0[1] + (c1[1] - c0[1]) * k),
        Math.round(c0[2] + (c1[2] - c0[2]) * k),
      ];
    }
  }
  const last = STOPS[STOPS.length - 1]![1];
  return [last[0], last[1], last[2]];
}
