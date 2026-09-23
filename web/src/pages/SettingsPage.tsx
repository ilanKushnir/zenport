import { useState } from 'react';
import type { AiSettingsDto, ScanStateDto, UserInfo } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { useAuth } from '../App.tsx';
import { usePrefs, ACCENT_OPTIONS } from '../prefs.tsx';
import { Onboarding } from '../onboarding/Onboarding.tsx';
import { REPO_URL, VersionRow, openWhatsNew } from '../whatsnew/WhatsNew.tsx';
import { playBell } from '../player/bell.ts';
import { ErrorNote, Icon, Sheet, Slider, Switch } from '../components/ui.tsx';
import { AiKeyForm } from '../components/AiPlanSheet.tsx';

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
      <AiSection />

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
function SetGroup({
  icon,
  title,
  hint,
  children,
}: {
  icon: string;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="set-group">
      <header className="set-group-head">
        <span className="set-group-ic">
          <Icon name={icon} size={19} />
        </span>
        <div>
          <h3>{title}</h3>
          <p>{hint}</p>
        </div>
      </header>
      <div className="set-group-body">{children}</div>
    </div>
  );
}

function SwitchRow({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="set-switch">
      <div>
        <div className="set-switch-t">{title}</div>
        <div className="set-switch-h">{hint}</div>
      </div>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

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
      <div className="set-groups">
        <SetGroup
          icon="sparkle"
          title="Look and feel"
          hint="Colour, movement and where the app opens."
        >
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
          <SwitchRow
            title="Gentle motion"
            hint="Soft drifting and breathing animations. Your system's reduce-motion setting always wins."
            checked={!prefs.calmMotion}
            onChange={(v) => void save({ calmMotion: !v })}
          />
          <SwitchRow
            title="Ambient background"
            hint="The slow aurora behind every page."
            checked={prefs.ambientBackground}
            onChange={(v) => void save({ ambientBackground: v })}
          />
        </SetGroup>

        <SetGroup icon="timer" title="Practice" hint="Your daily rhythm and the silent timer.">
          <div className="ob-field" style={{ marginTop: 0 }}>
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
        </SetGroup>

        <SetGroup
          icon="bell"
          title="Sound and playback"
          hint="The bowl, and how recordings run on."
        >
          <SwitchRow
            title="Bell"
            hint="A struck bowl to open and close a sit."
            checked={prefs.bellEnabled}
            onChange={(v) => void save({ bellEnabled: v })}
          />
          {prefs.bellEnabled && (
            <div className="set-volume">
              <Icon name="volume-low" size={18} />
              <Slider
                value={prefs.bellVolume}
                max={1}
                step={0.05}
                label="Bell volume"
                valueText={`${Math.round(prefs.bellVolume * 100)}%`}
                onCommit={(v) => {
                  void save({ bellVolume: v });
                  playBell(v);
                }}
              />
              <Icon name="volume" size={18} />
              <button className="btn btn-sm btn-quiet" onClick={() => playBell(prefs.bellVolume)}>
                Hear it
              </button>
            </div>
          )}
          <SwitchRow
            title="Continue to the next track"
            hint="Multi-part meditations roll on by themselves."
            checked={prefs.autoplayNext}
            onChange={(v) => void save({ autoplayNext: v })}
          />
        </SetGroup>

        <div className="set-tour">
          <div>
            <div className="set-switch-t">Welcome tour</div>
            <div className="set-switch-h">
              {prefs.onboardedAt
                ? `First completed ${prefs.onboardedAt.slice(0, 10)}`
                : 'Not yet completed'}
            </div>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={() => setReplay(true)}>
            Show it again
          </button>
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

/** An account's own AI key: add, see that it is set, choose a model, remove. */
function AiSection() {
  const ai = useApi<AiSettingsDto>('/api/ai/settings');
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const d = ai.data;
  const setModel = async (model: string) => {
    setBusy(true);
    await api.put('/api/ai/settings', { model }).catch(() => {});
    ai.reload();
    setBusy(false);
  };
  const remove = async () => {
    if (!window.confirm('Remove your OpenAI key from ZenPort?')) return;
    await api.del('/api/ai/settings').catch(() => {});
    ai.reload();
  };
  return (
    <section className="section" aria-labelledby="s-ai">
      <div className="section-head">
        <h2 id="s-ai">AI planning</h2>
      </div>
      <div className="set-groups">
        <div className="set-group">
          <header className="set-group-head">
            <span className="set-group-ic">
              <Icon name="sparkle" size={19} />
            </span>
            <div>
              <h3>Your OpenAI key</h3>
              <p>Lets ZenPort read your library and draft plans around your time.</p>
            </div>
          </header>
          <div className="set-group-body">
            {!d ? (
              <div className="skeleton" style={{ height: 44 }} />
            ) : d.configured && !replacing ? (
              <>
                <div className="set-switch" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
                  <div>
                    <div className="set-switch-t">Key saved {d.keyHint}</div>
                    <div className="set-switch-h">
                      Encrypted on this server; never shown or sent to the browser.
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm btn-quiet" onClick={() => setReplacing(true)}>
                      Replace
                    </button>
                    <button className="btn btn-sm btn-quiet" onClick={() => void remove()}>
                      Remove
                    </button>
                  </div>
                </div>
                <div className="field" style={{ marginTop: 12 }}>
                  <label htmlFor="ai-model">Model</label>
                  <select
                    id="ai-model"
                    value={d.model ?? ''}
                    disabled={busy}
                    onChange={(e) => void setModel(e.target.value)}
                  >
                    {(d.models.length ? d.models : [d.model ?? '']).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <p className="hint" style={{ marginTop: 6 }}>
                    The first in the list is the recommended one. Plans open from Plans → Plan with
                    AI.
                  </p>
                </div>
              </>
            ) : (
              <AiKeyForm
                compact
                onSaved={() => {
                  setReplacing(false);
                  ai.reload();
                }}
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
