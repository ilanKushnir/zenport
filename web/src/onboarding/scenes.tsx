/**
 * Onboarding illustrations.
 *
 * Painted scenes in the logo's own palette (amber, rose, violet on
 * transparent), shipped as WebP under /art and sized for the 220px figure
 * column at 2× density. They are decorative: each carries an empty alt and
 * the step's own heading does the describing, so a screen reader is never
 * read a picture of a singing bowl.
 */
import { useEffect, useState } from 'react';

export type SceneKey = 'welcome' | 'library' | 'sit' | 'rhythm' | 'feel' | 'ready';

export function Scene({ name, breathe = false }: { name: SceneKey; breathe?: boolean }) {
  return (
    <img
      className={`ob-art${breathe ? ' ob-breathe' : ''}`}
      src={`/art/ob-${name}.webp`}
      alt=""
      width={640}
      height={640}
      decoding="async"
      draggable={false}
    />
  );
}

/** The three levels of the recommended layout, one picture each. */
const LEVELS = [
  { art: 'ob-shape-1', caption: 'The library: a folder per creator' },
  { art: 'ob-shape-2', caption: 'A creator: a folder per meditation' },
  { art: 'ob-shape-3', caption: 'A meditation: tracks, cover, notes' },
] as const;

const DWELL_MS = 3400;

/**
 * Crossfades through the three levels of the layout, going one folder deeper
 * each time, and loops. A tap steps it by hand. Under reduced motion it still
 * changes picture - a slideshow is not motion - but without the fade.
 */
export function SceneCycle() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setI((n) => (n + 1) % LEVELS.length), DWELL_MS);
    return () => window.clearInterval(t);
  }, [i]);
  return (
    <button
      type="button"
      className="ob-cycle"
      onClick={() => setI((n) => (n + 1) % LEVELS.length)}
      aria-label={`${LEVELS[i]!.caption}. Show the next level`}
    >
      {LEVELS.map((level, n) => (
        <img
          key={level.art}
          className={`ob-art${n === i ? '' : ' off'}`}
          src={`/art/${level.art}.webp`}
          alt=""
          width={640}
          height={640}
          decoding="async"
          draggable={false}
        />
      ))}
      <span className="ob-cycle-cap" aria-hidden="true">
        {LEVELS.map((level, n) => (
          <span key={level.art} className={n === i ? 'on' : ''}>
            {level.caption}
          </span>
        ))}
      </span>
    </button>
  );
}
