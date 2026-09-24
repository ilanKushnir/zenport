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
import { isVideoExt } from '@zenport/shared';
import { api, ApiError } from '../api.ts';
import { queueOfflineSession } from '../offline.ts';
import { usePrefs } from '../prefs.tsx';
import { playBell } from './bell.ts';

export interface ReflectPrompt {
  sessionId: number;
  meditationId: string;
  meditationTitle: string;
  /** How long the sit lasted, for the reflection's opening line. */
  minutes?: number;
  /** A course or talk reads "you finished", a practice "you sat with". */
  learning?: boolean;
}

export interface PlayerSettings {
  leadInSec: number;
  bellsEveryMin: number;
  endAfterMin: number;
  speed: number;
  volume: number;
  /** Hold a screen wake lock while audio plays, so a long sit is never cut off by auto-lock. */
  keepAwake: boolean;
}

interface PlayerApi {
  item: MeditationDetailDto | null;
  track: TrackDto | null;
  trackIndex: number;
  playing: boolean;
  /** The current track is a video; the full player shows `videoEl`. */
  isVideo: boolean;
  /** A course or talk: studied, not practised - wording, no reflection. */
  learning: boolean;
  /** Tracks of the current item this account has finished, kept live. */
  completedIds: ReadonlySet<string>;
  /** Tick a part done or not done by hand; kept in step with any open page. */
  setTrackDone: (trackId: string, done: boolean) => Promise<void>;
  videoEl: HTMLVideoElement | null;
  /** Audio wanted but not arriving yet (loading, or recovering from a dropout). */
  buffering: boolean;
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
  /** Relative seek, clamped to the track. */
  skip: (deltaSec: number) => void;
  playTrack: (index: number) => void;
  nextTrack: () => void;
  prevTrack: () => void;
  setFocus: (v: boolean) => void;
  updateSettings: (patch: Partial<PlayerSettings>) => void;
  toggleWakeLock: () => void;
  /** `forget` skips saving the place - for Start over, which is about to erase it. */
  stop: (how: 'finish' | 'abandon', opts?: { forget?: boolean }) => void;
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
    keepAwake: true,
  };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return fallback;
  }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePrefs();
  // The active media element. Audio tracks play through an <audio> element and
  // video through a <video>: on iOS only audio keeps going with the screen
  // locked, so a long meditation must never be routed through a video element.
  const audioRef = useRef<HTMLMediaElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [completedIds, setCompletedIds] = useState<ReadonlySet<string>>(new Set());
  const completedRef = useRef<Set<string>>(new Set());
  // Marks a track done once, tells the server, and tells any open page to
  // refresh its progress.
  // Where each lesson of the item in hand was left, so starting any lesson of
  // a course or talk - from the list, Next, or the lesson sheet - picks up
  // there. Kept here too because the item the player holds does not refetch.
  const placesRef = useRef<Map<string, number>>(new Map());
  // A seek waiting for the media to know its length. Until it lands nothing is
  // saved or marked done: on iOS, setting currentTime before metadata is
  // ignored, and saving the 0:01 that plays instead would erase the real place.
  const pendingSeekRef = useRef<number | null>(null);
  /** A sit started with no connection: recorded on the device instead. */
  const offlineRef = useRef<{ itemId: string; startedAt: string } | null>(null);
  // Lessons ticked not done by hand while the item is in the player: playing
  // on past 95% must not quietly tick them again. Played to the very end, they
  // count once more.
  const untickedRef = useRef<Set<string>>(new Set());
  const markDone = useCallback((trackId: string, opts?: { auto?: boolean }) => {
    if (opts?.auto && untickedRef.current.has(trackId)) return;
    placesRef.current.delete(trackId);
    if (completedRef.current.has(trackId)) return;
    completedRef.current.add(trackId);
    setCompletedIds(new Set(completedRef.current));
    void api
      .put(`/api/tracks/${trackId}/completed`, { completed: true })
      .then(() => window.dispatchEvent(new Event('zenport:progress')))
      .catch(() => {});
  }, []);
  /** Tick a part done or not done by hand - from the player or the item's page. */
  const setTrackDone = useCallback(async (trackId: string, done: boolean) => {
    const inHand = itemRef.current?.tracks.some((t) => t.id === trackId) ?? false;
    if (inHand) {
      if (done) {
        untickedRef.current.delete(trackId);
        completedRef.current.add(trackId);
        placesRef.current.delete(trackId);
      } else {
        untickedRef.current.add(trackId);
        completedRef.current.delete(trackId);
      }
      setCompletedIds(new Set(completedRef.current));
    }
    try {
      await api.put(`/api/tracks/${trackId}/completed`, { completed: done });
    } finally {
      window.dispatchEvent(new Event('zenport:progress'));
    }
  }, []);
  const [item, setItem] = useState<MeditationDetailDto | null>(null);
  const [trackIndex, setTrackIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
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
  // What the person asked for, as opposed to what the element happens to be
  // doing: a dropout pauses the element, but they still want to be playing.
  const wantPlayRef = useRef(false);
  const retriesRef = useRef(0);
  const lastGoodPosRef = useRef(0);
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

  const mediaFor = (kind: 'audio' | 'video'): HTMLMediaElement => {
    if (kind === 'audio') {
      if (!audioElRef.current) {
        const el = new Audio();
        el.preload = 'auto';
        audioElRef.current = el;
      }
      return audioElRef.current;
    }
    if (!videoElRef.current) {
      const el = document.createElement('video');
      el.preload = 'auto';
      el.playsInline = true;
      el.setAttribute('playsinline', '');
      el.className = 'zp-video';
      // Parked in the document while no stage shows it, so it keeps playing
      // (a media element removed from the document pauses).
      let home = document.getElementById('zp-video-home');
      if (!home) {
        home = document.createElement('div');
        home.id = 'zp-video-home';
        home.setAttribute('aria-hidden', 'true');
        document.body.appendChild(home);
      }
      home.appendChild(el);
      videoElRef.current = el;
    }
    return videoElRef.current;
  };

  const audio = (): HTMLMediaElement => audioRef.current ?? (audioRef.current = mediaFor('audio'));

  const track = item?.tracks[trackIndex] ?? null;
  const learning = item?.type === 'course' || item?.type === 'talk';

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
    if (pendingSeekRef.current !== null) return;
    if (el && tr && el.currentTime > 0) {
      if (!completedRef.current.has(tr.id)) placesRef.current.set(tr.id, el.currentTime);
      void api.put(`/api/progress/${tr.id}`, { positionSec: el.currentTime }).catch(() => {});
    }
  }, []);

  /** Where a track should start: its saved place in a course or talk, else the top. */
  const placeFor = useCallback((it: MeditationDetailDto, index: number): number => {
    if (it.type !== 'course' && it.type !== 'talk') return 0;
    const tr = it.tracks[index];
    if (!tr || completedRef.current.has(tr.id)) return 0;
    const at = placesRef.current.get(tr.id) ?? 0;
    const d = tr.durationSec;
    if (at < 10 || (d && (at >= d * 0.95 || at >= d - 15))) return 0;
    return at;
  }, []);

  /**
   * Seek once the media knows its length. Setting currentTime straight after a
   * new src is dropped by iOS Safari (video especially), which then plays from
   * 0:00; waiting for loadedmetadata makes the resume stick everywhere.
   */
  const seekWhenReady = useCallback((el: HTMLMediaElement, at: number) => {
    if (at <= 0) {
      pendingSeekRef.current = null;
      return;
    }
    pendingSeekRef.current = at;
    const src = el.src;
    const apply = () => {
      // Another track took this element before its metadata came: not ours.
      if (el.src !== src) return;
      const max = Number.isFinite(el.duration) && el.duration > 0 ? el.duration - 3 : at;
      el.currentTime = Math.max(0, Math.min(at, max));
      setPosition(el.currentTime);
      lastGoodPosRef.current = el.currentTime;
      pendingSeekRef.current = null;
    };
    if (el.readyState >= 1) {
      apply();
      return;
    }
    el.currentTime = at; // Where browsers honour it early, no flash of 0:00.
    setPosition(at);
    el.addEventListener('loadedmetadata', apply, { once: true });
  }, []);

  const loadTrack = useCallback(
    (it: MeditationDetailDto, index: number, startAt = 0, autoplay = true) => {
      const tr = it.tracks[index];
      if (!tr) return;
      const kind = isVideoExt(tr.ext) ? 'video' : 'audio';
      const el = mediaFor(kind);
      const prev = audioRef.current;
      if (prev && prev !== el) {
        prev.pause();
        prev.removeAttribute('src');
        prev.load();
      }
      audioRef.current = el;
      setIsVideo(kind === 'video');
      el.src = `/api/media/track/${tr.id}`;
      seekWhenReady(el, startAt);
      el.volume = settings.volume;
      el.playbackRate = settings.speed;
      setTrackIndex(index);
      setPosition(startAt);
      lastGoodPosRef.current = startAt;
      retriesRef.current = 0;
      setDuration(tr.durationSec ?? 0);
      wantPlayRef.current = autoplay;
      if (autoplay) {
        void el.play().then(
          () => setPlaying(true),
          () => setPlaying(false),
        );
      }
    },
    [settings.volume, settings.speed, seekWhenReady],
  );

  const finishInternal = useCallback(
    (status: 'completed' | 'abandoned', reason: string, keepPlace = true) => {
      sendBeat();
      if (keepPlace) saveProgress();
      const off = offlineRef.current;
      if (!sessionRef.current && off) {
        queueOfflineSession({
          itemId: off.itemId,
          startedAt: off.startedAt,
          endedAt: new Date().toISOString(),
          listenedSec: Math.round(listenedRef.current),
          status,
        });
        offlineRef.current = null;
        listenedRef.current = 0;
      }
      const sid = sessionRef.current;
      const it = itemRef.current;
      const minutes = startedAtRef.current
        ? Math.max(1, Math.round((Date.now() - startedAtRef.current) / 60000))
        : undefined;
      if (sid && it) {
        void api
          .post(`/api/practice/${sid}/finish`, { status, reason })
          .then(() => {
            // A reflection is for a sit, not a lesson: after studying, no prompt.
            if (status === 'completed' && it.type !== 'course' && it.type !== 'talk') {
              setReflect({
                sessionId: sid,
                meditationId: it.id,
                meditationTitle: it.title,
                minutes,
              });
            }
          })
          .catch(() => {});
      }
      sessionRef.current = null;
      startedAtRef.current = null;
      wantPlayRef.current = false;
      window.dispatchEvent(new Event('zenport:progress'));
      setBuffering(false);
      for (const el of [audioElRef.current, videoElRef.current]) {
        if (el) {
          el.pause();
          el.removeAttribute('src');
          el.load();
        }
      }
      setIsVideo(false);
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
      completedRef.current = new Set(it.tracks.filter((t) => t.completed).map((t) => t.id));
      untickedRef.current = new Set();
      placesRef.current = new Map(
        it.tracks.filter((t) => t.positionSec !== null).map((t) => [t.id, t.positionSec!]),
      );
      setCompletedIds(new Set(completedRef.current));
      // Beginning a practice opens the full player; it can be minimised to
      // the bar and keeps playing while the rest of the app is used.
      setFocus(true);
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
      const startAt = opts?.resumeSec ?? placeFor(it, index);

      offlineRef.current = null;
      void api
        .post<{ id: number }>('/api/practice/start', { meditationId: it.id })
        .then((r) => {
          sessionRef.current = r.id;
        })
        .catch((err: unknown) => {
          // No connection (not a refusal): keep the sit on the device and
          // send it up once back online.
          if (!(err instanceof ApiError)) {
            offlineRef.current = { itemId: it.id, startedAt: new Date().toISOString() };
          }
        });

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
            wantPlayRef.current = true;
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
    [finishInternal, loadTrack, settings.leadInSec, placeFor],
  );

  const stop = useCallback(
    (how: 'finish' | 'abandon', opts?: { forget?: boolean }) => {
      finishInternal(
        how === 'finish' ? 'completed' : 'abandoned',
        how === 'finish' ? 'stopped early' : 'left practice',
        !opts?.forget,
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
      wantPlayRef.current = true;
      void el.play().then(() => setPlaying(true));
      return;
    }
    if (el.paused) {
      wantPlayRef.current = true;
      void el.play().then(() => setPlaying(true));
    } else {
      wantPlayRef.current = false;
      el.pause();
      setPlaying(false);
      sendBeat();
      saveProgress();
    }
  }, [leadInRemaining, sendBeat, saveProgress]);

  const seek = useCallback((sec: number) => {
    const el = audioRef.current;
    if (el) {
      const max = Number.isFinite(el.duration) && el.duration > 0 ? el.duration - 0.5 : sec;
      const to = Math.max(0, Math.min(sec, max));
      el.currentTime = to;
      lastGoodPosRef.current = to;
      setPosition(to);
    }
  }, []);

  const skip = useCallback(
    (delta: number) => seek((audioRef.current?.currentTime ?? 0) + delta),
    [seek],
  );

  const playTrack = useCallback(
    (index: number) => {
      const it = itemRef.current;
      if (!it || index < 0 || index >= it.tracks.length) return;
      saveProgress();
      loadTrack(it, index, placeFor(it, index), true);
    },
    [loadTrack, saveProgress, placeFor],
  );

  const nextTrack = useCallback(() => {
    const it = itemRef.current;
    if (!it) return;
    const idx = trackIndexRef.current;
    if (idx < it.tracks.length - 1) {
      saveProgress();
      loadTrack(it, idx + 1, placeFor(it, idx + 1), true);
    }
  }, [loadTrack, saveProgress, placeFor]);

  const prevTrack = useCallback(() => {
    const it = itemRef.current;
    if (!it) return;
    const el = audioRef.current;
    const idx = trackIndexRef.current;
    if (el && el.currentTime > 5) {
      el.currentTime = 0;
    } else if (idx > 0) {
      saveProgress();
      loadTrack(it, idx - 1, placeFor(it, idx - 1), true);
    }
  }, [loadTrack, saveProgress, placeFor]);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      void wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
    setWakeLockOn(false);
  }, []);

  const acquireWakeLock = useCallback(() => {
    if (!wakeLockSupported) {
      setWakeLockNote(
        'This browser cannot hold the screen awake. Audio keeps playing with the screen off where the system allows it.',
      );
      return;
    }
    if (wakeLockRef.current || document.visibilityState !== 'visible') return;
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
          'The system declined to keep the screen awake (often Low Power Mode). Audio keeps playing; the screen may dim.',
        );
      });
  }, [wakeLockSupported]);

  // Hold the screen awake exactly while a practice is playing - including the
  // settling lead-in - and let it go the moment it pauses or ends.
  const wantAwake = !!item && settings.keepAwake && (playing || leadInRemaining !== null);
  useEffect(() => {
    if (wantAwake) acquireWakeLock();
    else releaseWakeLock();
  }, [wantAwake, acquireWakeLock, releaseWakeLock]);

  const toggleWakeLock = useCallback(() => {
    updateSettings({ keepAwake: !settings.keepAwake });
  }, [updateSettings, settings.keepAwake]);

  // Wire both media elements once. Each handler ignores the element that is
  // not the active one, so a video parked after a switch cannot move state.
  useEffect(() => {
    const wire = (el: HTMLMediaElement) => {
      const active = () => el === audioRef.current;
      const onTime = () => {
        if (!active()) return;
        // The 0:00 that plays before a pending resume lands is not a place.
        if (pendingSeekRef.current !== null) return;
        const now = performance.now();
        if (!el.paused && lastTickRef.current !== null) {
          const dt = (now - lastTickRef.current) / 1000;
          if (dt > 0 && dt < 2.5) listenedRef.current += dt;
        }
        lastTickRef.current = now;
        setPosition(el.currentTime);
        if (el.currentTime > 0) lastGoodPosRef.current = el.currentTime;
        if (!el.paused) retriesRef.current = 0;
        // Most of a lesson watched is a lesson done - the credits, a closing
        // bell or a skip in the last few percent should not lose it.
        const cur = itemRef.current?.tracks[trackIndexRef.current];
        if (
          cur &&
          Number.isFinite(el.duration) &&
          el.duration > 20 &&
          el.currentTime / el.duration >= 0.95
        ) {
          markDone(cur.id, { auto: true });
        }
      };
      const onLoaded = () => {
        if (!active()) return;
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
        if (!active()) return;
        const it = itemRef.current;
        if (!it) return;
        const idx = trackIndexRef.current;
        // Played to the end: a finished lesson (or track), for this account.
        const doneTrack = it.tracks[idx];
        if (doneTrack) {
          untickedRef.current.delete(doneTrack.id);
          markDone(doneTrack.id);
        }
        if (idx < it.tracks.length - 1) {
          if (!autoplayRef.current) {
            // "Continue to the next track" is off: stop here rather than rolling
            // on. The session stays open so Next or Play resumes it — ending the
            // practice would throw away a multi-part sit the person paused in
            // the middle of on purpose.
            setPlaying(false);
            return;
          }
          loadTrack(it, idx + 1, placeFor(it, idx + 1), true);
        } else {
          finishInternal('completed', 'finished');
        }
      };
      const onPause = () => {
        if (active()) setPlaying(false);
      };
      const onPlay = () => {
        if (!active()) return;
        lastTickRef.current = performance.now();
        setPlaying(true);
      };
      const onWaiting = () => {
        if (!active()) return;
        if (wantPlayRef.current) setBuffering(true);
      };
      const onFlowing = () => {
        if (active()) setBuffering(false);
      };
      // A long sit over Wi-Fi will meet a dropout sooner or later. When the
      // stream errors or stalls while the person still wants to be playing,
      // reload the same file and pick up at the last good second - with a
      // growing pause between tries so a server that is really down is not
      // hammered.
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      const recover = () => {
        if (!active() || !wantPlayRef.current || !itemRef.current || retryTimer) return;
        if (retriesRef.current >= 6) {
          setBuffering(false);
          return;
        }
        const attempt = ++retriesRef.current;
        setBuffering(true);
        retryTimer = setTimeout(
          () => {
            retryTimer = null;
            const tr = itemRef.current?.tracks[trackIndexRef.current];
            if (!tr || !wantPlayRef.current) return;
            const at = lastGoodPosRef.current;
            el.src = `/api/media/track/${tr.id}`;
            seekWhenReady(el, at);
            void el.play().catch(() => {});
          },
          Math.min(15000, 1000 * 2 ** (attempt - 1)),
        );
      };
      const onStalled = () => {
        if (!active()) return;
        // Stalled is often transient; only act if nothing moves for a while.
        const before = el.currentTime;
        setTimeout(() => {
          if (wantPlayRef.current && el.currentTime === before && !el.paused) recover();
        }, 8000);
      };
      el.addEventListener('timeupdate', onTime);
      el.addEventListener('loadedmetadata', onLoaded);
      el.addEventListener('ended', onEnded);
      el.addEventListener('pause', onPause);
      el.addEventListener('play', onPlay);
      el.addEventListener('waiting', onWaiting);
      el.addEventListener('playing', onFlowing);
      el.addEventListener('canplay', onFlowing);
      el.addEventListener('error', recover);
      el.addEventListener('stalled', onStalled);
      return () => {
        if (retryTimer) clearTimeout(retryTimer);
        el.removeEventListener('waiting', onWaiting);
        el.removeEventListener('playing', onFlowing);
        el.removeEventListener('canplay', onFlowing);
        el.removeEventListener('error', recover);
        el.removeEventListener('stalled', onStalled);
        el.removeEventListener('timeupdate', onTime);
        el.removeEventListener('loadedmetadata', onLoaded);
        el.removeEventListener('ended', onEnded);
        el.removeEventListener('pause', onPause);
        el.removeEventListener('play', onPlay);
      };
    };
    const offAudio = wire(mediaFor('audio'));
    const offVideo = wire(mediaFor('video'));
    return () => {
      offAudio();
      offVideo();
    };
  }, [loadTrack, finishInternal, markDone, placeFor, seekWhenReady]);

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
      artwork: item.coverId
        ? [
            { src: `/api/media/asset/${item.coverId}?w=320`, sizes: '320x320', type: 'image/webp' },
            { src: `/api/media/asset/${item.coverId}?w=640`, sizes: '640x640', type: 'image/webp' },
          ]
        : [],
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
    safe('seekbackward', () => skip(-15));
    safe('seekforward', () => skip(30));
    try {
      ms.setActionHandler('seekto', (d) => {
        if (typeof d.seekTime === 'number') seek(d.seekTime);
      });
    } catch {
      // Unsupported action on this browser.
    }
    return () => {
      for (const a of [
        'play',
        'pause',
        'previoustrack',
        'nexttrack',
        'seekbackward',
        'seekforward',
        'seekto',
      ] as MediaSessionAction[]) {
        try {
          ms.setActionHandler(a, null);
        } catch {
          /* noop */
        }
      }
    };
  }, [item, track, toggle, prevTrack, nextTrack, seek, skip]);

  // Lock-screen scrubber and play state, kept roughly in step (once a second
  // is plenty - the system interpolates between updates).
  const posSecond = Math.floor(position);
  useEffect(() => {
    if (!('mediaSession' in navigator) || !item) return;
    const ms = navigator.mediaSession;
    ms.playbackState = playing ? 'playing' : 'paused';
    if (duration > 0 && typeof ms.setPositionState === 'function') {
      try {
        ms.setPositionState({
          duration,
          position: Math.min(posSecond, duration),
          playbackRate: settings.speed,
        });
      } catch {
        /* inconsistent values mid-load */
      }
    }
  }, [item, playing, posSecond, duration, settings.speed]);

  // Save progress when the tab hides; re-acquire wake lock on return.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        sendBeat();
        saveProgress();
      } else if (wantAwake) {
        // The system drops a wake lock whenever the page is hidden.
        acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [sendBeat, saveProgress, wantAwake, acquireWakeLock]);

  const value = useMemo<PlayerApi>(
    () => ({
      item,
      track,
      trackIndex,
      playing,
      isVideo,
      learning,
      completedIds,
      setTrackDone,
      videoEl: videoElRef.current,
      buffering,
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
      skip,
      playTrack,
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
      isVideo,
      learning,
      completedIds,
      setTrackDone,
      buffering,
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
      skip,
      playTrack,
      nextTrack,
      prevTrack,
      updateSettings,
      toggleWakeLock,
      stop,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
