import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { MeditationDetailDto, TrackDto } from '@zenport/shared';
import { api } from '../api.ts';
import { usePrefs } from '../prefs.tsx';
import { playBell } from './bell.ts';

export interface ReflectPrompt {
  sessionId: number;
  meditationId: string;
  meditationTitle: string;
}

export interface PlayerSettings {
  leadInSec: number;
  bellsEveryMin: number;
  endAfterMin: number;
  speed: number;
  volume: number;
}

interface PlayerApi {
  item: MeditationDetailDto | null;
  track: TrackDto | null;
  trackIndex: number;
  playing: boolean;
  position: number;
  duration: number;
  leadInRemaining: number | null;
  practiceElapsed: number;
  focus: boolean;
  wakeLockSupported: boolean;
  wakeLockOn: boolean;
  wakeLockNote: string | null;
  settings: PlayerSettings;
  reflect: ReflectPrompt | null;

  start: (item: MeditationDetailDto, opts?: { trackId?: string; resumeSec?: number }) => void;
  toggle: () => void;
  seek: (sec: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  setFocus: (v: boolean) => void;
  updateSettings: (patch: Partial<PlayerSettings>) => void;
  toggleWakeLock: () => void;
  stop: (how: 'finish' | 'abandon') => void;
  clearReflect: () => void;
  openReflectFor: (prompt: ReflectPrompt) => void;
}

const PlayerContext = createContext<PlayerApi | null>(null);

export function usePlayer(): PlayerApi {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer outside provider');
  return ctx;
}

const SETTINGS_KEY = 'zenport-player-settings';

function loadSettings(): PlayerSettings {
  const fallback: PlayerSettings = {
    leadInSec: 0,
    bellsEveryMin: 0,
    endAfterMin: 0,
    speed: 1,
    volume: 1,
  };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return fallback;
  }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePrefs();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [item, setItem] = useState<MeditationDetailDto | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [leadInRemaining, setLeadInRemaining] = useState<number | null>(null);
  const [practiceElapsed, setPracticeElapsed] = useState(0);
  const [focus, setFocus] = useState(false);
  const [settings, setSettings] = useState<PlayerSettings>(loadSettings);
  const [reflect, setReflect] = useState<ReflectPrompt | null>(null);
  const [wakeLockOn, setWakeLockOn] = useState(false);
  const [wakeLockNote, setWakeLockNote] = useState<string | null>(null);

  const sessionRef = useRef<number | null>(null);
  const listenedRef = useRef(0); // unsent listened seconds
  const lastTickRef = useRef<number | null>(null);
  const lastBellMinRef = useRef(0);
  const startedAtRef = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  // Read inside the long-lived 'ended' listener, which must not be torn down
  // and rebuilt every time a preference changes mid-playback.
  const autoplayRef = useRef(prefs.autoplayNext);
  autoplayRef.current = prefs.autoplayNext;
  const leadTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fadingRef = useRef(false);
  const itemRef = useRef<MeditationDetailDto | null>(null);
  itemRef.current = item;
  const trackIndexRef = useRef(0);
  trackIndexRef.current = trackIndex;

  const wakeLockSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  const audio = () => {
    if (!audioRef.current) {
      const el = new Audio();
      el.preload = 'metadata';
      audioRef.current = el;
    }
    return audioRef.current;
  };

  const track = item?.tracks[trackIndex] ?? null;

