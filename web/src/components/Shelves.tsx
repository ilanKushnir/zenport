/**
 * The library's shelves, each shaped by what it holds:
 *
 * - Rail: a row that scrolls sideways (finger, trackpad, or arrows that
 *   appear on a desktop when there is more), edges fading where it continues.
 * - ContinueCard: something part-way through - wide, with where you are, a
 *   progress bar, one round button that resumes right there, and a small
 *   "set aside" that hides it until you open it again.
 * - CreatorBubble: a person, not a recording - round, in a ring, like a
 *   story, never a square tile.
 * - MedRow / SeriesRow: the list view of Everything, one compact line each.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  formatClock,
  formatDuration,
  isPracticeType,
  type CreatorDto,
  type MeditationDetailDto,
  type MeditationSummaryDto,
} from '@zenport/shared';
import { api } from '../api.ts';
import { usePlayer } from '../player/PlayerProvider.tsx';
import { usePrefs } from '../prefs.tsx';
import { useOffline } from '../offline.ts';
import { progressLabel, seriesPath, TYPE_META, type Series } from '../content.ts';
import { Cover, Icon } from './ui.tsx';

// ── Rail ───────────────────────────────────────────────────────────────────

export function Rail({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: true });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () =>
      setEdge({
        start: el.scrollLeft <= 4,
        end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
      });
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
    };
  }, [children]);
  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  return (
    <div className={`rail-wrap${edge.start ? '' : ' more-start'}${edge.end ? '' : ' more-end'}`}>
      <div className="rail" ref={ref} role="list" aria-label={label}>
        {children}
      </div>
      <button
        type="button"
        className="rail-arrow prev"
        aria-label="Scroll back"
        tabIndex={-1}
        onClick={() => page(-1)}
        hidden={edge.start}
      >
        <Icon name="chevron-left" size={18} />
      </button>
      <button
        type="button"
        className="rail-arrow next"
        aria-label="Scroll on"
        tabIndex={-1}
        onClick={() => page(1)}
        hidden={edge.end}
      >
        <Icon name="chevron-right" size={18} />
      </button>
    </div>
  );
}

// ── Continue ───────────────────────────────────────────────────────────────

/**
 * How a series is named in the Continue row's hidden list. The separator is
 * the ASCII unit separator: SQLite keeps a NUL in the text but hands it back
 * cut short, so NUL (the library's own series key) cannot be used here.
 */
export const continueSeriesKey = (creator: string, series: string) =>
  `series:${creator}\u001f${series}`;

export type ContinueEntry =
  | { kind: 'series'; s: Series; key: string }
  | { kind: 'item'; i: MeditationSummaryDto; key: string };

/** The item of a series to pick up: the one left part-way, else the first not finished. */
function seriesPick(s: Series): MeditationSummaryDto {
  return (
    s.items.find((i) => i.resumeSec !== null) ??
    s.items.find((i) => i.completedCount < i.trackCount) ??
    s.items[0]!
  );
}

function where(e: ContinueEntry): { line: string; pct: number } {
  if (e.kind === 'series') {
    const s = e.s;
    return {
      line: progressLabel(s.completedCount, s.trackCount, s.type) ?? `${s.items.length} parts`,
      pct: s.trackCount ? s.completedCount / s.trackCount : 0,
    };
  }
  const i = e.i;
  const part = TYPE_META[i.type].part;
  if (i.trackCount > 1) {
    const next = Math.min(i.completedCount + 1, i.trackCount);
    return {
      line: `${part[0]!.toUpperCase()}${part.slice(1)} ${next} of ${i.trackCount}`,
      pct: i.completedCount / i.trackCount,
    };
  }
  return {
    line: i.resumeSec ? `Stopped at ${formatClock(i.resumeSec)}` : TYPE_META[i.type].label,
    pct: i.resumeSec && i.totalDurationSec ? i.resumeSec / i.totalDurationSec : 0,
  };
}

