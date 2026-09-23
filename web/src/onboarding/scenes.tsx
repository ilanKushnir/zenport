/**
 * Onboarding illustrations.
 *
 * Six painted scenes in the logo's own palette (amber, rose, violet on
 * transparent), shipped as WebP under /art and sized for the 220px figure
 * column at 2× density. They are decorative: each carries an empty alt and
 * the step's own heading does the describing, so a screen reader is never
 * read a picture of a singing bowl.
 */

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
