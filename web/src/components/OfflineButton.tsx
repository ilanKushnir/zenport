/**
 * Keep a meditation on this device for offline use - and see it, and undo it.
 *
 * "Save offline", not "Download": nothing lands in the phone's files; the
 * meditation is kept inside ZenPort so it plays with no connection.
 * Saving: a ring fills inside the icon with the percentage beneath, and a
 * tap cancels. Saved: "Saved offline" with its size; a tap asks whether to
 * remove it. Courses and talks are left out on purpose - they can run to
 * gigabytes.
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
import { ActionTile } from './ActionTile.tsx';
import { Sheet } from './ui.tsx';

export function OfflineTile({ item }: { item: MeditationDetailDto }) {
  const off = useOffline();
  const [confirm, setConfirm] = useState(false);
  if (!offlineSupported()) return null;
  const rec = off.records.find((r) => r.itemId === item.id);
  const prog = off.progress.get(item.id);

  if (prog?.error) {
    return (
      <ActionTile
        icon="download"
        tone="error"
        label="Try again"
        hint="Not saved"
        title={prog.error}
        onClick={() => {
          clearDownloadError(item.id);
          void startDownload(item);
        }}
      />
    );
  }

  if (prog) {
    const pct = prog.total > 0 ? Math.min(1, prog.loaded / prog.total) : 0;
    const r = 9;
    const c = 2 * Math.PI * r;
    return (
      <ActionTile
        icon={
          <svg viewBox="0 0 22 22" width="22" height="22">
            <circle cx="11" cy="11" r={r} className="dl-track" />
            <circle
              cx="11"
              cy="11"
              r={r}
              className="dl-fill"
              strokeDasharray={`${pct * c} ${c}`}
              transform="rotate(-90 11 11)"
            />
          </svg>
        }
        tone="on"
        label={`Saving ${Math.round(pct * 100)}%`}
        hint="Tap to stop"
        ariaLabel={`Saving for offline, ${Math.round(pct * 100)}% - tap to stop`}
        onClick={() => cancelDownload(item.id)}
      />
    );
  }

  if (rec) {
    return (
      <>
        <ActionTile
          icon="on-device"
          tone="on"
          label="Saved offline"
          hint={formatBytes(rec.bytes)}
          title="Plays with no connection. Tap to remove it from this device."
          onClick={() => setConfirm(true)}
        />
        {confirm && (
          <Sheet
            title="Remove the offline copy?"
            onClose={() => setConfirm(false)}
            labelId="offline-remove"
          >
            <div className="forget">
              <p>
                {item.title} is kept on this device ({formatBytes(rec.bytes)}) so it plays with no
                connection. Removing it frees the room; it still plays online, and you can save it
                again any time.
              </p>
              <div className="forget-actions">
                <button className="btn btn-primary" onClick={() => setConfirm(false)} autoFocus>
                  Keep it
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    setConfirm(false);
                    void removeDownload(item.id);
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          </Sheet>
        )}
      </>
    );
  }

  const size = downloadSize(item);
  return (
    <ActionTile
      icon="download"
      label="Save offline"
      hint={size > 0 ? formatBytes(size) : undefined}
      title="Keep it on this device to play with no connection"
      onClick={() => void startDownload(item)}
    />
  );
}
