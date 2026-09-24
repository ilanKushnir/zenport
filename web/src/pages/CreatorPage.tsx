/**
 * A creator, organised the way a programme is walked - not as folders:
 *
 * - Your next step: the series you are in, or the first you have not begun,
 *   with Continue.
 * - Series and programmes, easier first, then as numbered (1 before 2), then
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
  ItemLevel,
  LibraryDto,
  MeditationDetailDto,
  MeditationSummaryDto,
} from '@zenport/shared';
import { formatDuration, isPracticeType } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi, useRefreshOn } from '../hooks.ts';
import { usePlayer } from '../player/PlayerProvider.tsx';
import { Cover, EmptyState, ErrorNote, Icon, PageSkeleton } from '../components/ui.tsx';
import { CreatorFace } from '../components/Shelves.tsx';
import {
  compareItems,
  compareSeries,
  displayName,
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
import { ViewToggle, useViewMode, type ViewMode } from '../components/ViewToggle.tsx';
import { FolderDocs } from '../components/FolderDocs.tsx';

const KIND_ORDER: ContentType[] = ['meditation', 'course', 'talk', 'soundscape'];
const KIND_TITLE: Record<ContentType, string> = {
  meditation: 'Meditations',
  course: 'Courses',
  talk: 'Talks and videos',
  soundscape: 'Soundscapes',
};

export function CreatorPage() {
  const { name = '' } = useParams();
  const creatorName = decodeURIComponent(name);
  const lib = useApi<LibraryDto>('/api/library');
  useRefreshOn('zenport:progress', () => lib.reload());
  const player = usePlayer();
  const [level, setLevel] = useState<ItemLevel | 'all-levels'>('all-levels');
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
    for (const s of series) {
      if (!keep(seriesLevel(s.items))) continue;
      const e: Entry = { kind: 'series', series: s, structure: seriesStructure(s, overrides) };
      const sh = shelfOf(s.name);
      if (sh) toShelf(sh, e);
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
      items: loose.filter((i) => i.type === k).sort(compareItems),
    })).filter((g) => g.items.length > 0);
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
  const programmeCount = view.programmes.length;
  const programmesDone = view.programmes.filter((e) => isFinished(progressOf(e))).length;

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
                {programmeCount > 0 &&
                  `${programmeCount} ${programmeCount === 1 ? 'programme' : 'programmes'}${programmesDone ? ` (${programmesDone} done)` : ''} · `}
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
          {nextInfo && nextItem && level === 'all-levels' && (
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
                  {next?.kind === 'series' ? displayName(nextItem.title) : 'Programme'}
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

          <FolderDocs
            groups={(lib.data?.folderDocs ?? []).filter(
              (g) => g.creator === creatorName && !g.collection,
            )}
          />

          <div className="cr-tools">
            <ViewToggle view={mode} onChange={setMode} />
            {levels.length > 1 && (
              <div className="chip-row cr-levels" role="group" aria-label="Level">
                <button
                  className="chip"
                  aria-pressed={level === 'all-levels'}
                  onClick={() => setLevel('all-levels')}
                >
                  Everything
                </button>
                {levels.map((l) => (
                  <button
                    key={l}
                    className="chip"
                    aria-pressed={level === l}
                    onClick={() => setLevel(l)}
                  >
                    {LEVEL_SHORT[l]}
                  </button>
                ))}
              </div>
            )}
          </div>

          <EntrySection
            title="Programmes"
            note="Step by step, easier first"
            entries={view.programmes}
            mode={mode}
          />
          <EntrySection
            title="Packs and collections"
            note="Any order"
            entries={view.packs}
            mode={mode}
          />
          {view.shelves.map(([name, entries]) => (
            <EntrySection key={name} title={displayName(name)} entries={entries} mode={mode} />
          ))}
          {view.byKind.map((g) => (
            <EntrySection
              key={g.kind}
              title={KIND_TITLE[g.kind]}
              icon={TYPE_META[g.kind].icon}
              entries={g.items.map((i) => ({ kind: 'item' as const, item: i }))}
              mode={mode}
            />
          ))}

          {view.programmes.length === 0 &&
            view.packs.length === 0 &&
            view.shelves.length === 0 &&
            view.byKind.length === 0 && (
              <EmptyState title="Nothing at this level">Choose another level above.</EmptyState>
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
}: {
  title: string;
  note?: string;
  icon?: string;
  entries: Entry[];
  mode: ViewMode;
}) {
  if (entries.length === 0) return null;
  return (
    <section className="section" aria-label={title}>
      <div className="section-head">
        <h2>
          {icon && <Icon name={icon} size={18} />} {title}
        </h2>
        {note && <span className="section-note">{note}</span>}
      </div>
      {mode === 'grid' ? (
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
