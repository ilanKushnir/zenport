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
  AiPlanStageDto,
  AiSettingsDto,
  LibraryDto,
  MeditationSummaryDto,
  PlanApproach,
  PlanDto,
  PlanLevel,
} from '@zenport/shared';
import { AI_PROVIDERS, formatDuration } from '@zenport/shared';
import { api } from '../api.ts';
import { Link } from 'react-router-dom';
import { PickTag, standingOf } from './PickTag.tsx';
import { useApi } from '../hooks.ts';
import { TYPE_META } from '../content.ts';
import { Cover, Icon, Sheet, Switch } from './ui.tsx';
import { PlanGuideView } from './PlanGuide.tsx';

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

const APPROACHES: { value: PlanApproach; title: string; hint: string }[] = [
  {
    value: 'together',
    title: 'Side by side',
    hint: 'Study and practise in the same weeks.',
  },
  {
    value: 'learn-first',
    title: 'Learn first',
    hint: 'Courses one by one, from the basics up - then a meditation routine that climbs the levels.',
  },
  {
    value: 'alternate',
    title: 'Take turns',
    hint: 'A course, then a few weeks practising what it taught, then the next course.',
  },
  {
    value: 'ai',
    title: 'You choose',
    hint: 'The AI picks what suits your intention and your library.',
  },
];

