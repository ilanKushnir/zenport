import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ContentType, LibraryDto, MeditationSummaryDto, ScanStateDto } from '@zenport/shared';
import { isPracticeType } from '@zenport/shared';
import { formatDuration } from '@zenport/shared';
import { useOffline } from '../offline.ts';
import { useAuth } from '../App.tsx';
import { api } from '../api.ts';
import { useApi, useRefreshOn } from '../hooks.ts';
import { usePrefs } from '../prefs.tsx';
import { Cover, EmptyState, ErrorNote, Icon, SkeletonGrid } from '../components/ui.tsx';
import {
  continueSeriesKey,
  ContinueCard,
  CreatorBubble,
  MedRow,
  Rail,
  SeriesRow,
  type ContinueEntry,
} from '../components/Shelves.tsx';
import {
  displayName,
  groupSeries,
  isFinished,
  LEVEL_SHORT,
  levelRank,
  progressLabel,
  seriesLevel,
  seriesPath,
  seriesStructure,
  TYPE_META,
  TYPES,
  type Series,
} from '../content.ts';

type SortKey = 'creator' | 'title' | 'recent' | 'duration' | 'level';

export function MedCard({
  item,
  inCreator,
}: {
  item: MeditationSummaryDto;
  /** On its creator's page: a clean title, its series (not its creator) beneath. */
  inCreator?: boolean;
}) {
  const { isFavorite, toggleFavorite } = usePrefs();
  const offline = useOffline();
  const starred = isFavorite(item.id);
  return (
    <Link className="med-card" to={`/m/${item.id}`}>
      <div className="card-art">
        <Cover coverId={item.coverId} title={item.title} creator={item.creator} />
        <CardBadges
          type={item.type}
          video={item.hasVideo}
          shape={item.structure && item.structure !== 'single' ? item.structure : null}
        />
        {item.trackCount > 1 && isFinished(item) ? (
          <CardDone />
        ) : (
          <CardProgress done={item.completedCount} total={item.trackCount} />
        )}
        {offline.ids.has(item.id) && (
          <span className="card-offline" title="On this device - plays offline">
            <Icon name="on-device" size={13} />
          </span>
        )}
        {isPracticeType(item.type) && item.practiceCount > 0 && (
          <span
            className="card-times"
            title={
              item.practiceCount === 1 ? 'Practised once' : `Practised ${item.practiceCount} times`
            }
          >
            <Icon name="lotus" size={12} />
            {item.practiceCount}
          </span>
        )}
      </div>
      <button
        className="fav-btn"
        aria-pressed={starred}
        aria-label={
          starred ? `Remove ${item.title} from favourites` : `Add ${item.title} to favourites`
        }
        onClick={(e) => {
          // The card is a link; starring must not navigate.
          e.preventDefault();
          e.stopPropagation();
          void toggleFavorite(item.id);
        }}
      >
        <Icon name="heart" size={16} />
      </button>
      <div className="t">{inCreator ? displayName(item.title) : item.title}</div>
      <div className="c">
        {inCreator && item.level && (
          <span className={`lvl lvl-${item.level}`}>{LEVEL_SHORT[item.level]}</span>
        )}
        {inCreator
          ? item.collection
            ? displayName(item.collection)
            : TYPE_META[item.type].label
          : item.creator}
        {item.totalDurationSec ? ` · ${formatDuration(item.totalDurationSec)}` : ''}
      </div>
    </Link>
  );
}

/** Type pill (and a video mark) over a cover's corner. Meditation, the default, goes unlabelled. */
/** How several meditations are meant: in order, or any order. */
export type Shape = 'programme' | 'pack' | 'collection';
export const SHAPE_LABEL: Record<Shape, string> = {
  programme: 'Programme',
  pack: 'Pack',
  collection: 'Collection',
};

