import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { JournalEntryDto, ServerCapabilitiesDto } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { EmptyState, ErrorNote, Icon, Sheet } from '../components/ui.tsx';
import { ReflectionForm } from '../components/Reflection.tsx';

const MOOD_WORDS = ['', 'Scattered', 'Restless', 'Present', 'Settled', 'Deeply still'];

export function JournalPage() {
  const entries = useApi<JournalEntryDto[]>('/api/journal');
  const caps = useApi<ServerCapabilitiesDto>('/api/capabilities');
  const [editing, setEditing] = useState<JournalEntryDto | 'new' | null>(null);
  const [transcribing, setTranscribing] = useState<string | null>(null);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);

  const remove = async (entry: JournalEntryDto) => {
    if (
      !window.confirm(
        'Delete this reflection for good? Voice notes attached to it are removed too.',
      )
    )
      return;
    await api.del(`/api/journal/${entry.id}`).catch(() => {});
    entries.reload();
  };

  const transcribe = async (voiceId: string) => {
    setTranscribing(voiceId);
    setTranscribeError(null);
    try {
      await api.post(`/api/journal/voice/${voiceId}/transcribe`);
      entries.reload();
    } catch (err) {
      setTranscribeError(err instanceof Error ? err.message : 'transcription failed');
    } finally {
      setTranscribing(null);
    }
  };

  if (entries.loading) return <div className="skeleton" style={{ height: 200 }} />;
  if (entries.error) return <ErrorNote message={entries.error} onRetry={entries.reload} />;

  const list = entries.data ?? [];

  return (
    <>
      <div
        className="page-head"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1>Journal</h1>
          <p className="lede">
            Private to your account. Written here, stored here — exported only when you ask.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {list.length > 0 && (
            <a className="btn btn-ghost" href="/api/journal/export" download>
              Export
            </a>
          )}
          <button className="btn btn-primary" onClick={() => setEditing('new')}>
            <Icon name="plus" /> Write
          </button>
        </div>
      </div>

      {caps.data?.transcriptionEnabled && caps.data.transcriptionHost && (
        <p className="notice" style={{ marginBottom: 24 }}>
          Voice transcription is on for this server: when you tap “Transcribe”, that one recording
          is sent to <strong>{caps.data.transcriptionHost}</strong> (your configured endpoint) and
          nowhere else. Nothing is ever sent without that tap.
        </p>
      )}

      {list.length === 0 ? (
        <EmptyState
          title="An empty page, in the best way"
          action={
            <button className="btn btn-primary" onClick={() => setEditing('new')}>
              Write the first entry
            </button>
          }
        >
          After each practice ZenPort offers a gentle reflection prompt — or write freely any time.
        </EmptyState>
      ) : (
        <div>
          {list.map((entry) => (
            <article className="journal-entry" key={entry.id}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'baseline',
                }}
              >
                <div className="when">
                  {new Date(entry.createdAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                  {entry.meditationTitle && entry.meditationId && (
                    <>
                      {' · after '}
                      <Link to={`/m/${entry.meditationId}`}>{entry.meditationTitle}</Link>
                    </>
                  )}
                  {entry.mood && ` · ${MOOD_WORDS[entry.mood]}`}
                </div>
                <div style={{ display: 'flex', gap: 4, flex: 'none' }}>
                  <button className="btn btn-sm btn-quiet" onClick={() => setEditing(entry)}>
                    Edit
                  </button>
                  <button className="btn btn-sm btn-quiet" onClick={() => void remove(entry)}>
                    Delete
                  </button>
                </div>
              </div>
              {entry.title && <h3 style={{ marginTop: 8 }}>{entry.title}</h3>}
              {entry.body && <p className="body">{entry.body}</p>}
              {entry.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                  {entry.tags.map((t) => (
                    <span className="badge" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
              {entry.voice && (
                <div style={{ marginTop: 12 }}>
                  <audio
                    controls
                    src={`/api/media/voice/${entry.voice.id}`}
                    preload="none"
                    style={{ maxWidth: '100%' }}
                  />
                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      marginTop: 6,
                      flexWrap: 'wrap',
                    }}
                  >
                    {entry.voice.transcriptStatus === 'done' && entry.voice.transcript ? (
                      <p
                        className="body"
                        style={{ color: 'var(--muted)', fontStyle: 'italic', marginTop: 0 }}
                      >
                        “{entry.voice.transcript}”
                      </p>
                    ) : caps.data?.transcriptionEnabled ? (
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={transcribing === entry.voice.id}
                        onClick={() => void transcribe(entry.voice!.id)}
                      >
                        {transcribing === entry.voice.id
                          ? 'Transcribing…'
                          : entry.voice.transcriptStatus === 'error'
                            ? 'Retry transcription'
                            : 'Transcribe'}
                      </button>
                    ) : null}
                    {entry.voice.transcriptStatus === 'error' && entry.voice.transcriptError && (
                      <span style={{ color: 'var(--danger)', fontSize: 12.5 }}>
                        {entry.voice.transcriptError}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      {transcribeError && <ErrorNote message={transcribeError} />}

      {editing && (
        <Sheet
          title={editing === 'new' ? 'New reflection' : 'Edit reflection'}
          onClose={() => setEditing(null)}
        >
          <ReflectionForm
            entry={editing === 'new' ? undefined : editing}
            onDone={() => {
              setEditing(null);
              entries.reload();
            }}
          />
        </Sheet>
      )}
    </>
  );
}
