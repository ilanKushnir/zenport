import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ContentType, LibraryDto, MeditationSummaryDto, ScanStateDto } from '@zenport/shared';
import { isPracticeType, seriesFavoriteKey, type ItemLevel } from '@zenport/shared';
import { useOffline } from '../offline.ts';
import { useAuth } from '../App.tsx';
import { api } from '../api.ts';
import { useApi, useRefreshOn } from '../hooks.ts';
import { usePrefs } from '../prefs.tsx';
import { Cover, EmptyState, ErrorNote, Icon, SkeletonGrid, Switch } from '../components/ui.tsx';
import {
  FilterBar,
  sortableOf,
  sortBy,
  TYPE_CHOICE_LABEL,
  type SortKey,
} from '../components/FilterBar.tsx';
import {
  continueSeriesKey,
  ContinueCard,
  CreatorBubble,
  FavButton,
  MedRow,
  subtitle,
  Rail,
  SeriesRow,
  type ContinueEntry,
} from '../components/Shelves.tsx';
import {
  displayName,
  groupSeries,
  isFinished,
  LEVEL_SHORT,
  progressLabel,
  seriesLevel,
  seriesPath,
  seriesStructure,
  TYPE_META,
  TYPES,
  type Series,
} from '../content.ts';

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
        {subtitle(item, !!inCreator, TYPE_META[item.type].parts)}
      </div>
    </Link>
  );
}

/** Type pill (and a video mark) over a cover's corner. Meditation, the default, goes unlabelled. */
/**
 * Several meditations together are a pack; a pack meant as a path, a step
 * at a time, says "In order" instead (internally a 'programme').
 */
export type Shape = 'programme' | 'pack' | 'collection';
export const SHAPE_LABEL: Record<Shape, string> = {
  programme: 'In order',
  pack: 'Pack',
  collection: 'Pack',
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
  /** In order or any order (an admin's word may differ from the names'). */
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
      <FavButton id={seriesFavoriteKey(series.creator, series.name)} label={series.name} />
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
  const [creator, setCreator] = useState('');
  const [root, setRoot] = useState('');
  const [format, setFormat] = useState('');
  const [withDocs, setWithDocs] = useState(false);
  // Deep-linked from Today's "All starred".
  const [onlyFavs, setOnlyFavs] = useState(() =>
    new URLSearchParams(window.location.search).has('favorites'),
  );
  const [sort, setSort] = useState<SortKey>('suggested');
  const [level, setLevel] = useState<ItemLevel | 'all-levels'>('all-levels');
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
  const clearFilters = () => {
    setType('all');
    setLevel('all-levels');
    setSort('suggested');
    setCreator('');
    setRoot('');
    setFormat('');
    setWithDocs(false);
    setOnlyFavs(false);
  };
  const filtersActive =
    creator !== '' ||
    root !== '' ||
    format !== '' ||
    withDocs ||
    onlyFavs ||
    level !== 'all-levels';

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
    if (level !== 'all-levels') out = out.filter((i) => i.level === level);
    if (creator) out = out.filter((i) => i.creator === creator);
    if (root) out = out.filter((i) => String(i.rootId) === root);
    if (format) out = out.filter((i) => i.formats.includes(format));
    if (withDocs) out = out.filter((i) => i.documentCount > 0);
    // A series starred as a whole brings all its parts (shown as the series).
    if (onlyFavs)
      out = out.filter(
        (i) =>
          favorites.has(i.id) ||
          (!!i.collection && favorites.has(seriesFavoriteKey(i.creator, i.collection))),
      );
    out = sortBy(out, sort, sortableOf);
    return out;
  }, [present, type, level, creator, root, format, withDocs, onlyFavs, favorites, sort]);
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

            <FilterBar
              filters={[
                {
                  key: 'type',
                  label: 'Type',
                  value: type,
                  choices: [
                    { value: 'all', label: 'All types' },
                    ...TYPES.filter((t) => typeCounts.get(t)).map((t) => ({
                      value: t,
                      label: TYPE_CHOICE_LABEL[t],
                      n: typeCounts.get(t),
                    })),
                  ],
                  onChange: (v) => setType(v as 'all' | ContentType),
                },
                {
                  key: 'level',
                  label: 'Level',
                  value: level,
                  choices: [
                    { value: 'all-levels', label: 'Every level' },
                    ...(['beginner', 'intermediate', 'advanced', 'all'] as ItemLevel[])
                      .filter((l) => present.some((i) => i.level === l))
                      .map((l) => ({
                        value: l,
                        label: LEVEL_SHORT[l],
                        n: present.filter((i) => i.level === l).length,
                      })),
                  ],
                  onChange: (v) => setLevel(v as ItemLevel | 'all-levels'),
                },
              ]}
              sort={sort}
              onSort={setSort}
              more={
                <>
                  <label className="fb-field">
                    Creator
                    <select value={creator} onChange={(e) => setCreator(e.target.value)}>
                      <option value="">All creators</option>
                      {lib.data!.creators.map((c) => (
                        <option key={c.name} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {scan.roots.length > 1 && (
                    <label className="fb-field">
                      Library
                      <select value={root} onChange={(e) => setRoot(e.target.value)}>
                        <option value="">All libraries</option>
                        {scan.roots.map((r) => (
                          <option key={r.id} value={String(r.id)}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {formats.length > 1 && (
                    <label className="fb-field">
                      Format
                      <select value={format} onChange={(e) => setFormat(e.target.value)}>
                        <option value="">All formats</option>
                        {formats.map((f) => (
                          <option key={f} value={f}>
                            .{f}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="fb-switch">
                    <span>Favourites only</span>
                    <Switch checked={onlyFavs} onChange={setOnlyFavs} label="Favourites only" />
                  </div>
                  <div className="fb-switch">
                    <span>With notes or guides</span>
                    <Switch
                      checked={withDocs}
                      onChange={setWithDocs}
                      label="With notes or guides"
                    />
                  </div>
                </>
              }
              moreActive={
                [creator, root, format].filter(Boolean).length +
                (onlyFavs ? 1 : 0) +
                (withDocs ? 1 : 0)
              }
              onClear={clearFilters}
              view={view}
              onView={setView}
            />

            {filtered.length === 0 ? (
              <EmptyState
                title="Nothing matches those filters"
                action={
                  <button className="btn btn-ghost" onClick={clearFilters}>
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
                      onClick={clearFilters}
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
