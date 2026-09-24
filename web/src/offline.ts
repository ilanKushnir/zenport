/**
 * Meditations kept on this device for offline use.
 *
 * - Files go into Cache Storage (OFFLINE_CACHE), keyed by the same URLs the
 *   player and covers already use; the service worker serves them from there
 *   first, byte ranges included, so a downloaded meditation plays - and
 *   seeks - with no connection and without re-downloading when online.
 * - Each download streams straight into the cache while counting bytes, so a
 *   long recording is never held in memory; progress is shared app-wide.
 * - What is downloaded (and the item details needed to play it) is listed in
 *   localStorage, so the Downloads page works with no network at all.
 * - Only meditations and soundscapes: courses and talks can be many gigabytes.
 *
 * Sits played while offline are queued here too and sent up when the
 * connection returns, so streaks and counts stay true.
 */
import { useEffect, useState } from 'react';
import type { MeditationDetailDto, OfflineSessionDto } from '@zenport/shared';
import { api } from './api.ts';

export const OFFLINE_CACHE = 'zenport-offline-v1';
const LIST_KEY = 'zp-offline-v1';
const QUEUE_KEY = 'zp-offline-sessions-v1';
const EVENT = 'zenport:offline';

export interface OfflineRecord {
  itemId: string;
  title: string;
  creator: string;
  coverId: string | null;
  bytes: number;
  savedAt: string;
  /** Everything the player needs, so it can start with no network. */
  detail: MeditationDetailDto;
}

export interface DownloadProgress {
  loaded: number;
  total: number;
  error?: string;
}

export const offlineSupported = () =>
  typeof caches !== 'undefined' && typeof ReadableStream !== 'undefined';

// --- The list of downloads -------------------------------------------------

function readList(): OfflineRecord[] {
  try {
    return JSON.parse(localStorage.getItem(LIST_KEY) ?? '[]') as OfflineRecord[];
  } catch {
    return [];
  }
}

function writeList(list: OfflineRecord[]) {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked: the files still play, the list just resets */
  }
  window.dispatchEvent(new Event(EVENT));
}

const progress = new Map<string, DownloadProgress>();
const controllers = new Map<string, AbortController>();

const coverUrls = (coverId: string) => [320, 640].map((w) => `/api/media/asset/${coverId}?w=${w}`);
const smallCover = (coverId: string) => `/api/media/asset/${coverId}?w=32`;

/** The files one download consists of: every track, and its cover. */
function filesFor(detail: MeditationDetailDto): string[] {
  return [
    ...detail.tracks.filter((t) => !t.missing).map((t) => `/api/media/track/${t.id}`),
    ...(detail.coverId ? [...coverUrls(detail.coverId), smallCover(detail.coverId)] : []),
  ];
}

export function downloadSize(detail: MeditationDetailDto): number {
  return detail.tracks.filter((t) => !t.missing).reduce((n, t) => n + (t.sizeBytes || 0), 0);
}

// --- Downloading -----------------------------------------------------------

export async function startDownload(detail: MeditationDetailDto): Promise<void> {
  if (!offlineSupported() || controllers.has(detail.id)) return;
  // Ask the browser not to clear our storage under pressure (best effort).
  void navigator.storage?.persist?.().catch(() => false);

  const ctrl = new AbortController();
  controllers.set(detail.id, ctrl);
  const total = downloadSize(detail);
  const state: DownloadProgress = { loaded: 0, total };
  progress.set(detail.id, state);
  window.dispatchEvent(new Event(EVENT));

  const cache = await caches.open(OFFLINE_CACHE);
  const files = filesFor(detail);
  let bytes = 0;
  let lastPing = 0;
  try {
    for (const url of files) {
      const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (!res.ok || !res.body) {
        // A missing cover is not worth failing the download over.
        if (url.includes('/asset/')) continue;
        throw new Error(`could not fetch (${res.status})`);
      }
      const isTrack = url.includes('/track/');
      const counted = res.body.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, out) {
            if (isTrack) {
              state.loaded += chunk.byteLength;
              const now = performance.now();
              if (now - lastPing > 150) {
                lastPing = now;
                window.dispatchEvent(new Event(EVENT));
              }
            }
            out.enqueue(chunk);
          },
        }),
      );
      const headers = new Headers({
        'Content-Type': res.headers.get('Content-Type') ?? 'application/octet-stream',
      });
      const len = res.headers.get('Content-Length');
      if (len) headers.set('Content-Length', len);
      await cache.put(url, new Response(counted, { headers }));
      bytes += len ? Number(len) : 0;
    }
    const list = readList().filter((r) => r.itemId !== detail.id);
    list.unshift({
      itemId: detail.id,
      title: detail.title,
      creator: detail.creator,
      coverId: detail.coverId,
      bytes: bytes || total,
      savedAt: new Date().toISOString(),
      detail,
    });
    writeList(list);
    progress.delete(detail.id);
  } catch (err) {
    // Leave nothing half-saved behind.
    await Promise.all(files.map((u) => cache.delete(u)));
    if (ctrl.signal.aborted) progress.delete(detail.id);
    else {
      progress.set(detail.id, {
        ...state,
        error:
          err instanceof DOMException && err.name === 'QuotaExceededError'
            ? 'Not enough space on this device.'
            : 'The download stopped - check the connection and try again.',
      });
    }
  } finally {
    controllers.delete(detail.id);
    window.dispatchEvent(new Event(EVENT));
  }
}

