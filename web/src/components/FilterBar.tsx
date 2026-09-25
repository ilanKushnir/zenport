/**
 * The bar above a list of recordings - the same on the Library and on every
 * creator's page, so the two never drift apart: a row of small dropdowns
 * (what kind, what level, how to sort, and any further filters), "Clear"
 * when something is set, and the grid/list switch at the end.
 *
 * Each dropdown shows its current choice on the button and opens a short
 * menu, with how many there are of each where that helps.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { ContentType, ItemLevel, MeditationSummaryDto } from '@zenport/shared';
import { Icon } from './ui.tsx';
import { ViewToggle, type ViewMode } from './ViewToggle.tsx';
import { levelRank } from '../content.ts';

export interface Choice<T extends string = string> {
  value: T;
  label: string;
  /** How many there are, shown faintly beside it. */
  n?: number;
  icon?: string;
  /** What the button says when this is chosen, if shorter than the label. */
  short?: string;
}

export interface FilterSpec {
  key: string;
  /** What the menu is for - "Type", "Level". */
  label: string;
  value: string;
  /** The first choice is "everything" - the resting state. */
  choices: Choice[];
  onChange: (value: string) => void;
}

/** How a list can be ordered - one set, for every list of recordings. */
export type SortKey = 'suggested' | 'title' | 'recent' | 'duration' | 'level';

export const SORTS: Choice<SortKey>[] = [
  { value: 'suggested', label: 'Suggested order', short: 'Sort' },
  { value: 'title', label: 'Title A-Z', short: 'A-Z' },
  { value: 'recent', label: 'Recently added', short: 'Newest' },
  { value: 'duration', label: 'Longest first', short: 'Longest' },
  { value: 'level', label: 'Level, beginner first', short: 'By level' },
];

/** What a thing in a list is sorted by (a recording, or a series of them). */
export interface Sortable {
  title: string;
  addedAt: string;
  durationSec: number;
  level: ItemLevel | null;
}

export const sortableOf = (i: MeditationSummaryDto): Sortable => ({
  title: i.title,
  addedAt: i.addedAt,
  durationSec: i.totalDurationSec ?? 0,
  level: i.level ?? null,
});

/** Sort by a key; 'suggested' keeps the order it came in. Stable. */
export function sortBy<T>(list: T[], key: SortKey, of: (x: T) => Sortable): T[] {
  if (key === 'suggested') return list;
  const cmp: Record<Exclude<SortKey, 'suggested'>, (a: Sortable, b: Sortable) => number> = {
    title: (a, b) => a.title.localeCompare(b.title),
    recent: (a, b) => b.addedAt.localeCompare(a.addedAt),
    duration: (a, b) => b.durationSec - a.durationSec,
    level: (a, b) => levelRank(a.level) - levelRank(b.level),
  };
  return [...list].sort((a, b) => cmp[key](of(a), of(b)));
}

export const TYPE_CHOICE_LABEL: Record<ContentType, string> = {
  meditation: 'Meditations',
  course: 'Courses',
  talk: 'Talks',
  soundscape: 'Soundscapes',
};

export function FilterBar({
  filters,
  sort,
  onSort,
  more,
  moreActive = 0,
  onClear,
  view,
  onView,
  collapse,
}: {
  filters: FilterSpec[];
  sort: SortKey;
  onSort: (s: SortKey) => void;
  /** Further filters, in their own menu ("Filters"). */
  more?: ReactNode;
  moreActive?: number;
  /** Shown when anything is set: back to everything. */
  onClear?: () => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  /** Fold or open every section below, when there are several. */
  collapse?: { allFolded: boolean; onToggle: () => void };
}) {
  const active =
    filters.filter((f) => f.value !== f.choices[0]?.value).length +
    moreActive +
    (sort !== 'suggested' ? 1 : 0);
  return (
    <div className="filter-bar" role="toolbar" aria-label="Show and sort">
      <div className="filter-bar-menus">
        {filters
          .filter((f) => f.choices.length > 2)
          .map((f) => (
            <Dropdown
              key={f.key}
              label={f.label}
              value={f.value}
              choices={f.choices}
              onChange={f.onChange}
            />
          ))}
        <Dropdown
          label="Sort"
          icon="sliders"
          value={sort}
          choices={SORTS}
          onChange={(v) => onSort(v as SortKey)}
        />
        {more && (
          <Menu
            button={
              <>
                <Icon name="list" size={14} />
                <span>Filters</span>
                {moreActive > 0 && <span className="fb-count">{moreActive}</span>}
              </>
            }
            on={moreActive > 0}
            label="More filters"
          >
            <div className="fb-more">{more}</div>
          </Menu>
        )}
        {active > 0 && onClear && (
          <button type="button" className="fb-clear" onClick={onClear}>
            Clear
          </button>
        )}
      </div>
      <div className="fb-end">
        {collapse && (
          <button
            type="button"
            className="fb-fold"
            onClick={collapse.onToggle}
            aria-label={collapse.allFolded ? 'Open every section' : 'Fold every section'}
            title={collapse.allFolded ? 'Open every section' : 'Fold every section'}
          >
            <Icon name={collapse.allFolded ? 'chevron-down' : 'chevron-up'} size={15} />
            <span>{collapse.allFolded ? 'Expand' : 'Collapse'}</span>
          </button>
        )}
        <ViewToggle view={view} onChange={onView} />
      </div>
    </div>
  );
}

/** One choice from a short list, shown on its button. */
function Dropdown({
  label,
  value,
  choices,
  onChange,
  icon,
}: {
  label: string;
  value: string;
  choices: Choice[];
  onChange: (v: string) => void;
  icon?: string;
}) {
  const current = choices.find((c) => c.value === value) ?? choices[0];
  const resting = value === choices[0]?.value;
  return (
    <Menu
      button={
        <>
          {icon && <Icon name={icon} size={14} />}
          <span className="fb-label">
            {resting && !icon ? label : (current?.short ?? current?.label)}
          </span>
        </>
      }
      on={!resting}
      label={label}
    >
      {(close) => (
        <ul className="fb-list" role="listbox" aria-label={label}>
          {choices.map((c) => (
            <li key={c.value}>
              <button
                type="button"
                role="option"
                aria-selected={c.value === value}
                className="fb-option"
                onClick={() => {
                  onChange(c.value);
                  close();
                }}
              >
                {c.icon && <Icon name={c.icon} size={15} />}
                <span className="grow">{c.label}</span>
                {c.n !== undefined && <span className="fb-n">{c.n}</span>}
                {c.value === value && <Icon name="check" size={15} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Menu>
  );
}

/** A button and the small panel it opens - closed by a tap outside or Escape. */
function Menu({
  button,
  children,
  on,
  label,
}: {
  button: ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  on: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [alignEnd, setAlignEnd] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  // Opens towards the side with room, so it never runs off a phone's edge.
  useLayoutEffect(() => {
    if (!open || !wrap.current) return;
    const r = wrap.current.getBoundingClientRect();
    setAlignEnd(r.left + 280 > window.innerWidth - 12);
  }, [open]);

  return (
    <div className="fb-menu" ref={wrap}>
      <button
        type="button"
        className={`fb-btn${on ? ' on' : ''}${open ? ' open' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
      >
        {button}
        <Icon name="chevron-down" size={14} />
      </button>
      {open && (
        <div className={`fb-pop${alignEnd ? ' end' : ''}`}>
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}
