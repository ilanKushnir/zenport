import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ContentType, LibraryDto, MeditationSummaryDto, ScanStateDto } from '@zenport/shared';
import { formatDuration } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi, useRefreshOn } from '../hooks.ts';
import { usePrefs } from '../prefs.tsx';
import { Cover, EmptyState, ErrorNote, Icon, SkeletonGrid } from '../components/ui.tsx';
import {
  groupSeries,
  progressLabel,
  seriesPath,
  TYPE_META,
  TYPES,
  type Series,
} from '../content.ts';

type SortKey = 'creator' | 'title' | 'recent' | 'duration';

export function MedCard({ item }: { item: MeditationSummaryDto }) {
  const { isFavorite, toggleFavorite } = usePrefs();
  const starred = isFavorite(item.id);
  return (
    <Link className="med-card" to={`/m/${item.id}`}>
      <div className="card-art">
        <Cover coverId={item.coverId} title={item.title} creator={item.creator} />
        <CardBadges type={item.type} video={item.hasVideo} />
        <CardProgress done={item.completedCount} total={item.trackCount} />
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
      <div className="t">{item.title}</div>
      <div className="c">
        {item.creator}
        {item.totalDurationSec ? ` · ${formatDuration(item.totalDurationSec)}` : ''}
      </div>
    </Link>
  );
}

/** Type pill (and a video mark) over a cover's corner. Meditation, the default, goes unlabelled. */
export function CardBadges({ type, video }: { type: ContentType; video: boolean }) {
  if (type === 'meditation' && !video) return null;
  return (
    <span className="card-badges" aria-hidden="true">
      {type !== 'meditation' && (
        <span className={`card-badge t-${type}`}>
          <Icon name={TYPE_META[type].icon} size={13} />
          {TYPE_META[type].label}
        </span>
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
export function SeriesCard({ series }: { series: Series }) {
  const m = TYPE_META[series.type];
  const progress = progressLabel(series.completedCount, series.trackCount, series.type);
  return (
    <Link className="med-card series-card" to={seriesPath(series.creator, series.name)}>
      <div className="card-art">
        <div className="series-stack" aria-hidden="true" />
        <Cover coverId={series.coverId} title={series.name} creator={series.creator} />
        <CardBadges type={series.type} video={series.hasVideo} />
        <CardProgress done={series.completedCount} total={series.trackCount} />
      </div>
      <div className="t">{series.name}</div>
      <div className="c">
        {progress ??
          `${series.items.length} ${series.type === 'course' ? 'modules' : m.plural.toLowerCase()} · ${series.creator}`}
      </div>
    </Link>
  );
}

export function LibraryPage() {
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

  const items = lib.data?.items ?? [];
  const filtersActive =
    q !== '' || creator !== '' || root !== '' || format !== '' || withDocs || onlyFavs;

  const present = useMemo(() => items.filter((i) => !i.missing), [items]);
  const typeCounts = useMemo(() => {
    const m = new Map<ContentType, number>();
    for (const i of present) m.set(i.type, (m.get(i.type) ?? 0) + 1);
    return m;
  }, [present]);
  // Courses and series someone is part-way through.
  const continuing = useMemo(() => {
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
        .map((s) => ({ kind: 'series' as const, s })),
      ...singles
        .filter(
          (i) =>
            i.type !== 'meditation' &&
            (open(i.completedCount, i.trackCount) || i.resumeSec !== null),
        )
        .map((i) => ({ kind: 'item' as const, i })),
    ].slice(0, 8);
  }, [present]);

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
          {type === 'all' && !filtersActive && continuing.length > 0 && (
            <section className="section" aria-labelledby="sec-continue">
              <div className="section-head">
                <h2 id="sec-continue">Continue</h2>
              </div>
              <div className="card-grid">
                {continuing.map((c) =>
                  c.kind === 'series' ? (
                    <SeriesCard key={c.s.key} series={c.s} />
                  ) : (
                    <MedCard key={c.i.id} item={c.i} />
                  ),
                )}
              </div>
            </section>
          )}

          {type === 'all' && (
            <section className="section" aria-labelledby="sec-creators">
              <div className="section-head">
                <h2 id="sec-creators">Creators</h2>
              </div>
              <div className="card-grid">
                {lib.data!.creators.map((c) => (
                  <Link
                    key={c.name}
                    className="med-card"
                    to={`/creators/${encodeURIComponent(c.name)}`}
                  >
                    <CreatorMosaic coverIds={c.coverIds} name={c.name} />
                    <div className="t">{c.name}</div>
                    <div className="c">
                      {c.itemCount} item{c.itemCount > 1 ? 's' : ''}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="section" aria-labelledby="sec-all">
            <div className="section-head">
              <h2 id="sec-all">{type === 'all' ? 'Everything' : TYPE_META[type].plural}</h2>
              <div className="section-actions">
                <Link className="btn btn-sm btn-quiet" to="/library/folders">
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
                    <div className="card-grid shelf">
                      {grouped.series.map((sr) => (
                        <SeriesCard key={sr.key} series={sr} />
                      ))}
                    </div>
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
                <div className="card-grid">
                  {grouped.singles.map((item) => (
                    <MedCard key={item.id} item={item} />
                  ))}
                </div>
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
