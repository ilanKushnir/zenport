import { useState } from 'react';
import { formatClock } from '@zenport/shared';
import { usePlayer } from './PlayerProvider.tsx';
import { Cover, Icon, Sheet } from '../components/ui.tsx';

const SPEEDS = [0.75, 0.9, 1, 1.1, 1.25];

export function PlayerBar() {
  const p = usePlayer();
  const [showSettings, setShowSettings] = useState(false);
  if (!p.item || p.focus) return null;

  return (
    <div className="player-bar" role="region" aria-label="Now practicing">
      <div className="player-bar-inner">
        <Cover
          coverId={p.item.coverId}
          title={p.item.title}
          creator={p.item.creator}
          className="player-cover"
        />
        <div className="meta">
          <div className="t">
            {p.item.title}
            {p.item.tracks.length > 1 && p.track ? ` - ${p.track.title}` : ''}
          </div>
          <div className="s">
            {p.leadInRemaining !== null
              ? `settling · ${p.leadInRemaining}s`
              : `${formatClock(p.position)} / ${p.duration ? formatClock(p.duration) : '–:––'}`}
          </div>
        </div>
        {/* Its own row on a phone, where five controls and a cover leave the
            slider no room; beside the title on a desk. */}
        <div className="player-seek">
          <input
            type="range"
            className="seek"
            min={0}
            max={Math.max(1, Math.floor(p.duration))}
            value={Math.floor(p.position)}
            onChange={(e) => p.seek(Number(e.target.value))}
            aria-label="Seek"
          />
        </div>
        <div className="player-controls">
          {p.item.tracks.length > 1 && (
            <button
              className="icon-btn player-secondary"
              onClick={p.prevTrack}
              aria-label="Previous track"
            >
              <Icon name="prev" />
            </button>
          )}
          <button
            className="icon-btn player-play"
            onClick={p.toggle}
            aria-label={p.playing ? 'Pause' : 'Play'}
          >
            <Icon name={p.playing ? 'pause' : 'play'} size={20} />
          </button>
          {p.item.tracks.length > 1 && (
            <button
              className="icon-btn player-secondary"
              onClick={p.nextTrack}
              aria-label="Next track"
            >
              <Icon name="next" />
            </button>
          )}
          {/* Bells and the rest live in focus mode too, so on a phone the bar
              keeps only what you reach for mid-sit: play, the full screen, out. */}
          <button
            className="icon-btn player-secondary"
            onClick={() => setShowSettings(true)}
            aria-label="Practice settings"
          >
            <Icon name="bell" />
          </button>
          <button
            className="icon-btn"
            onClick={() => p.setFocus(true)}
            aria-label="Enter focus mode"
          >
            <Icon name="expand" />
          </button>
          <button
            className="icon-btn"
            onClick={() => p.stop('finish')}
            aria-label="End practice"
            title="End practice"
          >
            <Icon name="x" />
          </button>
        </div>
      </div>
      {showSettings && <PracticeSettingsSheet onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export function PracticeSettingsSheet({ onClose }: { onClose: () => void }) {
  const p = usePlayer();
  const s = p.settings;
  return (
    <Sheet title="Practice settings" onClose={onClose}>
      <div className="field">
        <label htmlFor="ps-leadin">Settling lead-in before audio</label>
        <select
          id="ps-leadin"
          value={s.leadInSec}
          onChange={(e) => p.updateSettings({ leadInSec: Number(e.target.value) })}
        >
          <option value={0}>Off - start right away</option>
          <option value={10}>10 seconds</option>
          <option value={30}>30 seconds</option>
          <option value={60}>1 minute</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="ps-bells">Interval bell</label>
        <select
          id="ps-bells"
          value={s.bellsEveryMin}
          onChange={(e) => p.updateSettings({ bellsEveryMin: Number(e.target.value) })}
        >
          <option value={0}>Off</option>
          <option value={5}>Every 5 minutes</option>
          <option value={10}>Every 10 minutes</option>
          <option value={15}>Every 15 minutes</option>
          <option value={20}>Every 20 minutes</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="ps-end">End timer (gentle fade, then a closing bell)</label>
        <select
          id="ps-end"
          value={s.endAfterMin}
          onChange={(e) => p.updateSettings({ endAfterMin: Number(e.target.value) })}
        >
          <option value={0}>Off - play to the end</option>
          <option value={10}>After 10 minutes</option>
          <option value={20}>After 20 minutes</option>
          <option value={30}>After 30 minutes</option>
          <option value={45}>After 45 minutes</option>
          <option value={60}>After 1 hour</option>
        </select>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="ps-speed">Speed</label>
          <select
            id="ps-speed"
            value={s.speed}
            onChange={(e) => p.updateSettings({ speed: Number(e.target.value) })}
          >
            {SPEEDS.map((v) => (
              <option key={v} value={v}>
                {v}×
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ps-vol">Volume</label>
          <input
            id="ps-vol"
            type="range"
            className="seek"
            min={0}
            max={100}
            value={Math.round(s.volume * 100)}
            onChange={(e) => p.updateSettings({ volume: Number(e.target.value) / 100 })}
          />
        </div>
      </div>
      <div className="field">
        <button className="btn btn-ghost" onClick={p.toggleWakeLock} aria-pressed={p.wakeLockOn}>
          <Icon name="moon" />
          {p.wakeLockOn ? 'Screen will stay awake' : 'Keep screen awake'}
        </button>
        {p.wakeLockNote && (
          <p className="notice" style={{ marginTop: 8 }}>
            {p.wakeLockNote}
          </p>
        )}
      </div>
    </Sheet>
  );
}

export function FocusMode() {
  const p = usePlayer();
  const [showSettings, setShowSettings] = useState(false);
  if (!p.item || !p.focus) return null;

  return (
    <div className="focus-mode" role="dialog" aria-label="Focused practice">
      <div className="focus-corner-start">
        <button
          className="icon-btn"
          onClick={p.toggleWakeLock}
          aria-pressed={p.wakeLockOn}
          aria-label={p.wakeLockOn ? 'Let the screen sleep' : 'Keep the screen awake'}
          style={p.wakeLockOn ? { color: 'var(--copper)' } : undefined}
        >
          <Icon name="moon" />
        </button>
      </div>
      <div className="focus-corner">
        <button
          className="icon-btn"
          onClick={() => setShowSettings(true)}
          aria-label="Practice settings"
        >
          <Icon name="bell" />
        </button>
        <button
          className="icon-btn"
          onClick={() => p.setFocus(false)}
          aria-label="Leave focus mode"
        >
          <Icon name="x" />
        </button>
      </div>

      <Cover coverId={p.item.coverId} title={p.item.title} creator={p.item.creator} />
      <div>
        <h1 style={{ fontSize: 24 }}>{p.item.title}</h1>
        <p style={{ color: 'var(--muted)', marginTop: 4 }}>{p.item.creator}</p>
      </div>
      {p.leadInRemaining !== null ? (
        <p className="intention">Arrive. Audio begins in {p.leadInRemaining}…</p>
      ) : (
        <p className="focus-elapsed" aria-live="off">
          {formatClock(p.practiceElapsed)} practiced
        </p>
      )}
      <div className="focus-controls">
        {p.item.tracks.length > 1 && (
          <button className="icon-btn" onClick={p.prevTrack} aria-label="Previous track">
            <Icon name="prev" size={22} />
          </button>
        )}
        <button className="play-big" onClick={p.toggle} aria-label={p.playing ? 'Pause' : 'Play'}>
          <Icon name={p.playing ? 'pause' : 'play'} size={28} />
        </button>
        {p.item.tracks.length > 1 && (
          <button className="icon-btn" onClick={p.nextTrack} aria-label="Next track">
            <Icon name="next" size={22} />
          </button>
        )}
      </div>
      <button className="btn btn-quiet" onClick={() => p.stop('finish')}>
        End practice
      </button>
      {p.wakeLockNote && <p className="notice">{p.wakeLockNote}</p>}
      {showSettings && <PracticeSettingsSheet onClose={() => setShowSettings(false)} />}
    </div>
  );
}
