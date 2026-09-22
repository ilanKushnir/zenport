/**
 * ZenPort logo geometry — the single source of truth for the mark.
 *
 * The mark is a ring of poured pigment: an amber pole on the left, a violet
 * pole on the right, magenta where the two meet, with droplets thrown off the
 * sweep. It is described here as numbers rather than drawn anywhere, because
 * three different renderers need the exact same shape:
 *
 *   - web/src/components/Brand.tsx  → inline SVG in the app
 *   - scripts/generate-icons.mjs    → PWA/apple-touch PNGs + favicon.svg
 *   - web/src/components/ui.tsx     → the generated cover-art palette
 *
 * Drawing it three times from three hand-copied tables is how a tab icon ends
 * up not matching the sidebar, so all three import from this file.
 */

/** Ring: centre, radius and stroke width, in a 64×64 viewBox. */
export const RING = { cx: 32, cy: 32, r: 21.5, width: 7.4 } as const;

/**
 * Degrees the main stroke does NOT cover. Screen angles: 0 = 3 o'clock,
 * 90 = 6 o'clock. The break sits at the lower left so the ring reads as a
 * poured stroke with a beginning and an end, not as a drawn circle.
 */
export const GAP = { from: 118, to: 150 } as const;

/** Axis the colour sweep is projected onto, in viewBox coordinates. */
export const GRAD = { ax: 6, ay: 14, bx: 58, by: 50 } as const;

/** The sweep itself, amber → violet. */
export const STOPS: readonly (readonly [number, readonly [number, number, number]])[] = [
  [0.0, [0xff, 0xc0, 0x4a]],
  [0.22, [0xfb, 0x8c, 0x3a]],
  [0.46, [0xf0, 0x4c, 0x8a]],
  [0.72, [0xb4, 0x4b, 0xd8]],
  [1.0, [0x7c, 0x3a, 0xed]],
] as const;

/**
 * Droplets thrown off the sweep: [angle°, distance from centre, radius].
 *
 * Deliberately irregular. Evenly spaced droplets read as a mechanical ring of
 * dots; real thrown pigment clusters — a few heavy ones where the stroke
 * changes direction, fine spray trailing behind them, and quiet arcs between.
 * Hand-placed so the mark is byte-identical in every render and every size.
 */
export const DROPS: readonly (readonly [number, number, number])[] = [
  // heavy cluster off the amber pole (left), where the pour begins
  [188, 28.2, 2.6],
  [179, 26.5, 0.75],
  [197, 28.0, 1.15],
  [205, 28.9, 1.75],
  [212, 26.2, 0.6],
  // fine spray climbing the top-left shoulder
  [223, 29.6, 1.0],
  [231, 29.2, 2.1],
  [240, 26.6, 0.7],
  [252, 28.2, 1.35],
  // quiet arc over the crown, one heavy drop flung out
  [268, 27.1, 0.85],
  [279, 29.1, 2.45],
  [291, 26.7, 0.65],
  // magenta shoulder, top right
  [303, 28.3, 1.5],
  [311, 27.0, 0.8],
  [322, 28.9, 1.95],
  // violet pole (right) — sparser, the pour has thinned
  [337, 27.3, 1.1],
  [349, 28.8, 1.65],
  [2, 26.5, 0.7],
  [14, 28.6, 1.3],
  // heavy cluster at the lower right where the stroke turns back
  [27, 29.1, 2.35],
  [36, 27.1, 0.9],
  [44, 28.5, 1.55],
  [57, 26.4, 0.65],
  // trailing spray along the bottom, back toward the break
  [71, 28.5, 1.85],
  [84, 26.9, 1.05],
  [97, 29, 2.2],
  [108, 27.4, 0.8],
  [126, 28.2, 1.4],
  [137, 29.7, 2.0],
  [149, 26.7, 0.7],
  [161, 28.7, 1.25],
  [170, 29.9, 1.9],
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

/** Point on a circle around the ring centre. */
export function polar(angleDeg: number, radius: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [RING.cx + radius * Math.cos(a), RING.cy + radius * Math.sin(a)];
}

/**
 * Where a droplet's colour comes from: 180° (left) is the amber pole, 0/360°
 * (right) the violet pole, so both halves travel the same sweep.
 */
export function angleToSweep(angleDeg: number): number {
  const norm = ((angleDeg % 360) + 360) % 360;
  return norm <= 180 ? 1 - norm / 180 : (norm - 180) / 180;
}

/** `rgb(...)` for a droplet at this angle. */
export function dropColor(angleDeg: number): string {
  const [r, g, b] = spectrumAt(angleToSweep(angleDeg));
  return `rgb(${r} ${g} ${b})`;
}

/** Inner swirl pass: a thinner second sweep crossing the main ring. */
export const SWIRL = { from: 205, to: 30, inset: 0.62, widthScale: 0.34 } as const;
