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
    version: '0.32.1',
    items: [
      { emoji: '⚡', text: 'Choosing libraries responds at once, even on a slow network share.' },
    ],
  },
  {
    version: '0.32.0',
    items: [
      {
        emoji: '🧭',
        text: 'Setting up ZenPort is now part of the welcome: choose your libraries, watch them being read, and let your AI tidy them.',
      },
      {
        emoji: '📚',
        text: 'Admins choose which mounted folders are libraries, right in the app - and change them any time.',
      },
    ],
  },
  {
    version: '0.31.1',
    items: [{ emoji: '📱', text: 'The tab bar now always sits at the very bottom of the phone.' }],
  },
  {
    version: '0.31.0',
    items: [
      {
        emoji: '🧭',
        text: 'Creators are walked in order now: your next step first, programmes easier first, then packs - in a grid or a list.',
      },
      {
        emoji: '🌱',
        text: 'Every recording can have a level, and several meditations are a programme (in order) or a pack (any order).',
      },
      {
        emoji: '📘',
        text: 'Manuals and guides in a creator’s or series’ folder now show on its page.',
      },
    ],
  },
  {
    version: '0.30.1',
    items: [
      {
        emoji: '✅',
        text: 'Finished parts now show a clear tick - tap it again to mark a part not done and come back to it.',
      },
    ],
  },
  {
    version: '0.30.0',
    items: [
      {
        emoji: '✨',
        text: 'For you today is now one meditation - it stays until you sit with it, ask for something else, or leave it a few days.',
      },
    ],
  },
  {
    version: '0.29.0',
    items: [
      {
        emoji: '🎙️',
        text: 'Made for you: say how you are arriving, and your AI writes a meditation for right now - spoken by a calm voice, with real silence between the words.',
      },
    ],
  },
  {
    version: '0.28.0',
    items: [
      {
        emoji: '🧑‍🏫',
        text: 'For admins: rename and merge creators, and upload their pictures - under Review the library.',
      },
    ],
  },
  {
    version: '0.27.1',
    items: [
      { emoji: '📱', text: 'On a phone the tab bar now stays put, however fast you scroll.' },
      { emoji: '✨', text: 'For you today now sits at the top of Today, right under Begin.' },
      { emoji: '🫁', text: 'Feel the breath taps again on iPhone (with System Haptics on).' },
      {
        emoji: '🧭',
        text: 'Discover also works with your own AI server - from what it knows, clearly marked.',
      },
    ],
  },
  {
    version: '0.27.0',
    items: [
      {
        emoji: '🧭',
        text: 'Discover: teachers, courses, books and retreats beyond your library, chosen for you - every link checked.',
      },
    ],
  },
  {
    version: '0.26.0',
    items: [
      {
        emoji: '✨',
        text: 'For you today: turn it on and your AI picks three from your library each day, with why each fits now.',
      },
    ],
  },
  {
    version: '0.25.0',
    items: [
      {
        emoji: '🪷',
        text: 'Your guide: an AI mentor looks back over your practice - what is going well, what to try, where to head next.',
      },
      {
        emoji: '📓',
        text: 'Your journal goes along only when you switch it on for that review, and you see what is sent first.',
      },
    ],
  },
  {
    version: '0.24.0',
    items: [
      {
        emoji: '🖼️',
        text: 'Creators can have their own picture - a portrait, a logo or a cover - wherever they appear.',
      },
      {
        emoji: '📖',
        text: 'Recordings can carry a short description and their level, with the pages it came from.',
      },
      {
        emoji: '✨',
        text: 'For admins: Enhance the library with AI - suggested fixes, research and creator pictures, each yours to approve.',
      },
    ],
  },
  {
    version: '0.23.0',
    items: [
      { emoji: '📌', text: 'Plan with AI: choose courses that must be in it - none is left out.' },
      { emoji: '🏔️', text: 'Plans up to three years, in phases, each stage with a milestone.' },
      {
        emoji: '🌤️',
        text: 'This week on Plans shows how it is going - and Adjust with AI reworks the rest when life changes.',
      },
    ],
  },
  {
    version: '0.22.0',
    items: [
      {
        emoji: '✨',
        text: 'A new AI section - bring your own AI: OpenAI, Anthropic, Gemini, OpenRouter or your own server.',
      },
      { emoji: '🧭', text: 'Tell ZenPort why you practise; every AI feature starts from it.' },
      {
        emoji: '🗓️',
        text: 'Plan with AI without a key takes you to set one up - and straight back.',
      },
    ],
  },
  {
    version: '0.21.0',
    items: [
      {
        emoji: '▶️',
        text: 'Continue is a row of cards that resume right where you stopped - and can be set aside.',
      },
      {
        emoji: '🫧',
        text: 'Creators are round now, in a row you can swipe, with a page listing all of them.',
      },
      { emoji: '☰', text: 'Everything can be shown as a list as well as a grid.' },
    ],
  },
  {
    version: '0.20.0',
    items: [
      {
        emoji: '🌅',
        text: 'Today begins at a glance: what to practise, what to keep learning, Breathe and Write.',
      },
      {
        emoji: '🧹',
        text: 'Practice history comes a card per day - clear a whole day, or remove a single session.',
      },
      {
        emoji: '🖱️',
        text: 'On a desktop: cards rise gently under the mouse, scrollbars wear the app colours, and nothing shifts when a window opens.',
      },
    ],
  },
  {
    version: '0.19.0',
    items: [
      {
        emoji: '🔎',
        text: 'Admins can review the whole library in one place and correct anything - titles, creators, series, types, order.',
      },
      {
        emoji: '✨',
        text: 'Tidy names turns file names like "day 27 640x360-video" into something readable.',
      },
      {
        emoji: '🔔',
        text: 'When a scan finds new recordings, admins get a gentle note to look them over.',
      },
    ],
  },
  {
    version: '0.18.1',
    items: [
      {
        emoji: '✨',
        text: 'A calmer recording page: one big button, then Save offline, Add to plan and With a friend.',
      },
      {
        emoji: '📲',
        text: '"Download" is now Save offline - it keeps a meditation inside ZenPort.',
      },
    ],
  },
  {
    version: '0.17.2',
    items: [
      { emoji: '🎬', text: 'Intros and framing videos now come first in a series, not last.' },
      {
        emoji: '↕️',
        text: 'Admins can drag the parts of any recording into their own order - Edit order.',
      },
      {
        emoji: '🧭',
        text: "Move or rename folders freely: ZenPort recognises the files and keeps everyone's progress.",
      },
    ],
  },
  {
    version: '0.16.1',
    items: [
      {
        emoji: '✅',
        text: 'Mark a lesson watched, done or practised right from the player - or take it back.',
      },
      {
        emoji: '📋',
        text: 'The Lessons list in the player has a circle to tick beside every lesson.',
      },
      { emoji: '⏹️', text: '"Done for now" is now End session: it stops and keeps your place.' },
      { emoji: '🪷', text: 'The top bar fades in gently as you scroll, and the logo sits level.' },
    ],
  },
  {
    version: '0.15.0',
    items: [
      { emoji: '🧭', text: 'A top bar keeps ZenPort in place, with Settings a tap away.' },
      {
        emoji: '🛡️',
        text: 'Admins get one Admin area for people, folders, sources, integrations and scans.',
      },
    ],
  },
  {
    version: '0.14.2',
    items: [
      {
        emoji: '🎛️',
        text: 'Every button shares one shape, and pages that fit the screen no longer scroll.',
      },
    ],
  },
  {
    version: '0.14.1',
    items: [{ emoji: '🌫️', text: 'Content fades softly behind the tab bar on a phone.' }],
  },
  {
    version: '0.14.0',
    items: [
      {
        emoji: '⬇️',
        text: 'Download meditations and play them with no connection - on a flight, on a mountain.',
      },
      { emoji: '📱', text: 'See and tidy everything on your phone in Downloads.' },
      { emoji: '🔄', text: 'Sits played offline count once you are back online.' },
    ],
  },
  {
    version: '0.13.1',
    items: [{ emoji: '👇', text: 'Pull the player down with a finger to tuck it away.' }],
  },
  {
    version: '0.13.0',
    items: [
      {
        emoji: '✨',
        text: 'Plan with AI explains its thinking - why this order, and a few tips - kept with your plan.',
      },
      {
        emoji: '📚',
        text: 'Courses you finished or already planned are marked, so nothing gets studied twice by accident.',
      },
      { emoji: '🎨', text: 'A clearer, more beautiful main button across the app.' },
    ],
  },
  {
    version: '0.12.1',
    items: [
      { emoji: '📐', text: 'The plan editor fits the phone again, whatever the plan holds.' },
      { emoji: '🧭', text: 'More fits on one screen - no scrolling.' },
    ],
  },
  {
    version: '0.12.0',
    items: [
      {
        emoji: '🫧',
        text: 'Sheets rise smoothly and close with a swipe down - the handle stays put while the content scrolls.',
      },
      { emoji: '⚡', text: 'Pages open instantly, filling in as they load.' },
      { emoji: '✨', text: 'Gentle motion throughout - and still, if you prefer it still.' },
    ],
  },
  {
    version: '0.11.0',
    items: [
      {
        emoji: '📅',
        text: 'Moving a session can push the rest of the plan along with it.',
      },
      {
        emoji: '🧘',
        text: 'A calmer plan editor - every option tucked into a row until you need it.',
      },
    ],
  },
  {
    version: '0.10.0',
    items: [
      {
        emoji: '🪷',
        text: 'Each meditation shows how many times you have done it, with gentle milestones at 7, 21, 40 and 108.',
      },
      {
        emoji: '⏯️',
        text: 'Left a meditation by accident? For ten minutes you can resume right where you were.',
      },
    ],
  },
  {
    version: '0.9.1',
    items: [
      {
        emoji: '⏯️',
        text: 'Course videos keep their place on an iPhone, and every lesson picks up where you left it - from any play button.',
      },
    ],
  },
  {
    version: '0.9.0',
    items: [
      {
        emoji: '🪷',
        text: 'Friends: see how each other’s day is going, send a bow or a gentle nudge, and invite a friend to sit with the same recording.',
      },
      {
        emoji: '🔒',
        text: 'You choose what friends see - everything, just the numbers, or nothing.',
      },
      {
        emoji: '✉️',
        text: 'No open sign-up: admins invite people with a single-use link, and manage who is here.',
      },
      {
        emoji: '✨',
        text: 'Plan with AI can lay out a whole path - learn first, take turns, or side by side - as long as it takes.',
      },
    ],
  },
  {
    version: '0.8.0',
    items: [
      {
        emoji: '⏯️',
        text: 'Courses and talks continue from exactly where you stopped.',
      },
      { emoji: '↩️', text: 'Start over clears your place in an item when you want a fresh run.' },
      { emoji: '🏷️', text: 'Tap an item’s type label to change it.' },
      { emoji: '👆', text: 'One tap is enough on a phone, and the seek bar is easy to grab.' },
    ],
  },
  {
    version: '0.7.0',
    items: [
      {
        emoji: '🪷',
        text: 'Meditations inside a course are recognised by name and play as a practice. You can mark any lesson as a meditation, and the course stays a course.',
      },
      { emoji: '🎚️', text: 'Practice settings only show up when you are practising.' },
      {
        emoji: '✨',
        text: 'Plan with AI allows longer sessions, can choose the plan length for you, and builds on what you have already practised and learned.',
      },
      { emoji: '📱', text: 'A floating tab bar and pop-ups that sit clear of the screen edges.' },
    ],
  },
  {
    version: '0.6.4',
    items: [
      {
        emoji: '📚',
        text: 'Courses feel like studying: the player shows your progress through the lessons, says "Done for now" instead of ending a practice, and skips the reflection.',
      },
      { emoji: '✅', text: 'A lesson counts as done once you have watched almost all of it.' },
      {
        emoji: '🎬',
        text: 'Float works where your device allows it, and hides where it does not.',
      },
      {
        emoji: '🔄',
        text: 'The app updates itself to the newest version when you come back to it.',
      },
      { emoji: '🎨', text: 'Placeholder covers are quieter, with no title printed on them.' },
    ],
  },
  {
    version: '0.6.3',
    items: [
      {
        emoji: '📱',
        text: 'The app stays at your phone’s size - no more zooming in and sliding sideways.',
      },
      { emoji: '🧭', text: 'A shorter, roomier welcome tour.' },
    ],
  },
  {
    version: '0.6.2',
    items: [
      {
        emoji: '🧭',
        text: 'The welcome tour now shows courses and talks, feeling the breath, and planning with AI - replay it from Settings.',
      },
    ],
  },
  {
    version: '0.6.1',
    items: [
      { emoji: '🌬️', text: 'Sit is now Breathe.' },
      {
        emoji: '📳',
        text: 'Feel the breath: with the breath guide on, your phone gathers gentle taps as you breathe in and eases them as you breathe out. Vibration on Android; light taps on iPhone with iOS 18 or later.',
      },
      {
        emoji: '🎨',
        text: 'Items without a cover of their own get a painted one, in the style of the logo.',
      },
      {
        emoji: '📚',
        text: 'Numbered audio sessions stay meditations; only a name that says course makes audio a course.',
      },
    ],
  },
  {
    version: '0.6.0',
    items: [
      {
        emoji: '📚',
        text: 'Your library knows meditations from courses, talks and soundscapes - with tabs to browse each, and series shown as one thing with one progress.',
      },
      {
        emoji: '✏️',
        text: 'Guessed wrong? Tap "Not right?" on any item to change its type, for one item or a whole series. A rescan keeps your choice.',
      },
      {
        emoji: '🎬',
        text: 'Video courses and talks play in the player, with full screen and picture-in-picture. Lessons tick themselves done as you finish them.',
      },
      {
        emoji: '🗓️',
        text: 'Plans can be for practice or for learning. A learning plan walks through its courses in order and Today shows the next lesson.',
      },
      {
        emoji: '✨',
        text: 'Plan with AI: add your OpenAI key in Settings, tell it what you want and how much time you have, and it builds a practice and learning plan from your own library.',
      },
      {
        emoji: '📈',
        text: 'Practice stats count practice only; learning has its own minutes and lessons finished.',
      },
    ],
  },
  {
    version: '0.5.2',
    items: [
      {
        emoji: '🌬️',
        text: 'Sit, redesigned: a light halo of rings that breathes with you instead of the ball, and your options tucked into three small tiles until you want them.',
      },
      {
        emoji: '🎨',
        text: 'Icons on the bright buttons are dark and crisp now, everywhere - they had been coming out grey.',
      },
    ],
  },
  {
    version: '0.5.1',
    items: [
      {
        emoji: '🎧',
        text: 'The player fits every phone: the cover takes only the room left, so nothing overlaps the controls or the header.',
      },
    ],
  },
  {
    version: '0.5.0',
    items: [
      {
        emoji: '🎧',
        text: 'Begin opens a full-screen player: a progress bar you can drag, 15 seconds back and 30 forward, the track list, and quick chips for speed, bells and the end timer.',
      },
      {
        emoji: '🔽',
        text: 'Minimise it and it keeps playing in a small bar while you move around the app.',
      },
      {
        emoji: '☀️',
        text: 'The screen stays on while a meditation plays, and a Wi-Fi hiccup resumes from the same second instead of stopping.',
      },
      {
        emoji: '🗂️',
        text: 'Library → Folders shows everything that was scanned. Switch a folder off to leave it out.',
      },
      {
        emoji: '🖼️',
        text: 'Covers load soft and sharpen, and are sized for the screen - much lighter on a phone.',
      },
      {
        emoji: '📱',
        text: 'On a phone: a More tab reaches every page, nothing scrolls sideways, and the tab bar stays put.',
      },
      {
        emoji: '🧭',
        text: 'On a computer the sidebar has a new look and stays in place however far you scroll.',
      },
      {
        emoji: '✨',
        text: 'Redesigned practice settings, reflection moment and Settings page.',
      },
    ],
  },
  {
    version: '0.4.0',
    items: [
      {
        emoji: '🖼️',
        text: 'Covers now come out of the recordings themselves - an album with no image file beside it still gets its artwork.',
      },
      {
        emoji: '🎬',
        text: 'Recorded talks and livestreams saved as video (mp4, webm) are listed and play like any other track.',
      },
      {
        emoji: '🗂️',
        text: 'The welcome tour shows the folder layout the library reads best: a folder per creator, holding a folder or a file per meditation.',
      },
      { emoji: '📱', text: 'The bottom tab bar stays put while the page scrolls.' },
    ],
  },
  {
    version: '0.3.3',
    items: [
      {
        emoji: '📚',
        text: 'An artist who files their work under Meditations, Courses or Livestreams is read as one creator with many albums, not as many creators.',
      },
    ],
  },
  {
    version: '0.3.1',
    items: [
      { emoji: '📱', text: 'The app no longer scrolls sideways on a phone.' },
      {
        emoji: '✨',
        text: "A recording's page leads with the title and Begin; the player bar has room on a phone; the library's filters fit in one row.",
      },
      { emoji: '💜', text: 'Port, in the name, is one quiet violet.' },
    ],
  },
  {
    version: '0.3.0',
    items: [
      {
        emoji: '🗓️',
        text: 'Plans are cards now - the days, how the window is going, what is next, one tap to begin - and a new plan starts from a shape instead of a blank form.',
      },
      {
        emoji: '🫧',
        text: 'The sit breathes with you: one orb rises on the in-breath and falls on the out-breath, with the phase word inside it.',
      },
      {
        emoji: '🔎',
        text: 'Rescan works from the phone again, and says what it found.',
      },
    ],
  },
  {
    version: '0.2.0',
    items: [
      {
        emoji: '🌅',
        text: 'Today is the front door: a greeting, your daily ring, one suggestion, and a sit one tap away.',
      },
      {
        emoji: '👋',
        text: 'A welcome tour on first run sets your accent, target, sit length and bell as you go - replay it from Settings.',
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
        text: 'A read-only library indexed straight from your folders - nothing renamed, nothing moved.',
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
