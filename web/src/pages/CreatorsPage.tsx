/**
 * Every creator in the library, in order: find one by name, or browse A-Z
 * with a letter strip to jump through a long list - or see who you hold the
 * most from. Each shows what kind of work they have here (meditations,
 * courses, talks...), not just a count.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration, naturalCompare, type ContentType, type LibraryDto } from '@zenport/shared';
import { useApi } from '../hooks.ts';
import { CreatorFace } from '../components/Shelves.tsx';
import { EmptyState, ErrorNote, Icon } from '../components/ui.tsx';
import { TYPE_META, TYPES } from '../content.ts';

type Sort = 'az' | 'most';

const letterOf = (name: string) => {
  const c = name.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
};

export function CreatorsPage() {
  const lib = useApi<LibraryDto>('/api/library');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('az');

  // What kinds of work each creator has here.
  const kinds = useMemo(() => {
    const m = new Map<string, Map<ContentType, number>>();
    for (const i of lib.data?.items ?? []) {
      if (i.missing) continue;
      const k = m.get(i.creator) ?? new Map<ContentType, number>();
      k.set(i.type, (k.get(i.type) ?? 0) + 1);
      m.set(i.creator, k);
    }
    return m;
  }, [lib.data]);

  const needle = q.trim().toLowerCase();
  const creators = useMemo(() => {
    const list = (lib.data?.creators ?? []).filter(
      (c) => !needle || c.name.toLowerCase().includes(needle),
    );
    return sort === 'most'
      ? [...list].sort((a, b) => b.itemCount - a.itemCount || naturalCompare(a.name, b.name))
      : list;
  }, [lib.data, needle, sort]);

  const groups = useMemo(() => {
    if (sort === 'most') return [['', creators] as const];
    const m = new Map<string, typeof creators>();
    for (const c of creators) m.set(letterOf(c.name), [...(m.get(letterOf(c.name)) ?? []), c]);
    return [...m.entries()];
  }, [creators, sort]);

  if (lib.error) return <ErrorNote message={lib.error} onRetry={lib.reload} />;
  const total = lib.data?.creators.length ?? 0;

  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb" style={{ marginBottom: 12 }}>
        <Link to="/library">Library</Link>
        <span className="sep">/</span>
        <span aria-current="page">Creators</span>
      </nav>
      <div className="page-head">
        <h1>Creators</h1>
        <p className="lede">
          {total} {total === 1 ? 'creator' : 'creators'} in your library - the teachers, voices and
          studios behind it.
        </p>
      </div>

      <div className="creators-tools">
        <label className="folder-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Find a creator"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Find a creator"
          />
        </label>
        <div className="view-toggle labelled" role="group" aria-label="Order">
          <button type="button" aria-pressed={sort === 'az'} onClick={() => setSort('az')}>
            A-Z
          </button>
          <button type="button" aria-pressed={sort === 'most'} onClick={() => setSort('most')}>
            By size
          </button>
        </div>
      </div>

      {sort === 'az' && groups.length > 4 && !needle && (
        <nav className="letter-strip" aria-label="Jump to letter">
          {groups.map(([letter]) => (
            <a key={letter} href={`#letter-${letter}`}>
              {letter}
            </a>
          ))}
        </nav>
      )}

      {lib.loading && !lib.data && <div className="skeleton" style={{ height: 320 }} />}
      {lib.data && creators.length === 0 && (
        <EmptyState title={needle ? 'No creator by that name' : 'No creators yet'}>
          {needle ? 'Try part of the name.' : 'Creators appear as the library is scanned.'}
        </EmptyState>
      )}

      {groups.map(([letter, list]) => (
        <section
          key={letter || 'all'}
          className="creator-group"
          id={letter ? `letter-${letter}` : undefined}
          aria-label={letter || 'Creators'}
        >
          {letter && <h2 className="creator-letter">{letter}</h2>}
          <ul className="creator-list">
            {list.map((c) => {
              const mix = kinds.get(c.name);
              return (
                <li key={c.name}>
                  <Link className="creator-row" to={`/creators/${encodeURIComponent(c.name)}`}>
                    <CreatorFace creator={c} size="sm" />
                    <span className="grow">
                      <span className="creator-row-name">{c.name}</span>
                      <span className="creator-kinds">
                        {TYPES.filter((t) => mix?.get(t)).map((t) => (
                          <span key={t} className={`creator-kind t-${t}`}>
                            <Icon name={TYPE_META[t].icon} size={12} />
                            {mix!.get(t)}{' '}
                            {(mix!.get(t) === 1
                              ? TYPE_META[t].label
                              : TYPE_META[t].plural
                            ).toLowerCase()}
                          </span>
                        ))}
                        {c.totalDurationSec ? (
                          <span className="creator-kind">{formatDuration(c.totalDurationSec)}</span>
                        ) : null}
                      </span>
                    </span>
                    <Icon name="chevron-right" size={16} />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
