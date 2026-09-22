/**
 * Today — the landing page.
 *
 * The library grid used to be the front door, which meant opening the app
 * asked "which of these ninety recordings?" before it offered anything. This
 * page answers the only question that matters on arrival — what would I do
 * right now — and puts a single tap under each answer: finish what you
 * started, the thing you planned, a favourite, or silence.
 *
 * Everything here is derived from data the app already has. Nothing is
 * invented, and nothing shows a number it cannot back up: with no history the
 * ring and streak stay out of the way instead of displaying a proud zero.
 */
import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { LibraryDto, PlanOccurrenceDto, PracticeSessionDto, StatsDto } from '@zenport/shared';
import { formatDuration } from '@zenport/shared';
import { useApi } from '../hooks.ts';
import { usePrefs } from '../prefs.tsx';
import { Cover, EmptyState, Icon, SkeletonGrid } from '../components/ui.tsx';
import { MedCard } from './LibraryPage.tsx';

export function TodayPage() {
  const navigate = useNavigate();
  const { prefs, favorites } = usePrefs();
  const lib = useApi<LibraryDto>('/api/library');
  const stats = useApi<StatsDto>('/api/stats');
  const history = useApi<PracticeSessionDto[]>('/api/practice/history?limit=20');
  const plans = useApi<{ today: string; occurrences: PlanOccurrenceDto[] }>(
    '/api/plans/occurrences?days=1',
  );

  const items = useMemo(() => (lib.data?.items ?? []).filter((i) => !i.missing), [lib.data]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const todayKey = plans.data?.today ?? new Date().toISOString().slice(0, 10);
  const todayMinutes =
    stats.data?.weekTrend.find((b) => b.bucket === todayKey)?.minutes ??
    stats.data?.monthTrend.find((b) => b.bucket === todayKey)?.minutes ??
    0;
  const goal = prefs.dailyGoalMinutes;
  const streak = stats.data?.currentStreak ?? 0;

  const todayOcc = (plans.data?.occurrences ?? []).filter((o) => o.status === 'today');

  /** Most recent distinct meditations, newest first, still present in the library. */
  const recent = useMemo(() => {
    const seen = new Set<string>();
    const out = [];
    for (const s of history.data ?? []) {
      if (seen.has(s.meditationId)) continue;
      const item = byId.get(s.meditationId);
      if (!item) continue;
      seen.add(s.meditationId);
      out.push(item);
      if (out.length >= 6) break;
    }
    return out;
  }, [history.data, byId]);

  const starred = useMemo(
    () => items.filter((i) => favorites.has(i.id)).slice(0, 6),
    [items, favorites],
  );

  /**
   * One suggestion, chosen without randomness so it does not change under the
   * reader between renders: today's plan first, then the last thing practised,
   * then a favourite, then whatever was added most recently.
   */
  const suggestion = useMemo(() => {
    const planned = todayOcc.flatMap((o) => o.meditationIds).map((id) => byId.get(id));
    const fromPlan = planned.find(Boolean);
    if (fromPlan) return { item: fromPlan, why: 'From your plan for today' };
    if (recent[0]) return { item: recent[0], why: 'You were here last' };
    if (starred[0]) return { item: starred[0], why: 'One of your favourites' };
    const newest = [...items].sort((a, b) => b.addedAt.localeCompare(a.addedAt))[0];
    if (newest) return { item: newest, why: 'Most recently added to your library' };
    return null;
  }, [todayOcc, byId, recent, starred, items]);

  if (lib.loading) {
    return (
      <>
        <div className="page-head">
          <h1>{greeting()}</h1>
        </div>
        <SkeletonGrid count={4} />
      </>
    );
  }

  const nothingIndexed = items.length === 0;

  return (
    <>
      <div className="page-head today-head">
        <div>
          <h1>{greeting()}</h1>
          <p className="lede">{subtitle(todayMinutes, goal, streak, nothingIndexed)}</p>
        </div>
        {!nothingIndexed && goal !== null && (
          <GoalRing minutes={todayMinutes} goal={goal} streak={streak} />
        )}
      </div>

      {nothingIndexed ? (
        <EmptyState
          title="Nothing indexed yet"
          action={
            <Link className="btn btn-primary" to="/timer">
              Sit without a recording
            </Link>
          }
        >
          Point <code>ZP_LIBRARY_DIRS</code> at a folder of recordings and they will appear here. In
          the meantime the timer works on its own — a silent sit counts just the same.
        </EmptyState>
      ) : (
        <>
          <section className="section begin-row" aria-labelledby="sec-begin">
            <div className="section-head">
              <h2 id="sec-begin">Begin</h2>
            </div>
            <div className="begin-grid">
              {suggestion && (
                <button
                  className="begin-card begin-primary"
                  onClick={() => navigate(`/m/${suggestion.item!.id}`)}
                >
                  <Cover
                    coverId={suggestion.item!.coverId}
                    title={suggestion.item!.title}
                    creator={suggestion.item!.creator}
                    className="begin-cover"
                  />
                  <div className="begin-text">
                    <span className="why">{suggestion.why}</span>
                    <span className="ttl">{suggestion.item!.title}</span>
                    <span className="sub">
                      {suggestion.item!.creator}
                      {suggestion.item!.totalDurationSec
                        ? ` · ${formatDuration(suggestion.item!.totalDurationSec)}`
                        : ''}
                    </span>
                  </div>
                  <span className="begin-go" aria-hidden="true">
                    <Icon name="play" size={20} />
                  </span>
                </button>
              )}

              <Link className="begin-card begin-alt" to="/timer">
                <span className="begin-ic">
                  <Icon name="timer" size={22} />
                </span>
                <div className="begin-text">
                  <span className="ttl">Sit in silence</span>
                  <span className="sub">{prefs.defaultTimerMinutes} minutes, bell to close</span>
                </div>
              </Link>

              <Link className="begin-card begin-alt" to="/journal">
                <span className="begin-ic">
                  <Icon name="journal" size={22} />
                </span>
                <div className="begin-text">
                  <span className="ttl">Write something down</span>
                  <span className="sub">A line now is worth pages later</span>
                </div>
              </Link>
            </div>
          </section>

          {todayOcc.length > 0 && (
            <section className="section" aria-labelledby="sec-plan">
              <div className="section-head">
                <h2 id="sec-plan">Planned for today</h2>
                <Link className="more" to="/plans">
                  All plans
                </Link>
              </div>
              <div className="rowlist card" style={{ padding: '4px 16px' }}>
                {todayOcc.map((o) => {
                  const first = o.meditationIds.map((id) => byId.get(id)).find(Boolean);
                  return (
                    <div className="row" key={`${o.planId}-${o.date}`}>
                      <Icon name="plans" />
                      <div className="grow">
                        <div>{o.planName}</div>
                        <div className="sub">
                          {first ? first.title : 'Any meditation you choose'}
                        </div>
                      </div>
                      {first && (
                        <Link className="btn btn-sm btn-ghost" to={`/m/${first.id}`}>
                          Begin
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {starred.length > 0 && (
            <section className="section" aria-labelledby="sec-fav">
              <div className="section-head">
                <h2 id="sec-fav">Favourites</h2>
                <Link className="more" to="/?favorites=1">
                  All starred
                </Link>
              </div>
              <div className="card-grid">
                {starred.map((item) => (
                  <MedCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}

          {recent.length > 0 && (
            <section className="section" aria-labelledby="sec-recent">
              <div className="section-head">
                <h2 id="sec-recent">Pick up again</h2>
                <Link className="more" to="/stats">
                  Practice history
                </Link>
              </div>
              <div className="card-grid">
                {recent.map((item) => (
                  <MedCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Still awake';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Winding down';
}

function subtitle(
  minutes: number,
  goal: number | null,
  streak: number,
  nothingIndexed: boolean,
): string {
  if (nothingIndexed) return 'Your library is empty — but the timer is ready whenever you are.';
  if (minutes > 0 && goal !== null && minutes >= goal) {
    return `${Math.round(minutes)} minutes today — you've met your target. Anything more is a gift.`;
  }
  if (minutes > 0) return `${Math.round(minutes)} minutes so far today.`;
  if (streak > 1) return `${streak} days in a row. Today is open.`;
  return 'Nothing yet today. A few minutes is plenty.';
}

/** Today's minutes against the target, with the streak in the middle. */
function GoalRing({ minutes, goal, streak }: { minutes: number; goal: number; streak: number }) {
  const pct = Math.min(1, goal > 0 ? minutes / goal : 0);
  const r = 30;
  const c = 2 * Math.PI * r;
  const met = pct >= 1;
  return (
    <div className="goal-ring" title={`${Math.round(minutes)} of ${goal} minutes today`}>
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <defs>
          <linearGradient
            id="gr-sweep"
            x1="6"
            y1="12"
            x2="66"
            y2="60"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FFC04A" />
            <stop offset="50%" stopColor="#F04C8A" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
        </defs>
        <circle cx="36" cy="36" r={r} stroke="var(--hairline)" strokeWidth="6" fill="none" />
        <circle
          cx="36"
          cy="36"
          r={r}
          stroke="url(#gr-sweep)"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c * pct} ${c}`}
          transform="rotate(-90 36 36)"
        />
      </svg>
      <div className="goal-mid">
        {streak > 0 ? (
          <>
            <span className="n">{streak}</span>
            <span className="l">day{streak === 1 ? '' : 's'}</span>
          </>
        ) : (
          <span className="l">{met ? 'done' : `${Math.round(pct * 100)}%`}</span>
        )}
      </div>
      <span className="sr-only">
        {Math.round(minutes)} of {goal} minutes practised today
        {streak > 0 ? `, ${streak} day streak` : ''}
      </span>
    </div>
  );
}
