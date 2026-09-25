/**
 * Sections that fold: a heading you tap to hide what is under it, and one
 * switch to fold or open them all. Which are folded is remembered on this
 * device, per page (a creator's page remembers its own).
 */
import { useCallback, useState } from 'react';

const read = (key: string): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
};

export function useCollapsed(storageKey: string) {
  const [state, setState] = useState(() => ({ key: storageKey, set: read(storageKey) }));
  // Another page (another creator) starts from what it remembered.
  const collapsed = state.key === storageKey ? state.set : read(storageKey);
  const save = useCallback(
    (next: Set<string>) => {
      setState({ key: storageKey, set: next });
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        /* a convenience only */
      }
    },
    [storageKey],
  );
  const toggle = (section: string) => {
    const next = new Set(collapsed);
    if (next.has(section)) next.delete(section);
    else next.add(section);
    save(next);
  };
  /** Fold every one of these, or open them all. */
  const setAll = (sections: string[], fold: boolean) =>
    save(fold ? new Set([...collapsed, ...sections]) : new Set());
  return { collapsed, toggle, setAll };
}
