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
import { Icon, Sheet, Switch } from '../components/ui.tsx';
import { hapticKind, playBreathPhase } from '../player/haptics.ts';

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
  const [sheet, setSheet] = useState<null | 'length' | 'bells' | 'breath'>(null);
  const haptics = hapticKind();
  const [feel, setFeelState] = useState(() => {
    try {
      return localStorage.getItem('zenport-breath-haptics') === '1';
    } catch {
      return false;
    }
  });
  const setFeel = (v: boolean) => {
    setFeelState(v);
    try {
      localStorage.setItem('zenport-breath-haptics', v ? '1' : '0');
    } catch {
      /* private mode */
    }
  };

  // Feel each phase: taps that gather through the in-breath and spread out
  // through the out-breath. Stops the moment the sit pauses or ends.
  useEffect(() => {
    if (!feel || !breathing || phase !== 'running') return;
    const secs = breathPhase === 'in' ? BREATH.in : breathPhase === 'out' ? BREATH.out : 0;
    return playBreathPhase(breathPhase, secs);
  }, [feel, breathing, phase, breathPhase]);

  const pick = (fn: () => void) => {
    touched.current = true;
    fn();
    setSheet(null);
  };

  const bellLabel = interval === null ? 'No bells' : `Every ${interval} min`;

  return (
    <div className={`timer-page sit${running ? ' timer-live' : ''}`}>
      {!running && phase !== 'done' && (
        <div className="page-head sit-head">
          <h1>Breathe</h1>
          <p className="lede">A quiet timer. A bowl to open, one to close.</p>
        </div>
      )}

      <Halo
        progress={phase === 'done' ? 1 : progress}
        live={phase === 'running'}
        started={running || phase === 'done'}
        breath={breathing ? breathPhase : null}
      >
        {phase === 'done' ? (
          <>
            <div className="sit-time">Done</div>
            <div className="sit-sub">
              {minutes} minute{minutes === 1 ? '' : 's'} sat
            </div>
          </>
        ) : breathing ? (
          <>
            <div className="sit-breath" aria-live="polite" key={breathPhase}>
              {phase === 'paused' ? 'Paused' : BREATH_LABEL[breathPhase]}
            </div>
            <div className="sit-sub sit-sub-time">{formatClock(remaining)}</div>
          </>
        ) : (
          <>
            <div className="sit-time" aria-live="off">
              {formatClock(running ? remaining : total)}
            </div>
            <div className="sit-sub">
              {phase === 'paused' ? 'Paused' : running ? 'remaining' : 'minutes'}
            </div>
          </>
        )}
      </Halo>

      {error && <p className="notice sit-note">{error}</p>}

      {phase === 'idle' && (
        <div className="sit-setup">
          <div className="sit-opts" role="group" aria-label="Breathe options">
            <button className="sit-opt" onClick={() => setSheet('length')}>
              <Icon name="timer" size={18} />
              <span className="v">{minutes} min</span>
              <span className="k">Length</span>
            </button>
            <button
              className={`sit-opt${interval !== null ? ' on' : ''}`}
              onClick={() => setSheet('bells')}
            >
              <Icon name="bell" size={18} />
              <span className="v">{interval === null ? 'None' : `${interval} min`}</span>
              <span className="k">Bells</span>
            </button>
            <button
              className={`sit-opt${breathGuide ? ' on' : ''}`}
              onClick={() => setSheet('breath')}
            >
              <Icon name="sprout" size={18} />
              <span className="v">{breathGuide ? 'On' : 'Off'}</span>
              <span className="k">Breath guide</span>
            </button>
          </div>

          <button className="sit-begin" onClick={() => void begin()}>
            <Icon name="play" size={18} />
            Begin
          </button>
          {(minutes !== prefs.defaultTimerMinutes || interval !== prefs.intervalBellMinutes) && (
            <button
              className="sit-default"
              onClick={() =>
                void save({ defaultTimerMinutes: minutes, intervalBellMinutes: interval })
              }
            >
              Make {minutes} min{interval !== null ? `, ${bellLabel.toLowerCase()}` : ''} my default
            </button>
          )}
        </div>
      )}

      {running && (
        <div className="sit-live">
          <button className="sit-end" onClick={() => void finish('abandoned')}>
            End early
          </button>
          <button
            className="sit-toggle"
            onClick={phase === 'running' ? pause : resume}
            aria-label={phase === 'running' ? 'Pause' : 'Resume'}
          >
            <Icon name={phase === 'running' ? 'pause' : 'play'} size={26} />
          </button>
          <span className="sit-live-meta">
            {interval !== null ? <Icon name="bell" size={15} /> : null}
            {breathGuide ? <Icon name="sprout" size={15} /> : null}
          </span>
        </div>
      )}

      {phase === 'done' && (
        <div className="sit-setup">
          <button
            className="sit-begin"
            onClick={() => {
              setPhase('idle');
              setElapsed(0);
              banked.current = 0;
            }}
          >
            Breathe again
          </button>
        </div>
      )}

      {sheet === 'length' && (
        <Sheet title="Length" onClose={() => setSheet(null)} labelId="sit-len">
          <div className="sit-len-grid" role="radiogroup" aria-label="Length">
            {PRESETS.map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={minutes === m}
                className={`sit-len${minutes === m ? ' on' : ''}`}
                onClick={() => pick(() => setMinutes(m))}
              >
                <span className="n">{m}</span>
                <span className="u">min</span>
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {sheet === 'bells' && (
        <Sheet title="Bells along the way" onClose={() => setSheet(null)} labelId="sit-bells">
          <p className="sit-sheet-lede">
            A soft bowl at a steady interval, so you know where you are without looking.
          </p>
          <div className="sit-list" role="radiogroup" aria-label="Interval bell">
            {INTERVALS.map((v) => (
              <button
                key={String(v)}
                role="radio"
                aria-checked={interval === v}
                className={`sit-row${interval === v ? ' on' : ''}`}
                onClick={() => pick(() => setIntervalMin(v))}
              >
                <span>{v === null ? 'No bells' : `Every ${v} minutes`}</span>
                {interval === v && <Icon name="check" size={18} />}
              </button>
            ))}
          </div>
          <button className="ps-try" onClick={() => playBell(prefs.bellVolume)}>
            <Icon name="bell" size={14} /> Hear the bell
          </button>
        </Sheet>
      )}

      {sheet === 'breath' && (
        <Sheet title="Breath guide" onClose={() => setSheet(null)} labelId="sit-breath">
          <p className="sit-sheet-lede">
            The halo swells as you breathe in and settles as you breathe out - a longer out-breath
            than in, a common calming rhythm.
          </p>
          <div className="sit-pattern" aria-hidden="true">
            <span style={{ flex: BREATH.in }}>
              In <b>{BREATH.in}s</b>
            </span>
            <span style={{ flex: Math.max(BREATH.hold, 1.4) }}>
              Hold <b>{BREATH.hold}s</b>
            </span>
            <span style={{ flex: BREATH.out }}>
              Out <b>{BREATH.out}s</b>
            </span>
          </div>
          {haptics !== 'none' ? (
            <div className="set-switch sit-switch">
              <div>
                <div className="set-switch-t">Feel the breath</div>
                <div className="set-switch-h">
                  {haptics === 'vibrate'
                    ? 'Gentle vibration that gathers as you breathe in and eases as you breathe out.'
                    : 'Light taps on iPhone (iOS 18 and later), gathering as you breathe in and easing out. Keep the screen on, and System Haptics on (Settings › Sounds & Haptics).'}{' '}
                  <button
                    type="button"
                    className="sit-try"
                    onClick={() => playBreathPhase('in', BREATH.in)}
                  >
                    Try it
                  </button>
                </div>
              </div>
              <Switch checked={feel} onChange={setFeel} label="Feel the breath" />
            </div>
          ) : (
            <p className="set-switch-h" style={{ marginBottom: 12 }}>
              Haptics need a phone - this device cannot vibrate from the web.
            </p>
          )}
          <div className="set-switch sit-switch">
            <div>
              <div className="set-switch-t">Guide my breathing</div>
              <div className="set-switch-h">
                You can still just sit - the timer runs either way.
              </div>
            </div>
            <Switch checked={breathGuide} onChange={setBreathGuide} label="Guide my breathing" />
          </div>
        </Sheet>
      )}
    </div>
  );
}

/**
 * The halo: a hairline progress ring with a bead at its head, and inside it
 * three thin rings over a faint glow. With the breath guide on, the rings
 * swell outward one after another on the in-breath and settle back on the
 * out-breath, a ripple rather than a ball; without it they drift, barely.
 * Everything is stroke, not fill, so the colours stay light.
 */
function Halo({
  progress,
  live,
  started,
  breath,
  children,
}: {
  progress: number;
  live: boolean;
  started: boolean;
  breath: 'in' | 'hold' | 'out' | null;
  children: React.ReactNode;
}) {
  const R = 112;
  const C = 2 * Math.PI * R;
  const angle = progress * 2 * Math.PI - Math.PI / 2;
  const bx = 120 + R * Math.cos(angle);
  const by = 120 + R * Math.sin(angle);

  // Per-ring targets and timing while guided. Paused (live false), the
  // transition is zeroed so the rings hold where they are.
  const inhale = breath === 'in' || breath === 'hold';
  const secs = breath === 'in' ? BREATH.in : breath === 'out' ? BREATH.out : 0;
  const ring = (i: number) =>
    breath
      ? {
          transform: `scale(${inhale ? [1.18, 1.32, 1.46][i] : [BREATH_MIN_SCALE + 0.2, 0.84, 0.9][i]})`,
          transitionDuration: `${live ? secs : 0}s`,
          transitionDelay: `${live ? i * 0.35 : 0}s`,
        }
      : undefined;

  return (
    <div
      className={`halo${breath ? ' guided' : ''}${live ? ' live' : ''}`}
      data-breath={breath ?? undefined}
    >
      <svg className="halo-svg" viewBox="0 0 240 240" aria-hidden="true">
        <defs>
          <linearGradient
            id="halo-sweep"
            x1="20"
            y1="40"
            x2="220"
            y2="200"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FFC04A" />
            <stop offset="50%" stopColor="#F04C8A" />
            <stop offset="100%" stopColor="#8B5CF6" />
          </linearGradient>
          <radialGradient id="halo-glow">
            <stop offset="0%" stopColor="#F04C8A" stopOpacity="0.2" />
            <stop offset="55%" stopColor="#8B5CF6" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0" />
          </radialGradient>
        </defs>

        <circle
          className="halo-glow"
          cx="120"
          cy="120"
          r="96"
          fill="url(#halo-glow)"
          style={ring(0)}
        />
        {[0, 1, 2].map((i) => (
          <g key={i} className={`halo-r halo-r${i}`} style={ring(i)}>
            <circle cx="120" cy="120" r="60" fill="none" stroke="url(#halo-sweep)" />
          </g>
        ))}

        <circle className="halo-track" cx="120" cy="120" r={R} fill="none" />
        {started && (
          <>
            <circle
              className="halo-progress"
              cx="120"
              cy="120"
              r={R}
              fill="none"
              stroke="url(#halo-sweep)"
              strokeDasharray={`${C * progress} ${C}`}
              transform="rotate(-90 120 120)"
            />
            <circle className="halo-bead" cx={bx} cy={by} r="3.2" />
          </>
        )}
      </svg>
      <div className="halo-center">{children}</div>
    </div>
  );
}
