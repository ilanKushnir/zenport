/**
 * Onboarding for the person setting ZenPort up: choose the libraries, watch
 * them being read (and connect an AI meanwhile), then choose how the AI
 * should enhance them - all of it running on the server, so it carries on
 * while the rest of the welcome goes by.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AiSettingsDto,
  EnhanceJobDto,
  EnhanceStepKey,
  LibrariesDto,
  LibraryBrowseDto,
  LibraryCountsDto,
  LibraryDto,
  ScanStateDto,
} from '@zenport/shared';
import { api } from '../api.ts';
import { clearApiCache, useApi } from '../hooks.ts';
import { ProviderConnect, providerInfo } from '../components/AiConnect.tsx';
import { CreatorFace } from '../components/Shelves.tsx';
import { Icon, Switch } from '../components/ui.tsx';
import { TYPE_META } from '../content.ts';

const n = (x: number) => x.toLocaleString();

/** A number that counts its way to where it is going, rather than jumping. */
function Count({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    const t0 = performance.now();
    const dur = Math.min(1400, 500 + Math.abs(value - start) * 4);
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const eased = 1 - (1 - k) ** 3;
      const v = Math.round(start + (value - start) * eased);
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n(shown)}</>;
}

/** Titles as they are recognised, one after another, for a few seconds. */
function Ticker({ titles }: { titles: string[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (titles.length === 0) return;
    setI(0);
    const t = window.setInterval(() => setI((x) => (x + 1 < titles.length ? x + 1 : x)), 140);
    return () => window.clearInterval(t);
  }, [titles]);
  if (titles.length === 0) return null;
  return (
    <p className="scan-ticker" aria-hidden="true">
      <Icon name="sparkle" size={13} /> Recognised <span key={i}>{titles[i]}</span>
    </p>
  );
}

// ── 1. Libraries ──────────────────────────────────────────────────────────

export function LibrariesStep() {
  return (
    <>
      <h1 id="ob-title">Where your recordings live</h1>
      <p className="ob-lede">
        Choose the folders ZenPort should read - each becomes a library. They are read in place and
        never changed.
      </p>
      <LibraryChooser />
      <p className="ob-note">
        Choosing starts reading at once. Add or change libraries any time under Admin.
      </p>
    </>
  );
}

