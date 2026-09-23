/**
 * The player, in its two sizes.
 *
 * Full: opens when a practice begins. It takes the whole screen and nothing
 * behind it moves - the page is locked in place, so there is no scrollbar and
 * no way to drag the player off the page. The cover sits over a blurred wash
 * of itself; under it are the scrubber, the transport, and a row of chips for
 * the things people change mid-sit (speed, bells, the end timer, tracks).
 *
 * Mini: the same practice, minimised to a card that floats above the tab bar
 * on a phone and along the bottom on a desk, so the rest of the app can be
 * used while it plays. Tapping it opens the full player again.
 */
import { useEffect, useRef, useState } from 'react';
import { formatClock } from '@zenport/shared';
import { usePlayer } from './PlayerProvider.tsx';
import { playBell } from './bell.ts';
import { Cover, Icon, Sheet, Slider, Switch } from '../components/ui.tsx';
import { useScrollLock } from '../scrollLock.ts';

const SPEEDS = [0.75, 0.9, 1, 1.1, 1.25] as const;
const LEAD_INS = [
  { v: 0, label: 'Off' },
  { v: 10, label: '10 s' },
  { v: 30, label: '30 s' },
  { v: 60, label: '1 min' },
] as const;
const BELLS = [0, 5, 10, 15, 20] as const;
const END_AFTER = [0, 10, 20, 30, 45, 60] as const;

const minLabel = (m: number) => (m === 0 ? 'Off' : m === 60 ? '1 h' : `${m} min`);
const speedLabel = (v: number) => `${v}×`;
/** Segment label: short enough for six in a row on a phone. */
const minShort = (m: number) => (m === 0 ? 'Off' : m === 60 ? '1h' : `${m}m`);

// ── Scrubber ───────────────────────────────────────────────────────────────

/**
 * A range input that previews while dragged and seeks once on release, so a
 * drag across an hour-long talk is one seek, not a hundred.
 */
function Scrubber({ compact = false }: { compact?: boolean }) {
  const p = usePlayer();
  const [preview, setPreview] = useState<number | null>(null);
  const max = Math.max(1, Math.floor(p.duration));
  const value = preview ?? Math.min(Math.floor(p.position), max);
  const known = p.duration > 0;
  return (
    <div className={`scrub${compact ? ' compact' : ''}`}>
      <Slider
        className="scrub-slider"
        value={value}
        max={max}
        keyStep={5}
        disabled={!known}
        onInput={setPreview}
        onCommit={(v) => {
          p.seek(v);
          setPreview(null);
        }}
        label="Position"
        valueText={`${formatClock(value)} of ${known ? formatClock(p.duration) : 'unknown'}`}
      />
      {!compact && (
        <div className="scrub-times">
          <span>{formatClock(value)}</span>
          <span>{known ? `-${formatClock(Math.max(0, p.duration - value))}` : '–:––'}</span>
        </div>
      )}
    </div>
  );
}

// ── Mini player ────────────────────────────────────────────────────────────

export function PlayerBar() {
  const p = usePlayer();
  if (!p.item || p.focus) return null;
  const pct = p.duration > 0 ? Math.min(100, (p.position / p.duration) * 100) : 0;
  const sub =
    p.leadInRemaining !== null
      ? `Settling · ${p.leadInRemaining}s`
      : p.item.tracks.length > 1 && p.track
        ? p.track.title
        : p.item.creator;

  return (
    <div className="mini" role="region" aria-label={p.learning ? 'Now playing' : 'Now practicing'}>
      <div className="mini-progress" style={{ inlineSize: `${pct}%` }} aria-hidden="true" />
      <button className="mini-open" onClick={() => p.setFocus(true)} aria-label="Open the player">
        <Cover
          coverId={p.item.coverId}
          title={p.item.title}
          creator={p.item.creator}
          className="mini-cover"
        />
        <span className="mini-meta">
          <span className="t">{p.item.title}</span>
          <span className="s">{sub}</span>
        </span>
      </button>
      <div className="mini-desk">
        <Scrubber compact />
        <span className="mini-time">
          {formatClock(p.position)} / {p.duration ? formatClock(p.duration) : '–:––'}
        </span>
      </div>
      <div className="mini-controls">
        <button
          className="icon-btn mini-desk-only"
          onClick={() => p.skip(-15)}
          aria-label="Back 15 seconds"
        >
          <Icon name="skip-back" size={22} />
        </button>
        <button
          className={`mini-play${p.buffering ? ' buffering' : ''}`}
          onClick={p.toggle}
          aria-label={p.playing ? 'Pause' : 'Play'}
        >
          <Icon name={p.playing ? 'pause' : 'play'} size={18} />
        </button>
        <button
          className="icon-btn mini-desk-only"
          onClick={() => p.skip(30)}
          aria-label="Forward 30 seconds"
        >
          <Icon name="skip-fwd" size={22} />
        </button>
        <button
          className="icon-btn mini-desk-only"
          onClick={() => p.setFocus(true)}
          aria-label="Open the player"
        >
          <Icon name="expand" />
        </button>
        <button
          className="icon-btn"
          onClick={() => p.stop('finish')}
          aria-label={p.learning ? 'Done for now' : 'End practice'}
          title={p.learning ? 'Done for now' : 'End practice'}
        >
          <Icon name="x" />
        </button>
      </div>
    </div>
  );
}

