/**
 * Enhance the library with AI (admin). Three kinds of help, every one a
 * suggestion to approve or decline - nothing changes until an admin says so:
 *
 * - Fixes: the AI reads the library in batches and proposes corrections
 *   (types, titles, creators, series, part names, order). Anything the admin
 *   already corrected by hand is left alone.
 * - About: researched on the web - what a recording is, who it suits, its
 *   level, and the pages it came from.
 * - Creator pictures: a portrait, logo or cover for each creator, found on the
 *   web, fetched safely, and shown wherever the creator appears.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type {
  AdminCreatorDto,
  EnhanceRunDto,
  EnhanceStatusDto,
  LibraryDto,
  MeditationSummaryDto,
  SuggestionDto,
  SuggestionField,
} from '@zenport/shared';
import { api } from '../api.ts';
import { clearApiCache, useApi } from '../hooks.ts';
import { Cover, EmptyState, ErrorNote, Icon } from '../components/ui.tsx';
import { CreatorFace } from '../components/Shelves.tsx';
import { CreatorEditSheet } from '../components/CreatorsAdmin.tsx';
import { LEVEL_LABEL, TYPE_META } from '../content.ts';
import { AdminOnly } from './AdminPage.tsx';

type Tab = 'fixes' | 'about' | 'pictures';

const FIELD_LABEL: Record<SuggestionField, string> = {
  type: 'Type',
  title: 'Title',
  creator: 'Creator',
  series: 'Series',
  'part-names': 'Part names',
  order: 'Order of parts',
  about: 'About',
  image: 'Picture',
};

const ABOUT_MAX = 6;
const PICTURES_MAX = 4;
const BATCH_KEY = 'zp-enhance-fix-batch';

const host = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const readBatch = (): number => {
  try {
    return Number(localStorage.getItem(BATCH_KEY) ?? 0) || 0;
  } catch {
    return 0;
  }
};
const writeBatch = (n: number) => {
  try {
    if (n > 0) localStorage.setItem(BATCH_KEY, String(n));
    else localStorage.removeItem(BATCH_KEY);
  } catch {
    /* a convenience only */
  }
};

export function EnhancePage() {
  return (
    <AdminOnly>
      <Enhance />
    </AdminOnly>
  );
}

