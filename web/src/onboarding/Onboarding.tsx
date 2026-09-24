/**
 * First-run welcome.
 *
 * Shown once per account, gated on user_prefs.onboarded_at. Two jobs, and the
 * second matters more than the first: introduce what the four parts of the app
 * are for, and leave the person with the settings that make it theirs already
 * chosen. Every control here writes through to the real preference immediately,
 * so the tour is the configuration — there is no "and now go find Settings".
 *
 * It can be skipped from any step. Skipping still latches onboarded_at: being
 * asked twice is worse than missing the tour.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AiSettingsDto, ScanStateDto, UserPrefsDto } from '@zenport/shared';
import { useApi } from '../hooks.ts';
import { api } from '../api.ts';
import { useAuth } from '../App.tsx';
import { usePrefs, ACCENT_OPTIONS } from '../prefs.tsx';
import { Lockup, Wordmark } from '../components/Brand.tsx';
import { Icon, Slider } from '../components/ui.tsx';
import { playBell } from '../player/bell.ts';
import { LATEST_RELEASE_VERSION } from '../whatsnew/changelog.ts';
import { Scene, SceneCycle } from './scenes.tsx';
import { AiKeyForm } from '../components/AiPlanSheet.tsx';

const GOALS = [5, 10, 15, 20, 30, 45] as const;
const TIMERS = [3, 5, 10, 15, 20, 30, 45, 60] as const;

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { prefs, save } = usePrefs();
  const [step, setStep] = useState(0);
  const [aiSaved, setAiSaved] = useState(false);
  const ai = useApi<AiSettingsDto>('/api/ai/settings');
  const { user, refresh } = useAuth();
  const scan = useApi<ScanStateDto>('/api/library/scan-state');

  const steps = [
    { key: 'welcome', art: <Scene name="welcome" breathe /> },
    { key: 'library', art: <Scene name="kinds" /> },
    { key: 'shape', art: <SceneCycle /> },
    { key: 'sit', art: <Scene name="breathe" breathe /> },
    { key: 'rhythm', art: <Scene name="rhythm" /> },
    { key: 'ai', art: <Scene name="ai" /> },
    { key: 'friends', art: <Scene name="friends" /> },
    { key: 'feel', art: <Scene name="feel" /> },
    { key: 'ready', art: <Scene name="ready" /> },
  ];
  const last = steps.length - 1;

  // Stable identity so the key handler below can depend on it honestly
  // instead of re-subscribing on every render.
  const finish = useCallback(async () => {
    await save({ onboarded: true, seenVersion: LATEST_RELEASE_VERSION });
    onDone();
  }, [save, onDone]);

  // Arrow keys move between steps; Escape skips. Inputs keep their own arrow
  // behaviour, so the handler stands down while one has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement;
      if (typing) return;
      if (e.key === 'ArrowRight' && step < last) setStep((s) => s + 1);
      if (e.key === 'ArrowLeft' && step > 0) setStep((s) => s - 1);
      if (e.key === 'Escape') void finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, last, finish]);

  const indexed = scan.data?.counts.items ?? 0;
  const rootsOk = (scan.data?.roots ?? []).filter((r) => r.ok).length;

  // Portalled to <body>: replayed from Settings it would otherwise sit inside
  // the page, whose entrance animation captures position: fixed.
  return createPortal(
    <div className="ob-root" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="ob-aurora" aria-hidden="true" />
      <div className="ob-card">
        <div className="ob-head">
          <Lockup size={26} word={17} bloom={false} className="ob-lockup" />
          <button className="btn btn-sm btn-quiet ob-skip" onClick={() => void finish()}>
            Skip
          </button>
        </div>

        <div className="ob-body" key={steps[step]!.key}>
          <div className="ob-figure">{steps[step]!.art}</div>

          <div className="ob-copy">
            {step === 0 && (
              <>
                <h1 id="ob-title">
                  Welcome to <Wordmark size={28} className="wm-inline" />
                </h1>
                <p className="ob-lede">
                  A calm home for the recordings you own. Everything stays on your server.
                </p>
                <p className="ob-note">Two minutes to make it yours.</p>
              </>
            )}

            {step === 1 && (
              <>
                <h1 id="ob-title">Your library, in place</h1>
                {indexed > 0 ? (
                  <p className="ob-lede">
                    Found <strong>{indexed}</strong> {indexed === 1 ? 'recording' : 'recordings'}{' '}
                    {rootsOk > 1 ? `in ${rootsOk} folders` : ''} - read in place, never changed.
                  </p>
                ) : (
                  <p className="ob-lede">
                    Nothing yet - point <code>ZP_LIBRARY_DIRS</code> at your folders and it all
                    appears here, read-only.
                  </p>
                )}
                <ul className="ob-list">
                  <li>
                    <Icon name="lotus" /> Meditations, courses and talks, each on its shelf
                  </li>
                  <li>
                    <Icon name="video" /> Videos play here; lessons tick off as you go
                  </li>
                  <li>
                    <Icon name="heart" /> Star favourites for their own shelf
                  </li>
                  <li>
                    <Icon name="download" /> Download meditations to play offline
                  </li>
                </ul>
              </>
            )}

            {step === 2 && (
              <>
                <h1 id="ob-title">Shape it so it reads well</h1>
                <p className="ob-lede">
                  Any layout works; this one works best - a folder per creator, a folder or file per
                  piece.
                </p>
                <pre className="ob-tree" aria-label="Recommended folder layout">
                  {`Meditations
├─ Mira Solen           `}
                  <i>creator, or a pack</i>
                  {`
│  ├─ Morning Meditation  `}
                  <i>one meditation</i>
                  {`
│  │  ├─ 01 Intro.mp3
│  │  ├─ 02 Meditation.mp3
│  │  └─ cover.jpg
│  └─ Walking Sit.mp3     `}
                  <i>a file works too</i>
                  {`
└─ The Lantern Sessions`}
                </pre>
              </>
            )}

            {step === 3 && (
              <>
                <h1 id="ob-title">Or just breathe</h1>
                <p className="ob-lede">
                  A bowl to open, one to close, and a breath guide you can even feel on your phone.
                </p>
                <div className="ob-field">
                  <label htmlFor="ob-timer">Default length</label>
                  <div className="chip-row" id="ob-timer">
                    {TIMERS.map((m) => (
                      <button
                        key={m}
                        className="chip"
                        aria-pressed={prefs.defaultTimerMinutes === m}
                        onClick={() => void save({ defaultTimerMinutes: m })}
                      >
                        {m}m
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <h1 id="ob-title">Find a rhythm you'll keep</h1>
                <p className="ob-lede">A gentle daily target - or none at all.</p>
                <div className="ob-field">
                  <label htmlFor="ob-goal">Daily target</label>
                  <div className="chip-row" id="ob-goal">
                    {GOALS.map((m) => (
                      <button
                        key={m}
                        className="chip"
                        aria-pressed={prefs.dailyGoalMinutes === m}
                        onClick={() => void save({ dailyGoalMinutes: m })}
                      >
                        {m}m
                      </button>
                    ))}
                    <button
                      className="chip"
                      aria-pressed={prefs.dailyGoalMinutes === null}
                      onClick={() => void save({ dailyGoalMinutes: null })}
                    >
                      No target
                    </button>
                  </div>
                </div>
                <div className="ob-field">
                  <label htmlFor="ob-start">Open ZenPort on</label>
                  <div className="chip-row" id="ob-start">
                    <button
                      className="chip"
                      aria-pressed={prefs.startPage === 'today'}
                      onClick={() => void save({ startPage: 'today' })}
                    >
                      Today
                    </button>
                    <button
                      className="chip"
                      aria-pressed={prefs.startPage === 'library'}
                      onClick={() => void save({ startPage: 'library' })}
                    >
                      Library
                    </button>
                  </div>
                </div>
              </>
            )}

            {step === 5 && (
              <>
                <h1 id="ob-title">Let AI plan it</h1>
                <p className="ob-lede">
                  Share your goal and your time; it plans practice and study from your library, in
                  order.
                </p>
                <div className="ob-field">
                  {ai.data?.sharedBy && !ai.data.configured ? (
                    <p className="ob-note ob-ok">
                      <Icon name="check" size={15} /> Ready - {ai.data.sharedBy} shares their key
                      here. Find it under Plans → Plan with AI.
                    </p>
                  ) : aiSaved || ai.data?.configured ? (
                    <p className="ob-note ob-ok">
                      <Icon name="check" size={15} /> Your key is set. Find it under Plans → Plan
                      with AI.
                    </p>
                  ) : (
                    <AiKeyForm compact onSaved={() => setAiSaved(true)} />
                  )}
                </div>
                <p className="ob-note">Optional - uses your own OpenAI key. Also in Settings.</p>
              </>
            )}

            {step === 6 && (
              <>
                <h1 id="ob-title">Practise together</h1>
                <p className="ob-lede">
                  Friends see each other&apos;s day: a ring once you have sat, a bow for a good sit,
                  a gentle nudge, an invitation to sit with the same recording.
                </p>
                <div className="ob-field">
                  <label>What friends see</label>
                  <div className="chip-row">
                    {(
                      [
                        ['full', 'Everything'],
                        ['summary', 'Just the numbers'],
                        ['off', 'Nothing'],
                      ] as const
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        className="chip"
                        aria-pressed={(user?.shareLevel ?? 'full') === v}
                        onClick={() =>
                          void api
                            .patch('/api/auth/me', { shareLevel: v })
                            .then(refresh)
                            .catch(() => {})
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="ob-note">
                  Only friends you accept - never anyone else. Find them under Friends.
                </p>
              </>
            )}

            {step === 7 && (
              <>
                <h1 id="ob-title">Make it yours</h1>
                <div className="ob-field">
                  <label>Accent</label>
                  <div className="accent-row">
                    {ACCENT_OPTIONS.map((a) => (
                      <button
                        key={a.key}
                        className={`accent-swatch accent-${a.key}`}
                        aria-pressed={prefs.accent === a.key}
                        aria-label={`${a.label} - ${a.note}`}
                        title={`${a.label} - ${a.note}`}
                        onClick={() => void save({ accent: a.key })}
                      >
                        <span className="sw" />
                        <span className="nm">{a.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ob-field">
                  <label>Bell</label>
                  <div className="chip-row">
                    <button
                      className="chip"
                      aria-pressed={prefs.bellEnabled}
                      onClick={() => void save({ bellEnabled: !prefs.bellEnabled })}
                    >
                      <Icon name="bell" size={15} />
                      {prefs.bellEnabled ? 'On' : 'Off'}
                    </button>
                    <button
                      className="chip"
                      disabled={!prefs.bellEnabled}
                      onClick={() => playBell(prefs.bellVolume)}
                    >
                      Hear it
                    </button>
                  </div>
                  {prefs.bellEnabled && (
                    <Slider
                      className="ob-range"
                      value={prefs.bellVolume}
                      max={1}
                      step={0.05}
                      label="Bell volume"
                      valueText={`${Math.round(prefs.bellVolume * 100)}%`}
                      onCommit={(v) => {
                        void save({ bellVolume: v });
                        playBell(v);
                      }}
                    />
                  )}
                </div>

                <div className="ob-field">
                  <label>Motion</label>
                  <div className="chip-row">
                    <button
                      className="chip"
                      aria-pressed={!prefs.calmMotion}
                      onClick={() => void save({ calmMotion: !prefs.calmMotion })}
                    >
                      {prefs.calmMotion ? 'Stillness' : 'Gentle motion'}
                    </button>
                    <button
                      className="chip"
                      aria-pressed={prefs.ambientBackground}
                      onClick={() => void save({ ambientBackground: !prefs.ambientBackground })}
                    >
                      Ambient background
                    </button>
                  </div>
                </div>
              </>
            )}

            {step === 8 && (
              <>
                <h1 id="ob-title">That's everything</h1>
                <p className="ob-lede">
                  Today is home: your plan, where you left off, one tap to begin.
                </p>
                <Summary prefs={prefs} indexed={indexed} />
                <p className="ob-note">
                  Press <kbd>⌘</kbd>
                  <kbd>K</kbd> anywhere to jump to a meditation, start a timer, or change a setting.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="ob-foot">
          <div className="ob-dots" role="tablist" aria-label="Welcome steps">
            {steps.map((s, i) => (
              <button
                key={s.key}
                role="tab"
                className={`ob-dot${i === step ? ' on' : ''}${i < step ? ' done' : ''}`}
                aria-selected={i === step}
                aria-label={`Step ${i + 1} of ${steps.length}`}
                onClick={() => setStep(i)}
              />
            ))}
          </div>
          <div className="ob-actions">
            {step > 0 && (
              <button className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>
                Back
              </button>
            )}
            {step < last ? (
              <button className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>
                Continue
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => void finish()}>
                Begin
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Summary({ prefs, indexed }: { prefs: UserPrefsDto; indexed: number }) {
  const rows: [string, string][] = [
    ['Library', indexed > 0 ? `${indexed} indexed` : 'waiting for a folder'],
    ['Daily target', prefs.dailyGoalMinutes ? `${prefs.dailyGoalMinutes} min` : 'none'],
    ['Timer', `${prefs.defaultTimerMinutes} min`],
    ['Bell', prefs.bellEnabled ? 'on' : 'off'],
    ['Opens on', prefs.startPage === 'today' ? 'Today' : 'Library'],
  ];
  return (
    <dl className="ob-summary">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