export function ContinueCard({
  entry,
  onHide,
}: {
  entry: ContinueEntry;
  onHide: (e: ContinueEntry) => void;
}) {
  const player = usePlayer();
  const [starting, setStarting] = useState(false);
  const target = entry.kind === 'series' ? seriesPick(entry.s) : entry.i;
  const title = entry.kind === 'series' ? entry.s.name : entry.i.title;
  const type = entry.kind === 'series' ? entry.s.type : entry.i.type;
  const to =
    entry.kind === 'series' ? seriesPath(entry.s.creator, entry.s.name) : `/m/${entry.i.id}`;
  const { line, pct } = where(entry);

  // Resume right where it was left: the saved place, else the next part not done.
  const resume = async () => {
    setStarting(true);
    try {
      const d = await api.get<MeditationDetailDto>(`/api/items/${target.id}`);
      if (d.resume) {
        player.start(d, { trackId: d.resume.trackId, resumeSec: d.resume.positionSec });
      } else {
        const next = d.tracks.find((t) => !t.completed && !t.missing);
        player.start(d, next ? { trackId: next.id } : undefined);
      }
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className={`cont-card t-${type}`} role="listitem">
      <Link className="cont-main" to={to}>
        <span className="cont-cover">
          <Cover
            coverId={entry.kind === 'series' ? entry.s.coverId : entry.i.coverId}
            title={title}
          />
        </span>
        <span className="cont-text">
          <span className="cont-kind">
            <Icon name={TYPE_META[type].icon} size={12} /> {line}
          </span>
          <span className="cont-title">{title}</span>
          <span className="cont-bar" aria-hidden="true">
            <span style={{ inlineSize: `${Math.max(4, Math.round(pct * 100))}%` }} />
          </span>
        </span>
      </Link>
      <button
        type="button"
        className="cont-play"
        aria-label={`Resume ${title}`}
        onClick={() => void resume()}
        disabled={starting}
      >
        <Icon name="play" size={18} />
      </button>
      <button
        type="button"
        className="cont-hide"
        aria-label={`Hide ${title} from Continue`}
        title="Hide from Continue - it comes back when you open it again"
        onClick={() => onHide(entry)}
      >
        <Icon name="x" size={13} />
      </button>
    </div>
  );
}

// ── Creators ───────────────────────────────────────────────────────────────

export function CreatorFace({
  creator,
  size = 'md',
}: {
  creator: CreatorDto;
  size?: 'lg' | 'md' | 'sm';
}) {
  return (
    <span className={`creator-ring ${size}`} aria-hidden="true">
      <span className="creator-face">
        {creator.imageUrl ? (
          <img src={creator.imageUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <Cover coverId={creator.coverIds[0] ?? null} title={creator.name} />
        )}
      </span>
    </span>
  );
}

export function CreatorBubble({ creator }: { creator: CreatorDto }) {
  return (
    <Link
      className="creator-bubble"
      role="listitem"
      to={`/creators/${encodeURIComponent(creator.name)}`}
      title={creator.name}
    >
      <CreatorFace creator={creator} />
      <span className="creator-name">{creator.name}</span>
      <span className="creator-count">
        {creator.itemCount} {creator.itemCount === 1 ? 'item' : 'items'}
      </span>
    </Link>
  );
}

// ── List view ──────────────────────────────────────────────────────────────

export function MedRow({ item }: { item: MeditationSummaryDto }) {
  const { isFavorite, toggleFavorite } = usePrefs();
  const offline = useOffline();
  const starred = isFavorite(item.id);
  const meta = TYPE_META[item.type];
  const progress =
    item.trackCount > 1 && item.completedCount > 0 ? item.completedCount / item.trackCount : null;
  return (
    <Link className="med-row" to={`/m/${item.id}`}>
      <span className="med-row-cover">
        <Cover coverId={item.coverId} title={item.title} creator={item.creator} />
      </span>
      <span className="med-row-text">
        <span className="med-row-title">{item.title}</span>
        <span className="sub">
          {item.creator}
          {item.totalDurationSec ? ` · ${formatDuration(item.totalDurationSec)}` : ''}
          {item.trackCount > 1 ? ` · ${item.trackCount} ${meta.parts}` : ''}
        </span>
        {progress !== null && (
          <span className="med-row-bar" aria-hidden="true">
            <span style={{ inlineSize: `${Math.round(progress * 100)}%` }} />
          </span>
        )}
      </span>
      <span className="med-row-meta">
        <span className={`med-row-type t-${item.type}`}>
          <Icon name={meta.icon} size={13} />
          <span>{meta.label}</span>
        </span>
        {item.hasVideo && <Icon name="video" size={14} />}
        {offline.ids.has(item.id) && (
          <span className="med-row-offline" title="Saved offline">
            <Icon name="on-device" size={14} />
          </span>
        )}
        {isPracticeType(item.type) && item.practiceCount > 0 && (
          <span className="med-row-times" title={`Practised ${item.practiceCount} times`}>
            <Icon name="lotus" size={12} /> {item.practiceCount}
          </span>
        )}
      </span>
      <button
        className={`fav-btn med-row-fav${starred ? ' on' : ''}`}
        aria-pressed={starred}
        aria-label={
          starred ? `Remove ${item.title} from favourites` : `Add ${item.title} to favourites`
        }
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void toggleFavorite(item.id);
        }}
      >
        <Icon name="heart" size={16} />
      </button>
    </Link>
  );
}

export function SeriesRow({ series }: { series: Series }) {
  const meta = TYPE_META[series.type];
  const progress = progressLabel(series.completedCount, series.trackCount, series.type);
  return (
    <Link className="med-row" to={seriesPath(series.creator, series.name)}>
      <span className="med-row-cover stacked">
        <Cover coverId={series.coverId} title={series.name} creator={series.creator} />
      </span>
      <span className="med-row-text">
        <span className="med-row-title">{series.name}</span>
        <span className="sub">
          {series.creator} · {series.items.length}{' '}
          {series.type === 'course' ? 'modules' : meta.plural.toLowerCase()}
          {progress ? ` · ${progress}` : ''}
        </span>
      </span>
      <span className="med-row-meta">
        <span className={`med-row-type t-${series.type}`}>
          <Icon name="list" size={13} />
          <span>Series</span>
        </span>
      </span>
      <Icon name="chevron-right" size={16} />
    </Link>
  );
}