/** Browse the mounted folder, tick folders to make them libraries, name them. */
export function LibraryChooser() {
  const libs = useApi<LibrariesDto>('/api/admin/libraries');
  const [rel, setRel] = useState('');
  const [view, setView] = useState<LibraryBrowseDto | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  // What is chosen, as this page knows it: changed at once on a tap, then
  // confirmed by the server (or put back if it refuses).
  const [chosen, setChosen] = useState<{ rel: string; label: string }[] | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const cache = useRef(new Map<string, LibraryBrowseDto>());
  const l = libs.data;
  const list = chosen ?? l?.chosen ?? [];

  useEffect(() => {
    if (l && chosen === null) setChosen(l.chosen);
  }, [l, chosen]);

  // Open a folder: at once from the cache, else a loading state, then counts.
  useEffect(() => {
    if (!l?.base) return;
    let alive = true;
    const hit = cache.current.get(rel);
    if (hit) setView(hit);
    else setOpening(rel);
    api
      .get<LibraryBrowseDto>(`/api/admin/libraries/browse?rel=${encodeURIComponent(rel)}`)
      .then((v) => {
        if (!alive) return;
        cache.current.set(rel, v);
        setView(v);
        setOpening(null);
        const known: Record<string, number> = {};
        for (const f of v.folders) if (f.media !== null) known[f.rel] = f.media;
        setCounts((c) => ({ ...c, ...known }));
        if (v.folders.some((f) => f.media === null)) {
          void api
            .get<LibraryCountsDto>(`/api/admin/libraries/counts?rel=${encodeURIComponent(rel)}`)
            .then((r) => alive && setCounts((c) => ({ ...c, ...r.counts })))
            .catch(() => {});
        }
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setOpening(null);
        setError(err instanceof Error ? err.message : 'Could not read it.');
      });
    return () => {
      alive = false;
    };
  }, [l?.base, rel]);

  const isChosen = (r: string) => list.some((c) => c.rel === r);
  const insideOf = (r: string) => list.find((c) => r.startsWith(`${c.rel}/`));
  const partly = (r: string) => list.some((c) => c.rel.startsWith(`${r}/`));

  const toggle = async (r: string, folderName: string) => {
    const before = list;
    const on = isChosen(r);
    // As the server does it: a folder and one inside it are never both chosen.
    const next = on
      ? before.filter((c) => c.rel !== r)
      : [
          ...before.filter((c) => !c.rel.startsWith(`${r}/`) && !r.startsWith(`${c.rel}/`)),
          { rel: r, label: folderName.charAt(0).toUpperCase() + folderName.slice(1) },
        ];
    setChosen(next);
    setError(null);
    setPending((p) => new Set(p).add(r));
    try {
      const res = on
        ? await api.del<LibrariesDto>(`/api/admin/libraries?rel=${encodeURIComponent(r)}`)
        : await api.post<LibrariesDto>('/api/admin/libraries', { rel: r });
      setChosen(res.chosen);
      clearApiCache();
    } catch (err) {
      setChosen(before);
      setError(err instanceof Error ? err.message : 'That did not go through.');
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(r);
        return n;
      });
    }
  };
  const rename = async (r: string) => {
    const label = name.trim();
    setNaming(null);
    if (!label) return;
    setChosen((cur) => (cur ?? []).map((c) => (c.rel === r ? { ...c, label } : c)));
    await api.patch('/api/admin/libraries', { rel: r, label }).catch(() => {});
  };

  const crumbs = rel ? rel.split('/') : [];
  const loading = opening !== null && !cache.current.has(rel);
  return (
    <div className="lib-chooser">
      {!l && (
        <ul className="lib-folders" aria-busy="true" aria-label="Looking for folders">
          {[0, 1].map((i) => (
            <li key={i} className="lib-ghost">
              <span className="shimmer" />
              <span className="shimmer short" />
            </li>
          ))}
        </ul>
      )}
      {l && !l.base && l.fixed.length === 0 && (
        <p className="ob-note">
          No folder is mounted yet. Mount your recordings at <code>/library</code> and set{' '}
          <code>ZP_LIBRARY_BASE=/library</code>, then come back here.
        </p>
      )}

      {l?.base && (
        <div className="lib-browser">
          <div className="lib-crumbs">
            <button type="button" className="linkish" onClick={() => setRel('')} disabled={!rel}>
              <Icon name="folder" size={14} /> All folders
            </button>
            {crumbs.map((c, i) => (
              <span key={i}>
                <span className="sep">/</span>
                <button
                  type="button"
                  className="linkish"
                  onClick={() => setRel(crumbs.slice(0, i + 1).join('/'))}
                  disabled={i === crumbs.length - 1}
                >
                  {c}
                </button>
              </span>
            ))}
            {loading && <span className="lib-opening">Opening…</span>}
          </div>
          {loading ? (
            <ul className="lib-folders" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="lib-ghost">
                  <span className="shimmer" />
                  <span className="shimmer short" />
                </li>
              ))}
            </ul>
          ) : view && view.folders.length === 0 ? (
            <p className="ob-note">No folders in here.</p>
          ) : (
            <ul className="lib-folders">
              {view?.folders.map((f) => {
                const on = isChosen(f.rel);
                const inside = insideOf(f.rel);
                const count = counts[f.rel];
                return (
                  <li key={f.rel} className={on ? 'on' : inside ? 'covered' : ''}>
                    <button
                      type="button"
                      className="lib-pick"
                      role="checkbox"
                      aria-checked={on || !!inside}
                      disabled={!!inside}
                      onClick={() => void toggle(f.rel, f.name)}
                    >
                      <span className="lib-check" aria-hidden="true">
                        {on || inside ? <Icon name="check" size={14} /> : null}
                      </span>
                      <span className="grow">
                        <strong>{f.name}</strong>
                        <span className="sub">
                          {inside
                            ? `Read as part of ${inside.label}`
                            : count === undefined
                              ? 'Counting…'
                              : count > 0
                                ? `${n(count)} recording files`
                                : 'No recordings found'}
                          {!on && !inside && partly(f.rel) ? ' · part of it chosen' : ''}
                          {pending.has(f.rel) ? ' · saving…' : ''}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Look inside ${f.name}`}
                      title="Choose folders inside it instead"
                      onClick={() => setRel(f.rel)}
                    >
                      <Icon name="chevron-right" size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {l && (list.length > 0 || l.fixed.length > 0) && (
        <div className="lib-chosen">
          <span className="guide-label">Your libraries</span>
          <ul>
            {l.fixed.map((f) => (
              <li key={f.path}>
                <Icon name="library" size={15} />
                <span className="grow">
                  <strong>{f.label}</strong>
                  <span className="sub">Set by the server</span>
                </span>
              </li>
            ))}
            {list.map((c) => (
              <li key={c.rel}>
                <Icon name="library" size={15} />
                {naming === c.rel ? (
                  <form
                    className="grow lib-name"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void rename(c.rel);
                    }}
                  >
                    <input
                      autoFocus
                      value={name}
                      maxLength={80}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => void rename(c.rel)}
                      aria-label="Library name"
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    className="grow lib-name-btn"
                    title="Rename"
                    onClick={() => {
                      setNaming(c.rel);
                      setName(c.label);
                    }}
                  >
                    <strong>{c.label}</strong>
                    <span className="sub">
                      {c.rel.toLowerCase() !== c.label.toLowerCase() ? `${c.rel} · ` : ''}
                      <Icon name="pencil" size={11} /> rename
                    </span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="enh-err">{error}</p>}
    </div>
  );
}

// ── 2. Reading it (and AI meanwhile) ──────────────────────────────────────

const PHASE: Record<string, string> = {
  reading: 'Reading the folders',
  understanding: 'Understanding what is what',
  artwork: 'Finding the artwork',
  saving: 'Putting it on the shelves',
  lengths: 'Measuring how long each one is',
};

export function ScanStep() {
  const scan = useApi<ScanStateDto>('/api/library/scan-state');
  const ai = useApi<AiSettingsDto>('/api/ai/settings');
  const [lib, setLib] = useState<LibraryDto | null>(null);
  const [connected, setConnected] = useState(false);
  const s = scan.data;
  const running = s?.status === 'scanning';
  const wasRunning = useRef(false);

  const libs = useApi<LibrariesDto>('/api/admin/libraries');
  const chosenCount = (libs.data?.chosen.length ?? 0) + (libs.data?.fixed.length ?? 0);
  // Keep looking while this step is open: a library just chosen is read a
  // moment later, and the step should see it start rather than say "nothing".
  const [sawScan, setSawScan] = useState(false);
  const [openedAt] = useState(() => Date.now() - 2000);
  useEffect(() => {
    if (running) setSawScan(true);
  }, [running]);
  useEffect(() => {
    const t = window.setInterval(() => scan.reload(), running ? 700 : 1200);
    return () => window.clearInterval(t);
  }, [running, scan]);
  useEffect(() => {
    if (running) wasRunning.current = true;
    if (!running && s && s.counts.items > 0) {
      clearApiCache();
      void api
        .get<LibraryDto>('/api/library')
        .then(setLib)
        .catch(() => {});
    }
  }, [running, s]);

  const p = s?.progress;
  const items = running ? (p?.items ?? 0) : (s?.counts.items ?? 0);
  const files = running ? (p?.files ?? 0) : (s?.counts.tracks ?? 0);
  const pct = p && p.total > 0 ? p.done / p.total : null;
  const libCreators = lib?.creators ?? [];
  // Libraries chosen but not read yet (the scan starts a moment after a change).
  // A scan that finished since the step opened counts too (a small library can
  // be read between two looks).
  const finishedSince = !!s?.finishedAt && Date.parse(s.finishedAt) >= openedAt;
  const starting =
    !running && chosenCount > 0 && (s?.counts.items ?? 0) === 0 && !sawScan && !finishedSince;
  const done = !running && !starting && (s?.counts.items ?? 0) > 0;
  const aiOk = connected || !!ai.data?.canUse;
  // Faces as they are recognised: names while reading, their pictures once read.
  const faces = done
    ? libCreators.map((c) => c)
    : (p?.creators ?? []).map((name) => ({
        name,
        itemCount: 0,
        totalDurationSec: null,
        coverIds: [],
      }));
  const titles = useMemo(
    () =>
      running
        ? (p?.latest ?? [])
        : done
          ? (lib?.items ?? [])
              .filter((i) => !i.missing)
              .slice(0, 24)
              .map((i) =>
                i.collection ? `${i.collection.split(' / ').pop()} · ${i.title}` : i.title,
              )
          : [],
    [running, done, p?.latest?.[0], lib],
  );
  const kinds = done
    ? (['meditation', 'course', 'talk', 'soundscape'] as const)
        .map((t) => ({
          t,
          count: (lib?.items ?? []).filter((i) => !i.missing && i.type === t).length,
        }))
        .filter((k) => k.count > 0)
    : [];
  const programmes = (lib?.items ?? []).filter(
    (i) => !i.missing && i.structure === 'programme',
  ).length;

  return (
    <>
      <h1 id="ob-title">
        {done
          ? 'Your library is ready'
          : starting
            ? 'Getting ready to read…'
            : 'Reading your library'}
      </h1>
      <div className="scan-stage">
        <div
          className={`scan-orb${running || starting ? ' live' : ''}${done ? ' done' : ''}${(running && pct === null) || starting ? ' sweeping' : ''}`}
          aria-hidden="true"
        >
          <svg viewBox="0 0 120 120">
            <defs>
              <linearGradient id="scan-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" style={{ stopColor: 'var(--accent)' }} />
                <stop offset="0.55" style={{ stopColor: 'var(--lavender)' }} />
                <stop offset="1" style={{ stopColor: '#ffc04a' }} />
              </linearGradient>
            </defs>
            <circle className="scan-track" cx="60" cy="60" r="54" />
            <circle
              className="scan-fill"
              cx="60"
              cy="60"
              r="54"
              stroke="url(#scan-grad)"
              style={{
                strokeDashoffset: done
                  ? 0
                  : running && pct !== null
                    ? 339 * (1 - pct)
                    : running || starting
                      ? 250
                      : 339,
              }}
            />
          </svg>
          <span className="scan-disc">
            <span className="scan-orb-n">
              <Count value={items} />
            </span>
            <span className="scan-orb-l">{items === 1 ? 'recording' : 'recordings'}</span>
          </span>
          {done && (
            <span className="scan-badge">
              <Icon name="check" size={14} />
            </span>
          )}
        </div>
        <div className="scan-facts" role="status" aria-live="polite">
          {running ? (
            <>
              <strong>{PHASE[p?.phase ?? 'reading']}</strong>
              <span>
                {p && p.roots > 1 ? `${p.root} · library ${p.rootIndex + 1} of ${p.roots} · ` : ''}
                <Count value={files} /> files · {faces.length} creators
                {p && p.total > 0 ? ` · ${p.done} of ${p.total}` : ''}
              </span>
            </>
          ) : done ? (
            <>
              <strong>
                <Count value={s!.counts.tracks} /> tracks,{' '}
                <span className="nowrap">{libCreators.length} creators</span>
              </strong>
              <span>
                <Count value={s!.counts.covers} /> covers · <Count value={s!.counts.documents} />{' '}
                notes and guides
              </span>
            </>
          ) : starting ? (
            <>
              <strong>Opening your libraries</strong>
              <span>
                {chosenCount} {chosenCount === 1 ? 'library' : 'libraries'} chosen - reading starts
                in a moment.
              </span>
            </>
          ) : (
            <>
              <strong>Nothing to read yet</strong>
              <span>Choose a library in the previous step.</span>
            </>
          )}
          <Ticker titles={titles} />
        </div>
      </div>

      {kinds.length > 0 && (
        <ul className="scan-kinds" aria-label="What was found">
          {kinds.map((k, i) => (
            <li key={k.t} style={{ animationDelay: `${300 + i * 120}ms` }}>
              <Icon name={TYPE_META[k.t].icon} size={14} />
              <Count value={k.count} />{' '}
              {k.count === 1
                ? TYPE_META[k.t].label.toLowerCase()
                : TYPE_META[k.t].plural.toLowerCase()}
            </li>
          ))}
          {programmes > 0 && (
            <li style={{ animationDelay: `${300 + kinds.length * 120}ms` }}>
              <Icon name="sprout" size={14} /> <Count value={programmes} /> programmes
            </li>
          )}
        </ul>
      )}

      {faces.length > 0 && (
        <ul className="scan-faces" aria-label="Creators recognised">
          {faces.slice(0, 12).map((c, i) => (
            <li key={c.name} style={{ animationDelay: `${(done ? 500 : 0) + i * 110}ms` }}>
              <CreatorFace creator={c} size="sm" />
              <span>{c.name}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="ai-card scan-ai">
        <div className="ai-card-head">
          <span className="ai-mark p-none">
            <Icon name="sparkle" size={18} />
          </span>
          <div className="grow">
            <h2>{aiOk ? 'Your AI is connected' : 'Meanwhile, connect your AI'}</h2>
            <p className="sub">
              {aiOk && ai.data?.provider
                ? `${providerInfo(ai.data.provider).label} · ${ai.data.model}`
                : 'Optional - it tidies the library next, plans and guides later. Your key stays encrypted here.'}
            </p>
          </div>
        </div>
        {!aiOk && (
          <ProviderConnect
            compact
            settings={ai.data ?? null}
            onConnected={() => {
              setConnected(true);
              ai.reload();
            }}
          />
        )}
      </div>
    </>
  );
}

// ── 3. Enhancing it ───────────────────────────────────────────────────────

const STEPS: {
  key: EnhanceStepKey;
  icon: string;
  title: string;
  what: string;
  search?: boolean;
}[] = [
  {
    key: 'levels',
    icon: 'gauge',
    title: 'Levels and programmes',
    what: 'Who each recording suits, and which are step-by-step programmes - so each creator reads in order.',
  },
  {
    key: 'pictures',
    icon: 'friends',
    title: 'Creator pictures',
    what: 'A portrait or a logo for each creator, found on the web.',
    search: true,
  },
  {
    key: 'about',
    icon: 'book',
    title: 'Descriptions',
    what: 'What a recording is and who it suits, researched on the web, with sources.',
    search: true,
  },
  {
    key: 'fixes',
    icon: 'pencil',
    title: 'Suggested fixes',
    what: 'Titles still file names, parts out of order - suggestions you approve later.',
  },
];

const fmt = (sec: number) =>
  sec < 90 ? `${Math.max(1, Math.round(sec / 10) * 10)} s` : `${Math.round(sec / 60)} min`;

export function EnhanceStep({ onBack }: { onBack: () => void }) {
  const ai = useApi<AiSettingsDto>('/api/ai/settings');
  const lib = useApi<LibraryDto>('/api/library');
  const scan = useApi<ScanStateDto>('/api/library/scan-state');
  const [job, setJob] = useState<EnhanceJobDto | null>(null);
  const [picked, setPicked] = useState<EnhanceStepKey[]>(['levels', 'pictures', 'about', 'fixes']);
  const [apply, setApply] = useState(true);
  const [aboutLimit, setAboutLimit] = useState(24);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    void api
      .get<EnhanceJobDto | null>('/api/ai/library/job')
      .then((j) => j && setJob(j))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!job?.running) return;
    const t = window.setInterval(() => {
      void api
        .get<EnhanceJobDto | null>('/api/ai/library/job')
        .then((j) => j && setJob(j))
        .catch(() => {});
    }, 1200);
    return () => window.clearInterval(t);
  }, [job?.running]);

  const items = (lib.data?.items ?? []).filter((i) => !i.missing).length;
  const creators = (lib.data?.creators ?? []).filter((c) => !c.imageUrl).length;
  const canUse = !!ai.data?.canUse;
  const webSearch = ai.data?.provider ? ai.data.provider !== 'compatible' : !!ai.data?.sharedBy;
  const scanning = scan.data?.status === 'scanning';
  const estimate: Record<EnhanceStepKey, number> = {
    // Measured on a real library: seconds per call, with a little room.
    levels: Math.ceil(Math.max(1, items) / 40) * 25,
    pictures: Math.ceil(Math.max(1, creators) / 4) * 60,
    about: Math.ceil(aboutLimit / 6) * 120,
    fixes: Math.ceil(Math.max(1, items) / 25) * 45,
  };
  const total = picked.reduce((t, k) => t + estimate[k], 0);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const steps = picked.filter((k) => webSearch || !STEPS.find((x) => x.key === k)?.search);
      setJob(await api.post<EnhanceJobDto>('/api/ai/library/job', { steps, apply, aboutLimit }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It could not start.');
    } finally {
      setStarting(false);
    }
  };

  if (!canUse) {
    return (
      <>
        <h1 id="ob-title">Let your AI tidy it</h1>
        <p className="ob-lede">
          With an AI connected, ZenPort can set levels, find creator pictures, write descriptions
          and suggest fixes - all in one go.
        </p>
        <p className="ob-note">
          <button type="button" className="linkish" onClick={onBack}>
            Connect one in the previous step
          </button>{' '}
          - or carry on, and do it later under AI → Enhance the library.
        </p>
      </>
    );
  }

  if (job) {
    const images = job.steps.find((s) => s.key === 'pictures')?.images ?? [];
    return (
      <>
        <h1 id="ob-title">{job.running ? 'Your AI is at work' : 'Your library is enhanced'}</h1>
        <p className="ob-lede">
          {job.waitingForScan
            ? 'It starts as soon as the library has been read.'
            : job.running
              ? 'It keeps going while you finish - carry on whenever you like.'
              : 'All done. Everything it found is in the library now.'}
        </p>
        <ul className="enh-job">
          {job.steps.map((s) => {
            const meta = STEPS.find((x) => x.key === s.key)!;
            return (
              <li key={s.key} className={`st-${s.state}`}>
                <span className="enh-job-ic" aria-hidden="true">
                  {s.state === 'done' ? (
                    <Icon name="check" size={16} />
                  ) : s.state === 'failed' ? (
                    <Icon name="x" size={16} />
                  ) : (
                    <Icon name={meta.icon} size={16} />
                  )}
                </span>
                <span className="grow">
                  <strong>{meta.title}</strong>
                  <span className="sub">
                    {s.state === 'waiting'
                      ? 'Waiting'
                      : s.state === 'failed'
                        ? (s.note ?? 'It stopped.')
                        : s.state === 'done'
                          ? doneLine(s.key, s.found, s.note)
                          : `${s.done} of ${s.total || '…'}${s.found ? ` · ${s.found} so far` : ''}`}
                  </span>
                  {s.state === 'running' && (
                    <span className="enh-job-bar" aria-hidden="true">
                      <span
                        style={{
                          inlineSize: `${s.total ? Math.max(6, (s.done / s.total) * 100) : 6}%`,
                        }}
                      />
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {job.running && job.findings.length === 0 && (
          <div className="enh-feed thinking" aria-hidden="true">
            <span className="guide-label">
              <Icon name="sparkle" size={13} />{' '}
              {job.waitingForScan
                ? 'Waiting for the library to be read…'
                : 'Reading your library, a batch at a time…'}
            </span>
            <ul>
              {[0, 1, 2].map((i) => (
                <li key={i} style={{ animationDelay: `${i * 160}ms` }}>
                  <span className="enh-feed-ic" />
                  <span className="grow">
                    <span className="shimmer" style={{ inlineSize: `${60 - i * 12}%` }} />
                    <span className="shimmer short" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {job.findings.length > 0 && (
          <div className="enh-feed" aria-live="polite">
            <span className="guide-label">
              <Icon name="sparkle" size={13} /> What your AI just decided
            </span>
            <ul>
              {job.findings.slice(0, 6).map((f) => (
                <li key={`${f.at}-${f.title}`}>
                  <span className="enh-feed-ic" aria-hidden="true">
                    <Icon name={STEPS.find((x) => x.key === f.step)?.icon ?? 'sparkle'} size={14} />
                  </span>
                  <span className="grow">
                    <strong>{f.title}</strong>
                    <span className="sub">{f.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {images.length > 0 && (
          <ul className="scan-faces" aria-label="Pictures found">
            {images.map((im, i) => (
              <li key={im.name} style={{ animationDelay: `${i * 80}ms` }}>
                <span className="creator-ring sm">
                  <span className="creator-face">
                    <img src={im.url} alt="" />
                  </span>
                </span>
                <span>{im.name}</span>
              </li>
            ))}
          </ul>
        )}
        {job.error && <p className="enh-err">{job.error}</p>}
      </>
    );
  }

  return (
    <>
      <h1 id="ob-title">Let your AI tidy it</h1>
      <p className="ob-lede">
        Tick what you would like. It runs on your server, with your key, while you finish here.
      </p>
      <ul className="enh-pickers">
        {STEPS.map((s) => {
          const on = picked.includes(s.key);
          const blocked = !!s.search && !webSearch;
          return (
            <li key={s.key}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on && !blocked}
                disabled={blocked}
                className={`enh-picker${on && !blocked ? ' on' : ''}`}
                onClick={() =>
                  setPicked((p) =>
                    p.includes(s.key) ? p.filter((k) => k !== s.key) : [...p, s.key],
                  )
                }
              >
                <span className="enh-picker-ic" aria-hidden="true">
                  <Icon name={s.icon} size={18} />
                </span>
                <span className="grow">
                  <strong>{s.title}</strong>
                  <span className="sub">
                    {blocked ? 'Needs a provider that searches the web.' : s.what}
                  </span>
                </span>
                <span className="enh-picker-t">~{fmt(estimate[s.key])}</span>
                <span className="lib-check" aria-hidden="true">
                  {on && !blocked ? <Icon name="check" size={14} /> : null}
                </span>
              </button>
              {s.key === 'about' && on && !blocked && (
                <label className="enh-about-limit">
                  For the first
                  <select
                    value={aboutLimit}
                    onChange={(e) => setAboutLimit(Number(e.target.value))}
                  >
                    {[12, 24, 48, 96].map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  recordings - the rest any time later.
                </label>
              )}
            </li>
          );
        })}
      </ul>
      <div className="ai-share enh-apply">
        <div className="grow">
          <strong>Use pictures and descriptions as they are found</strong>
          <span className="sub">Off: they wait for you to approve each one.</span>
        </div>
        <Switch checked={apply} onChange={setApply} label="Use them as they are found" />
      </div>
      <div className="enh-go">
        <button
          className="btn btn-primary btn-lg"
          disabled={
            starting ||
            picked.filter((k) => webSearch || !STEPS.find((x) => x.key === k)?.search).length === 0
          }
          onClick={() => void start()}
        >
          <Icon name="sparkle" size={17} /> {starting ? 'Starting…' : 'Enhance my library'}
        </button>
        <span className="sub">
          About {fmt(total)}
          {scanning ? ' - once the library has been read' : ''}
        </span>
      </div>
      {error && <p className="enh-err">{error}</p>}
    </>
  );
}

function doneLine(key: EnhanceStepKey, found: number, note: string | null): string {
  if (note) return note;
  switch (key) {
    case 'levels':
      return `${found} recordings given a level`;
    case 'pictures':
      return found ? `${found} pictures found` : 'No pictures found this time';
    case 'about':
      return found ? `${found} descriptions written` : 'Nothing reliable found';
    case 'fixes':
      return found ? `${found} suggestions to review` : 'Nothing needed fixing';
  }
}
