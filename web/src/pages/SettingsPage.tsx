import { useState } from 'react';
import type { ScanStateDto, UserInfo } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { useAuth } from '../App.tsx';
import { ErrorNote, Sheet } from '../components/ui.tsx';

const COMMON_TIMEZONES = [
  'UTC',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Madrid',
  'Asia/Jerusalem',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
];

export function SettingsPage() {
  const { user, refresh, signOut } = useAuth();
  const scan = useApi<ScanStateDto>('/api/library/scan-state');
  const [tzSaved, setTzSaved] = useState(false);

  const setTimezone = async (tz: string) => {
    await api.patch('/api/auth/me', { timezone: tz }).catch(() => {});
    await refresh();
    setTzSaved(true);
    setTimeout(() => setTzSaved(false), 2500);
  };

  const browserTz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return null;
    }
  })();
  const tzOptions = [
    ...new Set([user?.timezone, browserTz, ...COMMON_TIMEZONES].filter(Boolean)),
  ] as string[];

  return (
    <>
      <div className="page-head">
        <h1>Settings</h1>
      </div>

      <section className="section" aria-labelledby="s-profile">
        <div className="section-head">
          <h2 id="s-profile">You</h2>
        </div>
        <div className="card" style={{ maxWidth: 520 }}>
          <dl className="kv">
            <dt>Signed in as</dt>
            <dd>
              {user?.username} ({user?.role})
            </dd>
          </dl>
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="st-tz">
              Timezone (used for streaks and daily stats{tzSaved ? ' — saved' : ''})
            </label>
            <select
              id="st-tz"
              value={user?.timezone ?? 'UTC'}
              onChange={(e) => void setTimezone(e.target.value)}
            >
              {tzOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </section>

      <section className="section" aria-labelledby="s-scan">
        <div className="section-head">
          <h2 id="s-scan">Library scan</h2>
        </div>
        {scan.error && <ErrorNote message={scan.error} onRetry={scan.reload} />}
        {scan.data && (
          <div className="card" style={{ maxWidth: 640 }}>
            <dl className="kv">
              <dt>Status</dt>
              <dd>{scan.data.status}</dd>
              <dt>Last finished</dt>
              <dd>
                {scan.data.finishedAt ? new Date(scan.data.finishedAt).toLocaleString() : 'never'}
              </dd>
              <dt>Indexed</dt>
              <dd>
                {scan.data.counts.items} meditations · {scan.data.counts.tracks} tracks ·{' '}
                {scan.data.counts.covers} covers · {scan.data.counts.documents} documents
              </dd>
              <dt>Skipped files</dt>
              <dd>{scan.data.counts.ignored} (hidden, junk, or unsupported)</dd>
              {scan.data.counts.missing > 0 && (
                <>
                  <dt>Missing</dt>
                  <dd>{scan.data.counts.missing} items awaiting their files</dd>
                </>
              )}
            </dl>
            <div style={{ marginTop: 16 }}>
              {scan.data.roots.map((r) => (
                <p key={r.id} style={{ fontSize: 13.5 }}>
                  <span className={`badge ${r.ok ? 'badge-accent' : ''}`}>{r.label}</span>{' '}
                  {r.ok ? 'readable' : (r.note ?? 'not readable')}
                </p>
              ))}
            </div>
            {scan.data.warnings.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>
                  {scan.data.warnings.length} scan note{scan.data.warnings.length > 1 ? 's' : ''}
                </summary>
                <ul style={{ color: 'var(--muted)', fontSize: 13.5 }}>
                  {scan.data.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      {user?.role === 'admin' && <UsersSection />}
    </>
  );
}

function UsersSection() {
  const users = useApi<UserInfo[]>('/api/users');
  const { user: me } = useAuth();
  const [adding, setAdding] = useState(false);

  const remove = async (u: UserInfo) => {
    if (
      !window.confirm(
        `Remove ${u.username}? Their practice history, plans, and journals are deleted with the account.`,
      )
    )
      return;
    await api.del(`/api/users/${u.id}`).catch(() => {});
    users.reload();
  };

  return (
    <section className="section" aria-labelledby="s-users">
      <div className="section-head">
        <h2 id="s-users">Household accounts</h2>
        <button className="btn btn-sm btn-ghost" onClick={() => setAdding(true)}>
          Add account
        </button>
      </div>
      <p style={{ color: 'var(--muted)', fontSize: 13.5, maxWidth: '60ch', marginBottom: 12 }}>
        Each account has its own plans, history, and journal. Journals are private to their writer —
        there is deliberately no admin view into them.
      </p>
      <div className="rowlist" style={{ maxWidth: 640 }}>
        {(users.data ?? []).map((u) => (
          <div className="row" key={u.id}>
            <div className="grow">
              <div>{u.username}</div>
              <div className="sub">
                {u.role} · joined {u.createdAt.slice(0, 10)}
              </div>
            </div>
            {u.id !== me?.id && (
              <button className="btn btn-sm btn-quiet" onClick={() => void remove(u)}>
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      {adding && (
        <AddUserSheet
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            users.reload();
          }}
        />
      )}
    </section>
  );
}

function AddUserSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/users', { username, password });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not create the account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Add an account" onClose={onClose}>
      <div className="field">
        <label htmlFor="au-name">Username</label>
        <input id="au-name" value={username} onChange={(e) => setUsername(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="au-pass">Password (10+ characters — share it with them directly)</label>
        <input
          id="au-pass"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="error-note">{error}</p>}
      <div className="form-actions">
        <button
          className="btn btn-primary"
          disabled={busy || username.length < 2 || password.length < 10}
          onClick={() => void save()}
        >
          Create account
        </button>
      </div>
    </Sheet>
  );
}
