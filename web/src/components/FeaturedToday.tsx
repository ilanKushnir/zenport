/**
 * Featured on Today (opt-in): three recordings your AI picked for today from
 * your history and intentions - not your plan - each with why it fits now.
 * Turned off, it offers itself once (only to someone with an AI to use) and
 * then stays out of the way.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AiSettingsDto, FeaturedDto } from '@zenport/shared';
import { formatDuration } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { usePrefs } from '../prefs.tsx';
import { itemLabel, TYPE_META } from '../content.ts';
import { Cover, Icon } from './ui.tsx';

const INVITE_KEY = 'zp-featured-invite-closed';
const inviteClosed = () => {
  try {
    return localStorage.getItem(INVITE_KEY) === '1';
  } catch {
    return false;
  }
};

export function FeaturedToday() {
  const { prefs, ready } = usePrefs();
  if (!ready) return null;
  return prefs.aiFeatured ? <Featured /> : <Invite />;
}

function Invite() {
  const { save } = usePrefs();
  const ai = useApi<AiSettingsDto>('/api/ai/settings');
  const [closed, setClosed] = useState(inviteClosed);
  const a = ai.data;
  const usable =
    !!a?.canUse && (a.configured || !a.sharedFeatures || a.sharedFeatures.includes('featured'));
  if (closed || !usable) return null;
  const close = () => {
    try {
      localStorage.setItem(INVITE_KEY, '1');
    } catch {
      /* a convenience only */
    }
    setClosed(true);
  };
  return (
    <section className="section" aria-labelledby="sec-feat">
      <div className="section-head">
        <h2 id="sec-feat">
          <Icon name="sparkle" size={16} /> For you today
        </h2>
      </div>
      <div className="feat-invite">
        <div className="feat-ghosts" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="feat-invite-text">
          <strong>Three from your library, picked each day</strong>
          <span className="sub">
            Your AI chooses from what you practise and why you practise - never your plan - and says
            why each fits today.
          </span>
        </div>
        <div className="feat-invite-actions">
          <button className="btn btn-sm btn-ghost" onClick={close}>
            Not now
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => void save({ aiFeatured: true })}
          >
            <Icon name="sparkle" size={14} /> Turn on
          </button>
        </div>
      </div>
    </section>
  );
}

function Featured() {
  const featured = useApi<FeaturedDto>('/api/ai/featured');
  const [again, setAgain] = useState(false);
  const f = featured.data;

  const pickAgain = async () => {
    setAgain(true);
    try {
      await api.post('/api/ai/featured/refresh');
    } finally {
      featured.reload();
      setAgain(false);
    }
  };

  if (f && !f.canUse && f.picks.length === 0) {
    return (
      <section className="section" aria-labelledby="sec-feat">
        <div className="section-head">
          <h2 id="sec-feat">For you today</h2>
        </div>
        <p className="feat-quiet">
          Your AI is not connected any more. <Link to="/ai/setup?return=/">Set it up</Link> to get
          today&apos;s picks.
        </p>
      </section>
    );
  }

  const loading = (featured.loading && !f) || again;
  return (
    <section className="section" aria-labelledby="sec-feat" aria-busy={loading || undefined}>
      <div className="section-head">
        <h2 id="sec-feat">
          <Icon name="sparkle" size={16} /> For you today
        </h2>
        <button
          className="icon-btn"
          onClick={() => void pickAgain()}
          disabled={loading}
          aria-label="Pick again"
          title="Pick again"
        >
          <Icon name="restart" size={16} />
        </button>
      </div>
      {loading ? (
        <div className="feat-list" aria-label="Your AI is choosing">
          {[0, 1, 2].map((n) => (
            <div key={n} className="feat-card skeleton" />
          ))}
        </div>
      ) : f && f.picks.length > 0 ? (
        <div className="feat-list">
          {f.picks.map((p) => (
            <Link key={p.item.id} className="feat-card" to={`/m/${p.item.id}`}>
              <Cover coverId={p.item.coverId} title={p.item.title} className="feat-cover" />
              <span className="feat-text">
                <span className="feat-title">{itemLabel(p.item)}</span>
                <span className="feat-meta">
                  {TYPE_META[p.item.type].label}
                  {p.item.totalDurationSec ? ` · ${formatDuration(p.item.totalDurationSec)}` : ''}
                  {` · ${p.item.creator}`}
                </span>
                <span className="feat-why">{p.why}</span>
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="feat-quiet">
          {f?.error ?? featured.error ?? 'Nothing picked yet.'}{' '}
          <button className="linkish" onClick={() => void pickAgain()}>
            Try again
          </button>
        </p>
      )}
    </section>
  );
}
