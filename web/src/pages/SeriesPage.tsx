/**
 * A series: a course in parts, a meditation programme, a set of talks - the
 * items that share a creator and a collection, shown as one thing with one
 * progress and one "continue".
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ContentType, LibraryDto, MeditationDetailDto } from '@zenport/shared';
import { formatDuration, naturalCompare } from '@zenport/shared';
import { api } from '../api.ts';
import { useAuth } from '../App.tsx';
import { useApi, useRefreshOn } from '../hooks.ts';
import { usePlayer } from '../player/PlayerProvider.tsx';
import { Cover, ErrorNote, Icon } from '../components/ui.tsx';
import {
  displayName,
  groupSeries,
  isFinished,
  LEVEL_SHORT,
  progressLabel,
  seriesLevel,
  seriesStructure,
  titleInSeries,
  TYPE_META,
} from '../content.ts';
import type { ItemLevel } from '@zenport/shared';
import { TypeSheet } from '../components/TypeSheet.tsx';
import { CardBadges } from './LibraryPage.tsx';
import { FolderDocs } from '../components/FolderDocs.tsx';

export function SeriesPage() {
  const { creator = '', name = '' } = useParams();
  const lib = useApi<LibraryDto>('/api/library');
  useRefreshOn('zenport:progress', () => lib.reload());
  const player = usePlayer();
  const { user } = useAuth();
  const [picking, setPicking] = useState(false);
  const [starting, setStarting] = useState(false);

  const series = useMemo(() => {
    const items = (lib.data?.items ?? []).filter(
      (i) => !i.missing && i.creator === creator && i.collection === name,
    );
    items.sort((a, b) => naturalCompare(a.title, b.title));
    return items.length ? { ...groupSeries(items).series[0], items } : null;
  }, [lib.data, creator, name]);

  if (lib.loading && !lib.data) return <div className="skeleton" style={{ height: 320 }} />;
  if (lib.error) return <ErrorNote message={lib.error} onRetry={lib.reload} />;
  if (!series || !series.items) {
    return (
      <div className="page-head">
        <h1>Not found</h1>
        <p className="lede">
          This series is not in the library any more. <Link to="/library">Back to the library</Link>
        </p>
      </div>
    );
  }

  const items = series.items;
  const type: ContentType = series.type ?? items[0]!.type;
  const meta = TYPE_META[type];
  const total = items.reduce((n, i) => n + i.trackCount, 0);
  const done = items.reduce((n, i) => n + i.completedCount, 0);
  const duration = items.every((i) => i.totalDurationSec !== null)
    ? items.reduce((n, i) => n + (i.totalDurationSec ?? 0), 0)
    : null;
  const next = items.find((i) => i.completedCount < i.trackCount) ?? items[0]!;
  const level = seriesLevel(items);
  const finished = isFinished({ trackCount: total, completedCount: done });
  const structure = seriesStructure({ creator, name, items, type }, lib.data?.seriesStructures);
  const setStructure = async (st: 'programme' | 'pack' | null) => {
    await api
      .put('/api/admin/series/structure', { creator, collection: name, structure: st })
      .catch(() => {});
    lib.reload();
  };
  const setLevel = async (l: ItemLevel | null) => {
    await api
      .put('/api/admin/items/level', { ids: items.map((i) => i.id), level: l })
      .catch(() => {});
    lib.reload();
  };

  const continueNext = async () => {
    setStarting(true);
    try {
      const detail = await api.get<MeditationDetailDto>(`/api/items/${next.id}`);
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

  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb" style={{ marginBottom: 20 }}>
        <Link to="/library">Library</Link>
        <span className="sep">/</span>
        <Link to={`/creators/${encodeURIComponent(creator)}`}>{creator}</Link>
      </nav>

      <div className="detail-grid series-head">
        <div className="detail-cover">
          <Cover coverId={series.coverId ?? null} title={name} creator={creator} size={640} />
        </div>
        <div className="detail-body">
          <p className="eyebrow type-eyebrow">
            <Icon name={meta.icon} size={14} />
            {type === 'course'
              ? 'Course'
              : structure === 'programme'
                ? `${meta.label} programme · in order`
                : `${meta.label} collection · any order`}
            {series.hasVideo && (
              <span className="eyebrow-video">
                <Icon name="video" size={14} /> Video
              </span>
            )}
          </p>
          <h1 className="detail-title">{displayName(name)}</h1>
          <p className="detail-facts">
            {level && (
              <span>
                <span className={`lvl lvl-${level}`}>{LEVEL_SHORT[level]}</span>
              </span>
            )}
            <span>{creator}</span>
            <span>
              {items.length} {type === 'course' ? 'modules' : 'parts'}
            </span>
            <span>
              {total} {meta.parts}
            </span>
            {duration ? <span>{formatDuration(duration)}</span> : null}
          </p>

          <div className="series-progress" aria-label={`${done} of ${total} ${meta.parts} done`}>
            <div className="bar">
              <span style={{ inlineSize: `${total ? (done / total) * 100 : 0}%` }} />
            </div>
            <span>
              {finished ? (
                <strong className="series-done">
                  <Icon name="check-circle" size={16} /> Done - every part
                </strong>
              ) : (
                (progressLabel(done, total, type) ?? `Not started · ${total} ${meta.parts}`)
              )}
            </span>
          </div>

          <div className="detail-actions">
            <button
              className="btn btn-primary btn-lg"
              onClick={() => void continueNext()}
              disabled={starting}
            >
              <Icon name="play" size={17} />
              {done === 0 ? 'Start' : done >= total ? 'Begin again' : 'Continue'} · {titleInSeries(next.title, name)}
            </button>
            {user?.role === 'admin' && (
              <button className="btn btn-ghost" onClick={() => setPicking(true)}>
                <Icon name={meta.icon} size={16} />
                Change type
              </button>
            )}
            {user?.role === 'admin' && type !== 'course' && (
              <label className="series-level">
                <span className="visually-hidden">Programme or collection</span>
                <select
                  value={
                    lib.data?.seriesStructures?.some(
                      (o) => o.creator === creator && o.collection === name,
                    )
                      ? structure
                      : ''
                  }
                  onChange={(e) =>
                    void setStructure((e.target.value || null) as 'programme' | 'pack' | null)
                  }
                  title="In order, or any order"
                >
                  <option value="">
                    {structure === 'programme' ? 'Programme (auto)' : 'Collection (auto)'}
                  </option>
                  <option value="programme">Programme - in order</option>
                  <option value="pack">Collection - any order</option>
                </select>
              </label>
            )}
            {user?.role === 'admin' && (
              <label className="series-level">
                <span className="visually-hidden">Level of this series</span>
                <select
                  value={items.every((i) => i.levelSource === 'manual') ? (level ?? '') : ''}
                  onChange={(e) => void setLevel((e.target.value || null) as ItemLevel | null)}
                  title="Set the level for every part"
                >
                  <option value="">
                    {level ? `Level: ${LEVEL_SHORT[level]} (auto)` : 'Level: not set'}
                  </option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="all">All levels</option>
                </select>
              </label>
            )}
          </div>
        </div>
      </div>

      <section className="section" aria-labelledby="series-parts">
        <div className="section-head">
          <h2 id="series-parts">{type === 'course' ? 'Modules' : 'In this series'}</h2>
        </div>
        <ol className="series-list">
          {items.map((i, n) => {
            const finished = i.trackCount > 0 && i.completedCount >= i.trackCount;
            return (
              <li key={i.id}>
                <Link
                  to={`/m/${i.id}`}
                  className={`series-row${i.id === next.id && !finished ? ' next' : ''}`}
                >
                  <span className="series-n">
                    {finished ? <Icon name="check-circle" size={20} /> : n + 1}
                  </span>
                  <span className="series-cover">
                    <Cover coverId={i.coverId} title={i.title} creator={i.creator} />
                  </span>
                  <span className="series-meta">
                    <span className="t">{titleInSeries(i.title, name)}</span>
                    <span className="s">
                      {progressLabel(i.completedCount, i.trackCount, i.type) ??
                        `${i.trackCount} ${i.trackCount === 1 ? TYPE_META[i.type].part : TYPE_META[i.type].parts}`}
                      {i.totalDurationSec ? ` · ${formatDuration(i.totalDurationSec)}` : ''}
                    </span>
                  </span>
                  <CardBadges type={i.type === type ? 'meditation' : i.type} video={i.hasVideo} />
                  <Icon name="chevron-right" size={16} />
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <FolderDocs
        groups={(lib.data?.folderDocs ?? []).filter(
          (g) => g.creator === creator && g.collection === name,
        )}
      />

      {picking && (
        <TypeSheet
          itemId={items[0]!.id}
          current={type}
          auto={items.every((i) => i.typeSource === 'auto')}
          seriesSize={items.length}
          defaultScope="collection"
          onClose={() => setPicking(false)}
          onSaved={() => {
            setPicking(false);
            lib.reload();
          }}
        />
      )}
    </>
  );
}
