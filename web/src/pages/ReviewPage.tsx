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
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  formatClock,
  type ContentType,
  type ReviewDetailDto,
  type ReviewItemDto,
  type ReviewListDto,
  type ReviewSaveDto,
} from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { Cover, EmptyState, ErrorNote, Icon, Sheet, Switch } from '../components/ui.tsx';
import { useReorder } from '../components/useReorder.ts';
import { TYPE_META } from '../content.ts';
import { AdminCrumb, AdminOnly } from './AdminPage.tsx';

type Show = 'new' | 'look' | 'edited' | 'hidden' | 'all';
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

const worthALook = (i: ReviewItemDto) => !i.hidden && !i.reviewedAt && i.flags.length > 0;

export function ReviewPage() {
  return (
    <AdminOnly>
      <Review />
    </AdminOnly>
  );
}

function Review() {
  const list = useApi<ReviewListDto>('/api/admin/review');
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [type, setType] = useState<ContentType | 'all'>('all');
  const [open, setOpen] = useState<{ id: string; queue: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  const counts = useMemo(
    () => ({
      new: items.filter((i) => i.isNew && !i.hidden).length,
      look: items.filter(worthALook).length,
      edited: items.filter((i) => i.edited.length > 0).length,
      hidden: items.filter((i) => i.hidden).length,
      all: items.filter((i) => !i.hidden).length,
    }),
    [items],
  );

  // Open on what matters: new things first, then what wants a look.
  const asked = params.get('show') as Show | null;
  const show: Show = asked ?? (counts.new > 0 ? 'new' : counts.look > 0 ? 'look' : 'all');
  const pick = (s: Show) => setParams({ show: s }, { replace: true });

  const needle = q.trim().toLowerCase();
  const shown = items.filter((i) => {
    if (show === 'new' && !(i.isNew && !i.hidden)) return false;
    if (show === 'look' && !worthALook(i)) return false;
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
    { key: 'new', label: 'New', n: counts.new, hint: 'Added since you last looked' },
    { key: 'look', label: 'Worth a look', n: counts.look, hint: 'ZenPort was unsure' },
    { key: 'edited', label: 'Corrected', n: counts.edited, hint: 'Changed by you' },
    { key: 'hidden', label: 'Hidden', n: counts.hidden, hint: 'Left out of the library' },
    { key: 'all', label: 'Everything', n: counts.all, hint: 'The whole library' },
  ];

  return (
    <>
      <AdminCrumb here="Review library" />
      <div className="page-head">
        <h1>Review the library</h1>
        <p className="lede">
          How ZenPort read each recording. Correct anything - titles, creators, series, types, the
          parts&apos; names and order - or hide what does not belong. Nothing here is required, and
          your corrections survive rescans and moved folders.
        </p>
      </div>

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

      {list.error && <ErrorNote message={list.error} onRetry={list.reload} />}
      {list.loading && !list.data && <div className="skeleton" style={{ height: 320 }} />}

      {list.data && shown.length === 0 && (
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
          onSaved={() => list.reload()}
          onClose={() => {
            setOpen(null);
            list.reload();
          }}
        />
      )}
    </>
  );
}

function emptyTitle(show: Show, narrowed: boolean): string {
  if (narrowed) return 'Nothing matches';
  if (show === 'new') return 'Nothing new';
  if (show === 'look') return 'Nothing wants a look';
  if (show === 'edited') return 'No corrections yet';
  if (show === 'hidden') return 'Nothing hidden';
  return 'The library is empty';
}

function ReviewRow({ item, onOpen }: { item: ReviewItemDto; onOpen: () => void }) {
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
        {(item.flags.length > 0 || item.edited.length > 0 || item.hidden) && (
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
  onMove,
  onSaved,
  onClose,
}: {
  id: string;
  queue: string[];
  creators: string[];
  series: { creator: string; collection: string }[];
  onMove: (id: string) => void;
  onSaved: () => void;
  onClose: () => void;
}) {
  const detail = useApi<ReviewDetailDto>(`/api/admin/items/${id}`);
  const at = queue.indexOf(id);
  const title = queue.length > 1 && at >= 0 ? `Review · ${at + 1} of ${queue.length}` : 'Review';
  return (
    <Sheet title={title} onClose={onClose} labelId="review-title">
      {detail.error && <ErrorNote message={detail.error} onRetry={detail.reload} />}
      {!detail.data || detail.data.id !== id ? (
        <div className="skeleton" style={{ height: 360 }} />
      ) : (
        <EditorForm
          key={id}
          d={detail.data}
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
  creators,
  series,
  prev,
  next,
  onMove,
  onSaved,
  onClose,
}: {
  d: ReviewDetailDto;
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
                    <input
                      className="review-part-name"
                      value={name}
                      placeholder={t.scannedTitle}
                      onChange={(e) => setNames((n) => ({ ...n, [t.id]: e.target.value }))}
                      aria-label={`Name of part ${i + 1}`}
                    />
                    <span className="sub">
                      {t.video ? (
                        <>
                          <Icon name="video" size={11} /> video
                        </>
                      ) : (
                        `.${t.ext}`
                      )}
                      {t.durationSec ? ` · ${formatClock(t.durationSec)}` : ''}
                      {name.trim() !== t.scannedTitle && (
                        <button
                          type="button"
                          className="linkish review-part-reset"
                          onClick={() => setNames((n) => ({ ...n, [t.id]: t.scannedTitle }))}
                          title={t.scannedTitle}
                        >
                          file name
                        </button>
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
