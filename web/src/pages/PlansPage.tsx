import { useMemo, useState } from 'react';
import type { LibraryDto, PlanDto, PlanOccurrenceDto } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { EmptyState, ErrorNote, Icon, Sheet } from '../components/ui.tsx';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function humanDate(date: string, today: string): { top: string; bottom: string } {
  const d = new Date(`${date}T00:00:00`);
  const label = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' });
  if (date === today) return { top: 'Today', bottom: label };
  const diff = Math.round((d.getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000);
  if (diff === 1) return { top: 'Tomorrow', bottom: label };
  if (diff === -1) return { top: 'Yesterday', bottom: label };
  return { top: weekday, bottom: label };
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

  const byDate = useMemo(() => {
    const map = new Map<string, PlanOccurrenceDto[]>();
    for (const o of occ.data?.occurrences ?? []) {
      if (o.movedTo) continue; // shown at the destination date instead
      map.set(o.date, [...(map.get(o.date) ?? []), o]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
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

  const today = occ.data?.today ?? '';
  const activePlans = (plans.data ?? []).filter((p) => p.status === 'active');
  const restingPlans = (plans.data ?? []).filter((p) => p.status !== 'active');

  return (
    <>
      <div
        className="page-head"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1>Plans</h1>
          <p className="lede">
            A gentle rhythm, not a debt. Missed days are information, not failure.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          <Icon name="plus" /> New plan
        </button>
      </div>

      {(plans.data ?? []).length === 0 ? (
        <EmptyState
          title="No plans yet"
          action={
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              Plan your first stretch
            </button>
          }
        >
          Pick a meditation, choose the days, and ZenPort will lay out the path ahead.
        </EmptyState>
      ) : (
        <>
          <section className="section" aria-labelledby="sec-timeline">
            <div className="section-head">
              <h2 id="sec-timeline">The next three weeks</h2>
            </div>
            {byDate.length === 0 ? (
              <EmptyState title="Nothing scheduled in this window">
                Your plans exist but have no upcoming days here — check their dates or cadence.
              </EmptyState>
            ) : (
              <div>
                {byDate.map(([date, list]) => {
                  const h = humanDate(date, today);
                  return (
                    <div className={`timeline-day${date === today ? ' is-today' : ''}`} key={date}>
                      <div className="timeline-date">
                        <strong>{h.top}</strong>
                        {h.bottom}
                      </div>
                      <div>
                        {list.map((o) => (
                          <div className="occ" data-status={o.status} key={`${o.planId}-${o.date}`}>
                            <span className="dot" aria-hidden="true" />
                            <span className="occ-name">
                              {o.planName}
                              {o.movedFrom && (
                                <span style={{ color: 'var(--faint)', fontSize: 12 }}>
                                  {' '}
                                  (moved from {o.movedFrom.slice(5)})
                                </span>
                              )}
                            </span>
                            <span className="badge">{o.status}</span>
                            <div className="occ-actions">
                              {(o.status === 'today' ||
                                o.status === 'missed' ||
                                o.status === 'upcoming') && (
                                <>
                                  <button
                                    className="btn btn-sm btn-quiet"
                                    onClick={() => void act(o, 'complete')}
                                    title="Mark complete"
                                  >
                                    <Icon name="check" size={15} /> Done
                                  </button>
                                  <button
                                    className="btn btn-sm btn-quiet"
                                    onClick={() => void act(o, 'skip')}
                                  >
                                    Skip
                                  </button>
                                  <button
                                    className="btn btn-sm btn-quiet"
                                    onClick={() => setRescheduling(o)}
                                  >
                                    Move
                                  </button>
                                </>
                              )}
                              {(o.status === 'completed' || o.status === 'skipped') && (
                                <button
                                  className="btn btn-sm btn-quiet"
                                  onClick={() => void act(o, 'unmark')}
                                  title="Undo this mark"
                                >
                                  Undo
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="section" aria-labelledby="sec-plans">
            <div className="section-head">
              <h2 id="sec-plans">Your plans</h2>
            </div>
            <div className="rowlist">
              {[...activePlans, ...restingPlans].map((p) => (
                <div className="row" key={p.id}>
                  <div className="grow">
                    <div>
                      {p.name} {p.status !== 'active' && <span className="badge">{p.status}</span>}
                    </div>
                    <div className="sub">
                      {p.daysOfWeek.length === 0
                        ? 'Every day'
                        : p.daysOfWeek.map((d) => DOW[d]).join(', ')}
                      {' · '}
                      {p.startDate}
                      {p.endDate ? ` → ${p.endDate}` : ' onward'}
                      {p.targetMinutes ? ` · ${p.targetMinutes} min` : ''}
                      {p.intention ? ` · “${p.intention}”` : ''}
                    </div>
                  </div>
                  <button className="btn btn-sm btn-ghost" onClick={() => setEditing(p)}>
                    Edit
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {editing && (
        <PlanSheet
          plan={editing === 'new' ? null : editing}
          library={lib.data ?? null}
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

function PlanSheet({
  plan,
  library,
  onClose,
  onSaved,
}: {
  plan: PlanDto | null;
  library: LibraryDto | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState(plan?.name ?? '');
  const [intention, setIntention] = useState(plan?.intention ?? '');
  const [startDate, setStartDate] = useState(plan?.startDate ?? today);
  const [endDate, setEndDate] = useState(plan?.endDate ?? '');
  const [days, setDays] = useState<number[]>(plan?.daysOfWeek ?? []);
  const [time, setTime] = useState(plan?.preferredTime ?? '');
  const [target, setTarget] = useState(plan?.targetMinutes ? String(plan.targetMinutes) : '');
  const [notes, setNotes] = useState(plan?.notes ?? '');
  const [meds, setMeds] = useState<string[]>(plan?.meditationIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

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
      targetMinutes: target ? Number(target) : null,
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

  const items = (library?.items ?? []).filter((i) => !i.missing);

  return (
    <Sheet title={plan ? 'Edit plan' : 'New plan'} onClose={onClose}>
      <div className="field">
        <label htmlFor="pl-name">Name</label>
        <input id="pl-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="pl-int">Intention (shows during focused practice)</label>
        <input
          id="pl-int"
          value={intention}
          onChange={(e) => setIntention(e.target.value)}
          placeholder="e.g. Meet the morning before the morning meets me"
        />
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
          <label htmlFor="pl-end">Ends (optional)</label>
          <input
            id="pl-end"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <span className="visually-hidden" id="pl-days-label">
          Practice days
        </span>
        <label aria-hidden="true">Days (none selected = every day)</label>
        <div
          style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
          role="group"
          aria-labelledby="pl-days-label"
        >
          {DOW.map((d, i) => (
            <button
              key={d}
              type="button"
              className="chip"
              aria-pressed={days.includes(i)}
              onClick={() => toggleDay(i)}
            >
              {d}
            </button>
          ))}
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="pl-time">Preferred time (optional)</label>
          <input id="pl-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pl-target">Target minutes (optional)</label>
          <input
            id="pl-target"
            type="number"
            min={1}
            max={600}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="pl-meds">Meditations in this plan</label>
        <select
          id="pl-meds"
          multiple
          size={Math.min(6, Math.max(3, items.length))}
          value={meds}
          onChange={(e) => setMeds([...e.target.selectedOptions].map((o) => o.value))}
        >
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.creator} — {i.title}
            </option>
          ))}
        </select>
        <p style={{ fontSize: 12, color: 'var(--faint)', marginTop: 4 }}>
          Optional — a plan can also just hold the habit. (Ctrl/Cmd-click for several.)
        </p>
      </div>
      <div className="field">
        <label htmlFor="pl-notes">Notes (optional)</label>
        <textarea id="pl-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {error && <p className="error-note">{error}</p>}
      <div className="form-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
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
  onClose,
  onSaved,
}: {
  occ: PlanOccurrenceDto;
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
  return (
    <Sheet title={`Move ${occ.planName}`} onClose={onClose}>
      <div className="field">
        <label htmlFor="rs-to">Move the {occ.date} practice to</label>
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
