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
 * Opened from the Home Screen, it is different again: the app has the whole
 * screen, but iOS can report innerHeight without the status bar and home
 * indicator areas - the frame then ends some 80 points short, the tab bar
 * floating above a band of empty screen. There, a window as wide as the
 * screen is as tall as the screen, and the frame takes that height.
 *
 * The keyboard can also pan the page up to reach a field; the document
 * itself never scrolls here, so once the field lets go it is set back.
 */
const editing = () => {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
};

const standalone = () =>
  (navigator as Navigator & { standalone?: boolean }).standalone === true ||
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches;

/** The height the frame should have: the visible height, or - as a whole-screen app - the screen's. */
export function frameHeight(): number {
  const h = window.innerHeight;
  if (!standalone()) return h;
  // iOS gives screen width and height in portrait terms, whatever the orientation.
  const landscape = window.innerWidth > h;
  const sw = landscape
    ? Math.max(screen.width, screen.height)
    : Math.min(screen.width, screen.height);
  const sh = landscape
    ? Math.min(screen.width, screen.height)
    : Math.max(screen.width, screen.height);
  // Only when the app really fills the screen (not an iPad window beside another).
  const fills = Math.abs(window.innerWidth - sw) <= 1;
  return fills && sh > h && sh - h <= 140 ? sh : h;
}

export function trackViewport(): void {
  const root = document.documentElement;
  let frame = 0;
  const apply = () => {
    frame = 0;
    root.style.setProperty('--app-h', `${frameHeight()}px`);
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
