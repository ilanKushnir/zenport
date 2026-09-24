import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PracticeSessionDto, StatsDto } from '@zenport/shared';
import { formatDuration } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { EmptyState, ErrorNote, Icon, Sheet } from '../components/ui.tsx';
import { useAuth } from '../App.tsx';

export function StatsPage() {
  const [tab, setTab] = useState<'overview' | 'history'>('overview');
  return (
    <>
      <div className="page-head">
        <h1>Practice</h1>
        <p className="lede">
          Everything here comes from your own recorded sessions - nothing is estimated or invented.
        </p>
      </div>
      <div className="toolbar" role="tablist" aria-label="Practice views">
        <button
          className="chip"
          role="tab"
          aria-selected={tab === 'overview'}
          aria-pressed={tab === 'overview'}
          onClick={() => setTab('overview')}
        >
          Overview
        </button>
        <button
          className="chip"
          role="tab"
          aria-selected={tab === 'history'}
          aria-pressed={tab === 'history'}
          onClick={() => setTab('history')}
        >
          History
        </button>
      </div>
      {tab === 'overview' ? <Overview /> : <History />}
    </>
  );
}

function Delta({ current, previous, unit }: { current: number; previous: number; unit: string }) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return <div className="d">new this period</div>;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <div className="d">same as your last period</div>;
  return (
    <div className="d" style={{ color: pct > 0 ? 'var(--ok)' : 'var(--muted)' }}>
      {pct > 0 ? '+' : ''}
      {pct}% vs your previous {unit}
    </div>
  );
}

