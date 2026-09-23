/**
 * Keeps an installed app on the current release.
 *
 * An iPhone home-screen app is often resumed from memory rather than reloaded,
 * so it can run old code for days after a deploy. When the app comes back to
 * the foreground (and every half hour while open) it asks the server which
 * version it runs. If that differs from this build: reload quietly when
 * nothing is playing; otherwise offer a small bar, so a sit is never cut.
 */
import { useEffect, useState } from 'react';
import type { HealthDto } from '@zenport/shared';
import { api } from './api.ts';
import { usePlayer } from './player/PlayerProvider.tsx';

export function UpdateWatcher() {
  const player = usePlayer();
  const [ready, setReady] = useState(false);
  const busy = Boolean(player.item);

  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      const health = await api.get<HealthDto>('/api/health').catch(() => null);
      if (stopped || !health || health.version === __ZP_VERSION__) return;
      if (busy) setReady(true);
      else window.location.reload();
    };
    const onVisible = () => void check();
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => void check(), 30 * 60 * 1000);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [busy]);

  if (!ready) return null;
  return (
    <div className="update-bar" role="status">
      A new version of ZenPort is ready.
      <button className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>
        Update
      </button>
    </div>
  );
}
