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
import type { ScanStateDto, UserPrefsDto } from '@zenport/shared';
import { useApi } from '../hooks.ts';
import { usePrefs, ACCENT_OPTIONS } from '../prefs.tsx';
import { Logo, Wordmark } from '../components/Brand.tsx';
import { Icon } from '../components/ui.tsx';
import { playBell } from '../player/bell.ts';
import { LATEST_RELEASE_VERSION } from '../whatsnew/changelog.ts';
import { Scene, SceneCycle } from './scenes.tsx';

const GOALS = [5, 10, 15, 20, 30, 45] as const;
const TIMERS = [3, 5, 10, 15, 20, 30, 45, 60] as const;

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { prefs, save } = usePrefs();
  const [step, setStep] = useState(0);
  const scan = useApi<ScanStateDto>('/api/library/scan-state');

  const steps = [
    { key: 'welcome', art: <Scene name="welcome" breathe /> },
    { key: 'library', art: <Scene name="library" /> },
    { key: 'shape', art: <SceneCycle /> },
    { key: 'sit', art: <Scene name="sit" /> },
    { key: 'rhythm', art: <Scene name="rhythm" /> },
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

  return (
    <div className="ob-root" role="dialog" aria-modal="true" aria-labelledby="ob-title">
      <div className="ob-aurora" aria-hidden="true" />
      <div className="ob-card">
        <div className="ob-head">
          <Logo size={26} bloom={false} />
          <Wordmark size={16} />
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
                  A calm home for the meditation recordings you already own. Everything stays on
                  your server - nothing is uploaded, nothing phones home, and your journal is yours
                  alone.
                </p>
                <p className="ob-note">
                  Two minutes here and the app will already be set up the way you like it. You can
                  change any of it later in Settings.
                </p>
              </>
            )}

            {step === 1 && (
              <>
                <h1 id="ob-title">Your library, in place</h1>
                {indexed > 0 ? (
                  <p className="ob-lede">
                    ZenPort has already found <strong>{indexed}</strong>{' '}
                    {indexed === 1 ? 'recording' : 'recordings'} in{' '}
                    {rootsOk === 1 ? 'your folder' : `${rootsOk} folders`}. It reads them where they
                    sit and never writes to them.
                  </p>
                ) : (
                  <p className="ob-lede">
                    Nothing is indexed yet. Point <code>ZP_LIBRARY_DIRS</code> at a folder of
                    recordings and they will appear here - read-only, exactly as you filed them.
                  </p>
                )}
                <ul className="ob-list">
                  <li>
                    <Icon name="library" /> Folders become meditations; covers and notes come along
                    with them
                  </li>
                  <li>
                    <Icon name="history" /> Rescans hourly, or whenever you ask
                  </li>
                  <li>
                    <Icon name="heart" /> Star the ones you return to - they get their own shelf
                  </li>
                </ul>
              </>
            )}

            {step === 2 && (
              <>
                <h1 id="ob-title">Shape it so it reads well</h1>
                <p className="ob-lede">
                  ZenPort reads most folder layouts, but one works best: a folder per creator - or
                  per pack, like The Lantern Sessions - and inside it a folder per meditation, or
                  plain audio files.
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
                <p className="ob-note">
                  Covers come from an image in the folder or from the audio's own tags. Not a must -
                  any other layout is scanned as best it can be, but this one lands every time.
                </p>
              </>
            )}

            {step === 3 && (
              <>
                <h1 id="ob-title">Or just breathe</h1>
                <p className="ob-lede">
                  Not every practice needs a recording. The timer gives you a bowl at the start,
                  optional bells along the way, and one to close - nothing else on screen.
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
                <p className="ob-note">
                  Both the timer and any recording you play count toward your practice history.
                </p>
              </>
            )}

            {step === 4 && (
              <>
                <h1 id="ob-title">Find a rhythm you'll keep</h1>
                <p className="ob-lede">
                  A daily target is the only number ZenPort nudges you with, and you choose it.
                  Leave it off if a streak would make this feel like homework.
                </p>
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
                <p className="ob-note">
                  Plans, in the sidebar, are for something more structured - a course you want to
                  walk through on set days.
                </p>
              </>
            )}

            {step === 5 && (
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
                    <input
                      className="ob-range"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={prefs.bellVolume}
                      aria-label="Bell volume"
                      onChange={(e) => void save({ bellVolume: Number(e.target.value) })}
                      onMouseUp={() => playBell(prefs.bellVolume)}
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
                  <p className="ob-note">
                    If your system already asks for reduced motion, ZenPort honours that whatever is
                    set here.
                  </p>
                </div>
              </>
            )}

            {step === 6 && (
              <>
                <h1 id="ob-title">That's everything</h1>
                <p className="ob-lede">
                  Today is your home page: what you planned, what you were part-way through, and a
                  way to begin in one tap.
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
    </div>
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
