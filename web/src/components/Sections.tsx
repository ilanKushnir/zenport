/**
 * A list of recordings in sections - the same on the Library and on every
 * creator's page, so the two read alike and change together:
 *
 * - Packs: several meditations together (a folder of parts, or a series of
 *   folders).
 * - Shelves (on a creator's page): a folder of several series, like "Extras".
 * - Then single recordings, and series of courses or talks, by kind:
 *   Meditations, Courses, Talks and videos, Soundscapes.
 *
 * Each section has an icon, a count, and folds from its heading.
 */
import { isPracticeType, type ContentType, type ItemLevel } from '@zenport/shared';
import type { MeditationSummaryDto } from '@zenport/shared';
import { Icon } from './ui.tsx';
import { sortableOf, type Sortable } from './FilterBar.tsx';
import type { ViewMode } from './ViewToggle.tsx';
import { MedRow, SeriesRow } from './Shelves.tsx';
import { MedCard, SeriesCard } from '../pages/LibraryPage.tsx';
import {
  compareItems,
  compareSeries,
  displayName,
  groupSeries,
  leadingNumber,
  levelRank,
  seriesLevel,
  seriesStructure,
  shelfOf,
  TYPE_META,
  type Series,
} from '../content.ts';

export const KIND_ORDER: ContentType[] = ['meditation', 'course', 'talk', 'soundscape'];
export const KIND_TITLE: Record<ContentType, string> = {
  meditation: 'Meditations',
  course: 'Courses',
  talk: 'Talks and videos',
  soundscape: 'Soundscapes',
};

/** What the type filter picks by: a pack (in order or not), or a kind of recording. */
export type Kind = 'in-order' | 'pack' | ContentType;
export type KindFilter = 'all' | 'packs' | Kind;

export const KIND_CHIP: Record<Exclude<KindFilter, 'all' | 'pack'>, string> = {
  packs: 'Packs',
  'in-order': 'In order',
  meditation: 'Meditations',
  course: 'Courses',
  talk: 'Talks',
  soundscape: 'Soundscapes',
};

export function kindOf(e: Entry): Kind {
  if (e.kind === 'series') {
    const t = mainType(e.series.items);
    if (!isPracticeType(t)) return t;
    return e.structure === 'programme' ? 'in-order' : 'pack';
  }
  const i = e.item;
  if (isPracticeType(i.type) && i.structure === 'programme') return 'in-order';
  if (isPracticeType(i.type) && i.structure === 'pack') return 'pack';
  return i.type;
}

/** What a pack, series or recording is sorted by. */
export function entrySortable(e: Entry): Sortable {
  if (e.kind === 'item') return sortableOf(e.item);
  const items = e.series.items;
  return {
    title: e.series.name,
    addedAt: items.reduce((m, i) => (i.addedAt > m ? i.addedAt : m), ''),
    durationSec: items.reduce((t, i) => t + (i.totalDurationSec ?? 0), 0),
    level: seriesLevel(items),
  };
}

export const matchesKind = (e: Entry, f: KindFilter) =>
  f === 'all' || (f === 'packs' ? ['in-order', 'pack'].includes(kindOf(e)) : kindOf(e) === f);

