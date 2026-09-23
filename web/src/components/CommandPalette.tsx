/**
 * ⌘K / Ctrl-K palette: one place to reach any meditation, page or setting
 * without learning where things live.
 *
 * It exists because the library can be large and the nav cannot grow with it.
 * Search runs over the already-loaded library — no round trip, so results
 * appear as fast as the keystroke.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LibraryDto } from '@zenport/shared';
import { formatDuration } from '@zenport/shared';
import { useApi } from '../hooks.ts';
import { usePrefs } from '../prefs.tsx';
import { Icon } from './ui.tsx';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  group: 'Go' | 'Do' | 'Meditations';
  run: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();
  const { prefs, save } = usePrefs();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Only fetched once the palette has been opened, so the shortcut costs
  // nothing to anyone who never presses it.
  const [everOpened, setEverOpened] = useState(false);
  const lib = useApi<LibraryDto>(everOpened ? '/api/library' : null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        setEverOpened(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setCursor(0);
      // Focus after paint, or the browser keeps focus on whatever opened it.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      navigate(to);
      setOpen(false);
    };
    const base: Command[] = [
      { id: 'today', label: 'Today', icon: 'sun', group: 'Go', run: go('/') },
      { id: 'library', label: 'Library', icon: 'library', group: 'Go', run: go('/library') },
      { id: 'timer', label: 'Sit - unguided timer', icon: 'timer', group: 'Go', run: go('/timer') },
      { id: 'plans', label: 'Plans', icon: 'plans', group: 'Go', run: go('/plans') },
      { id: 'journal', label: 'Journal', icon: 'journal', group: 'Go', run: go('/journal') },
      { id: 'stats', label: 'Practice history', icon: 'stats', group: 'Go', run: go('/stats') },
      { id: 'sources', label: 'Sources', icon: 'sources', group: 'Go', run: go('/sources') },
      { id: 'settings', label: 'Settings', icon: 'settings', group: 'Go', run: go('/settings') },
      {
        id: 'bell',
        label: prefs.bellEnabled ? 'Turn the bell off' : 'Turn the bell on',
        hint: 'Preference',
        icon: 'bell',
        group: 'Do',
        run: () => {
          void save({ bellEnabled: !prefs.bellEnabled });
          setOpen(false);
        },
      },
      {
        id: 'motion',
        label: prefs.calmMotion ? 'Allow gentle motion' : 'Still everything',
        hint: 'Preference',
        icon: 'moon',
        group: 'Do',
        run: () => {
          void save({ calmMotion: !prefs.calmMotion });
          setOpen(false);
        },
      },
      {
        id: 'rescan',
        label: 'Rescan the library',
        icon: 'history',
        group: 'Do',
        run: () => {
          void fetch('/api/library/rescan', {
            method: 'POST',
            headers: { 'x-zenport-csrf': '1' },
          });
          setOpen(false);
        },
      },
    ];

    const meds: Command[] = (lib.data?.items ?? [])
      .filter((i) => !i.missing)
      .map((i) => ({
        id: `m-${i.id}`,
        label: i.title,
        hint: `${i.creator}${i.totalDurationSec ? ` · ${formatDuration(i.totalDurationSec)}` : ''}`,
        icon: 'play',
        group: 'Meditations' as const,
        run: go(`/m/${i.id}`),
      }));

    return [...base, ...meds];
  }, [lib.data, navigate, prefs.bellEnabled, prefs.calmMotion, save]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return commands.filter((c) => c.group !== 'Meditations').slice(0, 10);
    const scored = commands
      .map((c) => {
        const hay = `${c.label} ${c.hint ?? ''}`.toLowerCase();
        const at = hay.indexOf(needle);
        if (at < 0) return null;
        // Prefix matches first, then earlier matches, then shorter labels.
        return { c, score: (at === 0 ? 0 : 100) + at + c.label.length * 0.01 };
      })
      .filter((x): x is { c: Command; score: number } => x !== null)
      .sort((a, b) => a.score - b.score);
    return scored.slice(0, 24).map((x) => x.c);
  }, [q, commands]);

  useEffect(() => setCursor(0), [q]);

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector('[data-on="1"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor, results]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[cursor]?.run();
    }
  };

  let lastGroup = '';

  return (
    <>
      <div className="scrim" onClick={() => setOpen(false)} />
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="cmdk-input">
          <Icon name="search" size={17} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search meditations, pages and settings…"
            aria-label="Search meditations, pages and settings"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>esc</kbd>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {results.length === 0 && <p className="cmdk-empty">Nothing matches “{q}”.</p>}
          {results.map((c, i) => {
            const head = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {head && <div className="cmdk-group">{head}</div>}
                <button
                  className="cmdk-row"
                  data-on={i === cursor ? '1' : '0'}
                  onMouseMove={() => setCursor(i)}
                  onClick={c.run}
                >
                  <Icon name={c.icon} size={16} />
                  <span className="lbl">{c.label}</span>
                  {c.hint && <span className="hnt">{c.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