  const updateSettings = useCallback((patch: Partial<PlayerSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // Private mode etc. — settings just won't persist.
      }
      if (patch.volume !== undefined) audio().volume = patch.volume;
      if (patch.speed !== undefined) audio().playbackRate = patch.speed;
      return next;
    });
  }, []);

  const sendBeat = useCallback(() => {
    const sid = sessionRef.current;
    const delta = Math.floor(listenedRef.current);
    if (sid && delta > 0) {
      listenedRef.current -= delta;
      void api.post(`/api/practice/${sid}/beat`, { listenedSec: delta }).catch(() => {});
    }
  }, []);

  const saveProgress = useCallback(() => {
    const el = audioRef.current;
    const it = itemRef.current;
    const tr = it?.tracks[trackIndexRef.current];
    if (el && tr && el.currentTime > 0) {
      void api.put(`/api/progress/${tr.id}`, { positionSec: el.currentTime }).catch(() => {});
    }
  }, []);

  const loadTrack = useCallback(
    (it: MeditationDetailDto, index: number, startAt = 0, autoplay = true) => {
      const tr = it.tracks[index];
      if (!tr) return;
      const el = audio();
      el.src = `/api/media/track/${tr.id}`;
      el.currentTime = startAt;
      el.volume = settings.volume;
      el.playbackRate = settings.speed;
      setTrackIndex(index);
      setPosition(startAt);
      setDuration(tr.durationSec ?? 0);
      if (autoplay) {
        void el.play().then(
          () => setPlaying(true),
          () => setPlaying(false),
        );
      }
    },
    [settings.volume, settings.speed],
  );

  const finishInternal = useCallback(
    (status: 'completed' | 'abandoned', reason: string) => {
      sendBeat();
      saveProgress();
      const sid = sessionRef.current;
      const it = itemRef.current;
      if (sid && it) {
        void api
          .post(`/api/practice/${sid}/finish`, { status, reason })
          .then(() => {
            if (status === 'completed') {
              setReflect({ sessionId: sid, meditationId: it.id, meditationTitle: it.title });
            }
          })
          .catch(() => {});
      }
      sessionRef.current = null;
      startedAtRef.current = null;
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
      setPlaying(false);
      setItem(null);
      setFocus(false);
      setLeadInRemaining(null);
      fadingRef.current = false;
      if (leadTimerRef.current) clearInterval(leadTimerRef.current);
      if (wakeLockRef.current) {
        void wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
        setWakeLockOn(false);
      }
    },
    [sendBeat, saveProgress],
  );

  const start = useCallback(
    (it: MeditationDetailDto, opts?: { trackId?: string; resumeSec?: number }) => {
      // Close any previous session honestly before starting anew.
      if (sessionRef.current) finishInternal('abandoned', 'switched meditation');
      setItem(it);
      lastBellMinRef.current = 0;
      listenedRef.current = 0;
      lastTickRef.current = null;
      setPracticeElapsed(0);
      startedAtRef.current = Date.now();

      const index = opts?.trackId
        ? Math.max(
            0,
            it.tracks.findIndex((t) => t.id === opts.trackId),
          )
        : 0;
      const startAt = opts?.resumeSec ?? 0;

      void api
        .post<{ id: number }>('/api/practice/start', { meditationId: it.id })
        .then((r) => {
          sessionRef.current = r.id;
        })
        .catch(() => {});

      if (settings.leadInSec > 0) {
        // A settling breath before the audio begins.
        let remain = settings.leadInSec;
        setLeadInRemaining(remain);
        loadTrack(it, index, startAt, false);
        if (leadTimerRef.current) clearInterval(leadTimerRef.current);
        leadTimerRef.current = setInterval(() => {
          remain -= 1;
          if (remain <= 0) {
            if (leadTimerRef.current) clearInterval(leadTimerRef.current);
            setLeadInRemaining(null);
            const el = audio();
            void el.play().then(
              () => setPlaying(true),
              () => setPlaying(false),
            );
          } else {
            setLeadInRemaining(remain);
          }
        }, 1000);
      } else {
        setLeadInRemaining(null);
        loadTrack(it, index, startAt, true);
      }
    },
    [finishInternal, loadTrack, settings.leadInSec],
  );

  const stop = useCallback(
    (how: 'finish' | 'abandon') => {
      finishInternal(
        how === 'finish' ? 'completed' : 'abandoned',
        how === 'finish' ? 'stopped early' : 'left practice',
      );
    },
    [finishInternal],
  );

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (leadInRemaining !== null) {
      // Skipping the lead-in starts the audio now.
      if (leadTimerRef.current) clearInterval(leadTimerRef.current);
      setLeadInRemaining(null);
      void el.play().then(() => setPlaying(true));
      return;
    }
    if (el.paused) {
      void el.play().then(() => setPlaying(true));
    } else {
      el.pause();
      setPlaying(false);
      sendBeat();
      saveProgress();
    }
  }, [leadInRemaining, sendBeat, saveProgress]);

  const seek = useCallback((sec: number) => {
    const el = audioRef.current;
    if (el) {
      el.currentTime = sec;
      setPosition(sec);
    }
  }, []);

  const nextTrack = useCallback(() => {
    const it = itemRef.current;
    if (!it) return;
    const idx = trackIndexRef.current;
    if (idx < it.tracks.length - 1) {
      saveProgress();
      loadTrack(it, idx + 1, 0, true);
    }
  }, [loadTrack, saveProgress]);

  const prevTrack = useCallback(() => {
    const it = itemRef.current;
    if (!it) return;
    const el = audioRef.current;
    const idx = trackIndexRef.current;
    if (el && el.currentTime > 5) {
      el.currentTime = 0;
    } else if (idx > 0) {
      loadTrack(it, idx - 1, 0, true);
    }
  }, [loadTrack]);

  const toggleWakeLock = useCallback(() => {
    if (!wakeLockSupported) {
      setWakeLockNote(
        'This browser cannot keep the screen awake - ZenPort still plays with the screen off where the OS allows it.',
      );
      return;
    }
    if (wakeLockRef.current) {
      void wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
      setWakeLockOn(false);
      return;
    }
    void (
      navigator as Navigator & {
        wakeLock: {
          request: (t: 'screen') => Promise<{
            release: () => Promise<void>;
            addEventListener: (t: string, cb: () => void) => void;
          }>;
        };
      }
    ).wakeLock
      .request('screen')
      .then((lock) => {
        wakeLockRef.current = lock;
        setWakeLockOn(true);
        setWakeLockNote(null);
        lock.addEventListener('release', () => {
          wakeLockRef.current = null;
          setWakeLockOn(false);
        });
      })
      .catch(() => {
        setWakeLockNote(
          'The browser declined the wake lock (often battery saver). Playback continues; the screen may sleep.',
        );
      });
  }, [wakeLockSupported]);

  // Wire the audio element once.
  useEffect(() => {
    const el = audio();
    const onTime = () => {
      const now = performance.now();
      if (!el.paused && lastTickRef.current !== null) {
        const dt = (now - lastTickRef.current) / 1000;
        if (dt > 0 && dt < 2.5) listenedRef.current += dt;
      }
      lastTickRef.current = now;
      setPosition(el.currentTime);
    };
    const onLoaded = () => {
      setDuration(el.duration || 0);
      const it = itemRef.current;
      const tr = it?.tracks[trackIndexRef.current];
      if (tr && Number.isFinite(el.duration) && el.duration > 0 && tr.durationSec === null) {
        void api
          .patch(`/api/tracks/${tr.id}/duration`, { durationSec: Math.round(el.duration) })
          .catch(() => {});
      }
    };
    const onEnded = () => {
      const it = itemRef.current;
      if (!it) return;
      const idx = trackIndexRef.current;
      if (idx < it.tracks.length - 1) {
        if (!autoplayRef.current) {
          // "Continue to the next track" is off: stop here rather than rolling
          // on. The session stays open so Next or Play resumes it — ending the
          // practice would throw away a multi-part sit the person paused in
          // the middle of on purpose.
          setPlaying(false);
          return;
        }
        loadTrack(it, idx + 1, 0, true);
      } else {
        finishInternal('completed', 'finished');
      }
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => {
      lastTickRef.current = performance.now();
      setPlaying(true);
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('ended', onEnded);
    el.addEventListener('pause', onPause);
    el.addEventListener('play', onPlay);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('play', onPlay);
    };
  }, [loadTrack, finishInternal]);

  // Periodic work: heartbeats, progress saves, bells, end timer, elapsed.
  useEffect(() => {
    if (!item) return;
    const interval = setInterval(() => {
      if (startedAtRef.current) {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setPracticeElapsed(elapsed);

        // Interval bells, relative to practice start.
        if (settings.bellsEveryMin > 0 && playing) {
          const min = Math.floor(elapsed / 60);
          if (min > 0 && min % settings.bellsEveryMin === 0 && lastBellMinRef.current !== min) {
            lastBellMinRef.current = min;
            playBell(settings.volume);
          }
        }

        // Gentle end timer: fade over the final 10 seconds, then finish.
        if (settings.endAfterMin > 0 && !fadingRef.current) {
          const endAt = settings.endAfterMin * 60;
          if (elapsed >= endAt - 10) {
            fadingRef.current = true;
            const el = audioRef.current;
            const startVol = el?.volume ?? 1;
            let step = 0;
            const fade = setInterval(() => {
              step++;
              if (el) el.volume = Math.max(0, startVol * (1 - step / 10));
              if (step >= 10) {
                clearInterval(fade);
                playBell(settings.volume);
                finishInternal('completed', 'end timer');
              }
            }, 1000);
          }
        }
      }
      sendBeat();
      saveProgress();
    }, 5000);
    return () => clearInterval(interval);
  }, [
    item,
    playing,
    settings.bellsEveryMin,
    settings.endAfterMin,
    settings.volume,
    sendBeat,
    saveProgress,
    finishInternal,
  ]);

  // Media Session integration (lock screen / hardware keys).
  useEffect(() => {
    if (!('mediaSession' in navigator) || !item || !track) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({
      title: track.title,
      artist: item.creator,
      album: item.title,
      artwork: item.coverId ? [{ src: `/api/media/asset/${item.coverId}`, sizes: '512x512' }] : [],
    });
    const safe = (action: MediaSessionAction, fn: () => void) => {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        // Unsupported action on this browser.
      }
    };
    safe('play', toggle);
    safe('pause', toggle);
    safe('previoustrack', prevTrack);
    safe('nexttrack', nextTrack);
    safe('seekbackward', () => seek(Math.max(0, (audioRef.current?.currentTime ?? 0) - 15)));
    safe('seekforward', () => seek((audioRef.current?.currentTime ?? 0) + 15));
    return () => {
      for (const a of [
        'play',
        'pause',
        'previoustrack',
        'nexttrack',
        'seekbackward',
        'seekforward',
      ] as MediaSessionAction[]) {
        try {
          ms.setActionHandler(a, null);
        } catch {
          /* noop */
        }
      }
    };
  }, [item, track, toggle, prevTrack, nextTrack, seek]);

  // Save progress when the tab hides; re-acquire wake lock on return.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        sendBeat();
        saveProgress();
      } else if (wakeLockOn && !wakeLockRef.current && wakeLockSupported) {
        toggleWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [sendBeat, saveProgress, wakeLockOn, wakeLockSupported, toggleWakeLock]);

  const value = useMemo<PlayerApi>(
    () => ({
      item,
      track,
      trackIndex,
      playing,
      position,
      duration,
      leadInRemaining,
      practiceElapsed,
      focus,
      wakeLockSupported,
      wakeLockOn,
      wakeLockNote,
      settings,
      reflect,
      start,
      toggle,
      seek,
      nextTrack,
      prevTrack,
      setFocus,
      updateSettings,
      toggleWakeLock,
      stop,
      clearReflect: () => setReflect(null),
      openReflectFor: (p) => setReflect(p),
    }),
    [
      item,
      track,
      trackIndex,
      playing,
      position,
      duration,
      leadInRemaining,
      practiceElapsed,
      focus,
      wakeLockSupported,
      wakeLockOn,
      wakeLockNote,
      settings,
      reflect,
      start,
      toggle,
      seek,
      nextTrack,
      prevTrack,
      updateSettings,
      toggleWakeLock,
      stop,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
