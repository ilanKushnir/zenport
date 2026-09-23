/**
 * "What's new" — shown once per release to someone who was here before it.
 *
 * The truth lives on the account (`user_prefs.seen_version`), so dismissing
 * on a phone also silences the laptop. A same-device echo in localStorage
 * only stops it flashing on a reload before the account's answer arrives.
 *
 * The version at the foot of the sidebar and in Settings re-opens it on
 * demand, seen or not.
 */
import { useEffect, useState } from 'react';
import { usePrefs } from '../prefs.tsx';
import { Icon, Sheet } from '../components/ui.tsx';
import { Logo } from '../components/Brand.tsx';
import { CHANGELOG, LATEST_RELEASE_VERSION, shouldAnnounce } from './changelog.ts';

export const WHATS_NEW_EVENT = 'zenport:whatsnew';
export const REPO_URL = 'https://github.com/ilanKushnir/zenport';

export function openWhatsNew(): void {
  document.dispatchEvent(new CustomEvent(WHATS_NEW_EVENT));
}

const SEEN_KEY = 'zp-whatsnew-seen';
function readSeen(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}
function writeSeen(v: string): void {
  try {
    localStorage.setItem(SEEN_KEY, v);
  } catch {
    /* private mode; the account still remembers */
  }
}

export function WhatsNew() {
  const { prefs, ready, save } = usePrefs();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!ready) return;
    // The welcome tour is running for a brand-new account; it stamps the
    // version itself when it finishes. Two dialogs at once is not a welcome.
    if (prefs.onboardedAt === null) return;
    if (!shouldAnnounce(prefs.seenVersion)) return;
    if (readSeen() === LATEST_RELEASE_VERSION) return;
    setOpen(true);
  }, [ready, prefs.onboardedAt, prefs.seenVersion]);

  useEffect(() => {
    const on = () => setOpen(true);
    document.addEventListener(WHATS_NEW_EVENT, on);
    return () => document.removeEventListener(WHATS_NEW_EVENT, on);
  }, []);

  const dismiss = () => {
    setOpen(false);
    writeSeen(LATEST_RELEASE_VERSION);
    if (prefs.seenVersion !== LATEST_RELEASE_VERSION) {
      void save({ seenVersion: LATEST_RELEASE_VERSION });
    }
  };

  return open ? <WhatsNewDialog onDismiss={dismiss} /> : null;
}

function WhatsNewDialog({ onDismiss }: { onDismiss: () => void }) {
  const [showOlder, setShowOlder] = useState(false);
  const [current, ...older] = CHANGELOG;
  if (!current) return null;

  return (
    <Sheet title={`What's new in ${current.version}`} onClose={onDismiss} labelId="wn-title">
      <div className="wn">
        <div className="wn-hero">
          <Logo size={44} />
          <p className="wn-lede">A few things changed since you were last here.</p>
        </div>

        <ul className="wn-list">
          {current.items.map((item, i) => (
            <li key={i}>
              <span className="wn-emoji" aria-hidden="true">
                {item.emoji}
              </span>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>

        {older.length > 0 && (
          <>
            <button
              type="button"
              className="wn-older"
              onClick={() => setShowOlder((v) => !v)}
              aria-expanded={showOlder}
            >
              <Icon name={showOlder ? 'chevron-down' : 'chevron-right'} size={15} />
              {showOlder ? 'Hide older versions' : 'Older versions'}
            </button>
            {showOlder &&
              older.map((release) => (
                <section className="wn-past" key={release.version}>
                  <h3 className="wn-past-head">Version {release.version}</h3>
                  <ul className="wn-list">
                    {release.items.map((item, i) => (
                      <li key={i}>
                        <span className="wn-emoji" aria-hidden="true">
                          {item.emoji}
                        </span>
                        <span>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </>
        )}

        <div className="form-actions wn-foot">
          <a className="btn btn-quiet" href={REPO_URL} target="_blank" rel="noreferrer">
            <Icon name="github" size={16} />
            GitHub
          </a>
          <button className="btn btn-primary" onClick={onDismiss}>
            Continue
          </button>
        </div>
      </div>
    </Sheet>
  );
}

/** Version chip + repo link; the sidebar foot and the Settings "About" row. */
export function VersionRow({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`version-row${compact ? ' compact' : ''}`}>
      <button className="version-btn" onClick={openWhatsNew} title="What's new in this version">
        v{__ZP_VERSION__}
      </button>
      <a
        className="icon-btn"
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="ZenPort on GitHub"
        title="ZenPort on GitHub"
      >
        <Icon name="github" size={17} />
      </a>
    </div>
  );
}
