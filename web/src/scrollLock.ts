/**
 * Page scroll lock for anything that covers the page: the full player and
 * every sheet.
 *
 * `overflow: hidden` on body is not enough on iOS - the page behind still
 * scrolls under a finger, and a pull at the edge drags the whole overlay with
 * it. The reliable way is to pin body in place with position: fixed at its
 * current offset and put the offset back on release. Locks nest (a sheet over
 * the player), so only the first one in pins and only the last one out lets go.
 */
import { useEffect } from 'react';

let depth = 0;
let savedY = 0;

function lock(): void {
  if (depth++ > 0) return;
  savedY = window.scrollY;
  const b = document.body.style;
  b.position = 'fixed';
  b.top = `-${savedY}px`;
  b.left = '0';
  b.right = '0';
  b.width = '100%';
  b.overflow = 'hidden';
  document.documentElement.classList.add('scroll-locked');
}

function unlock(): void {
  if (depth === 0 || --depth > 0) return;
  const b = document.body.style;
  b.position = '';
  b.top = '';
  b.left = '';
  b.right = '';
  b.width = '';
  b.overflow = '';
  document.documentElement.classList.remove('scroll-locked');
  window.scrollTo(0, savedY);
}

export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    lock();
    return unlock;
  }, [active]);
}
