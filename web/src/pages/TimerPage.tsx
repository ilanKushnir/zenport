/**
 * Unguided sit.
 *
 * Not every practice needs a recording, and a meditation library without a
 * plain timer sends people to their phone's clock app — which is exactly where
 * the practice stops being tracked. This records a real practice session, so a
 * silent sit lands in the same history and the same streak as a guided one.
 *
 * The session is opened on the server at the moment the sit starts, not when
 * it ends: closing the tab mid-sit then leaves an abandoned session with the
 * minutes that were actually sat, rather than losing them entirely.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { TIMER_ITEM_ID, TIMER_ITEM_TITLE } from '@zenport/shared';
import { api } from '../api.ts';
import { usePrefs } from '../prefs.tsx';
import { usePlayer } from '../player/PlayerProvider.tsx';
import { playBell } from '../player/bell.ts';
import {
  BREATH,
  BREATH_LABEL,
  BREATH_MIN_SCALE,
  breathPhaseAt,
  formatClock,
} from '../player/breath.ts';
import { Icon } from '../components/ui.tsx';

/**
 * Capped at 60 minutes because the practice API accepts at most 3600 listened
 * seconds per session; a longer sit would be rejected on the first heartbeat
 * and silently lose its minutes.
 */
const PRESETS = [3, 5, 10, 15, 20, 30, 45, 60] as const;
const INTERVALS = [null, 3, 5, 10, 15] as const;

type Phase = 'idle' | 'running' | 'paused' | 'done';