/** Tiny diagrams of each approach: learning (book colour) and practice (lotus colour) over time. */
function ApproachGlyph({ kind }: { kind: PlanApproach }) {
  const L = 'var(--t-course)';
  const P = 'var(--t-meditation)';
  const bar = (x: number, y: number, w: number, c: string) => (
    <rect x={x} y={y} width={w} height={5} rx={2.5} fill={c} />
  );
  return (
    <svg viewBox="0 0 36 20" width="36" height="20">
      {kind === 'together' && (
        <>
          {bar(1, 3, 34, L)}
          {bar(1, 12, 34, P)}
        </>
      )}
      {kind === 'learn-first' && (
        <>
          {bar(1, 3, 20, L)}
          {bar(23, 12, 12, P)}
        </>
      )}
      {kind === 'alternate' && (
        <>
          {bar(1, 3, 9, L)}
          {bar(11, 12, 7, P)}
          {bar(19, 3, 9, L)}
          {bar(29, 12, 6, P)}
        </>
      )}
      {kind === 'ai' && (
        <path
          d="M18 2.5l1.9 4.6 4.6 1.9-4.6 1.9L18 15.5l-1.9-4.6-4.6-1.9 4.6-1.9z"
          fill="var(--accent)"
        />
      )}
    </svg>
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
    <div
      className={`seg${options.length > 6 ? ' seg-grid' : ''}`}
      role="radiogroup"
      aria-label={label}
    >
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

/** Rework the rest of an existing path (or plan) from how it has gone. */
export interface AdjustTarget {
  planIds: number[];
  /** The path's name, kept for the reworked stages. */
  name: string;
  /** Path steps already used, so new stages continue the numbering. */
  lastStep: number;
}

export function AiPlanSheet({
  onClose,
  onCreated,
  adjust,
}: {
  onClose: () => void;
  onCreated: () => void;
  adjust?: AdjustTarget;
}) {
  const settings = useApi<AiSettingsDto>('/api/ai/settings');
  const lib = useApi<LibraryDto>('/api/library');
  const [step, setStep] = useState<'goal' | 'time' | 'library' | 'adjust' | 'thinking' | 'review'>(
    adjust ? 'adjust' : 'goal',
  );
  const [note, setNote] = useState('');
  const [must, setMust] = useState<string[]>([]);
  const plans = useApi<PlanDto[]>('/api/plans');

  const [goal, setGoal] = useState('');
  const [level, setLevel] = useState<PlanLevel>('some');
  const [practiceOn, setPracticeOn] = useState(true);
  const [practiceDays, setPracticeDays] = useState(5);
  const [practiceMin, setPracticeMin] = useState(20);
  const [learningOn, setLearningOn] = useState(true);
  const [learnWeek, setLearnWeek] = useState(90);
  const [learnDays, setLearnDays] = useState(2);
  const [timeOfDay, setTimeOfDay] = useState<AiPlanRequest['timeOfDay']>('morning');
  // 0 = let the planner choose the length; -1 = as long as the whole path takes.
  const [weeks, setWeeks] = useState(0);
  const [approach, setApproach] = useState<PlanApproach>('together');
  const [startDate, setStartDate] = useState(iso(new Date()));
  const [creators, setCreators] = useState<string[]>([]);
  const [includeFinished, setIncludeFinished] = useState(false);
  const [includePlanned, setIncludePlanned] = useState(false);

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
    weeks: weeks <= 0 ? null : weeks,
    untilComplete: weeks === -1,
    approach,
    startDate,
    practice: practiceOn ? { daysPerWeek: practiceDays, minutes: practiceMin } : null,
    learning: learningOn ? { minutesPerWeek: learnWeek, daysPerWeek: learnDays } : null,
    timeOfDay,
    level,
    creators,
    includeFinished,
    includePlanned,
    mustInclude: must,
  };

  const generate = async () => {
    setError(null);
    setThought(0);
    setStep('thinking');
    try {
      const p = adjust
        ? await api.post<AiPlanProposalDto>('/api/ai/plan/adjust', {
            planIds: adjust.planIds,
            note,
          })
        : await api.post<AiPlanProposalDto>('/api/ai/plan', request);
      setProposal(p);
      setName(p.name);
      setStep('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The plan could not be made.');
      setStep(adjust ? 'adjust' : 'library');
    }
  };

  const accept = async () => {
    if (!proposal) return;
    setSaving(true);
    setError(null);
    const title = name.trim() || proposal.name;
    const multi = proposal.stages.length > 1 || !!adjust;
    const from = proposal.startDate ?? startDate;
    try {
      // Reworking: the old plans end today - their history stays - and the
      // new stages carry the path on from tomorrow.
      if (adjust) {
        const today = addDays(from, -1);
        for (const id of adjust.planIds) {
          await api.patch(`/api/plans/${id}`, { endDate: today, status: 'ended' });
        }
      }
      // One plan per stage, dated into the path; together they carry its name.
      for (const [n, st] of proposal.stages.entries()) {
        const start = addDays(from, (st.startWeek - 1) * 7);
        await api.post('/api/plans', {
          name: multi ? `${title} · ${st.title}` : title,
          intention: proposal.intention || null,
          startDate: start,
          endDate: addDays(start, st.weeks * 7 - 1),
          daysOfWeek: st.daysOfWeek,
          preferredTime: st.preferredTime,
          targetMinutes: st.minutesPerSession,
          guide: {
            summary: proposal.summary.slice(0, 800),
            why: proposal.why.slice(0, 2000),
            tips: proposal.tips.slice(0, 6),
            model: proposal.model,
            ...(st.milestone ? { milestone: st.milestone.slice(0, 300) } : {}),
          },
          meditationIds: st.items.map((i) => i.id),
          focus: st.focus,
          path: multi ? { name: title, step: (adjust?.lastStep ?? 0) + n + 1 } : null,
        });
      }
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the plans.');
    } finally {
      setSaving(false);
    }
  };

  // No AI yet: set it up, then come straight back here to plan.
  if (settings.data && !settings.data.canUse) {
    return (
      <Sheet title="Plan with AI" onClose={onClose} labelId="ai-plan">
        <div className="ai-key">
          <img className="ai-key-art" src="/art/ob-rhythm.webp" alt="" width={120} height={120} />
          <p className="sit-sheet-lede">
            Planning with AI reads your library and builds a path around your time - with your own
            AI: OpenAI, Anthropic, Google Gemini, OpenRouter, or your own server.
          </p>
          <Link
            className="btn btn-primary"
            to={`/ai/setup?return=${encodeURIComponent('/plans?ai=1')}`}
          >
            <Icon name="sparkle" size={16} /> Set up AI
          </Link>
          <p className="hint">It takes a minute. You come straight back here to plan.</p>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={adjust ? `Adjust ${adjust.name}` : 'Plan with AI'}
      onClose={onClose}
      labelId="ai-plan"
    >
      {step === 'adjust' && adjust && (
        <div className="ai-step">
          <label htmlFor="ai-note" className="rf-label">
            What has changed?
          </label>
          <textarea
            id="ai-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="In your own words - optional. The AI also sees how the path has gone so far."
          />
          <div className="rf-starters">
            {ADJUST_STARTERS.map((t) => (
              <button
                key={t}
                type="button"
                className="chip"
                onClick={() => setNote((n) => (n.trim() ? `${n.trim()} ${t}` : t))}
              >
                {t}
              </button>
            ))}
          </div>
          <p className="ai-privacy">
            <Icon name="sparkle" size={14} />
            The path, how many sessions were done or missed, which courses are finished, your note
            and your intentions go to{' '}
            {settings.data?.provider
              ? `${AI_PROVIDERS.find((p) => p.id === settings.data!.provider)?.label} (${settings.data.model})`
              : 'the shared AI'}
            . What is finished stays finished; unfinished courses stay in the path.
          </p>
          {error && <p className="error-note">{error}</p>}
          <div className="ai-nav">
            <button className="btn btn-quiet" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => void generate()}>
              <Icon name="sparkle" size={16} /> Rework the rest
            </button>
          </div>
        </div>
      )}

      {step !== 'thinking' && step !== 'review' && step !== 'adjust' && (
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
                  options={[10, 15, 20, 30, 45, 60, 90, 120] as const}
                  value={practiceMin as 10}
                  onChange={setPracticeMin}
                  render={(v) => (v < 60 ? `${v}m` : v === 60 ? '1h' : `${v / 60}h`)}
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
                  options={[30, 60, 90, 120, 180, 300, 420, 600] as const}
                  value={learnWeek as 30}
                  onChange={setLearnWeek}
                  render={(v) => (v < 60 ? `${v}m` : `${v / 60}h`)}
                />
                <p className="hint">a week</p>
              </div>
            )}
          </div>

          {practiceOn && learningOn && (
            <div className="field">
              <label id="ai-approach-l">How should learning and practice fit together?</label>
              <div className="ai-approach" role="radiogroup" aria-labelledby="ai-approach-l">
                {APPROACHES.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    role="radio"
                    aria-checked={approach === a.value}
                    className={`ai-approach-opt${approach === a.value ? ' on' : ''}`}
                    onClick={() => setApproach(a.value)}
                  >
                    <span className="ai-approach-ic" aria-hidden="true">
                      <ApproachGlyph kind={a.value} />
                    </span>
                    <span className="ai-approach-t">{a.title}</span>
                    <span className="ai-approach-h">{a.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
          <div className="field">
            <label>Plan length</label>
            <Choices
              label="Weeks"
              options={[0, -1, 4, 8, 12, 26, 52, 104, 156] as const}
              value={weeks as 0}
              onChange={setWeeks}
              render={(v) =>
                v === 0
                  ? 'AI decides'
                  : v === -1
                    ? 'Until done'
                    : v === 26
                      ? '6 months'
                      : v === 52
                        ? '1 year'
                        : v === 104
                          ? '2 years'
                          : v === 156
                            ? '3 years'
                            : `${v}w`
              }
            />
            {weeks >= 26 && (
              <p className="hint">
                A long path comes in phases, each with a milestone. Adjust it with AI whenever life
                changes - what is done stays done.
              </p>
            )}
            {weeks <= 0 && (
              <p className="hint">
                {weeks === 0
                  ? 'A sensible first stretch for your goal, chosen by the AI.'
                  : 'The whole path to your goal - every course and practice it needs - however long that takes, up to three years, in phases with milestones.'}
              </p>
            )}
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
          <MustPicker
            items={(lib.data?.items ?? []).filter(
              (i) => !i.missing && (creators.length === 0 || creators.includes(i.creator)),
            )}
            plans={plans.data ?? []}
            chosen={must}
            onChange={setMust}
          />
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
          <div className="set-switch sit-switch">
            <div>
              <div className="set-switch-t">Include courses already in my plans</div>
              <div className="set-switch-h">
                Otherwise a course another plan already covers is not planned twice.
              </div>
            </div>
            <Switch
              checked={includePlanned}
              onChange={setIncludePlanned}
              label="Include courses already in my plans"
            />
          </div>
          <p className="ai-privacy">
            <Icon name="sparkle" size={14} />
            Titles, creators, lengths and lesson names from your library, your practice history and
            your intentions go to{' '}
            {settings.data?.provider
              ? `${AI_PROVIDERS.find((p) => p.id === settings.data!.provider)?.label} (${settings.data.model})`
              : 'the shared AI'}{' '}
            to make this plan. Nothing else, and only when you press Make my plan.
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
          <p className="ai-length">
            {proposal.weeks === 1 ? 'One week' : `${proposal.weeks} weeks`}
            {adjust
              ? ', from tomorrow'
              : weeks === 0
                ? ', the length the AI chose'
                : weeks === -1
                  ? ', start to finish'
                  : ''}
            {proposal.stages.length > 1 && learningAndPractice(proposal)
              ? ` · ${APPROACHES.find((a) => a.value === proposal.approach)?.title ?? ''}`
              : ''}
          </p>
          {proposal.intention && <p className="ai-intention">“{proposal.intention}”</p>}
          {proposal.added && proposal.added.length > 0 && (
            <p className="notice">
              The AI left out {proposal.added.join(', ')}, so ZenPort placed{' '}
              {proposal.added.length === 1 ? 'it' : 'them'} in the path - as you asked.
            </p>
          )}
          <PlanGuideView
            guide={{ summary: proposal.summary, why: proposal.why, tips: proposal.tips }}
            title="Why this path"
          />

          {proposal.stages.length > 1 && <PathTimeline proposal={proposal} />}

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

          {proposal.stages.map((st, n) => (
            <StagePreview key={n} stage={st} step={proposal.stages.length > 1 ? n + 1 : null} />
          ))}

          {error && <p className="error-note">{error}</p>}
          <div className="ai-nav">
            <button className="btn btn-quiet" onClick={() => setStep(adjust ? 'adjust' : 'goal')}>
              {adjust ? 'Back' : 'Adjust'}
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => void generate()} disabled={saving}>
                Try again
              </button>
              <button className="btn btn-primary" onClick={() => void accept()} disabled={saving}>
                {saving
                  ? 'Saving…'
                  : adjust
                    ? 'Use the reworked path'
                    : proposal.stages.length > 1
                      ? `Create the path · ${proposal.stages.length} plans`
                      : 'Create the plan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Sheet>
  );
}

const learningAndPractice = (p: AiPlanProposalDto) =>
  p.stages.some((st) => st.focus === 'learning') && p.stages.some((st) => st.focus === 'practice');

const weekSpan = (st: AiPlanStageDto) =>
  st.weeks === 1 ? `Week ${st.startWeek}` : `Weeks ${st.startWeek}–${st.startWeek + st.weeks - 1}`;

/** The path at a glance: one lane per stage, placed on the weeks it runs. */
function PathTimeline({ proposal }: { proposal: AiPlanProposalDto }) {
  const total = Math.max(1, proposal.weeks);
  return (
    <div className="ai-timeline" aria-label="The path, week by week">
      {proposal.stages.map((st, n) => (
        <div className="ai-lane" key={n}>
          <span className="ai-lane-label">
            <Icon name={st.focus === 'learning' ? 'book' : 'lotus'} size={12} />
            {st.title}
          </span>
          <span className="ai-lane-track">
            <span
              className={`ai-lane-bar ${st.focus === 'learning' ? 't-course' : 't-meditation'}`}
              style={{
                left: `${((st.startWeek - 1) / total) * 100}%`,
                width: `${Math.max(2, (st.weeks / total) * 100)}%`,
              }}
            />
          </span>
        </div>
      ))}
      <div className="ai-lane-scale" aria-hidden="true">
        <span>Week 1</span>
        <span>Week {total}</span>
      </div>
    </div>
  );
}

function StagePreview({ stage: track, step }: { stage: AiPlanStageDto; step: number | null }) {
  const learning = track.focus === 'learning';
  return (
    <section className="ai-track">
      <header>
        {step !== null && <span className="ai-step-n">{step}</span>}
        <span className={`plan-focus ${learning ? 't-course' : 't-meditation'}`}>
          <Icon name={learning ? 'book' : 'lotus'} size={13} />
          {learning ? 'Learning' : 'Practice'}
        </span>
        <span className="ai-stage-t">{track.title}</span>
      </header>
      <p className="ai-track-meta">
        {weekSpan(track)}
        {' · '}
        {track.daysOfWeek.length === 0 || track.daysOfWeek.length === 7
          ? 'Every day'
          : track.daysOfWeek.map((d) => DAYS[d]).join(' · ')}
        {' · '}
        {track.minutesPerSession} min
        {track.preferredTime ? ` · ${track.preferredTime}` : ''}
      </p>
      {track.milestone && (
        <p className="ai-milestone">
          <Icon name="flag" size={13} /> {track.milestone}
        </p>
      )}
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

const ADJUST_STARTERS = [
  'I fell behind.',
  'I have less time now.',
  'I have more time now.',
  'I want to go deeper.',
  'Change the order.',
];

/**
 * Courses (and, if wanted, meditations) that must be in the plan. The
 * planner places them in the right order and may add more around them;
 * ZenPort makes sure none goes missing.
 */
function MustPicker({
  items,
  plans,
  chosen,
  onChange,
}: {
  items: MeditationSummaryDto[];
  plans: PlanDto[];
  chosen: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(chosen.length > 0);
  const [q, setQ] = useState('');
  const [practiceToo, setPracticeToo] = useState(false);
  const elsewhere = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of plans) {
      if (p.status === 'ended') continue;
      for (const id of p.meditationIds) m.set(id, [...(m.get(id) ?? []), p.path?.name ?? p.name]);
    }
    return m;
  }, [plans]);
  const needle = q.trim().toLowerCase();
  const list = items
    .filter((i) => practiceToo || i.type === 'course' || i.type === 'talk')
    .filter(
      (i) =>
        !needle || `${i.title} ${i.creator} ${i.collection ?? ''}`.toLowerCase().includes(needle),
    )
    .slice(0, 80);
  const toggle = (id: string) =>
    onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);

  if (!open) {
    return (
      <button type="button" className="btn btn-quiet must-open" onClick={() => setOpen(true)}>
        <Icon name="plus" size={15} /> Courses that must be in it
      </button>
    );
  }
  return (
    <div className="field must">
      <label>
        Must include
        {chosen.length > 0 && <span className="must-n">{chosen.length} chosen</span>}
      </label>
      <p className="hint" style={{ marginTop: 0 }}>
        The AI puts them in the right order and may add more. None will be left out.
      </p>
      <div className="must-tools">
        <input
          type="search"
          placeholder="Find a course"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Find a course"
        />
        <button
          type="button"
          className="chip"
          aria-pressed={practiceToo}
          onClick={() => setPracticeToo((v) => !v)}
        >
          Meditations too
        </button>
      </div>
      <ul className="must-list">
        {list.map((i) => {
          const on = chosen.includes(i.id);
          return (
            <li key={i.id}>
              <button
                type="button"
                className={`must-row${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => toggle(i.id)}
              >
                <span className="must-check" aria-hidden="true">
                  {on && <Icon name="check" size={13} />}
                </span>
                <span className="grow">
                  <span className="must-t">
                    {i.collection ? `${i.collection} · ${i.title}` : i.title}
                  </span>
                  <span className="sub">
                    {TYPE_META[i.type].label} · {i.creator}
                  </span>
                </span>
                <PickTag
                  item={i}
                  standing={standingOf(i, elsewhere.has(i.id))}
                  plans={elsewhere.get(i.id)}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
