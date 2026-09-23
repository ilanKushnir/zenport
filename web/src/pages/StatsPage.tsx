import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { PracticeSessionDto, StatsDto } from '@zenport/shared';
import { formatDuration } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { EmptyState, ErrorNote, Sheet } from '../components/ui.tsx';

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

function History() {
  const history = useApi<PracticeSessionDto[]>('/api/practice/history');
  const [editing, setEditing] = useState<PracticeSessionDto | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, PracticeSessionDto[]>();
    for (const s of history.data ?? []) {
      const day = s.startedAt.slice(0, 10);
      map.set(day, [...(map.get(day) ?? []), s]);
    }
    return [...map.entries()];
  }, [history.data]);

  if (history.loading) return <div className="skeleton" style={{ height: 200 }} />;
  if (history.error) return <ErrorNote message={history.error} onRetry={history.reload} />;
  if ((history.data ?? []).length === 0) {
    return (
      <EmptyState title="No sessions yet">
        Your practice history will collect here, day by day.
      </EmptyState>
    );
  }

  return (
    <>
      {grouped.map(([day, sessions]) => (
        <div className="timeline-day" key={day}>
          <div className="timeline-date">
            <strong>
              {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
                weekday: 'short',
              })}
            </strong>
            {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            })}
          </div>
          <div>
            {sessions.map((s) => (
              <div
                className="occ"
                key={s.id}
                data-status={s.status === 'completed' ? 'completed' : 'skipped'}
              >
                <span className="dot" aria-hidden="true" />
                <span className="occ-name">
                  <Link to={`/m/${s.meditationId}`}>{s.meditationTitle}</Link>
                </span>
                <span className="badge">
                  {formatDuration(s.listenedSec)} · {s.status}
                </span>
                <div className="occ-actions">
                  <button className="btn btn-sm btn-quiet" onClick={() => setEditing(s)}>
                    Correct
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
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
  const remove = async () => {
    if (!window.confirm('Delete this session record? Statistics will recalculate without it.'))
      return;
    setBusy(true);
    await api.del(`/api/practice/${session.id}`).catch(() => {});
    onSaved();
  };

  return (
    <Sheet title="Correct this session" onClose={onClose}>
      <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
        {session.meditationTitle} · {session.startedAt.slice(0, 16).replace('T', ' ')}
      </p>
      <div className="field">
        <label htmlFor="cs-min">Minutes practiced</label>
        <input
          id="cs-min"
          type="number"
          min={0}
          max={1440}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
        />
      </div>
      <div className="form-actions" style={{ justifyContent: 'space-between' }}>
        <button className="btn btn-danger" disabled={busy} onClick={() => void remove()}>
          Delete record
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>
          Save correction
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