function Enhance() {
  const status = useApi<EnhanceStatusDto>('/api/ai/library/status');
  const sugg = useApi<SuggestionDto[]>('/api/ai/library/suggestions');
  const lib = useApi<LibraryDto>('/api/library');
  const people = useApi<AdminCreatorDto[]>('/api/admin/creators');
  const [params, setParams] = useSearchParams();
  const tab = (['fixes', 'about', 'pictures'] as Tab[]).includes(params.get('tab') as Tab)
    ? (params.get('tab') as Tab)
    : 'fixes';
  const [gone, setGone] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const all = useMemo(() => (sugg.data ?? []).filter((x) => !gone.has(x.id)), [sugg.data, gone]);
  const byKind = {
    fixes: all.filter((x) => x.kind === 'fix'),
    about: all.filter((x) => x.kind === 'about'),
    pictures: all.filter((x) => x.kind === 'creator-image'),
  };

  const refresh = () => {
    clearApiCache();
    sugg.reload();
    status.reload();
    lib.reload();
    people.reload();
  };

  /** Apply or dismiss: gone from the list at once, the server catches up. */
  const decide = async (ids: number[], how: 'apply' | 'dismiss') => {
    setError(null);
    setGone((g) => new Set([...g, ...ids]));
    try {
      if (how === 'apply' && ids.length > 1) {
        await api.post('/api/ai/library/suggestions/apply', { ids });
      } else {
        await Promise.all(ids.map((id) => api.post(`/api/ai/library/suggestions/${id}/${how}`)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not go through.');
      setGone((g) => new Set([...g].filter((id) => !ids.includes(id))));
    } finally {
      refresh();
    }
  };

  const s = status.data;
  const TABS: { key: Tab; label: string; icon: string; n: number }[] = [
    { key: 'fixes', label: 'Fixes', icon: 'pencil', n: byKind.fixes.length },
    { key: 'about', label: 'About', icon: 'book', n: byKind.about.length },
    { key: 'pictures', label: 'Creator pictures', icon: 'friends', n: byKind.pictures.length },
  ];

  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/ai">AI</Link>
        <span className="sep">/</span>
        <span aria-current="page">Enhance the library</span>
      </nav>
      <div className="page-head">
        <h1>Enhance the library</h1>
        <p className="lede">
          Your AI reads the library and suggests: corrections, what each recording is about, and a
          picture for each creator. Nothing changes until you approve it, and anything you corrected
          by hand stays as you left it.
        </p>
      </div>

      {s && !s.canUse && (
        <div className="enh-notice">
          <Icon name="sparkle" size={18} />
          <span className="grow">
            Connect an AI provider first - your own key, kept encrypted on this server.
          </span>
          <Link className="btn btn-primary btn-sm" to="/ai/setup?return=/ai/library">
            Set up AI
          </Link>
        </div>
      )}

      <div className="enh-tabs" role="tablist" aria-label="Kind of help">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`enh-tab${tab === t.key ? ' on' : ''}`}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
          >
            <Icon name={t.icon} size={16} />
            <span>
              {t.key === 'pictures' ? (
                <>
                  <span className="enh-tab-wide">Creator pictures</span>
                  <span className="enh-tab-short">Pictures</span>
                </>
              ) : (
                t.label
              )}
            </span>
            {t.n > 0 && <span className="enh-count">{t.n}</span>}
          </button>
        ))}
      </div>

      {error && <ErrorNote message={error} />}
      {status.error && <ErrorNote message={status.error} onRetry={status.reload} />}

      {tab === 'fixes' && (
        <FixesTab status={s} list={byKind.fixes} onDecide={decide} onFound={refresh} />
      )}
      {tab === 'about' && (
        <AboutTab
          status={s}
          list={byKind.about}
          items={lib.data?.items ?? []}
          onDecide={decide}
          onFound={refresh}
        />
      )}
      {tab === 'pictures' && (
        <PicturesTab
          status={s}
          list={byKind.pictures}
          creators={people.data ?? []}
          onDecide={decide}
          onFound={refresh}
          onChanged={refresh}
        />
      )}
    </>
  );
}

interface TabProps {
  status: EnhanceStatusDto | null;
  list: SuggestionDto[];
  onDecide: (ids: number[], how: 'apply' | 'dismiss') => Promise<void>;
  onFound: () => void;
}

