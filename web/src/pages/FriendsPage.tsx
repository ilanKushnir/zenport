/**
 * Friends: practising alone, together.
 *
 * The page answers three questions in order - who is asking to be your
 * friend, how everyone's day is going (a ring per friend: practised today,
 * sitting right now, or not yet), and what they have been sitting with lately
 * (with a bow to send). Everything shown follows each friend's own sharing
 * choice; someone who shares nothing still appears, just quietly.
 */
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FriendActivityDto, FriendDto, FriendsDto, PersonDto } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi, useRefreshOn } from '../hooks.ts';
import { useAuth } from '../App.tsx';
import { Avatar, Cover, EmptyState, ErrorNote, Icon, Sheet } from '../components/ui.tsx';
import { ago, friendsChanged, useInbox } from '../social.tsx';

export const NUDGES = [
  'Thinking of you - sit with me today?',
  'A few quiet minutes, whenever you can.',
  'I just sat. Your turn?',
  'Miss practising with you.',
];

/** A friend's day as one line: sitting now, practised, or not yet. */
export function dayLine(f: FriendDto): string {
  if (f.shareLevel === 'off') return 'Keeps their practice private';
  if (f.now) return f.now.title ? `Sitting now · ${f.now.title}` : 'Sitting now';
  const t = f.today;
  if (t && (t.minutes > 0 || t.studyMinutes > 0)) {
    const bits = [
      t.minutes > 0 ? `sat ${t.minutes} min` : null,
      t.studyMinutes > 0 ? `studied ${t.studyMinutes} min` : null,
    ].filter(Boolean);
    return `Today: ${bits.join(', ')}`;
  }
  return 'Not yet today';
}

export const ringOf = (f: FriendDto): 'done' | 'live' | 'open' | null =>
  f.now ? 'live' : f.today && f.today.minutes > 0 ? 'done' : f.shareLevel === 'off' ? null : 'open';

