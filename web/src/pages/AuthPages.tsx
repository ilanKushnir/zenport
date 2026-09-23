import { useState, type FormEvent } from 'react';
import type { JoinInfoDto, SetupStatusDto } from '@zenport/shared';
import { api, ApiError } from '../api.ts';
import { useApi } from '../hooks.ts';
import { Lockup } from '../components/Brand.tsx';

function guessTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

export function SetupPage({ onDone }: { onDone: () => void }) {
  // The status endpoint says up front whether this unclaimed instance is
  // locked behind ZP_SETUP_TOKEN (it never reveals the token itself).
  const status = useApi<SetupStatusDto>('/api/setup/status');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [needsToken, setNeedsToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tokenRequired = needsToken || (status.data?.setupTokenRequired ?? false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/setup', {
        username,
        password,
        setupToken: setupToken || undefined,
        timezone: guessTimezone(),
      });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.message.includes('token')) setNeedsToken(true);
      setError(err instanceof Error ? err.message : 'setup failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <Lockup size={32} />
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Welcome. Let’s make this yours.</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
          Create the one admin account for this server. There is no public signup and no default
          password - this door only opens once.
        </p>
        <form onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="su-name">Username</label>
            <input
              id="su-name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              minLength={2}
            />
          </div>
          <div className="field">
            <label htmlFor="su-pass">Password (10+ characters)</label>
            <input
              id="su-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={10}
            />
          </div>
          {(tokenRequired || setupToken) && (
            <div className="field">
              <label htmlFor="su-token">Setup token (set by your server’s ZP_SETUP_TOKEN)</label>
              <input
                id="su-token"
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
              />
            </div>
          )}
          {error && <p className="error-note">{error}</p>}
          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Creating…' : 'Create admin account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function LoginPage({ onDone }: { onDone: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/auth/login', { username, password });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card card">
        <Lockup size={32} />
        <h1 style={{ fontSize: 22, marginBottom: 24 }}>Welcome back.</h1>
        <form onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label htmlFor="li-name">Username</label>
            <input
              id="li-name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="li-pass">Password</label>
            <input
              id="li-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="error-note">{error}</p>}
          <div className="form-actions">
            <button className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * The page behind an invitation link: who invited you, then a name, a
 * username and a password - and you are in. A reset link asks only for the
 * new password. Someone already signed in is asked to sign out first, so an
 * invitation never quietly lands on the wrong account.
 */
export function JoinPage({
  token,
  signedInAs,
  onSignOut,
  onDone,
}: {
  token: string;
  signedInAs: string | null;
  onSignOut: () => void;
  onDone: () => void;
}) {
  const info = useApi<JoinInfoDto>(signedInAs ? null : `/api/join/${encodeURIComponent(token)}`);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(
        `/api/join/${encodeURIComponent(token)}`,
        info.data?.kind === 'reset'
          ? { password }
          : { username: username.trim(), password, displayName, timezone: guessTimezone() },
      );
      window.history.replaceState(null, '', '/');
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'that did not work');
    } finally {
      setBusy(false);
    }
  };

  if (signedInAs) {
    return (
      <div className="auth-page">
        <div className="auth-card card">
          <Lockup size={32} />
          <h1 style={{ fontSize: 22, marginBottom: 8 }}>This link is for someone new.</h1>
          <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
            You are signed in as {signedInAs}. To use this invitation, sign out first - or go back
            to your practice.
          </p>
          <div className="form-actions" style={{ display: 'grid', gap: 8 }}>
            <button className="btn btn-primary" onClick={onSignOut}>
              Sign out and continue
            </button>
            <a className="btn btn-ghost" href="/">
              Back to ZenPort
            </a>
          </div>
        </div>
      </div>
    );
  }

  const reset = info.data?.kind === 'reset';
  return (
    <div className="auth-page">
      <div className="auth-card card join-card">
        <Lockup size={32} />
        {info.loading ? (
          <div className="skeleton" style={{ height: 180, marginTop: 20 }} />
        ) : info.error || !info.data ? (
          <>
            <h1 style={{ fontSize: 22, marginBottom: 8 }}>This link has rested.</h1>
            <p style={{ color: 'var(--muted)' }}>
              {info.error ?? 'It has expired or was already used.'} Ask whoever sent it for a fresh
              one.
            </p>
          </>
        ) : (
          <>
            <img className="join-art" src="/art/ob-friends.webp" alt="" width={200} height={200} />
            <h1 style={{ fontSize: 22, marginBottom: 8 }}>
              {reset
                ? `A new password for ${info.data.username}`
                : `${info.data.invitedBy} invited you to ZenPort`}
            </h1>
            <p style={{ color: 'var(--muted)', marginBottom: 22 }}>
              {reset
                ? 'Choose a new one. Every device signed in with the old password will be signed out.'
                : 'A quiet place to practise, learn and keep each other company. Pick how you will appear, and a password.'}
            </p>
            <form onSubmit={(e) => void submit(e)}>
              {!reset && (
                <>
                  <div className="field">
                    <label htmlFor="jn-display">Your name</label>
                    <input
                      id="jn-display"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      autoComplete="name"
                      maxLength={40}
                      placeholder="How friends will see you"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="jn-user">Username</label>
                    <input
                      id="jn-user"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
                      autoComplete="username"
                      autoCapitalize="none"
                      required
                      minLength={2}
                      maxLength={60}
                    />
                    <p className="hint">For signing in. Letters, numbers, dots and dashes.</p>
                  </div>
                </>
              )}
              <div className="field">
                <label htmlFor="jn-pass">
                  {reset ? 'New password' : 'Password'} (10+ characters)
                </label>
                <div className="pw-field">
                  <input
                    id="jn-pass"
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={10}
                  />
                  <button
                    type="button"
                    className="pw-toggle"
                    onClick={() => setShow(!show)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              {error && <p className="error-note">{error}</p>}
              <div className="form-actions">
                <button className="btn btn-primary" disabled={busy} style={{ width: '100%' }}>
                  {busy ? 'One moment…' : reset ? 'Set the new password' : 'Join ZenPort'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
