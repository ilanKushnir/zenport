/**
 * Search everything - the search button in the top bar, or ⌘K / Ctrl-K:
 * recordings, series and packs, creators, kinds and levels, pages, each
 * setting, and a few actions, in one place.
 *
 * It exists because the library can be large and the nav cannot grow with it.
 * Search runs over the already-loaded library - no round trip, so results
 * appear as fast as the keystroke. Every word typed must match (in any
 * order, accents ignored); results are grouped, the best group first.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { LibraryDto } from '@zenport/shared';
import { formatDuration, type ContentType } from '@zenport/shared';
import { groupSeries, LEVEL_SHORT, seriesPath, TYPE_META } from '../content.ts';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { usePrefs } from '../prefs.tsx';
import { Icon } from './ui.tsx';
import { useAuth } from '../App.tsx';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  group: Group | LegacyGroup;
  /** More to match on than the label and hint: synonyms, where it lives. */
  keywords?: string;
  run: () => void;
}

type Group =
  'Recordings' | 'Series and packs' | 'Creators' | 'Browse' | 'Pages' | 'Settings' | 'Actions';
type LegacyGroup = 'Go' | 'Do';
const GROUP: Record<LegacyGroup, Group> = { Go: 'Pages', Do: 'Actions' };
/** How many of each kind a search shows. */
const CAP: Partial<Record<Group, number>> = {
  Recordings: 8,
  'Series and packs': 5,
  Creators: 4,
};

