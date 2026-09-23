/**
 * Plans.
 *
 * A plan is a rhythm you chose - which days, for how long, with which
 * recordings - and this page is where you see how it is going and what is
 * next. Three layers, most useful first:
 *
 *   1. Plan cards: each active plan as a thing with a shape - its weekday
 *      pips, how the current window is going, what is next, and one tap to
 *      begin.
 *   2. The next three weeks, grouped by week, each day a row of occurrences
 *      with a state pill and the one action that state calls for.
 *   3. Resting plans (paused, ended) out of the way underneath.
 *
 * Missed days are information, not debt: nothing here is red, and "Done
 * anyway" is always on offer.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  LibraryDto,
  MeditationSummaryDto,
  OccurrenceStatus,
  PlanDto,
  PlanOccurrenceDto,
} from '@zenport/shared';
import { formatDuration } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { Cover, EmptyState, ErrorNote, Icon, Sheet } from '../components/ui.tsx';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const STATUS_LABEL: Record<OccurrenceStatus, string> = {
  upcoming: 'Upcoming',
  today: 'Today',
  completed: 'Done',
  skipped: 'Skipped',
  missed: 'Missed',
};

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayDiff(date: string, today: string): number {
  return Math.round(
    (new Date(`${date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000,
  );
}

function humanDate(date: string, today: string): { top: string; bottom: string } {
  const d = new Date(`${date}T00:00:00`);
  const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  const diff = dayDiff(date, today);
  if (diff === 0) return { top: 'Today', bottom: label };
  if (diff === 1) return { top: 'Tomorrow', bottom: label };
  if (diff === -1) return { top: 'Yesterday', bottom: label };
  return { top: weekday, bottom: label };
}

/** Sunday-start week index relative to today's week: 0 this week, 1 next... */
function weekIndex(date: string, today: string): number {
  const t = new Date(`${today}T00:00:00`);
  const startOfThisWeek = new Date(t);
  startOfThisWeek.setDate(t.getDate() - t.getDay());
  const d = new Date(`${date}T00:00:00`);
  return Math.floor((d.getTime() - startOfThisWeek.getTime()) / (7 * 86_400_000));
}

const WEEK_LABEL = ['This week', 'Next week', 'In two weeks', 'In three weeks'];

function cadenceLabel(p: PlanDto): string {
  if (p.daysOfWeek.length === 0 || p.daysOfWeek.length === 7) return 'Every day';
  const set = new Set(p.daysOfWeek);
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return 'Weekdays';
  if (set.size === 2 && set.has(0) && set.has(6)) return 'Weekends';
  return p.daysOfWeek.map((d) => DOW[d]).join(' · ');
}

