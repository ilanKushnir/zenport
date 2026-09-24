/**
 * Creators, as an admin manages them (Review the library → Creators): every
 * creator with their picture and size, names that look like the same one
 * spelled twice (with a one-tap merge), and an editor for each - rename,
 * merge into another, undo a merge, and the picture (upload, link, remove).
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminCreatorDto } from '@zenport/shared';
import { api } from '../api.ts';
import { clearApiCache, useApi } from '../hooks.ts';
import { CreatorFace } from './Shelves.tsx';
import { EmptyState, ErrorNote, Icon, Sheet } from './ui.tsx';

/** Letters and digits only, lower case: "Quiet-Harbour " ≈ "quietharbour". */
const squash = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}]/gu, '');

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length]!;
}

/** Pairs that are probably one creator: same letters, or a letter or two apart. */
export function likelySame(creators: { name: string; itemCount: number }[]) {
  const out: { from: string; to: string }[] = [];
  const keyed = creators
    .filter((c) => !/^unknown/i.test(c.name))
    .map((c) => ({ ...c, k: squash(c.name) }))
    .filter((c) => c.k.length >= 4);
  for (let i = 0; i < keyed.length; i++) {
    for (let j = i + 1; j < keyed.length; j++) {
      const a = keyed[i]!;
      const b = keyed[j]!;
      // Near spellings only for longer names: "Ana Lee" and "Ana Leo" may be two people.
      const short = Math.min(a.k.length, b.k.length);
      const same = a.k === b.k || (short >= 8 && distance(a.k, b.k) <= (short >= 12 ? 2 : 1));
      if (!same) continue;
      // Into the one with more recordings (the more likely right spelling).
      const [to, from] = a.itemCount >= b.itemCount ? [a, b] : [b, a];
      out.push({ from: from.name, to: to.name });
    }
  }
  return out;
}

const NOT_SAME_KEY = 'zp-creators-not-same';
const readNotSame = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(NOT_SAME_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
};
const pairKey = (p: { from: string; to: string }) => [p.from, p.to].sort().join('\u001f');

