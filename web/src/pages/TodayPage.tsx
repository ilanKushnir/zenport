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
import { formatDuration, seriesFavoriteKey } from '@zenport/shared';
import { useApi, useRefreshOn } from '../hooks.ts';
import { usePrefs } from '../prefs.tsx';
import { planNext } from './PlansPage.tsx';
import { groupSeries, itemLabel, TYPE_META } from '../content.ts';
import { Cover, EmptyState, Icon, SkeletonGrid } from '../components/ui.tsx';
import { MedCard, SeriesCard } from './LibraryPage.tsx';
import { FriendsToday } from '../components/FriendsToday.tsx';
import { FeaturedToday } from '../components/FeaturedToday.tsx';

export function TodayPage() {
  const navigate = useNavigate();
  const { prefs, favorites } = usePrefs();
  const lib = useApi<LibraryDto>('/api/library');
  useRefreshOn('zenport:progress', () => lib.reload());
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

  // Starred recordings, and series starred as a whole.
  const starred = useMemo(() => {
    const series = groupSeries(items).series.filter((s) =>
      favorites.has(seriesFavoriteKey(s.creator, s.name)),
    );
    const singles = items.filter((i) => favorites.has(i.id));
    return [
      ...series.map((s) => ({ key: `s:${s.key}`, series: s })),
      ...singles.map((i) => ({ key: i.id, item: i })),
    ].slice(0, 6);
  }, [items, favorites]);

  /**
   * One suggestion, chosen without randomness so it does not change under the
   * reader between renders: today's plan first, then the last thing practised,
   * then a favourite, then whatever was added most recently.
   */
  const suggestion = useMemo(() => {
    const fromPlan = todayOcc
      .filter((o) => o.focus !== 'learning')
      .map((o) => planNext(o.meditationIds, byId, 'practice'))
      .find(Boolean);
    if (fromPlan) return { item: fromPlan, tag: { icon: 'plans', label: 'Your plan' } };
    if (recent[0]) return { item: recent[0], tag: { icon: 'history', label: 'Last time' } };
    const fav = starred.find((f) => 'item' in f);
    if (fav && 'item' in fav) return { item: fav.item, tag: { icon: 'heart', label: 'Favourite' } };
    const newest = [...items].sort((a, b) => b.addedAt.localeCompare(a.addedAt))[0];
    if (newest) return { item: newest, tag: { icon: 'sparkle', label: 'New' } };
    return null;
  }, [todayOcc, byId, recent, starred, items]);

  /**
   * The next lesson: a learning plan due today first, else the course or talk
   * most recently part-way through.
   */
  const learnNext = useMemo(() => {
    const fromPlan = todayOcc
      .filter((o) => o.focus === 'learning')
      .map((o) => planNext(o.meditationIds, byId, 'learning'))
      .find(Boolean);
    if (fromPlan) return { item: fromPlan, tag: { icon: 'plans', label: 'Your plan' } };
    const going = (history.data ?? [])
      .map((h) => byId.get(h.meditationId))
      .find(
        (i) => i && (i.type === 'course' || i.type === 'talk') && i.completedCount < i.trackCount,
      );
    return going
      ? {
          item: going,
          tag: { icon: TYPE_META[going.type].icon, label: TYPE_META[going.type].label },
        }
      : null;
  }, [todayOcc, byId, history.data]);

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
          art="empty-today"
          action={
            <Link className="btn btn-primary" to="/breathe">
              Sit without a recording
            </Link>
          }
        >
          Point <code>ZP_LIBRARY_DIRS</code> at a folder of recordings and they will appear here. In
          the meantime the timer works on its own - a silent sit counts just the same.
        </EmptyState>
      ) : (
        <>
          <section className="section begin-row" aria-labelledby="sec-begin">
            <div className="section-head">
              <h2 id="sec-begin">Begin</h2>
            </div>
            <div className="begin-grid">
              <div className="begin-main">
                {suggestion && (
                  <button
                    className="begin-card begin-primary"
                    onClick={() => navigate(`/m/${suggestion.item!.id}`)}
                    aria-label={`${suggestion.tag.label}: ${itemLabel(suggestion.item!)}`}
                  >
                    <Cover
                      coverId={suggestion.item!.coverId}
                      title={suggestion.item!.title}
                      creator={suggestion.item!.creator}
                      className="begin-cover"
                    />
                    <span className="begin-text">
                      <span className="begin-tag">
                        <Icon name={suggestion.tag.icon} size={12} /> {suggestion.tag.label}
                      </span>
                      <span className="ttl">{itemLabel(suggestion.item!)}</span>
                      <span className="sub">
                        {suggestion.item!.creator}
                        {suggestion.item!.totalDurationSec
                          ? ` · ${formatDuration(suggestion.item!.totalDurationSec)}`
                          : ''}
                      </span>
                    </span>
                    <span className="begin-go" aria-hidden="true">
                      <Icon name="play" size={20} />
                    </span>
                  </button>
                )}

                {learnNext && learnNext.item.id !== suggestion?.item?.id && (
                  <button
                    className="begin-card begin-learn"
                    onClick={() => navigate(`/m/${learnNext.item.id}`)}
                    aria-label={`Continue ${itemLabel(learnNext.item)}`}
                  >
                    <Cover
                      coverId={learnNext.item.coverId}
                      title={learnNext.item.title}
                      creator={learnNext.item.creator}
                      className="begin-cover"
                    />
                    <span className="begin-text">
                      <span className="begin-tag">
                        <Icon name={learnNext.tag.icon} size={12} /> {learnNext.tag.label}
                      </span>
                      <span className="ttl">{itemLabel(learnNext.item)}</span>
                      {learnNext.item.trackCount > 1 ? (
                        <span className="begin-progress">
                          <span className="begin-bar" aria-hidden="true">
                            <span
                              style={{
                                inlineSize: `${Math.round((learnNext.item.completedCount / learnNext.item.trackCount) * 100)}%`,
                              }}
                            />
                          </span>
                          <span className="sub">
                            {learnNext.item.completedCount} of {learnNext.item.trackCount}
                          </span>
                        </span>
                      ) : (
                        <span className="sub">{learnNext.item.creator}</span>
                      )}
                    </span>
                    <span className="begin-go" aria-hidden="true">
                      <Icon name="play" size={20} />
                    </span>
                  </button>
                )}
              </div>

              <div className="begin-quick">
                <Link className="begin-tile" to="/breathe">
                  <span className="begin-tile-ic" aria-hidden="true">
                    <Icon name="timer" size={21} />
                  </span>
                  <span className="begin-text">
                    <span className="ttl">Breathe</span>
                    <span className="sub">{prefs.defaultTimerMinutes} min</span>
                  </span>
                </Link>
                <Link className="begin-tile begin-write" to="/journal">
                  <span className="begin-tile-ic" aria-hidden="true">
                    <Icon name="journal" size={21} />
                  </span>
                  <span className="begin-text">
                    <span className="ttl">Write</span>
                    <span className="sub">Journal</span>
                  </span>
                </Link>
              </div>
            </div>
          </section>

          <FeaturedToday />

          <FriendsToday />

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
                  const learning = o.focus === 'learning';
                  const first = planNext(o.meditationIds, byId, learning ? 'learning' : 'practice');
                  return (
                    <div className="row" key={`${o.planId}-${o.date}`}>
                      <Icon name={learning ? 'book' : 'lotus'} />
                      <div className="grow">
                        <div>{o.planName}</div>
                        <div className="sub">
                          {first
                            ? `${itemLabel(first)}${
                                learning && first.trackCount > 1
                                  ? ` · ${TYPE_META[first.type].part} ${Math.min(first.completedCount + 1, first.trackCount)}`
                                  : ''
                              }`
                            : 'Any meditation you choose'}
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
                {starred.map((f) =>
                  'series' in f ? (
                    <SeriesCard key={f.key} series={f.series} />
                  ) : (
                    <MedCard key={f.key} item={f.item} />
                  ),
                )}
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
  if (nothingIndexed) return 'Your library is empty - but the timer is ready whenever you are.';
  const m = Math.round(minutes);
  const mins = `${m} ${m === 1 ? 'minute' : 'minutes'}`;
  if (minutes > 0 && goal !== null && minutes >= goal) {
    return `${mins} today - you've met your target. Anything more is a gift.`;
  }
  if (minutes > 0) return `${mins} so far today.`;
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
