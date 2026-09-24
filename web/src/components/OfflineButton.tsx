/**
 * Download a meditation for offline use - and see it, and undo it.
 *
 * Idle: "Download · 24 MB". Downloading: a ring filling with the bytes, the
 * percentage, and a tap to cancel. Done: "On this device" with its size, and
 * a tap offers to remove it. Courses and talks are left out on purpose -
 * they can run to gigabytes.
 */
import { useState } from 'react';
import type { MeditationDetailDto } from '@zenport/shared';
import {
  cancelDownload,
  clearDownloadError,
  downloadSize,
  formatBytes,
  offlineSupported,
  removeDownload,
  startDownload,
  useOffline,
} from '../offline.ts';
import { Icon } from './ui.tsx';

export function OfflineButton({ item }: { item: MeditationDetailDto }) {
  const off = useOffline();
  const [confirm, setConfirm] = useState(false);
  if (!offlineSupported()) return null;
  const rec = off.records.find((r) => r.itemId === item.id);
  const prog = off.progress.get(item.id);

  if (prog?.error) {
    return (
      <button
        className="btn btn-ghost offline-btn error"
        onClick={() => {
          clearDownloadError(item.id);
          void startDownload(item);
        }}
        title={prog.error}
      >
        <Icon name="download" size={16} /> Try the download again
      </button>
    );
  }

  if (prog) {
    const pct = prog.total > 0 ? Math.min(1, prog.loaded / prog.total) : 0;
    const r = 8;
    const c = 2 * Math.PI * r;
    return (
      <button
        className="btn btn-ghost offline-btn busy"
        onClick={() => cancelDownload(item.id)}
        aria-label={`Downloading, ${Math.round(pct * 100)}% - tap to cancel`}
      >
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <circle cx="10" cy="10" r={r} className="dl-track" />
          <circle
            cx="10"
            cy="10"
            r={r}
            className="dl-fill"
            strokeDasharray={`${pct * c} ${c}`}
            transform="rotate(-90 10 10)"
          />
        </svg>
        Downloading {Math.round(pct * 100)}%<span className="dl-cancel">Cancel</span>
      </button>
    );
  }

  if (rec) {
    return confirm ? (
      <span className="offline-confirm">
        <span>Remove the offline copy ({formatBytes(rec.bytes)})?</span>
        <button className="btn btn-sm btn-quiet" onClick={() => setConfirm(false)}>
          Keep
        </button>
        <button
          className="btn btn-sm btn-danger"
          onClick={() => {
            setConfirm(false);
            void removeDownload(item.id);
          }}
        >
          Remove
        </button>
      </span>
    ) : (
      <button
        className="btn btn-ghost offline-btn done"
        onClick={() => setConfirm(true)}
        title="Plays with no connection. Tap to remove it from this device."
      >
        <Icon name="on-device" size={16} /> On this device
        <span className="dl-size">{formatBytes(rec.bytes)}</span>
      </button>
    );
  }

  const size = downloadSize(item);
  return (
    <button className="btn btn-ghost offline-btn" onClick={() => void startDownload(item)}>
      <Icon name="download" size={16} /> Download
      {size > 0 && <span className="dl-size">{formatBytes(size)}</span>}
    </button>
  );
}
