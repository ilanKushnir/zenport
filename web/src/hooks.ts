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
