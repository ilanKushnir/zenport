/**
 * Made for you: a guided meditation written for this moment and spoken by a
 * calm voice, with real silence between the words. Say how you arrive, what
 * you would like it to hold, how long you have, what to rest on, and whose
 * voice - then sit with it in the player like any recording. Every one is
 * kept, to sit with again.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  SIT_FEELINGS,
  SIT_FOCI,
  SIT_LENGTHS,
  SIT_VOICES,
  type MeditationDetailDto,
  type SitDto,
  type SitFeeling,
  type SitFocus,
  type SitsDto,
  type SitVoice,
} from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { usePlayer } from '../player/PlayerProvider.tsx';
import { ErrorNote, Icon } from '../components/ui.tsx';

const STAGES = [
  { after: 0, text: 'Writing it for you…' },
  { after: 14, text: 'Giving it a voice…' },
  { after: 34, text: 'Laying out the silences…' },
  { after: 60, text: 'Almost ready…' },
];

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const focusLabel = (f: SitFocus) => SIT_FOCI.find((x) => x.id === f)?.label ?? f;
const voiceLabel = (v: SitVoice) => SIT_VOICES.find((x) => x.id === v)?.label ?? v;

/** A soft painted field for a sit, the same one every time. */
function hue(id: string): number {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function SitPage() {
  const data = useApi<SitsDto>('/api/ai/sits');
  const player = usePlayer();
  const [feelings, setFeelings] = useState<SitFeeling[]>([]);
  const [note, setNote] = useState('');
  const [minutes, setMinutes] = useState<(typeof SIT_LENGTHS)[number]>(10);
  const [focus, setFocus] = useState<SitFocus>('any');
  const [voice, setVoice] = useState<SitVoice>('sage');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [hearing, setHearing] = useState<SitVoice | null>(null);
  const preview = useRef<HTMLAudioElement | null>(null);
  const d = data.data;
  const ready = !!d?.canUse && d.canSpeak;

  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const t = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 500);
    return () => window.clearInterval(t);
  }, [busy]);
  useEffect(() => () => preview.current?.pause(), []);

  const toggleFeeling = (f: SitFeeling) =>
    setFeelings((cur) =>
      cur.includes(f) ? cur.filter((x) => x !== f) : cur.length < 3 ? [...cur, f] : cur,
    );

  const hear = (v: SitVoice) => {
    preview.current?.pause();
    if (hearing === v) {
      setHearing(null);
      return;
    }
    const a = new Audio(`/api/ai/sits/voices/${v}`);
    preview.current = a;
    setHearing(v);
    a.onended = () => setHearing(null);
    a.onerror = () => setHearing(null);
    void a.play().catch(() => setHearing(null));
  };

  const make = async () => {
    setBusy(true);
    setElapsed(0);
    setError(null);
    preview.current?.pause();
    try {
      const sit = await api.post<SitDto>('/api/ai/sits', {
        minutes,
        feelings,
        focus,
        voice,
        note: note.trim() || undefined,
      });
      setFresh(sit.id);
      setNote('');
      data.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'It could not be made this time.');
    } finally {
      setBusy(false);
    }
  };

  const begin = async (sit: SitDto) => {
    const item = await api.get<MeditationDetailDto>(`/api/ai/sits/${sit.id}/item`);
    player.start(item);
  };
  const remove = async (sit: SitDto) => {
    if (!window.confirm(`Delete “${sit.title}”? Your practice history keeps the time you sat.`))
      return;
    await api.del(`/api/ai/sits/${sit.id}`).catch(() => {});
    if (fresh === sit.id) setFresh(null);
    data.reload();
  };

  const sits = d?.sits ?? [];
  const newest = sits.find((s) => s.id === fresh) ?? null;
  const earlier = sits.filter((s) => s.id !== newest?.id);
  const stage = [...STAGES].reverse().find((s) => elapsed >= s.after)!;

  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/ai">AI</Link>
        <span className="sep">/</span>
        <span aria-current="page">Made for you</span>
      </nav>
      <div className="page-head">
        <h1>Made for you</h1>
        <p className="lede">
          Say how you are arriving and how long you have. Your AI writes a guided meditation for
          right now, and a calm voice speaks it - with real silence between the words.
        </p>
      </div>

      {data.error && <ErrorNote message={data.error} onRetry={data.reload} />}
      {d && !d.canUse && (
        <div className="enh-notice">
          <Icon name="sparkle" size={18} />
          <span className="grow">This needs an AI - your own key, or one shared here.</span>
          <Link className="btn btn-primary btn-sm" to="/ai/setup?return=/ai/sit">
            Set up AI
          </Link>
        </div>
      )}
      {d?.canUse && !d.canSpeak && (
        <div className="enh-notice">
          <Icon name="volume" size={18} />
          <span className="grow">
            The voice comes from OpenAI. Connect an OpenAI key to hear it - you can keep using your
            current AI for everything else.
          </span>
          <Link className="btn btn-quiet btn-sm" to="/ai/setup?return=/ai/sit">
            Connect
          </Link>
        </div>
      )}

      <section className="ai-card sit-ask" aria-labelledby="sit-ask-h">
        <h2 id="sit-ask-h" className="visually-hidden">
          Make a meditation
        </h2>
        <div className="guide-field">
          <span className="guide-label" id="sit-feel">
            How are you arriving? <span className="faint">Up to three</span>
          </span>
          <div className="chip-row" role="group" aria-labelledby="sit-feel">
            {SIT_FEELINGS.map((f) => (
              <button
                key={f.id}
                type="button"
                className="chip"
                aria-pressed={feelings.includes(f.id)}
                disabled={!feelings.includes(f.id) && feelings.length >= 3}
                onClick={() => toggleFeeling(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="guide-field">
          <label className="guide-label" htmlFor="sit-note">
            Anything you would like it to hold? <span className="faint">Optional</span>
          </label>
          <textarea
            id="sit-note"
            rows={2}
            maxLength={600}
            placeholder="A hard conversation tonight · I can’t stop planning · Grateful for today"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="sit-row">
          <div className="guide-field">
            <span className="guide-label" id="sit-len">
              How long
            </span>
            <div className="seg" role="radiogroup" aria-labelledby="sit-len">
              {SIT_LENGTHS.map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={minutes === m}
                  className={`seg-opt${minutes === m ? ' on' : ''}`}
                  onClick={() => setMinutes(m)}
                >
                  {m} min
                </button>
              ))}
            </div>
          </div>
          <div className="guide-field">
            <span className="guide-label" id="sit-focus">
              Rest on
            </span>
            <div className="chip-row" role="radiogroup" aria-labelledby="sit-focus">
              {SIT_FOCI.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  role="radio"
                  className="chip"
                  aria-checked={focus === f.id}
                  aria-pressed={focus === f.id}
                  onClick={() => setFocus(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="guide-field">
          <span className="guide-label" id="sit-voice">
            Voice
          </span>
          <div className="sit-voices" role="radiogroup" aria-labelledby="sit-voice">
            {SIT_VOICES.map((v) => (
              <div key={v.id} className={`sit-voice${voice === v.id ? ' on' : ''}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={voice === v.id}
                  className="sit-voice-pick"
                  onClick={() => setVoice(v.id)}
                >
                  <strong>{v.label}</strong>
                  <span className="sub">{v.hint}</span>
                </button>
                <button
                  type="button"
                  className="icon-btn sit-voice-hear"
                  aria-label={hearing === v.id ? `Stop ${v.label}` : `Hear ${v.label}`}
                  disabled={!d?.canSpeak}
                  onClick={() => hear(v.id)}
                >
                  <Icon name={hearing === v.id ? 'pause' : 'play'} size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <p className="disc-sent">
          <Icon name="shield" size={14} /> Sent to your AI: how you arrive, what you wrote and your
          intentions. The words are then spoken by OpenAI. Your journal is never sent.
        </p>

        <button
          className="btn btn-primary btn-lg sit-go"
          disabled={!ready || busy}
          onClick={() => void make()}
        >
          <Icon name="sparkle" size={17} />
          {busy ? 'Making it…' : `Make my ${minutes}-minute meditation`}
        </button>
        {busy && (
          <div className="guide-thinking inline" role="status">
            <span className="guide-orb" aria-hidden="true" />
            <p>{stage.text} It takes about a minute.</p>
          </div>
        )}
        {error && <ErrorNote message={error} />}
      </section>

      {newest && (
        <SitCard
          sit={newest}
          fresh
          onBegin={() => void begin(newest)}
          onDelete={() => void remove(newest)}
        />
      )}

      {earlier.length > 0 && (
        <section className="section" aria-labelledby="sit-earlier">
          <div className="section-head">
            <h2 id="sit-earlier">{newest ? 'Made before' : 'Yours'}</h2>
          </div>
          <div className="sit-grid">
            {earlier.map((s) => (
              <SitCard
                key={s.id}
                sit={s}
                onBegin={() => void begin(s)}
                onDelete={() => void remove(s)}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function SitCard({
  sit,
  fresh,
  onBegin,
  onDelete,
}: {
  sit: SitDto;
  fresh?: boolean;
  onBegin: () => void;
  onDelete: () => void;
}) {
  const h = hue(sit.id);
  return (
    <article className={`sit-card${fresh ? ' fresh' : ''}`}>
      <div
        className="sit-art"
        aria-hidden="true"
        style={{
          background: `radial-gradient(120% 90% at 20% 15%, hsl(${h} 70% 62% / .9), transparent 60%),
            radial-gradient(90% 80% at 85% 90%, hsl(${(h + 60) % 360} 65% 45% / .85), transparent 65%),
            linear-gradient(160deg, hsl(${(h + 300) % 360} 45% 22%), hsl(${(h + 20) % 360} 40% 12%))`,
        }}
      >
        <span className="sit-art-min">{sit.minutes}′</span>
      </div>
      <div className="sit-body">
        {fresh && <span className="sit-new">Just made</span>}
        <h3>{sit.title}</h3>
        <p className="sub">
          {sit.minutes} min · {focusLabel(sit.focus)} · {voiceLabel(sit.voice)} ·{' '}
          {when(sit.createdAt)}
          {sit.sat > 0 ? ` · sat ${sit.sat}×` : ''}
        </p>
        {sit.note && <p className="sit-note">“{sit.note}”</p>}
        <div className="sit-actions">
          <button className="btn btn-primary" onClick={onBegin}>
            <Icon name="play" size={16} /> Begin
          </button>
          <details className="sit-words">
            <summary>Read the words</summary>
            <ol>
              {sit.script.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          </details>
          <button
            className="icon-btn sit-del"
            aria-label={`Delete ${sit.title}`}
            onClick={onDelete}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      </div>
    </article>
  );
}
