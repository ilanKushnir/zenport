/**
 * "What is this?" - the owner's correction of the scanner's guess.
 * Four large choices, each with a line saying what it means; an option to
 * apply the choice to the whole series; and a way back to automatic.
 */
import { useState } from 'react';
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