function Overview() {
  const stats = useApi<StatsDto>('/api/stats');
  if (stats.loading) return <div className="skeleton" style={{ height: 220 }} />;
  if (stats.error || !stats.data) {
    return <ErrorNote message={stats.error ?? 'failed'} onRetry={stats.reload} />;
  }
  const s = stats.data;

  if (s.totalSessions === 0) {
    return (
      <EmptyState
        title="No practice recorded yet"
        action={
          <Link className="btn btn-primary" to="/">
            Choose a meditation
          </Link>
        }
      >
        Once you sit with something from your library, minutes, streaks, and trends grow from the
        real sessions - never from made-up numbers.
      </EmptyState>
    );
  }

  const maxWeek = Math.max(1, ...s.weekTrend.map((b) => b.minutes));
  const maxMonth = Math.max(1, ...s.monthTrend.map((b) => b.minutes));
  const maxCreator = Math.max(1, ...s.creatorMix.map((m) => m.minutes));
  const maxMed = Math.max(1, ...s.meditationMix.map((m) => m.minutes));

  return (
    <>
      <div className="stat-tiles">
        <div className="stat-tile">
          <div className="v">{formatDuration(s.totalMinutes * 60)}</div>
          <div className="l">practiced in total</div>
          <Delta
            current={s.comparison.current.minutes}
            previous={s.comparison.previous.minutes}
            unit="30 days"
          />
        </div>
        <div className="stat-tile">
          <div className="v">{s.totalSessions}</div>
          <div className="l">sessions ({s.completedSessions} completed)</div>
          <Delta
            current={s.comparison.current.sessions}
            previous={s.comparison.previous.sessions}
            unit="30 days"
          />
        </div>
        <div className="stat-tile">
          <div className="v">{s.currentStreak}</div>
          <div className="l">day streak right now</div>
        </div>
        <div className="stat-tile">
          <div className="v">{s.longestStreak}</div>
          <div className="l">longest streak</div>
        </div>
      </div>

      {(s.learning.sessions > 0 || s.learning.lessonsCompleted > 0) && (
        <section className="section" aria-labelledby="s-learning">
          <div className="section-head">
            <h2 id="s-learning">Learning</h2>
            <span className="section-note">Courses and talks - counted apart from practice</span>
          </div>
          <div className="stat-tiles learn-tiles">
            <div className="stat-tile">
              <div className="v">{formatMinutes(s.learning.totalMinutes)}</div>
              <div className="l">spent learning</div>
            </div>
            <div className="stat-tile">
              <div className="v">{s.learning.lessonsCompleted}</div>
              <div className="l">lessons finished</div>
            </div>
            <div className="stat-tile">
              <div className="v">{s.learning.sessions}</div>
              <div className="l">study sessions</div>
            </div>
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="s-week">
        <div className="section-head">
          <h2 id="s-week">This week</h2>
        </div>
        <div className="card">
          <div className="bars" role="img" aria-label={weekSummary(s)}>
            {s.weekTrend.map((b) => (
              <div className={`bar${b.minutes === 0 ? ' is-zero' : ''}`} key={b.bucket}>
                <div
                  className="fill"
                  style={{ height: `${Math.max(3, (b.minutes / maxWeek) * 100)}%` }}
                />
                <span className="lbl">
                  {new Date(`${b.bucket}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: 'narrow',
                  })}
                </span>
              </div>
            ))}
          </div>
          <p className="visually-hidden">{weekSummary(s)}</p>
        </div>
      </section>

      <section className="section" aria-labelledby="s-12w">
        <div className="section-head">
          <h2 id="s-12w">Twelve weeks</h2>
        </div>
        <div className="card">
          <div className="bars" role="img" aria-label={monthSummary(s)}>
            {s.monthTrend.map((b) => (
              <div className={`bar${b.minutes === 0 ? ' is-zero' : ''}`} key={b.bucket}>
                <div
                  className="fill"
                  style={{
                    height: `${Math.max(3, (b.minutes / maxMonth) * 100)}%`,
                    background: 'var(--lavender)',
                  }}
                />
                <span className="lbl">{b.bucket.slice(5)}</span>
              </div>
            ))}
          </div>
          <p className="visually-hidden">{monthSummary(s)}</p>
        </div>
      </section>

      <div className="detail-grid" style={{ gridTemplateColumns: '1fr', gap: 0 }}>
        {s.creatorMix.length > 0 && (
          <section className="section" aria-labelledby="s-creators">
            <div className="section-head">
              <h2 id="s-creators">Who you practice with</h2>
            </div>
            <div className="card">
              {s.creatorMix.map((m) => (
                <div className="mix-row" key={m.name}>
                  <span className="name">{m.name || 'Unknown creator'}</span>
                  <div className="track">
                    <span style={{ width: `${(m.minutes / maxCreator) * 100}%` }} />
                  </div>
                  <span className="val">{formatDuration(m.minutes * 60)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        {s.meditationMix.length > 0 && (
          <section className="section" aria-labelledby="s-meds">
            <div className="section-head">
              <h2 id="s-meds">What you return to</h2>
            </div>
            <div className="card">
              {s.meditationMix.map((m) => (
                <div className="mix-row" key={m.name}>
                  <span className="name">{m.name}</span>
                  <div className="track">
                    <span
                      style={{
                        width: `${(m.minutes / maxMed) * 100}%`,
                        background: 'var(--copper)',
                      }}
                    />
                  </div>
                  <span className="val">{formatDuration(m.minutes * 60)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <p style={{ color: 'var(--faint)', fontSize: 12.5, maxWidth: '60ch' }}>
        {s.dayBoundaryRule} Timezone: {s.timezone} (change it in Settings).
      </p>
    </>
  );
}

function weekSummary(s: StatsDto): string {
  const total = s.weekTrend.reduce((a, b) => a + b.minutes, 0);
  const days = s.weekTrend.filter((b) => b.sessions > 0).length;
  return `Last 7 days: ${total} minutes across ${days} practice day${days === 1 ? '' : 's'}.`;
}

function monthSummary(s: StatsDto): string {
  const total = s.monthTrend.reduce((a, b) => a + b.minutes, 0);
  return `Last 12 weeks: ${total} minutes in total.`;
}

/** The calendar day a moment falls on, in the person's own timezone. */
function dayKey(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function dayLabel(day: string, tz: string): string {
  const today = dayKey(new Date().toISOString(), tz);
  const yesterday = dayKey(new Date(Date.now() - 86_400_000).toISOString(), tz);
  if (day === today) return 'Today';
  if (day === yesterday) return 'Yesterday';
  return new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

/** "Today" and "Yesterday" mid-sentence; a date stays as it is. */
const inSentence = (label: string) =>
  label === 'Today' || label === 'Yesterday' ? label.toLowerCase() : label;

function timeOf(iso: string, tz: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: tz,
    });
  } catch {
    return iso.slice(11, 16);
  }
}

type Ask =
  | { kind: 'day'; day: string; sessions: PracticeSessionDto[] }
  | { kind: 'one'; session: PracticeSessionDto };

/**
 * Practice history, a card per day. A day can be cleared whole, a sit
 * removed or its minutes corrected - always after a plain question, and the
 * statistics follow. Journal entries written after a sit are kept.
 */
function History() {
  const history = useApi<PracticeSessionDto[]>('/api/practice/history');
  const { user } = useAuth();
  const tz = user?.timezone || 'UTC';
  const [editing, setEditing] = useState<PracticeSessionDto | null>(null);
  const [asking, setAsking] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, PracticeSessionDto[]>();
    for (const s of history.data ?? []) {
      if (s.status === 'active') continue;
      const day = dayKey(s.startedAt, tz);
      map.set(day, [...(map.get(day) ?? []), s]);
    }
    return [...map.entries()];
  }, [history.data, tz]);

  if (history.loading) return <div className="skeleton" style={{ height: 200 }} />;
  if (history.error) return <ErrorNote message={history.error} onRetry={history.reload} />;
  if (grouped.length === 0) {
    return (
      <EmptyState title="No sessions yet">
        Your practice history will collect here, day by day.
      </EmptyState>
    );
  }

  const remove = async (ids: number[]) => {
    setBusy(true);
    try {
      await api.post('/api/practice/remove', { ids });
      window.dispatchEvent(new Event('zenport:progress'));
      history.reload();
      setAsking(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="hist">
        {grouped.map(([day, sessions]) => {
          const minutes = sessions.reduce((n, s) => n + s.listenedSec, 0) / 60;
          return (
            <section className="hist-day" key={day} aria-label={dayLabel(day, tz)}>
              <header className="hist-day-head">
                <div className="grow">
                  <h3>{dayLabel(day, tz)}</h3>
                  <span className="sub">
                    {formatMinutes(minutes)} · {sessions.length}{' '}
                    {sessions.length === 1 ? 'session' : 'sessions'}
                  </span>
                </div>
                <button
                  className="btn btn-sm btn-quiet hist-clear"
                  onClick={() => setAsking({ kind: 'day', day, sessions })}
                >
                  <Icon name="trash" size={14} /> Clear day
                </button>
              </header>
              <ul className="hist-list">
                {sessions.map((s) => (
                  <li className="hist-row" key={s.id}>
                    <span
                      className={`hist-dot${s.status === 'completed' ? ' done' : ''}`}
                      aria-hidden="true"
                    />
                    <span className="grow">
                      <Link className="hist-title" to={`/m/${s.meditationId}`}>
                        {s.meditationTitle}
                      </Link>
                      <span className="sub">
                        {timeOf(s.startedAt, tz)} · {formatDuration(s.listenedSec)} ·{' '}
                        {s.status === 'completed' ? 'finished' : 'ended early'}
                      </span>
                    </span>
                    <button
                      className="icon-btn hist-act"
                      aria-label={`Correct the minutes of ${s.meditationTitle}`}
                      title="Correct the minutes"
                      onClick={() => setEditing(s)}
                    >
                      <Icon name="pencil" size={16} />
                    </button>
                    <button
                      className="icon-btn hist-act"
                      aria-label={`Remove ${s.meditationTitle} from your history`}
                      title="Remove from history"
                      onClick={() => setAsking({ kind: 'one', session: s })}
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {asking && (
        <Sheet
          title={
            asking.kind === 'day'
              ? `Clear ${inSentence(dayLabel(asking.day, tz))}?`
              : 'Remove this session?'
          }
          onClose={() => !busy && setAsking(null)}
          labelId="hist-ask"
        >
          <div className="forget">
            <p>
              {asking.kind === 'day'
                ? `${asking.sessions.length} ${asking.sessions.length === 1 ? 'session' : 'sessions'} (${formatMinutes(asking.sessions.reduce((n, s) => n + s.listenedSec, 0) / 60)}) leave your history. Your streaks, totals and charts are counted again without them.`
                : `${asking.session.meditationTitle} at ${timeOf(asking.session.startedAt, tz)} (${formatDuration(asking.session.listenedSec)}) leaves your history. Your streaks, totals and charts are counted again without it.`}
            </p>
            <p>Anything you wrote in your journal afterwards stays.</p>
            <div className="forget-actions">
              <button className="btn btn-primary" onClick={() => setAsking(null)} disabled={busy}>
                Keep
              </button>
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={() =>
                  void remove(
                    asking.kind === 'day' ? asking.sessions.map((s) => s.id) : [asking.session.id],
                  )
                }
              >
                {busy ? 'Removing…' : asking.kind === 'day' ? 'Clear the day' : 'Remove'}
              </button>
            </div>
          </div>
        </Sheet>
      )}
      {editing && (
        <CorrectSessionSheet
          session={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            history.reload();
          }}
        />
      )}
    </>
  );
}

function CorrectSessionSheet({
  session,
  onClose,
  onSaved,
}: {
  session: PracticeSessionDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [minutes, setMinutes] = useState(String(Math.round(session.listenedSec / 60)));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    await api
      .patch(`/api/practice/${session.id}`, { listenedSec: Math.max(0, Number(minutes)) * 60 })
      .catch(() => {});
    onSaved();
  };

  return (
    <Sheet title="Correct the minutes" onClose={onClose}>
      <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
        {session.meditationTitle} · {session.startedAt.slice(0, 16).replace('T', ' ')}
      </p>
      <div className="field">
        <label htmlFor="cs-min">Minutes practised</label>
        <input
          id="cs-min"
          type="number"
          min={0}
          max={1440}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
      </div>
      <div className="form-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          Save
        </button>
      </div>
    </Sheet>
  );
}

function formatMinutes(m: number): string {
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
}
