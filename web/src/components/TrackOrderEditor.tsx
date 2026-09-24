/**
 * Arrange an item's parts by hand: drag a row by its grip (finger or mouse),
 * or focus a grip and use the arrow keys. Nothing is saved until Save; Cancel
 * leaves the order as it was. The order is kept per file, apart from the
 * scanner's, so a rescan - or the library moving - never undoes it.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatClock, type MeditationDetailDto, type TrackDto } from '@zenport/shared';
import { api } from '../api.ts';
import { Icon } from './ui.tsx';

interface Drag {
  id: string;
  from: number;
  /** Page-space y where the grip was taken, and where the pointer is now. */
  startY: number;
  y: number;
  rowH: number;
}

export function TrackOrderEditor({
  item,
  onClose,
  onSaved,
}: {
  item: MeditationDetailDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [order, setOrder] = useState<TrackDto[]>(item.tracks);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const pointerY = useRef(0);
  const listRef = useRef<HTMLOListElement>(null);
  const changed = order.some((t, i) => t.id !== item.tracks[i]?.id);

  const move = (from: number, to: number) =>
    setOrder((o) => {
      const next = [...o];
      const [t] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(next.length, to)), 0, t!);
      return next;
    });

  // Follow the pointer: the row slides under the finger, and the list
  // reorders as it passes each neighbour's middle.
  const follow = (clientY: number) => {
    const d = dragRef.current;
    if (!d) return;
    pointerY.current = clientY;
    const y = clientY + window.scrollY;
    const want = Math.max(
      0,
      Math.min(order.length - 1, d.from + Math.round((y - d.startY) / d.rowH)),
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

  // Near the top or bottom of the screen the page scrolls on its own, so a
  // long series can be arranged end to end in one drag.
  useEffect(() => {
    if (!drag) return;
    let raf = 0;
    const tick = () => {
      const y = pointerY.current;
      const edge = 90;
      const speed =
        y < edge
          ? -Math.ceil((edge - y) / 8)
          : y > window.innerHeight - edge - 70
            ? Math.ceil((y - (window.innerHeight - edge - 70)) / 8)
            : 0;
      if (speed !== 0) {
        window.scrollBy(0, speed);
        follow(y);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [drag?.id]);

  // Rows the lifted one passes glide aside rather than jump (FLIP: measure
  // where each row was, let it land, then animate from the old place).
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const now = new Map<string, number>();
    for (const el of list.querySelectorAll<HTMLElement>('li[data-id]')) {
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

  const start = (e: React.PointerEvent, t: TrackDto) => {
    if (e.button !== 0) return;
    const row = (e.currentTarget as HTMLElement).closest('li');
    if (!row) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const from = order.findIndex((x) => x.id === t.id);
    const gap = 6;
    const d: Drag = {
      id: t.id,
      from,
      startY: e.clientY + window.scrollY,
      y: e.clientY + window.scrollY,
      rowH: row.getBoundingClientRect().height + gap,
    };
    pointerY.current = e.clientY;
    dragRef.current = d;
    setDrag(d);
  };
  const end = () => {
    dragRef.current = null;
    setDrag(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put(`/api/items/${item.id}/order`, { trackIds: order.map((t) => t.id) });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The order could not be saved.');
      setSaving(false);
    }
  };
  const automatic = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.del(`/api/items/${item.id}/order`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The order could not be reset.');
      setSaving(false);
    }
  };

  // The same actions above and below the list: a long series need not be
  // scrolled to its end to save.
  const actions = (where: 'top' | 'bottom') => (
    <div className={`reorder-actions ${where}`}>
      {item.customOrder && (
        <button
          type="button"
          className="btn btn-sm btn-quiet reorder-auto"
          onClick={() => void automatic()}
          disabled={saving}
        >
          <Icon name="restart" size={14} /> Automatic order
        </button>
      )}
      <button type="button" className="btn btn-sm btn-quiet" onClick={onClose} disabled={saving}>
        Cancel
      </button>
      <button
        type="button"
        className="btn btn-sm btn-primary"
        onClick={() => void save()}
        disabled={saving || !changed}
      >
        {saving ? 'Saving' : 'Save order'}
      </button>
    </div>
  );

  return (
    <div className="reorder">
      <p className="reorder-hint">
        Drag by the grip to arrange the parts - or focus a grip and use the arrow keys. The order
        stays through rescans, and if the files move.
      </p>
      {actions('top')}
      <ol className={`reorder-list${drag ? ' is-dragging' : ''}`} ref={listRef}>
        {order.map((t, i) => {
          const lifted = drag?.id === t.id;
          // The lifted row sits under the finger, wherever the list has put it.
          const offset = lifted ? drag.y - drag.startY - (i - drag.from) * drag.rowH : 0;
          return (
            <li
              key={t.id}
              data-id={t.id}
              className={`reorder-row${lifted ? ' lifted' : ''}`}
              style={lifted ? { transform: `translateY(${offset}px)` } : undefined}
            >
              <button
                type="button"
                className="reorder-grip"
                aria-label={`Move ${t.title} - position ${i + 1} of ${order.length}. Arrow keys move it.`}
                onPointerDown={(e) => start(e, t)}
                onPointerMove={(e) => drag && follow(e.clientY)}
                onPointerUp={end}
                onPointerCancel={end}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowUp' && i > 0) {
                    e.preventDefault();
                    move(i, i - 1);
                  } else if (e.key === 'ArrowDown' && i < order.length - 1) {
                    e.preventDefault();
                    move(i, i + 1);
                  }
                }}
              >
                <Icon name="grip" size={20} />
              </button>
              <span className="reorder-n">{i + 1}</span>
              <span className="reorder-t">
                <span className="reorder-title">{t.title}</span>
                <span className="sub">
                  {t.video ? (
                    <>
                      <Icon name="video" size={12} /> video
                    </>
                  ) : (
                    `.${t.ext}`
                  )}
                  {t.durationSec ? ` · ${formatClock(t.durationSec)}` : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      {error && (
        <p className="hint" role="alert">
          {error}
        </p>
      )}
      {actions('bottom')}
    </div>
  );
}
