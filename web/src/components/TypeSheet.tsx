/**
 * "What is this?" - the owner's correction of the scanner's guess.
 * Four large choices, each with a line saying what it means; an option to
 * apply the choice to the whole series; and a way back to automatic.
 */
import { useEffect, useRef, useState } from 'react';
import type { ContentType } from '@zenport/shared';
import { api } from '../api.ts';
import { TYPE_META, TYPES } from '../content.ts';
import { Icon, Sheet, Switch } from './ui.tsx';

export function TypeSheet({
  itemId,
  current,
  auto,
  seriesSize,
  defaultScope = 'item',
  onClose,
  onSaved,
}: {
  itemId: string;
  current: ContentType;
  auto: boolean;
  /** Items in this one's series; 0 or 1 hides the whole-series option. */
  seriesSize: number;
  defaultScope?: 'item' | 'collection';
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState<'item' | 'collection'>(seriesSize > 1 ? defaultScope : 'item');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (type: ContentType | null) => {
    setBusy(true);
    setError(null);
    try {
      await api.put(`/api/items/${itemId}/type`, { type, scope });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="What is this?" onClose={onClose} labelId="type-sheet">
      <p className="sit-sheet-lede">
        {auto
          ? 'ZenPort guessed from the folder and file names. Pick what it really is - a rescan will keep your choice.'
          : 'You chose this type. Pick another, or let ZenPort decide again.'}
      </p>
      <div className="type-choices" role="radiogroup" aria-label="Type">
        {TYPES.map((t) => (
          <button
            key={t}
            role="radio"
            aria-checked={t === current}
            className={`type-choice t-${t}${t === current ? ' on' : ''}`}
            disabled={busy}
            onClick={() => void save(t)}
          >
            <span className="type-choice-ic">
              <Icon name={TYPE_META[t].icon} size={22} />
            </span>
            <span className="type-choice-t">{TYPE_META[t].label}</span>
            <span className="type-choice-h">{TYPE_META[t].blurb}</span>
          </button>
        ))}
      </div>
      {seriesSize > 1 && (
        <div className="set-switch sit-switch">
          <div>
            <div className="set-switch-t">Apply to the whole series</div>
            <div className="set-switch-h">All {seriesSize} items that belong together.</div>
          </div>
          <Switch
            checked={scope === 'collection'}
            onChange={(v) => setScope(v ? 'collection' : 'item')}
            label="Apply to the whole series"
          />
        </div>
      )}
      {!auto && (
        <button className="ps-try" onClick={() => void save(null)} disabled={busy}>
          <Icon name="sparkle" size={14} /> Let ZenPort decide
        </button>
      )}
      {error && <p className="error-note">{error}</p>}
    </Sheet>
  );
}

/**
 * The type label that is also its own dropdown: the pill carries a small
 * chevron, and tapping it opens the other types right beneath - pick one and
 * it replaces the current label. Members see the plain pill.
 */
export function TypeMenu({
  itemId,
  current,
  auto,
  hasVideo,
  seriesSize,
  editable,
  onSaved,
}: {
  itemId: string;
  current: ContentType;
  auto: boolean;
  hasVideo: boolean;
  seriesSize: number;
  editable: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [wholeSeries, setWholeSeries] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const save = async (type: ContentType | null) => {
    if (type === current && !wholeSeries) {
      setOpen(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.put(`/api/items/${itemId}/type`, {
        type,
        scope: wholeSeries && seriesSize > 1 ? 'collection' : 'item',
      });
      setOpen(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not save');
    } finally {
      setBusy(false);
    }
  };

  const face = (
    <>
      <Icon name={TYPE_META[current].icon} size={14} />
      {TYPE_META[current].label}
      {hasVideo && (
        <>
          <span className="dot" aria-hidden="true">
            ·
          </span>
          <Icon name="video" size={14} /> Video
        </>
      )}
    </>
  );

  if (!editable) return <span className={`type-pill t-${current}`}>{face}</span>;

  // Arrow keys walk the choices, as in any menu.
  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [
      ...(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []),
    ];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div className="type-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`type-pill type-pill-btn t-${current}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Type: ${TYPE_META[current].label}. Change`}
        onClick={() => setOpen(!open)}
      >
        {face}
        <span className="type-pill-caret" aria-hidden="true">
          <Icon name="chevron-down" size={13} />
        </span>
      </button>
      {open && (
        <div className="type-pop" role="menu" aria-label="Choose a type" onKeyDown={onMenuKey}>
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              role="menuitemradio"
              aria-checked={t === current}
              className={`type-pop-opt t-${t}${t === current ? ' on' : ''}`}
              disabled={busy}
              onClick={() => void save(t)}
            >
              <span className="type-pop-ic">
                <Icon name={TYPE_META[t].icon} size={16} />
              </span>
              <span className="type-pop-t">{TYPE_META[t].label}</span>
              {t === current && (
                <span className="type-pop-check">
                  <Icon name="check" size={14} />
                </span>
              )}
            </button>
          ))}
          {!auto && (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={false}
              className="type-pop-opt type-pop-auto"
              disabled={busy}
              onClick={() => void save(null)}
            >
              <span className="type-pop-ic">
                <Icon name="sparkle" size={16} />
              </span>
              <span className="type-pop-t">Let ZenPort decide</span>
            </button>
          )}
          {seriesSize > 1 && (
            <label className="type-pop-series">
              <input
                type="checkbox"
                checked={wholeSeries}
                onChange={(e) => setWholeSeries(e.target.checked)}
              />
              All {seriesSize} in this series
            </label>
          )}
          {error && <p className="error-note">{error}</p>}
        </div>
      )}
    </div>
  );
}
