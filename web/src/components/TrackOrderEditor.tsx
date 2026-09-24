/**
 * Arrange an item's parts by hand: drag a row by its grip (finger or mouse),
 * or focus a grip and use the arrow keys. Nothing is saved until Save; Cancel
 * leaves the order as it was. The order is kept per file, apart from the
 * scanner's, so a rescan - or the library moving - never undoes it.
 */
import { useState } from 'react';
import { formatClock, type MeditationDetailDto, type TrackDto } from '@zenport/shared';
import { api } from '../api.ts';
import { Icon } from './ui.tsx';
import { useReorder } from './useReorder.ts';

export function TrackOrderEditor({
  item,
  onClose,
  onSaved,
}: {
  item: MeditationDetailDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { order, dragging, listRef, gripProps, rowProps } = useReorder<TrackDto>(item.tracks);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = order.some((t, i) => t.id !== item.tracks[i]?.id);

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
      <ol className={`reorder-list${dragging ? ' is-dragging' : ''}`} ref={listRef}>
        {order.map((t, i) => {
          const { lifted, ...row } = rowProps(t, i);
          return (
            <li key={t.id} className={`reorder-row${lifted ? ' lifted' : ''}`} {...row}>
              <button
                type="button"
                className="reorder-grip"
                aria-label={`Move ${t.title} - position ${i + 1} of ${order.length}. Arrow keys move it.`}
                {...gripProps(t, i)}
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
