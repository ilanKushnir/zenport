/**
 * Library folders: everything the last scan walked, with a switch per folder.
 *
 * Switching a folder off leaves it (and everything under it) out of the
 * library - no shelves, no counts, no search - without touching a single
 * file. The rescan runs as part of the change, so the page answers with the
 * library as it now is. Only the admin can change it; everyone can look.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  EnhanceStatusDto,
  EnhanceStepKey,
  FolderNodeDto,
  LibraryFoldersDto,
  RemovedLibraryDto,
  ScanStateDto,
} from '@zenport/shared';
import { api } from '../api.ts';
import { useAuth } from '../App.tsx';
import { useApi } from '../hooks.ts';
import { ErrorNote, Icon, Sheet, Switch } from '../components/ui.tsx';
import { ago } from '../social.tsx';
import { AdminCrumb } from './AdminPage.tsx';
import { LibraryChooser } from '../onboarding/AdminSetup.tsx';

function matches(node: FolderNodeDto, q: string): boolean {
  return node.name.toLowerCase().includes(q) || node.children.some((c) => matches(c, q));
}

function countExcluded(node: FolderNodeDto): number {
  return (node.excluded ? 1 : 0) + node.children.reduce((n, c) => n + countExcluded(c), 0);
}

export function FoldersPage() {
  const folders = useApi<LibraryFoldersDto>('/api/library/folders');
  const scan = useApi<ScanStateDto>('/api/library/scan-state');
  const { user } = useAuth();
  const canEdit = user?.role === 'admin';
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const toggle = async (rootId: number, node: FolderNodeDto, include: boolean) => {
    const key = `${rootId}:${node.relPath}`;
    setPending(key);
    setNote(null);
    try {
      const res = await api.put<{ scan: ScanStateDto }>('/api/library/exclusions', {
        rootId,
        relPath: node.relPath,
        excluded: !include,
      });
      const c = res.scan.counts;
      setNote(
        `${include ? 'Brought back' : 'Left out'} "${node.name}". The library now has ${c.items} ${
          c.items === 1 ? 'meditation' : 'meditations'
        }.`,
      );
      folders.reload();
      scan.reload();
    } catch (err) {
      setNote(
        `Could not change it - ${err instanceof Error ? err.message : 'the server refused'}.`,
      );
    } finally {
      setPending(null);
    }
  };

  const q = query.trim().toLowerCase();
  const totals = useMemo(() => {
    const roots = folders.data?.roots ?? [];
    return {
      audio: roots.reduce((n, r) => n + (r.tree?.audioFiles ?? 0), 0),
      excludedFolders: roots.reduce((n, r) => n + (r.tree ? countExcluded(r.tree) : 0), 0),
    };
  }, [folders.data]);

  return (
    <>
      <AdminCrumb here="Library folders" />
      <div className="page-head">
        <h1>Library folders</h1>
        <p className="lede">
          Everything the last scan found. Switch a folder off to leave it out of your library - its
          files are never touched, and switching it back on returns it with its history.
        </p>
      </div>

      {canEdit && (
        <section className="section" aria-labelledby="sec-libraries">
          <div className="section-head">
            <h2 id="sec-libraries">Libraries</h2>
            <span className="section-note">Tick a folder to read it; each is a library</span>
          </div>
          <LibraryChooser />
        </section>
      )}

      <div className="folder-stats" role="status">
        <div>
          <strong>{scan.data?.counts.items ?? '–'}</strong>
          <span>meditations</span>
        </div>
        <div>
          <strong>{totals.audio}</strong>
          <span>audio files seen</span>
        </div>
        <div>
          <strong>{totals.excludedFolders}</strong>
          <span>{totals.excludedFolders === 1 ? 'folder left out' : 'folders left out'}</span>
        </div>
      </div>

      {!canEdit && (
        <p className="notice" style={{ marginBottom: 20 }}>
          Only the admin account can change which folders are scanned.
        </p>
      )}
      {note && (
        <p className="notice" role="status" style={{ marginBottom: 20 }}>
          {note}
        </p>
      )}

      <label className="folder-search">
        <Icon name="search" size={16} />
        <input
          type="search"
          placeholder="Find a folder"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Find a folder"
        />
      </label>

      {folders.error && <ErrorNote message={folders.error} onRetry={folders.reload} />}
      {folders.loading && !folders.data && <div className="skeleton" style={{ height: 240 }} />}
      {folders.data?.scanning && (
        <p className="notice" style={{ marginBottom: 20 }}>
          A scan is running - the tree will be up to date when it finishes.
        </p>
      )}

      {canEdit && <RemovedLibraries onForgotten={() => scan.reload()} />}

      {folders.data?.roots.map((root) => (
        <section key={root.id} className="folder-root" aria-label={root.label}>
          <header className="folder-root-head">
            <span className="folder-root-ic">
              <Icon name="library" size={18} />
            </span>
            <div>
              <h2>{root.label}</h2>
              <p>
                {root.ok
                  ? `${root.tree?.audioFiles ?? 0} audio files`
                  : 'Not readable - check the mount and permissions'}
              </p>
            </div>
          </header>
          {root.tree && root.tree.children.length > 0 ? (
            <ul className="folder-tree" role="tree">
              {root.tree.children
                .filter((c) => !q || matches(c, q))
                .map((c) => (
                  <FolderRow
                    key={c.relPath}
                    node={c}
                    rootId={root.id}
                    depth={0}
                    parentExcluded={false}
                    canEdit={canEdit}
                    pending={pending}
                    query={q}
                    onToggle={toggle}
                  />
                ))}
            </ul>
          ) : (
            root.ok && (
              <p className="folder-empty">No folders yet - this root holds loose files only.</p>
            )
          )}
        </section>
      ))}

      {canEdit && <StartOver />}
    </>
  );
}

const AI_STEPS: { key: EnhanceStepKey; label: string; sub: string; web?: boolean }[] = [
  { key: 'levels', label: 'Levels', sub: 'Who each recording suits, beginner to advanced' },
  { key: 'pictures', label: 'Creator pictures', sub: 'A face or logo for each', web: true },
  {
    key: 'fixes',
    label: 'Suggested fixes',
    sub: 'Titles, types and part names - for you to accept',
  },
  {
    key: 'about',
    label: 'Descriptions',
    sub: 'Looked up on the web, for the first 24 - the slowest',
    web: true,
  },
];

/**
 * Start the library over: forget how it was read and what the AI made of it,
 * read every folder again, and let the AI go through it afresh. Practice,
 * plans and the journal are never touched (they come back attached).
 */
