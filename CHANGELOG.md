# Changelog

All notable changes to ZenPort are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and versions follow SemVer.

## [Unreleased]

## [0.8.0] — 2026-09-23

### Added

- **Courses and talks pick up where you stopped.** The main button reads *Continue at 12:34* (or *Continue · Lesson 3 at 12:34*) and resumes that exact place; a place in the opening seconds, in the last seconds, or on a lesson ticked done does not count. Talks and videos watched halfway now sit on the Library's Continue shelf too.
- **Start over.** An item with progress has a Start over button. After a confirmation it clears your place and the lessons ticked done, so the item begins from the top next time; practice history, stats and journal entries stay. `DELETE /api/items/:id/progress`.
- **The type label is its own dropdown.** On an item page the Meditation / Course / Talk / Soundscape pill carries a small caret; tap it and the other types open right beneath it to pick from, with *Let ZenPort decide* and *All in this series* where they apply. It replaces the "Not right?" link.

### Fixed

- **Taps needed a second try on a phone.** iOS treats the first tap on anything whose hover style reveals something as a hover, not a click - and every card revealed its favourite star on hover. All hover styles now apply only on devices with a real pointer (`@media (hover: hover)`), the star stays visible on touch screens, and a stylesheet test keeps hover rules inside that query.
- **The seek bar was hard to grab.** The native slider on iOS only moves when the touch lands on its small thumb, and playback re-rendering its value could drop a grab. Seek, volume and bell volume now use a touch-first slider: a taller strip that takes the touch anywhere, jumps to the finger, follows it, and seeks once on release.

## [0.7.0] — 2026-09-23

### Added

- **Meditations inside a course.** A track whose file name reads as a practice ("guided", "meditation", "breathwork", "body scan", Hebrew מדיטציה and so on, unless it also says lecture, Q&A or talk) is recognised as a meditation within its course. An admin can flip any track between Lesson and Meditation from the course page; the choice survives rescans and never changes the course itself. Those tracks play as a practice - Now practicing, bells, timer and the practice settings button - while the rest of the course stays a lesson.
- **Plan with AI goes longer.** Sessions of 1½ and 2 hours for practice and up to 10 hours a week of learning; the plan length can be left to the AI, which picks 1-52 weeks and says how long it chose.
- **The AI knows what you have already done.** Every library item is offered (up to 150 lessons per course, all practices), each with how many times you have played it, for how long and when last, plus a summary of your recent practice - so the plan builds on what you have finished instead of repeating it.

### Changed

- **The practice settings button only appears for practices.** Course and talk lessons no longer show it.
- **The phone tab bar floats** as its own lifted, rounded surface above the page instead of blending into the background.
- **Pop-up sheets float on a phone too**, inset from the screen edges and the home indicator, with rounded corners all round.

### Fixed

- **The Plan with AI steps could scroll sideways on a phone.** Plan length and start date sat side by side and the option rows could not wrap; they now stack, long option lists sit in even rows, and every sheet clips sideways overflow. Checked across every page and sheet in WebKit at iPhone SE, 13 and 15 Pro Max widths.

## [0.6.4] — 2026-09-23

### Changed

- **Courses and talks are studied, not practised.** The player says Now watching / Now studying, counts time "studied", ends with **Done for now**, shows a segment per lesson with how many are done, ticks finished lessons in the list, and no reflection prompt follows.
- **A lesson is done at 95%** of its length (or at its end), not only when it plays out; course, series, Library and Today pages refresh as lessons finish.
- **Painted placeholder covers are quieter** - less saturated under a soft veil - and carry no title, which the card already shows beneath.

### Fixed

- **Float did nothing on an iPhone.** The standard picture-in-picture call is refused in an installed app; Float now falls back to Safari's presentation mode, and if nothing floats it says so and stops offering the button on that device.
- **An installed app could run an old release for days.** iOS resumes a home-screen app from memory; the app now checks the server's version when it returns to the foreground and every half hour, reloading when nothing is playing and offering an Update bar when something is.

## [0.6.3] — 2026-09-23

### Fixed

- **The app zoomed and then slid sideways on an iPhone.** iOS zooms the whole page into any text field under 16px and stays zoomed, and nothing stopped pinch or double-tap zoom, so the page grew wider than the screen and panned - tab bar included. Fields are now 16px on touch screens, the viewport sets `maximum-scale=1, user-scalable=no`, `touch-action: pan-x pan-y` rules out pinch and double-tap zoom, and Safari's gesture events are cancelled. A stylesheet test keeps all of it in place.
- **The welcome tour card outgrew narrower phones.** Eight step dots and two buttons did not fit one line below 430pt, so the card pushed past the screen (checked in WebKit on iPhone SE, 13 and 15 Pro Max). The dots now take their own row on phones, and the card can never exceed the screen width.

