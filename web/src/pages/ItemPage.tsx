import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { DocumentDto, MeditationDetailDto, PlanDto } from '@zenport/shared';
import { PRACTICE_RESUME_MINUTES, formatClock, formatDuration } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi, useRefreshOn } from '../hooks.ts';
import { Cover, EmptyState, ErrorNote, Icon, Sheet } from '../components/ui.tsx';
import { DoneTick, doneWords } from '../components/DoneTick.tsx';
import { TrackOrderEditor } from '../components/TrackOrderEditor.tsx';
import { continueSeriesKey } from '../components/Shelves.tsx';
import { usePlayer } from '../player/PlayerProvider.tsx';
import { MedCard } from './LibraryPage.tsx';
import { useAuth } from '../App.tsx';
import { TypeMenu } from '../components/TypeSheet.tsx';
import { ActionTile } from '../components/ActionTile.tsx';
import { OfflineTile } from '../components/OfflineButton.tsx';
import { SitTogetherSheet, ago } from '../social.tsx';
import { TimesPractised } from '../components/TimesPractised.tsx';
import { LEVEL_LABEL, progressLabel, seriesPath, TYPE_META } from '../content.ts';
import { ItemAbout } from '../components/ItemAbout.tsx';

export function ItemPage() {
  const { id = '' } = useParams();
  const detail = useApi<MeditationDetailDto>(`/api/items/${id}`);
  useRefreshOn('zenport:progress', () => detail.reload());
  // Opening something set aside from the Library's Continue row brings it back.
  const openedCreator = detail.data?.creator;
  const openedSeries = detail.data?.collection;
  useEffect(() => {
    if (openedCreator === undefined) return;
    void api
      .post('/api/continue/shown', {
        keys: [`item:${id}`, continueSeriesKey(openedCreator, openedSeries ?? '')],
      })
      .catch(() => {});
  }, [id, openedCreator, openedSeries]);
  const player = usePlayer();
  const [showEvidence, setShowEvidence] = useState(false);
  const [showPlanSheet, setShowPlanSheet] = useState(false);
  const [openDoc, setOpenDoc] = useState<DocumentDto | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [sitTogether, setSitTogether] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [reordering, setReordering] = useState(false);
  const { user } = useAuth();
  const lib = useApi<{ items: { id: string; creator: string; collection: string | null }[] }>(
    '/api/library',
  );

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
  const meta = TYPE_META[item.type];
  const learning = item.type === 'course' || item.type === 'talk';
  const nextTrack = item.tracks.find((t) => !t.completed && !t.missing);
  const doneCount = item.tracks.filter((t) => t.completed).length;
  const seriesSize = item.collection
    ? (lib.data?.items ?? []).filter(
        (i) => i.creator === item.creator && i.collection === item.collection,
      ).length
    : 0;
  const setRole = async (trackId: string, role: 'lesson' | 'practice') => {
    await api.put(`/api/tracks/${trackId}/role`, { role }).catch(() => {});
    detail.reload();
  };
  // Through the player, so a lesson that is playing right now shows the change too.
  const toggleDone = async (trackId: string, completed: boolean) => {
    await player.setTrackDone(trackId, completed).catch(() => {});
    detail.reload();
  };
  // Where this person left off: the server only reports a place that is past
  // the opening seconds, short of the end, and on a part not yet ticked done.
  const resumeAt = item.resume && resumeTrack && !resumeTrack.missing ? item.resume : null;
  const hasProgress = !!resumeAt || doneCount > 0;
  const Part = meta.part[0]!.toUpperCase() + meta.part.slice(1);
  // Lessons pick up where they stopped, then at the first unfinished one; a
  // practice begins at the top (with Resume offered beside it).
  const begin = () => {
    if (resumeAt) {
      player.start(item, { trackId: resumeAt.trackId, resumeSec: resumeAt.positionSec });
    } else if (learning && nextTrack && doneCount > 0) {
      player.start(item, { trackId: nextTrack.id });
    } else {
      player.start(item);
    }
  };
  const startOver = async () => {
    setResetting(true);
    // Stop without saving first, or the player's last save would put the place back.
    if (player.item?.id === item.id) player.stop('abandon', { forget: true });
    await api.del(`/api/items/${item.id}/progress`).catch(() => {});
    setResetting(false);
    setConfirmReset(false);
    window.dispatchEvent(new Event('zenport:progress'));
    detail.reload();
  };
  const beginLabel =
    !learning && resumeAt
      ? `Resume at ${formatClock(resumeAt.positionSec)}`
      : learning && resumeAt
        ? item.trackCount > 1 && resumeTrack
          ? `Continue · ${Part} ${resumeTrack.ord} at ${formatClock(resumeAt.positionSec)}`
          : `Continue at ${formatClock(resumeAt.positionSec)}`
        : item.type === 'course'
          ? doneCount === 0
            ? 'Start the course'
            : nextTrack
              ? `Continue · ${Part} ${nextTrack.ord}`
              : 'Watch again'
          : item.type === 'talk'
            ? item.hasVideo
              ? 'Watch'
              : 'Listen'
            : item.type === 'soundscape'
              ? 'Play'
              : 'Begin practice';

  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb" style={{ marginBottom: 20 }}>
        <Link to="/">Library</Link>
        <span className="sep">/</span>
        <Link to={`/creators/${encodeURIComponent(item.creator)}`}>{item.creator}</Link>
        {item.collection && (
          <>
            <span className="sep">/</span>
            {seriesSize > 1 ? (
              <Link to={seriesPath(item.creator, item.collection)}>{item.collection}</Link>
            ) : (
              <span>{item.collection}</span>
            )}
          </>
        )}
        <span className="sep">/</span>
        <span aria-current="page">{item.title}</span>
      </nav>

      <div className="detail-grid">
        <div className="detail-cover">
          <Cover coverId={item.coverId} title={item.title} creator={item.creator} size={640} />
        </div>

        <div className="detail-body">
          <div className="type-line">
            <TypeMenu
              itemId={item.id}
              current={item.type}
              auto={item.typeSource === 'auto'}
              hasVideo={item.hasVideo}
              seriesSize={seriesSize}
              editable={user?.role === 'admin'}
              onSaved={() => {
                detail.reload();
                lib.reload();
              }}
            />
          </div>
          <p className="eyebrow">
            <Link to={`/creators/${encodeURIComponent(item.creator)}`}>{item.creator}</Link>
            {item.collection ? ` · ${item.collection}` : ''}
          </p>
          <h1 className="detail-title">{item.title}</h1>
          <p className="detail-facts">
            {item.totalDurationSec ? <span>{formatDuration(item.totalDurationSec)}</span> : null}
            {item.trackCount > 1 ? (
              <span>
                {progressLabel(doneCount, item.trackCount, item.type) ??
                  `${item.trackCount} ${meta.parts}`}
              </span>
            ) : null}
            {item.documentCount > 0 ? (
              <span>
                {item.documentCount} note{item.documentCount === 1 ? '' : 's'}
              </span>
            ) : null}
            {item.level ? <span>{LEVEL_LABEL[item.level]}</span> : null}
          </p>
          {item.about && <ItemAbout about={item.about} />}

          {!learning && item.practiceCount > 0 && (
            <TimesPractised count={item.practiceCount} last={item.lastPracticedAt} />
          )}

          {item.missing ? (
            <p className="notice" style={{ marginTop: 16 }}>
              These files are currently missing from the mounted library. Your history and journal
              entries for this meditation are untouched and it will come back when the files do.
            </p>
          ) : (
            <div className="detail-actions">
              <button className="btn btn-primary btn-lg detail-go" onClick={begin}>
                <Icon name="play" /> {beginLabel}
              </button>
              {!learning && resumeAt && (
                <p className="resume-note">
                  You stopped {ago(resumeAt.updatedAt)} - your place is kept for{' '}
                  {PRACTICE_RESUME_MINUTES} minutes in case that was by accident.
                </p>
              )}
              <div className="detail-more">
                {!learning && resumeAt && (
                  <ActionTile
                    icon="restart"
                    label="Begin again"
                    onClick={() => player.start(item, { resumeSec: 0 })}
                  />
                )}
                {!learning && <OfflineTile item={item} />}
                <ActionTile
                  icon="plans"
                  label="Add to plan"
                  onClick={() => setShowPlanSheet(true)}
                />
                <ActionTile
                  icon="friends"
                  label="With a friend"
                  ariaLabel={learning ? 'Study with a friend' : 'Sit with a friend'}
                  onClick={() => setSitTogether(true)}
                />
                {learning && hasProgress && (
                  <ActionTile
                    icon="restart"
                    label="Start over"
                    onClick={() => setConfirmReset(true)}
                  />
                )}
              </div>
            </div>
          )}

          <section className="section" aria-labelledby="sec-tracks">
            <div className="section-head">
              <h2 id="sec-tracks">
                {item.trackCount > 1
                  ? meta.parts[0]!.toUpperCase() + meta.parts.slice(1)
                  : item.hasVideo
                    ? 'Video'
                    : 'Audio'}
              </h2>
              {reordering ? null : user?.role === 'admin' && item.tracks.length > 1 ? (
                <button
                  type="button"
                  className="btn btn-sm btn-quiet section-edit"
                  onClick={() => setReordering(true)}
                  title={item.customOrder ? 'In the order you set - tap to change it' : undefined}
                >
                  <Icon name="reorder" size={14} />
                  {item.customOrder ? 'Your order' : 'Edit order'}
                </button>
              ) : (
                item.trackCount > 1 && (
                  <span className="section-note">Tap a circle to mark it done - or not</span>
                )
              )}
            </div>
            {reordering ? (
              <TrackOrderEditor
                item={item}
                onClose={() => setReordering(false)}
                onSaved={() => {
                  setReordering(false);
                  detail.reload();
                }}
              />
            ) : (
              <div className="rowlist">
                {item.tracks.map((t) => (
                  <div
                    className={`row${t.completed ? ' done' : ''}${learning && t.id === nextTrack?.id && doneCount > 0 ? ' next' : ''}`}
                    key={t.id}
                  >
                    {learning || item.tracks.length > 1 ? (
                      <DoneTick
                        track={t}
                        done={t.completed}
                        num={learning ? undefined : t.ord}
                        onToggle={() => void toggleDone(t.id, !t.completed)}
                      />
                    ) : (
                      <span className="num">{t.ord}</span>
                    )}
                    <div className="grow">
                      <div className="track-title">
                        {t.title}
                        {learning &&
                          (user?.role === 'admin' ? (
                            <button
                              type="button"
                              className={`role-chip${t.role === 'practice' ? ' practice' : ''}`}
                              onClick={() =>
                                void setRole(t.id, t.role === 'practice' ? 'lesson' : 'practice')
                              }
                              title={
                                t.role === 'practice'
                                  ? 'A meditation in this course - tap to mark it a lesson'
                                  : 'A lesson - tap to mark it a meditation'
                              }
                            >
                              <Icon name={t.role === 'practice' ? 'lotus' : 'book'} size={12} />
                              {t.role === 'practice' ? 'Meditation' : 'Lesson'}
                            </button>
                          ) : t.role === 'practice' ? (
                            <span className="role-chip practice">
                              <Icon name="lotus" size={12} /> Meditation
                            </span>
                          ) : null)}
                      </div>
                      <div className="sub">
                        {t.completed && (
                          <>
                            <span className="done-label">
                              <Icon name="check" size={12} /> {doneWords(t).done}
                            </span>
                            {' · '}
                          </>
                        )}
                        {t.video ? (
                          <>
                            <Icon name="video" size={12} /> video
                          </>
                        ) : (
                          `.${t.ext}`
                        )}
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
            )}
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

      {sitTogether && (
        <SitTogetherSheet
          itemId={item.id}
          title={item.title}
          onClose={() => setSitTogether(false)}
        />
      )}
      {confirmReset && (
        <Sheet title="Start over?" onClose={() => setConfirmReset(false)} labelId="reset-title">
          <p className="sit-sheet-lede">
            {resumeAt
              ? `Your place${resumeTrack && item.trackCount > 1 ? ` in ${resumeTrack.title}` : ''} (${formatClock(resumeAt.positionSec)})`
              : ''}
            {resumeAt && doneCount > 0 ? ' and ' : ''}
            {doneCount > 0
              ? `${doneCount} ${doneCount === 1 ? meta.part : meta.parts} ticked done`
              : ''}{' '}
            will be cleared, and {item.title} begins from the start next time. Your practice
            history, stats and journal stay as they are.
          </p>
          <div className="rf-actions">
            <button className="btn btn-quiet" onClick={() => setConfirmReset(false)}>
              Keep my progress
            </button>
            <button
              className="btn btn-primary"
              onClick={() => void startOver()}
              disabled={resetting}
            >
              <Icon name="restart" size={16} /> {resetting ? 'Clearing…' : 'Start over'}
            </button>
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

export function DocReaderSheet({ doc, onClose }: { doc: DocumentDto; onClose: () => void }) {
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