/** Open the search from anywhere (the top bar's button, the sidebar). */
export const openSearch = () => window.dispatchEvent(new Event('zenport:search'));

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/** Each setting, and where it is (a section of Settings). */
const SETTINGS: { label: string; where: string; icon: string; keywords: string }[] = [
  {
    label: 'Accent colour',
    where: 'look-and-feel',
    icon: 'sparkle',
    keywords: 'theme colour color',
  },
  {
    label: 'Open ZenPort on',
    where: 'look-and-feel',
    icon: 'sun',
    keywords: 'start page home library today',
  },
  {
    label: 'Gentle motion',
    where: 'look-and-feel',
    icon: 'moon',
    keywords: 'animation calm reduce',
  },
  {
    label: 'Ambient background',
    where: 'look-and-feel',
    icon: 'sparkle',
    keywords: 'aurora wallpaper',
  },
  { label: 'Daily target', where: 'practice', icon: 'timer', keywords: 'goal minutes day' },
  {
    label: 'Default sit length',
    where: 'practice',
    icon: 'timer',
    keywords: 'timer minutes duration',
  },
  {
    label: 'Bell along the way',
    where: 'practice',
    icon: 'bell',
    keywords: 'interval bells timer',
  },
  { label: 'Bell', where: 'sound-and-playback', icon: 'bell', keywords: 'sound chime volume' },
  {
    label: 'Continue to the next track',
    where: 'sound-and-playback',
    icon: 'play',
    keywords: 'autoplay playback',
  },
  {
    label: 'Your name and picture',
    where: 'you',
    icon: 'user',
    keywords: 'profile avatar display name',
  },
  {
    label: 'What friends see',
    where: 'what-friends-see',
    icon: 'friends',
    keywords: 'privacy sharing',
  },
  {
    label: 'Password and time zone',
    where: 'sign-in',
    icon: 'key',
    keywords: 'sign in login timezone',
  },
  {
    label: 'Offline storage',
    where: 's-offline',
    icon: 'on-device',
    keywords: 'downloads space device',
  },
];

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
    const onOpen = () => {
      setOpen(true);
      setEverOpened(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('zenport:search', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('zenport:search', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setCursor(0);
      // Focus after paint, or the browser keeps focus on whatever opened it.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const isAdmin = useAuth().user?.role === 'admin';
  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      navigate(to);
      setOpen(false);
    };
    const base: Command[] = [
      { id: 'today', label: 'Today', icon: 'sun', group: 'Go', run: go('/') },
      { id: 'library', label: 'Library', icon: 'library', group: 'Go', run: go('/library') },
      {
        id: 'timer',
        label: 'Breathe - quiet timer and breath guide',
        icon: 'breath',
        group: 'Go',
        run: go('/breathe'),
      },
      { id: 'plans', label: 'Plans', icon: 'plans', group: 'Go', run: go('/plans') },
      {
        id: 'ai',
        label: 'AI - your provider, intentions and features',
        icon: 'sparkle',
        group: 'Go',
        run: go('/ai'),
      },
      {
        id: 'guide',
        label: 'Your guide - how your practice is going',
        icon: 'lotus',
        group: 'Go',
        run: go('/ai/guide'),
      },
      {
        id: 'sit',
        label: 'Made for you - a meditation written for now',
        icon: 'volume',
        group: 'Go',
        run: go('/ai/sit'),
      },
      {
        id: 'discover',
        label: 'Discover - teachers, courses, books, retreats',
        icon: 'search',
        group: 'Go',
        run: go('/ai/discover'),
      },
      {
        id: 'intentions',
        label: 'Your intentions - why you practise',
        icon: 'heart',
        group: 'Go',
        run: go('/ai/intentions'),
      },
      { id: 'journal', label: 'Journal', icon: 'journal', group: 'Go', run: go('/journal') },
      { id: 'stats', label: 'Practice history', icon: 'stats', group: 'Go', run: go('/stats') },
      { id: 'friends', label: 'Friends', icon: 'friends', group: 'Go', run: go('/friends') },
      {
        id: 'downloads',
        label: 'Offline - meditations saved on this device',
        icon: 'on-device',
        group: 'Go',
        run: go('/downloads'),
      },
      ...(isAdmin
        ? [
            {
              id: 'admin',
              label: 'Admin - this ZenPort at a glance',
              icon: 'shield',
              group: 'Go' as const,
              run: go('/admin'),
            },
            {
              id: 'review',
              label: 'Review library - correct titles, types, order',
              icon: 'eye',
              group: 'Go' as const,
              run: go('/admin/library'),
            },
            {
              id: 'admin-enhance',
              label: 'Enhance the library with AI',
              icon: 'sparkle',
              group: 'Go' as const,
              run: go('/ai/library'),
            },
            {
              id: 'people',
              label: 'People - invitations and roles',
              icon: 'user-plus',
              group: 'Go' as const,
              run: go('/admin/people'),
            },
            {
              id: 'folders',
              label: 'Library folders',
              icon: 'folder',
              group: 'Go' as const,
              run: go('/admin/folders'),
            },
            {
              id: 'sources',
              label: 'YouTube sources',
              icon: 'sources',
              group: 'Go' as const,
              run: go('/admin/sources'),
            },
            {
              id: 'integrations',
              label: 'Integrations',
              icon: 'plug',
              group: 'Go' as const,
              run: go('/admin/integrations'),
            },
          ]
        : []),
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
      ...(isAdmin
        ? [
            {
              id: 'rescan',
              label: 'Rescan the library',
              icon: 'history',
              group: 'Do' as const,
              run: () => {
                void api.post('/api/library/rescan').catch(() => {});
                setOpen(false);
              },
            },
          ]
        : []),
    ];

    const present = (lib.data?.items ?? []).filter((i) => !i.missing);
    const recordings: Command[] = present.map((i) => ({
      id: `m-${i.id}`,
      label: i.title,
      hint: [
        i.creator,
        i.collection ?? '',
        i.totalDurationSec ? formatDuration(i.totalDurationSec) : '',
      ]
        .filter(Boolean)
        .join(' · '),
      icon: TYPE_META[i.type].icon,
      group: 'Recordings',
      keywords: `${TYPE_META[i.type].label} ${i.level ? LEVEL_SHORT[i.level] : ''}`,
      run: go(`/m/${i.id}`),
    }));
    const series: Command[] = groupSeries(present).series.map((sr) => ({
      id: `s-${sr.key}`,
      label: sr.name,
      hint: `${sr.creator} · ${sr.items.length} ${sr.type === 'course' ? 'modules' : 'parts'}`,
      icon: sr.type === 'course' ? 'book' : 'grid',
      group: 'Series and packs',
      keywords: `${TYPE_META[sr.type].label} pack series`,
      run: go(seriesPath(sr.creator, sr.name)),
    }));
    const creators: Command[] = (lib.data?.creators ?? []).map((c) => ({
      id: `c-${c.name}`,
      label: c.name,
      hint: 'Creator',
      icon: 'friends',
      group: 'Creators',
      keywords: 'teacher creator',
      run: go(`/creators/${encodeURIComponent(c.name)}`),
    }));
    const kinds = (['course', 'talk', 'meditation', 'soundscape'] as ContentType[])
      .filter((t) => present.some((i) => i.type === t))
      .map<Command>((t) => ({
        id: `k-${t}`,
        label: TYPE_META[t].plural,
        hint: `${present.filter((i) => i.type === t).length} in the library`,
        icon: TYPE_META[t].icon,
        group: 'Browse',
        keywords: 'kind type category',
        run: go(`/library?type=${t}`),
      }));
    const browse: Command[] = [
      ...kinds,
      {
        id: 'k-favourites',
        label: 'Favourites',
        hint: 'What you starred',
        icon: 'heart',
        group: 'Browse',
        keywords: 'starred liked hearts',
        run: go('/library?favorites=1'),
      },
      {
        id: 'k-creators',
        label: 'All creators',
        icon: 'friends',
        group: 'Browse',
        keywords: 'teachers',
        run: go('/creators'),
      },
    ];
    const settings: Command[] = SETTINGS.map((st) => ({
      id: `set-${st.label}`,
      label: st.label,
      hint: 'Settings',
      icon: st.icon,
      group: 'Settings',
      keywords: st.keywords,
      run: go(`/settings#${st.where}`),
    }));

    return [
      ...base.map((c) => ({ ...c, group: GROUP[c.group as LegacyGroup] ?? c.group })),
      ...browse,
      ...settings,
      ...series,
      ...creators,
      ...recordings,
    ];
  }, [lib.data, navigate, prefs.bellEnabled, prefs.calmMotion, save, isAdmin]);

  const results = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      // Before typing: where to go, and the kinds to browse.
      return commands.filter((c) => c.group === 'Browse' || c.group === 'Pages').slice(0, 12);
    }
    const scored = commands
      .map((c) => {
        const label = fold(c.label);
        const hay = `${label} ${fold(c.hint ?? '')} ${fold(c.keywords ?? '')}`;
        let score = 0;
        for (const w of words) {
          const at = hay.indexOf(w);
          if (at < 0) return null;
          // In the label counts most, at its start most of all.
          score += label.startsWith(w)
            ? 0
            : label.includes(` ${w}`)
              ? 5
              : at < label.length
                ? 20
                : 60;
        }
        if (label === words.join(' ')) score -= 50;
        return { c, score: score + c.label.length * 0.01 };
      })
      .filter((x): x is { c: Command; score: number } => x !== null);
    // Grouped, the group with the best match first; a few of each.
    const groups = new Map<Command['group'], { c: Command; score: number }[]>();
    for (const x of scored.sort((a, b) => a.score - b.score)) {
      const list = groups.get(x.c.group) ?? [];
      if (list.length < (CAP[x.c.group as Group] ?? 6)) list.push(x);
      groups.set(x.c.group, list);
    }
    return [...groups.values()]
      .sort((a, b) => a[0]!.score - b[0]!.score)
      .flatMap((list) => list.map((x) => x.c));
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
      <div className="cmdk" role="dialog" aria-modal="true" aria-label="Search">
        <div className="cmdk-input">
          <Icon name="search" size={17} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search everything…"
            aria-label="Search recordings, creators, pages and settings"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="go"
          />
          <kbd>esc</kbd>
          <button type="button" className="cmdk-cancel" onClick={() => setOpen(false)}>
            Cancel
          </button>
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
