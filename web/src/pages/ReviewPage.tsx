/**
 * Review the library (admin): how every recording was read, and a place to
 * correct any of it - titles, creators, series, types, the parts' names,
 * roles and order - or hide what does not belong.
 *
 * Built for a quick sweep, never a chore: the filters open on what is new
 * or worth a look, an item opens in an editor with everything in one place,
 * and its one button - "Looks right", or "Save & next" once something
 * changed - moves straight on to the next. Corrections are kept apart from
 * what the scanner reads, so no rescan or moved folder undoes them.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  formatClock,
  type ContentType,
  type GroupSuggestionDto,
  type ReviewDetailDto,
  type ReviewItemDto,
  type ReviewListDto,
  type ReviewSaveDto,
  type SuggestionDto,
} from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { Cover, EmptyState, ErrorNote, Icon, Sheet, Switch } from '../components/ui.tsx';
import { useReorder } from '../components/useReorder.ts';
import { TYPE_META } from '../content.ts';
import { AdminCrumb, AdminOnly } from './AdminPage.tsx';
import { CreatorsAdmin } from '../components/CreatorsAdmin.tsx';

type Show = 'look' | 'new' | 'edited' | 'hidden' | 'all';
const TYPES: ContentType[] = ['meditation', 'course', 'talk', 'soundscape'];

const FLAG_LABEL: Record<string, string> = {
  'unknown-creator': 'No creator',
  'raw-names': 'File names',
  'mixed-media': 'Check order',
};
const FLAG_HINT: Record<string, string> = {
  'unknown-creator': 'ZenPort could not tell who made it',
  'raw-names': 'Some names are still file names',
  'mixed-media': 'Videos among audio - is the order right?',
};

/** What ZenPort was unsure of and nobody has checked yet. */
const unsure = (i: ReviewItemDto) => !i.hidden && !i.reviewedAt && i.flags.length > 0;

/** What an AI fix changes, in words. */
const FIELD_LABEL: Record<string, string> = {
  title: 'Title',
  creator: 'Creator',
  series: 'Series',
  type: 'Type',
  'part-names': 'Part names',
  order: 'Order of the parts',
};

/** The AI's open fixes, by the recording they are about. */
function fixesByItem(list: SuggestionDto[] | null): Map<string, SuggestionDto[]> {
  const m = new Map<string, SuggestionDto[]>();
  for (const s of list ?? []) {
    if (s.kind !== 'fix' || s.status !== 'pending') continue;
    m.set(s.target, [...(m.get(s.target) ?? []), s]);
  }
  return m;
}

export function ReviewPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'creators' ? 'creators' : 'recordings';
  return (
    <AdminOnly>
      <AdminCrumb here="Review library" />
      <div className="page-head">
        <h1>Review the library</h1>
        <p className="lede">
          How ZenPort read your library. Change anything you like - it survives rescans and moved
          folders.
        </p>
      </div>
      <div className="enh-tabs" role="tablist" aria-label="What to review">
        <button
          role="tab"
          aria-selected={view === 'recordings'}
          className={`enh-tab${view === 'recordings' ? ' on' : ''}`}
          onClick={() => setParams({}, { replace: true })}
        >
          <Icon name="library" size={16} /> Recordings
        </button>
        <button
          role="tab"
          aria-selected={view === 'creators'}
          className={`enh-tab${view === 'creators' ? ' on' : ''}`}
          onClick={() => setParams({ view: 'creators' }, { replace: true })}
        >
          <Icon name="friends" size={16} /> Creators
        </button>
      </div>
      {view === 'creators' ? <CreatorsAdmin /> : <Review />}
    </AdminOnly>
  );
}

