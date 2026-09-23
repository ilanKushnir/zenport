/**
 * Plan with AI.
 *
 * Three short steps - what you want, how much time you have, what to draw
 * from - then the model reads a catalogue of the library and proposes an
 * ordered practice track and an ordered learning track. Nothing is saved until
 * the proposal is accepted, and accepting is ordinary plan creation: one plan
 * for practice, one for learning, each editable like any other.
 */
import { useEffect, useMemo, useState } from 'react';
import type {
  AiPlanProposalDto,
  AiPlanRequest,
  AiPlanTrackDto,
  AiSettingsDto,
  LibraryDto,
  PlanLevel,
} from '@zenport/shared';
import { formatDuration } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { TYPE_META } from '../content.ts';
import { Cover, Icon, Sheet, Switch } from './ui.tsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const IDEAS = [
  'Sleep better and wind down in the evenings',
  'Less stress through the working week',
  'Learn the foundations, then go deeper',
  'Heal and open the heart',
  'A steady daily habit, nothing fancy',
];
const THINKING = [
  'Reading your library…',
  'Finding where each series begins…',
  'Weighing practice against study time…',
  'Putting it in a sensible order…',
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  return iso(d);
};

function Stepper({
  value,
  min,
  max,
  onChange,
  unit,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  unit: string;
}) {
  return (
    <div className="ai-stepper">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Fewer"
      >
        −
      </button>
      <span>
        <b>{value}</b> {unit}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="More"
      >
        +
      </button>
    </div>
  );
}

function Choices<T extends string | number>({
  options,
  value,
  onChange,
  render,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  render: (v: T) => string;
  label: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o)}
          type="button"
          role="radio"
          aria-checked={o === value}
          className={`seg-opt${o === value ? ' on' : ''}`}
          onClick={() => onChange(o)}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}

