/**
 * Generated cover art.
 *
 * A self-hosted meditation library is mostly loose audio files, and most of
 * them have no artwork at all. The old fallback was the first letter on a flat
 * tint, which made a shelf of thirty recordings look like a spreadsheet.
 *
 * This draws a small abstract piece per item instead — concentric arcs in the
 * brand sweep, offset and rotated by a hash of the title, so every meditation
 * gets its own recognisable image and the same meditation always gets the same
 * one. It is deterministic on purpose: cover art that reshuffles on reload is
 * worse than no cover art, because you can no longer find things by their look.
 *
 * No network, no stored bitmaps, a few hundred bytes of SVG each.
 */
import { spectrumAt } from '@zenport/shared';

/** FNV-1a: small, fast, and well spread for short strings like titles. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Pull successive independent values out of one hash. */
function splitmix(state: number): () => number {
  let s = state;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return ((z ^ (z >>> 15)) >>> 0) / 0x100000000;
  };
}

const rgb = (c: [number, number, number]) => `rgb(${c[0]} ${c[1]} ${c[2]})`;

export function GeneratedCover({ seed, label }: { seed: string; label?: string }) {
  const rand = splitmix(hash(seed));

  // Anchor each cover at a different point on the sweep, then take a narrow
  // band around it: two colours that always belong together.
  const base = rand();
  const spread = 0.16 + rand() * 0.2;
  const c1 = spectrumAt(base);
  const c2 = spectrumAt((base + spread) % 1);
  const c3 = spectrumAt((base + spread * 2) % 1);

  const rotation = Math.round(rand() * 360);
  const cx = 26 + rand() * 48;
  const cy = 26 + rand() * 48;
  const arcCount = 3 + Math.floor(rand() * 3);
  const dotCount = 2 + Math.floor(rand() * 4);

  const arcs = Array.from({ length: arcCount }, (_, i) => {
    const r = 16 + i * (7 + rand() * 6);
    const dash = 0.35 + rand() * 0.45;
    const circumference = 2 * Math.PI * r;
    return {
      r,
      width: 2 + rand() * 5,
      dash: `${circumference * dash} ${circumference}`,
      spin: Math.round(rand() * 360),
      opacity: 0.35 + rand() * 0.5,
    };
  });

  const dots = Array.from({ length: dotCount }, () => ({
    x: 8 + rand() * 84,
    y: 8 + rand() * 84,
    r: 1.2 + rand() * 3.2,
    opacity: 0.4 + rand() * 0.5,
  }));

  const gid = `cv${hash(seed).toString(36)}`;

  return (
    <svg
      className="gen-cover"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={label ? `Cover art for ${label}` : ''}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={`${gid}-bg`} gradientTransform={`rotate(${rotation} 0.5 0.5)`}>
          <stop offset="0%" stopColor={rgb(c1)} stopOpacity="0.30" />
          <stop offset="100%" stopColor={rgb(c3)} stopOpacity="0.14" />
        </linearGradient>
        <linearGradient
          id={`${gid}-st`}
          gradientTransform={`rotate(${(rotation + 90) % 360} 0.5 0.5)`}
        >
          <stop offset="0%" stopColor={rgb(c1)} />
          <stop offset="55%" stopColor={rgb(c2)} />
          <stop offset="100%" stopColor={rgb(c3)} />
        </linearGradient>
        <radialGradient id={`${gid}-gl`} cx={cx / 100} cy={cy / 100} r="0.7">
          <stop offset="0%" stopColor={rgb(c2)} stopOpacity="0.4" />
          <stop offset="100%" stopColor={rgb(c2)} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="100" height="100" fill="var(--raised)" />
      <rect width="100" height="100" fill={`url(#${gid}-bg)`} />
      <rect width="100" height="100" fill={`url(#${gid}-gl)`} />

      <g fill="none" stroke={`url(#${gid}-st)`} strokeLinecap="round">
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={a.r}
            strokeWidth={a.width}
            strokeDasharray={a.dash}
            opacity={a.opacity}
            transform={`rotate(${a.spin} ${cx} ${cy})`}
          />
        ))}
      </g>

      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={rgb(c2)} opacity={d.opacity} />
      ))}
    </svg>
  );
}

/** How many painted covers ship in /art/covers (cover-01 … cover-NN). */
export const PAINTED_COVERS = 16;

/**
 * The painted cover for an item with no artwork of its own: one of a set in
 * the logo's liquid-paint style, picked by a hash of the seed and mirrored on
 * alternate hashes - so the same meditation always gets the same picture, and
 * neighbours rarely share one.
 */
export function paintedCover(seed: string): { src: string; lqip: string; mirror: boolean } {
  // FNV alone spreads near-identical titles ("… Series 1", "… Series 2") badly
  // in its low bits; the splitmix pass mixes every bit into the choice.
  const rand = splitmix(hash(seed));
  const n = Math.floor(rand() * PAINTED_COVERS) + 1;
  const name = `cover-${String(n).padStart(2, '0')}`;
  return {
    src: `/art/covers/${name}.webp`,
    lqip: `/art/covers/${name}-32.webp`,
    mirror: rand() < 0.5,
  };
}