export function PlansPage() {
  const plans = useApi<PlanDto[]>('/api/plans');
  const occ = useApi<{ today: string; occurrences: PlanOccurrenceDto[] }>(
    '/api/plans/occurrences?days=21',
  );
  const lib = useApi<LibraryDto>('/api/library');
  const [editing, setEditing] = useState<PlanDto | 'new' | null>(null);
  const [rescheduling, setRescheduling] = useState<PlanOccurrenceDto | null>(null);

  const reloadAll = () => {
    plans.reload();
    occ.reload();
  };

  const items = useMemo(() => (lib.data?.items ?? []).filter((i) => !i.missing), [lib.data]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const today = occ.data?.today ?? isoDate(new Date());

  /** Occurrences by date, moved ones shown only at their destination. */
  const byDate = useMemo(() => {
    const map = new Map<string, PlanOccurrenceDto[]>();
    for (const o of occ.data?.occurrences ?? []) {
      if (o.movedTo) continue;
      map.set(o.date, [...(map.get(o.date) ?? []), o]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [occ.data]);

  /** Same list grouped into weeks, for the headers. */
  const byWeek = useMemo(() => {
    const weeks = new Map<number, [string, PlanOccurrenceDto[]][]>();
    for (const entry of byDate) {
      const w = weekIndex(entry[0], today);
      weeks.set(w, [...(weeks.get(w) ?? []), entry]);
    }
    return [...weeks.entries()].sort(([a], [b]) => a - b);
  }, [byDate, today]);

  /** Per plan: how the visible window is going, and what comes next. */
  const summary = useMemo(() => {
    const out = new Map<number, { done: number; total: number; next: PlanOccurrenceDto | null }>();
    for (const o of occ.data?.occurrences ?? []) {
      if (o.movedTo) continue;
      const s = out.get(o.planId) ?? { done: 0, total: 0, next: null };
      s.total += 1;
      if (o.status === 'completed') s.done += 1;
      if ((o.status === 'today' || o.status === 'upcoming') && !s.next) s.next = o;
      out.set(o.planId, s);
    }
    return out;
  }, [occ.data]);

  const act = async (o: PlanOccurrenceDto, action: 'complete' | 'skip' | 'unmark') => {
    await api.post(`/api/plans/${o.planId}/${action}`, { date: o.date }).catch(() => {});
    reloadAll();
  };

  if (plans.loading || occ.loading) {
    return (
      <>
        <div className="page-head">
          <h1>Plans</h1>
        </div>
        <div className="skeleton" style={{ height: 200 }} />
      </>
    );
  }
  if (plans.error) return <ErrorNote message={plans.error} onRetry={reloadAll} />;

  const activePlans = (plans.data ?? []).filter((p) => p.status === 'active');
  const restingPlans = (plans.data ?? []).filter((p) => p.status !== 'active');

  return (
    <>
      <div className="page-head plans-head">
        <div>
          <h1>Plans</h1>
          <p className="lede">
            A gentle rhythm, not a debt. Missed days are information, not failure.
          </p>
        </div>
        {(plans.data ?? []).length > 0 && (
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> New plan
          </button>
        )}
      </div>

      {(plans.data ?? []).length === 0 ? (
        <EmptyState
          title="No plans yet"
          art="ob-rhythm"
          action={
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              Plan your first stretch
            </button>
          }
        >
          Pick the days, how long, and if you like which recordings - ZenPort lays out the path
          ahead and keeps count without keeping score.
        </EmptyState>
      ) : (
        <>
          {activePlans.length > 0 && (
            <section className="section" aria-labelledby="sec-active">
              <div className="section-head">
                <h2 id="sec-active">In motion</h2>
              </div>
              <div className="plan-grid">
                {activePlans.map((p) => (
                  <PlanCard
                    key={p.id}
                    plan={p}
                    stats={summary.get(p.id) ?? { done: 0, total: 0, next: null }}
                    byId={byId}
                    today={today}
                    onEdit={() => setEditing(p)}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="section" aria-labelledby="sec-timeline">
            <div className="section-head">
              <h2 id="sec-timeline">The next three weeks</h2>
            </div>
            {byWeek.length === 0 ? (
              <EmptyState title="Nothing scheduled in this window">
                Your plans exist but have no upcoming days here - check their dates or cadence.
              </EmptyState>
            ) : (
              byWeek.map(([w, days]) => (
                <div className="week" key={w}>
                  <div className="week-head">
                    {WEEK_LABEL[w] ?? `Week ${w + 1}`}
                    <span className="week-count">
                      {days.reduce((n, [, l]) => n + l.length, 0)} planned
                    </span>
                  </div>
                  {days.map(([date, list]) => {
                    const h = humanDate(date, today);
                    return (
                      <div className={`day${date === today ? ' is-today' : ''}`} key={date}>
                        <div className="day-date">
                          <strong>{h.top}</strong>
                          <span>{h.bottom}</span>
                        </div>
                        <div className="day-list">
                          {list.map((o) => (
                            <Occurrence
                              key={`${o.planId}-${o.date}`}
                              o={o}
                              first={
                                o.meditationIds.map((id) => byId.get(id)).find(Boolean) ?? null
                              }
                              onAct={act}
                              onMove={() => setRescheduling(o)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </section>

          {restingPlans.length > 0 && (
            <section className="section" aria-labelledby="sec-resting">
              <div className="section-head">
                <h2 id="sec-resting">Resting</h2>
              </div>
              <div className="rowlist card" style={{ padding: '4px 16px' }}>
                {restingPlans.map((p) => (
                  <div className="row" key={p.id}>
                    <div className="grow">
                      <div>
                        {p.name} <span className="badge">{p.status}</span>
                      </div>
                      <div className="sub">
                        {cadenceLabel(p)} · {p.startDate}
                        {p.endDate ? ` → ${p.endDate}` : ' onward'}
                      </div>
                    </div>
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditing(p)}>
                      {p.status === 'paused' ? 'Resume or edit' : 'Edit'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {editing && (
        <PlanSheet
          plan={editing === 'new' ? null : editing}
          items={items}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reloadAll();
          }}
        />
      )}
      {rescheduling && (
        <RescheduleSheet
          occ={rescheduling}
          today={today}
          onClose={() => setRescheduling(null)}
          onSaved={() => {
            setRescheduling(null);
            reloadAll();
          }}
        />
      )}
    </>
  );
}

/** Weekday pips: the plan's shape at a glance. */
function CadencePips({ days, today }: { days: number[]; today: string }) {
  const all = days.length === 0;
  const todayDow = new Date(`${today}T00:00:00`).getDay();
  return (
    <span className="pips" aria-label={all ? 'Every day' : days.map((d) => DOW[d]).join(', ')}>
      {DOW_LETTER.map((l, i) => (
        <span
          key={i}
          className={`pip${all || days.includes(i) ? ' on' : ''}${i === todayDow ? ' now' : ''}`}
          aria-hidden="true"
        >
          {l}
        </span>
      ))}
    </span>
  );
}

function PlanCard({
  plan,
  stats,
  byId,
  today,
  onEdit,
}: {
  plan: PlanDto;
  stats: { done: number; total: number; next: PlanOccurrenceDto | null };
  byId: Map<string, MeditationSummaryDto>;
  today: string;
  onEdit: () => void;
}) {
  const meds = plan.meditationIds
    .map((id) => byId.get(id))
    .filter(Boolean) as MeditationSummaryDto[];
  const first = meds[0] ?? null;
  const pct = stats.total > 0 ? stats.done / stats.total : 0;
  const nextLabel = stats.next
    ? stats.next.status === 'today'
      ? 'Today'
      : humanDate(stats.next.date, today).top
    : null;
  const r = 15;
  const c = 2 * Math.PI * r;

  return (
    <article className="plan-card">
      <header className="plan-card__head">
        <div className="plan-card__title">
          <h3>{plan.name}</h3>
          {plan.intention && <p className="plan-card__intention">“{plan.intention}”</p>}
        </div>
        <div className="plan-card__ring" title={`${stats.done} of ${stats.total} in this window`}>
          <svg viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="20" cy="20" r={r} stroke="var(--hairline)" strokeWidth="4" fill="none" />
            <circle
              cx="20"
              cy="20"
              r={r}
              stroke="var(--accent)"
              strokeWidth="4"
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${c * pct} ${c}`}
              transform="rotate(-90 20 20)"
            />
          </svg>
          <span>
            {stats.done}/{stats.total}
          </span>
        </div>
      </header>

      <div className="plan-card__meta">
        <CadencePips days={plan.daysOfWeek} today={today} />
        <span className="plan-card__cadence">{cadenceLabel(plan)}</span>
        {plan.targetMinutes && <span className="plan-card__pill">{plan.targetMinutes} min</span>}
        {plan.preferredTime && <span className="plan-card__pill">{plan.preferredTime}</span>}
        {plan.endDate && (
          <span className="plan-card__pill">
            until{' '}
            {new Date(`${plan.endDate}T00:00:00`).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        )}
      </div>

      {meds.length > 0 && (
        <div className="plan-card__meds">
          <div className="cover-stack">
            {meds.slice(0, 3).map((m) => (
              <Cover key={m.id} coverId={m.coverId} title={m.title} creator={m.creator} />
            ))}
          </div>
          <span className="plan-card__medlabel">
            {meds.length === 1 ? meds[0]!.title : `${meds.length} recordings`}
            {meds.length === 1 && meds[0]!.totalDurationSec
              ? ` · ${formatDuration(meds[0]!.totalDurationSec)}`
              : ''}
          </span>
        </div>
      )}

      <footer className="plan-card__foot">
        <span className="plan-card__next">
          {nextLabel ? (
            <>
              Next: <strong>{nextLabel}</strong>
            </>
          ) : (
            'Nothing scheduled in the next three weeks'
          )}
        </span>
        <div className="plan-card__actions">
          <button className="btn btn-sm btn-quiet" onClick={onEdit}>
            Edit
          </button>
          {first && (
            <Link className="btn btn-sm btn-primary" to={`/m/${first.id}`}>
              <Icon name="play" size={14} /> Begin
            </Link>
          )}
        </div>
      </footer>
    </article>
  );
}

function Occurrence({
  o,
  first,
  onAct,
  onMove,
}: {
  o: PlanOccurrenceDto;
  first: MeditationSummaryDto | null;
  onAct: (o: PlanOccurrenceDto, a: 'complete' | 'skip' | 'unmark') => Promise<void>;
  onMove: () => void;
}) {
  const open = o.status === 'today' || o.status === 'missed' || o.status === 'upcoming';
  return (
    <div className="occ" data-status={o.status}>
      <span className={`pill pill-${o.status}`}>
        {o.status === 'completed' && <Icon name="check" size={12} />}
        {STATUS_LABEL[o.status]}
      </span>
      <div className="occ-body">
        <span className="occ-name">{o.planName}</span>
        <span className="occ-sub">
          {first ? first.title : 'Any meditation you choose'}
          {o.movedFrom ? ` · moved from ${o.movedFrom.slice(5)}` : ''}
        </span>
      </div>
      <div className="occ-actions">
        {o.status === 'today' && first && (
          <Link className="btn btn-sm btn-primary" to={`/m/${first.id}`}>
            Begin
          </Link>
        )}
        {open && (
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => void onAct(o, 'complete')}
            title={o.status === 'missed' ? 'Mark it done anyway' : 'Mark complete'}
          >
            <Icon name="check" size={14} /> {o.status === 'missed' ? 'Done anyway' : 'Done'}
          </button>
        )}
        {open && (
          <button className="btn btn-sm btn-quiet" onClick={() => void onAct(o, 'skip')}>
            Skip
          </button>
        )}
        {open && (
          <button className="btn btn-sm btn-quiet" onClick={onMove}>
            Move
          </button>
        )}
        {(o.status === 'completed' || o.status === 'skipped') && (
          <button
            className="btn btn-sm btn-quiet"
            onClick={() => void onAct(o, 'unmark')}
            title="Undo this mark"
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}

// ── The plan form ────────────────────────────────────────────────────────────

type Template = {
  key: string;
  label: string;
  note: string;
  days: number[];
  weeks: number | null;
  target: number | null;
};

const TEMPLATES: Template[] = [
  {
    key: 'daily',
    label: 'Every day',
    note: 'Thirty days, ten minutes',
    days: [],
    weeks: 4,
    target: 10,
  },
  {
    key: 'weekdays',
    label: 'Weekday mornings',
    note: 'Monday to Friday, open-ended',
    days: [1, 2, 3, 4, 5],
    weeks: null,
    target: 10,
  },
  {
    key: 'thrice',
    label: 'Three a week',
    note: 'Mon · Wed · Fri, six weeks',
    days: [1, 3, 5],
    weeks: 6,
    target: 15,
  },
  {
    key: 'weekend',
    label: 'Weekend sits',
    note: 'Longer, slower, twice a week',
    days: [0, 6],
    weeks: null,
    target: 30,
  },
];

const TARGETS = [5, 10, 15, 20, 30, 45];
const LENGTHS: { label: string; weeks: number | null }[] = [
  { label: '2 weeks', weeks: 2 },
  { label: '30 days', weeks: 4 },
  { label: '6 weeks', weeks: 6 },
  { label: 'Open-ended', weeks: null },
];

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function PlanSheet({
  plan,
  items,
  onClose,
  onSaved,
}: {
  plan: PlanDto | null;
  items: MeditationSummaryDto[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = isoDate(new Date());
  const [name, setName] = useState(plan?.name ?? '');
  const [intention, setIntention] = useState(plan?.intention ?? '');
  const [startDate, setStartDate] = useState(plan?.startDate ?? today);
  const [endDate, setEndDate] = useState(plan?.endDate ?? '');
  const [days, setDays] = useState<number[]>(plan?.daysOfWeek ?? []);
  const [time, setTime] = useState(plan?.preferredTime ?? '');
  const [target, setTarget] = useState<number | null>(plan?.targetMinutes ?? null);
  const [notes, setNotes] = useState(plan?.notes ?? '');
  const [meds, setMeds] = useState<string[]>(plan?.meditationIds ?? []);
  const [medQuery, setMedQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showMore, setShowMore] = useState(Boolean(plan?.notes || plan?.preferredTime));

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));
  const toggleMed = (id: string) =>
    setMeds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const applyTemplate = (t: Template) => {
    setDays(t.days);
    setTarget(t.target);
    setEndDate(t.weeks ? addDays(startDate, t.weeks * 7 - 1) : '');
    if (!name.trim()) setName(t.label);
  };

  /** "3 × a week for 6 weeks · 18 sits" - the plan's shape, as you build it. */
  const preview = useMemo(() => {
    const perWeek = days.length === 0 ? 7 : days.length;
    const cadence =
      perWeek === 7 ? 'Every day' : perWeek === 1 ? 'Once a week' : `${perWeek}× a week`;
    if (!endDate) return `${cadence}, open-ended`;
    const span = dayDiff(endDate, startDate) + 1;
    if (span <= 0) return cadence;
    let count = 0;
    for (let i = 0; i < span; i++) {
      const dow = new Date(`${addDays(startDate, i)}T00:00:00`).getDay();
      if (days.length === 0 || days.includes(dow)) count++;
    }
    const weeks = Math.round(span / 7);
    return `${cadence} for ${weeks >= 1 ? `${weeks} week${weeks === 1 ? '' : 's'}` : `${span} days`} · ${count} sit${count === 1 ? '' : 's'}`;
  }, [days, startDate, endDate]);

  const filteredItems = useMemo(() => {
    const q = medQuery.trim().toLowerCase();
    const list = q
      ? items.filter(
          (i) => i.title.toLowerCase().includes(q) || i.creator.toLowerCase().includes(q),
        )
      : items;
    // Chosen ones first, so the selection is always visible above the fold.
    return [...list].sort((a, b) => Number(meds.includes(b.id)) - Number(meds.includes(a.id)));
  }, [items, medQuery, meds]);

  const save = async () => {
    if (!name.trim()) {
      setError('Give the plan a name.');
      return;
    }
    if (endDate && endDate < startDate) {
      setError('The end date is before the start date.');
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      name: name.trim(),
      intention: intention.trim() || null,
      startDate,
      endDate: endDate || null,
      daysOfWeek: days,
      preferredTime: time || null,
      targetMinutes: target,
      notes: notes.trim() || null,
      meditationIds: meds,
    };
    try {
      if (plan) await api.patch(`/api/plans/${plan.id}`, payload);
      else await api.post('/api/plans', payload);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not save the plan');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: PlanDto['status']) => {
    if (!plan) return;
    await api.patch(`/api/plans/${plan.id}`, { status }).catch(() => {});
    onSaved();
  };

  const remove = async () => {
    if (!plan) return;
    if (!window.confirm(`Delete “${plan.name}”? Completed practice sessions stay in your history.`))
      return;
    await api.del(`/api/plans/${plan.id}`).catch(() => {});
    onSaved();
  };

  return (
    <Sheet title={plan ? 'Edit plan' : 'New plan'} onClose={onClose}>
      {!plan && (
        <div className="field">
          <label>Start from a shape</label>
          <div className="template-row">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                className="template"
                onClick={() => applyTemplate(t)}
              >
                <span className="template__label">{t.label}</span>
                <span className="template__note">{t.note}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="pl-name">Name</label>
        <input
          id="pl-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Morning stillness"
        />
      </div>
      <div className="field">
        <label htmlFor="pl-int">Intention - shown during focused practice</label>
        <input
          id="pl-int"
          value={intention}
          onChange={(e) => setIntention(e.target.value)}
          placeholder="Meet the morning before the morning meets me"
        />
      </div>

      <div className="field">
        <span className="visually-hidden" id="pl-days-label">
          Practice days
        </span>
        <label aria-hidden="true">Days</label>
        <div className="day-picker" role="group" aria-labelledby="pl-days-label">
          {DOW.map((d, i) => (
            <button
              key={d}
              type="button"
              className="day-chip"
              aria-pressed={days.includes(i)}
              onClick={() => toggleDay(i)}
            >
              <span className="day-chip__l">{DOW_LETTER[i]}</span>
              <span className="day-chip__n">{d}</span>
            </button>
          ))}
        </div>
        <div className="chip-row" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="chip"
            aria-pressed={days.length === 0}
            onClick={() => setDays([])}
          >
            Every day
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={days.join() === '1,2,3,4,5'}
            onClick={() => setDays([1, 2, 3, 4, 5])}
          >
            Weekdays
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={days.join() === '0,6'}
            onClick={() => setDays([0, 6])}
          >
            Weekends
          </button>
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="pl-start">Starts</label>
          <input
            id="pl-start"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="pl-end">For</label>
          <div className="chip-row" id="pl-end">
            {LENGTHS.map((l) => {
              const end = l.weeks ? addDays(startDate, l.weeks * 7 - 1) : '';
              return (
                <button
                  key={l.label}
                  type="button"
                  className="chip"
                  aria-pressed={endDate === end}
                  onClick={() => setEndDate(end)}
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="field">
        <label>Target per sit</label>
        <div className="chip-row">
          {TARGETS.map((m) => (
            <button
              key={m}
              type="button"
              className="chip"
              aria-pressed={target === m}
              onClick={() => setTarget(target === m ? null : m)}
            >
              {m}m
            </button>
          ))}
          <button
            type="button"
            className="chip"
            aria-pressed={target === null}
            onClick={() => setTarget(null)}
          >
            No target
          </button>
        </div>
      </div>

      <p className="plan-preview" aria-live="polite">
        <Icon name="plans" size={15} /> {preview}
        {endDate ? (
          <span className="plan-preview__dates">
            {' '}
            · ends{' '}
            {new Date(`${endDate}T00:00:00`).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        ) : null}
      </p>

      <div className="field">
        <label htmlFor="pl-meds-q">
          Recordings in this plan - optional, a plan can just hold the habit
        </label>
        {items.length > 6 && (
          <input
            id="pl-meds-q"
            type="search"
            value={medQuery}
            onChange={(e) => setMedQuery(e.target.value)}
            placeholder="Search your library…"
            style={{ marginBottom: 8 }}
          />
        )}
        <div className="med-picker">
          {filteredItems.slice(0, 40).map((i) => {
            const on = meds.includes(i.id);
            return (
              <button
                key={i.id}
                type="button"
                className="med-pick"
                aria-pressed={on}
                onClick={() => toggleMed(i.id)}
              >
                <Cover coverId={i.coverId} title={i.title} creator={i.creator} />
                <span className="med-pick__t">{i.title}</span>
                <span className="med-pick__c">
                  {i.creator}
                  {i.totalDurationSec ? ` · ${formatDuration(i.totalDurationSec)}` : ''}
                </span>
                {on && (
                  <span className="med-pick__check" aria-hidden="true">
                    <Icon name="check" size={13} />
                  </span>
                )}
              </button>
            );
          })}
          {filteredItems.length === 0 && (
            <p style={{ color: 'var(--faint)', fontSize: 13 }}>Nothing in your library matches.</p>
          )}
        </div>
      </div>

      <button type="button" className="btn btn-sm btn-quiet" onClick={() => setShowMore((v) => !v)}>
        {showMore ? 'Fewer options' : 'More options'}
      </button>
      {showMore && (
        <div className="field-row" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="pl-time">Preferred time</label>
            <input
              id="pl-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="pl-notes">Notes</label>
            <textarea
              id="pl-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      )}

      {error && <p className="error-note">{error}</p>}
      <div className="form-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {plan && plan.status === 'active' && (
            <button className="btn btn-ghost" onClick={() => void setStatus('paused')}>
              Pause
            </button>
          )}
          {plan && plan.status === 'paused' && (
            <button className="btn btn-ghost" onClick={() => void setStatus('active')}>
              Resume
            </button>
          )}
          {plan && plan.status !== 'ended' && (
            <button className="btn btn-ghost" onClick={() => void setStatus('ended')}>
              End plan
            </button>
          )}
          {plan && (
            <button className="btn btn-danger" onClick={() => void remove()}>
              Delete
            </button>
          )}
        </div>
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : plan ? 'Save changes' : 'Create plan'}
        </button>
      </div>
    </Sheet>
  );
}

function RescheduleSheet({
  occ,
  today,
  onClose,
  onSaved,
}: {
  occ: PlanOccurrenceDto;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [to, setTo] = useState(occ.date);
  const [busy, setBusy] = useState(false);
  const move = async () => {
    setBusy(true);
    await api.post(`/api/plans/${occ.planId}/reschedule`, { date: occ.date, to }).catch(() => {});
    onSaved();
  };
  const quick = [
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'In 2 days', date: addDays(today, 2) },
    { label: 'Next week', date: addDays(occ.date, 7) },
  ].filter((q) => q.date !== occ.date);
  return (
    <Sheet title={`Move ${occ.planName}`} onClose={onClose}>
      <p style={{ color: 'var(--muted)', marginBottom: 12 }}>
        Move the {humanDate(occ.date, today).top.toLowerCase()} practice to another day. The plan
        keeps its rhythm; only this one moves.
      </p>
      <div className="chip-row" style={{ marginBottom: 12 }}>
        {quick.map((q) => (
          <button
            key={q.label}
            className="chip"
            aria-pressed={to === q.date}
            onClick={() => setTo(q.date)}
          >
            {q.label}
          </button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="rs-to">Or pick a date</label>
        <input id="rs-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <div className="form-actions">
        <button className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || to === occ.date}
          onClick={() => void move()}
        >
          Move it
        </button>
      </div>
    </Sheet>
  );
}