/** What most of a series is: a course of courses, a set of meditations. */
export function mainType(items: MeditationSummaryDto[]): ContentType {
  const n = new Map<ContentType, number>();
  for (const i of items) n.set(i.type, (n.get(i.type) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'meditation';
}

export interface SectionsView {
  programmes: Entry[];
  packs: Entry[];
  shelves: [string, Entry[]][];
  byKind: { kind: ContentType; entries: Entry[] }[];
}

/**
 * Recordings into sections. `withShelves` keeps a creator's folders of
 * several series together (on the Library, across creators, they are not).
 */
export function buildSections(
  all: MeditationSummaryDto[],
  level: ItemLevel | 'all-levels',
  overrides: Parameters<typeof seriesStructure>[1],
  withShelves: boolean,
): SectionsView {
  const { series, singles } = groupSeries(all);
  const keep = (lvl: ItemLevel | null) => level === 'all-levels' || lvl === level;
  const programmes: Entry[] = [];
  const packs: Entry[] = [];
  const shelves = new Map<string, Entry[]>();
  const toShelf = (k: string, e: Entry) => shelves.set(k, [...(shelves.get(k) ?? []), e]);
  // Series of courses or talks are learning, not practice: they sit with
  // their kind ("Courses"), not among the programmes and packs.
  const kindSeries = new Map<ContentType, Entry[]>();
  for (const s of series) {
    if (!keep(seriesLevel(s.items))) continue;
    const e: Entry = { kind: 'series', series: s, structure: seriesStructure(s, overrides) };
    const kind = mainType(s.items);
    const sh = withShelves ? shelfOf(s.name) : null;
    if (sh) toShelf(sh, e);
    else if (!isPracticeType(kind)) kindSeries.set(kind, [...(kindSeries.get(kind) ?? []), e]);
    else if (e.structure === 'programme') programmes.push(e);
    else packs.push(e);
  }
  const loose: MeditationSummaryDto[] = [];
  const shelfNames = new Set([...series.map((s) => shelfOf(s.name)).filter(Boolean)]);
  for (const i of singles) {
    if (!keep(i.level ?? null)) continue;
    const e: Entry = { kind: 'item', item: i };
    const sh = withShelves
      ? (shelfOf(i.collection) ??
        (i.collection && shelfNames.has(i.collection) ? i.collection : null) ??
        (shelfNames.has(i.title) ? i.title : null))
      : null;
    if (sh) toShelf(sh, e);
    else if (isPracticeType(i.type) && i.structure === 'programme') programmes.push(e);
    else if (isPracticeType(i.type) && i.structure === 'pack') packs.push(e);
    else loose.push(i);
  }
  programmes.sort(compareEntries);
  packs.sort(compareEntries);
  for (const v of shelves.values()) v.sort(compareEntries);
  const byKind = KIND_ORDER.map((k) => ({
    kind: k,
    entries: [
      ...(kindSeries.get(k) ?? []).sort(compareEntries),
      ...loose
        .filter((i) => i.type === k)
        .sort(compareItems)
        .map((i) => ({ kind: 'item' as const, item: i })),
    ],
  })).filter((g) => g.entries.length > 0);
  return {
    programmes,
    packs,
    shelves: [...shelves.entries()].sort((x, y) => x[0].localeCompare(y[0])),
    byKind,
  };
}

export type Entry =
  | { kind: 'series'; series: Series; structure: 'programme' | 'pack' }
  | { kind: 'item'; item: MeditationSummaryDto };

const entryLevel = (e: Entry) =>
  e.kind === 'series' ? seriesLevel(e.series.items) : (e.item.level ?? null);
const entryName = (e: Entry) => (e.kind === 'series' ? e.series.name : e.item.title);

/** Easier first; then as numbered; then by name - series and recordings alike. */
export function compareEntries(a: Entry, b: Entry): number {
  if (a.kind === 'series' && b.kind === 'series') return compareSeries(a.series, b.series);
  if (a.kind === 'item' && b.kind === 'item') return compareItems(a.item, b.item);
  return (
    levelRank(entryLevel(a)) - levelRank(entryLevel(b)) ||
    (leadingNumber(entryName(a)) ?? 999) - (leadingNumber(entryName(b)) ?? 999) ||
    displayName(entryName(a)).localeCompare(displayName(entryName(b)))
  );
}

/** A section's heading: its icon, name and count - and a tap folds it. */
export function FoldHead({
  title,
  icon,
  count,
  note,
  folded,
  onFold,
  children,
}: {
  title: string;
  icon: string;
  count?: number;
  note?: string;
  folded: boolean;
  onFold: () => void;
  /** Anything at the heading's end (a "See all" link, an Undo). */
  children?: React.ReactNode;
}) {
  return (
    <div className="section-head">
      <h2>
        <button type="button" className="section-fold" aria-expanded={!folded} onClick={onFold}>
          <Icon name={icon} size={18} /> {title}
          {count !== undefined && <span className="section-n">{count}</span>}
          <Icon name="chevron-down" size={16} />
        </button>
      </h2>
      {note && !folded && <span className="section-note">{note}</span>}
      {children}
    </div>
  );
}

export function EntrySection({
  title,
  note,
  icon,
  entries,
  mode,
  folded,
  onFold,
  inCreator,
}: {
  title: string;
  note?: string;
  icon: string;
  entries: Entry[];
  mode: ViewMode;
  folded: boolean;
  onFold: () => void;
  /** On a creator's page: titles without the creator. */
  inCreator: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <section className={`section${folded ? ' folded' : ''}`} aria-label={title}>
      <FoldHead
        title={title}
        icon={icon}
        count={entries.length}
        note={note}
        folded={folded}
        onFold={onFold}
      />
      {folded ? null : mode === 'grid' ? (
        <div className="card-grid">
          {entries.map((e) =>
            e.kind === 'series' ? (
              <SeriesCard
                key={e.series.key}
                series={e.series}
                structure={e.structure}
                inCreator={inCreator}
              />
            ) : (
              <MedCard key={e.item.id} item={e.item} inCreator={inCreator} />
            ),
          )}
        </div>
      ) : (
        <div className="med-rows">
          {entries.map((e) =>
            e.kind === 'series' ? (
              <SeriesRow
                key={e.series.key}
                series={e.series}
                structure={e.structure}
                inCreator={inCreator}
              />
            ) : (
              <MedRow key={e.item.id} item={e.item} inCreator={inCreator} />
            ),
          )}
        </div>
      )}
    </section>
  );
}

/** The kinds a list has, with how many - the choices of its Type filter. */
export function kindChoices(view: SectionsView) {
  const all = allEntries(view);
  return (['all', 'packs', ...KIND_ORDER] as KindFilter[])
    .map((key) => ({ key, n: all.filter((e) => matchesKind(e, key)).length }))
    .filter((c) => c.key === 'all' || c.n > 0)
    .map((c) => ({
      value: c.key,
      label: c.key === 'all' ? 'All types' : KIND_CHIP[c.key as keyof typeof KIND_CHIP],
      n: c.key === 'all' ? undefined : c.n,
    }));
}

export const allEntries = (view: SectionsView): Entry[] => [
  ...view.programmes,
  ...view.packs,
  ...view.shelves.flatMap(([, e]) => e),
  ...view.byKind.flatMap((g) => g.entries),
];

/** The sections on show for a kind - what "fold every section" folds. */
export const sectionKeys = (view: SectionsView, kind: KindFilter): string[] => [
  ...([...view.programmes, ...view.packs].some((e) => matchesKind(e, kind)) ? ['packs'] : []),
  ...view.shelves
    .filter(([, es]) => es.some((e) => matchesKind(e, kind)))
    .map(([n]) => `shelf:${n}`),
  ...view.byKind.filter((g) => g.entries.some((e) => matchesKind(e, kind))).map((g) => g.kind),
];

/** Every section of a list, in order - folded, filtered by kind, each sorted. */
export function SectionList({
  view,
  kind,
  sorted,
  mode,
  folded,
  onFold,
  inCreator,
}: {
  view: SectionsView;
  kind: KindFilter;
  sorted: (es: Entry[]) => Entry[];
  mode: ViewMode;
  folded: (key: string) => boolean;
  onFold: (key: string) => void;
  inCreator: boolean;
}) {
  return (
    <>
      <EntrySection
        title="Packs"
        icon="grid"
        entries={sorted([...view.programmes, ...view.packs].filter((e) => matchesKind(e, kind)))}
        mode={mode}
        folded={folded('packs')}
        onFold={() => onFold('packs')}
        inCreator={inCreator}
      />
      {view.shelves.map(([name, entries]) => (
        <EntrySection
          key={name}
          title={displayName(name)}
          icon="folder"
          entries={sorted(entries.filter((e) => matchesKind(e, kind)))}
          mode={mode}
          folded={folded(`shelf:${name}`)}
          onFold={() => onFold(`shelf:${name}`)}
          inCreator={inCreator}
        />
      ))}
      {view.byKind.map((g) => (
        <EntrySection
          key={g.kind}
          title={KIND_TITLE[g.kind]}
          icon={TYPE_META[g.kind].icon}
          entries={sorted(g.entries.filter((e) => matchesKind(e, kind)))}
          mode={mode}
          folded={folded(g.kind)}
          onFold={() => onFold(g.kind)}
          inCreator={inCreator}
        />
      ))}
    </>
  );
}
