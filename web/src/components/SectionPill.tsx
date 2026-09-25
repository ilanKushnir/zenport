/**
 * Where you are on a long page: once a section's heading has scrolled away
 * under the top, its name floats there in a small frosted pill - "Courses",
 * "Talks and videos" - changing as the next heading passes, gone again at
 * the top of the page. Tapping it goes back to the start of that section.
 *
 * It reads the page's own section headings (.section-head h2), so every page
 * built from sections gets it, and it never re-renders on scroll: it only
 * changes when the section does.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from './ui.tsx';

export function SectionPill() {
  const location = useLocation();
  const [current, setCurrent] = useState<HTMLElement | null>(null);
  const pill = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setCurrent(null);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const main = document.getElementById('main');
      if (!main) return;
      // The line under the top bar (on a phone), or the top of the window.
      const bar = document.querySelector<HTMLElement>('.app-bar');
      // (A fixed bar has no offsetParent: whether it shows is its display.)
      const barBottom =
        bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().bottom : 0;
      const line = barBottom + 6;
      let found: HTMLElement | null = null;
      for (const h of main.querySelectorAll<HTMLElement>('.section-head h2')) {
        if (h.offsetParent === null) continue;
        if (h.getBoundingClientRect().bottom < line) found = h;
        else break;
      }
      // Centred over the main column, just under the bar.
      const r = main.getBoundingClientRect();
      pill.current?.style.setProperty('--pill-x', `${r.left + r.width / 2}px`);
      pill.current?.style.setProperty('--pill-y', `${barBottom + 10}px`);
      setCurrent((prev) => (prev === found ? prev : found));
    };
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    document.addEventListener('scroll', soon, { capture: true, passive: true });
    window.addEventListener('resize', soon, { passive: true });
    soon();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('scroll', soon, { capture: true });
      window.removeEventListener('resize', soon);
    };
  }, [location.pathname]);

  // The heading's name only - not its count or its fold arrow.
  const fold = current?.querySelector('.section-fold');
  const label = (
    fold
      ? [...fold.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent)
          .join('')
      : (current?.textContent ?? '')
  ).trim();
  return (
    <button
      ref={pill}
      type="button"
      className={`section-pill${current ? ' shown' : ''}`}
      aria-hidden={!current}
      tabIndex={current ? 0 : -1}
      onClick={() => current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}
      title="Back to the start of this section"
    >
      <span className="section-pill-dot" aria-hidden="true" />
      <span className="section-pill-t">{label}</span>
      <Icon name="chevron-up" size={14} />
    </button>
  );
}
