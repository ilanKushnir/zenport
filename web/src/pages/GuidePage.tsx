/**
 * Your guide: an AI mentor that looks back over how practice has actually
 * gone and answers with what is going well, what it notices, what to try
 * next and where to head. Before anything is sent, the page says exactly what
 * will be - and the journal goes along only when switched on for that one
 * review. Every answer is kept here as a dated note.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GUIDE_PERIODS,
  formatDuration,
  type GuideDisclosureDto,
  type GuideNoteDto,
  type GuidePeriod,
} from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { providerInfo } from '../components/AiConnect.tsx';
import { ReflectionForm } from '../components/Reflection.tsx';
import { Cover, ErrorNote, Icon, Sheet, Switch } from '../components/ui.tsx';

const PERIOD_LABEL: Record<GuidePeriod, string> = {
  7: 'A week',
  30: 'A month',
  90: 'Three months',
};
const PERIOD_OVER: Record<number, string> = {
  7: 'the last week',
  30: 'the last month',
  90: 'the last three months',
};

const noteDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function GuidePage() {
  const [days, setDays] = useState<GuidePeriod>(30);
  // Never remembered: each review asks again.
  const [journal, setJournal] = useState(false);
  const [question, setQuestion] = useState('');
  const preview = useApi<GuideDisclosureDto>(
    `/api/ai/guide/preview?days=${days}&journal=${journal ? 1 : 0}`,
  );
  const notes = useApi<GuideNoteDto[]>('/api/ai/guide/notes');
  const [shown, setShown] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = preview.data;
  const list = notes.data ?? [];
  const current = list.find((n) => n.id === shown) ?? list[0] ?? null;

  const ask = async () => {
    setBusy(true);
    setError(null);
    try {
      const note = await api.post<GuideNoteDto>('/api/ai/guide', {
        days,
        journal,
        question: question.trim() || undefined,
      });
      setQuestion('');
      setJournal(false);
      setShown(note.id);
      notes.reload();
      window.setTimeout(
        () => document.getElementById('guide-note')?.scrollIntoView({ behavior: 'smooth' }),
        80,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your guide could not answer.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm('Delete this note for good?')) return;
    await api.del(`/api/ai/guide/notes/${id}`).catch(() => {});
    setShown(null);
    notes.reload();
  };

  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/ai">AI</Link>
        <span className="sep">/</span>
        <span aria-current="page">Your guide</span>
      </nav>
      <div className="page-head">
        <h1>Your guide</h1>
        <p className="lede">
          A look back at how your practice is really going - what is working, what to try next, and
          where to head. Ask whenever you like; each answer is kept here.
        </p>
      </div>

      {d && !d.canUse && (
        <div className="enh-notice">
          <Icon name="sparkle" size={18} />
          <span className="grow">Your guide needs an AI - your own key, or one shared here.</span>
          <Link className="btn btn-primary btn-sm" to="/ai/setup?return=/ai/guide">
            Set up AI
          </Link>
        </div>
      )}

      <section className="ai-card guide-ask" aria-labelledby="guide-ask-h">
        <h2 id="guide-ask-h">Ask for a review</h2>

        <div className="guide-field">
          <span className="guide-label" id="guide-period">
            Look back over
          </span>
          <div className="seg" role="radiogroup" aria-labelledby="guide-period">
            {GUIDE_PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={days === p}
                className={`seg-opt${days === p ? ' on' : ''}`}
                onClick={() => setDays(p)}
              >
                {PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
        </div>

        <div className="ai-share guide-journal">
          <div className="grow">
            <strong>Include my journal</strong>
            <span className="sub">
              {d && d.journalEntries === 0
                ? `No entries in ${PERIOD_OVER[days]}.`
                : 'For this review only - it is not remembered. Your guide reads your entries to understand how practice feels, not only how often.'}
            </span>
          </div>
          <Switch
            checked={journal}
            onChange={setJournal}
            label="Include my journal in this review"
            disabled={!!d && d.journalEntries === 0}
          />
        </div>

        <div className="guide-field">
          <label className="guide-label" htmlFor="guide-q">
            Anything on your mind? <span className="faint">Optional</span>
          </label>
          <textarea
            id="guide-q"
            rows={2}
            maxLength={1000}
            placeholder="I keep skipping evenings… · Should I start a new course?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>

        <div className="guide-sent" aria-live="polite">
          <p className="guide-sent-h">
            <Icon name="shield" size={14} /> What will be sent
            {d?.provider ? ` to ${providerInfo(d.provider).label}` : ''}
          </p>
          {d ? (
            <ul>
              <li>
                {d.sessions === 0
                  ? `Your practice history (nothing in ${PERIOD_OVER[days]})`
                  : `${plural(d.sessions, 'session')} on ${plural(d.practiceDays, 'day')}, ${formatDuration(d.minutes * 60)}${d.lessons ? `, ${plural(d.lessons, 'lesson')} finished` : ''}`}
                , with streaks and the times you sit
              </li>
              <li>
                {d.plans === 0
                  ? 'That you have no plan running'
                  : `${plural(d.plans, 'plan')} and how ${d.plans === 1 ? 'it has' : 'they have'} gone`}
              </li>
              {d.intentions && <li>Your intentions</li>}
              <li>The titles in your library ({d.libraryItems}), so it can point to them</li>
              {journal && d.journalEntries > 0 && (
                <li className="on">
                  {plural(d.journalEntries, 'journal entry', 'journal entries')}
                </li>
              )}
              {question.trim() && <li className="on">What you wrote above</li>}
            </ul>
          ) : (
            <p className="faint">Counting…</p>
          )}
          {!journal && d && d.journalEntries > 0 && <p className="faint">Not your journal.</p>}
        </div>

        <button
          className="btn btn-primary guide-go"
          disabled={busy || !d?.canUse}
          onClick={() => void ask()}
        >
          <Icon name="sparkle" size={16} />
          {busy ? 'Your guide is reading…' : 'Ask your guide'}
        </button>
        {error && <ErrorNote message={error} />}
      </section>

      {busy && (
        <div className="guide-thinking" role="status">
          <span className="guide-orb" aria-hidden="true" />
          <p>
            Reading {PERIOD_OVER[days]}
            {journal ? ' and your journal' : ''}. This takes up to a minute.
          </p>
        </div>
      )}

      {notes.error && <ErrorNote message={notes.error} onRetry={notes.reload} />}
      {current && !busy && <GuideNote note={current} onDelete={() => void remove(current.id)} />}

      {list.length > 1 && (
        <section className="section" aria-labelledby="guide-earlier">
          <div className="section-head">
            <h2 id="guide-earlier">Earlier notes</h2>
          </div>
          <ul className="guide-earlier">
            {list
              .filter((n) => n.id !== current?.id)
              .map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      setShown(n.id);
                      window.setTimeout(
                        () =>
                          document
                            .getElementById('guide-note')
                            ?.scrollIntoView({ behavior: 'smooth' }),
                        50,
                      );
                    }}
                  >
                    <span className="guide-earlier-d">
                      {noteDate(n.createdAt)} · {PERIOD_OVER[n.days] ?? `${n.days} days`}
                      {n.usedJournal ? ' · with journal' : ''}
                    </span>
                    <span className="guide-earlier-t">{n.summary}</span>
                  </button>
                </li>
              ))}
          </ul>
        </section>
      )}
    </>
  );
}

function GuideNote({ note, onDelete }: { note: GuideNoteDto; onDelete: () => void }) {
  const [writing, setWriting] = useState(false);
  const [written, setWritten] = useState(false);
  useEffect(() => setWritten(false), [note.id]);
  return (
    <article className="guide-note" id="guide-note" aria-labelledby="guide-note-h">
      <header className="guide-note-head">
        <div className="grow">
          <p className="guide-note-d" id="guide-note-h">
            {noteDate(note.createdAt)} · looked back over{' '}
            {PERIOD_OVER[note.days] ?? `${note.days} days`}
            {note.usedJournal ? ', with your journal' : ''}
          </p>
          {note.question && <p className="guide-note-q">“{note.question}”</p>}
        </div>
        <button className="icon-btn" aria-label="Delete this note" onClick={onDelete}>
          <Icon name="trash" size={16} />
        </button>
      </header>

      <p className="guide-summary">{note.summary}</p>

      {note.goingWell.length > 0 && (
        <section className="guide-block">
          <h3>Going well</h3>
          <ul className="guide-well">
            {note.goingWell.map((g, i) => (
              <li key={i}>
                <Icon name="check" size={15} /> {g}
              </li>
            ))}
          </ul>
        </section>
      )}

      {note.patterns.length > 0 && (
        <section className="guide-block">
          <h3>What I notice</h3>
          {note.patterns.map((p, i) => (
            <div key={i} className="guide-pattern">
              <strong>{p.title}</strong>
              <p>{p.detail}</p>
            </div>
          ))}
        </section>
      )}

      {note.tips.length > 0 && (
        <section className="guide-block">
          <h3>Try this</h3>
          <ol className="guide-tips">
            {note.tips.map((t, i) => (
              <li key={i}>
                <strong>{t.title}</strong>
                <p>{t.detail}</p>
                {t.item && (
                  <Link className="guide-item" to={`/m/${t.item.id}`}>
                    <Cover
                      coverId={t.item.coverId}
                      title={t.item.title}
                      className="guide-item-cover"
                    />
                    <span className="grow">
                      <span className="guide-item-t">{t.item.title}</span>
                      <span className="sub">{t.item.creator}</span>
                    </span>
                    <Icon name="chevron-right" size={16} />
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {(note.next.title || note.next.detail) && (
        <section className="guide-block guide-next">
          <h3>Next</h3>
          <strong>{note.next.title}</strong>
          <p>{note.next.detail}</p>
          {note.next.action === 'plan' && (
            <Link className="btn btn-quiet btn-sm" to="/plans?ai=1">
              <Icon name="plans" size={15} /> Plan with AI
            </Link>
          )}
          {note.next.action === 'adjust' && (
            <Link className="btn btn-quiet btn-sm" to="/plans">
              <Icon name="plans" size={15} /> Adjust your plan
            </Link>
          )}
        </section>
      )}

      {note.reflection && (
        <section className="guide-reflect">
          <p>{note.reflection}</p>
          {written ? (
            <span className="faint">
              <Icon name="check" size={14} /> In your journal
            </span>
          ) : (
            <button className="btn btn-quiet btn-sm" onClick={() => setWriting(true)}>
              <Icon name="journal" size={15} /> Write about it
            </button>
          )}
        </section>
      )}

      <p className="guide-foot faint">
        Written by {note.model ?? 'your AI'} from your records. A companion, not a teacher or a
        therapist - trust your own sense of what helps.
      </p>

      {writing && (
        <Sheet title="Write" onClose={() => setWriting(false)}>
          <ReflectionForm
            prompt={note.reflection}
            onDone={() => {
              setWriting(false);
              setWritten(true);
            }}
            onSkip={() => setWriting(false)}
          />
        </Sheet>
      )}
    </article>
  );
}