function Review() {
  const list = useApi<ReviewListDto>('/api/admin/review');
  const suggestions = useApi<SuggestionDto[]>('/api/ai/library/suggestions');
  const sets = useApi<GroupSuggestionDto[]>('/api/admin/groups');
  const setCount = sets.data?.length ?? 0;
  const fixes = useMemo(() => fixesByItem(suggestions.data), [suggestions.data]);
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [type, setType] = useState<ContentType | 'all'>('all');
  const [open, setOpen] = useState<{ id: string; queue: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  const counts = useMemo(
    () => ({
      new: items.filter((i) => i.isNew && !i.hidden).length,
      // One list of what wants a look: unsure, or with a fix the AI suggests.
      look: items.filter((i) => unsure(i) || (!i.hidden && fixes.has(i.id))).length,
      edited: items.filter((i) => i.edited.length > 0).length,
      hidden: items.filter((i) => i.hidden).length,
      all: items.filter((i) => !i.hidden).length,
    }),
    [items, fixes],
  );

  // ?item=<id> opens that recording straight away (from an AI suggestion).
  const deep = params.get('item');
  useEffect(() => {
    if (deep && items.some((i) => i.id === deep)) setOpen({ id: deep, queue: [deep] });
  }, [deep, items]);

  // Open on what matters: new things first, then what wants a look.
  const asked = params.get('show') as Show | null;
  // Open on what wants a look - or, when nothing does, the whole library.
  const legacy = asked === ('ai' as Show) || asked === ('sets' as Show) ? 'look' : asked;
  const show: Show = legacy ?? (counts.look + setCount > 0 ? 'look' : 'all');
  const pick = (s: Show) => setParams({ show: s }, { replace: true });

  const needle = q.trim().toLowerCase();
  const shown = items.filter((i) => {
    if (show === 'new' && !(i.isNew && !i.hidden)) return false;
    if (show === 'look' && !(unsure(i) || (!i.hidden && fixes.has(i.id)))) return false;
    if (show === 'edited' && i.edited.length === 0) return false;
    if (show === 'hidden' && !i.hidden) return false;
    if (show === 'all' && i.hidden) return false;
    if (type !== 'all' && i.type !== type) return false;
    if (!needle) return true;
    return `${i.title} ${i.creator} ${i.collection ?? ''}`.toLowerCase().includes(needle);
  });
  const groups = useMemo(() => {
    const m = new Map<string, ReviewItemDto[]>();
    for (const i of shown) m.set(i.creator, [...(m.get(i.creator) ?? []), i]);
    return [...m.entries()];
  }, [shown]);

  const markAllNew = async () => {
    setBusy(true);
    try {
      await api.post('/api/admin/review/reviewed', {
        ids: items.filter((i) => i.isNew).map((i) => i.id),
      });
      list.reload();
    } finally {
      setBusy(false);
    }
  };

  const FILTERS: { key: Show; label: string; n: number; hint: string }[] = [
    {
      key: 'look',
      label: 'Needs a look',
      n: counts.look + setCount,
      hint: 'What ZenPort was unsure of, and what your AI suggests',
    },
    { key: 'new', label: 'New', n: counts.new, hint: 'Added since you last looked' },
    { key: 'edited', label: 'Corrected', n: counts.edited, hint: 'Changed by you' },
    { key: 'hidden', label: 'Hidden', n: counts.hidden, hint: 'Left out of the library' },
    { key: 'all', label: 'Everything', n: counts.all, hint: 'The whole library' },
  ];

  return (
    <>
      <div className="review-filters" role="tablist" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={show === f.key}
            className={`review-filter${show === f.key ? ' on' : ''}${f.key === 'look' && f.n > 0 ? ' warn' : ''}`}
            onClick={() => pick(f.key)}
            title={f.hint}
          >
            <strong>{list.data ? f.n : '–'}</strong>
            <span>{f.label}</span>
          </button>
        ))}
      </div>

      <div className="review-tools">
        <label className="folder-search review-search">
          <Icon name="search" size={16} />
          <input
            type="search"
            placeholder="Find a recording, creator or series"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Find a recording"
          />
        </label>
        <div className="chip-row review-types" role="group" aria-label="Type">
          <button
            className={`chip${type === 'all' ? ' on' : ''}`}
            aria-pressed={type === 'all'}
            onClick={() => setType('all')}
          >
            All types
          </button>
          {TYPES.map((t) => (
            <button
              key={t}
              className={`chip${type === t ? ' on' : ''}`}
              aria-pressed={type === t}
              onClick={() => setType(t)}
            >
              <Icon name={TYPE_META[t].icon} size={14} /> {TYPE_META[t].plural}
            </button>
          ))}
        </div>
      </div>

      {show === 'new' && counts.new > 0 && (
        <div className="review-bulk">
          <span>
            {counts.new} new since you last looked. Open one to check it, or if they all read right:
          </span>
          <button
            className="btn btn-sm btn-quiet"
            onClick={() => void markAllNew()}
            disabled={busy}
          >
            <Icon name="check-circle" size={15} /> Mark all as reviewed
          </button>
        </div>
      )}

      {show === 'look' && setCount > 0 && (
        <SetCards
          sets={sets.data ?? []}
          onDone={() => {
            sets.reload();
            list.reload();
          }}
        />
      )}

      {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <div className="skeleton" style={{ height: 320 }} />}

      {list.data && shown.length === 0 && !(show === 'look' && setCount > 0) && (
        <EmptyState title={emptyTitle(show, !!needle || type !== 'all')} art="empty-library">
          {show === 'new' || show === 'look' ? (
            <>
              Everything reads right.{' '}
              <button className="linkish" onClick={() => pick('all')}>
                See the whole library
              </button>
            </>
          ) : null}
        </EmptyState>
      )}

      <div className="review-groups">
        {groups.map(([creator, rows]) => (
          <section key={creator} className="review-group" aria-label={creator}>
            <h2 className="review-group-head">
              {creator}
              <span>{rows.length}</span>
            </h2>
            <ul className="review-list">
              {rows.map((i) => (
                <li key={i.id}>
                  <ReviewRow
                    item={i}
                    fixes={fixes.get(i.id) ?? []}
                    onOpen={() => setOpen({ id: i.id, queue: shown.map((x) => x.id) })}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {open && list.data && (
        <ReviewEditor
          id={open.id}
          queue={open.queue}
          creators={list.data.creators}
          series={list.data.series}
          onMove={(id) => setOpen({ ...open, id })}
          item={items.find((i) => i.id === open.id) ?? null}
          fixes={fixes.get(open.id) ?? []}
          onFixesChanged={suggestions.reload}
          onSaved={() => list.reload()}
          onClose={() => {
            setOpen(null);
            if (deep) {
              setParams(
                (p) => {
                  p.delete('item');
                  return p;
                },
                { replace: true },
              );
            }
            list.reload();
            suggestions.reload();
          }}
        />
      )}
    </>
  );
}

function emptyTitle(show: Show, narrowed: boolean): string {
  if (narrowed) return 'Nothing matches';
  if (show === 'new') return 'Nothing new';
  if (show === 'look') return 'All in order';
  if (show === 'edited') return 'No corrections yet';
  if (show === 'hidden') return 'Nothing hidden';
  return 'The library is empty';
}

function ReviewRow({
  item,
  fixes,
  onOpen,
}: {
  item: ReviewItemDto;
  fixes: SuggestionDto[];
  onOpen: () => void;
}) {
  const meta = TYPE_META[item.type];
  return (
    <button className={`review-row${item.hidden ? ' is-hidden' : ''}`} onClick={onOpen}>
      <span className="review-cover">
        <Cover coverId={item.coverId} title={item.title} creator={item.creator} />
      </span>
      <span className="review-main">
        <span className="review-title">
          {item.isNew && <span className="review-new" aria-label="New" />}
          {item.title}
        </span>
        <span className="sub">
          <Icon name={meta.icon} size={12} /> {meta.label}
          {item.collection ? ` · ${item.collection}` : ''}
          {item.trackCount > 1 ? ` · ${item.trackCount} ${meta.parts}` : ''}
        </span>
        {(item.flags.length > 0 || item.edited.length > 0 || item.hidden || fixes.length > 0) && (
          <span className="review-tags">
            {item.hidden && (
              <span className="review-tag">
                <Icon name="eye-off" size={11} /> Hidden
              </span>
            )}
            {!item.reviewedAt &&
              item.flags.map((f) => (
                <span key={f} className="review-tag warn" title={FLAG_HINT[f]}>
                  {FLAG_LABEL[f]}
                </span>
              ))}
            {fixes.length > 0 && (
              <span
                className="review-tag ai"
                title={`AI suggests: ${fixes.map((f) => FIELD_LABEL[f.field] ?? f.field).join(', ')}`}
              >
                <Icon name="sparkle" size={11} /> AI:{' '}
                {fixes.map((f) => (FIELD_LABEL[f.field] ?? f.field).toLowerCase()).join(', ')}
              </span>
            )}
            {item.edited.length > 0 && (
              <span className="review-tag done" title={`Corrected: ${item.edited.join(', ')}`}>
                <Icon name="check-circle" size={11} /> Corrected
              </span>
            )}
          </span>
        )}
      </span>
      <Icon name="chevron-right" size={16} />
    </button>
  );
}

// ── The editor ─────────────────────────────────────────────────────────────

function ReviewEditor({
  id,
  queue,
  creators,
  series,
  item,
  fixes,
  onFixesChanged,
  onMove,
  onSaved,
  onClose,
}: {
  id: string;
  queue: string[];
  creators: string[];
  series: { creator: string; collection: string }[];
  item: ReviewItemDto | null;
  fixes: SuggestionDto[];
  onFixesChanged: () => void;
  onMove: (id: string) => void;
  onSaved: () => void;
  onClose: () => void;
}) {
  const detail = useApi<ReviewDetailDto>(`/api/admin/items/${id}`);
  // An AI fix applied here changes the recording itself: read it again, and
  // start the form over from what it now is.
  // Only once the new reading has arrived: starting over from the old one
  // would show the recording as it was before the fix.
  const [rev, setRev] = useState(0);
  const waiting = useRef(false);
  useEffect(() => {
    if (waiting.current && detail.data) {
      waiting.current = false;
      setRev((r) => r + 1);
    }
  }, [detail.data]);
  const applied = () => {
    waiting.current = true;
    detail.reload();
    onFixesChanged();
    onSaved();
  };
  const at = queue.indexOf(id);
  const title = queue.length > 1 && at >= 0 ? `Review · ${at + 1} of ${queue.length}` : 'Review';
  return (
    <Sheet title={title} onClose={onClose} labelId="review-title">
      {detail.error && <ErrorNote message={detail.error} onRetry={detail.reload} />}
      {!detail.data || detail.data.id !== id ? (
        <div className="skeleton" style={{ height: 360 }} />
      ) : (
        <EditorForm
          key={`${id}:${rev}`}
          d={detail.data}
          flags={item && !item.reviewedAt ? item.flags : []}
          fixes={fixes}
          onApplied={applied}
          onDismissed={onFixesChanged}
          creators={creators}
          series={series}
          prev={at > 0 ? queue[at - 1]! : null}
          next={at >= 0 && at < queue.length - 1 ? queue[at + 1]! : null}
          onMove={onMove}
          onSaved={onSaved}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

type Part = ReviewDetailDto['tracks'][number];

function EditorForm({
  d,
  flags,
  fixes,
  onApplied,
  onDismissed,
  creators,
  series,
  prev,
  next,
  onMove,
  onSaved,
  onClose,
}: {
  d: ReviewDetailDto;
  flags: ReviewItemDto['flags'];
  fixes: SuggestionDto[];
  onApplied: () => void;
  onDismissed: () => void;
  creators: string[];
  series: { creator: string; collection: string }[];
  prev: string | null;
  next: string | null;
  onMove: (id: string) => void;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(d.title);
  const [creator, setCreator] = useState(d.creator);
  const [collection, setCollection] = useState(d.collection ?? '');
  const [type, setType] = useState<ContentType>(d.type);
  const [scope, setScope] = useState<'item' | 'series'>('item');
  const [hidden, setHidden] = useState(d.hidden);
  const [names, setNames] = useState<Record<string, string>>(
    Object.fromEntries(d.tracks.map((t) => [t.id, t.title])),
  );
  const [roles, setRoles] = useState<Record<string, Part['role']>>(
    Object.fromEntries(d.tracks.map((t) => [t.id, t.role])),
  );
  const { order, setOrder, dragging, listRef, gripProps, rowProps } = useReorder<Part>(d.tracks);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderChanged = order.some((t, i) => t.id !== d.tracks[i]?.id);
  const changedParts = d.tracks.filter(
    (t) => (names[t.id] ?? '').trim() !== t.title || roles[t.id] !== t.role,
  );
  const changed = {
    title: title.trim() !== d.title,
    creator: creator.trim() !== d.creator,
    series: collection.trim() !== (d.collection ?? ''),
    type: type !== d.type,
    hidden: hidden !== d.hidden,
    parts: changedParts.length > 0,
    order: orderChanged,
  };
  const dirty = Object.values(changed).some(Boolean);
  const learning = type === 'course' || type === 'talk';
  // Only names still as the file had them: a name typed by hand is kept.
  const suggestions = d.tracks.filter(
    (t) => t.suggestion && (names[t.id] ?? '').trim() === t.scannedTitle,
  );
  const isScannedOrder = order.every((t, i) => t.id === d.scannedOrder[i]);
  const seriesFor = series.filter((s) => s.creator === creator.trim()).map((s) => s.collection);

  // Keyboard: ⌘/Ctrl+Enter is the main button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void commit(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** Save what changed (or just mark it reviewed), then go to `to` - or close. */
  const commit = async (to: string | null, markReviewed = true) => {
    setSaving(true);
    setError(null);
    try {
      if (dirty) {
        const body: ReviewSaveDto = {};
        if (changed.title) body.title = title;
        if (changed.creator) body.creator = creator;
        if (changed.series) body.series = collection;
        if (changed.type) body.type = type;
        if ((changed.creator || changed.series || changed.type) && scope === 'series') {
          body.scope = 'series';
        }
        if (changed.parts) {
          body.tracks = changedParts.map((t) => ({
            id: t.id,
            ...((names[t.id] ?? '').trim() !== t.title ? { title: names[t.id] ?? '' } : {}),
            ...(roles[t.id] !== t.role ? { role: roles[t.id] } : {}),
          }));
        }
        if (changed.order) body.order = order.map((t) => t.id);
        if (changed.hidden) body.hidden = hidden;
        await api.put(`/api/admin/items/${d.id}`, body);
      } else if (markReviewed) {
        await api.post('/api/admin/review/reviewed', { ids: [d.id] });
      }
      onSaved();
      if (to) onMove(to);
      else onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That could not be saved.');
      setSaving(false);
    }
  };
  const skip = (to: string) => (dirty ? void commit(to) : onMove(to));

  return (
    <div className="review-edit">
      <div className="review-edit-head">
        <span className="review-edit-cover">
          <Cover coverId={d.coverId} title={d.title} creator={d.creator} />
        </span>
        <div>
          <p className="review-path" title="Where it lives in the library">
            <Icon name="folder" size={12} /> {[d.rootLabel, ...d.path].join(' / ')}
          </p>
          <Link className="review-open" to={`/m/${d.id}`} onClick={onClose}>
            Open its page <Icon name="chevron-right" size={13} />
          </Link>
        </div>
      </div>

      <LookAt
        d={d}
        flags={flags}
        fixes={fixes}
        names={names}
        order={order}
        onTidy={() =>
          setNames((n) => ({
            ...n,
            ...Object.fromEntries(suggestions.map((t) => [t.id, t.suggestion!])),
          }))
        }
        onApplied={onApplied}
        onDismissed={onDismissed}
      />

      <section className="review-fields" aria-label="Details">
        <Field
          label="Title"
          value={title}
          onChange={setTitle}
          scanned={d.scanned.title}
          placeholder={d.scanned.title}
        />
        <Field
          label="Creator"
          value={creator}
          onChange={setCreator}
          scanned={d.scanned.creator}
          placeholder={d.scanned.creator}
          options={creators}
          listId="review-creators"
        />
        <Field
          label="Series"
          value={collection}
          onChange={setCollection}
          scanned={d.scanned.collection ?? ''}
          placeholder="No series"
          options={seriesFor}
          listId="review-series"
        />

        <div className="review-field">
          <span className="review-label">Type</span>
          <div className="review-type" role="radiogroup" aria-label="Type">
            {TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                className={`review-type-opt${type === t ? ' on' : ''}`}
                onClick={() => setType(t)}
              >
                <Icon name={TYPE_META[t].icon} size={16} />
                {TYPE_META[t].label}
              </button>
            ))}
          </div>
          {type !== d.scanned.type && (
            <p className="review-was">
              Read as {TYPE_META[d.scanned.type].label.toLowerCase()}
              <button type="button" className="linkish" onClick={() => setType(d.scanned.type)}>
                Use that
              </button>
            </p>
          )}
        </div>

        {d.seriesSize > 1 && (changed.creator || changed.series || changed.type) && (
          <label className="review-scope">
            <input
              type="checkbox"
              checked={scope === 'series'}
              onChange={(e) => setScope(e.target.checked ? 'series' : 'item')}
            />
            <span>
              Also for the other {d.seriesSize - 1} in <strong>{d.collection}</strong> - creator,
              series and type
            </span>
          </label>
        )}
      </section>

      {d.tracks.length > 0 && (
        <section className="review-parts" aria-labelledby="review-parts-h">
          <div className="review-parts-head">
            <h3 id="review-parts-h">
              {d.tracks.length > 1 ? TYPE_META[type].parts : TYPE_META[type].part}
            </h3>
            <div className="review-parts-tools">
              {suggestions.length > 0 && (
                <button
                  type="button"
                  className="btn btn-sm btn-quiet"
                  onClick={() =>
                    setNames((n) => ({
                      ...n,
                      ...Object.fromEntries(suggestions.map((t) => [t.id, t.suggestion!])),
                    }))
                  }
                  title="Replace file-like names with tidier ones - nothing is saved until you save"
                >
                  <Icon name="sparkle" size={14} /> Tidy names
                </button>
              )}
              {d.tracks.length > 1 && !isScannedOrder && (
                <button
                  type="button"
                  className="btn btn-sm btn-quiet"
                  onClick={() =>
                    setOrder(d.scannedOrder.map((tid) => d.tracks.find((t) => t.id === tid)!))
                  }
                >
                  <Icon name="restart" size={14} /> Scanned order
                </button>
              )}
            </div>
          </div>
          <ol
            className={`reorder-list review-part-list${dragging ? ' is-dragging' : ''}`}
            ref={listRef}
          >
            {order.map((t, i) => {
              const { lifted, ...row } = rowProps(t, i);
              const name = names[t.id] ?? '';
              return (
                <li
                  key={t.id}
                  className={`reorder-row review-part${lifted ? ' lifted' : ''}`}
                  {...row}
                >
                  {d.tracks.length > 1 ? (
                    <button
                      type="button"
                      className="reorder-grip"
                      aria-label={`Move ${name} - position ${i + 1} of ${order.length}`}
                      {...gripProps(t, i)}
                    >
                      <Icon name="grip" size={20} />
                    </button>
                  ) : (
                    <span />
                  )}
                  <span className="reorder-n">{i + 1}</span>
                  <span className="review-part-main">
                    <AutoText
                      className="review-part-name"
                      value={name}
                      placeholder={t.scannedTitle}
                      onChange={(v) => setNames((n) => ({ ...n, [t.id]: v }))}
                      label={`Name of part ${i + 1}`}
                    />
                    {name.trim() !== t.title && (
                      <span className="review-part-was">
                        was <s>{t.title}</s>
                      </span>
                    )}
                    <span className="sub">
                      {t.video ? (
                        <>
                          <Icon name="video" size={11} /> video
                        </>
                      ) : (
                        `.${t.ext}`
                      )}
                      {t.durationSec ? ` · ${formatClock(t.durationSec)}` : ''}
                      {name.trim() !== t.title ? (
                        <button
                          type="button"
                          className="linkish review-part-reset"
                          onClick={() => setNames((n) => ({ ...n, [t.id]: t.title }))}
                        >
                          undo
                        </button>
                      ) : (
                        t.title !== t.scannedTitle && (
                          <button
                            type="button"
                            className="linkish review-part-reset"
                            onClick={() => setNames((n) => ({ ...n, [t.id]: t.scannedTitle }))}
                            title={t.scannedTitle}
                          >
                            use the file name
                          </button>
                        )
                      )}
                    </span>
                  </span>
                  {learning && (
                    <button
                      type="button"
                      className={`role-chip${roles[t.id] === 'practice' ? ' practice' : ''}`}
                      onClick={() =>
                        setRoles((r) => ({
                          ...r,
                          [t.id]: r[t.id] === 'practice' ? 'lesson' : 'practice',
                        }))
                      }
                      title="A lesson to study, or a meditation to do - tap to switch"
                    >
                      <Icon name={roles[t.id] === 'practice' ? 'lotus' : 'book'} size={12} />
                      {roles[t.id] === 'practice' ? 'Meditation' : 'Lesson'}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <section className="review-visible">
        <div className="grow">
          <strong>Show in the library</strong>
          <span className="sub">
            Hidden recordings leave every shelf and search. Their files stay exactly as they are.
          </span>
        </div>
        <Switch checked={!hidden} onChange={(v) => setHidden(!v)} label="Show in the library" />
      </section>

      {d.evidence.length > 0 && (
        <details className="about review-why">
          <summary>How ZenPort read it</summary>
          <ul>
            {d.evidence.map((e, i) => (
              <li key={i}>
                <strong>{e.field}</strong>: {e.value} - <span>{e.evidence}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {error && (
        <p className="hint" role="alert">
          {error}
        </p>
      )}

      <div className="review-foot">
        <div className="review-nav">
          <button
            type="button"
            className="icon-btn"
            aria-label="Previous"
            disabled={!prev || saving}
            onClick={() => prev && skip(prev)}
          >
            <Icon name="chevron-left" size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Next, without marking this one reviewed"
            disabled={!next || saving}
            onClick={() => next && skip(next)}
          >
            <Icon name="chevron-right" size={18} />
          </button>
        </div>
        <button
          type="button"
          className="btn btn-primary review-go"
          onClick={() => void commit(next)}
          disabled={saving}
        >
          {saving ? (
            'Saving…'
          ) : dirty ? (
            next ? (
              'Save & next'
            ) : (
              'Save'
            )
          ) : (
            <>
              <Icon name="check-circle" size={16} /> {next ? 'Looks right' : 'Looks right - done'}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  scanned,
  placeholder,
  options,
  listId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  scanned: string;
  placeholder?: string;
  options?: string[];
  listId?: string;
}) {
  const differs = value.trim() !== scanned;
  return (
    <label className="review-field">
      <span className="review-label">{label}</span>
      <input
        className="input"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        list={options && options.length > 0 ? listId : undefined}
      />
      {options && options.length > 0 && (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
      {differs && (
        <span className="review-was">
          Read as {scanned ? `“${scanned}”` : 'none'}
          <button type="button" className="linkish" onClick={() => onChange(scanned)}>
            Use that
          </button>
        </span>
      )}
    </label>
  );
}

/** One line of text that wraps and grows, so a long name is always read whole. */
function AutoText({
  value,
  onChange,
  placeholder,
  label,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.blockSize = 'auto';
    el.style.blockSize = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      className={className}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      // A name is one line: Enter finishes it rather than breaking it.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onChange={(e) => onChange(e.target.value.replace(/\s*\n\s*/g, ' '))}
    />
  );
}

/**
 * Why this recording is in front of you, in plain words: what ZenPort was
 * unsure of, and what your AI suggests - each with what it is now and what
 * it would become, and one tap to take it or leave it.
 */
function LookAt({
  d,
  flags,
  fixes,
  names,
  order,
  onTidy,
  onApplied,
  onDismissed,
}: {
  d: ReviewDetailDto;
  flags: ReviewItemDto['flags'];
  fixes: SuggestionDto[];
  names: Record<string, string>;
  order: Part[];
  onTidy: () => void;
  onApplied: () => void;
  onDismissed: () => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState<Set<number>>(new Set());
  const open = fixes.filter((f) => !gone.has(f.id));
  if (flags.length === 0 && open.length === 0) return null;

  const tidy = d.tracks.filter(
    (t) => t.suggestion && (names[t.id] ?? '').trim() === t.scannedTitle,
  );
  const tidied = d.tracks.filter(
    (t) => t.suggestion && (names[t.id] ?? '').trim() === t.suggestion,
  );
  const videos = d.tracks.filter((t) => t.video).length;

  const act = async (f: SuggestionDto, how: 'apply' | 'dismiss') => {
    setBusy(f.id);
    setError(null);
    try {
      await api.post(`/api/ai/library/suggestions/${f.id}/${how}`, {});
      setGone((g) => new Set(g).add(f.id));
      if (how === 'apply') onApplied();
      else onDismissed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="look-at" aria-labelledby="look-at-h">
      <h3 id="look-at-h">
        <Icon name="eye" size={15} /> What to look at
      </h3>
      <ul className="look-list">
        {flags.includes('raw-names') && (
          <li className="look-item">
            <span className="look-kind">Part names</span>
            <p>
              {tidied.length > 0 && tidy.length === 0
                ? `Tidier names are in place for ${tidied.length} ${tidied.length === 1 ? 'part' : 'parts'} - save to keep them.`
                : tidy.length > 0
                  ? `${tidy.length} ${tidy.length === 1 ? 'part is' : 'parts are'} still named like files. ZenPort can tidy them:`
                  : 'Some parts are still named like files. Rename any of them below, or leave them as they are.'}
            </p>
            {tidy.length > 0 && (
              <>
                <ul className="look-diff">
                  {tidy.slice(0, 4).map((t) => (
                    <li key={t.id}>
                      <s>{t.scannedTitle}</s>
                      <Icon name="chevron-right" size={12} />
                      <span>{t.suggestion}</span>
                    </li>
                  ))}
                  {tidy.length > 4 && <li className="sub">and {tidy.length - 4} more</li>}
                </ul>
                <button type="button" className="btn btn-sm btn-quiet" onClick={onTidy}>
                  <Icon name="sparkle" size={14} /> Use the tidier names
                </button>
              </>
            )}
          </li>
        )}
        {flags.includes('mixed-media') && (
          <li className="look-item">
            <span className="look-kind">Order</span>
            <p>
              It mixes {videos} {videos === 1 ? 'video' : 'videos'} with {d.tracks.length - videos}{' '}
              audio {d.tracks.length - videos === 1 ? 'file' : 'files'}, so the order may be off. It
              plays as below:{' '}
              <strong>
                {order
                  .map((t, i) => `${i + 1}. ${names[t.id] ?? t.title}`)
                  .slice(0, 3)
                  .join(' · ')}
              </strong>
              {order.length > 3 ? ' …' : ''}. Drag the parts to change it.
            </p>
          </li>
        )}
        {flags.includes('unknown-creator') && (
          <li className="look-item">
            <span className="look-kind">Creator</span>
            <p>ZenPort could not tell who made it. Type the creator below.</p>
          </li>
        )}
        {open.map((f) => (
          <li key={f.id} className="look-item is-ai">
            <span className="look-kind">
              <Icon name="sparkle" size={12} /> AI suggests · {FIELD_LABEL[f.field] ?? f.field}
            </span>
            {f.parts && f.parts.length > 0 ? (
              <ul className="look-diff">
                {f.parts
                  .filter((p) => p.from !== p.to)
                  .slice(0, 6)
                  .map((p, i) => (
                    <li key={i}>
                      <s>{p.from}</s>
                      <Icon name="chevron-right" size={12} />
                      <span>{p.to}</span>
                    </li>
                  ))}
                {f.parts.filter((p) => p.from !== p.to).length > 6 && (
                  <li className="sub">
                    and {f.parts.filter((p) => p.from !== p.to).length - 6} more
                  </li>
                )}
              </ul>
            ) : (
              <ul className="look-diff">
                <li>
                  <s>{f.from || 'none'}</s>
                  <Icon name="chevron-right" size={12} />
                  <span>{f.to || 'none'}</span>
                </li>
              </ul>
            )}
            {f.reason && <p className="look-why">{f.reason}</p>}
            <div className="look-actions">
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={busy !== null}
                onClick={() => void act(f, 'apply')}
              >
                {busy === f.id ? 'Applying…' : 'Apply'}
              </button>
              <button
                type="button"
                className="btn btn-sm btn-quiet"
                disabled={busy !== null}
                onClick={() => void act(f, 'dismiss')}
              >
                Keep as is
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p className="hint" role="alert">
          {error}
        </p>
      )}
      <p className="look-foot">
        Nothing to change? <strong>Looks right</strong> marks it checked and moves on.
      </p>
    </section>
  );
}

/**
 * Recordings that look like one set, filed apart ("Vol. 1" to "Vol. 5" side
 * by side): grouped, they become one series - in their numbered order - on
 * the creator's page, and each stays exactly as it is inside it.
 */
function SetCards({ sets, onDone }: { sets: GroupSuggestionDto[]; onDone: () => void }) {
  if (sets.length === 0) {
    return (
      <EmptyState title="Nothing to group" art="empty-library">
        Every set of recordings is already together.
      </EmptyState>
    );
  }
  return (
    <div className="set-cards">
      <p className="set-intro">
        These recordings sit apart, each in its own folder, but their names say they are one set.
        Grouped, they show as one series on the creator&apos;s page, in this order. Nothing in your
        folders changes, and you can take any of them out again from Review.
      </p>
      {sets.map((g) => (
        <SetCard key={g.key} g={g} onDone={onDone} />
      ))}
    </div>
  );
}

function SetCard({ g, onDone }: { g: GroupSuggestionDto; onDone: () => void }) {
  const [name, setName] = useState(g.name);
  const [busy, setBusy] = useState<'apply' | 'dismiss' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const shown = open ? g.items : g.items.slice(0, 5);
  const act = async (how: 'apply' | 'dismiss') => {
    setBusy(how);
    setError(null);
    try {
      if (how === 'apply') {
        await api.post('/api/admin/groups/apply', { ids: g.items.map((i) => i.id), name });
      } else {
        await api.post('/api/admin/groups/dismiss', { key: g.key });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      setBusy(null);
    }
  };
  return (
    <article className="set-card">
      <header className="set-head">
        <span className="set-kind">
          <Icon name="library" size={13} />{' '}
          {g.why === 'numbered'
            ? `${g.items.length} numbered recordings`
            : `${g.items.length} recordings sharing a name`}
        </span>
        <span className="sub">{g.creator}</span>
      </header>
      <ol className="set-items">
        {shown.map((i) => (
          <li key={i.id}>
            <span className="set-cover">
              <Cover coverId={i.coverId} title={i.title} creator={g.creator} />
            </span>
            <span className="set-title">{i.title}</span>
          </li>
        ))}
      </ol>
      {g.items.length > 5 && (
        <button type="button" className="linkish set-more" onClick={() => setOpen((o) => !o)}>
          {open ? 'Show fewer' : `and ${g.items.length - 5} more`}
        </button>
      )}
      <label className="review-field set-name">
        <span className="review-label">Series name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      {error && (
        <p className="hint" role="alert">
          {error}
        </p>
      )}
      <div className="set-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy !== null || !name.trim()}
          onClick={() => void act('apply')}
        >
          <Icon name="check-circle" size={16} />
          {busy === 'apply' ? 'Grouping…' : 'Group as one series'}
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          disabled={busy !== null}
          onClick={() => void act('dismiss')}
        >
          Not together
        </button>
      </div>
    </article>
  );
}
