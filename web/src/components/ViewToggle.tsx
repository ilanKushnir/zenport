/**
 * Grid or list - the same small switch wherever a shelf of recordings can be
 * seen either way, and each place remembers its own choice.
 */
import { useState } from 'react';
import { Icon } from './ui.tsx';

export type ViewMode = 'grid' | 'list';

export function useViewMode(key: string): [ViewMode, (v: ViewMode) => void] {
  const [view, setView] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(key) === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const set = (v: ViewMode) => {
    setView(v);
    try {
      localStorage.setItem(key, v);
    } catch {
      /* not remembered - still switches */
    }
  };
  return [view, set];
}

export function ViewToggle({
  view,
  onChange,
}: {
  view: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  return (
    <div className="view-toggle" role="group" aria-label="Show as">
      <button
        type="button"
        aria-pressed={view === 'grid'}
        aria-label="Grid"
        title="Grid"
        onClick={() => onChange('grid')}
      >
        <Icon name="grid" size={16} />
      </button>
      <button
        type="button"
        aria-pressed={view === 'list'}
        aria-label="List"
        title="List"
        onClick={() => onChange('list')}
      >
        <Icon name="list" size={16} />
      </button>
    </div>
  );
}
