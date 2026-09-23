/**
 * Friends, on the Today page: what they sent you (a nudge, an invitation to
 * sit with something, bows on your sits), who is asking to be friends, and a
 * row of rings - who has practised today, who is sitting right now. Shows
 * nothing at all for someone without friends, so a solo practice stays calm.
 */
import { Link, useNavigate } from 'react-router-dom';
import type { CheerDto, FriendsDto } from '@zenport/shared';
import { useApi, useRefreshOn } from '../hooks.ts';
import { ago, useInbox } from '../social.tsx';
import { Avatar, Cover, Icon } from './ui.tsx';
import { ringOf } from '../pages/FriendsPage.tsx';

const RECENT_MS = 3 * 86_400_000;

export function FriendsToday() {
  const board = useApi<FriendsDto>('/api/friends');
  const { inbox } = useInbox();
  const navigate = useNavigate();
  useRefreshOn('zenport:friends', () => board.reload());
  const friends = board.data?.friends ?? [];
  const recent = (inbox?.cheers ?? []).filter(
    (c) => Date.now() - new Date(c.at).getTime() < RECENT_MS,
  );
  const invitations = recent.filter((c) => c.kind === 'sit' && c.item);
  const nudges = recent.filter((c) => c.kind === 'nudge').slice(0, 2);
  const bows = recent.filter((c) => c.kind === 'bow');
  const requests = inbox?.requests ?? [];
  if (friends.length === 0 && requests.length === 0 && recent.length === 0) return null;

  const bowers = [...new Map(bows.map((b) => [b.from.id, b.from])).values()];

  return (
    <section className="section" aria-labelledby="sec-friends-today">
      <div className="section-head">
        <h2 id="sec-friends-today">Friends</h2>
        <Link className="section-link" to="/friends">
          All friends <Icon name="chevron-right" size={14} />
        </Link>
      </div>
      <div className="ft-card">
        {friends.length > 0 && (
          <div className="ft-rings">
            {friends.slice(0, 8).map((f) => (
              <Link key={f.id} to={`/friends/${f.id}`} className="ft-ring" title={f.name}>
                <Avatar name={f.name} avatar={f.avatar} id={f.id} size={44} ring={ringOf(f)} />
                <span className="ft-ring-n">{f.name.split(' ')[0]}</span>
              </Link>
            ))}
          </div>
        )}

        {requests.length > 0 && (
          <Link className="ft-line" to="/friends">
            <Icon name="user-plus" size={16} />
            <span className="grow">
              {requests.length === 1
                ? `${requests[0]!.name} would like to be friends`
                : `${requests.length} people would like to be friends`}
            </span>
            <span className="ft-go">Answer</span>
          </Link>
        )}

        {invitations.map((c) => (
          <SitInvite key={c.id} c={c} onBegin={() => navigate(`/m/${c.item!.id}`)} />
        ))}

        {nudges.map((c) => (
          <div className="ft-line nudge" key={c.id}>
            <Avatar name={c.from.name} avatar={c.from.avatar} id={c.from.id} size={28} />
            <span className="grow">
              <strong>{c.from.name}</strong>{' '}
              <span className="ft-msg">“{c.message ?? 'is thinking of you'}”</span>
            </span>
            <span className="sub">{ago(c.at)}</span>
          </div>
        ))}

        {bowers.length > 0 && (
          <div className="ft-line">
            <span className="ft-bow" aria-hidden="true">
              🙏
            </span>
            <span className="grow">
              {bowers.length === 1
                ? `${bowers[0]!.name} bowed to your practice`
                : `${bowers
                    .slice(0, 2)
                    .map((b) => b.name)
                    .join(
                      ' and ',
                    )}${bowers.length > 2 ? ` and ${bowers.length - 2} more` : ''} bowed to your practice`}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function SitInvite({ c, onBegin }: { c: CheerDto; onBegin: () => void }) {
  return (
    <div className="ft-invite">
      <span className="ft-invite-cover">
        <Cover coverId={c.item!.coverId} title={c.item!.title} creator="" />
      </span>
      <span className="grow">
        <span className="sub">
          {c.from.name} invites you to sit with · {ago(c.at)}
        </span>
        <span className="ft-invite-t">{c.item!.title}</span>
      </span>
      <button className="btn btn-sm btn-primary" onClick={onBegin}>
        <Icon name="play" size={13} /> Open
      </button>
    </div>
  );
}
