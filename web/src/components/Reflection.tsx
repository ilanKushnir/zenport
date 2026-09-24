import { useEffect, useRef, useState } from 'react';
import type { JournalEntryDto, MeditationDetailDto } from '@zenport/shared';
import { useApi } from '../hooks.ts';
import { milestoneLine, ordinal } from './TimesPractised.tsx';
import { api, uploadBinary } from '../api.ts';
import { Icon, Sheet } from './ui.tsx';
import { usePlayer } from '../player/PlayerProvider.tsx';

const MOODS: [number, string][] = [
  [1, 'Scattered'],
  [2, 'Restless'],
  [3, 'Present'],
  [4, 'Settled'],
  [5, 'Deeply still'],
];

/** A line of water, choppy at 1 and flat at 5 - the scale drawn as what it means. */
function MoodWave({ level }: { level: number }) {
  const amp = [7, 5, 3.2, 1.6, 0.4][level - 1] ?? 0;
  const waves = [3.5, 3, 2.5, 2, 1.5][level - 1] ?? 1;
  const pts: string[] = [];
  for (let x = 0; x <= 40; x += 1) {
    const y = 14 + Math.sin((x / 40) * Math.PI * 2 * waves) * amp;
    pts.push(`${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(2)}`);
  }
  return (
    <svg viewBox="0 0 40 28" width="40" height="28" aria-hidden="true">
      <path
        d={pts.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const STARTERS = ['I noticed… ', 'What stayed with me… ', 'My body felt… ', "I'm grateful for… "];

/** Post-practice reflection: shown after a completed session, always skippable. */
export function ReflectionSheet() {
  const p = usePlayer();
  const prompt = p.reflect;
  if (!prompt) return null;
  return <ReflectionSheetInner key={prompt.sessionId} />;
}

/** Which time this was - only when the sit just finished counted as one. */
function TimesLine({ meditationId }: { meditationId: string }) {
  const item = useApi<MeditationDetailDto>(`/api/items/${meditationId}`);
  const d = item.data;
  if (!d || d.practiceCount < 1 || !d.lastPracticedAt) return null;
  if (Date.now() - new Date(d.lastPracticedAt).getTime() > 3 * 60_000) return null;
  const special = milestoneLine(d.practiceCount);
  return (
    <p className={`rf-times${special ? ' milestone' : ''}`}>
      <Icon name={special ? 'sparkle' : 'lotus'} size={14} />
      {special ?? `Your ${ordinal(d.practiceCount)} time with this meditation.`}
    </p>
  );
}

function ReflectionSheetInner() {
  const p = usePlayer();
  const prompt = p.reflect!;
  return (
    <Sheet title="A moment of reflection" onClose={p.clearReflect} labelId="reflect-title">
      <div className="rf-hero">
        <img src="/art/reflect.webp" alt="" width={280} height={280} />
        <p>
          {prompt.learning ? 'You finished ' : 'You sat with '}
          <strong>{prompt.meditationTitle}</strong>
          {prompt.minutes
            ? ` - ${prompt.minutes} ${prompt.minutes === 1 ? 'minute' : 'minutes'}`
            : ''}
          .{' '}
          {prompt.learning
            ? 'What do you want to keep from it? A line now is worth pages later.'
            : 'A line now is worth pages later - or skip it, the sit already counts.'}
        </p>
      </div>
      {!prompt.learning && prompt.meditationId && !prompt.meditationId.startsWith('ai:') && (
        <TimesLine meditationId={prompt.meditationId} />
      )}
      <ReflectionForm
        sessionId={prompt.sessionId}
        meditationId={prompt.meditationId}
        onDone={p.clearReflect}
        onSkip={p.clearReflect}
      />
    </Sheet>
  );
}

export function ReflectionForm({
  sessionId,
  meditationId,
  entry,
  onDone,
  onSkip,
  prompt,
}: {
  sessionId?: number | null;
  meditationId?: string | null;
  entry?: JournalEntryDto;
  /** A question to write about (from the guide); it becomes the entry's title. */
  prompt?: string;
  onDone: (entry: JournalEntryDto) => void;
  onSkip?: () => void;
}) {
  const [title, setTitle] = useState(entry?.title ?? prompt?.slice(0, 200) ?? '');
  const [body, setBody] = useState(entry?.body ?? '');
  const [mood, setMood] = useState<number | null>(entry?.mood ?? null);
  const [tags, setTags] = useState(entry?.tags.join(', ') ?? '');
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceSec, setVoiceSec] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(!!(entry?.title || entry?.tags.length));
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: title.trim() || null,
        body,
        mood,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        ...(entry ? {} : { sessionId: sessionId ?? null, meditationId: meditationId ?? null }),
      };
      let saved: JournalEntryDto;
      saved = entry
        ? await api.patch<JournalEntryDto>(`/api/journal/${entry.id}`, payload)
        : await api.post<JournalEntryDto>('/api/journal', payload);
      if (voiceBlob) {
        saved = await uploadBinary<JournalEntryDto>(`/api/journal/${saved.id}/voice`, voiceBlob, {
          'x-zp-duration': String(Math.round(voiceSec)),
        });
      }
      onDone(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not save - your words are still here');
    } finally {
      setSaving(false);
    }
  };

  const start = (s: string) => {
    setBody((b) => (b.trim() ? `${b.trimEnd()}\n${s}` : s));
    requestAnimationFrame(() => {
      const el = bodyRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  };

  const empty = !body.trim() && (!title.trim() || title === prompt) && !mood && !voiceBlob;

  return (
    <div className="rf">
      <fieldset className="rf-block">
        <legend>How settled do you feel?</legend>
        <div className="rf-moods" role="radiogroup" aria-label="How settled do you feel?">
          {MOODS.map(([value, name]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={mood === value}
              className={`rf-mood${mood === value ? ' on' : ''}`}
              onClick={() => setMood(mood === value ? null : value)}
            >
              <MoodWave level={value} />
              <span>{name}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="rf-block">
        <label htmlFor="rf-body" className={`rf-label${prompt ? ' rf-prompt' : ''}`}>
          {prompt ?? 'What surfaced?'}
        </label>
        <textarea
          id="rf-body"
          ref={bodyRef}
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Anything - a feeling, an image, a knot that loosened…"
        />
        <div className="rf-starters" aria-label="Ways to begin">
          {STARTERS.map((s) => (
            <button key={s} type="button" className="rf-starter" onClick={() => start(s)}>
              {s.replace('… ', '…')}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="rf-more" aria-expanded={more} onClick={() => setMore(!more)}>
        <Icon name={more ? 'chevron-down' : 'chevron-right'} size={15} />
        {more ? 'Fewer options' : 'Add a title, tags or a voice note'}
      </button>

      {more && (
        <div className="rf-extras">
          <div className="field-row">
            <div className="field">
              <label htmlFor="rf-title">Title</label>
              <input id="rf-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="rf-tags">Tags, comma-separated</label>
              <input
                id="rf-tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="gratitude, sleep"
              />
            </div>
          </div>
          {!entry?.voice && (
            <div className="field">
              <label>Voice note</label>
              <VoiceRecorder
                onRecorded={(b, sec) => {
                  setVoiceBlob(b);
                  setVoiceSec(sec);
                }}
                onCleared={() => setVoiceBlob(null)}
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="error-note">{error}</p>}
      <div className="rf-actions">
        {onSkip && (
          <button className="btn btn-quiet" onClick={onSkip}>
            Skip for now
          </button>
        )}
        <button className="btn btn-primary" onClick={() => void save()} disabled={saving || empty}>
          {saving ? 'Saving…' : entry ? 'Save changes' : 'Keep this reflection'}
        </button>
      </div>
    </div>
  );
}

export function VoiceRecorder({
  onRecorded,
  onCleared,
}: {
  onRecorded: (blob: Blob, seconds: number) => void;
  onCleared: () => void;
}) {
  const [state, setState] = useState<'idle' | 'recording' | 'done' | 'unsupported' | 'denied'>(
    typeof MediaRecorder === 'undefined' ? 'unsupported' : 'idle',
  );
  const [seconds, setSeconds] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recRef.current?.stream.getTracks().forEach((t) => t.stop());
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mime });
        setUrl(URL.createObjectURL(blob));
        setState('done');
        setSeconds((s) => {
          onRecorded(blob, s);
          return s;
        });
        if (timerRef.current) clearInterval(timerRef.current);
      };
      rec.start();
      setSeconds(0);
      setState('recording');
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setState('denied');
    }
  };

  if (state === 'unsupported') {
    return (
      <p className="notice">This browser cannot record audio - the written note still works.</p>
    );
  }
  if (state === 'denied') {
    return (
      <p className="notice">
        Microphone access was declined. Allow it in the browser’s site settings to record, or just
        write instead.
      </p>
    );
  }
  if (state === 'recording') {
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn btn-danger" onClick={() => recRef.current?.stop()}>
          <Icon name="mic" /> Stop ({seconds}s)
        </button>
        <span className="sub" style={{ color: 'var(--muted)', fontSize: 13 }}>
          Recording locally - nothing leaves this device until you save.
        </span>
      </div>
    );
  }
  if (state === 'done' && url) {
    return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <audio controls src={url} style={{ maxWidth: '100%' }} />
        <button
          className="btn btn-sm btn-quiet"
          onClick={() => {
            setState('idle');
            setUrl(null);
            onCleared();
          }}
        >
          Discard
        </button>
      </div>
    );
  }
  return (
    <button className="btn btn-ghost" onClick={() => void startRec()}>
      <Icon name="mic" /> Record a voice note
    </button>
  );
}