### Changed

- The welcome tour says less - one short line and at most three short points per step - and the card sits 20pt from the screen edges on a phone.

## [0.6.2] — 2026-09-23

### Changed

- **The welcome tour covers the new headline features**, each with its own painted illustration: the library step introduces the four content types, video courses with self-ticking lessons and painted covers; Breathe introduces feeling the breath; and a new "Let AI plan it" step explains AI planning and lets you add your key on the spot (or shows it is already set).

### Fixed

- **Replaying the tour from Settings trapped it inside the page**, under the tab bar. The tour is now portalled to `<body>`, like every sheet.

## [0.6.1] — 2026-09-23

### Changed

- **Sit is now Breathe** - in the tab bar, sidebar, Today, the command palette and the welcome tour; `/breathe`, with `/timer` redirecting.
- **Painted fallback covers.** Items without artwork get one of sixteen covers painted in the logo's liquid-paint style (generated with the logo as the reference), picked by a hash of creator and title and mirrored on alternate hashes, loading soft-to-sharp like real covers. The drawn arcs remain as the fallback if an image fails.
- Numbered audio alone no longer reads as a course - in a meditation library it is a programme of sessions; audio is a course only when a name says so.

### Added

- **Feel the breath.** With the breath guide on, an optional haptic rhythm: taps that gather and lengthen through the in-breath and spread and soften through the out-breath, eased rather than linear. Android uses the Vibration API; iPhone has none, so iOS 18+ gets light taps through the native switch control's haptic. A Try it button plays one in-breath.

## [0.6.0] — 2026-09-23

### Added

- **Content types.** Every item is a meditation, course, talk or soundscape. The scanner guesses from names (nearest folder first, English and Hebrew) and then from the files (a run of episode-numbered videos is a course, a lone video a talk); `items.inferred_type` holds the guess with its reason, and the owner's correction lives apart in `item_types` so a rescan never undoes it (migration v6). Library tabs per type, type badges and video marks on cards, and a type pill with **Not right?** on every item page, for one item or its whole series.
- **Series.** Items sharing a creator and a collection show as one card with combined progress, and open a series page with the modules in order and a Continue button that goes to the first unfinished lesson.
- **Lessons and progress.** Tracks are marked done per account when they play to the end, or by hand (`track_completions`); courses show "3 of 12 lessons", pick up at the next lesson, and the Library has a Continue shelf.
- **Video.** Video tracks play in the full player - 16:9 stage, full screen, picture-in-picture - through a dedicated video element; audio keeps its own element, so a meditation still plays with the screen locked.
- **Plans with a focus.** A plan is for practice or for learning; learning plans follow courses and talks in order, and Today and Plans show the next lesson. Plans hold up to 400 ordered items.
- **Plan with AI.** An account can save its own OpenAI key (validated against OpenAI, stored AES-GCM-encrypted, never returned) and choose a model. A three-step sheet - intention, time, library - sends a compact catalogue of the library (types, titles, creators, series, lesson names, lengths, progress; short handles, never ids) and gets back an ordered practice track and learning track fitted to the time given, with a reason per item and a weekly outline. Unknown or wrong-kind items in the answer are dropped. Accepting creates one plan per track.
- **Learning stats.** Streaks and practice minutes count practice only; learning minutes, sessions and lessons finished are shown apart.

### Fixed

- A creator's own sorting folders (*Courses, Livestreams, Meditations…*) no longer become part of a series name, and a sorting folder of separate recordings gives one item per recording instead of one item named after the folder. Several series side by side (*Kindness Series, Focus Series*) stay under their creator instead of being read as creators. An item regrouped this way is retired quietly rather than reported missing.
- Section headings wrap their actions instead of pushing a phone page sideways.

## [0.5.2] — 2026-09-23

### Changed

- **Sit, redesigned.** The filled gradient orb is replaced by a halo: a hairline progress ring with a glowing bead at its head, and inside it three thin gradient rings over a faint glow - strokes, not fills, so the colours stay light. With the breath guide on, the rings swell outward one after another on the in-breath and settle on the out-breath (a staggered ripple); without it they drift slowly. The time is set in the light serif. Length, bells and the breath guide collapse into three summary tiles that each open a sheet, leaving one Begin button on screen; a live sit centres the halo with End early and a round pause control.

### Fixed

