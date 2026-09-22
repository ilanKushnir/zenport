/**
 * ZenPort brand marks.
 *
 * Geometry comes from `@zenport/shared/brand` — the same numbers the PNG icon
 * renderer uses, so the tab icon and the sidebar can never drift apart. Drawn
 * as SVG rather than shipped as a bitmap so it stays crisp at every size,
 * weighs nothing, and can take motion without a second asset.
 *
 * Gradient ids are suffixed per instance: two logos on one page sharing ids
 * would make the second inherit the first one's (possibly unmounted) defs.
 */
import { useId } from 'react';
import { DROPS, dropColor, GAP, GRAD, polar, RING, STOPS, SWIRL } from '@zenport/shared';

export function Logo({
  size = 40,
  spin = false,
  bloom = true,
  className,
}: {
  size?: number;
  /** Slow rotation, used on the splash and in onboarding. Respects reduced motion. */
  spin?: boolean;
  /** Soft radial bloom so the mark sits in the dark UI rather than on top of it. */
  bloom?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, '');
  const sweepId = `zp-sweep-${uid}`;
  const innerId = `zp-inner-${uid}`;
  const glowId = `zp-glow-${uid}`;

  const [sx, sy] = polar(GAP.to, RING.r);
  const [ex, ey] = polar(GAP.from, RING.r);
  // large-arc flag 1: the stroke runs nearly all the way round, leaving the
  // GAP as a breath at the lower left.
  const ringPath = `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${RING.r} ${RING.r} 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;

  const ir = RING.r - RING.width * SWIRL.inset;
  const [isx, isy] = polar(SWIRL.from, ir);
  const [iex, iey] = polar(SWIRL.to, ir);
  const innerPath = `M ${isx.toFixed(2)} ${isy.toFixed(2)} A ${ir} ${ir} 0 1 1 ${iex.toFixed(2)} ${iey.toFixed(2)}`;

  return (
    <svg
      className={`zp-logo${spin ? ' zp-logo-spin' : ''}${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="ZenPort"
      style={{ inlineSize: size, blockSize: size }}
    >
      <defs>
        <linearGradient
          id={sweepId}
          x1={GRAD.ax}
          y1={GRAD.ay}
          x2={GRAD.bx}
          y2={GRAD.by}
          gradientUnits="userSpaceOnUse"
        >
          {STOPS.map(([at, [r, g, b]]) => (
            <stop key={at} offset={`${at * 100}%`} stopColor={`rgb(${r} ${g} ${b})`} />
          ))}
        </linearGradient>
        {/* The crossing pass runs the other way, so its gradient does too. */}
        <linearGradient id={innerId} x1="54" y1="10" x2="12" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#8E4BF0" stopOpacity="0.95" />
          <stop offset="42%" stopColor="#F463A0" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#FFCB6A" stopOpacity="0.7" />
        </linearGradient>
        <radialGradient id={glowId}>
          <stop offset="52%" stopColor="#F04C8A" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#F04C8A" stopOpacity="0" />
        </radialGradient>
      </defs>

      {bloom && <circle cx={RING.cx} cy={RING.cy} r="31" fill={`url(#${glowId})`} />}

      <path
        d={ringPath}
        stroke={`url(#${sweepId})`}
        strokeWidth={RING.width}
        strokeLinecap="round"
      />
      <path
        d={innerPath}
        stroke={`url(#${innerId})`}
        strokeWidth={RING.width * SWIRL.widthScale}
        strokeLinecap="round"
      />

      {DROPS.map(([angle, dist, r], i) => {
        const [x, y] = polar(angle, dist);
        return (
          <circle
            key={i}
            cx={x.toFixed(2)}
            cy={y.toFixed(2)}
            r={r}
            fill={dropColor(angle)}
            opacity={(0.5 + Math.min(1, r / 2.6) * 0.5).toFixed(2)}
          />
        );
      })}
    </svg>
  );
}

/**
 * "ZenPort" in the display serif: Zen carries the weight, Port takes the
 * ring's own rose→violet sweep. The gradient is painted through the glyphs
 * with background-clip; browsers without it fall back to flat orchid, which
 * still clears contrast on the app background.
 */
export function Wordmark({
  size = 20,
  tagline,
  className,
}: {
  size?: number;
  tagline?: string;
  className?: string;
}) {
  return (
    <span className={`wordmark${className ? ` ${className}` : ''}`} style={{ fontSize: size }}>
      <span className="wm-line">
        <span className="wm-zen">Zen</span>
        <span className="wm-port">Port</span>
      </span>
      {tagline && <small>{tagline}</small>}
    </span>
  );
}

/** Logo + wordmark lockup — sidebar, auth pages, onboarding. */
export function Lockup({
  size = 34,
  tagline,
  spin = false,
  stacked = false,
}: {
  size?: number;
  tagline?: string;
  spin?: boolean;
  stacked?: boolean;
}) {
  return (
    <div className={`lockup${stacked ? ' lockup-stacked' : ''}`}>
      <Logo size={size} spin={spin} />
      <Wordmark size={Math.round(size * (stacked ? 0.78 : 0.58))} tagline={tagline} />
    </div>
  );
}
