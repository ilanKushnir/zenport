/**
 * A creator, organised the way their work is walked - not as folders:
 *
 * - Your next step: the series you are in, or the first you have not begun,
 *   with Continue.
 * - Packs, easier first, then as numbered, then
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
  GroupSuggestionDto,
  ItemLevel,
  LibraryDto,
  MeditationDetailDto,
} from '@zenport/shared';
import { formatDuration } from '@zenport/shared';
import { api } from '../api.ts';
import { useAuth } from '../App.tsx';
import { useApi, useRefreshOn } from '../hooks.ts';
import { usePlayer } from '../player/PlayerProvider.tsx';
import { Cover, EmptyState, ErrorNote, Icon, PageSkeleton } from '../components/ui.tsx';
import { CreatorFace } from '../components/Shelves.tsx';
import { FilterBar, sortBy, type SortKey } from '../components/FilterBar.tsx';
import {
  displayName,
  titleInSeries,
  inOrder,
  isFinished,
  LEVEL_SHORT,
  seriesLevel,
  seriesPath,
} from '../content.ts';
import { useViewMode } from '../components/ViewToggle.tsx';
import { useCollapsed } from '../components/Collapse.tsx';
import {
  allEntries,
  buildSections,
  entrySortable,
  kindChoices,
  matchesKind,
  sectionKeys,
  SectionList,
  type Entry,
  type KindFilter,
} from '../components/Sections.tsx';
import { FolderDocs } from '../components/FolderDocs.tsx';

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
  const view = useMemo(() => buildSections(all, level, overrides, true), [all, level, overrides]);

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
  const kinds = kindChoices(view);
  const shownCount = allEntries(view).filter((e) => matchesKind(e, kind)).length;
  const keys = sectionKeys(view, kind);
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
                    : `${nextItem.trackCount} parts`}
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
                choices: kinds,
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
              keys.length > 1
                ? {
                    allFolded: keys.every((k) => folds.collapsed.has(k)),
                    onToggle: () => folds.setAll(keys, !keys.every((k) => folds.collapsed.has(k))),
                  }
                : undefined
            }
          />

          <SectionList
            view={view}
            kind={kind}
            sorted={sorted}
            mode={mode}
            folded={(k) => folds.collapsed.has(k)}
            onFold={folds.toggle}
            inCreator
          />

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
