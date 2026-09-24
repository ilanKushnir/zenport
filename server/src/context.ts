import type { Config } from './config.js';
import type { Db } from './db/index.js';
import type { AiClient } from './ai/providers.js';

export interface VideoMeta {
  title: string;
  author: string | null;
}

/** Injectable externals so tests never touch the network or a real yt-dlp. */
export interface ExternalDeps {
  /** Fetch public video metadata (oEmbed). Null when unavailable. */
  fetchVideoMeta: (videoId: string) => Promise<VideoMeta | null>;
  /** Run yt-dlp for metadata-only listing. Null when the binary is not configured. */
  listPlaylist:
    | ((ref: {
        kind: 'playlist' | 'channel';
        value: string;
      }) => Promise<{ videoId: string; title: string; creator: string | null }[]>)
    | null;
  /** POST audio to a Whisper-compatible endpoint. Null when transcription is disabled. */
  transcribe: ((file: Buffer, mime: string, fileName: string) => Promise<string>) | null;
  /** The account's own AI provider (or the owner's shared one): model listing and structured answers. */
  ai: AiClient;
}

export interface AppContext {
  db: Db;
  config: Config;
  version: string;
  deps: ExternalDeps;
}