export function CreatorsAdmin() {
  const list = useApi<AdminCreatorDto[]>('/api/admin/creators');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const creators = useMemo(() => list.data ?? [], [list.data]);
  const [notSame, setNotSame] = useState(readNotSame);
  const pairs = useMemo(
    () => likelySame(creators).filter((p) => !notSame.includes(pairKey(p))),
    [creators, notSame],
  );
  const different = (p: { from: string; to: string }) => {
    const next = [...notSame, pairKey(p)];
    setNotSame(next);
    try {
      localStorage.setItem(NOT_SAME_KEY, JSON.stringify(next));
    } catch {
      /* a convenience only */
    }
  };
  const needle = q.trim().toLowerCase();
  const shown = creators.filter(
    (c) => !needle || `${c.name} ${c.aliases.join(' ')}`.toLowerCase().includes(needle),
  );
  const current = creators.find((c) => c.name === open) ?? null;

  const refresh = () => {
    clearApiCache();
    list.reload();
  };
  const merge = async (from: string, to: string) => {
    setError(null);
    try {
      await api.post('/api/admin/creators/rename', { from, to });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through.');
    }
    refresh();
  };

  if (list.error) return <ErrorNote message={list.error} onRetry={list.reload} />;

  return (
    <section className="cr-admin" aria-label="Creators">
      {error && <ErrorNote message={error} />}
      {pairs.length > 0 && (
        <div className="cr-dupes">
          <h2>
            <Icon name="sparkle" size={15} /> Looks like the same creator
          </h2>
          <ul>
            {pairs.map((p) => (
              <li key={`${p.from}>${p.to}`}>
                <span className="grow">
                  <del>{p.from}</del> <Icon name="chevron-right" size={13} />{' '}
                  <strong>{p.to}</strong>
                </span>
                <button className="btn btn-sm btn-quiet" onClick={() => void merge(p.from, p.to)}>
                  Merge
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => void merge(p.to, p.from)}>
                  The other way
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => different(p)}>
                  Different
                </button>
              </li>
            ))}
          </ul>
          <p className="faint">
            A merge keeps everything and can be undone. Recordings found later under the old
            spelling join the chosen one.
          </p>
        </div>
      )}

      <div className="review-tools">
        <label className="folder-search review-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Find a creator"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Find a creator"
          />
        </label>
        <Link className="btn btn-sm btn-ghost" to="/ai/library?tab=pictures">
          <Icon name="sparkle" size={14} /> Find pictures with AI
        </Link>
      </div>

      {list.loading && !list.data ? (
        <div className="skeleton" style={{ height: 320 }} />
      ) : shown.length === 0 ? (
        <EmptyState title="No creators match">Try another name.</EmptyState>
      ) : (
        <ul className="cr-list">
          {shown.map((c) => (
            <li key={c.name}>
              <button className="cr-row" onClick={() => setOpen(c.name)}>
                <CreatorFace creator={c} size="sm" />
                <span className="grow">
                  <strong>{c.name}</strong>
                  <span className="sub">
                    {c.itemCount} {c.itemCount === 1 ? 'recording' : 'recordings'}
                    {c.seriesCount ? ` · ${c.seriesCount} series` : ''}
                    {c.aliases.length ? ` · also “${c.aliases.join('”, “')}”` : ''}
                    {c.imageUrl ? '' : ' · no picture'}
                  </span>
                </span>
                <Icon name="pencil" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {current && (
        <CreatorEditSheet
          creator={current}
          others={creators.filter((c) => c.name !== current.name)}
          onClose={() => setOpen(null)}
          onChanged={(name) => {
            refresh();
            setOpen(name);
          }}
        />
      )}
    </section>
  );
}

/** Everything about one creator, for an admin. */
export function CreatorEditSheet({
  creator,
  others,
  onClose,
  onChanged,
}: {
  creator: AdminCreatorDto;
  others: { name: string; itemCount: number }[];
  onClose: () => void;
  /** After a change; with the creator's name now (null once merged away). */
  onChanged: (name: string | null) => void;
}) {
  const [name, setName] = useState(creator.name);
  const [into, setInto] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picPath = `/api/creators/${encodeURIComponent(creator.name)}/image`;
  const trimmed = name.replace(/\s+/g, ' ').trim();
  const clash = others.find((o) => o.name.toLowerCase() === trimmed.toLowerCase());

  const run = async (what: string, fn: () => Promise<unknown>, next: string | null) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
      onChanged(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through.');
    } finally {
      setBusy(null);
    }
  };
  const rename = (to: string) =>
    run('rename', () => api.post('/api/admin/creators/rename', { from: creator.name, to }), to);

  const upload = async (file: File) => {
    await run(
      'upload',
      async () => {
        const res = await fetch(`${picPath}/upload`, {
          method: 'PUT',
          headers: { 'content-type': file.type || 'image/jpeg', 'x-zenport-csrf': '1' },
          body: file,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? 'That picture could not be used.');
        }
      },
      creator.name,
    );
  };

  return (
    <Sheet title={creator.name} onClose={onClose}>
      <div className="cr-sheet">
        <div className="cr-pic">
          <CreatorFace creator={creator} size="lg" />
          <div className="cr-pic-actions">
            <label className="btn btn-sm btn-quiet">
              <Icon name="plus" size={14} /> {busy === 'upload' ? 'Uploading…' : 'Upload a picture'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                hidden
                disabled={!!busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void upload(f);
                }}
              />
            </label>
            {creator.imageUrl && (
              <button
                className="btn btn-sm btn-ghost"
                disabled={!!busy}
                onClick={() => void run('remove', () => api.del(picPath), creator.name)}
              >
                <Icon name="trash" size={14} /> Remove
              </button>
            )}
          </div>
          <form
            className="cr-url"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) {
                void run('url', () => api.put(picPath, { url: url.trim() }), creator.name).then(
                  () => setUrl(''),
                );
              }
            }}
          >
            <input
              type="url"
              inputMode="url"
              placeholder="…or paste a picture's link (https)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-label="Picture link"
            />
            <button className="btn btn-sm btn-quiet" disabled={!url.trim() || !!busy}>
              {busy === 'url' ? 'Fetching…' : 'Use'}
            </button>
          </form>
          <p className="faint">
            Kept as ZenPort&apos;s own square copy, shown wherever they appear.
          </p>
        </div>

        <div className="field">
          <label htmlFor="cr-name">Name</label>
          <div className="cr-inline">
            <input
              id="cr-name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
            <button
              className="btn btn-primary btn-sm"
              disabled={!trimmed || trimmed === creator.name || !!busy}
              onClick={() => void rename(clash ? clash.name : trimmed)}
            >
              {clash ? `Merge into ${clash.name}` : 'Rename'}
            </button>
          </div>
          <p className="cr-hint">
            {clash
              ? `${clash.name} already exists - saving merges the two into one.`
              : 'Every recording, series and picture follows the new name, now and after rescans.'}
          </p>
        </div>

        {others.length > 0 && (
          <div className="field">
            <label htmlFor="cr-into">Merge into another creator</label>
            <div className="cr-inline">
              <select id="cr-into" value={into} onChange={(e) => setInto(e.target.value)}>
                <option value="">Choose…</option>
                {others.map((o) => (
                  <option key={o.name} value={o.name}>
                    {o.name} ({o.itemCount})
                  </option>
                ))}
              </select>
              <button
                className="btn btn-quiet btn-sm"
                disabled={!into || !!busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Merge ${creator.name} into ${into}? Its ${creator.itemCount} recordings join ${into}. You can undo it from ${into}.`,
                    )
                  ) {
                    void rename(into);
                  }
                }}
              >
                Merge
              </button>
            </div>
          </div>
        )}

        {creator.aliases.length > 0 && (
          <div className="field">
            <label>Also known as</label>
            <ul className="cr-aliases">
              {creator.aliases.map((a) => (
                <li key={a}>
                  <span className="grow">{a}</span>
                  <button
                    className="btn btn-sm btn-ghost"
                    disabled={!!busy}
                    onClick={() =>
                      void run(
                        'split',
                        () => api.del(`/api/admin/creators/aliases/${encodeURIComponent(a)}`),
                        creator.name,
                      )
                    }
                  >
                    Undo merge
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {error && <ErrorNote message={error} />}
      </div>
    </Sheet>
  );
}
