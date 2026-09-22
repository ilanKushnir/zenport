/**
 * YouTube URL classification. Pure and deterministic so both the server and
 * the web client agree on what a pasted URL means before anything is saved.
 * No network access happens here.
 */

export type YouTubeClassification =
  | { kind: 'video'; videoId: string; playlistId?: string }
  | { kind: 'playlist'; playlistId: string }
  | { kind: 'channel'; channelRef: string }
  | {
      kind: 'invalid';
      reason: 'malformed' | 'unsupported-host' | 'unrecognized-path' | 'bad-video-id';
    };

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const PLAYLIST_ID = /^[A-Za-z0-9_-]{10,64}$/;
const CHANNEL_ID = /^UC[A-Za-z0-9_-]{10,40}$/;
const HANDLE = /^@[A-Za-z0-9._-]{3,50}$/;

export function classifyYouTubeUrl(raw: string): YouTubeClassification {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { kind: 'invalid', reason: 'malformed' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { kind: 'invalid', reason: 'unsupported-host' };
  }
  const host = url.hostname.toLowerCase();

  if (host === 'youtu.be') {
    const id = url.pathname.split('/').filter(Boolean)[0] ?? '';
    if (!VIDEO_ID.test(id)) return { kind: 'invalid', reason: 'bad-video-id' };
    return { kind: 'video', videoId: id };
  }

  if (!YT_HOSTS.has(host)) return { kind: 'invalid', reason: 'unsupported-host' };

  const segs = url.pathname.split('/').filter(Boolean);
  const first = segs[0] ?? '';

  if (first === 'watch') {
    const v = url.searchParams.get('v');
    if (!v) return { kind: 'invalid', reason: 'unrecognized-path' };
    if (!VIDEO_ID.test(v)) return { kind: 'invalid', reason: 'bad-video-id' };
    const list = url.searchParams.get('list');
    if (list && PLAYLIST_ID.test(list)) return { kind: 'video', videoId: v, playlistId: list };
    return { kind: 'video', videoId: v };
  }

  if (first === 'shorts' || first === 'live' || first === 'embed') {
    const id = segs[1] ?? '';
    if (!VIDEO_ID.test(id)) return { kind: 'invalid', reason: 'bad-video-id' };
    return { kind: 'video', videoId: id };
  }

  if (first === 'playlist') {
    const list = url.searchParams.get('list');
    if (!list || !PLAYLIST_ID.test(list)) return { kind: 'invalid', reason: 'unrecognized-path' };
    return { kind: 'playlist', playlistId: list };
  }

  if (HANDLE.test(first)) return { kind: 'channel', channelRef: first };

  if (first === 'channel') {
    const id = segs[1] ?? '';
    if (!CHANNEL_ID.test(id)) return { kind: 'invalid', reason: 'unrecognized-path' };
    return { kind: 'channel', channelRef: id };
  }

  if (first === 'c' || first === 'user') {
    const name = segs[1] ?? '';
    if (!/^[A-Za-z0-9._-]{2,60}$/.test(name))
      return { kind: 'invalid', reason: 'unrecognized-path' };
    return { kind: 'channel', channelRef: name };
  }

  return { kind: 'invalid', reason: 'unrecognized-path' };
}

/** Canonical watch URL for a stored video id (used for links and embeds). */
export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/** Privacy-enhanced embed URL (no cookies until the user plays). */
export function privacyEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}
