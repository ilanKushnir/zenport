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
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type {
  LibraryDto,
  MeditationSummaryDto,
  OccurrenceStatus,
  PlanDto,
  PlanOccurrenceDto,
} from '@zenport/shared';
import { formatDuration, shiftedDate } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { Cover, EmptyState, ErrorNote, Icon, Sheet } from '../components/ui.tsx';
import { AiPlanSheet } from '../components/AiPlanSheet.tsx';
import { itemLabel, TYPE_META } from '../content.ts';
import { isPracticeType } from '@zenport/shared';

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

/**
 * What a plan's occurrence points at. A practice plan's first chosen
 * meditation; a learning plan's first course or talk that is not finished yet,
 * so the plan walks through its list in order.
 */
export function planNext(
  ids: string[],
  byId: Map<string, MeditationSummaryDto>,
  focus: PlanDto['focus'],
): MeditationSummaryDto | null {
  const list = ids.map((id) => byId.get(id)).filter(Boolean) as MeditationSummaryDto[];
  if (focus === 'learning')
    return list.find((i) => i.completedCount < i.trackCount) ?? list[0] ?? null;
  return list[0] ?? null;
}

export function PlansPage() {
  const plans = useApi<PlanDto[]>('/api/plans');
  const occ = useApi<{ today: string; occurrences: PlanOccurrenceDto[] }>(
    '/api/plans/occurrences?days=21',
  );
  const lib = useApi<LibraryDto>('/api/library');
  const [editing, setEditing] = useState<PlanDto | 'new' | null>(null);
  const [rescheduling, setRescheduling] = useState<PlanOccurrenceDto | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  const reloadAll = () => {
    plans.reload();
    occ.reload();
  };

  const items = useMemo(() => (lib.data?.items ?? []).filter((i) => !i.missing), [lib.data]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const today = occ.data?.today ?? isoDate(new Date());
  const focusOf = useMemo(
    () => new Map((plans.data ?? []).map((p) => [p.id, p.focus] as const)),
    [plans.data],
  );

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
  // Plans made as one AI path travel together, in step order; the rest stand alone.
  const paths = new Map<string, PlanDto[]>();
  for (const p of activePlans) {
    if (!p.path) continue;
    const list = paths.get(p.path.name) ?? [];
    list.push(p);
    paths.set(p.path.name, list);
  }
  for (const list of paths.values()) list.sort((a, b) => a.path!.step - b.path!.step);
  const singlePlans = activePlans.filter((p) => !p.path);
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
          <div className="plans-head-actions">
            <button className="btn btn-ghost" onClick={() => setAiOpen(true)}>
              <Icon name="sparkle" size={16} /> Plan with AI
            </button>
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              <Icon name="plus" size={16} /> New plan
            </button>
          </div>
        )}
      </div>

      {(plans.data ?? []).length === 0 ? (
        <EmptyState
          title="No plans yet"
          art="ob-rhythm"
          action={
            <div className="empty-actions">
              <button className="btn btn-primary" onClick={() => setEditing('new')}>
                Plan your first stretch
              </button>
              <button className="btn btn-ghost" onClick={() => setAiOpen(true)}>
                <Icon name="sparkle" size={16} /> Plan it with AI
              </button>
            </div>
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
              {[...paths.entries()].map(([pathName, stages]) => (
                <PathBlock
                  key={pathName}
                  name={pathName}
                  stages={stages}
                  today={today}
                  render={(p) => (
                    <PlanCard
                      key={p.id}
                      plan={p}
                      stats={summary.get(p.id) ?? { done: 0, total: 0, next: null }}
                      byId={byId}
                      today={today}
                      onEdit={() => setEditing(p)}
                    />
                  )}
                  onEdit={setEditing}
                />
              ))}
              {singlePlans.length > 0 && (
                <div className="plan-grid">
                  {singlePlans.map((p) => (
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
              )}
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
                              first={planNext(
                                o.meditationIds,
                                byId,
                                focusOf.get(o.planId) ?? 'practice',
                              )}
                              focus={focusOf.get(o.planId) ?? 'practice'}
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
                        {p.endDate ? ` → ${shiftedDate(p.endDate, p.shifts)}` : ' onward'}
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

      {aiOpen && (
        <AiPlanSheet
          onClose={() => setAiOpen(false)}
          onCreated={() => {
            setAiOpen(false);
            reloadAll();
          }}
        />
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
          plan={(plans.data ?? []).find((p) => p.id === rescheduling.planId) ?? null}
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

/**
 * An AI path: its stages in order as a stepper, with the stages under way
 * shown as full plan cards and the ones still ahead as a quiet line each.
 */
function PathBlock({
  name,
  stages,
  today,
  render,
  onEdit,
}: {
  name: string;
  stages: PlanDto[];
  today: string;
  render: (p: PlanDto) => ReactNode;
  onEdit: (p: PlanDto) => void;
}) {
  const state = (p: PlanDto) =>
    p.endDate && shiftedDate(p.endDate, p.shifts) < today
      ? 'done'
      : p.startDate > today
        ? 'ahead'
        : 'now';
  const current = stages.filter((p) => state(p) === 'now');
  const ahead = stages.filter((p) => state(p) === 'ahead');
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <div className="path-block">
      <div className="path-head">
        <span className="path-kicker">
          <Icon name="sparkle" size={13} /> Path
        </span>
        <h3>{name}</h3>
      </div>
      <ol className="path-steps" aria-label={`${name}: stages`}>
        {stages.map((p) => (
          <li key={p.id} className={`path-step ${state(p)}`}>
            <span className="path-dot" aria-hidden="true">
              {state(p) === 'done' ? <Icon name="check" size={11} /> : p.path!.step}
            </span>
            <span className="path-step-t">{p.name.replace(`${name} · `, '')}</span>
            <span className="path-step-d">{state(p) === 'now' ? 'Now' : fmt(p.startDate)}</span>
          </li>
        ))}
      </ol>
      {current.length > 0 && <div className="plan-grid">{current.map(render)}</div>}
      {ahead.length > 0 && (
        <div className="rowlist path-ahead">
          {ahead.map((p) => (
            <div className="row" key={p.id}>
              <span
                className={`plan-focus ${p.focus === 'learning' ? 't-course' : 't-meditation'}`}
              >
                <Icon name={p.focus === 'learning' ? 'book' : 'lotus'} size={12} />
              </span>
              <div className="grow">
                <div>{p.name.replace(`${name} · `, '')}</div>
                <div className="sub">
                  Starts {fmt(p.startDate)}
                  {p.endDate ? ` · until ${fmt(shiftedDate(p.endDate, p.shifts))}` : ''} ·{' '}
                  {cadenceLabel(p)}
                </div>
              </div>
              <button className="btn btn-sm btn-quiet" onClick={() => onEdit(p)}>
                Edit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
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
  const first = planNext(plan.meditationIds, byId, plan.focus);
  const learning = plan.focus === 'learning';
  const learnDone = learning ? meds.reduce((n, m) => n + m.completedCount, 0) : 0;
  const learnTotal = learning ? meds.reduce((n, m) => n + m.trackCount, 0) : 0;
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
          <span className={`plan-focus ${learning ? 't-course' : 't-meditation'}`}>
            <Icon name={learning ? 'book' : 'lotus'} size={13} />
            {learning ? 'Learning' : 'Practice'}
          </span>
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
            {new Date(`${shiftedDate(plan.endDate, plan.shifts)}T00:00:00`).toLocaleDateString(
              undefined,
              {
                month: 'short',
                day: 'numeric',
              },
            )}
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
            {learning
              ? `${meds.length} to follow · ${learnDone} of ${learnTotal} done`
              : meds.length === 1
                ? itemLabel(meds[0]!)
                : `${meds.length} recordings`}
            {!learning && meds.length === 1 && meds[0]!.totalDurationSec
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
              <Icon name="play" size={14} /> {learning ? 'Continue' : 'Begin'}
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
  focus,
  onAct,
  onMove,
}: {
  o: PlanOccurrenceDto;
  first: MeditationSummaryDto | null;
  focus: PlanDto['focus'];
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
        <span className="occ-name">
          <Icon name={focus === 'learning' ? 'book' : 'lotus'} size={14} />
          {o.planName}
        </span>
        <span className="occ-sub">
          {first
            ? `${itemLabel(first)}${
                focus === 'learning' && first.trackCount > 1
                  ? ` · ${first.completedCount >= first.trackCount ? 'review' : `${TYPE_META[first.type].part} ${first.completedCount + 1}`}`
                  : ''
              }`
            : 'Any meditation you choose'}
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

const TARGETS = [5, 10, 15, 20, 30, 45, 60, 90];
const LENGTHS: { label: string; weeks: number | null }[] = [
  { label: '2 weeks', weeks: 2 },
  { label: '4 weeks', weeks: 4 },
  { label: '6 weeks', weeks: 6 },
  { label: '3 months', weeks: 13 },
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
  const [focus, setFocus] = useState<PlanDto['focus']>(plan?.focus ?? 'practice');
  const learning = focus === 'learning';
  const [medQuery, setMedQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    const ofFocus = items.filter((i) => isPracticeType(i.type) !== learning);
    const list = q
      ? ofFocus.filter(
          (i) =>
            i.title.toLowerCase().includes(q) ||
            i.creator.toLowerCase().includes(q) ||
            (i.collection ?? '').toLowerCase().includes(q),
        )
      : ofFocus;
    // Chosen ones first, so the selection is always visible above the fold.
    return [...list].sort((a, b) => Number(meds.includes(b.id)) - Number(meds.includes(a.id)));
  }, [items, medQuery, meds, learning]);

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
      focus,
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

  const fmtDay = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  const daysValue =
    days.length === 0 || days.length === 7
      ? 'Every day'
      : days.join() === '1,2,3,4,5'
        ? 'Weekdays'
        : days.join() === '0,6'
          ? 'Weekends'
          : days.map((d) => DOW[d]).join(' · ');
  const lengthWeeks = endDate ? Math.round((dayDiff(endDate, startDate) + 1) / 7) : null;
  const lengthValue = !endDate
    ? 'Open-ended'
    : `${lengthWeeks && lengthWeeks >= 1 ? `${lengthWeeks} week${lengthWeeks === 1 ? '' : 's'}` : `${dayDiff(endDate, startDate) + 1} days`} · until ${fmtDay(endDate)}`;
  const chosen = meds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is MeditationSummaryDto => !!i);
  const [open, setOpen] = useState<RowKey | null>(null);
  const toggle = (k: RowKey) => setOpen((o) => (o === k ? null : k));
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <Sheet title={plan ? 'Edit plan' : 'New plan'} onClose={onClose}>
      <div className="seg focus-seg" role="radiogroup" aria-label="Plan focus">
        {(['practice', 'learning'] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={focus === f}
            className={`seg-opt${focus === f ? ' on' : ''}`}
            onClick={() => {
              if (f === focus) return;
              setFocus(f);
              // Items of the other kind do not belong in this plan.
              setMeds((prev) =>
                prev.filter((id) => {
                  const it = items.find((x) => x.id === id);
                  return it ? isPracticeType(it.type) === (f === 'practice') : false;
                }),
              );
            }}
          >
            <Icon name={f === 'learning' ? 'book' : 'lotus'} size={15} />
            {f === 'learning' ? 'Learning' : 'Practice'}
          </button>
        ))}
      </div>

      <div className="plan-title">
        <input
          id="pl-name"
          className="plan-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={learning ? 'Name this study plan' : 'Name this plan'}
          aria-label="Name"
        />
        <input
          id="pl-int"
          className="plan-intention"
          value={intention}
          onChange={(e) => setIntention(e.target.value)}
          placeholder="An intention, shown while you practise (optional)"
          aria-label="Intention"
        />
      </div>

      {!plan && (
        <div className="template-row" aria-label="Start from a shape">
          {TEMPLATES.map((t) => (
            <button key={t.key} type="button" className="template" onClick={() => applyTemplate(t)}>
              <span className="template__label">{t.label}</span>
              <span className="template__note">{t.note}</span>
            </button>
          ))}
        </div>
      )}

      <p className="plan-preview" aria-live="polite">
        <Icon name="plans" size={15} /> {preview}
      </p>

      <div className="prows">
        <PlanRow k="days" icon="sun" label="Days" value={daysValue} open={open} onToggle={toggle}>
          <div className="day-picker" role="group" aria-label="Practice days">
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
          <div className="chip-row">
            {(
              [
                ['Every day', []],
                ['Weekdays', [1, 2, 3, 4, 5]],
                ['Weekends', [0, 6]],
              ] as const
            ).map(([label, set]) => (
              <button
                key={label}
                type="button"
                className="chip"
                aria-pressed={days.join() === set.join()}
                onClick={() => setDays([...set])}
              >
                {label}
              </button>
            ))}
          </div>
        </PlanRow>

        <PlanRow
          k="start"
          icon="plans"
          label="Starts"
          value={startDate === today ? 'Today' : fmtDay(startDate)}
          open={open}
          onToggle={toggle}
        >
          <div className="chip-row">
            {[
              ['Today', today],
              ['Tomorrow', addDays(today, 1)],
              ['Next Monday', addDays(today, (8 - new Date().getDay()) % 7 || 7)],
            ].map(([label, d]) => (
              <button
                key={label}
                type="button"
                className="chip"
                aria-pressed={startDate === d}
                onClick={() => {
                  // Keep the length when the start moves.
                  if (endDate) setEndDate(addDays(d!, dayDiff(endDate, startDate)));
                  setStartDate(d!);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="prow-field">
            <span>Or pick a date</span>
            <input
              id="pl-start"
              type="date"
              value={startDate}
              onChange={(e) => e.target.value && setStartDate(e.target.value)}
            />
          </label>
        </PlanRow>

        <PlanRow
          k="length"
          icon="history"
          label="Length"
          value={lengthValue}
          open={open}
          onToggle={toggle}
        >
          <div className="chip-row">
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
          <label className="prow-field">
            <span>Or end on</span>
            <input
              id="pl-end"
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </PlanRow>

        <PlanRow
          k="target"
          icon="timer"
          label={learning ? 'Each session' : 'Each sit'}
          value={target ? `${target} min` : 'No target'}
          open={open}
          onToggle={toggle}
        >
          <div className="chip-row">
            {TARGETS.map((m) => (
              <button
                key={m}
                type="button"
                className="chip"
                aria-pressed={target === m}
                onClick={() => setTarget(m)}
              >
                {m < 60 ? `${m} min` : m === 60 ? '1 hour' : `${m / 60} h`}
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
        </PlanRow>

        <PlanRow
          k="time"
          icon="bell"
          label="Time"
          value={time || 'Any time'}
          open={open}
          onToggle={toggle}
        >
          <div className="chip-row">
            {[
              ['Morning', '07:00'],
              ['Midday', '12:30'],
              ['Evening', '20:00'],
              ['Any time', ''],
            ].map(([label, t]) => (
              <button
                key={label}
                type="button"
                className="chip"
                aria-pressed={time === t}
                onClick={() => setTime(t!)}
              >
                {label}
                {t ? <span className="chip-sub"> {t}</span> : null}
              </button>
            ))}
          </div>
          <label className="prow-field">
            <span>Or exactly</span>
            <input
              id="pl-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
        </PlanRow>

        <PlanRow
          k="items"
          icon={learning ? 'book' : 'lotus'}
          label={learning ? 'What to follow' : 'Recordings'}
          value={
            chosen.length === 0
              ? learning
                ? 'Choose'
                : 'Any - just the habit'
              : `${chosen.length} chosen`
          }
          preview={
            chosen.length > 0 ? (
              <span className="prow-covers" aria-hidden="true">
                {chosen.slice(0, 3).map((c) => (
                  <span key={c.id} className="prow-cover">
                    <Cover coverId={c.coverId} title={c.title} creator={c.creator} />
                  </span>
                ))}
              </span>
            ) : null
          }
          open={open}
          onToggle={toggle}
        >
          <p className="hint" style={{ marginTop: 0 }}>
            {learning
              ? 'Followed in the order you pick them.'
              : 'Optional - a plan can simply hold the habit.'}
          </p>
          {items.length > 6 && (
            <input
              id="pl-meds-q"
              type="search"
              value={medQuery}
              onChange={(e) => setMedQuery(e.target.value)}
              placeholder="Search your library…"
              aria-label="Search your library"
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
                    {TYPE_META[i.type].label} · {i.creator}
                    {i.totalDurationSec ? ` · ${formatDuration(i.totalDurationSec)}` : ''}
                  </span>
                  {on && (
                    <span className="med-pick__check" aria-hidden="true">
                      {learning ? meds.indexOf(i.id) + 1 : <Icon name="check" size={13} />}
                    </span>
                  )}
                </button>
              );
            })}
            {filteredItems.length === 0 && (
              <p style={{ color: 'var(--faint)', fontSize: 13 }}>
                Nothing in your library matches.
              </p>
            )}
          </div>
        </PlanRow>

        <PlanRow
          k="notes"
          icon="journal"
          label="Notes"
          value={notes.trim() ? notes.trim().split('\n')[0]! : 'None'}
          open={open}
          onToggle={toggle}
        >
          <textarea
            id="pl-notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything you want to remember about this plan"
            aria-label="Notes"
          />
        </PlanRow>
      </div>

      {error && <p className="error-note">{error}</p>}
      <button className="btn btn-primary plan-save" disabled={busy} onClick={() => void save()}>
        {busy ? 'Saving…' : plan ? 'Save changes' : 'Create plan'}
      </button>

      {plan && (
        <div className="prows plan-manage">
          {plan.status === 'active' && (
            <button type="button" className="prow-action" onClick={() => void setStatus('paused')}>
              <Icon name="pause" size={17} />
              <span className="grow">
                Pause
                <span className="sub">Stop scheduling until you resume. Nothing is lost.</span>
              </span>
            </button>
          )}
          {plan.status === 'paused' && (
            <button type="button" className="prow-action" onClick={() => void setStatus('active')}>
              <Icon name="play" size={17} />
              <span className="grow">Resume</span>
            </button>
          )}
          {plan.status !== 'ended' && (
            <button type="button" className="prow-action" onClick={() => void setStatus('ended')}>
              <Icon name="check-circle" size={17} />
              <span className="grow">
                End the plan
                <span className="sub">Close it as done; its days stay in your history.</span>
              </span>
            </button>
          )}
          {confirmDelete ? (
            <div className="prow-confirm">
              <span>Delete “{plan.name}”? Completed sessions stay in your history.</span>
              <div className="rf-actions">
                <button className="btn btn-sm btn-quiet" onClick={() => setConfirmDelete(false)}>
                  Keep
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => void remove()}>
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="prow-action danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Icon name="trash" size={17} />
              <span className="grow">Delete the plan</span>
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}

type RowKey = 'days' | 'start' | 'length' | 'target' | 'time' | 'items' | 'notes';

/**
 * One line of the plan: what it is and its current value; tap to open the
 * choices beneath it. One row open at a time keeps the sheet short.
 */
function PlanRow({
  k,
  icon,
  label,
  value,
  preview,
  open,
  onToggle,
  children,
}: {
  k: RowKey;
  icon: string;
  label: string;
  value: string;
  preview?: ReactNode;
  open: RowKey | null;
  onToggle: (k: RowKey) => void;
  children: ReactNode;
}) {
  const isOpen = open === k;
  return (
    <div className={`prow${isOpen ? ' open' : ''}`}>
      <button
        type="button"
        className="prow-head"
        aria-expanded={isOpen}
        aria-controls={`prow-${k}`}
        onClick={() => onToggle(k)}
      >
        <span className="prow-ic">
          <Icon name={icon} size={16} />
        </span>
        <span className="prow-label">{label}</span>
        {preview}
        <span className="prow-value">{value}</span>
        <span className="prow-caret" aria-hidden="true">
          <Icon name="chevron-down" size={15} />
        </span>
      </button>
      {isOpen && (
        <div className="prow-body" id={`prow-${k}`}>
          {children}
        </div>
      )}
    </div>
  );
}

function RescheduleSheet({
  occ,
  plan,
  today,
  onClose,
  onSaved,
}: {
  occ: PlanOccurrenceDto;
  plan: PlanDto | null;
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [to, setTo] = useState(occ.date);
  const [push, setPush] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = dayDiff(to, occ.date);
  // Pushing only goes forward; an earlier day is always a single move.
  const canPush = days > 0;
  const pushing = push && canPush;
  const move = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/plans/${occ.planId}/reschedule`, {
        date: occ.date,
        to,
        push: pushing,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not move it');
      setBusy(false);
    }
  };
  const quick = [
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'In 2 days', date: addDays(today, 2) },
    { label: 'Next week', date: addDays(occ.date, 7) },
  ].filter((q) => q.date !== occ.date);
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  const end = plan?.endDate ? shiftedDate(plan.endDate, plan.shifts) : null;
  const dayWord = `${days} day${days === 1 ? '' : 's'}`;
  return (
    <Sheet title={`Move ${occ.planName}`} onClose={onClose}>
      <p className="sit-sheet-lede">
        {humanDate(occ.date, today).top}&apos;s {occ.focus === 'learning' ? 'session' : 'sit'} -
        where should it go?
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
      <label className="prow-field" style={{ marginBottom: 16 }}>
        <span>Or pick a date</span>
        <input
          id="rs-to"
          type="date"
          value={to}
          onChange={(e) => e.target.value && setTo(e.target.value)}
        />
      </label>

      {to !== occ.date && (
        <div className="move-modes" role="radiogroup" aria-label="What moves">
          <button
            type="button"
            role="radio"
            aria-checked={!pushing}
            className={`move-mode${!pushing ? ' on' : ''}`}
            onClick={() => setPush(false)}
          >
            <span className="move-dot" aria-hidden="true" />
            <span className="grow">
              <span className="move-t">Just this one</span>
              <span className="move-h">Moves to {fmt(to)}. Everything else stays on its day.</span>
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={pushing}
            disabled={!canPush}
            className={`move-mode${pushing ? ' on' : ''}`}
            onClick={() => setPush(true)}
          >
            <span className="move-dot" aria-hidden="true" />
            <span className="grow">
              <span className="move-t">Push the rest too</span>
              <span className="move-h">
                {canPush
                  ? `This and every later ${occ.focus === 'learning' ? 'session' : 'sit'} move ${dayWord} later${
                      end ? ` - the plan then ends ${fmt(addDays(end, days))}` : ''
                    }.`
                  : 'Only when moving it later.'}
              </span>
            </span>
          </button>
        </div>
      )}

      {error && <p className="error-note">{error}</p>}
      <div className="rf-actions">
        <button className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || to === occ.date}
          onClick={() => void move()}
        >
          {pushing ? `Push ${dayWord}` : 'Move it'}
        </button>
      </div>
    </Sheet>
  );
}
