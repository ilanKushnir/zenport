/**
 * The app frame is exactly as tall as what is visible - on a phone, the
 * frame (.shell) is fixed and sized by --app-h, and the tab bar, its fade,
 * the mini player and notices sit at its bottom (app.css).
 *
 * Why not let iOS place a fixed bar itself: Safari pins "bottom: 0" to a
 * viewport it does not always keep up to date - with its toolbar hidden,
 * or after the keyboard has come and gone - so the bar could float above
 * the bottom with a band of page beneath it. window.innerHeight is the
 * visible height (the keyboard does not shrink it), so the frame follows
 * the screen however the toolbar moves.
 *
 * The keyboard can also pan the page up to reach a field; the document
 * itself never scrolls here, so once the field lets go it is set back.
 */
const editing = () => {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
};

export function trackViewport(): void {
  const root = document.documentElement;
  let frame = 0;
  const apply = () => {
    frame = 0;
    root.style.setProperty('--app-h', `${window.innerHeight}px`);
    // A pan left over from the keyboard: back to the top of the frame.
    if (!editing() && (window.scrollY !== 0 || root.scrollTop !== 0)) window.scrollTo(0, 0);
  };
  const soon = () => {
    if (!frame) frame = requestAnimationFrame(apply);
  };
  apply();
  window.addEventListener('resize', soon, { passive: true });
  window.addEventListener('orientationchange', () => window.setTimeout(apply, 250));
  window.visualViewport?.addEventListener('resize', soon, { passive: true });
  window.visualViewport?.addEventListener('scroll', soon, { passive: true });
  // The keyboard goes as the field lets go; the page settles a moment later.
  document.addEventListener('focusout', () => window.setTimeout(apply, 120), true);
  // Back to the app after a while away: measure again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') window.setTimeout(apply, 60);
  });
  window.addEventListener('pageshow', () => apply());
}
