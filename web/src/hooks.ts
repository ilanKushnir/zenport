import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api.ts';

export interface Loadable<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * What each GET last answered, for this signed-in session only. A page shows
 * it at once and refreshes underneath - navigating never waits on the network
 * for something already seen. Cleared on sign-in, sign-out and account switch.
 */
const cache = new Map<string, unknown>();
export const clearApiCache = () => cache.clear();

/**
 * Fetch-on-mount hook with reload. With a cached answer the page renders it
 * immediately (loading stays false) and quietly swaps in the fresh one.
 */
export function useApi<T>(path: string | null): Loadable<T> {
  const cached = path !== null ? (cache.get(path) as T | undefined) : undefined;
  const [data, setData] = useState<T | null>(cached ?? null);
  const [loading, setLoading] = useState(path !== null && cached === undefined);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(() => {
    if (path === null) return;
    const gen = ++generation.current;
    const hit = cache.get(path) as T | undefined;
    if (hit !== undefined) {
      setData(hit);
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError(null);
    api
      .get<T>(path)
      .then((d) => {
        cache.set(path, d);
        if (generation.current === gen) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (generation.current === gen) {
          // A background refresh that fails keeps showing what we had.
          if (!cache.has(path)) {
            setError(err instanceof ApiError ? err.message : 'something went wrong loading this');
          }
          setLoading(false);
        }
      });
  }, [path]);

  useEffect(load, [load]);
  return { data, loading, error, reload: load };
}

/**
 * Re-run `fn` when a window event fires - the player announces
 * "zenport:progress" when a lesson is finished or a session ends, so pages
 * showing progress stay current without a reload.
 */
export function useRefreshOn(event: string, fn: () => void): void {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(event, handler);
    return () => window.removeEventListener(event, handler);
  }, [event]);
}