export function FriendsPage() {
  const board = useApi<FriendsDto>('/api/friends');
  const feed = useApi<FriendActivityDto[]>('/api/friends-feed');
  const { markSeen } = useInbox();
  const { user } = useAuth();
  const [finding, setFinding] = useState(false);
  const [nudging, setNudging] = useState<FriendDto | null>(null);
  useRefreshOn('zenport:friends', () => {
    board.reload();
    feed.reload();
  });
  // Opening the page is reading the news.
  useEffect(() => {
    markSeen();
  }, [markSeen]);

  if (board.error) return <ErrorNote message={board.error} onRetry={board.reload} />;
  const d = board.data;
  const friends = d?.friends ?? [];

  return (
    <>
      <div className="page-head plans-head">
        <div>
          <h1>Friends</h1>
          <p className="lede">
            Practise on your own, together. See how the day is going, and send a bow.
          </p>
        </div>
        <div className="plans-head-actions">
          <button className="btn btn-primary" onClick={() => setFinding(true)}>
            <Icon name="user-plus" size={16} /> Add friends
          </button>
        </div>
      </div>

      {d && d.incoming.length > 0 && (
        <section className="section" aria-labelledby="sec-requests">
          <div className="section-head">
            <h2 id="sec-requests">Asking to be friends</h2>
          </div>
          <div className="request-list">
            {d.incoming.map((p) => (
              <RequestCard key={p.id} person={p} />
            ))}
          </div>
        </section>
      )}

      {!d ? (
        <div className="skeleton" style={{ height: 180 }} />
      ) : friends.length === 0 ? (
        <EmptyState
          title="Nobody here yet"
          art="ob-friends"
          action={
            <div className="empty-actions">
              <button className="btn btn-primary" onClick={() => setFinding(true)}>
                <Icon name="user-plus" size={16} /> Find people here
              </button>
              {user?.role === 'admin' && (
                <Link className="btn btn-ghost" to="/people">
                  <Icon name="link" size={16} /> Invite someone new
                </Link>
              )}
            </div>
          }
        >
          Friends see each other&apos;s streaks and what they sat with - as much as each of you
          chooses to share - and can send a bow or a gentle nudge.
        </EmptyState>
      ) : (
        <>
          <section className="section" aria-labelledby="sec-today">
            <div className="section-head">
              <h2 id="sec-today">Today</h2>
            </div>
            <div className="today-circle">
              {friends.map((f) => (
                <Link key={f.id} to={`/friends/${f.id}`} className="circle-person">
                  <Avatar name={f.name} avatar={f.avatar} id={f.id} size={58} ring={ringOf(f)} />
                  <span className="circle-name">{f.name}</span>
                  <span className="circle-state">
                    {f.now
                      ? 'sitting'
                      : f.today && f.today.minutes > 0
                        ? `${f.today.minutes} min`
                        : f.shareLevel === 'off'
                          ? '·'
                          : 'not yet'}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="section" aria-labelledby="sec-friends">
            <div className="section-head">
              <h2 id="sec-friends">Your friends</h2>
            </div>
            <div className="friend-grid">
              {friends.map((f) => (
                <FriendCard key={f.id} f={f} onNudge={() => setNudging(f)} />
              ))}
            </div>
          </section>

          {(feed.data ?? []).length > 0 && (
            <section className="section" aria-labelledby="sec-lately">
              <div className="section-head">
                <h2 id="sec-lately">Lately</h2>
              </div>
              <div className="feed">
                {(feed.data ?? []).map((a) => (
                  <ActivityRow key={a.sessionId} a={a} showWho />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {d && d.outgoing.length > 0 && (
        <section className="section" aria-labelledby="sec-waiting">
          <div className="section-head">
            <h2 id="sec-waiting">Waiting for an answer</h2>
          </div>
          <div className="rowlist card" style={{ padding: '4px 16px' }}>
            {d.outgoing.map((p) => (
              <div className="row person-row" key={p.id}>
                <Avatar name={p.name} avatar={p.avatar} id={p.id} size={32} />
                <div className="grow">{p.name}</div>
                <button
                  className="btn btn-sm btn-quiet"
                  onClick={() =>
                    void api.del(`/api/friends/${p.id}`).then(friendsChanged, () => {})
                  }
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {finding && <FindPeopleSheet onClose={() => setFinding(false)} />}
      {nudging && <NudgeSheet friend={nudging} onClose={() => setNudging(null)} />}
    </>
  );
}

function RequestCard({ person }: { person: PersonDto }) {
  const [busy, setBusy] = useState(false);
  const act = async (accept: boolean) => {
    setBusy(true);
    await (
      accept ? api.post(`/api/friends/${person.id}/accept`) : api.del(`/api/friends/${person.id}`)
    ).catch(() => {});
    friendsChanged();
  };
  return (
    <div className="request-card">
      <Avatar name={person.name} avatar={person.avatar} id={person.id} size={44} />
      <div className="grow">
        <div className="request-name">{person.name}</div>
        <div className="sub">@{person.username} would like to be friends</div>
      </div>
      <div className="request-actions">
        <button className="btn btn-sm btn-quiet" disabled={busy} onClick={() => void act(false)}>
          Not now
        </button>
        <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => void act(true)}>
          Accept
        </button>
      </div>
    </div>
  );
}

/** Seven small bars, one per day, tallest day full height. */
export function WeekBars({ week }: { week: { day: string; minutes: number }[] }) {
  const max = Math.max(10, ...week.map((w) => w.minutes));
  return (
    <span className="week-bars" aria-label="The last seven days">
      {week.map((w) => (
        <span
          key={w.day}
          className={`wb${w.minutes > 0 ? ' on' : ''}`}
          style={{ blockSize: `${Math.max(12, (w.minutes / max) * 100)}%` }}
          title={`${w.day}: ${w.minutes} min`}
        />
      ))}
    </span>
  );
}

function FriendCard({ f, onNudge }: { f: FriendDto; onNudge: () => void }) {
  const navigate = useNavigate();
  const practisedToday = !!f.now || (f.today?.minutes ?? 0) > 0;
  return (
    <article className={`friend-card${f.now ? ' live' : ''}`}>
      <button className="friend-top" onClick={() => navigate(`/friends/${f.id}`)}>
        <Avatar name={f.name} avatar={f.avatar} id={f.id} size={48} ring={ringOf(f)} />
        <span className="friend-id">
          <span className="friend-name">{f.name}</span>
          <span className={`friend-day${f.now ? ' live' : ''}`}>{dayLine(f)}</span>
        </span>
        <Icon name="chevron-right" size={16} />
      </button>

      {f.shareLevel !== 'off' && (
        <div className="friend-stats">
          <span className="fs">
            <strong>{f.streak ?? 0}</strong>
            <span>day streak</span>
          </span>
          <span className="fs">
            <strong>{f.together ?? 0}</strong>
            <span>together</span>
          </span>
          <WeekBars week={f.week} />
        </div>
      )}

      {f.learning && (
        <Link className="friend-learning" to={`/m/${f.learning.itemId}`}>
          <Icon name="book" size={14} />
          <span className="grow">{f.learning.title}</span>
          <span className="sub">
            {f.learning.done}/{f.learning.total}
          </span>
        </Link>
      )}

      {f.last && <ActivityRow a={f.last} compact />}

      {!practisedToday && f.shareLevel !== 'off' && (
        <div className="friend-actions">
          <button className="btn btn-sm btn-ghost" disabled={f.nudgedToday} onClick={onNudge}>
            <Icon name="bell" size={14} />
            {f.nudgedToday ? 'Nudged today' : 'Send a nudge'}
          </button>
        </div>
      )}
    </article>
  );
}

/** One thing a friend sat with or studied, with a bow to send (or take back). */
export function ActivityRow({
  a,
  showWho = false,
  compact = false,
}: {
  a: FriendActivityDto;
  showWho?: boolean;
  compact?: boolean;
}) {
  const [bowed, setBowed] = useState(a.bowedByMe);
  const [bows, setBows] = useState(a.bows);
  const toggle = async () => {
    const next = !bowed;
    setBowed(next);
    setBows((n) => n + (next ? 1 : -1));
    try {
      if (next) {
        await api.post('/api/cheers', { to: a.friendId, kind: 'bow', sessionId: a.sessionId });
      } else {
        await api.del(`/api/cheers/bow/${a.sessionId}`);
      }
    } catch {
      setBowed(!next);
      setBows((n) => n + (next ? -1 : 1));
    }
  };
  const verb =
    a.type === 'course' || a.type === 'talk' ? 'studied' : a.completed ? 'finished' : 'sat with';
  return (
    <div className={`activity${compact ? ' compact' : ''}`}>
      {showWho ? (
        <Avatar name={a.friendName} avatar={a.friendAvatar} id={a.friendId} size={36} />
      ) : (
        <span className="activity-cover">
          {a.type === 'timer' ? (
            <span className="activity-timer">
              <Icon name="breath" size={16} />
            </span>
          ) : (
            <Cover coverId={a.coverId} title={a.title} creator={a.creator} />
          )}
        </span>
      )}
      <div className="grow activity-body">
        <div className="activity-line">
          {showWho && <strong>{a.friendName} </strong>}
          {verb}{' '}
          {a.type === 'timer' ? (
            <span>an unguided sit</span>
          ) : (
            <Link to={`/m/${a.itemId}`}>{a.title}</Link>
          )}
        </div>
        <div className="sub">
          {a.minutes} min · {ago(a.at)}
        </div>
      </div>
      <button
        className={`bow-btn${bowed ? ' on' : ''}`}
        onClick={() => void toggle()}
        aria-pressed={bowed}
        aria-label={bowed ? 'Take back your bow' : `Bow to ${a.friendName}`}
        title={bowed ? 'You bowed' : 'Send a bow'}
      >
        <span aria-hidden="true">🙏</span>
        {bows > 0 && <span className="bow-n">{bows}</span>}
      </button>
    </div>
  );
}

function FindPeopleSheet({ onClose }: { onClose: () => void }) {
  const people = useApi<PersonDto[]>('/api/people');
  const { user } = useAuth();
  const act = async (p: PersonDto) => {
    if (p.relation === 'none' || p.relation === 'incoming') {
      await api.post(`/api/friends/${p.id}`).catch(() => {});
    } else if (p.relation === 'outgoing') {
      await api.del(`/api/friends/${p.id}`).catch(() => {});
    }
    people.reload();
    friendsChanged();
  };
  const list = people.data ?? [];
  return (
    <Sheet title="Add friends" onClose={onClose} labelId="find-people">
      <p className="sit-sheet-lede">
        Everyone who uses this ZenPort. A friend request is a question - they choose whether to
        answer.
      </p>
      {people.loading ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : list.length === 0 ? (
        <p className="notice">
          You are the only one here so far.
          {user?.role === 'admin' ? ' Invite someone from People.' : ''}
        </p>
      ) : (
        <div className="rowlist">
          {list.map((p) => (
            <div className="row person-row" key={p.id}>
              <Avatar name={p.name} avatar={p.avatar} id={p.id} size={38} />
              <div className="grow">
                <div>{p.name}</div>
                <div className="sub">@{p.username}</div>
              </div>
              {p.relation === 'friend' ? (
                <span className="badge badge-accent">Friends</span>
              ) : (
                <button
                  className={`btn btn-sm ${p.relation === 'none' || p.relation === 'incoming' ? 'btn-primary' : 'btn-quiet'}`}
                  onClick={() => void act(p)}
                >
                  {p.relation === 'none'
                    ? 'Add'
                    : p.relation === 'incoming'
                      ? 'Accept'
                      : 'Requested · undo'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {user?.role === 'admin' && (
        <Link className="ps-try" to="/people" onClick={onClose}>
          <Icon name="link" size={14} /> Someone new? Send them an invitation
        </Link>
      )}
    </Sheet>
  );
}

export function NudgeSheet({ friend, onClose }: { friend: FriendDto; onClose: () => void }) {
  const [message, setMessage] = useState(NUDGES[0]!);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    setError(null);
    try {
      await api.post('/api/cheers', { to: friend.id, kind: 'nudge', message });
      setSent(true);
      friendsChanged();
      window.setTimeout(onClose, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not send');
    }
  };
  return (
    <Sheet title={`Nudge ${friend.name}`} onClose={onClose} labelId="nudge">
      <p className="sit-sheet-lede">
        A gentle word on their Today page - once a day at most, so it stays gentle.
      </p>
      <div className="nudge-options" role="radiogroup" aria-label="Message">
        {NUDGES.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={message === n}
            className={`nudge-opt${message === n ? ' on' : ''}`}
            onClick={() => setMessage(n)}
          >
            {n}
          </button>
        ))}
      </div>
      {error && <p className="error-note">{error}</p>}
      <div className="rf-actions">
        <button className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => void send()} disabled={sent}>
          {sent ? (
            <>
              <Icon name="check" size={15} /> Sent
            </>
          ) : (
            'Send nudge'
          )}
        </button>
      </div>
    </Sheet>
  );
}