export function AiPlanSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const settings = useApi<AiSettingsDto>('/api/ai/settings');
  const lib = useApi<LibraryDto>('/api/library');
  const [step, setStep] = useState<'goal' | 'time' | 'library' | 'thinking' | 'review'>('goal');

  const [goal, setGoal] = useState('');
  const [level, setLevel] = useState<PlanLevel>('some');
  const [practiceOn, setPracticeOn] = useState(true);
  const [practiceDays, setPracticeDays] = useState(5);
  const [practiceMin, setPracticeMin] = useState(20);
  const [learningOn, setLearningOn] = useState(true);
  const [learnWeek, setLearnWeek] = useState(90);
  const [learnDays, setLearnDays] = useState(2);
  const [timeOfDay, setTimeOfDay] = useState<AiPlanRequest['timeOfDay']>('morning');
  const [weeks, setWeeks] = useState(4);
  const [startDate, setStartDate] = useState(iso(new Date()));
  const [creators, setCreators] = useState<string[]>([]);
  const [includeFinished, setIncludeFinished] = useState(false);

  const [proposal, setProposal] = useState<AiPlanProposalDto | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [thought, setThought] = useState(0);

  const allCreators = useMemo(
    () =>
      [...new Set((lib.data?.items ?? []).filter((i) => !i.missing).map((i) => i.creator))].sort(),
    [lib.data],
  );

  useEffect(() => {
    if (step !== 'thinking') return;
    const t = window.setInterval(() => setThought((n) => (n + 1) % THINKING.length), 2600);
    return () => window.clearInterval(t);
  }, [step]);

  const request: AiPlanRequest = {
    goal,
    weeks,
    startDate,
    practice: practiceOn ? { daysPerWeek: practiceDays, minutes: practiceMin } : null,
    learning: learningOn ? { minutesPerWeek: learnWeek, daysPerWeek: learnDays } : null,
    timeOfDay,
    level,
    creators,
    includeFinished,
  };

  const generate = async () => {
    setError(null);
    setThought(0);
    setStep('thinking');
    try {
      const p = await api.post<AiPlanProposalDto>('/api/ai/plan', request);
      setProposal(p);
      setName(p.name);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The plan could not be made.');
      setStep('library');
    }
  };

  const accept = async () => {
    if (!proposal) return;
    setSaving(true);
    setError(null);
    const endDate = addDays(startDate, weeks * 7 - 1);
    const both = Boolean(proposal.practice && proposal.learning);
    const make = (track: AiPlanTrackDto, focus: 'practice' | 'learning') =>
      api.post('/api/plans', {
        name: both
          ? `${name.trim() || proposal.name} · ${focus === 'learning' ? 'Learning' : 'Practice'}`
          : name.trim() || proposal.name,
        intention: proposal.intention || null,
        startDate,
        endDate,
        daysOfWeek: track.daysOfWeek,
        preferredTime: track.preferredTime,
        targetMinutes: track.minutesPerSession,
        notes: `Planned with ${proposal.model}. ${proposal.summary}`.slice(0, 2000),
        meditationIds: track.items.map((i) => i.id),
        focus,
      });
    try {
      if (proposal.practice) await make(proposal.practice, 'practice');
      if (proposal.learning) await make(proposal.learning, 'learning');
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the plans.');
    } finally {
      setSaving(false);
    }
  };

  // No key yet: ask for one here rather than sending people off to Settings.
  if (settings.data && !settings.data.configured) {
    return (
      <Sheet title="Plan with AI" onClose={onClose} labelId="ai-plan">
        <AiKeyForm onSaved={settings.reload} />
      </Sheet>
    );
  }

  return (
    <Sheet title="Plan with AI" onClose={onClose} labelId="ai-plan">
      {step !== 'thinking' && step !== 'review' && (
        <ol className="ai-steps" aria-label="Steps">
          {(['goal', 'time', 'library'] as const).map((s, i) => (
            <li key={s} className={s === step ? 'on' : ''}>
              <span>{i + 1}</span>
              {s === 'goal' ? 'Intention' : s === 'time' ? 'Time' : 'Library'}
            </li>
          ))}
        </ol>
      )}

      {step === 'goal' && (
        <div className="ai-step">
          <label htmlFor="ai-goal" className="rf-label">
            What would you like from the next few weeks?
          </label>
          <textarea
            id="ai-goal"
            rows={3}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="In your own words - what you want to feel, change or learn."
          />
          <div className="rf-starters">
            {IDEAS.map((idea) => (
              <button key={idea} type="button" className="rf-starter" onClick={() => setGoal(idea)}>
                {idea}
              </button>
            ))}
          </div>
          <div className="field" style={{ marginTop: 20 }}>
            <label>Your experience</label>
            <Choices
              label="Experience"
              options={['new', 'some', 'experienced'] as const}
              value={level}
              onChange={setLevel}
              render={(v) => ({ new: 'New to this', some: 'Some', experienced: 'Experienced' })[v]}
            />
          </div>
          <div className="ai-nav">
            <span />
            <button className="btn btn-primary" onClick={() => setStep('time')}>
              Next
            </button>
          </div>
        </div>
      )}

      {step === 'time' && (
        <div className="ai-step">
          <div className="ai-block">
            <div className="set-switch sit-switch">
              <div>
                <div className="set-switch-t">
                  <Icon name="lotus" size={16} /> Practice
                </div>
                <div className="set-switch-h">Meditations and soundscapes.</div>
              </div>
              <Switch checked={practiceOn} onChange={setPracticeOn} label="Include practice" />
            </div>
            {practiceOn && (
              <div className="ai-row">
                <Stepper
                  value={practiceDays}
                  min={1}
                  max={7}
                  onChange={setPracticeDays}
                  unit="days a week"
                />
                <Choices
                  label="Minutes per practice"
                  options={[10, 15, 20, 30, 45, 60] as const}
                  value={practiceMin as 10}
                  onChange={setPracticeMin}
                  render={(v) => `${v}m`}
                />
              </div>
            )}
          </div>

          <div className="ai-block">
            <div className="set-switch sit-switch">
              <div>
                <div className="set-switch-t">
                  <Icon name="book" size={16} /> Learning
                </div>
                <div className="set-switch-h">Courses and talks.</div>
              </div>
              <Switch checked={learningOn} onChange={setLearningOn} label="Include learning" />
            </div>
            {learningOn && (
              <div className="ai-row">
                <Stepper
                  value={learnDays}
                  min={1}
                  max={7}
                  onChange={setLearnDays}
                  unit="days a week"
                />
                <Choices
                  label="Study time per week"
                  options={[30, 60, 90, 120, 180, 300] as const}
                  value={learnWeek as 30}
                  onChange={setLearnWeek}
                  render={(v) => (v < 60 ? `${v}m` : `${v / 60}h`)}
                />
                <p className="hint">a week</p>
              </div>
            )}
          </div>

          <div className="field">
            <label>Time of day</label>
            <Choices
              label="Time of day"
              options={['morning', 'midday', 'evening', 'any'] as const}
              value={timeOfDay}
              onChange={setTimeOfDay}
              render={(v) =>
                ({ morning: 'Morning', midday: 'Midday', evening: 'Evening', any: 'Any' })[v]
              }
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Plan length</label>
              <Choices
                label="Weeks"
                options={[2, 4, 6, 8, 12] as const}
                value={weeks as 2}
                onChange={setWeeks}
                render={(v) => `${v}w`}
              />
            </div>
            <div className="field">
              <label htmlFor="ai-start">Starting</label>
              <input
                id="ai-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
          </div>
          <div className="ai-nav">
            <button className="btn btn-quiet" onClick={() => setStep('goal')}>
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setStep('library')}
              disabled={!practiceOn && !learningOn}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 'library' && (
        <div className="ai-step">
          <div className="field">
            <label>Draw from</label>
            <div className="chip-row">
              <button
                type="button"
                className="chip"
                aria-pressed={creators.length === 0}
                onClick={() => setCreators([])}
              >
                Everyone
              </button>
              {allCreators.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="chip"
                  aria-pressed={creators.includes(c)}
                  onClick={() =>
                    setCreators((prev) =>
                      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                    )
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div className="set-switch sit-switch">
            <div>
              <div className="set-switch-t">Include what I have finished</div>
              <div className="set-switch-h">Otherwise the plan favours what is new to you.</div>
            </div>
            <Switch
              checked={includeFinished}
              onChange={setIncludeFinished}
              label="Include finished items"
            />
          </div>
          <p className="ai-privacy">
            <Icon name="sparkle" size={14} />
            Titles, creators, lengths and lesson names from your library go to OpenAI with your key
            ({settings.data?.model}) to make this plan. Nothing else, and only when you press Make
            my plan.
          </p>
          {error && <p className="error-note">{error}</p>}
          <div className="ai-nav">
            <button className="btn btn-quiet" onClick={() => setStep('time')}>
              Back
            </button>
            <button className="btn btn-primary" onClick={() => void generate()}>
              <Icon name="sparkle" size={16} /> Make my plan
            </button>
          </div>
        </div>
      )}

      {step === 'thinking' && (
        <div className="ai-thinking" role="status" aria-live="polite">
          <div className="ai-orb" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p key={thought}>{THINKING[thought]}</p>
          <span className="hint">This can take up to a minute.</span>
        </div>
      )}

      {step === 'review' && proposal && (
        <div className="ai-review">
          <input
            className="ai-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Plan name"
          />
          {proposal.intention && <p className="ai-intention">“{proposal.intention}”</p>}
          <p className="ai-summary">{proposal.summary}</p>

          {proposal.outline.length > 0 && (
            <ol className="ai-outline">
              {proposal.outline.map((o) => (
                <li key={o.week}>
                  <span>Week {o.week}</span>
                  {o.focus}
                </li>
              ))}
            </ol>
          )}

          {proposal.practice && <TrackPreview track={proposal.practice} focus="practice" />}
          {proposal.learning && <TrackPreview track={proposal.learning} focus="learning" />}

          {error && <p className="error-note">{error}</p>}
          <div className="ai-nav">
            <button className="btn btn-quiet" onClick={() => setStep('goal')}>
              Adjust
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => void generate()} disabled={saving}>
                Try again
              </button>
              <button className="btn btn-primary" onClick={() => void accept()} disabled={saving}>
                {saving
                  ? 'Saving…'
                  : proposal.practice && proposal.learning
                    ? 'Create both plans'
                    : 'Create the plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

function TrackPreview({ track, focus }: { track: AiPlanTrackDto; focus: 'practice' | 'learning' }) {
  const learning = focus === 'learning';
  return (
    <section className="ai-track">
      <header>
        <span className={`plan-focus ${learning ? 't-course' : 't-meditation'}`}>
          <Icon name={learning ? 'book' : 'lotus'} size={13} />
          {learning ? 'Learning' : 'Practice'}
        </span>
        <span className="ai-track-meta">
          {track.daysOfWeek.length === 0 || track.daysOfWeek.length === 7
            ? 'Every day'
            : track.daysOfWeek.map((d) => DAYS[d]).join(' · ')}
          {' · '}
          {track.minutesPerSession} min
          {track.preferredTime ? ` · ${track.preferredTime}` : ''}
        </span>
      </header>
      <ol className="ai-items">
        {track.items.map((it, n) => (
          <li key={it.id}>
            <span className="ai-n">{n + 1}</span>
            <span className="ai-cover">
              <Cover coverId={it.item.coverId} title={it.item.title} creator={it.item.creator} />
            </span>
            <span className="ai-item-body">
              <span className="t">
                {it.item.collection ? (
                  <span className="ai-series">{it.item.collection} · </span>
                ) : null}
                {it.item.title}
              </span>
              <span className="s">
                {TYPE_META[it.item.type].label} · {it.item.creator}
                {it.item.totalDurationSec ? ` · ${formatDuration(it.item.totalDurationSec)}` : ''}
              </span>
              {it.why && <span className="why">{it.why}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Add or replace the account's OpenAI key. Used here and in Settings. */
export function AiKeyForm({
  onSaved,
  compact = false,
}: {
  onSaved: () => void;
  compact?: boolean;
}) {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.put('/api/ai/settings', { apiKey: key.trim() });
      setKey('');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That key did not work.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="ai-key">
      {!compact && (
        <>
          <img className="ai-key-art" src="/art/ob-rhythm.webp" alt="" width={120} height={120} />
          <p className="sit-sheet-lede">
            ZenPort can read your library and build a plan around your time - with your own OpenAI
            key. It is stored encrypted on this server and never shown again.
          </p>
        </>
      )}
      <div className="ai-key-row">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="sk-…"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-label="OpenAI API key"
        />
        <button
          className="btn btn-primary"
          disabled={busy || key.trim().length < 20}
          onClick={() => void save()}
        >
          {busy ? 'Checking…' : 'Save key'}
        </button>
      </div>
      {error && <p className="error-note">{error}</p>}
      <p className="hint">
        Create one at platform.openai.com → API keys. Planning costs a few cents per plan on your
        account.
      </p>
    </div>
  );
}
