import { useEffect, useRef, useState } from 'react';
import type { JournalEntryDto } from '@zenport/shared';
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

/** Post-practice reflection: shown after a completed session, always skippable. */
export function ReflectionSheet() {
  const p = usePlayer();
  const prompt = p.reflect;
  if (!prompt) return null;
  return (
    <Sheet title="A moment of reflection" onClose={p.clearReflect}>
      <p style={{ color: 'var(--muted)', marginBottom: 16 }}>
        You just finished <strong style={{ color: 'var(--text)' }}>{prompt.meditationTitle}</strong>
        . A line or two now is worth pages later - or skip it, the sit already counts.
      </p>
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
}: {
  sessionId?: number | null;
  meditationId?: string | null;
  entry?: JournalEntryDto;
  onDone: (entry: JournalEntryDto) => void;
  onSkip?: () => void;
}) {
  const [title, setTitle] = useState(entry?.title ?? '');
  const [body, setBody] = useState(entry?.body ?? '');
  const [mood, setMood] = useState<number | null>(entry?.mood ?? null);
  const [tags, setTags] = useState(entry?.tags.join(', ') ?? '');
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceSec, setVoiceSec] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div>
      <div className="field">
        <span className="visually-hidden" id="mood-label">
          How settled do you feel?
        </span>
        <label aria-hidden="true">How settled do you feel?</label>
        <div className="mood-scale" role="group" aria-labelledby="mood-label">
          {MOODS.map(([value, name]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mood === value}
              onClick={() => setMood(mood === value ? null : value)}
              title={name}
              aria-label={`${name} (${value} of 5)`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="rf-body">What surfaced?</label>
        <textarea
          id="rf-body"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Anything - a feeling, an image, a knot that loosened…"
        />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="rf-title">Title (optional)</label>
          <input id="rf-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="rf-tags">Tags, comma-separated (optional)</label>
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
          <label>Voice note (optional)</label>
          <VoiceRecorder
            onRecorded={(b, sec) => {
              setVoiceBlob(b);
              setVoiceSec(sec);
            }}
            onCleared={() => setVoiceBlob(null)}
          />
        </div>
      )}
      {error && <p className="error-note">{error}</p>}
      <div className="form-actions">
        {onSkip && (
          <button className="btn btn-quiet" onClick={onSkip}>
            Skip for now
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={() => void save()}
          disabled={saving || (!body.trim() && !title.trim() && !mood && !voiceBlob)}
        >
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