- **Icons on accent-filled controls were grey.** Every icon carries `nav-ic`, and a global rule painted it the navigation's faint grey, overriding the dark on-accent ink on primary buttons, the player's play button, the mini-player, segmented choices and more. The faint colour now applies only inside the sidebar and the tab bar; elsewhere an icon takes its control's colour. Audited every solid accent fill on eight pages under all four accents: 109 icons and labels, none under 4.5:1.
- **Sheets opened from a page could sit mid-screen.** A page's entrance animation made it the containing block for `position: fixed` descendants; sheets are now portalled to `<body>`.

## [0.5.1] — 2026-09-23

### Fixed

- **The full player overlapped itself on an iPhone.** It was sized `100dvh`, which in an installed iOS app is shorter than the screen, and its cover was sized from the viewport too, so on a tall phone the content spilled over its own header and footer and left a dead band beneath. The player now takes its height from `inset: 0` alone; the controls keep their natural height and the cover is a container-query square that fills only what remains (`min(100cqw, 100cqh)`), shrinking on short phones and hiding in landscape. Checked for overlaps at twelve sizes from 320×568 to 1440×900, and a stylesheet test keeps viewport units off the player's height.

## [0.5.0] — 2026-09-23

### Added

- **Full-screen player.** Begin opens it: the cover over a blurred wash of itself, a scrubber that previews while dragged and seeks once on release, elapsed and remaining time, 15 s back / 30 s forward, previous/next and a track list, and a row of chips for speed, interval bell, end timer and tracks. The page behind is locked (body pinned with `position: fixed` at its offset, nested locks counted), so nothing scrolls, no scrollbar shows and the player cannot be dragged off. It fits the viewport at every height, and lays the cover beside the controls on a desk or tablet.
- **Mini-player.** Minimising leaves a floating card above the tab bar (measured from the tab bar's real height, home indicator included) or along the bottom on a desk, with a progress hairline; it survives navigation and reopens the full player.
- **A practice is never cut off by the phone.** A screen wake lock is held automatically while audio plays (a setting, on by default) and re-acquired when the page returns; a stream that errors or stalls while playing is reloaded and resumed at the last good second with backoff; the lock screen gets a position bar and seek-to.
- **Library folders** (`/library/folders`, also under More): the folder tree from the last scan with an audio count and a switch per folder. Excluded folders (`excluded_folders`, migration v5) are dropped before inference and flagged `items.excluded`, so they leave the shelves without being reported as missing, and return with the same ids. Admin only; members can look.
- **Progressive, right-sized covers.** Covers are resized to 32/320/640/1024 px WebP with `sharp`, cached under `$ZP_DATA_DIR/thumbs` and regenerated when the source changes. Pages show the 32 px version blurred under a sheen, then resolve the sized cover from soft to sharp.
- **More tab** on the phone: Today, Library, Sit, Plans, More - the More sheet reaches Journal, Practice, Folders, Sources, Integrations, Settings and search.

### Changed

- Practice settings redesigned: illustrated sections with segmented choices, a bell preview, and a keep-screen-on switch in place of the unexplained moon button.
- The reflection moment: a painted opening line with how long you sat, "how settled" as five water lines from choppy to flat, prompt starters, and title/tags/voice tucked behind "Add more".
- Settings grouped into Look and feel, Practice, and Sound and playback, with switch rows for every on/off option.
- The desktop sidebar is a floating glass panel: search under the logo, links in Practice / Reflect / Manage groups (Folders included), an accent tile and edge bar for the current page, and the version in a footer.
- The wordmark is set in a bundled variable serif so "Port" can be properly light beside a bold "Zen".
- Sit: the resting orb holds its readout, and the readout reads over the glow.

### Fixed

- **Pages scrolled sideways.** Grid columns are `minmax(0, 1fr)` throughout, user-named titles wrap anywhere, and `html`/`body` carry an overflow guard that does not affect fixed or sticky elements.
- **The desktop sidebar scrolled out of the window.** The same aurora-layering rule that once un-fixed the tab bar gave the sidebar `position: relative` over its `position: sticky`; the rule now touches only the main column, and a stylesheet test fails the build if anything overrides the sidebar's or the tab bar's position again, or brings back an unshrinkable grid column.
- **The tab bar moved with the page on iOS.** Page-level overscroll bounce is off, so the fixed bar never rubber-bands.

## [0.4.1] — 2026-09-23

### Changed

- Every example creator, album and track name in the tests, fixtures, docs and the welcome tour is now invented. None refer to real teachers, publishers or recordings.

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
