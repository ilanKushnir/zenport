# Changelog

All notable changes to ZenPort are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and versions follow SemVer.

## [Unreleased]

## [0.16.1] — 2026-09-24

### Added

- **Done, or not, from anywhere in a course.** The player shows a tick beside the lesson progress: *Mark as watched* for a video, *Mark as practised* for a meditation inside a course, *Mark as done* otherwise. Tap it to tick the lesson done, and tap it again to take it back. The player's Lessons list has the same circle beside every lesson, while tapping a lesson's name still plays it. The course page uses the same control, and a change in either place shows up in the other at once.
- Unticking a lesson by hand sticks. Playing on past 95% no longer quietly ticks it again, though playing it right to the end still counts.

### Changed

- **"Done for now" is now "End session".** It always meant "stop here and keep my place", never "this lesson is done", and next to the new ticks the old wording read as the wrong thing.
- The phone's page lock no longer pins the page in place, so the tab bar no longer jumps a few pixels as More or any other sheet opens and closes.
- **The top bar fades in.** Its frosting now comes in gradually over the first stretch of scrolling instead of switching on at once.
- **Every ZenPort logo lines up.** The name sits on the ring's centre in the top bar, sidebar, sign-in and onboarding. It was measured off by 1-3px, the mark sitting low. The top bar and onboarding now share the one lockup.
- The mini player has the tab bar's 24px corners and the same edges, with its cover's curve following them in.
- Tablets: the tab bar and mini player sit centred at a comfortable width instead of stretching edge to edge.
- Admin's library scan card puts Rescan at the end of its row. Search lists every admin area (People, Library folders, YouTube sources, Integrations). Settings' Offline and About cards line up with the groups above them, and About shows the version once.

## [0.15.0] — 2026-09-24

### Added

