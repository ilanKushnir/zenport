import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import type { SetupStatusDto, UserInfo } from '@zenport/shared';
import { api } from './api.ts';
import { Icon } from './components/ui.tsx';
import { Lockup, Logo, Wordmark } from './components/Brand.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { VersionRow, WhatsNew } from './whatsnew/WhatsNew.tsx';
import { PrefsProvider, usePrefs } from './prefs.tsx';
import { Onboarding } from './onboarding/Onboarding.tsx';
import { PlayerProvider } from './player/PlayerProvider.tsx';
import { FocusMode, PlayerBar } from './player/PlayerUi.tsx';
import { ReflectionSheet } from './components/Reflection.tsx';
import { LoginPage, SetupPage } from './pages/AuthPages.tsx';
import { TodayPage } from './pages/TodayPage.tsx';
import { LibraryPage } from './pages/LibraryPage.tsx';
import { TimerPage } from './pages/TimerPage.tsx';
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
  { to: '/', label: 'Today', icon: 'sun', end: true },
  { to: '/library', label: 'Library', icon: 'library' },
  { to: '/timer', label: 'Sit', icon: 'timer' },
  { to: '/plans', label: 'Plans', icon: 'plans' },
  { to: '/journal', label: 'Journal', icon: 'journal' },
  { to: '/stats', label: 'Practice', icon: 'stats' },
  { to: '/sources', label: 'Sources', icon: 'sources' },
  { to: '/integrations', label: 'Integrations', icon: 'plug' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

/** Phone tab bar: the five things people actually reach for. */
const MOBILE_NAV = [NAV[0]!, NAV[1]!, NAV[2]!, NAV[4]!, NAV[8]!];

/**
 * Honour the "open ZenPort on" preference exactly once per load. Done as a
 * redirect rather than by swapping what "/" renders, so Today and Library keep
 * stable, linkable URLs either way.
 */
function StartPageRedirect() {
  const { prefs, ready } = usePrefs();
  const location = useLocation();
  const navigate = useNavigate();
  const done = useRef(false);

  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    if (prefs.startPage === 'library' && location.pathname === '/') {
      navigate('/library', { replace: true });
    }
  }, [ready, prefs.startPage, location.pathname, navigate]);

  return null;
}

function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  useEffect(() => {
    // New page: move the reading position back to the top.
    document.getElementById('main')?.scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="shell">
      <div className="app-aurora" aria-hidden="true" />
      <header className="sidebar">
        <Lockup size={30} />
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}>
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <button
          className="cmdk-hint"
          onClick={() =>
            window.dispatchEvent(
              new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
            )
          }
        >
          <Icon name="search" size={15} />
          Search
          <kbd>⌘K</kbd>
        </button>
        <VersionRow compact />
      </header>
      <main className="main" id="main">
        <div className="mobile-top">
          <Logo size={24} bloom={false} />
          <Wordmark size={17} />
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
      <CommandPalette />
      <WhatsNew />
    </div>
  );
}

/** Everything behind a session: preferences, onboarding gate, then the app. */
function SignedInApp() {
  const { prefs, ready } = usePrefs();
  const [dismissed, setDismissed] = useState(false);

  // Hold the app back until preferences are known, so someone who has already
  // onboarded never sees the welcome flow flash past on a slow connection.
  if (!ready) {
    return <Splash />;
  }
  if (prefs.onboardedAt === null && !dismissed) {
    return <Onboarding onDone={() => setDismissed(true)} />;
  }

  return (
    <BrowserRouter>
      <StartPageRedirect />
      <PlayerProvider>
        <Shell>
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/timer" element={<TimerPage />} />
            <Route path="/creators/:name" element={<CreatorPage />} />
            <Route path="/m/:id" element={<ItemPage />} />
            <Route path="/plans" element={<PlansPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/journal" element={<JournalPage />} />
            <Route path="/sources" element={<SourcesPage />} />
            <Route path="/integrations" element={<IntegrationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
      </PlayerProvider>
    </BrowserRouter>
  );
}

function Splash() {
  return (
    <div className="auth-page splash" aria-busy="true">
      <Lockup size={56} stacked spin tagline="opening…" />
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

  if (phase === 'checking') return <Splash />;

  return (
    <AuthContext.Provider value={{ user, refresh, signOut }}>
      {phase === 'setup' && <SetupPage onDone={() => void refresh()} />}
      {phase === 'login' && <LoginPage onDone={() => void refresh()} />}
      {phase === 'in' && (
        // Keyed on the account so switching users reloads preferences and
        // favourites instead of inheriting the previous person's.
        <PrefsProvider key={user?.id ?? 'anon'}>
          <SignedInApp />
        </PrefsProvider>
      )}
    </AuthContext.Provider>
  );
}
