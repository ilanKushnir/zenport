/**
 * The release history behind the "What's new" dialog.
 *
 * - Newest release first. The dialog shows `CHANGELOG[0]`; everything below
 *   waits behind "Older versions".
 * - Only releases with something a person would notice get a block; a patch
 *   that fixed a crash nobody saw never re-opens the dialog.
 * - One plain sentence per line. This is the one place the app interrupts
 *   someone on the way to a sit, so it has to earn that and get out of the way.
 * - `CHANGELOG[0].version` must equal the package version; a test enforces
 *   it so a release cannot ship without its notes.
 */

export interface ChangelogItem {
  /** Decorative; rendered aria-hidden. */
  emoji: string;
  text: string;
}

export interface ChangelogRelease {
  /** Matches the git tag, without the leading `v`. */
  version: string;
  items: ChangelogItem[];
}

export const CHANGELOG: ChangelogRelease[] = [
  {
    version: '0.2.0',
    items: [
      {
        emoji: '🌅',
        text: 'Today is the front door: a greeting, your daily ring, one suggestion, and a sit one tap away.',
      },
      {
        emoji: '👋',
        text: 'A welcome tour on first run sets your accent, target, sit length and bell as you go — replay it from Settings.',
      },
      {
        emoji: '⏱️',
        text: 'Sit in silence: an unguided timer with bells to open and close, bells along the way, and a breath guide. It counts toward your practice.',
      },
      {
        emoji: '❤️',
        text: 'Favourites, with their own shelf on Today and a filter in the Library.',
      },
      {
        emoji: '⌘',
        text: 'Press ⌘K or Ctrl-K anywhere to jump to a meditation, a page or a preference.',
      },
      {
        emoji: '🎨',
        text: 'The ZenPort logo across the app, four accents drawn from it, and cover art generated for recordings that have none.',
      },
    ],
  },
  {
    version: '0.1.0',
    items: [
      {
        emoji: '📚',
        text: 'A read-only library indexed straight from your folders — nothing renamed, nothing moved.',
      },
      {
        emoji: '🎧',
        text: 'A meditation-first player with resume, a settling lead-in, interval bells and a focus mode.',
      },
      {
        emoji: '📓',
        text: 'Plans, an honest practice history, and a private journal with voice notes.',
      },
    ],
  },
];

export const LATEST_RELEASE_VERSION = CHANGELOG[0]!.version;

/** Semver-ish compare on the numeric parts only; good enough for x.y.z tags. */
export function olderThan(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => Number(n) || 0);
  const pb = b.split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

/**
 * Whether this account should be told about the latest release.
 *
 * `undefined` means preferences have not loaded yet — say nothing rather than
 * flash a dialog that may be dismissed a moment later. `null` means the
 * account was here before this feature existed, which is exactly who should
 * be told. A brand-new account never sees it: the welcome tour stamps the
 * current version, since a changelog for an app you have never used is noise.
 */
export function shouldAnnounce(seenVersion: string | null | undefined): boolean {
  if (seenVersion === undefined) return false;
  if (seenVersion === null) return true;
  return olderThan(seenVersion, LATEST_RELEASE_VERSION);
}
