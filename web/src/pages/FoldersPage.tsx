/**
 * Library folders: everything the last scan walked, with a switch per folder.
 *
 * Switching a folder off leaves it (and everything under it) out of the
 * library - no shelves, no counts, no search - without touching a single
 * file. The rescan runs as part of the change, so the page answers with the
 * library as it now is. Only the admin can change it; everyone can look.
 */
import { useMemo, useState } from 'react';
import type { FolderNodeDto, LibraryFoldersDto, ScanStateDto } from '@zenport/shared';
import { api } from '../api.ts';
import { useAuth } from '../App.tsx';
import { useApi } from '../hooks.ts';
import { ErrorNote, Icon, Switch } from '../components/ui.tsx';
import { AdminCrumb } from './AdminPage.tsx';

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
    </>
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
