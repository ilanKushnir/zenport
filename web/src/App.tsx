import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import type { SetupStatusDto, UserInfo } from '@zenport/shared';
import { api, ApiError } from './api.ts';
import { clearApiCache } from './hooks.ts';
import { Icon } from './components/ui.tsx';
import { Lockup, Logo, Wordmark } from './components/Brand.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { VersionRow, WhatsNew } from './whatsnew/WhatsNew.tsx';
import { PrefsProvider, usePrefs } from './prefs.tsx';
import { Onboarding } from './onboarding/Onboarding.tsx';
import { PlayerProvider } from './player/PlayerProvider.tsx';
import { FocusMode, PlayerBar } from './player/PlayerUi.tsx';
import { ReflectionSheet } from './components/Reflection.tsx';
import { MORE_LINKS, MoreSheet } from './components/MoreSheet.tsx';
import { UpdateWatcher } from './updater.tsx';
import { FoldersPage } from './pages/FoldersPage.tsx';
import { SeriesPage } from './pages/SeriesPage.tsx';
import { JoinPage, LoginPage, SetupPage } from './pages/AuthPages.tsx';
import { FriendsPage } from './pages/FriendsPage.tsx';
import { FriendPage } from './pages/FriendPage.tsx';
import { PeoplePage } from './pages/PeoplePage.tsx';
import { DownloadsPage } from './pages/DownloadsPage.tsx';
import { flushOfflineSessions, useOffline, verifyDownloads } from './offline.ts';
import { InboxProvider, useInbox } from './social.tsx';
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

const ME_KEY = 'zp-me';

function readCachedMe(): UserInfo | null {
  try {
    return JSON.parse(localStorage.getItem(ME_KEY) ?? 'null') as UserInfo | null;
  } catch {
    return null;
  }
}

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