/** How a run went: a bar while it goes, then what it found. */
function RunState({
  run,
  running,
  label,
}: {
  run: EnhanceRunDto | null;
  running: boolean;
  label: string;
}) {
  if (!run && !running) return null;
  const pct = run && run.batches > 0 ? Math.round((run.batch / run.batches) * 100) : 0;
  return (
    <div className="enh-run" role="status" aria-live="polite">
      {running && (
        <div className="enh-bar" aria-hidden="true">
          <span style={{ inlineSize: `${Math.max(pct, 6)}%` }} />
        </div>
      )}
      <p>
        {running
          ? run && run.batches > 1
            ? `${label} - part ${Math.min(run.batch + 1, run.batches)} of ${run.batches}${run.found ? ` · ${run.found} found so far` : ''}`
            : `${label}…`
          : run && run.found > 0
            ? `Done - ${run.found} new suggestion${run.found === 1 ? '' : 's'} below.`
            : 'Done - nothing new to suggest.'}
      </p>
      {!running && run && run.notes.length > 0 && (
        <details className="enh-notes">
          <summary>
            {run.notes.length} note{run.notes.length === 1 ? '' : 's'}
          </summary>
          <ul>
            {run.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function DecideButtons({
  s,
  onDecide,
  applyLabel = 'Apply',
}: {
  s: SuggestionDto;
  onDecide: TabProps['onDecide'];
  applyLabel?: string;
}) {
  return (
    <div className="sg-actions">
      <button className="btn btn-sm btn-quiet" onClick={() => void onDecide([s.id], 'dismiss')}>
        <Icon name="x" size={15} /> Dismiss
      </button>
      <button className="btn btn-sm btn-primary" onClick={() => void onDecide([s.id], 'apply')}>
        <Icon name="check" size={15} /> {applyLabel}
      </button>
    </div>
  );
}

function Confidence({ s }: { s: SuggestionDto }) {
  return (
    <span
      className={`sg-conf ${s.confidence}`}
      title={`The AI is ${s.confidence === 'high' ? 'sure' : 'fairly sure'}`}
    >
      {s.confidence === 'high' ? 'Sure' : 'Likely'}
    </span>
  );
}

function SuggestionHead({ s, children }: { s: SuggestionDto; children?: React.ReactNode }) {
  return (
    <div className="sg-head">
      <Cover coverId={s.coverId} title={s.targetTitle} className="sg-cover" />
      <div className="grow">
        <strong>{s.targetTitle}</strong>
        {s.targetSub && <span className="sub">{s.targetSub}</span>}
      </div>
      {children ?? <Confidence s={s} />}
    </div>
  );
}

// ── Fixes ─────────────────────────────────────────────────────────────────

function FixesTab({ status, list, onDecide, onFound }: TabProps) {
  const [run, setRun] = useState<EnhanceRunDto | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState(readBatch);
  const stop = useRef(false);
  const batches = status?.batches ?? 1;
  const canResume = resume > 0 && resume < batches;

  useEffect(() => () => void (stop.current = true), []);

  const go = async (from: number) => {
    stop.current = false;
    setError(null);
    setRunning(true);
    let found = 0;
    let notes: string[] = [];
    setRun({ batch: from - 1, batches, found: 0, notes: [] });
    try {
      for (let b = from; b <= batches; b++) {
        if (stop.current) break;
        const r = await api.post<EnhanceRunDto>('/api/ai/library/fixes', { batch: b });
        found += r.found;
        notes = [...notes, ...r.notes];
        setRun({ batch: b, batches: r.batches, found, notes });
        const next = b >= r.batches ? 0 : b;
        writeBatch(next);
        setResume(next);
        if (r.found > 0) onFound();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The AI could not answer.');
    } finally {
      setRunning(false);
      onFound();
    }
  };

  const sure = list.filter((x) => x.confidence === 'high');
  const groups = useMemo(() => {
    const m = new Map<string, SuggestionDto[]>();
    for (const x of list) m.set(x.target, [...(m.get(x.target) ?? []), x]);
    return [...m.values()];
  }, [list]);

  return (
    <section className="enh-panel" aria-label="Fixes">
      <div className="enh-card">
        <div className="enh-card-text">
          <h2>Look for fixes</h2>
          <p>
            The AI reads every recording - {status?.items ?? '…'} of them
            {batches > 1 ? `, in ${batches} parts` : ''} - and suggests corrections: a type that is
            off, a title that is still a file name, a creator or series spelled two ways, parts out
            of order.
          </p>
        </div>
        <div className="enh-card-actions">
          {running ? (
            <button className="btn btn-quiet" onClick={() => (stop.current = true)}>
              Stop after this part
            </button>
          ) : (
            <>
              {canResume && (
                <button
                  className="btn btn-primary"
                  disabled={!status?.canUse}
                  onClick={() => void go(resume + 1)}
                >
                  Continue from part {resume + 1}
                </button>
              )}
              <button
                className={`btn ${canResume ? 'btn-quiet' : 'btn-primary'}`}
                disabled={!status?.canUse}
                onClick={() => void go(1)}
              >
                <Icon name="sparkle" size={16} />
                {canResume ? 'Start over' : 'Look for fixes'}
              </button>
            </>
          )}
        </div>
        <RunState run={run} running={running} label="Reading the library" />
        {error && <p className="enh-err">{error}</p>}
      </div>

      {list.length > 0 ? (
        <>
          <div className="enh-list-head">
            <h2>
              {list.length} suggestion{list.length === 1 ? '' : 's'}
            </h2>
            {sure.length > 1 && (
              <button
                className="btn btn-sm btn-quiet"
                onClick={() =>
                  void onDecide(
                    sure.map((x) => x.id),
                    'apply',
                  )
                }
              >
                <Icon name="check-circle" size={15} /> Apply the {sure.length} sure ones
              </button>
            )}
          </div>
          <ul className="sg-list">
            {groups.map((g) => (
              <FixCard key={g[0]!.target} group={g} onDecide={onDecide} />
            ))}
          </ul>
        </>
      ) : (
        !running && (
          <EmptyState title="No open suggestions">
            {run ? 'The library looks right.' : 'Look for fixes to get suggestions here.'}
          </EmptyState>
        )
      )}
    </section>
  );
}

/** Everything suggested for one recording, in one card - each change decided on its own. */
function FixCard({ group, onDecide }: { group: SuggestionDto[]; onDecide: TabProps['onDecide'] }) {
  const head = group[0]!;
  return (
    <li className="sg">
      <SuggestionHead s={head}>
        <Link
          className="icon-btn"
          to={`/admin/library?show=all&item=${encodeURIComponent(head.target)}`}
          aria-label={`Edit ${head.targetTitle} yourself`}
          title="Edit it yourself"
        >
          <Icon name="pencil" size={16} />
        </Link>
      </SuggestionHead>
      {group.map((s) => (
        <FixChange key={s.id} s={s} onDecide={onDecide} />
      ))}
      {group.length > 1 && (
        <div className="sg-foot">
          <button
            className="btn btn-sm btn-quiet"
            onClick={() =>
              void onDecide(
                group.map((x) => x.id),
                'apply',
              )
            }
          >
            <Icon name="check-circle" size={15} /> Apply all {group.length}
          </button>
        </div>
      )}
    </li>
  );
}

function FixChange({ s, onDecide }: { s: SuggestionDto; onDecide: TabProps['onDecide'] }) {
  const show = (v: string) =>
    s.field === 'type' ? (TYPE_META[v as keyof typeof TYPE_META]?.label ?? v) : v;
  const changed = (s.parts ?? []).filter((p) => p.from !== p.to);
  const rows = s.field === 'order' ? (s.parts ?? []) : changed;
  const [more, setMore] = useState(false);
  const visible = more ? rows : rows.slice(0, 6);
  return (
    <div className="sg-change-block">
      <div className="sg-body">
        <div className="sg-field-row">
          <span className="sg-field">{FIELD_LABEL[s.field]}</span>
          <Confidence s={s} />
        </div>
        {s.parts ? (
          <ol className={`sg-parts${s.field === 'order' ? ' order' : ''}`}>
            {visible.map((p, i) => (
              <li key={i} className={p.from !== p.to ? 'moved' : undefined}>
                {s.field === 'order' ? (
                  <span className="sg-to">{p.to}</span>
                ) : (
                  <>
                    <del>{p.from}</del>
                    <Icon name="chevron-right" size={13} />
                    <ins>{p.to}</ins>
                  </>
                )}
              </li>
            ))}
            {rows.length > 6 && (
              <li className="sg-more">
                <button className="btn btn-sm btn-ghost" onClick={() => setMore(!more)}>
                  {more ? 'Show fewer' : `And ${rows.length - 6} more`}
                </button>
              </li>
            )}
          </ol>
        ) : (
          <p className="sg-change">
            <del>{s.from ? show(s.from) : 'Nothing'}</del>
            <Icon name="chevron-right" size={14} />
            <ins>{show(s.to)}</ins>
          </p>
        )}
        <p className="sg-why">{s.reason}</p>
      </div>
      <DecideButtons s={s} onDecide={onDecide} />
    </div>
  );
}

// ── About ─────────────────────────────────────────────────────────────────

function AboutTab({
  status,
  list,
  items,
  onDecide,
  onFound,
}: TabProps & { items: MeditationSummaryDto[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [limit, setLimit] = useState(40);
  const [run, setRun] = useState<EnhanceRunDto | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const has = useMemo(() => new Set(status?.aboutIds ?? []), [status]);
  const waiting = useMemo(() => new Set(list.map((x) => x.target)), [list]);
  const needle = q.trim().toLowerCase();
  const pool = items.filter(
    (i) =>
      !i.missing &&
      (!onlyMissing || (!has.has(i.id) && !waiting.has(i.id))) &&
      (!needle || `${i.title} ${i.creator} ${i.collection ?? ''}`.toLowerCase().includes(needle)),
  );
  const toggle = (id: string) =>
    setPicked((p) =>
      p.includes(id) ? p.filter((x) => x !== id) : p.length < ABOUT_MAX ? [...p, id] : p,
    );
  const noSearch = status?.canUse && !status.webSearch;

  const go = async () => {
    setError(null);
    setRunning(true);
    setRun(null);
    try {
      const r = await api.post<EnhanceRunDto>('/api/ai/library/about', { itemIds: picked });
      setRun(r);
      setPicked([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The AI could not answer.');
    } finally {
      setRunning(false);
      onFound();
    }
  };

  return (
    <section className="enh-panel" aria-label="About">
      {list.length > 0 && (
        <>
          <div className="enh-list-head">
            <h2>{list.length} to approve</h2>
          </div>
          <ul className="sg-list">
            {list.map((s) => (
              <li key={s.id} className="sg">
                <SuggestionHead s={s} />
                {s.about && (
                  <div className="sg-body">
                    {s.about.level && (
                      <span className="level-chip">{LEVEL_LABEL[s.about.level]}</span>
                    )}
                    <p className="sg-about">{s.about.description}</p>
                    <ul className="sg-sources">
                      {s.about.sources.map((src) => (
                        <li key={src.url}>
                          <a href={src.url} target="_blank" rel="noopener noreferrer">
                            <Icon name="external" size={13} /> {src.title}
                            <span className="sub"> · {host(src.url)}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                    {s.from && <p className="sg-why">Replaces the description it has now.</p>}
                  </div>
                )}
                <div className="sg-foot">
                  <span />
                  <DecideButtons s={s} onDecide={onDecide} applyLabel="Use it" />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="enh-card">
        <div className="enh-card-text">
          <h2>Research recordings</h2>
          <p>
            Choose up to {ABOUT_MAX} and the AI looks each one up on the web: what it is, who it
            suits, its level - with the pages it used, so you can check. Where it cannot find the
            very recording, it says so rather than guess.
          </p>
        </div>
        {noSearch && (
          <p className="enh-err">
            This needs a provider that can search the web - OpenAI, Anthropic, Gemini or OpenRouter.
          </p>
        )}
        <div className="enh-pick-tools">
          <label className="folder-search">
            <Icon name="search" size={16} />
            <input
              type="search"
              placeholder="Search the library"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setLimit(40);
              }}
              aria-label="Search the library"
            />
          </label>
          <div className="view-toggle labelled" role="group" aria-label="Which recordings">
            <button type="button" aria-pressed={onlyMissing} onClick={() => setOnlyMissing(true)}>
              Without one
            </button>
            <button type="button" aria-pressed={!onlyMissing} onClick={() => setOnlyMissing(false)}>
              All
            </button>
          </div>
        </div>
        <div className="enh-card-actions">
          {picked.length === 0 && pool.length > 0 && (
            <button
              className="btn btn-quiet"
              onClick={() => setPicked(pool.slice(0, ABOUT_MAX).map((i) => i.id))}
            >
              Choose the first {Math.min(ABOUT_MAX, pool.length)}
            </button>
          )}
          {picked.length > 0 && (
            <button className="btn btn-quiet" onClick={() => setPicked([])}>
              Clear
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={picked.length === 0 || running || !status?.canUse || noSearch}
            onClick={() => void go()}
          >
            <Icon name="sparkle" size={16} />
            {running
              ? 'Researching…'
              : picked.length > 0
                ? `Research ${picked.length}`
                : 'Research'}
          </button>
        </div>
        <RunState run={run} running={running} label="Looking them up on the web" />
        {error && <p className="enh-err">{error}</p>}
        {pool.length === 0 ? (
          <p className="enh-empty">
            {onlyMissing && !needle ? 'Every recording has a description.' : 'Nothing matches.'}
          </p>
        ) : (
          <ul className="enh-picks">
            {pool.slice(0, limit).map((i) => {
              const on = picked.includes(i.id);
              return (
                <li key={i.id}>
                  <button
                    className={`enh-pick${on ? ' on' : ''}`}
                    role="checkbox"
                    aria-checked={on}
                    disabled={!on && picked.length >= ABOUT_MAX}
                    onClick={() => toggle(i.id)}
                  >
                    <span className="enh-check" aria-hidden="true">
                      {on && <Icon name="check" size={13} />}
                    </span>
                    <Cover coverId={i.coverId} title={i.title} className="enh-pick-cover" />
                    <span className="grow">
                      <strong>{i.title}</strong>
                      <span className="sub">
                        {[i.creator, i.collection].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {has.has(i.id) && <span className="enh-has">Has one</span>}
                    {waiting.has(i.id) && <span className="enh-has">Waiting</span>}
                  </button>
                </li>
              );
            })}
            {pool.length > limit && (
              <li>
                <button
                  className="btn btn-sm btn-ghost enh-show-more"
                  onClick={() => setLimit(limit + 40)}
                >
                  Show more ({pool.length - limit})
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}

// ── Creator pictures ──────────────────────────────────────────────────────

function PicturesTab({
  status,
  list,
  creators,
  onDecide,
  onFound,
  onChanged,
}: TabProps & { creators: AdminCreatorDto[]; onChanged: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [run, setRun] = useState<EnhanceRunDto | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manage, setManage] = useState<string | null>(null);
  const waiting = useMemo(() => new Set(list.map((x) => x.target)), [list]);
  const byName = useMemo(() => new Map(creators.map((c) => [c.name, c])), [creators]);
  const missing = creators.filter((c) => !c.imageUrl && !waiting.has(c.name));
  const noSearch = status?.canUse && !status.webSearch;
  const toggle = (name: string) =>
    setPicked((p) =>
      p.includes(name) ? p.filter((x) => x !== name) : p.length < PICTURES_MAX ? [...p, name] : p,
    );

  const go = async () => {
    setError(null);
    setRunning(true);
    setRun(null);
    try {
      const r = await api.post<EnhanceRunDto>('/api/ai/library/creator-images', { names: picked });
      setRun(r);
      setPicked([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The AI could not answer.');
    } finally {
      setRunning(false);
      onFound();
    }
  };

  return (
    <section className="enh-panel" aria-label="Creator pictures">
      {list.length > 0 && (
        <>
          <div className="enh-list-head">
            <h2>{list.length} to approve</h2>
          </div>
          <ul className="pic-list">
            {list.map((s) => {
              const c = byName.get(s.target);
              return (
                <li key={s.id} className="pic-sg">
                  <div className="pic-compare">
                    {c ? (
                      <CreatorFace creator={c} />
                    ) : (
                      <span className="creator-ring md" aria-hidden="true" />
                    )}
                    <Icon name="chevron-right" size={18} />
                    <span className="creator-ring md new">
                      <span className="creator-face">
                        <img src={s.imageUrl} alt={`Suggested picture for ${s.target}`} />
                      </span>
                    </span>
                  </div>
                  <strong className="pic-name">{s.target}</strong>
                  <span className="sub">
                    {s.reason}
                    {s.sourceUrl && (
                      <>
                        {' '}
                        <a href={s.sourceUrl} target="_blank" rel="noopener noreferrer">
                          From {host(s.sourceUrl)}
                        </a>
                      </>
                    )}
                  </span>
                  <DecideButtons s={s} onDecide={onDecide} applyLabel="Use it" />
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="enh-card">
        <div className="enh-card-text">
          <h2>Find pictures</h2>
          <p>
            Choose up to {PICTURES_MAX} creators and the AI finds each a portrait - or, for an
            organisation, its logo or a cover. The picture is fetched and stored here, so it shows
            everywhere the creator does. Tap ⋯ on a creator to upload one, paste a link, rename or
            merge.
          </p>
        </div>
        {noSearch && (
          <p className="enh-err">
            Finding pictures needs a provider that can search the web - OpenAI, Anthropic, Gemini or
            OpenRouter. You can still set one yourself.
          </p>
        )}
        <div className="enh-card-actions">
          {picked.length === 0 && missing.length > 0 && (
            <button
              className="btn btn-quiet"
              onClick={() => setPicked(missing.slice(0, PICTURES_MAX).map((c) => c.name))}
            >
              Choose {Math.min(PICTURES_MAX, missing.length)} without one
            </button>
          )}
          {picked.length > 0 && (
            <button className="btn btn-quiet" onClick={() => setPicked([])}>
              Clear
            </button>
          )}
          <button
            className="btn btn-primary"
            disabled={picked.length === 0 || running || !status?.canUse || noSearch}
            onClick={() => void go()}
          >
            <Icon name="sparkle" size={16} />
            {running
              ? 'Looking…'
              : picked.length > 0
                ? `Find ${picked.length === 1 ? 'a picture' : `${picked.length} pictures`}`
                : 'Find pictures'}
          </button>
        </div>
        <RunState run={run} running={running} label="Looking for pictures on the web" />
        {error && <p className="enh-err">{error}</p>}
        {creators.length === 0 ? (
          <p className="enh-empty">No creators yet.</p>
        ) : (
          <ul className="pic-grid">
            {creators.map((c) => {
              const on = picked.includes(c.name);
              return (
                <li key={c.name} className={`pic-tile${on ? ' on' : ''}`}>
                  <button
                    className="pic-pick"
                    role="checkbox"
                    aria-checked={on}
                    disabled={!on && picked.length >= PICTURES_MAX}
                    onClick={() => toggle(c.name)}
                  >
                    <CreatorFace creator={c} size="sm" />
                    <span className="pic-name">{c.name}</span>
                    <span className="sub">
                      {waiting.has(c.name)
                        ? 'Waiting for you'
                        : c.imageUrl
                          ? 'Has a picture'
                          : 'No picture'}
                    </span>
                    {on && (
                      <span className="enh-check on" aria-hidden="true">
                        <Icon name="check" size={13} />
                      </span>
                    )}
                  </button>
                  <button
                    className="icon-btn pic-more"
                    aria-label={`Picture for ${c.name}`}
                    onClick={() => setManage(c.name)}
                  >
                    <Icon name="more" size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {manage && creators.some((c) => c.name === manage) && (
        <CreatorEditSheet
          creator={creators.find((c) => c.name === manage)!}
          others={creators.filter((c) => c.name !== manage)}
          onClose={() => setManage(null)}
          onChanged={(name) => {
            setManage(name);
            onChanged();
          }}
        />
      )}
    </section>
  );
}