// ── Full player ────────────────────────────────────────────────────────────

export function FocusMode() {
  const p = usePlayer();
  const open = !!p.item && p.focus;
  useScrollLock(open);
  const [sheet, setSheet] = useState<null | 'settings' | 'tracks'>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Belt and braces for iOS: a drag anywhere on the player that is not on a
  // control that scrolls or slides does nothing at all.
  useEffect(() => {
    const el = rootRef.current;
    if (!open || !el) return;
    const onMove = (e: TouchEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.slider, .sheet')) return;
      e.preventDefault();
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => el.removeEventListener('touchmove', onMove);
  }, [open]);

  // Escape minimises (a sheet on top handles its own Escape first).
  useEffect(() => {
    if (!open || sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.setFocus(false);
      if (e.key === ' ' && !(e.target as HTMLElement).closest('button, input')) {
        e.preventDefault();
        p.toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, sheet, p]);

  if (!open || !p.item) return null;
  const it = p.item;
  const multi = it.tracks.length > 1;
  const s = p.settings;
  const settling = p.leadInRemaining !== null;
  // Bells and the end timer are practice tools; a lesson does not need them in reach.
  const learning = it.type === 'course' || it.type === 'talk';
  // Practice tools belong to a practice: a meditation, or a meditation that
  // is part of a course. A lesson gets none of them.
  const practiceNow = !learning || p.track?.role === 'practice';
  const part = it.type === 'course' ? 'Lesson' : 'Track';

  return (
    <div
      className="fp"
      role="dialog"
      aria-modal="true"
      aria-label={`Playing ${it.title}`}
      ref={rootRef}
    >
      <div className="fp-wash" aria-hidden="true">
        {it.coverId ? (
          <img src={`/api/media/asset/${it.coverId}?w=320`} alt="" />
        ) : (
          <div className="fp-wash-gen" />
        )}
      </div>

      <header className="fp-top">
        <button
          className="fp-round"
          onClick={() => p.setFocus(false)}
          aria-label="Minimise the player"
        >
          <Icon name="chevron-down" size={22} />
        </button>
        <div className="fp-top-mid">
          <span className="fp-kicker">
            {practiceNow ? 'Now practicing' : p.isVideo ? 'Now watching' : 'Now studying'}
          </span>
          {p.wakeLockOn && (
            <span className="fp-awake" title="The screen stays on while this plays">
              <Icon name="sun" size={12} /> Screen stays on
            </span>
          )}
        </div>
        {practiceNow ? (
          <button
            className="fp-round"
            onClick={() => setSheet('settings')}
            aria-label="Practice settings"
          >
            <Icon name="sliders" size={20} />
          </button>
        ) : (
          <span className="fp-round-spacer" aria-hidden="true" />
        )}
      </header>

      <div className="fp-body">
        <div className={`fp-art${p.playing ? ' is-playing' : ''}${p.isVideo ? ' is-video' : ''}`}>
          {p.isVideo && p.videoEl ? (
            <VideoStage el={p.videoEl} />
          ) : (
            <Cover coverId={it.coverId} title={it.title} creator={it.creator} size={640} />
          )}
        </div>

        <div className="fp-info">
          <h1 className="fp-title">{it.title}</h1>
          <p className="fp-sub">
            {it.creator}
            {multi && p.track && (
              <>
                <span className="dot" aria-hidden="true">
                  ·
                </span>
                {part} {p.trackIndex + 1} of {it.tracks.length}
              </>
            )}
          </p>
          {multi && p.track && <p className="fp-track">{p.track.title}</p>}
          {p.learning && multi && <CourseProgress />}
        </div>

        {settling ? (
          <div className="fp-settle" role="status">
            <div className="fp-settle-ring">
              <span>{p.leadInRemaining}</span>
            </div>
            <p>Arrive. The audio begins on its own.</p>
          </div>
        ) : (
          <Scrubber />
        )}

        <div className="fp-transport">
          {multi ? (
            <button
              className="fp-t"
              onClick={p.prevTrack}
              aria-label="Previous track"
              disabled={p.trackIndex === 0 && p.position < 5}
            >
              <Icon name="prev" size={22} />
            </button>
          ) : (
            <span className="fp-t-spacer" />
          )}
          <button
            className="fp-t"
            onClick={() => p.skip(-15)}
            aria-label="Back 15 seconds"
            disabled={settling}
          >
            <Icon name="skip-back" size={30} />
          </button>
          <button
            className={`fp-play${p.buffering ? ' buffering' : ''}`}
            onClick={p.toggle}
            aria-label={settling ? 'Skip the settling time' : p.playing ? 'Pause' : 'Play'}
          >
            <Icon name={p.playing ? 'pause' : 'play'} size={30} />
          </button>
          <button
            className="fp-t"
            onClick={() => p.skip(30)}
            aria-label="Forward 30 seconds"
            disabled={settling}
          >
            <Icon name="skip-fwd" size={30} />
          </button>
          {multi ? (
            <button
              className="fp-t"
              onClick={p.nextTrack}
              aria-label="Next track"
              disabled={p.trackIndex >= it.tracks.length - 1}
            >
              <Icon name="next" size={22} />
            </button>
          ) : (
            <span className="fp-t-spacer" />
          )}
        </div>

        <div className="fp-chips">
          <button
            className="fp-chip"
            onClick={() => {
              const i = SPEEDS.indexOf(s.speed as (typeof SPEEDS)[number]);
              p.updateSettings({ speed: SPEEDS[(i + 1) % SPEEDS.length] });
            }}
            aria-label={`Speed ${speedLabel(s.speed)} - tap to change`}
          >
            <Icon name="gauge" size={18} />
            {speedLabel(s.speed)}
          </button>
          {practiceNow && (
            <>
              <button
                className={`fp-chip${s.bellsEveryMin ? ' on' : ''}`}
                onClick={() => setSheet('settings')}
                aria-label={`Interval bell: ${s.bellsEveryMin ? `every ${s.bellsEveryMin} minutes` : 'off'}`}
              >
                <Icon name="bell" size={18} />
                {s.bellsEveryMin ? `${s.bellsEveryMin} min` : 'Bells'}
              </button>
              <button
                className={`fp-chip${s.endAfterMin ? ' on' : ''}`}
                onClick={() => setSheet('settings')}
                aria-label={`End timer: ${s.endAfterMin ? `after ${s.endAfterMin} minutes` : 'off'}`}
              >
                <Icon name="moon" size={18} />
                {s.endAfterMin
                  ? `${minLabel(Math.max(1, Math.ceil(s.endAfterMin - p.practiceElapsed / 60)))} left`
                  : 'Timer'}
              </button>
            </>
          )}
          {p.isVideo && p.videoEl && <FullscreenChip el={p.videoEl} />}
          {multi && (
            <button
              className="fp-chip"
              onClick={() => setSheet('tracks')}
              aria-label={it.type === 'course' ? 'Lessons' : 'Tracks'}
            >
              <Icon name="list" size={18} />
              {it.type === 'course' ? 'Lessons' : 'Tracks'}
            </button>
          )}
        </div>
      </div>

      <footer className="fp-foot">
        <span className="fp-elapsed">
          {formatClock(p.practiceElapsed)} {p.learning ? 'studied' : 'practiced'}
        </span>
        <button className="fp-end" onClick={() => p.stop('finish')}>
          {p.learning ? 'Done for now' : 'End practice'}
        </button>
      </footer>

      {sheet === 'settings' && <PracticeSettingsSheet onClose={() => setSheet(null)} />}
      {sheet === 'tracks' && <TrackListSheet onClose={() => setSheet(null)} />}
    </div>
  );
}

// ── Video ──────────────────────────────────────────────────────────────────

/**
 * Shows the player's one video element. It lives in the provider and is only
 * moved here while the full player is open, then parked again - it is never
 * removed from the document, so minimising does not stop a talk.
 */
function VideoStage({ el }: { el: HTMLVideoElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stage = ref.current;
    if (!stage) return;
    stage.appendChild(el);
    return () => {
      document.getElementById('zp-video-home')?.appendChild(el);
    };
  }, [el]);
  return <div className="fp-video" ref={ref} />;
}

type WebkitVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};

const PIP_OFF_KEY = 'zenport-pip-unavailable';

/** Where floating video can work at all: the standard API, or Safari's own. */
function pipSupported(v: WebkitVideo): boolean {
  try {
    if (localStorage.getItem(PIP_OFF_KEY) === '1') return false;
  } catch {
    /* private mode */
  }
  const standard = 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;
  const webkit =
    typeof v.webkitSupportsPresentationMode === 'function' &&
    v.webkitSupportsPresentationMode('picture-in-picture');
  return Boolean(standard || webkit) && !v.disablePictureInPicture;
}

function FullscreenChip({ el }: { el: HTMLVideoElement }) {
  const v = el as WebkitVideo;
  const [pip, setPip] = useState(() => pipSupported(v));
  const [note, setNote] = useState<string | null>(null);

  // Float the video. The standard call first; Safari's presentation mode if
  // that is missing or refused. An installed iPhone app may still decline
  // both - if nothing floated a moment later, say so and stop offering it.
  const float = () => {
    const floating = () =>
      Boolean(document.pictureInPictureElement) ||
      v.webkitPresentationMode === 'picture-in-picture';
    if (floating()) {
      if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {});
      else v.webkitSetPresentationMode?.('inline');
      return;
    }
    const webkitTry = () => {
      if (typeof v.webkitSetPresentationMode === 'function')
        v.webkitSetPresentationMode('picture-in-picture');
    };
    if (typeof el.requestPictureInPicture === 'function' && document.pictureInPictureEnabled) {
      void el.requestPictureInPicture().catch(webkitTry);
    } else {
      webkitTry();
    }
    window.setTimeout(() => {
      if (floating()) return;
      setPip(false);
      setNote('Floating video is not available here - Full screen works.');
      try {
        localStorage.setItem(PIP_OFF_KEY, '1');
      } catch {
        /* private mode */
      }
    }, 1200);
  };

  return (
    <>
      <button
        className="fp-chip"
        onClick={() => {
          if (el.requestFullscreen)
            void el.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
          else v.webkitEnterFullscreen?.();
        }}
        aria-label="Full screen"
      >
        <Icon name="expand" size={18} />
        Full screen
      </button>
      {pip && (
        <button className="fp-chip" onClick={float} aria-label="Float the video over other apps">
          <Icon name="video" size={18} />
          Float
        </button>
      )}
      {note && (
        <span className="fp-chip-note" role="status">
          {note}
        </span>
      )}
    </>
  );
}

