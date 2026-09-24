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