export function TimerPage() {
  const { prefs, save } = usePrefs();
  const player = usePlayer();

  const [minutes, setMinutes] = useState(prefs.defaultTimerMinutes);
  const [interval, setIntervalMin] = useState<number | null>(prefs.intervalBellMinutes);
  const [breathGuide, setBreathGuide] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sessionId = useRef<number | null>(null);
  const startedAt = useRef<number>(0);
  // Accumulated seconds from previous run segments, so pausing does not make
  // the clock jump when it resumes.
  const banked = useRef(0);
  const lastBell = useRef(0);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  const total = minutes * 60;
  const remaining = Math.max(0, total - elapsed);
  const progress = total > 0 ? Math.min(1, elapsed / total) : 0;

  // Keep the picker in step with the saved preference until the person
  // overrides it here; after that their in-page choice wins for this visit.
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) {
      setMinutes(prefs.defaultTimerMinutes);
      setIntervalMin(prefs.intervalBellMinutes);
    }
  }, [prefs.defaultTimerMinutes, prefs.intervalBellMinutes]);

  const releaseWakeLock = useCallback(() => {
    void wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }, []);

  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLock.current = await navigator.wakeLock.request('screen');
      }
    } catch {
      // Not supported, or denied in the background — the timer still runs.
    }
  }, []);

  const finish = useCallback(
    async (status: 'completed' | 'abandoned') => {
      const secs = Math.round(
        banked.current + (startedAt.current ? (Date.now() - startedAt.current) / 1000 : 0),
      );
      const id = sessionId.current;
      sessionId.current = null;
      startedAt.current = 0;
      releaseWakeLock();
      setPhase(status === 'completed' ? 'done' : 'idle');
      if (status === 'completed' && prefs.bellEnabled) playBell(prefs.bellVolume);
      if (id !== null) {
        await api
          .post(`/api/practice/${id}/finish`, {
            status,
            listenedSec: Math.min(3600, secs),
            reason: status === 'abandoned' ? 'ended early' : null,
          })
          .catch(() => {});
        if (status === 'completed') {
          player.openReflectFor({
            sessionId: id,
            meditationId: TIMER_ITEM_ID,
            meditationTitle: TIMER_ITEM_TITLE,
          });
        }
      }
      if (status === 'abandoned') {
        banked.current = 0;
        setElapsed(0);
      }
    },
    [prefs.bellEnabled, prefs.bellVolume, player, releaseWakeLock],
  );

  const begin = async () => {
    setError(null);
    try {
      const { id } = await api.post<{ id: number }>('/api/practice/start', {
        meditationId: TIMER_ITEM_ID,
      });
      sessionId.current = id;
    } catch {
      // A sit that is not recorded is still a sit; say so rather than refusing
      // to start over a bookkeeping failure.
      setError('Could not open a practice record - the sit will not be saved to your history.');
    }
    banked.current = 0;
    lastBell.current = 0;
    setElapsed(0);
    startedAt.current = Date.now();
    setPhase('running');
    void requestWakeLock();
    if (prefs.bellEnabled) playBell(prefs.bellVolume);
  };

  const pause = () => {
    banked.current += (Date.now() - startedAt.current) / 1000;
    startedAt.current = 0;
    setPhase('paused');
    releaseWakeLock();
  };

  const resume = () => {
    startedAt.current = Date.now();
    setPhase('running');
    void requestWakeLock();
  };

  // The clock is driven from wall time, never by counting ticks: a tab that is
  // throttled in the background would otherwise finish a 20-minute sit several
  // minutes late.
  useEffect(() => {
    if (phase !== 'running') return;
    const tick = () => {
      const secs = banked.current + (Date.now() - startedAt.current) / 1000;
      setElapsed(secs);

      if (interval && prefs.bellEnabled) {
        const due = Math.floor(secs / (interval * 60));
        if (due > lastBell.current && secs < total - 5) {
          lastBell.current = due;
          playBell(prefs.bellVolume * 0.75);
        }
      }
      if (secs >= total) void finish('completed');
    };
    const h = window.setInterval(tick, 250);
    return () => window.clearInterval(h);
  }, [phase, total, interval, prefs.bellEnabled, prefs.bellVolume, finish]);

  // Heartbeat so a sit that ends in a closed tab still has its minutes.
  useEffect(() => {
    if (phase !== 'running' || sessionId.current === null) return;
    const h = window.setInterval(() => {
      const secs = Math.round(banked.current + (Date.now() - startedAt.current) / 1000);
      void api
        .post(`/api/practice/${sessionId.current}/beat`, { listenedSec: Math.min(3600, secs) })
        .catch(() => {});
    }, 15_000);
    return () => window.clearInterval(h);
  }, [phase]);

  // Re-acquire the screen lock when the tab comes back — browsers drop it on hide.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && phase === 'running' && !wakeLock.current) {
        void requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [phase, requestWakeLock]);

  useEffect(() => releaseWakeLock, [releaseWakeLock]);

  const running = phase === 'running' || phase === 'paused';
  const breathing = breathGuide && running;
  const breathPhase = breathPhaseAt(elapsed);
  const breathLabel = BREATH_LABEL[breathPhase];
  // Where the orb is heading and how long it has to get there. On pause the
  // transition length is zeroed, so it stops mid-breath instead of drifting.
  const orbTarget = breathPhase === 'out' ? BREATH_MIN_SCALE : 1;
  const orbSeconds = breathPhase === 'in' ? BREATH.in : breathPhase === 'out' ? BREATH.out : 0;

  return (
    <div className={`timer-page${running ? ' timer-live' : ''}`}>
      {!running && phase !== 'done' && (
        <div className="page-head">
          <h1>Sit</h1>
          <p className="lede">
            Nothing to listen to - a bowl to open, optional bells along the way, and one to close.
            It counts toward your practice just like a recording does.
          </p>
        </div>
      )}

      <div className="timer-stage" data-phase={breathing ? breathPhase : undefined}>
        <TimerRing progress={progress} />
        {/* The orb is one element whose transform follows the breath: the
            target scale and the transition length change at every phase
            boundary, so the browser draws the 4s rise and the 6s fall as one
            smooth movement each rather than the timer stepping it. Paused, it
            holds wherever it was. */}
        <div
          className={`breath-orb${phase === 'running' && !breathing ? ' breath-orb--idle' : ''}`}
          style={
            breathing
              ? {
                  transform: `scale(${orbTarget})`,
                  transitionDuration: `${phase === 'running' ? orbSeconds : 0}s`,
                }
              : undefined
          }
          aria-hidden="true"
        >
          <span className="breath-orb__core" />
          <span className="breath-orb__rim" />
        </div>
        <div className="timer-readout">
          {phase === 'done' ? (
            <>
              <div className="t-big">Done</div>
              <div className="t-sub">
                {minutes} minute{minutes === 1 ? '' : 's'} sat
              </div>
            </>
          ) : breathing ? (
            <div className="t-phase" aria-live="polite" key={breathPhase}>
              {phase === 'paused' ? 'Paused' : breathLabel}
            </div>
          ) : (
            <>
              <div className="t-big" aria-live="off">
                {formatClock(running ? remaining : total)}
              </div>
              <div className="t-sub">
                {phase === 'paused' ? 'Paused' : running ? 'Remaining' : `${minutes} minute sit`}
              </div>
            </>
          )}
        </div>
      </div>
      {breathing && (
        <div className="timer-under" aria-live="off">
          <span className="timer-under__time">{formatClock(remaining)}</span>
          <span className="timer-under__label">remaining</span>
        </div>
      )}

      {error && (
        <p className="notice" style={{ maxWidth: 460, margin: '0 auto 16px' }}>
          {error}
        </p>
      )}

      {phase === 'idle' && (
        <div className="timer-setup">
          <div className="ob-field">
            <label htmlFor="tm-len">Length</label>
            <div className="chip-row" id="tm-len">
              {PRESETS.map((m) => (
                <button
                  key={m}
                  className="chip"
                  aria-pressed={minutes === m}
                  onClick={() => {
                    touched.current = true;
                    setMinutes(m);
                  }}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          <div className="ob-field">
            <label htmlFor="tm-int">Bell along the way</label>
            <div className="chip-row" id="tm-int">
              {INTERVALS.map((v) => (
                <button
                  key={String(v)}
                  className="chip"
                  aria-pressed={interval === v}
                  onClick={() => {
                    touched.current = true;
                    setIntervalMin(v);
                  }}
                >
                  {v === null ? 'None' : `Every ${v}m`}
                </button>
              ))}
            </div>
          </div>

          <div className="ob-field">
            <label>Breath guide</label>
            <div className="chip-row">
              <button
                className="chip"
                aria-pressed={breathGuide}
                onClick={() => setBreathGuide((v) => !v)}
              >
                {breathGuide ? 'On' : 'Off'}
              </button>
              <span className="hint">
                {BREATH.in} in · {BREATH.hold} hold · {BREATH.out} out
              </span>
            </div>
          </div>

          <div className="timer-actions">
            <button className="btn btn-primary btn-lg" onClick={() => void begin()}>
              <Icon name="play" size={17} />
              Begin
            </button>
            {(minutes !== prefs.defaultTimerMinutes || interval !== prefs.intervalBellMinutes) && (
              <button
                className="btn btn-quiet"
                onClick={() =>
                  void save({ defaultTimerMinutes: minutes, intervalBellMinutes: interval })
                }
              >
                Make this my default
              </button>
            )}
          </div>
        </div>
      )}

      {running && (
        <div className="timer-actions">
          {phase === 'running' ? (
            <button className="btn btn-ghost btn-lg" onClick={pause}>
              <Icon name="pause" size={17} />
              Pause
            </button>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={resume}>
              <Icon name="play" size={17} />
              Resume
            </button>
          )}
          <button className="btn btn-quiet" onClick={() => void finish('abandoned')}>
            End early
          </button>
        </div>
      )}

      {phase === 'done' && (
        <div className="timer-actions">
          <button
            className="btn btn-primary btn-lg"
            onClick={() => {
              setPhase('idle');
              setElapsed(0);
              banked.current = 0;
            }}
          >
            Sit again
          </button>
        </div>
      )}
    </div>
  );
}

function TimerRing({ progress }: { progress: number }) {
  const r = 108;
  const c = 2 * Math.PI * r;
  return (
    <svg className="timer-ring" viewBox="0 0 240 240" aria-hidden="true">
      <defs>
        <linearGradient
          id="tm-sweep"
          x1="24"
          y1="48"
          x2="216"
          y2="192"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FFC04A" />
          <stop offset="46%" stopColor="#F04C8A" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <circle cx="120" cy="120" r={r} className="timer-ring__track" strokeWidth="6" fill="none" />
      <circle
        cx="120"
        cy="120"
        r={r}
        stroke="url(#tm-sweep)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${c * progress} ${c}`}
        transform="rotate(-90 120 120)"
        style={{ transition: 'stroke-dasharray 260ms linear' }}
      />
    </svg>
  );
}
