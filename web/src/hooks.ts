import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api.ts';

export interface Loadable<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Fetch-on-mount hook with reload; latency-aware for skeletons. */
export function useApi<T>(path: string | null): Loadable<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(() => {
    if (path === null) return;
    const gen = ++generation.current;
    setLoading(true);
    setError(null);
    api
      .get<T>(path)
      .then((d) => {
        if (generation.current === gen) {
          setData(d);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (generation.current === gen) {
          setError(err instanceof ApiError ? err.message : 'something went wrong loading this');
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
