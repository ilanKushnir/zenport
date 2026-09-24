/**
 * Drag-to-reorder for a vertical list: a grip takes the drag (finger or
 * mouse), the row follows the pointer, the list reorders as it passes each
 * neighbour's middle, neighbours glide aside, and the page scrolls on its
 * own near the edges. Arrow keys on a focused grip move a row by one.
 *
 * Rows are measured when the drag starts, so they should be of a similar
 * height; `gap` must match the list's CSS gap. Inside a sheet the sheet's
 * body is what scrolls, so that is what is measured and scrolled.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface Drag {
  id: string;
  from: number;
  startY: number;
  y: number;
  rowH: number;
}

export function useReorder<T extends { id: string }>(initial: T[], gap = 6) {
  const [order, setOrder] = useState<T[]>(initial);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const pointerY = useRef(0);
  const listRef = useRef<HTMLOListElement>(null);
  const count = useRef(initial.length);
  count.current = order.length;

  const move = (from: number, to: number) =>
    setOrder((o) => {
      const next = [...o];
      const [t] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(next.length, to)), 0, t!);
      return next;
    });

  // What scrolls: the sheet the list sits in, or the page.
  const scroller = () => listRef.current?.closest<HTMLElement>('.sheet-body') ?? null;
  const scrollTop = () => scroller()?.scrollTop ?? window.scrollY;

  const follow = (clientY: number) => {
    const d = dragRef.current;
    if (!d) return;
    pointerY.current = clientY;
    const y = clientY + scrollTop();
    const want = Math.max(
      0,
      Math.min(count.current - 1, d.from + Math.round((y - d.startY) / d.rowH)),
    );
    setOrder((o) => {
      const at = o.findIndex((t) => t.id === d.id);
      if (at === want) return o;
      const next = [...o];
      const [t] = next.splice(at, 1);
      next.splice(want, 0, t!);
      return next;
    });
    const nd = { ...d, y };
    dragRef.current = nd;
    setDrag(nd);
  };

  // Near the top or bottom of the screen the page scrolls on its own.
  useEffect(() => {
    if (!drag) return;
    let raf = 0;
    const tick = () => {
      const y = pointerY.current;
      const el = scroller();
      const box = el?.getBoundingClientRect();
      const edge = el ? 56 : 90;
      const high = (box?.top ?? 0) + edge;
      // The page's tab bar covers its bottom; a sheet's body ends where it ends.
      const low = box ? box.bottom - edge : window.innerHeight - edge - 70;
      const speed = y < high ? -Math.ceil((high - y) / 8) : y > low ? Math.ceil((y - low) / 8) : 0;
      if (speed !== 0) {
        if (el) el.scrollTop += speed;
        else window.scrollBy(0, speed);
        follow(y);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drag?.id]);

  // Neighbours glide aside rather than jump (FLIP).
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const now = new Map<string, number>();
    for (const el of list.querySelectorAll<HTMLElement>(':scope > li[data-id]')) {
      const id = el.dataset.id!;
      const top = el.offsetTop;
      now.set(id, top);
      const was = tops.current.get(id);
      if (was === undefined || was === top || id === dragRef.current?.id) continue;
      el.animate([{ transform: `translateY(${was - top}px)` }, { transform: 'translateY(0)' }], {
        duration: 180,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      });
    }
    tops.current = now;
  }, [order]);

  const end = () => {
    dragRef.current = null;
    setDrag(null);
  };

  /** Props for the grip button of row `t` at index `i`. */
  const gripProps = (t: T, i: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      const row = e.currentTarget.closest('li');
      if (!row) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const d: Drag = {
        id: t.id,
        from: order.findIndex((x) => x.id === t.id),
        startY: e.clientY + scrollTop(),
        y: e.clientY + scrollTop(),
        rowH: row.getBoundingClientRect().height + gap,
      };
      pointerY.current = e.clientY;
      dragRef.current = d;
      setDrag(d);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (dragRef.current) follow(e.clientY);
    },
    onPointerUp: end,
    onPointerCancel: end,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowUp' && i > 0) {
        e.preventDefault();
        move(i, i - 1);
      } else if (e.key === 'ArrowDown' && i < order.length - 1) {
        e.preventDefault();
        move(i, i + 1);
      }
    },
  });

  /** Props for row `t`'s <li> at index `i`: its key, id, and the lift. */
  const rowProps = (t: T, i: number) => {
    const lifted = drag?.id === t.id;
    return {
      'data-id': t.id,
      lifted,
      style: lifted
        ? { transform: `translateY(${drag.y - drag.startY - (i - drag.from) * drag.rowH}px)` }
        : undefined,
    };
  };

  return { order, setOrder, dragging: drag !== null, listRef, gripProps, rowProps };
}
