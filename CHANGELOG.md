# Changelog

All notable changes to ZenPort are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and versions follow SemVer.

## [Unreleased]

## [0.4.0] — 2026-09-23

### Added

- **Covers from inside the files.** Most purchased recordings carry their artwork in the audio's own tags and have no image beside them; on the first real library that meant 4 covers across 104 albums. The scanner now reads the picture out of an ID3v2 `APIC` frame (v2.2/2.3/2.4, unsynchronisation and extended headers included) or a FLAC `PICTURE` block, caches it once under `$ZP_DATA_DIR/covers`, and serves it through the existing asset route under a pseudo-root (`root_id = -1`). Only the tag region is read, and a cached cover costs one stat on later scans. An image file in the folder still wins.
- **Video containers play.** `mp4`, `m4v` and `webm` join the track extensions, so a talk or livestream saved as video is listed and plays through the audio element like any other track.
- **The welcome tour shows the layout the library reads best** - a folder per creator (or pack, such as The Lantern Sessions), holding a folder or a plain audio file per meditation - with three painted scenes that crossfade one level deeper each, an annotated tree, and a note that other layouts are still scanned. The library empty state carries the one-line version.

### Fixed

- **The bottom tab bar scrolled away with the page.** The aurora layering added in 0.3.1 gave every shell child `position: relative` to lift it above the fixed backdrop - including the tab bar, whose `position: fixed` it overrode. The tab bar is out of that rule. The `overflow-x: clip` guard on `html`/`body` from the same release is gone too; the clipped aurora box is what actually stopped the sideways scroll.
- "Port" in the wordmark is white like "Zen".

## [0.3.3] — 2026-09-23

### Fixed

- **A creator who sorts their own work is a creator, not a category.** "Mira Solen/{Meditations, Courses, Livestreams}/…" has exactly the shape of a category above creators ("Sleep/{Orin Vale, Stillwater Collective}/…"), and was read as one - so each album became its own creator, or "Unknown creator". A child named like a creator's own sub-folder (Meditations, Courses, Livestreams, Talks, Albums, …) now settles it the other way, and a generic wrapper collapses wherever it sits in the path, not only when it leads. "ST - 1. Introduction / ST - 2. Meditation" - an ordinal after a shared prefix - now reads as one ordered track set rather than two separate recordings.

## [0.3.2] — 2026-09-23

### Changed

- The "practice companion" tagline is gone from every lockup, and the wordmark sits on the mark's optical centre.

## [0.3.1] — 2026-09-23

### Fixed

- **The whole app scrolled sideways on a phone.** The ambient aurora is a fixed layer that drifts with a `scale(1.06)` transform, and iOS Safari counts a transformed fixed element that is wider than the viewport toward the page's scroll width. The layer now drifts inside a viewport-sized box that clips it, and `html`/`body` carry `overflow-x: clip` (clip, not hidden - hidden would make the body a scroll container and break the sticky sidebar).

### Changed

- **Port** in the wordmark is one quiet violet (`#b795ff`, 7.5:1 on the ground) instead of the sweep, everywhere the lockup appears.
- **A recording's page leads with the recording.** Creator as an eyebrow, the title large, the facts on one line, Begin as the one big button; the provenance (source, folder, formats, "why ZenPort read it this way") folds into "About this recording" under the tracks. On a phone the cover is a centred 220px, not a full-width slab above everything.
- **The player bar has room on a phone**: cover, title and play on one row, the slider on its own row underneath, and the secondary controls (previous/next, bells) yield to focus mode, where they already live.
- **Library filters** are pill-shaped and, on a phone, scroll in one row beside the search instead of stacking three native selects.
- Empty states are surfaces with a soft accent glow, not dashed boxes; cards carry a hint of light on their top edge and a shadow; primary buttons glow; pages settle in with a 260ms rise (off under calm motion); the active phone tab wears a small pill.

## [0.3.0] — 2026-09-23

### Added

- **Plans, redesigned.** Active plans are cards with their shape on them - weekday pips, how the current window is going as a ring, what is next, the recordings attached, and one tap to begin. The three-week timeline is grouped by week, each occurrence carries a state pill (Today / Done / Missed / Skipped / Upcoming) and the one action that state calls for, with "Done anyway" on a missed day. The plan form starts from a shape (every day, weekday mornings, three a week, weekend sits), picks days on a proper day picker with Weekdays/Weekends presets, length as chips, target as chips, shows a live "3× a week for 6 weeks · 18 sits" preview, and chooses recordings from a searchable picker with covers instead of a Ctrl-click multi-select. Moving a day offers Tomorrow / In 2 days / Next week before the date field.
- **The sit breathes.** With the breath guide on, one orb rises over the 4-second in-breath, holds, and falls over the 6-second out-breath - a CSS transform steered by the phase, so the movement is smooth on any device. The phase word is the hero inside the orb; the remaining time sits beneath the ring. Without the guide, the orb swells slowly. The painted orb behind the ring is gone.

### Fixed

