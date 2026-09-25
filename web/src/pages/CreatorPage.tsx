/**
 * A creator, organised the way their work is walked - not as folders:
 *
 * - Your next step: the series you are in, or the first you have not begun,
 *   with Continue.
 * - Packs (those meant in order first), easier first, then as numbered, then
 *   by name - each with its level, progress, and Done once every part is.
 * - Each shelf (a folder of several collections, like "Extras") as its own
 *   section.
 * - Single recordings, grouped by kind and ordered the same way.
 *
 * A level filter narrows all of it; levels come from names, research, the
 * AI or an admin (see levels.ts).
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type {
  ContentType,
  GroupSuggestionDto,
  ItemLevel,
  LibraryDto,
  MeditationDetailDto,
  MeditationSummaryDto,
} from '@zenport/shared';
import { formatDuration, isPracticeType } from '@zenport/shared';
import { api } from '../api.ts';
import { useAuth } from '../App.tsx';
import { useApi, useRefreshOn } from '../hooks.ts';
import { usePlayer } from '../player/PlayerProvider.tsx';
import { Cover, EmptyState, ErrorNote, Icon, PageSkeleton } from '../components/ui.tsx';
import { CreatorFace } from '../components/Shelves.tsx';
import {
  FilterBar,
  sortableOf,
  sortBy,
  type Sortable,
  type SortKey,
} from '../components/FilterBar.tsx';
import {
  compareItems,
  compareSeries,
  displayName,
  titleInSeries,
  inOrder,
  groupSeries,
  isFinished,
  LEVEL_SHORT,
  leadingNumber,
  levelRank,
  seriesLevel,
  seriesPath,
  seriesStructure,
  shelfOf,
  TYPE_META,
  type Series,
} from '../content.ts';
import { MedCard, SeriesCard } from './LibraryPage.tsx';
import { MedRow, SeriesRow } from '../components/Shelves.tsx';
import { useViewMode, type ViewMode } from '../components/ViewToggle.tsx';
import { useCollapsed } from '../components/Collapse.tsx';
import { FolderDocs } from '../components/FolderDocs.tsx';

const KIND_ORDER: ContentType[] = ['meditation', 'course', 'talk', 'soundscape'];
const KIND_TITLE: Record<ContentType, string> = {
  meditation: 'Meditations',
  course: 'Courses',
  talk: 'Talks and videos',
  soundscape: 'Soundscapes',
};

/** What the type filter picks by: a pack (in order or not), or a kind of recording. */
type Kind = 'in-order' | 'pack' | ContentType;
type KindFilter = 'all' | 'packs' | Kind;

const KIND_CHIP: Record<Exclude<KindFilter, 'all' | 'pack'>, string> = {
  packs: 'Packs',
  'in-order': 'In order',
  meditation: 'Meditations',
  course: 'Courses',
  talk: 'Talks',
  soundscape: 'Soundscapes',
};