interface NavItem {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
  /** Only admins see it (the server enforces the same). */
  admin?: boolean;
  /** Carries the friends inbox badge. */
  badge?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Today', icon: 'sun', end: true },
  { to: '/library', label: 'Library', icon: 'library', end: true },
  { to: '/breathe', label: 'Breathe', icon: 'breath' },
  { to: '/plans', label: 'Plans', icon: 'plans' },
  { to: '/friends', label: 'Friends', icon: 'friends', badge: true },
  { to: '/journal', label: 'Journal', icon: 'journal' },
  { to: '/stats', label: 'Practice', icon: 'stats' },
  { to: '/library/folders', label: 'Folders', icon: 'folder', admin: true },
  { to: '/sources', label: 'Sources', icon: 'sources', admin: true },
  { to: '/people', label: 'People', icon: 'user-plus', admin: true },
  { to: '/integrations', label: 'Integrations', icon: 'plug' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

/** The sidebar, in three quiet groups rather than one long list. */
const NAV_GROUPS = [
  { label: 'Practice', items: NAV.slice(0, 4) },
  { label: 'Together', items: NAV.slice(4, 7) },
  { label: 'Manage', items: NAV.slice(7) },
];

/**
 * Phone tab bar: the four places people go every day, then More for the rest -
 * every page the sidebar has is reachable on a phone too.
 */
const MOBILE_NAV = [NAV[0]!, NAV[1]!, NAV[2]!, NAV[3]!];

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

/** No connection: say so once, and point at what still works. */
function OfflineBanner() {
  const { online, records } = useOffline();
  if (online) return null;
  return (
    <Link className="offline-banner" to="/downloads">
      <Icon name="download" size={15} />
      <span className="grow">
        You are offline
        {records.length > 0
          ? ` · ${records.length} downloaded meditation${records.length === 1 ? '' : 's'} ready`
          : ' · downloaded meditations play without a connection'}
      </span>
      <Icon name="chevron-right" size={14} />
    </Link>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user } = useAuth();
  const { inbox } = useInbox();
  const unseen = inbox?.unseen ?? 0;
  const isAdmin = user?.role === 'admin';
  const [moreOpen, setMoreOpen] = useState(false);
  const onMorePage = MORE_LINKS.some((l) => location.pathname.startsWith(l.to));
  // Sits played offline go up as soon as there is a connection; downloads the
  // browser dropped are forgotten.
  useEffect(() => {
    void flushOfflineSessions();
    void verifyDownloads();
    const onOnline = () => void flushOfflineSessions();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);
  useEffect(() => {
    // New page: move the reading position back to the top.
    document.getElementById('main')?.scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="shell">
      <div className="app-aurora" aria-hidden="true" />
      <header className="sidebar">
        <div className="sb-panel">
          <div className="sb-brand">
            <Lockup size={30} />
          </div>
          <button
            className="sb-search"
            onClick={() =>
              window.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
              )
            }
          >
            <Icon name="search" size={15} />
            <span>Search</span>
            <kbd>⌘K</kbd>
          </button>
          <nav className="nav" aria-label="Main">
            {NAV_GROUPS.map((g) => (
              <div className="nav-group" key={g.label}>
                <div className="nav-label">{g.label}</div>
                {g.items
                  .filter((n) => !n.admin || isAdmin)
                  .map((n) => (
                    <NavLink key={n.to} to={n.to} end={n.end}>
                      <span className="nav-tile">
                        <Icon name={n.icon} size={17} />
                      </span>
                      {n.label}
                      {n.badge && unseen > 0 && (
                        <span className="nav-badge" aria-label={`${unseen} new`}>
                          {unseen}
                        </span>
                      )}
                    </NavLink>
                  ))}
              </div>
            ))}
          </nav>
          <div className="sb-foot">
            <VersionRow compact />
          </div>
        </div>
      </header>
      <main className="main" id="main">
        <div className="mobile-top">
          <Logo size={24} bloom={false} />
          <Wordmark size={17} />
        </div>
        <OfflineBanner />
        {children}
      </main>
      {/* Content dissolves as it nears the tab bar instead of showing through
          the gap between the bar and the bottom of the screen. */}
      <div className="tab-fade" aria-hidden="true" />
      <nav className="mobile-tabs" aria-label="Main">
        {MOBILE_NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <Icon name={n.icon} />
            {n.label}
          </NavLink>
        ))}
        <button
          type="button"
          className={`tab-more${onMorePage ? ' active' : ''}`}
          aria-current={onMorePage ? 'page' : undefined}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
        >
          <Icon name="grid" />
          More
          {unseen > 0 && <span className="tab-dot" aria-label={`${unseen} new from friends`} />}
        </button>
      </nav>
      {moreOpen && <MoreSheet onClose={() => setMoreOpen(false)} />}
      <PlayerBar />
      <FocusMode />
      <ReflectionSheet />
      <CommandPalette />
      <WhatsNew />
      <UpdateWatcher />
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
        <InboxProvider>
          <Shell>
            <Routes>
              <Route path="/" element={<TodayPage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/library/folders" element={<FoldersPage />} />
              <Route path="/series/:creator/:name" element={<SeriesPage />} />
              <Route path="/breathe" element={<TimerPage />} />
              <Route path="/timer" element={<Navigate to="/breathe" replace />} />
              <Route path="/creators/:name" element={<CreatorPage />} />
              <Route path="/m/:id" element={<ItemPage />} />
              <Route path="/plans" element={<PlansPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/journal" element={<JournalPage />} />
              <Route path="/sources" element={<SourcesPage />} />
              <Route path="/integrations" element={<IntegrationsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/friends" element={<FriendsPage />} />
              <Route path="/friends/:id" element={<FriendPage />} />
              <Route path="/people" element={<PeoplePage />} />
              <Route path="/downloads" element={<DownloadsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Shell>
        </InboxProvider>
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
      // Another account on this device: nothing of the last one may show.
      setUser((prev) => {
        if (prev && prev.id !== me.id) clearApiCache();
        return me;
      });
      try {
        localStorage.setItem(ME_KEY, JSON.stringify(me));
      } catch {
        /* private mode */
      }
      setPhase('in');
    } catch (err) {
      // No connection at all (not a refusal): carry on as the last person
      // signed in here, so downloaded meditations still open and play.
      if (!(err instanceof ApiError)) {
        const cached = readCachedMe();
        if (cached) {
          setUser(cached);
          setPhase('in');
          return;
        }
      }
      const status = await api.get<SetupStatusDto>('/api/setup/status').catch(() => null);
      setUser(null);
      setPhase(status?.needsSetup ? 'setup' : 'login');
    }
  };

  useEffect(() => {
    void refresh();
    const onSignedOut = () => {
      clearApiCache();
      setPhase('login');
    };
    window.addEventListener('zenport:signed-out', onSignedOut);
    return () => window.removeEventListener('zenport:signed-out', onSignedOut);
  }, []);

  const signOut = async () => {
    await api.post('/api/auth/logout').catch(() => {});
    clearApiCache();
    try {
      localStorage.removeItem(ME_KEY);
    } catch {
      /* ignore */
    }
    setUser(null);
    setPhase('login');
  };

  if (phase === 'checking') return <Splash />;

  // An invitation link wins over everything else on this load.
  const joinToken = /^\/join\/([A-Za-z0-9_-]+)\/?$/.exec(window.location.pathname)?.[1];
  if (joinToken && phase !== 'setup') {
    return (
      <AuthContext.Provider value={{ user, refresh, signOut }}>
        <JoinPage
          token={joinToken}
          signedInAs={phase === 'in' ? (user?.displayName ?? user?.username ?? null) : null}
          onSignOut={() => void signOut()}
          onDone={() => void refresh()}
        />
      </AuthContext.Provider>
    );
  }

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
