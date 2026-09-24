/**
 * Discover: teachers, courses, books and retreats beyond your library, found
 * on the web by your AI and chosen for you - each with why it suits you.
 * Every link was opened before it is shown here. Keep what you like; each
 * search stays until you forget it.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DISCOVER_KINDS,
  type DiscoverDto,
  type DiscoverItemDto,
  type DiscoverKind,
  type DiscoverRunDto,
} from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { EmptyState, ErrorNote, Icon } from '../components/ui.tsx';

const KIND_ICON: Record<DiscoverKind, string> = {
  teacher: 'friends',
  course: 'book',
  book: 'doc',
  retreat: 'lotus',
};
const KIND_ONE: Record<DiscoverKind, string> = {
  teacher: 'Teacher',
  course: 'Course',
  book: 'Book',
  retreat: 'Retreat',
};

const runDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });

export function DiscoverPage() {
  const data = useApi<DiscoverDto>('/api/ai/discover');
  const [kinds, setKinds] = useState<DiscoverKind[]>(['teacher', 'course', 'book']);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropped, setDropped] = useState<number | null>(null);
  const d = data.data;
  const ready = !!d?.canUse && d.webSearch;

  const toggle = (k: DiscoverKind) =>
    setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  const go = async () => {
    setBusy(true);
    setError(null);
    setDropped(null);
    try {
      const run = await api.post<DiscoverRunDto>('/api/ai/discover', {
        kinds,
        note: note.trim() || undefined,
      });
      setDropped(run.dropped ?? 0);
      setNote('');
      data.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nothing could be found this time.');
    } finally {
      setBusy(false);
    }
  };

  const save = async (item: DiscoverItemDto, saved: boolean) => {
    await api.put(`/api/ai/discover/items/${item.id}`, { saved }).catch(() => {});
    data.reload();
  };
  const forget = async (run: DiscoverRunDto) => {
    if (!window.confirm('Forget this search? Anything you saved from it stays saved.')) return;
    await api.del(`/api/ai/discover/runs/${run.id}`).catch(() => {});
    data.reload();
  };

  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/ai">AI</Link>
        <span className="sep">/</span>
        <span aria-current="page">Discover</span>
      </nav>
      <div className="page-head">
        <h1>Discover</h1>
        <p className="lede">
          Teachers, courses, books and retreats beyond your library - found on the web by your AI,
          and chosen for you, with why each might suit you.
        </p>
      </div>

      {data.error && <ErrorNote message={data.error} onRetry={data.reload} />}
      {d && !d.canUse && (
        <div className="enh-notice">
          <Icon name="sparkle" size={18} />
          <span className="grow">Discover needs an AI - your own key, or one shared here.</span>
          <Link className="btn btn-primary btn-sm" to="/ai/setup?return=/ai/discover">
            Set up AI
          </Link>
        </div>
      )}
      {d?.canUse && !d.webSearch && (
        <div className="enh-notice">
          <Icon name="search" size={18} />
          <span className="grow">
            Discover searches the web, which your own server cannot. Switch to OpenAI, Anthropic,
            Gemini or OpenRouter.
          </span>
          <Link className="btn btn-quiet btn-sm" to="/ai/setup?return=/ai/discover">
            Change
          </Link>
        </div>
      )}

      <section className="ai-card disc-ask" aria-labelledby="disc-ask-h">
        <h2 id="disc-ask-h">What would you like to find?</h2>
        <div className="chip-row" role="group" aria-label="Kinds">
          {DISCOVER_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className="chip"
              aria-pressed={kinds.includes(k.id)}
              onClick={() => toggle(k.id)}
            >
              <Icon name={KIND_ICON[k.id]} size={15} /> {k.label}
            </button>
          ))}
        </div>
        <div className="guide-field">
          <label className="guide-label" htmlFor="disc-note">
            Anything in particular? <span className="faint">Optional</span>
          </label>
          <input
            id="disc-note"
            maxLength={600}
            placeholder="Something for sleep · a teacher who explains the basics · a weekend retreat"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && ready && kinds.length && !busy) void go();
            }}
          />
        </div>
        <p className="disc-sent">
          <Icon name="shield" size={14} /> Sent: your intentions, what you practise most, the
          creators in your library (so it looks beyond them) and what you write above - never your
          journal.
        </p>
        <button
          className="btn btn-primary guide-go"
          disabled={!ready || kinds.length === 0 || busy}
          onClick={() => void go()}
        >
          <Icon name="search" size={16} />
          {busy ? 'Searching…' : 'Discover'}
        </button>
        {busy && (
          <div className="guide-thinking inline" role="status">
            <span className="guide-orb" aria-hidden="true" />
            <p>
              Searching the web, then opening every link to be sure it works. Up to two minutes.
            </p>
          </div>
        )}
        {error && <ErrorNote message={error} />}
        {dropped !== null && dropped > 0 && !busy && (
          <p className="faint disc-dropped">
            {dropped} {dropped === 1 ? 'suggestion was' : 'suggestions were'} left out - the link
            would not open.
          </p>
        )}
      </section>

      {d && d.saved.length > 0 && (
        <section className="section" aria-labelledby="disc-saved">
          <div className="section-head">
            <h2 id="disc-saved">Saved</h2>
          </div>
          <ul className="disc-grid">
            {d.saved.map((i) => (
              <DiscoverCard key={i.id} item={i} onSave={(v) => void save(i, v)} />
            ))}
          </ul>
        </section>
      )}

      {d?.runs.map((run) => (
        <section className="section" key={run.id} aria-label={`Found ${runDate(run.createdAt)}`}>
          <div className="section-head disc-head">
            <div className="disc-run-h">
              <h2>{runDate(run.createdAt)}</h2>
              <span className="sub">
                {run.kinds.map((k) => KIND_ONE[k].toLowerCase() + 's').join(', ')}
                {run.note ? ` · “${run.note}”` : ''}
              </span>
            </div>
            <button
              className="icon-btn"
              aria-label="Forget this search"
              title="Forget this search"
              onClick={() => void forget(run)}
            >
              <Icon name="trash" size={16} />
            </button>
          </div>
          <ul className="disc-grid">
            {run.items.map((i) => (
              <DiscoverCard key={i.id} item={i} onSave={(v) => void save(i, v)} />
            ))}
          </ul>
        </section>
      ))}

      {d && d.runs.length === 0 && d.saved.length === 0 && ready && !busy && (
        <EmptyState title="Nothing found yet">
          Choose what you would like, and Discover looks beyond your library.
        </EmptyState>
      )}
    </>
  );
}

function DiscoverCard({
  item,
  onSave,
}: {
  item: DiscoverItemDto;
  onSave: (saved: boolean) => void;
}) {
  return (
    <li className={`disc-card k-${item.kind}`}>
      <div className="disc-top">
        <span className="disc-kind">
          <Icon name={KIND_ICON[item.kind]} size={13} /> {KIND_ONE[item.kind]}
        </span>
        {item.cost !== 'unknown' && (
          <span className={`disc-cost ${item.cost}`}>{item.cost === 'free' ? 'Free' : 'Paid'}</span>
        )}
      </div>
      <h3 className="disc-title">
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          {item.title}
        </a>
      </h3>
      {(item.by || item.format) && (
        <p className="disc-by">{[item.by, item.format].filter(Boolean).join(' · ')}</p>
      )}
      <p className="disc-why">{item.why}</p>
      <div className="disc-foot">
        <a className="disc-host" href={item.url} target="_blank" rel="noopener noreferrer">
          <Icon name="external" size={13} /> {item.host}
        </a>
        <button
          className={`btn btn-sm ${item.saved ? 'btn-quiet on' : 'btn-ghost'} disc-save`}
          aria-pressed={item.saved}
          onClick={() => onSave(!item.saved)}
        >
          <Icon name="heart" size={14} /> {item.saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </li>
  );
}
