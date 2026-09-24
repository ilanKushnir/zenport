/**
 * "The library scan found something new" - for admins, while they use the
 * app. A scan runs on its own every hour; when one finishes having found
 * recordings never seen before, a small card offers to review them. It says
 * nothing about scans that found nothing, never interrupts onboarding (the
 * app shell only mounts after it), and stays out of the way on the review
 * page itself. Dismissing it is enough - it will not come back for that scan.
 */
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { ReviewSummaryDto, ScanStateDto } from '@zenport/shared';
import { api } from './api.ts';
import { useAuth } from './App.tsx';
import { Icon } from './components/ui.tsx';

const SEEN = 'zp-scan-seen';
const read = () => {
  try {
    return localStorage.getItem(SEEN);
  } catch {
    return null;
  }
};
const write = (v: string) => {
  try {
    localStorage.setItem(SEEN, v);
  } catch {
    /* private mode: the notice may show again, which is harmless */
  }
};

export function ScanNotice() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const location = useLocation();
  const [found, setFound] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const scan = await api.get<ScanStateDto>('/api/library/scan-state').catch(() => null);
      if (stopped || !scan?.finishedAt || scan.status !== 'idle') return;
      const seen = read();
      if (seen === scan.finishedAt) return;
      write(scan.finishedAt);
      // The first look on this device only remembers where things stand.
      if (seen === null || scan.newItems === 0) return;
      const sum = await api.get<ReviewSummaryDto>('/api/admin/review/summary').catch(() => null);
      if (!stopped && sum && sum.new > 0) setFound(sum.new);
    };
    void check();
    const onVisible = () => void check();
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => void check(), 2 * 60 * 1000);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [isAdmin]);

  if (found === null || location.pathname.startsWith('/admin/library')) return null;
  return (
    <div className="scan-notice" role="status">
      <span className="scan-notice-ic" aria-hidden="true">
        <Icon name="library" size={18} />
      </span>
      <span className="grow">
        <strong>Library scan finished</strong>
        <span className="sub">
          {found === 1 ? '1 new recording' : `${found} new recordings`} - look{' '}
          {found === 1 ? 'it' : 'them'} over if you like.
        </span>
      </span>
      <Link
        className="btn btn-sm btn-primary"
        to="/admin/library?show=new"
        onClick={() => setFound(null)}
      >
        Review
      </Link>
      <button className="icon-btn" aria-label="Dismiss" onClick={() => setFound(null)}>
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
