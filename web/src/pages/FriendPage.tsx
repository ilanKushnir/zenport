/**
 * One friend, up close: their streak and the one you share, five weeks of
 * practice as a quiet heatmap, and what they sat with lately - as much as
 * they share. Ending the friendship lives at the bottom, out of the way.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { FriendProfileDto } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi, useRefreshOn } from '../hooks.ts';
import { Avatar, ErrorNote, Icon } from '../components/ui.tsx';
import { friendsChanged } from '../social.tsx';
import { ActivityRow, NudgeSheet, dayLine, ringOf } from './FriendsPage.tsx';

const SHARE_NOTE = {
  full: null,
  summary: 'Shares minutes and streaks, not what they practise.',
  off: 'Keeps their practice private - you are friends all the same.',
} as const;

export function FriendPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const profile = useApi<FriendProfileDto>(`/api/friends/${id}`);
  const [nudging, setNudging] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  useRefreshOn('zenport:friends', () => profile.reload());

  if (profile.error) {
    return (
      <>
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link to="/friends">Friends</Link>
        </nav>
        <ErrorNote message={profile.error} onRetry={profile.reload} />
      </>
    );
  }
  if (!profile.data) {
    return (
      <>
        <nav className="breadcrumbs" aria-label="Breadcrumb" style={{ marginBottom: 20 }}>
          <Link to="/friends">Friends</Link>
        </nav>
        <div className="friend-hero" aria-hidden="true">
          <div className="skeleton" style={{ width: 88, height: 88, borderRadius: '50%' }} />
          <div className="friend-hero-text">
            <div className="skeleton" style={{ width: '50%', height: 28 }} />
            <div className="skeleton" style={{ width: '70%', marginTop: 10 }} />
          </div>
        </div>
        <div className="skeleton" style={{ height: 160 }} />
      </>
    );
  }
  const { friend: f, days, recent } = profile.data;
  const max = Math.max(10, ...days.map((d) => d.minutes));
  const practisedToday = !!f.now || (f.today?.minutes ?? 0) > 0;
  const since = new Date(f.friendsSince).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb" style={{ marginBottom: 20 }}>
        <Link to="/friends">Friends</Link>
        <span className="sep">/</span>
        <span aria-current="page">{f.name}</span>
      </nav>

      <header className="friend-hero">
        <Avatar name={f.name} avatar={f.avatar} id={f.id} size={88} ring={ringOf(f)} />
        <div className="friend-hero-text">
          <h1>{f.name}</h1>
          <p className="sub">
            @{f.username} · friends since {since}
          </p>
          <p className={`friend-day${f.now ? ' live' : ''}`}>{dayLine(f)}</p>
          {SHARE_NOTE[f.shareLevel] && <p className="hint">{SHARE_NOTE[f.shareLevel]}</p>}
        </div>
        {!practisedToday && f.shareLevel !== 'off' && (
          <button
            className="btn btn-ghost"
            disabled={f.nudgedToday}
            onClick={() => setNudging(true)}
          >
            <Icon name="bell" size={15} /> {f.nudgedToday ? 'Nudged today' : 'Send a nudge'}
          </button>
        )}
      </header>

      {f.shareLevel !== 'off' && (
        <>
          <div className="stat-tiles">
            <div className="stat-tile">
              <strong>{f.streak ?? 0}</strong>
              <span>day streak</span>
            </div>
            <div className="stat-tile accent">
              <strong>{f.together ?? 0}</strong>
              <span>days together</span>
            </div>
            <div className="stat-tile">
              <strong>{profile.data.longestStreak ?? 0}</strong>
              <span>longest streak</span>
            </div>
            <div className="stat-tile">
              <strong>{Math.round(((profile.data.totalMinutes ?? 0) / 60) * 10) / 10}</strong>
              <span>hours practised</span>
            </div>
          </div>

          <section className="section" aria-labelledby="sec-five">
            <div className="section-head">
              <h2 id="sec-five">Five weeks</h2>
            </div>
            <div className="heatmap" role="img" aria-label="Practice over the last five weeks">
              {days.map((d) => (
                <span
                  key={d.day}
                  className="hm-cell"
                  style={{
                    opacity: d.minutes > 0 ? 0.3 + 0.7 * Math.min(1, d.minutes / max) : 1,
                  }}
                  data-on={d.minutes > 0 || undefined}
                  title={`${d.day}: ${d.minutes} min`}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {f.learning && (
        <section className="section" aria-labelledby="sec-studying">
          <div className="section-head">
            <h2 id="sec-studying">Studying</h2>
          </div>
          <Link className="friend-learning big" to={`/m/${f.learning.itemId}`}>
            <Icon name="book" size={16} />
            <span className="grow">{f.learning.title}</span>
            <span className="sub">
              {f.learning.done} of {f.learning.total} done
            </span>
          </Link>
        </section>
      )}

      {recent.length > 0 && (
        <section className="section" aria-labelledby="sec-recent">
          <div className="section-head">
            <h2 id="sec-recent">Lately</h2>
          </div>
          <div className="feed">
            {recent.map((a) => (
              <ActivityRow key={a.sessionId} a={a} />
            ))}
          </div>
        </section>
      )}

      <div className="friend-end">
        {confirmEnd ? (
          <>
            <span>Stop being friends with {f.name}? They will not be told.</span>
            <button className="btn btn-sm btn-quiet" onClick={() => setConfirmEnd(false)}>
              Keep
            </button>
            <button
              className="btn btn-sm btn-danger"
              onClick={() =>
                void api.del(`/api/friends/${f.id}`).then(() => {
                  friendsChanged();
                  navigate('/friends');
                })
              }
            >
              Remove friend
            </button>
          </>
        ) : (
          <button className="btn btn-sm btn-quiet" onClick={() => setConfirmEnd(true)}>
            Remove friend
          </button>
        )}
      </div>

      {nudging && <NudgeSheet friend={f} onClose={() => setNudging(false)} />}
    </>
  );
}
