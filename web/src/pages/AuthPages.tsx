import { useState, type FormEvent } from 'react';
import type { SetupStatusDto } from '@zenport/shared';
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
