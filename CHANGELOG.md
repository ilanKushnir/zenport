# Changelog

All notable changes to ZenPort are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and versions follow SemVer.

## [Unreleased]

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
