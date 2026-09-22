import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import type { SetupStatusDto, UserInfo } from '@zenport/shared';
import { api } from './api.ts';
import { Icon } from './components/ui.tsx';
import { PlayerProvider } from './player/PlayerProvider.tsx';
import { FocusMode, PlayerBar } from './player/PlayerUi.tsx';
import { ReflectionSheet } from './components/Reflection.tsx';
import { LoginPage, SetupPage } from './pages/AuthPages.tsx';
import { LibraryPage } from './pages/LibraryPage.tsx';
import { CreatorPage } from './pages/CreatorPage.tsx';
import { ItemPage } from './pages/ItemPage.tsx';
import { PlansPage } from './pages/PlansPage.tsx';
import { StatsPage } from './pages/StatsPage.tsx';
import { JournalPage } from './pages/JournalPage.tsx';
import { SourcesPage } from './pages/SourcesPage.tsx';
import { IntegrationsPage } from './pages/IntegrationsPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';

interface AuthState {
  user: UserInfo | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside provider');
  return ctx;
}

const NAV = [
  { to: '/', label: 'Library', icon: 'library', end: true },
  { to: '/plans', label: 'Plans', icon: 'plans' },
  { to: '/journal', label: 'Journal', icon: 'journal' },
  { to: '/stats', label: 'Practice', icon: 'stats' },
  { to: '/sources', label: 'Sources', icon: 'sources' },
  { to: '/integrations', label: 'Integrations', icon: 'plug' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

const MOBILE_NAV = NAV.slice(0, 4).concat(NAV[6]!);

function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  useEffect(() => {
    // New page: move focus context to top for screen readers.
    document.getElementById('main')?.scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="shell">
      <header className="sidebar">
        <div className="wordmark">
          ZenPort
          <small>practice companion</small>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="main" id="main">
        <div className="mobile-top">
          <span className="wordmark" style={{ padding: 0, fontSize: 19 }}>
            ZenPort
          </span>
        </div>
        {children}
      </main>
      <nav className="mobile-tabs" aria-label="Main">
        {MOBILE_NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <Icon name={n.icon} />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <PlayerBar />
      <FocusMode />
      <ReflectionSheet />
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [phase, setPhase] = useState<'checking' | 'setup' | 'login' | 'in'>('checking');

  const refresh = async () => {
    try {
      const me = await api.get<UserInfo>('/api/auth/me');
      setUser(me);
      setPhase('in');
    } catch {
      const status = await api.get<SetupStatusDto>('/api/setup/status').catch(() => null);
      setUser(null);
      setPhase(status?.needsSetup ? 'setup' : 'login');
    }
  };

  useEffect(() => {
    void refresh();
    const onSignedOut = () => setPhase('login');
    window.addEventListener('zenport:signed-out', onSignedOut);
    return () => window.removeEventListener('zenport:signed-out', onSignedOut);
  }, []);

  const signOut = async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setUser(null);
    setPhase('login');
  };

  if (phase === 'checking') {
    return (
      <div className="auth-page" aria-busy="true">
        <p style={{ color: 'var(--faint)' }}>Opening ZenPort…</p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, refresh, signOut }}>
      {phase === 'setup' && <SetupPage onDone={() => void refresh()} />}
      {phase === 'login' && <LoginPage onDone={() => void refresh()} />}
      {phase === 'in' && (
        <BrowserRouter>
          <PlayerProvider>
            <Shell>
              <Routes>
                <Route path="/" element={<LibraryPage />} />
                <Route path="/creators/:name" element={<CreatorPage />} />
                <Route path="/m/:id" element={<ItemPage />} />
                <Route path="/plans" element={<PlansPage />} />
                <Route path="/stats" element={<StatsPage />} />
                <Route path="/journal" element={<JournalPage />} />
                <Route path="/sources" element={<SourcesPage />} />
                <Route path="/integrations" element={<IntegrationsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<LibraryPage />} />
              </Routes>
            </Shell>
          </PlayerProvider>
        </BrowserRouter>
      )}
    </AuthContext.Provider>
  );
}
