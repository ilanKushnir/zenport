import type { ServerCapabilitiesDto } from '@zenport/shared';
import { useApi } from '../hooks.ts';
import { Icon } from '../components/ui.tsx';
import { AdminCrumb } from './AdminPage.tsx';

/**
 * Integrations surface. UBAL and MeTube are deliberately visible but
 * inert — the contract is real (a mounted download folder ZenPort scans
 * read-only) but no API integration exists yet, and nothing here pretends
 * otherwise.
 */
export function IntegrationsPage() {
  const caps = useApi<ServerCapabilitiesDto>('/api/capabilities');

  return (
    <>
      <AdminCrumb here="Integrations" />
      <div className="page-head">
        <h1>Integrations</h1>
        <p className="lede">
          What this server can reach beyond your mounted folders - and what is on the way.
        </p>
      </div>

      <section className="section" aria-labelledby="sec-now">
        <div className="section-head">
          <h2 id="sec-now">Available now</h2>
        </div>
        <div
          className="card-grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
        >
          <div className="card">
            <h3>yt-dlp metadata listing</h3>
            <p style={{ color: 'var(--muted)', marginTop: 8, fontSize: 14 }}>
              Lists playlists and channels as metadata for the Sources page. Titles only - never
              media.
            </p>
            <p style={{ marginTop: 12 }}>
              {caps.data?.ytdlpAvailable ? (
                <span className="badge badge-accent">configured</span>
              ) : (
                <span className="badge">not configured - set ZP_YTDLP_PATH</span>
              )}
            </p>
          </div>
          <div className="card">
            <h3>Whisper-compatible transcription</h3>
            <p style={{ color: 'var(--muted)', marginTop: 8, fontSize: 14 }}>
              Transcribes journal voice notes through an endpoint you run yourself. Off by default;
              each transcription is a deliberate tap.
            </p>
            <p style={{ marginTop: 12 }}>
              {caps.data?.transcriptionEnabled ? (
                <span className="badge badge-accent">on · {caps.data.transcriptionHost}</span>
              ) : (
                <span className="badge">off - set ZP_TRANSCRIBE_URL</span>
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="sec-soon">
        <div className="section-head">
          <h2 id="sec-soon">Coming soon</h2>
        </div>
        <p style={{ color: 'var(--muted)', maxWidth: '64ch', marginBottom: 20 }}>
          The planned contract for downloader integrations is deliberately simple and
          self-hosting-friendly: you mount a dedicated YouTube-meditations download folder into
          ZenPort, the downloader writes into it, and ZenPort scans it read-only exactly like any
          other library root. No API keys, no coupling, no surprises.
        </p>
        <div
          className="card-grid"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
        >
          <div className="integration-card" aria-disabled="true">
            <span className="soon badge badge-lav">Coming soon</span>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="plug" /> UBAL
            </h3>
            <p style={{ color: 'var(--muted)', marginTop: 8, fontSize: 14 }}>
              Planned: point UBAL’s output at a folder ZenPort mounts read-only, and downloaded
              meditations appear in your library on the next scan. Not implemented yet - nothing
              here talks to UBAL today.
            </p>
          </div>
          <div className="integration-card" aria-disabled="true">
            <span className="soon badge badge-lav">Coming soon</span>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="plug" /> MeTube
            </h3>
            <p style={{ color: 'var(--muted)', marginTop: 8, fontSize: 14 }}>
              Planned: the same mounted-folder contract - MeTube downloads into a dedicated
              directory, ZenPort indexes it like any other root. Not implemented yet.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
