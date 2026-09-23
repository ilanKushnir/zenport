import { useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { DocumentDto, MeditationDetailDto, PlanDto } from '@zenport/shared';
import { formatClock, formatDuration } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { Cover, EmptyState, ErrorNote, Icon, Sheet } from '../components/ui.tsx';
import { usePlayer } from '../player/PlayerProvider.tsx';
import { MedCard } from './LibraryPage.tsx';

export function ItemPage() {
  const { id = '' } = useParams();
  const detail = useApi<MeditationDetailDto>(`/api/items/${id}`);
  const player = usePlayer();
  const [showEvidence, setShowEvidence] = useState(false);
  const [showPlanSheet, setShowPlanSheet] = useState(false);
  const [openDoc, setOpenDoc] = useState<DocumentDto | null>(null);

  if (detail.loading) {
    return (
      <div className="detail-grid">
        <div className="skeleton" style={{ aspectRatio: 1 }} />
        <div>
          <div className="skeleton" style={{ width: '55%', height: 32 }} />
          <div className="skeleton" style={{ width: '30%', marginTop: 12 }} />
        </div>
      </div>
    );
  }
  if (detail.error || !detail.data) {
    return <ErrorNote message={detail.error ?? 'not found'} onRetry={detail.reload} />;
  }
  const item = detail.data;
  const resumeTrack = item.resume ? item.tracks.find((t) => t.id === item.resume?.trackId) : null;

  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb" style={{ marginBottom: 20 }}>
        <Link to="/">Library</Link>
        <span className="sep">/</span>
        <Link to={`/creators/${encodeURIComponent(item.creator)}`}>{item.creator}</Link>
        {item.collection && (
          <>
            <span className="sep">/</span>
            <span>{item.collection}</span>
          </>
        )}
        <span className="sep">/</span>
        <span aria-current="page">{item.title}</span>
      </nav>

      <div className="detail-grid">
        <div className="detail-cover">
          <Cover coverId={item.coverId} title={item.title} creator={item.creator} />
        </div>

        <div className="detail-body">
          <p className="eyebrow">
            <Link to={`/creators/${encodeURIComponent(item.creator)}`}>{item.creator}</Link>
            {item.collection ? ` · ${item.collection}` : ''}
          </p>
          <h1 className="detail-title">{item.title}</h1>
          <p className="detail-facts">
            {item.totalDurationSec ? <span>{formatDuration(item.totalDurationSec)}</span> : null}
            {item.trackCount > 1 ? <span>{item.trackCount} tracks</span> : null}
            {item.documentCount > 0 ? (
              <span>
                {item.documentCount} note{item.documentCount === 1 ? '' : 's'}
              </span>
            ) : null}
          </p>

          {item.missing ? (
            <p className="notice" style={{ marginTop: 16 }}>
              These files are currently missing from the mounted library. Your history and journal
              entries for this meditation are untouched and it will come back when the files do.
            </p>
          ) : (
            <div className="detail-actions">
              <button className="btn btn-primary btn-lg" onClick={() => player.start(item)}>
                <Icon name="play" /> Begin practice
              </button>
              {resumeTrack && item.resume && item.resume.positionSec > 10 && (
                <button
                  className="btn btn-ghost"
                  onClick={() =>
                    player.start(item, {
                      trackId: item.resume!.trackId,
                      resumeSec: item.resume!.positionSec,
                    })
                  }
                >
                  <Icon name="history" size={16} /> Resume{' '}
                  {item.trackCount > 1 ? `${resumeTrack.title} ` : ''}at{' '}
                  {formatClock(item.resume.positionSec)}
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => setShowPlanSheet(true)}>
                <Icon name="plans" size={16} /> Add to a plan
              </button>
            </div>
          )}

          <section className="section" aria-labelledby="sec-tracks">
            <div className="section-head">
              <h2 id="sec-tracks">{item.trackCount > 1 ? 'Tracks' : 'Audio'}</h2>
            </div>
            <div className="rowlist">
              {item.tracks.map((t) => (
                <div className="row" key={t.id}>
                  <span className="num">{t.ord}</span>
                  <div className="grow">
                    <div>{t.title}</div>
                    <div className="sub">
                      .{t.ext}
                      {t.durationSec ? ` · ${formatClock(t.durationSec)}` : ''}
                      {t.missing ? ' · missing' : ''}
                    </div>
                  </div>
                  {!t.missing && !item.missing && (
                    <button
                      className="icon-btn"
                      aria-label={`Play ${t.title}`}
                      onClick={() => player.start(item, { trackId: t.id })}
                    >
                      <Icon name="play" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {item.documents.length > 0 && (
            <section className="section" aria-labelledby="sec-docs">
              <div className="section-head">
                <h2 id="sec-docs">Companion notes</h2>
              </div>
              <div className="rowlist">
                {item.documents.map((d) => (
                  <div className="row" key={d.id}>
                    <Icon name="doc" />
                    <div className="grow">
                      <div>{d.name}</div>
                      <div className="sub">
                        {d.kind}
                        {d.missing ? ' · missing' : ''}
                      </div>
                    </div>
                    {!d.missing && (
                      <>
                        <button className="btn btn-sm btn-ghost" onClick={() => setOpenDoc(d)}>
                          Read
                        </button>
                        <a
                          className="btn btn-sm btn-quiet"
                          href={`/api/media/asset/${d.id}?download=1`}
                          download
                        >
                          Download
                        </a>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <details className="about">
            <summary>About this recording</summary>
            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>Source</dt>
              <dd>{item.rootLabel}</dd>
              <dt>Indexed at</dt>
              <dd>{item.breadcrumbs.join(' / ')}</dd>
              <dt>Formats</dt>
              <dd>{item.formats.map((f) => `.${f}`).join(', ') || '-'}</dd>
            </dl>
            <button
              className="btn btn-sm btn-quiet"
              style={{ marginTop: 8 }}
              onClick={() => setShowEvidence(true)}
            >
              Why ZenPort read it this way
            </button>
          </details>

          {item.related.length > 0 && (
            <section className="section" aria-labelledby="sec-related">
              <div className="section-head">
                <h2 id="sec-related">More from {item.creator}</h2>
              </div>
              <div className="card-grid">
                {item.related.slice(0, 4).map((r) => (
                  <MedCard key={r.id} item={r} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {showEvidence && (
        <Sheet title="How this was indexed" onClose={() => setShowEvidence(false)}>
          <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
            ZenPort infers structure from folders alone - no AI, no guessing services. Each decision
            below names the rule and the evidence.
          </p>
          <div className="rowlist">
            {item.evidence.map((d, i) => (
              <div className="row" key={i}>
                <div className="grow">
                  <div>
                    <span className="badge badge-lav">{d.field}</span>{' '}
                    <strong style={{ fontWeight: 500 }}>{d.value}</strong>
                  </div>
                  <div className="sub">{d.evidence}</div>
                </div>
              </div>
            ))}
          </div>
        </Sheet>
      )}

      {showPlanSheet && (
        <AddToPlanSheet meditationId={item.id} onClose={() => setShowPlanSheet(false)} />
      )}

      {openDoc && <DocReaderSheet doc={openDoc} onClose={() => setOpenDoc(null)} />}
    </>
  );
}

function AddToPlanSheet({ meditationId, onClose }: { meditationId: string; onClose: () => void }) {
  const plans = useApi<PlanDto[]>('/api/plans');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const addToExisting = async (plan: PlanDto) => {
    setBusy(true);
    await api
      .patch(`/api/plans/${plan.id}`, {
        meditationIds: [...new Set([...plan.meditationIds, meditationId])],
      })
      .catch(() => {});
    setDone(`Added to “${plan.name}”.`);
    setBusy(false);
  };

  const createNew = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const today = new Date().toISOString().slice(0, 10);
    await api
      .post('/api/plans', {
        name: newName.trim(),
        startDate: today,
        daysOfWeek: [],
        meditationIds: [meditationId],
      })
      .catch(() => {});
    setDone(`Created “${newName.trim()}” starting today.`);
    setBusy(false);
  };

  const active = (plans.data ?? []).filter((p) => p.status === 'active');

  return (
    <Sheet title="Add to a plan" onClose={onClose}>
      {done ? (
        <>
          <p>{done}</p>
          <div className="form-actions">
            <Link className="btn btn-ghost" to="/plans" onClick={onClose}>
              Open plans
            </Link>
            <button className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          {active.length > 0 && (
            <div className="rowlist" style={{ marginBottom: 20 }}>
              {active.map((p) => (
                <div className="row" key={p.id}>
                  <div className="grow">
                    <div>{p.name}</div>
                    <div className="sub">
                      {p.daysOfWeek.length === 0 ? 'daily' : `${p.daysOfWeek.length} days a week`}
                    </div>
                  </div>
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={busy || p.meditationIds.includes(meditationId)}
                    onClick={() => void addToExisting(p)}
                  >
                    {p.meditationIds.includes(meditationId) ? 'Already in' : 'Add'}
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="field">
            <label htmlFor="np-name">Or start a new plan with this meditation</label>
            <input
              id="np-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Mornings with breath"
            />
          </div>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              disabled={busy || !newName.trim()}
              onClick={() => void createNew()}
            >
              Create plan
            </button>
          </div>
        </>
      )}
    </Sheet>
  );
}

function DocReaderSheet({ doc, onClose }: { doc: DocumentDto; onClose: () => void }) {
  const isText = doc.kind === 'text' || doc.kind === 'markdown';
  const text = useApi<{ kind: string; content: string }>(
    isText ? `/api/media/doc/${doc.id}/text` : null,
  );

  let body: ReactNode;
  if (doc.kind === 'pdf') {
    body = (
      <>
        <iframe className="doc-frame" src={`/api/media/asset/${doc.id}`} title={doc.name} />
        <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 8 }}>
          If the viewer stays blank, this browser has no built-in PDF viewer -{' '}
          <a href={`/api/media/asset/${doc.id}?download=1`} download>
            download it instead
          </a>
          .
        </p>
      </>
    );
  } else if (doc.kind === 'html') {
    body = (
      <>
        {/* Sandboxed on both sides: iframe sandbox + server CSP sandbox header. */}
        <iframe
          className="doc-frame"
          src={`/api/media/asset/${doc.id}`}
          title={doc.name}
          sandbox=""
        />
        <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 8 }}>
          Shown in a sealed frame: scripts and outside requests are blocked.
        </p>
      </>
    );
  } else if (text.loading) {
    body = <div className="skeleton" style={{ height: 120 }} />;
  } else if (text.error) {
    body = <ErrorNote message={text.error} onRetry={text.reload} />;
  } else {
    body = (
      <div className={`doc-reader ${doc.kind}`} style={{ padding: 24 }}>
        {doc.kind === 'markdown' ? (
          <MarkdownLite text={text.data?.content ?? ''} />
        ) : (
          <pre>{text.data?.content}</pre>
        )}
      </div>
    );
  }

  return (
    <Sheet title={doc.name} onClose={onClose}>
      {body}
    </Sheet>
  );
}

/**
 * Deliberately tiny Markdown renderer: headings, emphasis-free paragraphs,
 * lists, and quotes rendered as React text nodes — no HTML ever injected.
 */
function MarkdownLite({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flushList = (key: number) => {
    if (list.length > 0) {
      blocks.push(
        <ul key={`ul-${key}`}>
          {list.map((li, i) => (
            <li key={i}>{li}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  text.split(/\r?\n/).forEach((line, i) => {
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const li = line.match(/^\s*[-*]\s+(.*)$/);
    if (li) {
      list.push(li[1] ?? '');
      return;
    }
    flushList(i);
    if (h) {
      const level = (h[1] ?? '#').length;
      const content = h[2] ?? '';
      blocks.push(
        level === 1 ? (
          <h1 key={i} style={{ fontSize: 22 }}>
            {content}
          </h1>
        ) : level === 2 ? (
          <h2 key={i}>{content}</h2>
        ) : (
          <h3 key={i}>{content}</h3>
        ),
      );
    } else if (line.startsWith('>')) {
      blocks.push(
        <blockquote
          key={i}
          style={{
            margin: '0.6em 0',
            paddingInlineStart: 14,
            borderInlineStart: '2px solid var(--border)',
            color: 'var(--muted)',
          }}
        >
          {line.replace(/^>\s?/, '')}
        </blockquote>,
      );
    } else if (line.trim() !== '') {
      blocks.push(
        <p key={i} style={{ margin: '0.6em 0' }}>
          {line}
        </p>,
      );
    }
  });
  flushList(-1);
  return blocks.length > 0 ? <>{blocks}</> : <EmptyState title="This document is empty" />;
}
