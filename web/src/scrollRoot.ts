/**
 * What the page scrolls in. On a phone or small tablet the document itself
 * never scrolls - the main column does, inside a full-screen frame - so iOS
 * cannot carry the fixed tab bar along with a fling (see .main in app.css).
 * On a wider screen it is the document, as usual.
 */
export function pageScroller(): HTMLElement | null {
  const main = document.getElementById('main');
  if (!main) return null;
  const oy = getComputedStyle(main).overflowY;
  return oy === 'auto' || oy === 'scroll' ? main : null;
}

/** How far the page has scrolled, wherever it scrolls. */
export function pageScrollTop(): number {
  return pageScroller()?.scrollTop ?? window.scrollY;
}

// ── Where each page was left ───────────────────────────────────────────────

const STORE = 'zp-scroll';
/** Scroll position by history entry (react-router's location.key). */
const positions = new Map<string, number>(
  (() => {
    try {
      return JSON.parse(sessionStorage.getItem(STORE) ?? '[]') as [string, number][];
    } catch {
      return [];
    }
  })(),
);

function persist() {
  try {
    // The newest few are enough to go back through.
    sessionStorage.setItem(STORE, JSON.stringify([...positions].slice(-60)));
  } catch {
    /* a convenience only */
  }
}

/** Remember how far the page at `key` is scrolled, as it scrolls. Returns the unsubscribe. */
export function rememberScroll(key: string): () => void {
  const onScroll = (e: Event) => {
    const t = e.target;
    // Only the page itself - not a sheet, a shelf or a list inside it.
    if (t !== document && t !== pageScroller()) return;
    positions.set(key, pageScrollTop());
  };
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  window.addEventListener('pagehide', persist);
  return () => {
    document.removeEventListener('scroll', onScroll, { capture: true });
    window.removeEventListener('pagehide', persist);
    persist();
  };
}

/**
 * Back to where the page at `key` was left - or the top, for a page opened
 * anew. The page may still be drawing (a list arriving, covers loading), so
 * it keeps trying for a moment until the position can be reached, and stops
 * the moment the person scrolls themselves.
 */
export function restoreScroll(key: string, back: boolean): () => void {
  const y = back ? (positions.get(key) ?? 0) : 0;
  const set = (v: number) => {
    const s = pageScroller();
    if (s) s.scrollTop = v;
    else window.scrollTo(0, v);
  };
  set(y);
  if (y === 0) return () => {};
  let frame = 0;
  const until = performance.now() + 2000;
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) {
      window.removeEventListener(ev, stop, true);
    }
  };
  for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) {
    window.addEventListener(ev, stop, { capture: true, passive: true });
  }
  const step = () => {
    set(y);
    if (Math.abs(pageScrollTop() - y) <= 2 || performance.now() > until) return stop();
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return stop;
}

/** The same page under a new entry (a filter or search changed): it stays where it is. */
export function carryScroll(key: string): void {
  positions.set(key, pageScrollTop());
}
