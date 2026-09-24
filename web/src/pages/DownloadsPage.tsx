/**
 * Downloads: every meditation kept on this device, how much room they take,
 * and a way to clear them - one at a time or all at once. Works with no
 * connection: the list and the player both come from the device.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDuration } from '@zenport/shared';
import { Cover, EmptyState, Icon } from '../components/ui.tsx';
import { usePlayer } from '../player/PlayerProvider.tsx';
import {
  cancelDownload,
  formatBytes,
  offlineSupported,
  removeAllDownloads,
  removeDownload,
  useOffline,
} from '../offline.ts';

export function DownloadsPage() {
  const off = useOffline();
  const player = usePlayer();
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    void navigator.storage
      ?.estimate?.()
      .then((e) => setQuota({ usage: e.usage ?? 0, quota: e.quota ?? 0 }))
      .catch(() => {});
  }, [off.totalBytes]);

  const busy = [...off.progress.entries()].filter(([, p]) => !p.error);

  return (
    <>
      <div className="page-head">
        <h1>Downloads</h1>
        <p className="lede">
          Meditations kept on this device. They play with no connection - on a flight, in the
          countryside - and your sits count once you are back online.
        </p>
      </div>

      {!offlineSupported() ? (
        <p className="notice">This browser cannot keep meditations for offline use.</p>
      ) : (
        <>
          <div className="dl-summary">
            <span className="dl-summary-ic">
              <Icon name="on-device" size={20} />
            </span>
            <span className="grow">
              <strong>
                {off.records.length === 0
                  ? 'Nothing downloaded yet'
                  : `${off.records.length} meditation${off.records.length === 1 ? '' : 's'} · ${formatBytes(off.totalBytes)}`}
              </strong>
              {quota && quota.quota > 0 && (
                <span className="sub">
                  {formatBytes(Math.max(0, quota.quota - quota.usage))} free for ZenPort on this
                  device
                </span>
              )}
            </span>
            {off.records.length > 0 &&
              (confirmAll ? (
                <span className="dl-all-confirm">
                  <button className="btn btn-sm btn-quiet" onClick={() => setConfirmAll(false)}>
                    Keep
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      setConfirmAll(false);
                      void removeAllDownloads();
                    }}
                  >
                    Remove all
                  </button>
                </span>
              ) : (
                <button className="btn btn-sm btn-quiet" onClick={() => setConfirmAll(true)}>
                  Remove all
                </button>
              ))}
          </div>

          {busy.length > 0 && (
            <section className="section" aria-labelledby="sec-dl-now">
              <div className="section-head">
                <h2 id="sec-dl-now">Downloading</h2>
              </div>
              <div className="rowlist">
                {busy.map(([id, p]) => (
                  <div className="row" key={id}>
                    <div className="grow">
                      <div className="dl-bar" aria-hidden="true">
                        <span
                          style={{
                            inlineSize: `${p.total ? Math.min(100, (p.loaded / p.total) * 100) : 0}%`,
                          }}
                        />
                      </div>
                      <div className="sub">
                        {formatBytes(p.loaded)} of {formatBytes(p.total)}
                      </div>
                    </div>
                    <button className="btn btn-sm btn-quiet" onClick={() => cancelDownload(id)}>
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {off.records.length === 0 ? (
            <EmptyState
              title="Take a few with you"
              art="empty-library"
              action={
                <Link className="btn btn-primary" to="/library">
                  Choose from the library
                </Link>
              }
            >
              Open any meditation and tap <strong>Download</strong>. Courses and talks stay online -
              they are too large to keep on a phone.
            </EmptyState>
          ) : (
            <div className="dl-list">
              {off.records.map((r) => (
                <div className="dl-row" key={r.itemId}>
                  <button
                    className="dl-play"
                    onClick={() => player.start(r.detail)}
                    aria-label={`Play ${r.title}`}
                  >
                    <span className="dl-cover">
                      <Cover coverId={r.coverId} title={r.title} creator={r.creator} />
                    </span>
                    <span className="grow">
                      <span className="dl-title">{r.title}</span>
                      <span className="sub">
                        {r.creator}
                        {r.detail.totalDurationSec
                          ? ` · ${formatDuration(r.detail.totalDurationSec)}`
                          : ''}{' '}
                        · {formatBytes(r.bytes)}
                      </span>
                    </span>
                    <span className="dl-play-ic" aria-hidden="true">
                      <Icon name="play" size={16} />
                    </span>
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`Remove ${r.title} from this device`}
                    onClick={() => void removeDownload(r.itemId)}
                  >
                    <Icon name="trash" size={17} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
