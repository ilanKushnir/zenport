import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Config } from './config.js';
import type { ExternalDeps, VideoMeta } from './context.js';

const execFileP = promisify(execFile);

/**
 * The only outbound network calls ZenPort can ever make, all user-initiated:
 *  - YouTube oEmbed metadata for a URL the user pasted;
 *  - yt-dlp metadata listing (local binary, user-configured);
 *  - the self-hoster's own Whisper-compatible endpoint, when configured.
 * There is no telemetry anywhere.
 */
export function buildDeps(config: Config): ExternalDeps {
  const fetchVideoMeta = async (videoId: string): Promise<VideoMeta | null> => {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`,
    )}&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { title?: string; author_name?: string };
    if (!data.title) return null;
    return { title: data.title, author: data.author_name ?? null };
  };

  const listPlaylist = config.ytdlpPath
    ? async (ref: { kind: 'playlist' | 'channel'; value: string }) => {
        const target =
          ref.kind === 'playlist'
            ? `https://www.youtube.com/playlist?list=${ref.value}`
            : ref.value.startsWith('@')
              ? `https://www.youtube.com/${ref.value}/videos`
              : `https://www.youtube.com/channel/${ref.value}/videos`;
        const { stdout } = await execFileP(
          config.ytdlpPath as string,
          [
            '--flat-playlist',
            '--dump-single-json',
            '--no-warnings',
            '--playlist-end',
            '500',
            target,
          ],
          { timeout: 120_000, maxBuffer: 32 * 1024 * 1024 },
        );
        const data = JSON.parse(stdout) as {
          entries?: { id?: string; title?: string; uploader?: string; channel?: string }[];
        };
        return (data.entries ?? [])
          .filter((e) => e.id && /^[A-Za-z0-9_-]{11}$/.test(e.id))
          .map((e) => ({
            videoId: e.id as string,
            title: e.title ?? '(untitled)',
            creator: e.uploader ?? e.channel ?? null,
          }));
      }
    : null;

  const transcribe = config.transcribeUrl
    ? async (file: Buffer, mime: string, fileName: string) => {
        const form = new FormData();
        form.set('model', config.transcribeModel);
        form.set('file', new Blob([new Uint8Array(file)], { type: mime }), fileName);
        const headers: Record<string, string> = {};
        if (config.transcribeApiKey) headers.Authorization = `Bearer ${config.transcribeApiKey}`;
        const res = await fetch(config.transcribeUrl as string, {
          method: 'POST',
          headers,
          body: form,
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) {
          throw new Error(`transcription endpoint answered ${res.status}`);
        }
        const data = (await res.json()) as { text?: string };
        if (typeof data.text !== 'string') throw new Error('transcription endpoint sent no text');
        return data.text;
      }
    : null;

  return { fetchVideoMeta, listPlaylist, transcribe };
}
