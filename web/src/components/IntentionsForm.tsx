/**
 * Why someone practises - six short questions, mostly taps. Everything the
 * AI does for them reads these: plans, the guide's reviews, picks for today,
 * what to discover. None is required, and all can change any time.
 */
import { useState } from 'react';
import {
  INTENTION_LIKES,
  INTENTION_REASONS,
  type IntentionExperience,
  type IntentionMinutes,
  type IntentionsDto,
} from '@zenport/shared';
import { api } from '../api.ts';

export const EMPTY_INTENTIONS: IntentionsDto = {
  reasons: [],
  hope: '',
  experience: 'some',
  minutes: '15',
  daysPerWeek: 5,
  likes: [],
  notes: '',
};

const EXPERIENCE: { id: IntentionExperience; label: string }[] = [
  { id: 'new', label: 'New to this' },
  { id: 'some', label: 'Some' },
  { id: 'experienced', label: 'Experienced' },
  { id: 'deep', label: 'Many years' },
];

const MINUTES: { id: IntentionMinutes; label: string }[] = [
  { id: '5', label: '5-10 min' },
  { id: '15', label: '15-20 min' },
  { id: '30', label: '30-45 min' },
  { id: '60', label: 'An hour +' },
];

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

export function IntentionsForm({
  initial,
  onSaved,
  saveLabel = 'Save',
  /** Onboarding asks only the first four; the rest wait for later. */
  short = false,
}: {
  initial: IntentionsDto | null;
  onSaved: (i: IntentionsDto) => void;
  saveLabel?: string;
  short?: boolean;
}) {
  const [v, setV] = useState<IntentionsDto>(initial ?? EMPTY_INTENTIONS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<IntentionsDto>) => setV((cur) => ({ ...cur, ...patch }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { updatedAt: _, ...body } = v;
      onSaved(await api.put<IntentionsDto>('/api/me/intentions', body));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Those answers could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="intent">
      <fieldset className="intent-q">
        <legend>What brings you to practise?</legend>
        <p className="intent-h">Choose any that are true.</p>
        <div className="chip-row">
          {INTENTION_REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              className="chip"
              aria-pressed={v.reasons.includes(r.id)}
              onClick={() => set({ reasons: toggle(v.reasons, r.id) })}
            >
              {r.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="intent-q">
        <span className="intent-legend">A year from now, what would you love to be true?</span>
        <input
          value={v.hope}
          maxLength={600}
          placeholder="In a line - e.g. calmer mornings, sleeping without my phone"
          onChange={(e) => set({ hope: e.target.value })}
        />
      </label>

      <fieldset className="intent-q">
        <legend>Your experience</legend>
        <div className="seg" role="radiogroup">
          {EXPERIENCE.map((x) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={v.experience === x.id}
              className={`seg-opt${v.experience === x.id ? ' on' : ''}`}
              onClick={() => set({ experience: x.id })}
            >
              {x.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="intent-q">
        <legend>Time you can usually give</legend>
        <div className="chip-row">
          {MINUTES.map((m) => (
            <button
              key={m.id}
              type="button"
              className="chip"
              aria-pressed={v.minutes === m.id}
              onClick={() => set({ minutes: m.id })}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="chip-row intent-days">
          {[2, 3, 4, 5, 6, 7].map((d) => (
            <button
              key={d}
              type="button"
              className="chip"
              aria-pressed={v.daysPerWeek === d}
              onClick={() => set({ daysPerWeek: d })}
            >
              {d === 7 ? 'Every day' : `${d} days a week`}
            </button>
          ))}
        </div>
      </fieldset>

      {!short && (
        <>
          <fieldset className="intent-q">
            <legend>What do you enjoy?</legend>
            <div className="chip-row">
              {INTENTION_LIKES.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className="chip"
                  aria-pressed={v.likes.includes(l.id)}
                  onClick={() => set({ likes: toggle(v.likes, l.id) })}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="intent-q">
            <span className="intent-legend">Anything to keep in mind?</span>
            <textarea
              rows={2}
              value={v.notes}
              maxLength={600}
              placeholder="Optional - things to avoid, your circumstances, health notes"
              onChange={(e) => set({ notes: e.target.value })}
            />
          </label>
        </>
      )}

      {error && <p className="error-note">{error}</p>}
      <div className="intent-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  );
}
