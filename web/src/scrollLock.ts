/**
 * Page scroll lock for anything that covers the page: the full player and
 * every sheet.
 *
 * It used to pin body with position: fixed at its scroll offset. That stops
 * the page, but it also takes body out of flow, and on iOS - above all in the
 * installed app - the page's height and viewport are re-measured when that
 * happens, so everything anchored to the bottom (the tab bar) jumped a few
 * pixels as a sheet opened and jumped back as it closed.
 *
 * Now nothing is re-laid out: overflow: hidden on the root and body stops the
 * page scrolling (Safari honours it since iOS 16), and a touch guard catches
 * what overflow alone lets through on a phone - a drag that starts outside a
 * scrollable area of the overlay (the sheet's body, a slider) never scrolls
 * the page behind. Locks nest (a sheet over the player): only the first one
 * in locks and only the last one out lets go.
 */
import { useEffect } from 'react';

let depth = 0;

/** Where a drag may still scroll: the content of a sheet, or a slider. */
const SCROLLABLE = '.sheet-body, .slider, .med-picker, [data-scroll]';

function guard(e: TouchEvent) {
  const t = e.target as Element | null;
  if (t?.closest?.(SCROLLABLE)) return;
  // The full player handles its own drags (pull down to minimise).
  if (t?.closest?.('.fp')) return;
  e.preventDefault();
}

function lock(): void {
  if (depth++ > 0) return;
  document.documentElement.classList.add('scroll-locked');
  document.addEventListener('touchmove', guard, { passive: false });
}

function unlock(): void {
  if (depth === 0 || --depth > 0) return;
  document.documentElement.classList.remove('scroll-locked');
  document.removeEventListener('touchmove', guard);
}

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
