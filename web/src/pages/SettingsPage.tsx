import { useState } from 'react';
import type { ScanStateDto, UserInfo } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { useAuth } from '../App.tsx';
import { usePrefs, ACCENT_OPTIONS } from '../prefs.tsx';
import { Onboarding } from '../onboarding/Onboarding.tsx';
import { REPO_URL, VersionRow, openWhatsNew } from '../whatsnew/WhatsNew.tsx';
import { playBell } from '../player/bell.ts';
import { ErrorNote, Icon, Sheet } from '../components/ui.tsx';

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
        <p className="lede">
          Everything here is per-account, so a change you make does not follow anyone else in the
          household.
        </p>
      </div>

      <PreferencesSection />

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
              Timezone (used for streaks and daily stats{tzSaved ? ' - saved' : ''})
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

      <section className="section" aria-labelledby="s-about">
        <div className="section-head">
          <h2 id="s-about">About</h2>
        </div>
        <div className="card" style={{ maxWidth: 520 }}>
          <dl className="kv">
            <dt>Version</dt>
            <dd>
              <button
                className="btn btn-sm btn-quiet"
                style={{ padding: 0 }}
                onClick={openWhatsNew}
              >
                v{__ZP_VERSION__} - see what's new
              </button>
            </dd>
            <dt>Source</dt>
            <dd>
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                github.com/ilanKushnir/zenport
              </a>
            </dd>
          </dl>
          <div style={{ marginTop: 12 }}>
            <VersionRow />
          </div>
        </div>
      </section>
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
        Each account has its own plans, history, and journal. Journals are private to their writer -
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
        <label htmlFor="au-pass">Password (10+ characters - share it with them directly)</label>
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

/**
 * The same controls the welcome flow offers, in their permanent home. Each
 * writes through immediately — there is no Save button to forget to press.
 */
function PreferencesSection() {
  const { prefs, save } = usePrefs();
  const [replay, setReplay] = useState(false);
  const GOALS = [5, 10, 15, 20, 30, 45];
  const TIMERS = [3, 5, 10, 15, 20, 30, 45, 60];
  const INTERVALS: (number | null)[] = [null, 3, 5, 10, 15];

  return (
    <section className="section" aria-labelledby="s-prefs">
      <div className="section-head">
        <h2 id="s-prefs">Preferences</h2>
      </div>
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="ob-field" style={{ marginTop: 0 }}>
          <label>Accent</label>
          <div className="accent-row">
            {ACCENT_OPTIONS.map((a) => (
              <button
                key={a.key}
                className={`accent-swatch accent-${a.key}`}
                aria-pressed={prefs.accent === a.key}
                aria-label={`${a.label} - ${a.note}`}
                title={`${a.label} - ${a.note}`}
                onClick={() => void save({ accent: a.key })}
              >
                <span className="sw" />
                <span className="nm">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="ob-field">
          <label>Open ZenPort on</label>
          <div className="chip-row">
            <button
              className="chip"
              aria-pressed={prefs.startPage === 'today'}
              onClick={() => void save({ startPage: 'today' })}
            >
              Today
            </button>
            <button
              className="chip"
              aria-pressed={prefs.startPage === 'library'}
              onClick={() => void save({ startPage: 'library' })}
            >
              Library
            </button>
          </div>
        </div>

        <div className="ob-field">
          <label>Daily target</label>
          <div className="chip-row">
            {GOALS.map((m) => (
              <button
                key={m}
                className="chip"
                aria-pressed={prefs.dailyGoalMinutes === m}
                onClick={() => void save({ dailyGoalMinutes: m })}
              >
                {m}m
              </button>
            ))}
            <button
              className="chip"
              aria-pressed={prefs.dailyGoalMinutes === null}
              onClick={() => void save({ dailyGoalMinutes: null })}
            >
              No target
            </button>
          </div>
        </div>

        <div className="ob-field">
          <label>Default sit length</label>
          <div className="chip-row">
            {TIMERS.map((m) => (
              <button
                key={m}
                className="chip"
                aria-pressed={prefs.defaultTimerMinutes === m}
                onClick={() => void save({ defaultTimerMinutes: m })}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>

        <div className="ob-field">
          <label>Bell along the way</label>
          <div className="chip-row">
            {INTERVALS.map((v) => (
              <button
                key={String(v)}
                className="chip"
                aria-pressed={prefs.intervalBellMinutes === v}
                onClick={() => void save({ intervalBellMinutes: v })}
              >
                {v === null ? 'None' : `Every ${v}m`}
              </button>
            ))}
          </div>
        </div>

        <div className="ob-field">
          <label>Bell</label>
          <div className="chip-row">
            <button
              className="chip"
              aria-pressed={prefs.bellEnabled}
              onClick={() => void save({ bellEnabled: !prefs.bellEnabled })}
            >
              <Icon name="bell" size={15} />
              {prefs.bellEnabled ? 'On' : 'Off'}
            </button>
            <button
              className="chip"
              disabled={!prefs.bellEnabled}
              onClick={() => playBell(prefs.bellVolume)}
            >
              Hear it
            </button>
          </div>
          {prefs.bellEnabled && (
            <input
              className="ob-range"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={prefs.bellVolume}
              aria-label="Bell volume"
              onChange={(e) => void save({ bellVolume: Number(e.target.value) })}
              onMouseUp={() => playBell(prefs.bellVolume)}
            />
          )}
        </div>

        <div className="ob-field">
          <label>Playback</label>
          <div className="chip-row">
            <button
              className="chip"
              aria-pressed={prefs.autoplayNext}
              onClick={() => void save({ autoplayNext: !prefs.autoplayNext })}
            >
              Continue to the next track
            </button>
          </div>
        </div>

        <div className="ob-field">
          <label>Motion and background</label>
          <div className="chip-row">
            <button
              className="chip"
              aria-pressed={!prefs.calmMotion}
              onClick={() => void save({ calmMotion: !prefs.calmMotion })}
            >
              {prefs.calmMotion ? 'Stillness' : 'Gentle motion'}
            </button>
            <button
              className="chip"
              aria-pressed={prefs.ambientBackground}
              onClick={() => void save({ ambientBackground: !prefs.ambientBackground })}
            >
              Ambient background
            </button>
          </div>
          <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 8 }}>
            A system-level “reduce motion” setting is always honoured, whatever is chosen here.
          </p>
        </div>

        <div className="ob-field">
          <label>Welcome tour</label>
          <div className="chip-row">
            <button className="chip" onClick={() => setReplay(true)}>
              Show it again
            </button>
            <span className="hint">
              {prefs.onboardedAt
                ? `First completed ${prefs.onboardedAt.slice(0, 10)}`
                : 'Not yet completed'}
            </span>
          </div>
        </div>
      </div>

      {/*
        Replaying is purely local: onboarded_at is a latch on the server, so
        running the flow again re-offers the settings without rewriting when
        this account actually started.
      */}
      {replay && <Onboarding onDone={() => setReplay(false)} />}
    </section>
  );
}