export function cancelDownload(itemId: string) {
  controllers.get(itemId)?.abort();
}

export function clearDownloadError(itemId: string) {
  progress.delete(itemId);
  window.dispatchEvent(new Event(EVENT));
}

export async function removeDownload(itemId: string): Promise<void> {
  const rec = readList().find((r) => r.itemId === itemId);
  if (rec && offlineSupported()) {
    const cache = await caches.open(OFFLINE_CACHE);
    // Keep a cover another download still uses.
    const others = readList().filter((r) => r.itemId !== itemId);
    const keep = new Set(others.flatMap((r) => filesFor(r.detail)));
    await Promise.all(
      filesFor(rec.detail)
        .filter((u) => !keep.has(u))
        .map((u) => cache.delete(u)),
    );
  }
  writeList(readList().filter((r) => r.itemId !== itemId));
}

export async function removeAllDownloads(): Promise<void> {
  for (const c of controllers.values()) c.abort();
  if (offlineSupported()) await caches.delete(OFFLINE_CACHE);
  writeList([]);
}

/** A download whose files the browser dropped (storage cleared) is forgotten. */
export async function verifyDownloads(): Promise<void> {
  if (!offlineSupported()) return;
  const cache = await caches.open(OFFLINE_CACHE);
  const list = readList();
  const ok: OfflineRecord[] = [];
  for (const r of list) {
    const tracks = r.detail.tracks.filter((t) => !t.missing);
    const present = await Promise.all(tracks.map((t) => cache.match(`/api/media/track/${t.id}`)));
    if (present.every(Boolean)) ok.push(r);
  }
  if (ok.length !== list.length) writeList(ok);
}

// --- React ----------------------------------------------------------------

export interface OfflineState {
  records: OfflineRecord[];
  ids: ReadonlySet<string>;
  progress: ReadonlyMap<string, DownloadProgress>;
  totalBytes: number;
  online: boolean;
}

function snapshot(online: boolean): OfflineState {
  const records = readList();
  return {
    records,
    ids: new Set(records.map((r) => r.itemId)),
    progress: new Map(progress),
    totalBytes: records.reduce((n, r) => n + r.bytes, 0),
    online,
  };
}

/** Everything about downloads, kept current as they progress. */
export function useOffline(): OfflineState {
  const [state, setState] = useState(() => snapshot(navigator.onLine));
  useEffect(() => {
    const update = () => setState(snapshot(navigator.onLine));
    window.addEventListener(EVENT, update);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return state;
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${Math.round(n / (1024 * 1024))} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// --- Sits played offline ------------------------------------------------------

type QueuedSession = OfflineSessionDto & { userId: number | null };

/** The account signed in on this device (kept by App for offline starts). */
function currentUserId(): number | null {
  try {
    return (
      (JSON.parse(localStorage.getItem('zp-me') ?? 'null') as { id: number } | null)?.id ?? null
    );
  } catch {
    return null;
  }
}

function readQueue(): QueuedSession[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueuedSession[];
  } catch {
    return [];
  }
}

export function queueOfflineSession(s: Omit<OfflineSessionDto, 'clientId'>) {
  if (s.listenedSec < 1) return;
  const clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify([...readQueue(), { ...s, clientId, userId: currentUserId() }].slice(-200)),
    );
  } catch {
    /* nowhere to keep it */
  }
}

/** Send queued offline sits; keep them if the server cannot be reached. */
export async function flushOfflineSessions(): Promise<void> {
  // Only this person's sits: another account on the same phone keeps its own.
  const me = currentUserId();
  const queue = readQueue()
    .filter((q) => q.userId === me)
    .slice(0, 100);
  if (queue.length === 0 || !navigator.onLine || me === null) return;
  try {
    await api.post('/api/practice/offline', {
      sessions: queue.map(({ userId: _u, ...rest }) => rest),
    });
    const sent = new Set(queue.map((q) => q.clientId));
    localStorage.setItem(
      QUEUE_KEY,
      JSON.stringify(readQueue().filter((q) => !sent.has(q.clientId))),
    );
    window.dispatchEvent(new Event('zenport:progress'));
  } catch {
    /* try again next time */
  }
}
