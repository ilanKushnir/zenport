/**
 * Admin: everything that shapes this ZenPort for everyone, in one place, and
 * only for admins. The overview says how things stand at a glance - who is
 * here, invitations still open, the library and its last scan - and each
 * area opens its own page: people, folders, YouTube sources, integrations.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AdminUserDto, InviteDto, ScanStateDto } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { useAuth } from '../App.tsx';
import { Icon } from '../components/ui.tsx';
import { ago } from '../social.tsx';

export function AdminOnly({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') {
    return (
      <div className="page-head">
        <h1>Admin</h1>
        <p className="lede">This part of ZenPort is for its admins.</p>
      </div>
    );
  }
  return <>{children}</>;
}

/** "Admin /" above an admin page's own heading. */
export function AdminCrumb({ here }: { here: string }) {
  return (
    <nav className="breadcrumbs admin-crumb" aria-label="Breadcrumb">
      <Link to="/admin">
        <Icon name="shield" size={13} /> Admin
      </Link>
      <span className="sep">/</span>
      <span aria-current="page">{here}</span>
    </nav>
  );
}

const AREAS = [
  {
    to: '/admin/people',
    icon: 'friends',
    title: 'People',
    hint: 'Invitations, roles and password resets.',
  },
  {
    to: '/admin/folders',
    icon: 'folder',
    title: 'Library folders',
    hint: 'Which folders the scanner reads.',
  },
  {
    to: '/admin/sources',
    icon: 'sources',
    title: 'YouTube sources',
    hint: 'Talks and playlists, by reference.',
  },
  {
    to: '/admin/integrations',
    icon: 'plug',
    title: 'Integrations',
    hint: 'What this server can reach.',
  },
] as const;

export function AdminPage() {
  const users = useApi<AdminUserDto[]>('/api/users');
  const invites = useApi<InviteDto[]>('/api/invites');
  const scan = useApi<ScanStateDto>('/api/library/scan-state');
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // While a scan runs, look again every couple of seconds.
  const running = scanning || scan.data?.status === 'scanning';
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => scan.reload(), 2000);
    return () => window.clearInterval(t);
  }, [running, scan]);
  useEffect(() => {
    if (scanning && scan.data?.status === 'idle' && scan.data.finishedAt) {
      setScanning(false);
      setNote(`Scan finished - ${scan.data.counts.items} recordings indexed.`);
    }
  }, [scanning, scan.data]);

  const rescan = async () => {
    setNote(null);
    setScanning(true);
    try {
      await api.post('/api/library/rescan');
      window.setTimeout(() => scan.reload(), 800);
    } catch (err) {
      setScanning(false);
      setNote(err instanceof Error ? err.message : 'The scan could not start.');
    }
  };

  const people = users.data?.length;
  const admins = users.data?.filter((u) => u.role === 'admin').length ?? 0;
  const open = invites.data?.filter((i) => i.status === 'open').length;
  const s = scan.data;

  return (
    <AdminOnly>
      <div className="page-head admin-head">
        <span className="admin-kicker">
          <Icon name="shield" size={14} /> Admin
        </span>
        <h1>This ZenPort</h1>
        <p className="lede">
          What shapes the app for everyone here. Only admins see this - everyone else simply
          practises.
        </p>
      </div>

      <div className="admin-stats">
        <Link className="admin-stat" to="/admin/people">
          <strong>{people ?? '–'}</strong>
          <span>
            {people === 1 ? 'person' : 'people'}
            {admins > 1 ? ` · ${admins} admins` : ''}
          </span>
        </Link>
        <Link className="admin-stat" to="/admin/people">
          <strong>{open ?? '–'}</strong>
          <span>open invitation{open === 1 ? '' : 's'}</span>
        </Link>
        <Link className="admin-stat" to="/library">
          <strong>{s ? s.counts.items : '–'}</strong>
          <span>recordings</span>
        </Link>
      </div>

      <div className="admin-areas">
        {AREAS.map((a) => (
          <Link key={a.to} className="admin-area" to={a.to}>
            <span className="admin-area-ic">
              <Icon name={a.icon} size={20} />
            </span>
            <span className="admin-area-t">{a.title}</span>
            <span className="admin-area-h">{a.hint}</span>
            <span className="admin-area-go" aria-hidden="true">
              <Icon name="chevron-right" size={16} />
            </span>
          </Link>
        ))}
      </div>

      <section className="section" aria-labelledby="sec-scan">
        <div className="section-head">
          <h2 id="sec-scan">Library scan</h2>
        </div>
        <div className="admin-scan">
          <div className="admin-scan-top">
            <span className={`scan-dot${running ? ' live' : ''}`} aria-hidden="true" />
            <span className="grow">
              <strong>
                {running
                  ? 'Scanning…'
                  : s?.finishedAt
                    ? `Last scanned ${ago(s.finishedAt)}`
                    : 'Not scanned yet'}
              </strong>
              {s && (
                <span className="sub">
                  {s.counts.items} recordings · {s.counts.tracks} tracks · {s.counts.covers} covers
                  · {s.counts.documents} notes
                  {s.counts.missing > 0 ? ` · ${s.counts.missing} missing` : ''}
                </span>
              )}
            </span>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => void rescan()}
              disabled={running}
            >
              <Icon name="history" size={14} /> {running ? 'Scanning' : 'Rescan'}
            </button>
          </div>
          {s && s.roots.length > 0 && (
            <div className="admin-roots">
              {s.roots.map((r) => (
                <span key={r.id} className={`admin-root${r.ok ? '' : ' bad'}`}>
                  <Icon name="folder" size={13} /> {r.label}
                  <span className="sub">{r.ok ? 'readable' : (r.note ?? 'not readable')}</span>
                </span>
              ))}
            </div>
          )}
          {note && <p className="hint">{note}</p>}
          {s && s.warnings.length > 0 && (
            <details className="admin-warnings">
              <summary>
                {s.warnings.length} scan note{s.warnings.length > 1 ? 's' : ''}
              </summary>
              <ul>
                {s.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </section>
    </AdminOnly>
  );
}
