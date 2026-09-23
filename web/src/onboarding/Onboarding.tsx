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
import { usePrefs, ACCENT_OPTIONS } from '../prefs.tsx';
import { Logo, Wordmark } from '../components/Brand.tsx';
import { Icon } from '../components/ui.tsx';
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
  const scan = useApi<ScanStateDto>('/api/library/scan-state');

  const steps = [
    { key: 'welcome', art: <Scene name="welcome" breathe /> },
    { key: 'library', art: <Scene name="kinds" /> },
    { key: 'shape', art: <SceneCycle /> },
    { key: 'sit', art: <Scene name="breathe" breathe /> },
    { key: 'rhythm', art: <Scene name="rhythm" /> },
    { key: 'ai', art: <Scene name="ai" /> },
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
                    <Icon name="lotus" />
                    <span>
                      Meditations, courses, talks and soundscapes - each recognised and on its own
                      shelf. Wrong guess? Tap <em>Not right?</em>
                    </span>
                  </li>
                  <li>
                    <Icon name="video" /> Video courses play right here, and lessons tick themselves
                    off as you finish them
                  </li>
                  <li>
                    <Icon name="sparkle" /> No cover? It gets a painted one
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
                  Not every practice needs a recording. Breathe gives you a bowl to open, one to
                  close, and - if you like - a breath guide that swells and settles with you.
                </p>
                <ul className="ob-list">
                  <li>
                    <Icon name="breath" /> On a phone you can feel it too: taps that gather as you
                    breathe in and ease as you breathe out
                  </li>
                </ul>
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
                  A quiet sit counts toward your practice just like a recording does.
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
                <h1 id="ob-title">Let AI plan it</h1>
                <p className="ob-lede">
                  Tell it what you want and how much time you have. It reads your library and lays
                  out practice and study in the right order - series from the start, foundations
                  before depth - as plans you can edit.
                </p>
                <ul className="ob-list">
                  <li>
                    <Icon name="lotus" /> A practice plan: which meditations, which days, how long
                  </li>
                  <li>
                    <Icon name="book" /> A learning plan: courses and talks, lesson by lesson
                  </li>
                </ul>
                <div className="ob-field">
                  {aiSaved || ai.data?.configured ? (
                    <p className="ob-note ob-ok">
                      <Icon name="check" size={15} /> Your key is set. Find it under Plans → Plan
                      with AI.
                    </p>
                  ) : (
                    <AiKeyForm compact onSaved={() => setAiSaved(true)} />
                  )}
                </div>
                <p className="ob-note">
                  Uses your own OpenAI key - optional, and it can wait for Settings. Titles and
                  lengths are sent only when you ask for a plan.
                </p>
              </>
            )}

            {step === 6 && (
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

            {step === 7 && (
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
