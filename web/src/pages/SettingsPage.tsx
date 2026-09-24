import { useState } from 'react';
import type { AiSettingsDto, ShareLevel } from '@zenport/shared';
import { Link } from 'react-router-dom';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { useAuth } from '../App.tsx';
import { usePrefs, ACCENT_OPTIONS } from '../prefs.tsx';
import { Onboarding } from '../onboarding/Onboarding.tsx';
import { REPO_URL, openWhatsNew } from '../whatsnew/WhatsNew.tsx';
import { playBell } from '../player/bell.ts';
import { Avatar, Icon, Slider, Switch } from '../components/ui.tsx';
import { AiKeyForm } from '../components/AiPlanSheet.tsx';
import { formatBytes, offlineSupported, useOffline } from '../offline.ts';

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

      <ProfileSection
        tzOptions={tzOptions}
        tzSaved={tzSaved}
        onTimezone={(tz) => void setTimezone(tz)}
        onSignOut={() => void signOut()}
      />
      <PreferencesSection />
      <AiSection />
      <OfflineSection />

      <section className="section" aria-labelledby="s-about">
        <div className="section-head">
          <h2 id="s-about">About</h2>
        </div>
        <div className="card settings-card">
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
        </div>
      </section>
    </>
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
  const setSharing = async (enabled: boolean) => {
    await api.put('/api/ai/sharing', { enabled }).catch(() => {});
    ai.reload();
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
                {d.sharing !== undefined && (
                  <SwitchRow
                    title="Everyone here can plan with it"
                    hint="People you invite can use Plan with AI without a key of their own. They never see the key; you pay for their plans."
                    checked={d.sharing}
                    onChange={(v) => void setSharing(v)}
                  />
                )}
              </>
            ) : (
              <>
                {d.sharedBy && !replacing && (
                  <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>
                    You can already plan with AI - {d.sharedBy} shares their key with everyone here.
                    Add your own only if you would rather use it.
                  </p>
                )}
                <AiKeyForm
                  compact
                  onSaved={() => {
                    setReplacing(false);
                    ai.reload();
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

const AVATARS = [
  '🪷',
  '🌿',
  '🌙',
  '☀️',
  '🌊',
  '🍃',
  '🌸',
  '🌻',
  '🌾',
  '🍂',
  '❄️',
  '🔥',
  '🕊️',
  '🦋',
  '🐢',
  '🦉',
  '🐚',
  '🌈',
  '⛰️',
  '🌲',
  '🌵',
  '🍵',
  '🔔',
  '✨',
];

const SHARING: { value: ShareLevel; title: string; hint: string }[] = [
  {
    value: 'full',
    title: 'Everything',
    hint: 'What you sat with or studied, when, your streak - and when you are sitting right now.',
  },
  {
    value: 'summary',
    title: 'Just the numbers',
    hint: 'Minutes, streaks and which days - never titles.',
  },
  { value: 'off', title: 'Nothing', hint: 'Friends see only that you are friends.' },
];

/** You: how friends see you, what they see, your password, and where your days begin. */
function ProfileSection({
  tzOptions,
  tzSaved,
  onTimezone,
  onSignOut,
}: {
  tzOptions: string[];
  tzSaved: boolean;
  onTimezone: (tz: string) => void;
  onSignOut: () => void;
}) {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.displayName ?? '');
  const [saved, setSaved] = useState<string | null>(null);
  const [pwOpen, setPwOpen] = useState(false);
  const flash = (what: string) => {
    setSaved(what);
    window.setTimeout(() => setSaved(null), 2200);
  };
  const patch = async (body: Record<string, unknown>, what: string) => {
    await api.patch('/api/auth/me', body).catch(() => {});
    await refresh();
    flash(what);
  };
  if (!user) return null;
  const shown = user.displayName || user.username;
  return (
    <section className="section" aria-labelledby="s-profile">
      <div className="section-head">
        <h2 id="s-profile">You</h2>
        {saved && <span className="saved-note">{saved} saved</span>}
      </div>
      <div className="set-groups">
        <div className="set-group">
          <div className="profile-head">
            <Avatar name={shown} avatar={user.avatar} id={user.id} size={64} />
            <div className="grow">
              <label htmlFor="pf-name" className="rf-label">
                Your name
              </label>
              <input
                id="pf-name"
                value={name}
                maxLength={40}
                placeholder={user.username}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  if ((user.displayName ?? '') !== name.trim()) {
                    void patch({ displayName: name.trim() || null }, 'Name');
                  }
                }}
              />
              <p className="hint">
                Signed in as @{user.username} · {user.role === 'admin' ? 'admin' : 'member'}
              </p>
            </div>
          </div>
          <div className="set-group-body">
            <div className="rf-label">Your avatar</div>
            <div className="avatar-picker" role="radiogroup" aria-label="Avatar">
              <button
                type="button"
                role="radio"
                aria-checked={!user.avatar}
                className={`avatar-opt initials${!user.avatar ? ' on' : ''}`}
                onClick={() => void patch({ avatar: null }, 'Avatar')}
              >
                Aa
              </button>
              {AVATARS.map((a) => (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={user.avatar === a}
                  aria-label={a}
                  className={`avatar-opt${user.avatar === a ? ' on' : ''}`}
                  onClick={() => void patch({ avatar: a }, 'Avatar')}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
        </div>

        <SetGroup
          icon="friends"
          title="What friends see"
          hint="Only people you are friends with - never anyone else."
        >
          <div className="share-choices" role="radiogroup" aria-label="What friends see">
            {SHARING.map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={user.shareLevel === o.value}
                className={`share-choice${user.shareLevel === o.value ? ' on' : ''}`}
                onClick={() => void patch({ shareLevel: o.value }, 'Sharing')}
              >
                <span className="share-dot" aria-hidden="true" />
                <span className="grow">
                  <span className="share-t">{o.title}</span>
                  <span className="share-h">{o.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </SetGroup>

        <SetGroup icon="key" title="Sign-in" hint="Your password and where your days begin.">
          {pwOpen ? (
            <PasswordForm
              onDone={() => {
                setPwOpen(false);
                flash('Password');
              }}
              onCancel={() => setPwOpen(false)}
            />
          ) : (
            <button className="btn btn-ghost" onClick={() => setPwOpen(true)}>
              Change password
            </button>
          )}
          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="st-tz">
              Timezone (used for streaks and daily stats{tzSaved ? ' - saved' : ''})
            </label>
            <select
              id="st-tz"
              value={user.timezone ?? 'UTC'}
              onChange={(e) => onTimezone(e.target.value)}
            >
              {tzOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-quiet" onClick={onSignOut}>
            Sign out
          </button>
        </SetGroup>
      </div>
    </section>
  );
}

function PasswordForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/password', { current, next });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'that did not work');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="pw-form" onSubmit={(e) => void submit(e)}>
      <div className="field">
        <label htmlFor="pw-cur">Current password</label>
        <input
          id="pw-cur"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="pw-new">New password (10+ characters)</label>
        <input
          id="pw-new"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          minLength={10}
          required
        />
        <p className="hint">Other devices will be signed out; this one stays in.</p>
      </div>
      {error && <p className="error-note">{error}</p>}
      <div className="rf-actions">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </div>
    </form>
  );
}

/** Downloads on this device: a summary and the way to manage them. */
function OfflineSection() {
  const off = useOffline();
  if (!offlineSupported()) return null;
  return (
    <section className="section" aria-labelledby="s-offline">
      <div className="section-head">
        <h2 id="s-offline">Offline</h2>
      </div>
      <Link className="people-link card settings-card" to="/downloads">
        <span className="set-group-ic">
          <Icon name="on-device" size={19} />
        </span>
        <span className="grow">
          <strong>
            {off.records.length === 0
              ? 'No meditations on this device'
              : `${off.records.length} meditation${off.records.length === 1 ? '' : 's'} on this device · ${formatBytes(off.totalBytes)}`}
          </strong>
          <span className="sub">
            Save meditations offline from their page to play them with no connection.
          </span>
        </span>
        <Icon name="chevron-right" size={16} />
      </Link>
    </section>
  );
}