- **Rescan did nothing on the phone.** A body-less POST arrived with a content-type the server had no parser for and was refused with 415 before the route ran; the Library page swallowed the error and simply reloaded. Every mutation now carries a JSON body, the server accepts an empty body whatever its declared type, and the Library says what a rescan found - including "0 recordings" for an empty folder.

## [0.2.2] — 2026-09-23

### Changed

- Every em dash in the interface and API messages is a plain hyphen.

## [0.2.1] — 2026-09-23

### Fixed

- The logo in the sign-in and setup cards sat 12px below the wordmark: the card's bottom spacing was on the wordmark, which made it a taller flex item than its text. The spacing is on the lockup now. The old text-only wordmark rules, dead since the logo landed, are removed.

## [0.2.0] — 2026-09-23

### Added
- **Brand**: the ZenPort logo (`logo.png`, the painted ring of amber → rose → violet pigment) across the app, with the PWA, apple-touch and favicon slots cut from that one file by `npm run icons`. Wordmark sets **Zen** in the display serif's bold weight and *Port* in the logo's own gradient.
- **Onboarding**: six-step first-run welcome (welcome → library → sit → rhythm → feel → ready) with illustrations drawn from the mark's vocabulary. Every control writes through to the real preference as you go, so the tour *is* the setup. Skippable from any step; replayable from Settings.
- **Today page**, now the default landing page: greeting, daily-target ring with streak, one non-random suggestion, and one-tap routes into a sit, the library or the journal.
- **Unguided timer** (`/timer`): presets to 60 minutes, optional interval bells, optional breath guide, wake lock, and a real practice session recorded under the reserved `zenport:timer` id (rendered as "Unguided sit", never as a removed item).
- **Preferences** (`user_prefs`, migration v3): accent, landing page, daily target, default sit length, interval bell, bell on/off + volume, autoplay, calm motion, ambient background. Server-held so they follow the account to the phone.
- **Favourites** (migration v3): star from any card, filter the library, and a Today shelf. Rows deliberately carry no FK to `items` so a favourite survives an unmounted library.
- **Command palette** (⌘K / Ctrl-K) over meditations, pages and preferences.
- **What's new** dialog, shown once per release to accounts that were here before it (`user_prefs.seen_version`, migration v4), with older releases behind a toggle; the version at the foot of the sidebar and in Settings reopens it, next to a link to the repository.
- **iOS home screen**: the icon is cut from the logo at the same proportion as the sibling apps, the app paints under the status bar and the home indicator, and the layout steps in by the safe areas.
- Illustrated onboarding, empty states and ambient backdrops (generated art, shipped as WebP).
- **Generated cover art** for recordings without embedded artwork — deterministic abstract pieces seeded from the title.
- Accent system: four choices derived from the logo sweep, with separate text and fill tokens so every pairing clears WCAG AA on the app ground.

### Changed
- Library is no longer the landing page and no longer repeats Today's "planned" and "pick up again" sections; it is now purely for browsing.
- Settings gained a Preferences section mirroring the onboarding controls.
- Nav, chips, badges, player controls, stat bars and mood pickers all follow the chosen accent instead of the fixed copper.

### Removed
- `hueIndex` and the flat typographic cover fallback, superseded by generated cover art.

## [0.1.0] — 2026-09-22

Initial public release.

### Added
- npm-workspaces TypeScript monorepo (`shared`, `server`, `web`); Fastify + `node:sqlite` server; React + Vite PWA frontend; single production port.
- Deterministic read-only library scanner with explainable hierarchy inference, natural ordering, symlink containment, junk/unsupported skipping, idempotent rescans, and missing-file honesty.
- Library UI: search/filter/sort, creators with cover mosaics, typographic cover fallbacks, empty/loading/error states.
- Meditation detail: tracks, safe document readers (text/Markdown in-app, PDF inline, HTML sandboxed), related items, inference evidence, resume.
- Meditation player: multi-track, resume checkpoints, settling lead-in, synthesized interval bells, end timer with fade, focus mode, wake-lock toggle with fallback, Media Session, byte-range streaming from opaque IDs.
- Durable practice sessions with anti-double-counting heartbeats, history with corrections, and statistics (streaks with a documented timezone day rule, trends, mixes, own-previous-period comparison) computed only from real sessions.
- Planning: cadence plans with intention/dates/target, timeline with complete/skip/reschedule/pause/end.
- Journaling: post-practice reflection sheet, mood/tags, voice notes via MediaRecorder, optional self-hosted Whisper-compatible transcription (off by default), Markdown export.
- YouTube sources: URL classification, oEmbed metadata with manual fallback, optional `yt-dlp` metadata-only playlist/channel import with preview + confirm, dedupe, provenance, consent-gated privacy-enhanced embeds.
- Integrations surface with honest **Coming Soon** cards for UBAL and MeTube (mounted-folder contract, not implemented).
- Security baseline: first-run admin setup, scrypt, session cookies, CSRF, rate limiting, opaque media routes with root containment, per-user privacy, no telemetry.
- Docker/Compose self-hosting with non-root runtime and read-only mounts; sample fixture library; docs; CI; browser QA harness.
