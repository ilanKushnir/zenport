/**
 * Account preferences and favourites, loaded once per session.
 *
 * Preferences are server-held rather than localStorage: they follow the person
 * to their phone, and the PWA on a phone is where most sitting actually
 * happens. Writes are optimistic — a preference toggle that waits for a round
 * trip feels broken — and roll back if the server rejects them.
 */
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
import type { AccentKey, FavoriteDto, UserPrefsDto } from '@zenport/shared';
import { api } from './api.ts';

/** Used until the first fetch lands, and if the request fails outright. */
export const DEFAULT_PREFS: UserPrefsDto = {
  onboardedAt: null,
  accent: 'spectrum',
  startPage: 'today',
  dailyGoalMinutes: 10,
  defaultTimerMinutes: 10,
  bellEnabled: true,
  bellVolume: 0.5,
  intervalBellMinutes: null,
  autoplayNext: true,
  calmMotion: false,
  ambientBackground: true,
  seenVersion: null,
  aiFeatured: false,
};

interface PrefsState {
  prefs: UserPrefsDto;
  /** False until the first load settles — gates the onboarding decision. */
  ready: boolean;
  save: (patch: Partial<UserPrefsDto> & { onboarded?: boolean }) => Promise<void>;
  favorites: Set<string>;
  toggleFavorite: (itemId: string) => Promise<void>;
  isFavorite: (itemId: string) => boolean;
}

const PrefsContext = createContext<PrefsState | null>(null);

export function usePrefs(): PrefsState {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs outside provider');
  return ctx;
}

const PREFS_KEY = 'zp-prefs-cache';

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UserPrefsDto>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  // Guards against a slow first GET clobbering a fast optimistic write.
  const writeGeneration = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const gen = writeGeneration.current;
    void (async () => {
      const [p, f] = await Promise.all([
        api.get<UserPrefsDto>('/api/prefs').catch(() => null),
        api.get<FavoriteDto[]>('/api/favorites').catch(() => [] as FavoriteDto[]),
      ]);
      if (cancelled) return;
      // Offline: the last preferences seen on this device, not the defaults
      // (which would, for one, replay the welcome tour).
      let prefsNow = p;
      if (p) {
        try {
          localStorage.setItem(PREFS_KEY, JSON.stringify(p));
        } catch {
          /* private mode */
        }
      } else {
        try {
          prefsNow = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as UserPrefsDto | null;
        } catch {
          prefsNow = null;
        }
      }
      if (prefsNow && writeGeneration.current === gen) setPrefs(prefsNow);
      setFavorites(new Set(f.map((x) => x.itemId)));
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (patch: Partial<UserPrefsDto> & { onboarded?: boolean }) => {
    writeGeneration.current += 1;
    let previous: UserPrefsDto | null = null;
    setPrefs((current) => {
      previous = current;
      return { ...current, ...patch };
    });
    try {
      const saved = await api.patch<UserPrefsDto>('/api/prefs', patch);
      setPrefs(saved);
    } catch {
      // Put the old value back rather than leaving the UI asserting something
      // the server never accepted.
      if (previous) setPrefs(previous);
    }
  }, []);

  const toggleFavorite = useCallback(async (itemId: string) => {
    let added = false;
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
        added = true;
      }
      return next;
    });
    try {
      if (added) await api.put(`/api/favorites/${encodeURIComponent(itemId)}`);
      else await api.del(`/api/favorites/${encodeURIComponent(itemId)}`);
    } catch {
      setFavorites((current) => {
        const next = new Set(current);
        if (added) next.delete(itemId);
        else next.add(itemId);
        return next;
      });
    }
  }, []);

  const isFavorite = useCallback((itemId: string) => favorites.has(itemId), [favorites]);

  // Accent and calm-motion are expressed as attributes on <html> so the whole
  // stylesheet can respond with plain CSS instead of prop-drilling a theme.
  useEffect(() => {
    document.documentElement.dataset.accent = prefs.accent;
    document.documentElement.dataset.calm = prefs.calmMotion ? '1' : '0';
    document.documentElement.dataset.ambient = prefs.ambientBackground ? '1' : '0';
  }, [prefs.accent, prefs.calmMotion, prefs.ambientBackground]);

  const value = useMemo(
    () => ({ prefs, ready, save, favorites, toggleFavorite, isFavorite }),
    [prefs, ready, save, favorites, toggleFavorite, isFavorite],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

/** The four accent choices, with the swatch each one previews as. */
export const ACCENT_OPTIONS: { key: AccentKey; label: string; note: string }[] = [
  { key: 'spectrum', label: 'Spectrum', note: 'The full sweep, amber through violet' },
  { key: 'amber', label: 'Amber', note: 'Warm and low, like lamplight' },
  { key: 'rose', label: 'Rose', note: 'Soft, with a little heat' },
  { key: 'violet', label: 'Violet', note: 'Cool and quiet' },
];
