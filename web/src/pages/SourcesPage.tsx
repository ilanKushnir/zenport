import { useState } from 'react';
import type {
  YouTubeClassification,
  YouTubeImportPreviewEntry,
  YouTubeSourceDto,
} from '@zenport/shared';
import { privacyEmbedUrl } from '@zenport/shared';
import { api, ApiError } from '../api.ts';
import { useApi } from '../hooks.ts';
import { EmptyState, ErrorNote, Icon, Sheet } from '../components/ui.tsx';

interface ResolveResult {
  classification: YouTubeClassification;
  meta: { title: string; author: string | null } | null;
  alreadySaved?: boolean;
}

export function SourcesPage() {
  const sources = useApi<YouTubeSourceDto[]>('/api/youtube/sources');
  const tooling = useApi<{ ytdlpAvailable: boolean }>('/api/youtube/tooling');
  const [showAdd, setShowAdd] = useState(false);
  const [playing, setPlaying] = useState<YouTubeSourceDto | null>(null);
  const [editing, setEditing] = useState<YouTubeSourceDto | null>(null);

  const remove = async (s: YouTubeSourceDto) => {
    if (!window.confirm(`Remove “${s.title}” from your sources? (Nothing on YouTube changes.)`))
      return;
    await api.del(`/api/youtube/sources/${s.id}`).catch(() => {});
    sources.reload();
  };

  if (sources.loading) return <div className="skeleton" style={{ height: 200 }} />;
  if (sources.error) return <ErrorNote message={sources.error} onRetry={sources.reload} />;

  const list = sources.data ?? [];
  const collections = new Map<string, YouTubeSourceDto[]>();
  for (const s of list) {
    const key = s.collection ?? '';
    collections.set(key, [...(collections.get(key) ?? []), s]);
  }

  return (
    <>
      <div
        className="page-head"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1>YouTube sources</h1>
          <p className="lede">
            References to meditations you found on YouTube — saved as links with their metadata,
            never downloaded. Your mounted library stays the private, offline heart of ZenPort.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Icon name="plus" /> Add source
        </button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="No saved sources yet"
          action={
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
              Paste a YouTube link
            </button>
          }
        >
          Paste a video link to save it with its title and creator, or import a whole playlist as
          metadata when yt-dlp is configured.
        </EmptyState>
      ) : (
        [...collections.entries()].map(([collection, items]) => (
          <section className="section" key={collection || '(none)'}>
            {collection && (
              <div className="section-head">
                <h2>{collection}</h2>
              </div>
            )}
            <div className="rowlist">
              {items.map((s) => (
                <div className="row" key={s.id}>
                  <Icon name="sources" />
                  <div className="grow">
                    <div>{s.title}</div>
                    <div className="sub">
                      {s.creator ?? 'Unknown creator'}
                      {s.provenance.kind !== 'manual' && ` · from ${s.provenance.kind}`}
                      {s.tags.length > 0 && ` · ${s.tags.join(', ')}`}
                    </div>
                  </div>
                  <button className="btn btn-sm btn-ghost" onClick={() => setPlaying(s)}>
                    Play
                  </button>
                  <a
                    className="btn btn-sm btn-quiet"
                    href={s.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label={`Open ${s.title} on YouTube`}
                  >
                    <Icon name="external" size={15} />
                  </a>
                  <button className="btn btn-sm btn-quiet" onClick={() => setEditing(s)}>
                    Edit
                  </button>
                  <button className="btn btn-sm btn-quiet" onClick={() => void remove(s)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      {showAdd && (
        <AddSourceSheet
          ytdlpAvailable={tooling.data?.ytdlpAvailable ?? false}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            sources.reload();
          }}
        />
      )}
      {playing && <EmbedSheet source={playing} onClose={() => setPlaying(null)} />}
      {editing && (
        <EditSourceSheet
          source={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            sources.reload();
          }}
        />
      )}
    </>
  );
}

function EmbedSheet({ source, onClose }: { source: YouTubeSourceDto; onClose: () => void }) {
  const [consented, setConsented] = useState(false);
  return (
    <Sheet title={source.title} onClose={onClose}>
      {consented ? (
        <iframe
          className="doc-frame"
          style={{ aspectRatio: '16 / 9', height: 'auto', background: '#000' }}
          src={`${privacyEmbedUrl(source.videoId)}?autoplay=1`}
          title={source.title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <>
          <p style={{ color: 'var(--muted)' }}>
            Playing this loads YouTube’s privacy-enhanced player from
            <strong> youtube-nocookie.com</strong> — the one place ZenPort talks to an outside
            service on your behalf. Nothing plays until you choose to.
          </p>
          <div className="form-actions">
            <a
              className="btn btn-ghost"
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              Open on YouTube instead
            </a>
            <button className="btn btn-primary" onClick={() => setConsented(true)}>
              Load the player
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function EditSourceSheet({
  source,
  onClose,
  onSaved,
}: {
  source: YouTubeSourceDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(source.title);
  const [creator, setCreator] = useState(source.creator ?? '');
  const [collection, setCollection] = useState(source.collection ?? '');
  const [tags, setTags] = useState(source.tags.join(', '));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    await api
      .patch(`/api/youtube/sources/${source.id}`, {
        title: title.trim(),
        creator: creator.trim() || null,
        collection: collection.trim() || null,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      })
      .catch(() => {});
    onSaved();
  };

  return (
    <Sheet title="Edit source" onClose={onClose}>
      <div className="field">
        <label htmlFor="es-title">Title</label>
        <input id="es-title" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="es-creator">Creator</label>
          <input id="es-creator" value={creator} onChange={(e) => setCreator(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="es-col">Collection</label>
          <input id="es-col" value={collection} onChange={(e) => setCollection(e.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="es-tags">Tags, comma-separated</label>
        <input id="es-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
      </div>
      <div className="form-actions">
        <button
          className="btn btn-primary"
          disabled={busy || !title.trim()}
          onClick={() => void save()}
        >
          Save
        </button>
      </div>
    </Sheet>
  );
}

function AddSourceSheet({
  ytdlpAvailable,
  onClose,
  onSaved,
}: {
  ytdlpAvailable: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [url, setUrl] = useState('');
  const [resolved, setResolved] = useState<ResolveResult | null>(null);
  const [manualTitle, setManualTitle] = useState('');
  const [manualCreator, setManualCreator] = useState('');
  const [needsManual, setNeedsManual] = useState(false);
  const [collection, setCollection] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    kind: string;
    ref: string;
    entries: YouTubeImportPreviewEntry[];
  } | null>(null);
  const [importResult, setImportResult] = useState<{ added: number; skipped: number } | null>(null);

  const resolve = async () => {
    setBusy(true);
    setError(null);
    setResolved(null);
    setPreview(null);
    try {
      const r = await api.post<ResolveResult>('/api/youtube/resolve', { url });
      setResolved(r);
      if (r.classification.kind === 'invalid') {
        const reasons: Record<string, string> = {
          malformed: 'That does not look like a URL.',
          'unsupported-host': 'Only YouTube links are supported here.',
          'unrecognized-path': 'That YouTube link has nothing ZenPort can save.',
          'bad-video-id': 'That video id looks malformed.',
        };
        setError(reasons[r.classification.reason] ?? 'Unsupported link.');
      } else if (r.classification.kind === 'video') {
        if (r.meta) {
          setManualTitle(r.meta.title);
          setManualCreator(r.meta.author ?? '');
          setNeedsManual(false);
        } else {
          setNeedsManual(true);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not check that link');
    } finally {
      setBusy(false);
    }
  };

  const saveVideo = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/youtube/sources', {
        url,
        title: manualTitle.trim() || undefined,
        creator: manualCreator.trim() || undefined,
        collection: collection.trim() || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setNeedsManual(true);
        setError('YouTube offered no metadata — give it a title yourself.');
      } else if (err instanceof ApiError && err.status === 409) {
        setError('Already saved — it is in your list below.');
      } else {
        setError(err instanceof Error ? err.message : 'could not save');
      }
    } finally {
      setBusy(false);
    }
  };

  const loadPreview = async () => {
    setBusy(true);
    setError(null);
    try {
      const p = await api.post<{ kind: string; ref: string; entries: YouTubeImportPreviewEntry[] }>(
        '/api/youtube/import/preview',
        { url },
      );
      setPreview(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not list that playlist');
    } finally {
      setBusy(false);
    }
  };

  const commitImport = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await api.post<{ added: number; skipped: number }>('/api/youtube/import/commit', {
        kind: preview.kind,
        ref: preview.ref,
        collection: collection.trim() || undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        entries: preview.entries
          .filter((e) => !e.alreadySaved)
          .map((e) => ({ videoId: e.videoId, title: e.title, creator: e.creator })),
      });
      setImportResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'import failed');
    } finally {
      setBusy(false);
    }
  };

  const kind = resolved?.classification.kind;

  return (
    <Sheet title="Add a YouTube source" onClose={onClose}>
      {importResult ? (
        <>
          <p>
            Imported {importResult.added} new source{importResult.added === 1 ? '' : 's'}
            {importResult.skipped > 0 && `, ${importResult.skipped} already saved`}.
          </p>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={onSaved}>
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="ys-url">Video, playlist, or channel URL</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="ys-url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
              />
              <button
                className="btn btn-ghost"
                disabled={busy || !url.trim()}
                onClick={() => void resolve()}
              >
                Check
              </button>
            </div>
          </div>

          {kind === 'video' && resolved && (
            <>
              {resolved.alreadySaved && (
                <p className="notice">This video is already in your sources.</p>
              )}
              <div className="field">
                <label htmlFor="ys-title">
                  Title{needsManual ? ' (metadata unavailable — yours to write)' : ''}
                </label>
                <input
                  id="ys-title"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                />
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="ys-creator">Creator</label>
                  <input
                    id="ys-creator"
                    value={manualCreator}
                    onChange={(e) => setManualCreator(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ys-col">Collection (optional)</label>
                  <input
                    id="ys-col"
                    value={collection}
                    onChange={(e) => setCollection(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="ys-tags">Tags, comma-separated (optional)</label>
                <input id="ys-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
              </div>
              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  disabled={busy || resolved.alreadySaved || !manualTitle.trim()}
                  onClick={() => void saveVideo()}
                >
                  Save source
                </button>
              </div>
            </>
          )}

          {(kind === 'playlist' || kind === 'channel') && !preview && (
            <>
              {ytdlpAvailable ? (
                <>
                  <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
                    A {kind} — ZenPort can list its videos (titles only, via your configured yt-dlp)
                    and let you confirm before anything is saved. No media is downloaded.
                  </p>
                  <div className="form-actions">
                    <button
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => void loadPreview()}
                    >
                      {busy ? 'Listing…' : `List this ${kind}`}
                    </button>
                  </div>
                </>
              ) : (
                <p className="notice">
                  Importing a whole {kind} needs the optional yt-dlp integration, which is not
                  configured on this server (set ZP_YTDLP_PATH). You can still save individual
                  videos one by one.
                </p>
              )}
            </>
          )}

          {preview && (
            <>
              <p style={{ color: 'var(--muted)', marginBottom: 12 }}>
                {preview.entries.length} videos found ·{' '}
                {preview.entries.filter((e) => e.alreadySaved).length} already saved. Import the
                rest?
              </p>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="yp-col">Save into collection (optional)</label>
                  <input
                    id="yp-col"
                    value={collection}
                    onChange={(e) => setCollection(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="yp-tags">Tags (optional)</label>
                  <input id="yp-tags" value={tags} onChange={(e) => setTags(e.target.value)} />
                </div>
              </div>
              <div
                className="rowlist"
                style={{ maxHeight: 240, overflowY: 'auto', marginBottom: 16 }}
              >
                {preview.entries.map((e) => (
                  <div className="row" key={e.videoId}>
                    <div className="grow">
                      <div style={{ fontSize: 14 }}>{e.title}</div>
                      <div className="sub">{e.creator ?? ''}</div>
                    </div>
                    {e.alreadySaved && <span className="badge">saved</span>}
                  </div>
                ))}
              </div>
              <div className="form-actions">
                <button className="btn btn-quiet" onClick={() => setPreview(null)}>
                  Back
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy || preview.entries.every((e) => e.alreadySaved)}
                  onClick={() => void commitImport()}
                >
                  {busy
                    ? 'Importing…'
                    : `Import ${preview.entries.filter((e) => !e.alreadySaved).length} videos`}
                </button>
              </div>
            </>
          )}

          {error && <p className="error-note">{error}</p>}
        </>
      )}
    </Sheet>
  );
}