/** A course's lessons as a row of segments: done, current, still ahead. */
function CourseProgress() {
  const p = usePlayer();
  if (!p.item) return null;
  const tracks = p.item.tracks;
  const done = tracks.filter((t) => p.completedIds.has(t.id)).length;
  return (
    <div className="fp-course" aria-label={`${done} of ${tracks.length} lessons done`}>
      <div className="fp-course-bar">
        {tracks.length <= 40 ? (
          tracks.map((t, i) => (
            <span
              key={t.id}
              className={p.completedIds.has(t.id) ? 'done' : i === p.trackIndex ? 'now' : ''}
            />
          ))
        ) : (
          <span
            className="done"
            style={{ flex: 'none', inlineSize: `${(done / tracks.length) * 100}%` }}
          />
        )}
      </div>
      <span className="fp-course-t">
        {done} of {tracks.length} done
      </span>
    </div>
  );
}

// ── Track list ─────────────────────────────────────────────────────────────

function TrackListSheet({ onClose }: { onClose: () => void }) {
  const p = usePlayer();
  if (!p.item) return null;
  return (
    <Sheet title="Tracks" onClose={onClose} labelId="tracks-title">
      <ol className="tl">
        {p.item.tracks.map((t, i) => {
          const current = i === p.trackIndex;
          return (
            <li key={t.id}>
              <button
                className={`tl-row${current ? ' current' : ''}`}
                aria-current={current || undefined}
                onClick={() => {
                  p.playTrack(i);
                  onClose();
                }}
              >
                <span className="tl-n">
                  {current && p.playing ? (
                    <span className="tl-eq" aria-hidden="true" />
                  ) : p.completedIds.has(t.id) ? (
                    <Icon name="check-circle" size={18} />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="tl-t">{t.title}</span>
                <span className="tl-d">{t.durationSec ? formatClock(t.durationSec) : ''}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </Sheet>
  );
}

// ── Practice settings ──────────────────────────────────────────────────────

function Seg<T extends number>({
  options,
  value,
  onChange,
  label,
  render,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  render: (v: T) => string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          role="radio"
          aria-checked={o === value}
          className={`seg-opt${o === value ? ' on' : ''}`}
          onClick={() => onChange(o)}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}

function Section({
  art,
  title,
  hint,
  value,
  children,
}: {
  art: string;
  title: string;
  hint: string;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="ps-sec">
      <div className="ps-head">
        <img className="ps-art" src={`/art/${art}.webp`} alt="" width={56} height={56} />
        <div className="ps-text">
          <h3>
            {title}
            {value && <span className="ps-value">{value}</span>}
          </h3>
          <p>{hint}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function PracticeSettingsSheet({ onClose }: { onClose: () => void }) {
  const p = usePlayer();
  const s = p.settings;
  return (
    <Sheet title="Practice settings" onClose={onClose} labelId="ps-title">
      <div className="ps">
        <Section
          art="set-arrive"
          title="Settle in"
          hint="A quiet pause before the audio starts."
          value={s.leadInSec ? LEAD_INS.find((l) => l.v === s.leadInSec)?.label : 'Off'}
        >
          <Seg
            label="Settling time"
            options={LEAD_INS.map((l) => l.v)}
            value={s.leadInSec as (typeof LEAD_INS)[number]['v']}
            onChange={(v) => p.updateSettings({ leadInSec: v })}
            render={(v) => LEAD_INS.find((l) => l.v === v)!.label}
          />
        </Section>

        <Section
          art="set-bell"
          title="Interval bell"
          hint="A soft bowl to mark the time as you sit."
          value={s.bellsEveryMin ? `every ${s.bellsEveryMin} min` : 'Off'}
        >
          <Seg
            label="Interval bell"
            options={BELLS}
            value={s.bellsEveryMin as (typeof BELLS)[number]}
            onChange={(v) => p.updateSettings({ bellsEveryMin: v })}
            render={minShort}
          />
          <button className="ps-try" onClick={() => playBell(s.volume)}>
            <Icon name="bell" size={14} /> Hear the bell
          </button>
        </Section>

        <Section
          art="set-end"
          title="End timer"
          hint="Fades the audio out, then a closing bell. Good for sleep."
          value={s.endAfterMin ? `after ${minLabel(s.endAfterMin)}` : 'Off'}
        >
          <Seg
            label="End timer"
            options={END_AFTER}
            value={s.endAfterMin as (typeof END_AFTER)[number]}
            onChange={(v) => p.updateSettings({ endAfterMin: v })}
            render={minShort}
          />
        </Section>

        <Section
          art="set-sound"
          title="Sound"
          hint="Pace and level of the recording."
          value={speedLabel(s.speed)}
        >
          <Seg
            label="Speed"
            options={SPEEDS}
            value={s.speed as (typeof SPEEDS)[number]}
            onChange={(v) => p.updateSettings({ speed: v })}
            render={speedLabel}
          />
          <div className="ps-volume">
            <Icon name="volume-low" size={18} />
            <Slider
              value={Math.round(s.volume * 100)}
              max={100}
              keyStep={5}
              onInput={(v) => p.updateSettings({ volume: v / 100 })}
              onCommit={(v) => p.updateSettings({ volume: v / 100 })}
              label="Volume"
              valueText={`${Math.round(s.volume * 100)}%`}
            />
            <Icon name="volume" size={18} />
          </div>
        </Section>

        <div className="ps-awake">
          <span className="ps-awake-ic">
            <Icon name="sun" size={20} />
          </span>
          <div className="ps-text">
            <h3>Keep the screen on</h3>
            <p>
              {p.wakeLockSupported
                ? 'While a practice plays, so auto-lock never cuts a long sit short.'
                : 'This browser cannot hold the screen on; audio still plays with the screen off.'}
            </p>
            {p.wakeLockNote && s.keepAwake && p.wakeLockSupported && (
              <p className="ps-warn">{p.wakeLockNote}</p>
            )}
          </div>
          <Switch
            checked={s.keepAwake}
            onChange={(v) => p.updateSettings({ keepAwake: v })}
            label="Keep the screen on while practicing"
            disabled={!p.wakeLockSupported}
          />
        </div>
      </div>
    </Sheet>
  );
}