function kindOf(e: Entry): Kind {
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
function entrySortable(e: Entry): Sortable {
  if (e.kind === 'item') return sortableOf(e.item);
  const items = e.series.items;
  return {
    title: e.series.name,
    addedAt: items.reduce((m, i) => (i.addedAt > m ? i.addedAt : m), ''),
    durationSec: items.reduce((t, i) => t + (i.totalDurationSec ?? 0), 0),
    level: seriesLevel(items),
  };
}

const matchesKind = (e: Entry, f: KindFilter) =>
  f === 'all' || (f === 'packs' ? ['in-order', 'pack'].includes(kindOf(e)) : kindOf(e) === f);

/** What most of a series is: a course of courses, a set of meditations. */
function mainType(items: MeditationSummaryDto[]): ContentType {
  const n = new Map<ContentType, number>();
  for (const i of items) n.set(i.type, (n.get(i.type) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'meditation';
}

export function CreatorPage() {
  const { name = '' } = useParams();
  const creatorName = decodeURIComponent(name);
  const lib = useApi<LibraryDto>('/api/library');
  useRefreshOn('zenport:progress', () => lib.reload());
  const { user } = useAuth();
  // For the admin: sets here that look like they belong together (Review).
  const sets = useApi<GroupSuggestionDto[]>(user?.role === 'admin' ? '/api/admin/groups' : null);
  const setsHere = (sets.data ?? []).filter((g) => g.creator === creatorName);
  const player = usePlayer();
  const [level, setLevel] = useState<ItemLevel | 'all-levels'>('all-levels');
  const [kind, setKind] = useState<KindFilter>('all');
  const [sort, setSort] = useState<SortKey>('suggested');
  // Sections folded on this creator's page, remembered on this device.
  const folds = useCollapsed(`zp-folded:${creatorName}`);
  // Each section in the chosen order (its own suggested order by default).
  const sorted = (es: Entry[]) => sortBy(es, sort, entrySortable);
  const [starting, setStarting] = useState(false);
  const [mode, setMode] = useViewMode('zp-creator-view');

  const all = useMemo(
    () => (lib.data?.items ?? []).filter((i) => i.creator === creatorName && !i.missing),
    [lib.data, creatorName],
  );
  const creator = lib.data?.creators.find((c) => c.name === creatorName);

  // Levels present, for the filter; shown only when there is a choice to make.
  const levels = useMemo(() => {
    const set = new Set<ItemLevel>();
    for (const i of all) if (i.level) set.add(i.level);
    const order: ItemLevel[] = ['beginner', 'intermediate', 'advanced', 'all'];
    return order.filter((l) => set.has(l));
  }, [all]);

  const overrides = lib.data?.seriesStructures;
  const view = useMemo(() => {
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
      const sh = shelfOf(s.name);
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
      const sh =
        shelfOf(i.collection) ??
        (i.collection && shelfNames.has(i.collection) ? i.collection : null) ??
        (shelfNames.has(i.title) ? i.title : null);
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
  }, [all, level, overrides]);

  // The next step: a programme under way, else the first not begun.
  const next = useMemo(() => {
    const progress = (e: Entry) => (e.kind === 'series' ? e.series : e.item);
    const inWay = view.programmes.find((e) => {
      const p = progress(e);
      return p.completedCount > 0 && !isFinished(p);
    });
    const fresh = view.programmes.find((e) => progress(e).completedCount === 0);
    return inWay ?? fresh ?? null;
  }, [view.programmes]);
  const nextItem =
    next?.kind === 'series'
      ? (inOrder(next.series.items).find((i) => !isFinished(i)) ?? next.series.items[0]!)
      : next?.kind === 'item'
        ? next.item
        : null;
  const nextInfo = next
    ? next.kind === 'series'
      ? {
          name: next.series.name,
          href: seriesPath(next.series.creator, next.series.name),
          coverId: next.series.coverId,
          level: seriesLevel(next.series.items),
          done: next.series.completedCount,
          total: next.series.trackCount,
        }
      : {
          name: next.item.title,
          href: `/m/${next.item.id}`,
          coverId: next.item.coverId,
          level: next.item.level ?? null,
          done: next.item.completedCount,
          total: next.item.trackCount,
        }
    : null;

  const continueNext = async () => {
    if (!nextItem) return;
    setStarting(true);
    try {
      const detail = await api.get<MeditationDetailDto>(`/api/items/${nextItem.id}`);
      const track = detail.tracks.find((t) => !t.completed && !t.missing) ?? detail.tracks[0];
      const resume =
        detail.resume && detail.resume.trackId === track?.id
          ? detail.resume.positionSec
          : undefined;
      player.start(detail, { trackId: track?.id, resumeSec: resume });
    } finally {
      setStarting(false);
    }
  };

  if (lib.loading && !lib.data) return <PageSkeleton title={creatorName} grid />;
  if (lib.error) return <ErrorNote message={lib.error} onRetry={lib.reload} />;

  const progressOf = (e: Entry) => (e.kind === 'series' ? e.series : e.item);
  // The type filter: only the kinds this creator has, each with how many.
  const allEntries = [
    ...view.programmes,
    ...view.packs,
    ...view.shelves.flatMap(([, e]) => e),
    ...view.byKind.flatMap((g) => g.entries),
  ];
  const kindChips = (['all', 'packs', 'in-order', ...KIND_ORDER] as KindFilter[])
    .map((key) => ({ key, n: allEntries.filter((e) => matchesKind(e, key)).length }))
    .filter((c) => c.key === 'all' || c.n > 0)
    // "Packs" and "In order" are the same chip when every pack is in order.
    .filter((c, _i, all) => c.key !== 'in-order' || c.n !== all.find((x) => x.key === 'packs')?.n);
  const shownCount = allEntries.filter((e) => matchesKind(e, kind)).length;
  // The sections on show - what "fold every section" folds.
  const sectionKeys = [
    ...([...view.programmes, ...view.packs].some((e) => matchesKind(e, kind)) ? ['packs'] : []),
    ...view.shelves
      .filter(([, es]) => es.some((e) => matchesKind(e, kind)))
      .map(([n]) => `shelf:${n}`),
    ...view.byKind.filter((g) => g.entries.some((e) => matchesKind(e, kind))).map((g) => g.kind),
  ];
  const allPacks = [...view.programmes, ...view.packs];
  const packCount = allPacks.length;
  const packsDone = allPacks.filter((e) => isFinished(progressOf(e))).length;

  return (
    <>
      <div className="page-head">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to="/library">Library</Link>
          <span className="sep">/</span>
          <Link to="/creators">Creators</Link>
          <span className="sep">/</span>
          <span aria-current="page">{creatorName}</span>
        </nav>
        <div className="creator-head">
          {creator && <CreatorFace creator={creator} size="lg" />}
          <div className="grow">
            <h1>{creatorName}</h1>
            {creator && (
              <p className="lede">
                {packCount > 0 &&
                  `${packCount} ${packCount === 1 ? 'pack' : 'packs'}${packsDone ? ` (${packsDone} done)` : ''} · `}
                {creator.itemCount} {creator.itemCount === 1 ? 'recording' : 'recordings'}
                {creator.totalDurationSec ? ` · ${formatDuration(creator.totalDurationSec)}` : ''}
              </p>
            )}
          </div>
        </div>
      </div>

      {all.length === 0 ? (
        <EmptyState title="Nothing from this creator">
          They may have been renamed or removed from the mounted folders.
        </EmptyState>
      ) : (
        <>
          {nextInfo && nextItem && level === 'all-levels' && kind === 'all' && (
            <section className="cr-next" aria-label="Your next step">
              <div className="cr-next-art">
                <Cover
                  coverId={nextInfo.coverId}
                  title={nextInfo.name}
                  creator={creatorName}
                  size={640}
                />
              </div>
              <div className="cr-next-body">
                <span className="cr-next-kicker">
                  {nextInfo.done > 0 ? 'Continue where you are' : 'Your next step'}
                </span>
                <h2>
                  <Link to={nextInfo.href}>{displayName(nextInfo.name)}</Link>
                </h2>
                <p className="sub">
                  {next?.kind === 'series'
                    ? titleInSeries(displayName(nextItem.title), nextInfo.name)
                    : 'In order'}
                  {nextInfo.level ? ` · ${LEVEL_SHORT[nextInfo.level]}` : ''}
                  {` · ${nextInfo.done} of ${nextInfo.total} done`}
                </p>
                <div className="bar" aria-hidden="true">
                  <span
                    style={{
                      inlineSize: `${nextInfo.total ? (nextInfo.done / nextInfo.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="cr-next-actions">
                  <button
                    className="btn btn-primary"
                    onClick={() => void continueNext()}
                    disabled={starting}
                  >
                    <Icon name="play" size={16} />
                    {nextInfo.done > 0 ? 'Continue' : 'Begin'}
                  </button>
                  <Link className="btn btn-ghost" to={nextInfo.href}>
                    {next?.kind === 'series' ? 'See the series' : 'See all its parts'}
                  </Link>
                </div>
              </div>
            </section>
          )}

          {setsHere.length > 0 && (
            <Link className="cr-sets" to="/admin/library?show=sets">
              <Icon name="library" size={15} />
              <span>
                {setsHere.length === 1
                  ? `"${setsHere[0]!.name}" - ${setsHere[0]!.items.length} recordings that look like one set.`
                  : `${setsHere.length} sets of recordings here look like they belong together.`}{' '}
                <strong>Group them</strong>
              </span>
              <Icon name="chevron-right" size={15} />
            </Link>
          )}

          <FolderDocs
            groups={(lib.data?.folderDocs ?? []).filter(
              (g) => g.creator === creatorName && !g.collection,
            )}
          />

          <FilterBar
            filters={[
              {
                key: 'type',
                label: 'Type',
                value: kind,
                choices: kindChips.map((c) => ({
                  value: c.key,
                  label: c.key === 'all' ? 'All types' : KIND_CHIP[c.key as keyof typeof KIND_CHIP],
                  n: c.key === 'all' ? undefined : c.n,
                })),
                onChange: (v) => setKind(v as KindFilter),
              },
              {
                key: 'level',
                label: 'Level',
                value: level,
                choices: [
                  { value: 'all-levels', label: 'Every level' },
                  ...levels.map((l) => ({
                    value: l,
                    label: LEVEL_SHORT[l],
                    n: all.filter((i) => i.level === l).length,
                  })),
                ],
                onChange: (v) => setLevel(v as ItemLevel | 'all-levels'),
              },
            ]}
            sort={sort}
            onSort={setSort}
            onClear={() => {
              setKind('all');
              setLevel('all-levels');
              setSort('suggested');
            }}
            view={mode}
            onView={setMode}
            collapse={
              sectionKeys.length > 1
                ? {
                    allFolded: sectionKeys.every((k) => folds.collapsed.has(k)),
                    onToggle: () =>
                      folds.setAll(sectionKeys, !sectionKeys.every((k) => folds.collapsed.has(k))),
                  }
                : undefined
            }
          />

          <EntrySection
            title="Packs"
            note={
              view.programmes.length > 0 && view.packs.length > 0
                ? 'Those meant in order first'
                : undefined
            }
            entries={sorted(
              [...view.programmes, ...view.packs].filter((e) => matchesKind(e, kind)),
            )}
            mode={mode}
            folded={folds.collapsed.has('packs')}
            onFold={() => folds.toggle('packs')}
          />
          {view.shelves.map(([name, entries]) => (
            <EntrySection
              key={name}
              title={displayName(name)}
              entries={sorted(entries.filter((e) => matchesKind(e, kind)))}
              mode={mode}
              folded={folds.collapsed.has(`shelf:${name}`)}
              onFold={() => folds.toggle(`shelf:${name}`)}
            />
          ))}
          {view.byKind.map((g) => (
            <EntrySection
              key={g.kind}
              title={KIND_TITLE[g.kind]}
              icon={TYPE_META[g.kind].icon}
              entries={sorted(g.entries.filter((e) => matchesKind(e, kind)))}
              mode={mode}
              folded={folds.collapsed.has(g.kind)}
              onFold={() => folds.toggle(g.kind)}
            />
          ))}

          {view.programmes.length === 0 &&
            view.packs.length === 0 &&
            view.shelves.length === 0 &&
            view.byKind.length === 0 && (
              <EmptyState title="Nothing at this level">Choose another level above.</EmptyState>
            )}
          {kind !== 'all' && shownCount === 0 && (
            <EmptyState title="Nothing of this kind here">
              <button className="linkish" onClick={() => setKind('all')}>
                Show everything
              </button>
            </EmptyState>
          )}
        </>
      )}
    </>
  );
}

type Entry =
  | { kind: 'series'; series: Series; structure: 'programme' | 'pack' }
  | { kind: 'item'; item: MeditationSummaryDto };

const entryLevel = (e: Entry) =>
  e.kind === 'series' ? seriesLevel(e.series.items) : (e.item.level ?? null);
const entryName = (e: Entry) => (e.kind === 'series' ? e.series.name : e.item.title);

/** Easier first; then as numbered; then by name - series and recordings alike. */
function compareEntries(a: Entry, b: Entry): number {
  if (a.kind === 'series' && b.kind === 'series') return compareSeries(a.series, b.series);
  if (a.kind === 'item' && b.kind === 'item') return compareItems(a.item, b.item);
  return (
    levelRank(entryLevel(a)) - levelRank(entryLevel(b)) ||
    (leadingNumber(entryName(a)) ?? 999) - (leadingNumber(entryName(b)) ?? 999) ||
    displayName(entryName(a)).localeCompare(displayName(entryName(b)))
  );
}

function EntrySection({
  title,
  note,
  icon,
  entries,
  mode,
  folded,
  onFold,
}: {
  title: string;
  note?: string;
  icon?: string;
  entries: Entry[];
  mode: ViewMode;
  folded: boolean;
  onFold: () => void;
}) {
  if (entries.length === 0) return null;
  return (
    <section className={`section${folded ? ' folded' : ''}`} aria-label={title}>
      <div className="section-head">
        <h2>
          <button type="button" className="section-fold" aria-expanded={!folded} onClick={onFold}>
            {icon && <Icon name={icon} size={18} />} {title}
            <span className="section-n">{entries.length}</span>
            <Icon name="chevron-down" size={16} />
          </button>
        </h2>
        {note && !folded && <span className="section-note">{note}</span>}
      </div>
      {folded ? null : mode === 'grid' ? (
        <div className="card-grid">
          {entries.map((e) =>
            e.kind === 'series' ? (
              <SeriesCard key={e.series.key} series={e.series} structure={e.structure} inCreator />
            ) : (
              <MedCard key={e.item.id} item={e.item} inCreator />
            ),
          )}
        </div>
      ) : (
        <div className="med-rows">
          {entries.map((e) =>
            e.kind === 'series' ? (
              <SeriesRow key={e.series.key} series={e.series} structure={e.structure} inCreator />
            ) : (
              <MedRow key={e.item.id} item={e.item} inCreator />
            ),
          )}
        </div>
      )}
    </section>
  );
}