- **A top bar on the phone.** The ZenPort name stays in place instead of scrolling away with long pages: the bar sits see-through over the top of a page and turns frosted, with a hairline, once content moves beneath it (so nothing hides behind the clock). On the right, Settings - and, for admins only, Admin.
- **Admin.** Everything that shapes ZenPort for everyone now lives in one place, seen only by admins: an overview (people, open invitations, recordings), then People (invitations, roles, password resets), Library folders, YouTube sources, Integrations, and the library scan with its roots, notes and a Rescan button. Each page carries an *Admin /* trail back. The old addresses (/people, /sources, /library/folders, /integrations) lead to their new homes; anyone else opening Admin is told politely that it is for admins.

### Changed

- **More is for practice.** Friends, Journal, Practice and Downloads - Settings moved to the top bar, and the admin pages into Admin. Folders and Integrations are admin-only now: everyone else simply uses the app and its library.
- Settings no longer carries the People link or the library scan - both are in Admin.
- On a desktop the sidebar reads Practice · Reflect · You, with Downloads, Admin (admins) and Settings under You.

## [0.14.2] — 2026-09-24

### Changed

- **One button shape across the app.** Every button takes its corners from three shared sizes - large 16px, regular 13px, small 11px - the shape of *Save changes*. Breathe's *Begin* is now that button exactly (the same fill, height, weight, top highlight and glow) instead of a pill; *End practice* / *Done for now* and the sit's *End* are outlined buttons with matching corners and readable text; small actions follow. Chips and tags stay pills - they are a different kind of control.
- **Pages that fit do not scroll.** A phone page kept 96px of empty room below its content for the mini player whether it was showing or not, so pages that fitted - Friends with nobody yet, Folders - still scrolled. The room is now only the tab bar's, plus the mini player's while it is up. Breathe's circle shrinks on a short screen so *Begin* stays in view without scrolling. Checked on every page at 844 and 664pt tall.
- In the installed app, content scrolled up no longer sits behind the clock and battery - the status bar area gets the same quiet fade as the tab bar.

## [0.14.1] — 2026-09-24

### Changed

- **Nothing shows through under the phone's tab bar.** The strip between the floating bar and the bottom of the screen is now the app's own dark background up to the middle of the bar, and above it content dissolves on a soft eased fade as it scrolls into the bar's zone, instead of passing visibly underneath.

## [0.14.0] — 2026-09-24

### Added

- **Meditations offline.** A meditation's page has *Download* with its size; while it downloads, a ring fills with the bytes (tap to cancel); then it reads *On this device*, and a tap offers to remove it. Downloads stream straight into the browser's storage on the device - never held in memory - and a download that stops leaves nothing half-saved. Courses and talks are not offered: they can run to gigabytes.
- **They play with no connection, and seek.** The service worker serves a downloaded meditation from the device first - online too, so it never downloads twice - and answers the audio player's byte ranges itself, so scrubbing works offline.
- **Downloads page** (from the Library, Settings, search, and the offline banner): everything on this device with its size, the total, the space still free for ZenPort, play from the list, remove one or all. Cards in the library carry a small mark when a meditation is on the device; downloads the browser cleared by itself are noticed and forgotten.
- **The app opens offline** as the last person signed in on the device, with their preferences, and a banner says so and points at what still plays. The app's artwork and icons are kept too, so it looks whole.
- **Sits played offline still count.** They are recorded on the device - tied to the account that played them - and sent up when the connection returns; the server checks each one makes sense and never counts one twice. Streaks, times practised and stats stay true.

## [0.13.1] — 2026-09-24

### Added

- **Pull the player down to minimise it.** The full-screen player follows the finger from anywhere but the seek bar and the volume sliders - rounding its corners and easing back a touch as it goes - and slides into the mini player once pulled past a sixth of the screen or flicked; a short pull springs back. A grab handle at the top says it can be done. The player also rises from the bottom when it opens, the way it leaves.

### Changed

- *Keep the screen on* is the first thing in Practice settings.

## [0.13.0] — 2026-09-24

### Added

- **Why this plan.** Plan with AI now explains itself: the reasoning behind the order and the foundations it chose (and, where it knows the teacher's work, the path students usually take), plus a few practical tips. It is shown before you accept, kept with the plans as a read-only *Why this plan* card in the plan editor (summary first, reasoning and tips a tap away), and on the Plans page as *Why this path*. Your own notes stay yours and editable; plans the planner made before now had its summary in their notes - it moves into the new card.
- **Done and already-planned courses are marked.** In the plan editor's picker every course or talk says *Done*, *3/9 done* or *In <plan>*; what is new to you sorts first, and for a new study plan the done and already-planned ones are hidden until you ask - one tap shows them for a deliberate repeat.
- **Plan with AI does not plan a course twice.** It is told what your current plans already hold and leaves those courses out, unless you switch on *Include courses already in my plans*; the server enforces it too.

### Changed

- **A new primary button, everywhere.** The deep sweep of the mark - flame into rose into orchid - with white semibold text that reads clearly, corners that match the cards around it, a faint top highlight and a soft coloured glow. Every filled accent surface follows (badges, the play button, selected segments, step numbers). Amber keeps a light fill with dark text; rose and violet get deeper fills with white.
- A plan card shows the week as its day circles alone - the repeated day names are gone.

### Fixed

- Plan cards inside an AI path ran past the edge of the narrowest phones (320pt); on a phone they now take the width they have.
- **Hairlines of the opposite colour along gradient edges.** The gradient was painted from the padding edge and tiled into the 1px border, leaving a pink line on the yellow end and a yellow line on the pink one. Every gradient fill now paints from the border edge.

## [0.12.1] — 2026-09-24

### Fixed

- **The plan editor ran off the side of the phone.** Its list of rows was a grid with no stated column, so the single implicit column grew as wide as the longest unbreakable line - a plan's notes (the AI planner writes a paragraph) made every row, chip and field thousands of pixels wide and unreachable. Every stacking grid in the app now declares a column that can shrink, and a stylesheet test requires it. Checked with a long-notes plan at 320 and 390pt, every row open.
- **Tapping a plan's intention zoomed the page on an iPhone** (it was forced to 15px, under the 16px iOS zooms into). Nothing may force text below 16px over the field rule any more, and a test checks it; the invitation link field is fixed the same way.

### Changed

- A plan's name and intention wrap onto more lines instead of being cut off; row values are shorter (*22 weeks · to 22 Feb*, *2* beside the chosen covers).
- On a phone, choosing a plan's recordings is a list - small cover, whole title, the tick or order number - rather than a scroll box of cut-off tiles inside the sheet.
- **More fits on one screen.** The same tiles, a little more compact, with one line under each name; the version row lives in Settings. On a short screen the one-liners step aside rather than scroll.

## [0.12.0] — 2026-09-24

### Changed

- **Sheets behave like native ones.** The header - grab handle, title, close - stays still and only the content scrolls, so pulling at the top no longer bounces the handle away from its card. Drag the header down, or pull the content down while it is at its top, and the sheet follows the finger; let go far enough or quickly enough and it slides away, otherwise it springs back. Sheets rise from the bottom on a spring and slide away on close (a soft pop on a desktop). Opening one on a phone no longer throws the keyboard up.
- **Pages open at once.** Everything already seen shows immediately and refreshes quietly underneath; the first visit to a page draws its heading straight away with soft placeholders where content will land, instead of a bare block.
- **Quiet motion throughout.** Pages settle in with their sections in a short cascade, cards drift in one after another, buttons, cards, chips and rows answer a touch with a slight press, the tab you land on lifts its icon, and lists settle in rather than blink. All of it steps aside for *Still everything* in Settings and for the system's reduced-motion setting.

## [0.11.0] — 2026-09-24

### Added

- **Move a session, or push the rest of the plan with it.** Moving a planned sit or lesson to a later day now asks: *just this one*, or *push the rest too* - this and every later session slide by the same number of days, and the sheet says when the plan will then end. Earlier sessions and history never move. (Moving earlier is always a single move.)

### Changed

- **The plan editor is calm again.** Practice or learning, then the name and intention as a title, a one-line summary of the rhythm, and one grouped list - Days, Starts, Length, Each sit, Time, Recordings, Notes - each showing its value and opening its choices only when tapped, one at a time. Quick picks sit beside the exact controls (Today · Tomorrow · Next Monday, Morning · Midday · Evening, 2 weeks … 3 months). Save is one full-width button; Pause, End and Delete move to a quiet list below, and Delete asks first.

### Fixed

- **Date and time fields overflowed their column on an iPhone** - the start date ran into the length options and the time into the notes. iOS draws these as native controls with a fixed width; they now size like any other field everywhere in the app, and a stylesheet test keeps it that way.

## [0.10.0] — 2026-09-24

### Added

- **How many times you have done each meditation.** A time is a session that covered at least half of its length (or, with the length unknown, one completed after a minute). The item page shows the count inside a thin ring that fills toward the next milestone - 7, 21, 40, 108, then every further 108 - with when you last practised it; cards carry a small count on the cover; and the reflection after a sit says which time that was, with one warm line at a milestone.

### Changed

- **A meditation's place is kept for ten minutes, for an accidental exit.** Within that window the item page offers *Resume at 12:34* first and *Begin again* beside it; after it the place is ignored and cleared, and the meditation begins at the top. Course and talk progress is kept indefinitely, as before - on the server, so every device picks up in the same place.
- *Start over* now appears on courses and talks only; a meditation's place clears itself.

## [0.9.1] — 2026-09-23

### Fixed

- **Course videos lost their place on an iPhone.** Resuming set the start time the instant a new video was loaded; iOS Safari ignores that until the video knows its length, so the lesson began at 0:00 - and the next autosave replaced the real place with a second or two. The player now seeks once the metadata arrives, and saves nothing (and marks nothing done) until that seek has landed. The dropout-recovery reload uses the same path.
- **Starting a lesson from its play button, the player's lesson list, Next or Previous began at 0:00.** In courses and talks every lesson now picks up its own saved place (meditations still begin at the top, with Resume beside them).
- **Continue could miss a half-watched lesson** when a different lesson had been finished more recently; it now resumes the most recent unfinished lesson with a place worth returning to.

## [0.9.0] — 2026-09-23

### Added

- **Invitations instead of sign-up.** Admins invite people from the new **People** page: a single-use link (shown once, stored only as a hash) that expires after a day, a week or a month, can be revoked, makes the newcomer a member or an admin, and can make you friends the moment they join. The link opens a welcome page to pick a name, username and password, then the tour.
- **People management.** Everyone on the instance with when they joined and were last active; make someone an admin or a member (there is always at least one admin), send a password-reset link (single-use, two days, signs them out everywhere), or remove an account.
- **Roles, enforced.** Members practise, study, plan, journal and make friends. Rescans, folders, item types, track roles, YouTube sources, sharing the AI key and managing people are admin-only on the server, and the controls are hidden for members.
- **Friends.** Send and accept friend requests. The Friends page shows everyone's day as a ring (practised today, sitting right now, not yet), streaks, the days in a row you have *both* practised, a week of minutes, the course they are studying, and a feed of recent sits to bow to. A friend's own page adds five weeks of practice and their longest streak. Send a gentle nudge (once a day), or invite a friend to sit with a particular recording from its page - it lands on their Today page with a button to open it.
- **You decide what friends see:** everything, just the numbers (minutes, streaks and days, never titles), or nothing. Set it in Settings → You or in the tour.
- **Settings → You**: a name and an emoji avatar for friends to see, sharing, and changing your password (other devices are signed out).
- **Plan with AI builds a path.** Choose how learning and practice fit together - side by side, learn first (courses one by one from the basics up, then a routine that climbs the levels), take turns, or let the AI choose - and a length of *Until done* to lay out the whole path. The plan comes back as dated stages, each saved as its own plan and shown together on the Plans page as a path with a stepper. Meditations inside a course are done as the course reaches them.
- **Share your AI key.** The owner can let everyone here plan with AI without a key of their own; nobody sees the key.
- The welcome tour has a new step, *Practise together*, with new art.

### Changed

- The phone tab bar sits lower, just above the home indicator; floating sheets follow.

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