export function CardBadges({
  type,
  video,
  shape,
}: {
  type: ContentType;
  video: boolean;
  shape?: Shape | null;
}) {
  const showShape = !!shape && (type === 'meditation' || type === 'soundscape');
  if (type === 'meditation' && !video && !showShape) return null;
  return (
    <span className="card-badges" aria-hidden="true">
      {showShape ? (
        <span className={`card-badge s-${shape}`}>
          <Icon name={shape === 'programme' ? 'sprout' : 'grid'} size={13} />
          {SHAPE_LABEL[shape]}
        </span>
      ) : (
        type !== 'meditation' && (
          <span className={`card-badge t-${type}`}>
            <Icon name={TYPE_META[type].icon} size={13} />
            {TYPE_META[type].label}
          </span>
        )
      )}
      {video && (
        <span className="card-badge card-badge-video" title="Video">
          <Icon name="video" size={13} />
        </span>
      )}
    </span>
  );
}

export function CardProgress({ done, total }: { done: number; total: number }) {
  if (done <= 0 || total <= 1) return null;
  return (
    <span className="card-progress" aria-hidden="true">
      <span style={{ inlineSize: `${Math.min(100, (done / total) * 100)}%` }} />
    </span>
  );
}

/** A series (course modules, a meditation programme) as one card. */
export function SeriesCard({
  series,
  inCreator,
  structure,
}: {
  series: Series;
  inCreator?: boolean;
  /** Programme or collection (an admin's word may differ from the names'). */
  structure?: 'programme' | 'pack';
}) {
  const shape: Shape =
    (structure ?? seriesStructure(series)) === 'programme' ? 'programme' : 'collection';
  const m = TYPE_META[series.type];
  const progress = progressLabel(series.completedCount, series.trackCount, series.type);
  const level = seriesLevel(series.items);
  const done = isFinished(series);
  const count = `${series.items.length} ${series.type === 'course' ? 'modules' : 'parts'}`;
  return (
    <Link className="med-card series-card" to={seriesPath(series.creator, series.name)}>
      <div className="card-art">
        <div className="series-stack" aria-hidden="true" />
        <Cover coverId={series.coverId} title={series.name} creator={series.creator} />
        <CardBadges type={series.type} video={series.hasVideo} shape={shape} />
        {done ? (
          <CardDone />
        ) : (
          <CardProgress done={series.completedCount} total={series.trackCount} />
        )}
      </div>
      <div className="t">{inCreator ? displayName(series.name) : series.name}</div>
      <div className="c">
        {level && <span className={`lvl lvl-${level}`}>{LEVEL_SHORT[level]}</span>}
        {done
          ? 'Done'
          : (progress ??
            (inCreator
              ? count
              : `${series.items.length} ${series.type === 'course' ? 'modules' : m.plural.toLowerCase()} · ${series.creator}`))}
      </div>
    </Link>
  );
}

/** Every part done: a quiet check on the artwork. */
export function CardDone() {
  return (
    <span className="card-done" title="Done">
      <Icon name="check" size={14} /> Done
    </span>
  );
}

