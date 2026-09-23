import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { LibraryDto, MeditationSummaryDto } from '@zenport/shared';
import { formatDuration } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { usePrefs } from '../prefs.tsx';
import { Cover, EmptyState, ErrorNote, Icon, SkeletonGrid } from '../components/ui.tsx';

type SortKey = 'creator' | 'title' | 'recent' | 'duration';

export function MedCard({ item }: { item: MeditationSummaryDto }) {
  const { isFavorite, toggleFavorite } = usePrefs();
  const starred = isFavorite(item.id);
  return (
    <Link className="med-card" to={`/m/${item.id}`}>
      <Cover coverId={item.coverId} title={item.title} creator={item.creator} />
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

export function LibraryPage() {
  const { favorites } = usePrefs();
  const lib = useApi<LibraryDto>('/api/library');
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
  const [rescanning, setRescanning] = useState(false);

  const items = lib.data?.items ?? [];
  const filtersActive =
    q !== '' || creator !== '' || root !== '' || format !== '' || withDocs || onlyFavs;

  const filtered = useMemo(() => {
    let out = items.filter((i) => !i.missing);
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
  }, [items, q, creator, root, format, withDocs, onlyFavs, favorites, sort]);

  const missingCount = items.filter((i) => i.missing).length;
  const formats = useMemo(() => [...new Set(items.flatMap((i) => i.formats))].sort(), [items]);
  const rescan = async () => {
    setRescanning(true);
    await api.post('/api/library/rescan').catch(() => {});
    setTimeout(() => {
      lib.reload();
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
            ? 'Your mounted meditation folders will appear here.'
            : `${items.length - missingCount} meditations from ${lib.data!.creators.length} ${
                lib.data!.creators.length === 1 ? 'creator' : 'creators'
              }, straight from your own files.`}
        </p>
      </div>

      {scan.warnings.length > 0 && (
        <p className="notice" style={{ marginBottom: 24 }}>
          The last scan had {scan.warnings.length} note{scan.warnings.length > 1 ? 's' : ''} - see
          Settings for details.
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
          indexes in place and never touches your files.
        </EmptyState>
      ) : (
        <>
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
                    {c.itemCount} meditation{c.itemCount > 1 ? 's' : ''}
                  </div>
                </Link>
              ))}
            </div>
          </section>

          <section className="section" aria-labelledby="sec-all">
            <div className="section-head">
              <h2 id="sec-all">All meditations</h2>
              <button
                className="btn btn-sm btn-quiet"
                onClick={() => void rescan()}
                disabled={rescanning}
              >
                {rescanning ? 'Scanning…' : 'Rescan'}
              </button>
            </div>

            <div className="toolbar" role="search">
              <input
                className="search"
                type="search"
                placeholder="Search titles, creators, collections…"
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
                <div className="card-grid">
                  {filtered.map((item) => (
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
