/**
 * ZenPort brand marks.
 *
 * The logo is the drawing in `logo.png` at the repo root, served as
 * `/icons/logo-256.png` (derived by `npm run icons`, which also cuts the PWA
 * and touch icons from the same file). It is an <img>, not an inline SVG, on
 * purpose: the mark is painted pigment with soft edges and a glossy sheen,
 * and a vector redraw of it was a different logo.
 */

export function Logo({
  size = 40,
  spin = false,
  bloom = true,
  className,
}: {
  size?: number;
  /** Slow rotation, used on the splash. Respects reduced motion and the calm preference. */
  spin?: boolean;
  /** Soft glow beneath the mark so it sits in the dark UI rather than on top of it. */
  bloom?: boolean;
  className?: string;
}) {
  return (
    <img
      className={`zp-logo${spin ? ' zp-logo-spin' : ''}${bloom ? ' zp-logo-bloom' : ''}${
        className ? ` ${className}` : ''
      }`}
      src="/icons/logo-256.png"
      alt="ZenPort"
      width={size}
      height={size}
      style={{ inlineSize: size, blockSize: size }}
      draggable={false}
    />
  );
}

/**
 * "ZenPort" in the display serif: Zen carries the weight, Port takes the
 * logo's own rose→violet sweep. The gradient is painted through the glyphs
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
      <Wordmark size={Math.round(size * (stacked ? 0.78 : 0.62))} tagline={tagline} />
    </div>
  );
}