function StartOver() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [keep, setKeep] = useState(true);
  const status = useApi<EnhanceStatusDto>(open ? '/api/ai/library/status' : null);
  const [steps, setSteps] = useState<EnhanceStepKey[]>(['levels', 'pictures', 'fixes']);
  const [apply, setApply] = useState(true);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canAi = !!status.data?.canUse;
  const web = !!status.data?.webSearch;
  const chosen = steps.filter((k) => web || !AI_STEPS.find((x) => x.key === k)?.web);

  // A second tap confirms; the first only arms it, for a few seconds.
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 5000);
    return () => window.clearTimeout(t);
  }, [armed]);

  const go = async () => {
    if (!armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ ok: boolean; aiStarted: boolean }>(
        '/api/admin/library/start-over',
        {
          keepCorrections: keep,
          enhance: canAi && chosen.length > 0 ? { steps: chosen, apply, aboutLimit: 24 } : null,
        },
      );
      setOpen(false);
      navigate(r.aiStarted ? '/ai/library' : '/admin/library?show=all');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not start.');
      setBusy(false);
      setArmed(false);
    }
  };

  return (
    <section className="section start-over" aria-labelledby="sec-start-over">
      <div className="section-head">
        <h2 id="sec-start-over">Start over</h2>
      </div>
      <div className="start-over-card">
        <div className="grow">
          <strong>Read the whole library again, from scratch</strong>
          <span className="sub">
            Forget how it was read and what the AI made of it, read every folder afresh, and let the
            AI go through it again. Practice, plans and the journal stay.
          </span>
        </div>
        <button type="button" className="btn btn-quiet" onClick={() => setOpen(true)}>
          <Icon name="restart" size={16} /> Start over…
        </button>
      </div>

      {open && (
        <Sheet
          title="Start the library over"
          onClose={() => !busy && setOpen(false)}
          labelId="so-t"
        >
          <div className="start-over-sheet">
            <ul className="so-list">
              <li>
                <Icon name="restart" size={16} />
                <span>
                  <strong>Read again:</strong> every folder, as if for the first time - titles,
                  creators, series, types, parts, covers, lengths and guides.
                </span>
              </li>
              <li>
                <Icon name="sparkle" size={16} />
                <span>
                  <strong>Forgotten:</strong> what the AI made of it - levels, descriptions, the
                  pictures it found, suggested fixes.
                </span>
              </li>
              <li>
                <Icon name="check-circle" size={16} />
                <span>
                  <strong>Never touched:</strong> everyone&apos;s practice, finished parts,
                  favourites, plans and journal - they come back on the same recordings. A copy of
                  the database is kept first.
                </span>
              </li>
            </ul>

            <div className="so-row">
              <div className="grow">
                <strong>Keep my own corrections</strong>
                <span className="sub">
                  Titles, types, part names and order, hidden folders, levels and pictures you set.
                  Off: they are read afresh too.
                </span>
              </div>
              <Switch checked={keep} onChange={setKeep} label="Keep my own corrections" />
            </div>

            <div className="so-ai">
              <strong>Then let the AI enhance it again</strong>
              {status.loading && !status.data ? (
                <div className="skeleton" style={{ height: 80 }} />
              ) : canAi ? (
                <>
                  <span className="sub">It starts as soon as the library has been read.</span>
                  <div className="so-steps">
                    {AI_STEPS.map((x) => {
                      const off = !!x.web && !web;
                      const on = steps.includes(x.key) && !off;
                      return (
                        <label
                          key={x.key}
                          className={`so-step${on ? ' on' : ''}${off ? ' off' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={off}
                            onChange={(e) =>
                              setSteps((s) =>
                                e.target.checked ? [...s, x.key] : s.filter((k) => k !== x.key),
                              )
                            }
                          />
                          <span>
                            <strong>{x.label}</strong>
                            <span className="sub">
                              {off ? 'Needs a provider that searches the web' : x.sub}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="so-row slim">
                    <div className="grow">
                      <span className="sub">Use pictures and descriptions as they are found</span>
                    </div>
                    <Switch checked={apply} onChange={setApply} label="Use as found" />
                  </div>
                </>
              ) : (
                <span className="sub">
                  Connect an AI under AI to have it enhance the library again - or start over
                  without it.
                </span>
              )}
            </div>

            {error && (
              <p className="hint" role="alert">
                {error}
              </p>
            )}
            <div className="so-actions">
              <button
                type="button"
                className="btn btn-quiet"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${armed ? 'btn-danger' : 'btn-primary'}`}
                disabled={busy}
                onClick={() => void go()}
              >
                {busy
                  ? 'Starting…'
                  : armed
                    ? 'Tap again to start over'
                    : canAi && chosen.length > 0
                      ? 'Start over and enhance'
                      : 'Start over'}
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </section>
  );
}

function FolderRow({
  node,
  rootId,
  depth,
  parentExcluded,
  canEdit,
  pending,
  query,
  onToggle,
}: {
  node: FolderNodeDto;
  rootId: number;
  depth: number;
  parentExcluded: boolean;
  canEdit: boolean;
  pending: string | null;
  query: string;
  onToggle: (rootId: number, node: FolderNodeDto, include: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const expanded = open || (query !== '' && node.children.some((c) => matches(c, query)));
  const hasKids = node.children.length > 0;
  const off = node.excluded || parentExcluded;
  const busy = pending === `${rootId}:${node.relPath}`;
  const kids = node.children.filter((c) => !query || matches(c, query));

  return (
    <li
      role="treeitem"
      aria-expanded={hasKids ? expanded : undefined}
      aria-selected={false}
      className={`folder-item${off ? ' off' : ''}`}
    >
      <div className="folder-row" style={{ paddingInlineStart: `${depth * 18 + 6}px` }}>
        <button
          type="button"
          className={`folder-twisty${expanded ? ' open' : ''}`}
          onClick={() => setOpen(!expanded)}
          disabled={!hasKids}
          aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
          tabIndex={hasKids ? 0 : -1}
        >
          {hasKids && <Icon name="chevron-right" size={15} />}
        </button>
        <span className="folder-ic">
          <Icon name={off ? 'eye-off' : 'folder'} size={17} />
        </span>
        <button
          type="button"
          className="folder-name"
          onClick={() => hasKids && setOpen(!expanded)}
          tabIndex={-1}
        >
          <span className="n">{node.name}</span>
          <span className="m">
            {node.audioFiles} audio
            {hasKids
              ? ` · ${node.children.length} ${node.children.length === 1 ? 'folder' : 'folders'}`
              : ''}
            {node.excluded ? ' · left out' : parentExcluded ? ' · inside a left-out folder' : ''}
          </span>
        </button>
        {!parentExcluded && (
          <Switch
            checked={!node.excluded}
            onChange={(include) => onToggle(rootId, node, include)}
            label={`Include ${node.name} in the library`}
            disabled={!canEdit || pending !== null}
            busy={busy}
          />
        )}
      </div>
      {hasKids && expanded && (
        <ul role="group">
          {kids.map((c) => (
            <FolderRow
              key={c.relPath}
              node={c}
              rootId={rootId}
              depth={depth + 1}
              parentExcluded={off}
              canEdit={canEdit}
              pending={pending}
              query={query}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * Libraries that were mounted once and are no longer in ZP_LIBRARY_DIRS.
 * Nothing about them is thrown away on its own: kept, their recordings are
 * recognised when the files come back - at the old path or a new one - with
 * everyone's places and ticks. Forgetting is the owner's explicit choice.
 */
function RemovedLibraries({ onForgotten }: { onForgotten: () => void }) {
  const removed = useApi<RemovedLibraryDto[]>('/api/library/removed');
  const [asking, setAsking] = useState<RemovedLibraryDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!removed.data || removed.data.length === 0) {
    return note ? (
      <p className="notice" role="status" style={{ marginBottom: 20 }}>
        {note}
      </p>
    ) : null;
  }

  const forget = async (lib: RemovedLibraryDto) => {
    setBusy(true);
    try {
      await api.del(`/api/library/removed/${lib.id}`);
      setNote(
        `Forgot "${lib.label}" and everything about its ${lib.items === 1 ? 'recording' : `${lib.items} recordings`}.`,
      );
      setAsking(null);
      removed.reload();
      onForgotten();
    } catch (err) {
      setNote(
        `Could not forget it - ${err instanceof Error ? err.message : 'the server refused'}.`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section removed-libs" aria-labelledby="sec-removed">
      <div className="section-head">
        <h2 id="sec-removed">No longer mounted</h2>
      </div>
      <p className="removed-lede">
        These libraries are not in <code>ZP_LIBRARY_DIRS</code> any more. Everything about them is
        kept: mount the files again - at the same path or any other - and ZenPort recognises them,
        with everyone&apos;s places, ticks and your order and types.
      </p>
      {note && (
        <p className="notice" role="status" style={{ marginBottom: 12 }}>
          {note}
        </p>
      )}
      <div className="removed-list">
        {removed.data.map((lib) => (
          <div className="removed-row" key={lib.id}>
            <span className="removed-ic" aria-hidden="true">
              <Icon name="folder" size={18} />
            </span>
            <span className="grow">
              <strong>{lib.label}</strong>
              <span className="sub">
                {lib.items} recording{lib.items === 1 ? '' : 's'}
                {lib.people > 0
                  ? ` · progress from ${lib.people} ${lib.people === 1 ? 'person' : 'people'}`
                  : ''}{' '}
                · last seen {ago(lib.lastSeen)}
              </span>
            </span>
            <button className="btn btn-sm btn-quiet" onClick={() => setAsking(lib)}>
              Forget…
            </button>
          </div>
        ))}
      </div>

      {asking && (
        <Sheet
          title={`Forget ${asking.label}?`}
          onClose={() => !busy && setAsking(null)}
          labelId="forget-title"
        >
          <div className="forget">
            <p>
              Keep it, and nothing is lost: if{' '}
              {asking.items === 1
                ? 'this recording comes'
                : `these ${asking.items} recordings come`}{' '}
              back, ZenPort knows {asking.items === 1 ? 'it' : 'them'} again.
            </p>
            <p>
              Forget it, and ZenPort lets go of them for good: the recordings, everyone&apos;s
              places and ticks and favourites
              {asking.people > 0
                ? ` (${asking.people} ${asking.people === 1 ? 'person has' : 'people have'} some)`
                : ''}
              , your types, roles and orders, and their place in plans. Practice history and journal
              entries stay - they are what happened. The files themselves are never touched.
            </p>
            <div className="forget-actions">
              <button
                className="btn btn-primary"
                onClick={() => setAsking(null)}
                disabled={busy}
                autoFocus
              >
                Keep everything
              </button>
              <button
                className="btn btn-danger"
                onClick={() => void forget(asking)}
                disabled={busy}
              >
                {busy ? 'Forgetting…' : 'Forget it'}
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </section>
  );
}