export function LibraryPage() {
  const offlineState = useOffline();
  const isAdmin = useAuth().user?.role === 'admin';
  const { favorites } = usePrefs();
  const lib = useApi<LibraryDto>('/api/library');
  useRefreshOn('zenport:progress', () => lib.reload());
  const [q, setQ] = useState('');
  const [creator, setCreator] = useState('');
  const [root, setRoot] = useState('');
  const [format, setFormat] = useState('');
  const [withDocs, setWithDocs] = useState(false);
  // Deep-linked from Today's "All starred".
  const [onlyFavs, setOnlyFavs] = useState(() =>
    new URLSearchParams(window.location.search).has('favorites'),
  );
  const [sort, setSort] = useState<SortKey>('creator');
  const [type, setTypeState] = useState<'all' | ContentType>(() => {
    const t = new URLSearchParams(window.location.search).get('type');
    return (TYPES as readonly string[]).includes(t ?? '') ? (t as ContentType) : 'all';
  });
  const setType = (t: 'all' | ContentType) => {
    setTypeState(t);
    const u = new URL(window.location.href);
    if (t === 'all') u.searchParams.delete('type');
    else u.searchParams.set('type', t);
    window.history.replaceState(null, '', u);
  };
  const [rescanning, setRescanning] = useState(false);
  // Grid by default; a list for scanning long libraries. Remembered here.
  const [view, setViewState] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem('zp-lib-view') === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const setView = (v: 'grid' | 'list') => {
    setViewState(v);
    try {
      localStorage.setItem('zp-lib-view', v);
    } catch {
      /* not remembered - still switches */
    }
  };
  // Set aside from Continue: the server's list, plus this page's own taps
  // (shown at once, before the server answers), and the last one for Undo.
  const [hiddenNow, setHiddenNow] = useState<Set<string>>(new Set());
  const [shownNow, setShownNow] = useState<Set<string>>(new Set());
  const [lastHidden, setLastHidden] = useState<{ key: string; title: string } | null>(null);

  const items = lib.data?.items ?? [];
  const filtersActive =
    q !== '' || creator !== '' || root !== '' || format !== '' || withDocs || onlyFavs;

  const present = useMemo(() => items.filter((i) => !i.missing), [items]);
  const typeCounts = useMemo(() => {
    const m = new Map<ContentType, number>();
    for (const i of present) m.set(i.type, (m.get(i.type) ?? 0) + 1);
    return m;
  }, [present]);
  const hiddenKeys = useMemo(() => {
    const k = new Set(lib.data?.continueHidden ?? []);
    for (const h of hiddenNow) k.add(h);
    for (const sh of shownNow) k.delete(sh);
    return k;
  }, [lib.data, hiddenNow, shownNow]);
  // Courses and series someone is part-way through.
  const continuing = useMemo((): ContinueEntry[] => {
    const { series, singles } = groupSeries(present);
    // Started and not finished: a part ticked done, or a place to pick up from.
    const open = (done: number, total: number) => done > 0 && done < total;
    return [
      ...series
        .filter(
          (s) =>
            open(s.completedCount, s.trackCount) ||
            (s.type !== 'meditation' && s.items.some((i) => i.resumeSec !== null)),
        )
        .map((s) => ({ kind: 'series' as const, s, key: continueSeriesKey(s.creator, s.name) })),
      ...singles
        .filter(
          (i) =>
            i.type !== 'meditation' &&
            (open(i.completedCount, i.trackCount) || i.resumeSec !== null),
        )
        .map((i) => ({ kind: 'item' as const, i, key: `item:${i.id}` })),
    ]
      .filter((e) => !hiddenKeys.has(e.key))
      .slice(0, 16);
  }, [present, hiddenKeys]);

  const hideContinue = (e: ContinueEntry) => {
    setShownNow((s) => {
      const n = new Set(s);
      n.delete(e.key);
      return n;
    });
    setHiddenNow((h) => new Set(h).add(e.key));
    setLastHidden({ key: e.key, title: e.kind === 'series' ? e.s.name : e.i.title });
    void api.put('/api/continue/hidden', { key: e.key }).catch(() => {});
  };
  const undoHide = () => {
    if (!lastHidden) return;
    const key = lastHidden.key;
    setHiddenNow((h) => {
      const n = new Set(h);
      n.delete(key);
      return n;
    });
    setShownNow((s) => new Set(s).add(key));
    setLastHidden(null);
    void api.post('/api/continue/shown', { keys: [key] }).catch(() => {});
  };
  useEffect(() => {
    if (!lastHidden) return;
    const t = window.setTimeout(() => setLastHidden(null), 7000);
    return () => window.clearTimeout(t);
  }, [lastHidden]);

  const filtered = useMemo(() => {
    let out = present;
    if (type !== 'all') out = out.filter((i) => i.type === type);
    if (q) {
      const needle = q.toLowerCase();
      out = out.filter(
        (i) =>
          i.title.toLowerCase().includes(needle) ||
          i.creator.toLowerCase().includes(needle) ||
          (i.collection ?? '').toLowerCase().includes(needle),
      );
    }
    if (creator) out = out.filter((i) => i.creator === creator);
    if (root) out = out.filter((i) => String(i.rootId) === root);
    if (format) out = out.filter((i) => i.formats.includes(format));
    if (withDocs) out = out.filter((i) => i.documentCount > 0);
    if (onlyFavs) out = out.filter((i) => favorites.has(i.id));
    switch (sort) {
      case 'title':
        out = [...out].sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'recent':
        out = [...out].sort((a, b) => b.addedAt.localeCompare(a.addedAt));
        break;
      case 'duration':
        out = [...out].sort((a, b) => (b.totalDurationSec ?? -1) - (a.totalDurationSec ?? -1));
        break;
      case 'level':
        // Beginner first; within a level, the library's own order.
        out = [...out].sort((a, b) => levelRank(a.level) - levelRank(b.level));
        break;
      default:
        break; // server order is creator/title already
    }
    return out;
  }, [present, type, q, creator, root, format, withDocs, onlyFavs, favorites, sort]);
  const grouped = useMemo(() => groupSeries(filtered), [filtered]);

  const missingCount = items.filter((i) => i.missing).length;
  const formats = useMemo(() => [...new Set(items.flatMap((i) => i.formats))].sort(), [items]);
  const [rescanNote, setRescanNote] = useState<string | null>(null);
  const rescan = async () => {
    setRescanning(true);
    setRescanNote(null);
    try {
      await api.post('/api/library/rescan');
    } catch (err) {
      setRescanNote(
        `Rescan could not start - ${err instanceof Error ? err.message : 'the server refused it'}.`,
      );
      setRescanning(false);
      return;
    }
    // The scan runs in the background; give it a moment, then read the result
    // back and SAY what it found, so an empty folder reads as "0 recordings"
    // rather than as a button that did nothing.
    setTimeout(async () => {
      lib.reload();
      const state = await api.get<ScanStateDto>('/api/library/scan-state').catch(() => null);
      if (state) {
        const roots = state.roots
          .map((r) => (r.ok ? r.label : `${r.label} (not readable)`))
          .join(', ');
        setRescanNote(
          state.status === 'scanning'
            ? 'Still scanning - this page will catch up on its next load.'
            : `Scanned ${roots || 'the library'}: ${state.counts.items} ${
                state.counts.items === 1 ? 'recording' : 'recordings'
              }, ${state.counts.tracks} tracks.`,
        );
      }
      setRescanning(false);
    }, 1500);
  };

  if (lib.loading) {
    return (
      <>
        <div className="page-head">
          <h1>Library</h1>
        </div>
        <SkeletonGrid />
      </>
    );
  }
  if (lib.error) {
    return <ErrorNote message={lib.error} onRetry={lib.reload} />;
  }

  const scan = lib.data!.scan;

  return (
    <>
      <div className="page-head">
        <h1>Library</h1>
        <p className="lede">
          {items.length === 0
            ? 'Your mounted folders will appear here.'
            : `${TYPES.filter((t) => typeCounts.get(t))
                .map((t) => {
                  const n = typeCounts.get(t)!;
                  return `${n} ${(n === 1 ? TYPE_META[t].label : TYPE_META[t].plural).toLowerCase()}`;
                })
                .join(' · ')} from ${lib.data!.creators.length} ${
                lib.data!.creators.length === 1 ? 'creator' : 'creators'
              }.`}
        </p>
      </div>

      {present.length > 0 && typeCounts.size > 1 && (
        <div className="type-tabs" role="tablist" aria-label="What to show">
          <button
            role="tab"
            aria-selected={type === 'all'}
            className="type-tab"
            onClick={() => setType('all')}
          >
            All
            <span className="n">{present.length}</span>
          </button>
          {TYPES.filter((t) => typeCounts.get(t)).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={type === t}
              className={`type-tab t-${t}`}
              onClick={() => setType(t)}
            >
              <Icon name={TYPE_META[t].icon} size={16} />
              {TYPE_META[t].plural}
              <span className="n">{typeCounts.get(t)}</span>
            </button>
          ))}
        </div>
      )}

      {scan.warnings.length > 0 && (
        <p className="notice" style={{ marginBottom: 24 }}>
          The last scan had {scan.warnings.length} note{scan.warnings.length > 1 ? 's' : ''} - see
          Settings for details.
        </p>
      )}
      {rescanNote && (
        <p className="notice" style={{ marginBottom: 24 }} role="status">
          {rescanNote}
        </p>
      )}
      {missingCount > 0 && (
        <p className="notice" style={{ marginBottom: 24 }}>
          {missingCount} meditation{missingCount > 1 ? 's are' : ' is'} currently missing from the
          mounted folders. Their history and journals are safe and they will return when the files
          do.
        </p>
      )}

      {items.length === 0 ? (
        <EmptyState
          title="Nothing indexed yet"
          art="empty-library"
          action={
            <button className="btn btn-primary" onClick={() => void rescan()} disabled={rescanning}>
              {rescanning ? 'Scanning…' : 'Scan the library now'}
            </button>
          }
        >
          Mount your meditation folders (read-only) and point ZP_LIBRARY_DIRS at them - ZenPort
          indexes in place and never touches your files. It reads best as a folder per creator,
          holding a folder (or a file) per meditation.
        </EmptyState>
      ) : (
        <>
          {type === 'all' && !filtersActive && (continuing.length > 0 || lastHidden) && (
            <section className="section shelf-continue" aria-labelledby="sec-continue">
              <div className="section-head">
                <h2 id="sec-continue">Continue</h2>
                {lastHidden && (
                  <span className="rail-undo" role="status">
                    Hid <strong>{lastHidden.title}</strong>
                    <button type="button" className="linkish" onClick={undoHide}>
                      Undo
                    </button>
                  </span>
                )}
              </div>
              {continuing.length > 0 ? (
                <Rail label="Continue">
                  {continuing.map((c) => (
                    <ContinueCard key={c.key} entry={c} onHide={hideContinue} />
                  ))}
                </Rail>
              ) : (
                <p className="hint">Nothing left part-way - open anything to pick it back up.</p>
              )}
            </section>
          )}

          {type === 'all' && lib.data!.creators.length > 0 && (
            <section className="section shelf-creators" aria-labelledby="sec-creators">
              <div className="section-head">
                <h2 id="sec-creators">Creators</h2>
                <Link className="see-all" to="/creators">
                  See all {lib.data!.creators.length} <Icon name="chevron-right" size={14} />
                </Link>
              </div>
              <Rail label="Creators">
                {lib.data!.creators.map((c) => (
                  <CreatorBubble key={c.name} creator={c} />
                ))}
              </Rail>
            </section>
          )}

          <section className="section" aria-labelledby="sec-all">
            <div className="section-head">
              <h2 id="sec-all">{type === 'all' ? 'Everything' : TYPE_META[type].plural}</h2>
              <div className="section-actions">
                <div className="view-toggle" role="group" aria-label="Show as">
                  <button
                    type="button"
                    aria-pressed={view === 'grid'}
                    aria-label="Grid"
                    title="Grid"
                    onClick={() => setView('grid')}
                  >
                    <Icon name="grid" size={16} />
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === 'list'}
                    aria-label="List"
                    title="List"
                    onClick={() => setView('list')}
                  >
                    <Icon name="list" size={16} />
                  </button>
                </div>
                <Link className="btn btn-sm btn-quiet" to="/downloads">
                  <Icon name="on-device" size={15} />
                  Offline
                  {offlineState.records.length > 0 ? ` · ${offlineState.records.length}` : ''}
                </Link>
                {isAdmin && (
                  <>
                    <Link className="btn btn-sm btn-quiet" to="/admin/folders">
                      <Icon name="folder" size={15} />
                      Folders
                    </Link>
                    <button
                      className="btn btn-sm btn-quiet"
                      onClick={() => void rescan()}
                      disabled={rescanning}
                    >
                      <Icon name="history" size={15} />
                      {rescanning ? 'Scanning…' : 'Rescan'}
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="toolbar" role="search">
              <input
                className="search"
                type="search"
                placeholder={
                  type === 'all'
                    ? 'Search titles, creators, series…'
                    : `Search ${TYPE_META[type].plural.toLowerCase()}…`
                }
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search the library"
              />
              <select
                value={creator}
                onChange={(e) => setCreator(e.target.value)}
                aria-label="Filter by creator"
              >
                <option value="">All creators</option>
                {lib.data!.creators.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              {scan.roots.length > 1 && (
                <select
                  value={root}
                  onChange={(e) => setRoot(e.target.value)}
                  aria-label="Filter by source"
                >
                  <option value="">All sources</option>
                  {scan.roots.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                aria-label="Filter by format"
              >
                <option value="">All formats</option>
                {formats.map((f) => (
                  <option key={f} value={f}>
                    .{f}
                  </option>
                ))}
              </select>
              <button
                className="chip"
                aria-pressed={withDocs}
                onClick={() => setWithDocs((v) => !v)}
              >
                Has notes
              </button>
              <button
                className="chip"
                aria-pressed={onlyFavs}
                onClick={() => setOnlyFavs((v) => !v)}
              >
                <Icon name="heart" size={14} />
                Favourites
              </button>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort"
              >
                <option value="creator">By creator</option>
                <option value="title">By title</option>
                <option value="recent">Recently added</option>
                <option value="duration">Longest first</option>
                <option value="level">By level, beginner first</option>
              </select>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                title="Nothing matches those filters"
                action={
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setQ('');
                      setCreator('');
                      setRoot('');
                      setFormat('');
                      setWithDocs(false);
                      setOnlyFavs(false);
                    }}
                  >
                    Reset filters
                  </button>
                }
              >
                Try widening the search - everything indexed is still here.
              </EmptyState>
            ) : (
              <>
                {filtersActive && (
                  <p style={{ color: 'var(--faint)', fontSize: 13, marginBottom: 12 }}>
                    {filtered.length} of {items.length - missingCount} shown ·{' '}
                    <button
                      className="btn btn-sm btn-quiet"
                      style={{ display: 'inline-flex', minHeight: 0, padding: '0 4px' }}
                      onClick={() => {
                        setQ('');
                        setCreator('');
                        setRoot('');
                        setFormat('');
                        setWithDocs(false);
                      }}
                    >
                      reset
                    </button>
                  </p>
                )}
                {grouped.series.length > 0 && (
                  <>
                    <h3 className="shelf-title">
                      {type === 'course' ? 'Courses in parts' : 'Series'}
                      <span>{grouped.series.length}</span>
                    </h3>
                    {view === 'grid' ? (
                      <div className="card-grid shelf">
                        {grouped.series.map((sr) => (
                          <SeriesCard
                            key={sr.key}
                            series={sr}
                            structure={seriesStructure(sr, lib.data?.seriesStructures)}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="med-rows shelf">
                        {grouped.series.map((sr) => (
                          <SeriesRow
                            key={sr.key}
                            series={sr}
                            structure={seriesStructure(sr, lib.data?.seriesStructures)}
                          />
                        ))}
                      </div>
                    )}
                    {grouped.singles.length > 0 && (
                      <h3 className="shelf-title">
                        {type === 'all'
                          ? 'Single items'
                          : `Single ${TYPE_META[type].plural.toLowerCase()}`}
                        <span>{grouped.singles.length}</span>
                      </h3>
                    )}
                  </>
                )}
                {view === 'grid' ? (
                  <div className="card-grid">
                    {grouped.singles.map((item) => (
                      <MedCard key={item.id} item={item} />
                    ))}
                  </div>
                ) : (
                  <div className="med-rows">
                    {grouped.singles.map((item) => (
                      <MedRow key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </>
  );
}

export function CreatorMosaic({ coverIds, name }: { coverIds: string[]; name: string }) {
  if (coverIds.length === 0) {
    return <Cover coverId={null} title={name} />;
  }
  if (coverIds.length < 4) {
    return (
      <div className="creator-mosaic single">
        <Cover coverId={coverIds[0]!} title={name} />
      </div>
    );
  }
  return (
    <div className="creator-mosaic">
      {coverIds.slice(0, 4).map((id) => (
        <Cover key={id} coverId={id} title={name} />
      ))}
    </div>
  );
}
