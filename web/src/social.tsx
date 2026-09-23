/**
 * Small shared pieces of the social side: the inbox count that badges the
 * nav, relative times, and the sheet that invites a friend to sit with a
 * particular recording.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { FriendsDto, InboxDto } from '@zenport/shared';
import { api } from './api.ts';
import { useApi } from './hooks.ts';
import { Avatar, Icon, Sheet } from './components/ui.tsx';

interface InboxState {
  inbox: InboxDto | null;
  reload: () => void;
  markSeen: () => void;
}

const InboxContext = createContext<InboxState>({
  inbox: null,
  reload: () => {},
  markSeen: () => {},
});

/** Polls gently (on focus and every few minutes) - friends are not a chat. */
export function InboxProvider({ children }: { children: ReactNode }) {
  const [inbox, setInbox] = useState<InboxDto | null>(null);
  const reload = useCallback(() => {
    void api
      .get<InboxDto>('/api/inbox')
      .then(setInbox)
      .catch(() => {});
  }, []);
  const markSeen = useCallback(() => {
    void api
      .post('/api/inbox/seen')
      .then(reload)
      .catch(() => {});
  }, [reload]);
  useEffect(() => {
    reload();
    const t = window.setInterval(reload, 3 * 60_000);
    const onVis = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('zenport:friends', reload);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('zenport:friends', reload);
    };
  }, [reload]);
  return (
    <InboxContext.Provider value={{ inbox, reload, markSeen }}>{children}</InboxContext.Provider>
  );
}

export const useInbox = () => useContext(InboxContext);

/** Tell every friends view to refresh (after a request, bow or nudge). */
export const friendsChanged = () => window.dispatchEvent(new Event('zenport:friends'));

export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Invite one or more friends to sit with this recording. */
export function SitTogetherSheet({
  itemId,
  title,
  onClose,
}: {
  itemId: string;
  title: string;
  onClose: () => void;
}) {
  const friends = useApi<FriendsDto>('/api/friends');
  const [sent, setSent] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const send = async (to: number) => {
    setError(null);
    try {
      await api.post('/api/cheers', { to, kind: 'sit', itemId });
      setSent((s) => new Set(s).add(to));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not send');
    }
  };
  const list = friends.data?.friends ?? [];
  return (
    <Sheet title="Sit together" onClose={onClose} labelId="sit-together">
      <p className="sit-sheet-lede">
        Invite a friend to sit with <strong>{title}</strong> too. It lands on their Today page with
        a button to begin.
      </p>
      {friends.loading ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : list.length === 0 ? (
        <p className="notice">
          No friends here yet. Add people from the Friends page, and they will show up here.
        </p>
      ) : (
        <div className="rowlist">
          {list.map((f) => (
            <div className="row person-row" key={f.id}>
              <Avatar name={f.name} avatar={f.avatar} id={f.id} size={36} />
              <div className="grow">
                <div>{f.name}</div>
                <div className="sub">@{f.username}</div>
              </div>
              <button
                className={`btn btn-sm ${sent.has(f.id) ? 'btn-quiet' : 'btn-ghost'}`}
                disabled={sent.has(f.id)}
                onClick={() => void send(f.id)}
              >
                {sent.has(f.id) ? (
                  <>
                    <Icon name="check" size={14} /> Invited
                  </>
                ) : (
                  'Invite'
                )}
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="error-note">{error}</p>}
    </Sheet>
  );
}
