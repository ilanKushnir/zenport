# Changelog

All notable changes to ZenPort are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and versions follow SemVer.

## [Unreleased]

## [0.38.3] — 2026-09-25

### Changed

- **Order is simply right, never labelled.** The "In order" / "Any order" line on a recording's and a series' page is gone; a series now reads "Meditation pack". So is its admin menu, the "those meant in order first" note on Packs, and "In order" under Your next step (that now says how many parts). What stays is the ordering itself. Parts are sorted as the library is read (Day 1 before Day 2, an introduction first), you can still reorder them by hand, and Begin and Continue go to the next part.

## [0.38.2] — 2026-09-25

### Changed

- **No more "In order" tag on rows, cards or the Type filter.** Every row in Packs is a pack, and the tag needed explaining. Whether a pack's parts are meant one after another still shows where it helps: on the pack's own page, where Begin and Continue go to the next part.

### Fixed

- The floating section name read "Packs17": it took the heading's count along with its name. It now shows just the name.

## [0.38.1] — 2026-09-25

### Changed

- **The Library reads like a creator's page:** Packs, Meditations, Courses, Talks and videos, Soundscapes, across every creator. Before, it was a "Series" and a "Single items" list. Both pages build these sections from the same code (`components/Sections.tsx`), so they stay alike.
- **Every section heading has an icon and a count, and folds.** That includes Packs, a creator's shelves, and the Library's Continue and Creators. "Collapse" folds every section of the list at once. The Library and each creator's page remember what you folded.

## [0.38.0] — 2026-09-25

### Fixed

- **Documents open and download again, and recordings play.** The first library chosen in the app was stored under the same internal id (-1) as the covers read out of the audio files, so the server looked for that library's files in the cover cache. PDFs showed a blank page, and "download it instead" returned an error as JSON. The covers now have their own id, and existing cover entries are moved over (migration v30). A test covers a library with that id.
- A pack in one folder (UNLOCKED's 12 sessions) now reads like any pack, "12 parts · 8 hr 57 min", not "Meditation · 12 tracks". Rows no longer show a puzzle icon: a pack meant in order says **In order** in words, and the rest are simply in Packs.

### Changed

- **Search everything, from a button in the top bar** (or ⌘K). Results cover recordings, series and packs, creators, kinds and favourites, pages, each setting (opening it at its place in Settings), and quick actions. Every word typed must match, in any order: "joe advanced" finds the Advanced Workshop series. On a phone it opens as a sheet at the top with Cancel. The Library's own search box is gone.
- **One filter bar for the Library and every creator's page**, the same component in both places: Type, Level, Sort and (in the Library) Filters for creator, library, format, favourites and notes, each a small dropdown showing its current choice. Clear appears when anything is set, followed by the grid/list switch. The Library's big type tabs are part of it now. Sorting is the same everywhere: suggested order, title, recently added, longest, level.
- **Sections fold.** Tap a section's heading on a creator's page to fold it (its count stays); "Collapse" folds them all. Each creator's page remembers what you folded.

## [0.37.0] — 2026-09-25

### Changed

- **The library keeps itself organized.** Messy libraries are the point: ZenPort reads, indexes, enhances and organizes them, and keeps doing so as recordings arrive.
  - **File names are tidied as they are read.** "day 27 640x360-video" becomes "Day 27", and bare upload numbers ("audio-2248") become sessions in their order. There is nothing to approve, and a name you set yourself always wins.
  - **New recordings are enhanced on their own.** After a scan that brings new recordings, the admin's AI gives them a level, finds a picture for any new creator and writes a few descriptions. It does only that: never the whole library again, and not during the welcome or while another run is going. Enhance the library → **Keep it organized** switches it off. Suggested fixes still wait for you.
- **Calmer lists.** A row no longer repeats what its section already says (its type) or shows a video icon. It shows the level, the length, a small mark for packs, and the heart.
- **Review the library has one list: Needs a look.** It holds what ZenPort was unsure of, what your AI suggests and sets that may belong together, and reads "All in order" when empty. The separate "Worth a look", "AI suggests" and "Belong together" views are gone.

### Verified

- **Moving folders within a library keeps everything.** A new test moves a recording's folder elsewhere under the same root and checks it keeps its id, its title and series corrections, its favourite and its finished parts.

## [0.36.0] — 2026-09-25

### Changed

- **One word, and one rule: packs.** "Programme", "pack" and "collection" were three names for two ideas, decided two ways (by the names, and by the AI) that often disagreed. The same kind of recording could show as either.
  - **The word:** anything made of several meditations is now a **pack**. A pack meant as a path, a step at a time, carries an **In order** tag, and "Your next step" follows those. Every other pack is for choosing from.
  - **The rule:** only the names decide, so like always reads like. A pack is in order when its parts name steps: Day 3, Week 2, Session 1, Lesson 4, Part 1 Day 3, Wave III, Exploring #4, or a run of raw consecutively numbered files. Catalogue numbers and volumes ("Energy Circles 01…11", "Vol. 1…5"), track numbers and different meditations (morning and evening) are any order.
  - **One meditation:** an introduction and a meditation, or one meditation in versions, is one meditation, with no pack badge at all.
  - **The AI no longer judges this.** Its earlier guesses are cleared, which also makes the levels requests smaller. You can still set In order or Any order on any pack's page.
- On a creator's page, the separate "Programmes" and "Packs and collections" sections are now one **Packs** section, those meant in order first. The count reads "14 packs".
- **Filter a creator's page by type:** All, Packs, In order, Meditations, Courses, Talks, Soundscapes. It shows only the types that creator has, each with its count, and combines with the level filter.
- **Your filing decides a recording's type first.** A folder named for a kind (Courses, Meditations, Livestreams, Talks, or numbered like "2. Courses") now wins over words in a recording's own name. "Livestream Extract" recordings filed under Meditations are meditations.
- **Sets sharing a lead name become one series, like numbered sets:** "Generating Change", "Generating Flow", "Generating Joy" (three or more, with a lead that says something). If a set ZenPort made is not one series, an admin can take it apart from the series' page, and it is not made again.
- **Where you are on a long page:** once a section's heading scrolls away, its name floats in a small pill under the top bar. It changes as you pass each section, and tapping it goes back to the section's start.

### Added

- **Favourite a whole series** from its card, row or page. Favourite series appear with your favourites on Today and in the Library.

### Fixed

- A course of several modules in the list view showed the in-order sprout. It now shows the course's own icon, as on its card.

## [0.35.2] — 2026-09-25

### Fixed

- **A course of several modules sits with the courses on a creator's page, not among the programmes.** Single recordings went under Programmes or Packs only if they were practice. A series went there by its order alone, so a course of weekly modules (read as "in order") landed under Programmes and counted as one. Series of courses or talks now sit with their kind (Courses, Talks and videos), ahead of the single ones. Programmes and Packs hold practice only.

## [0.35.1] — 2026-09-24

### Changed

- **Numbered sets become one series on their own.** "Advanced Workshop Meditations - Vol. 1" to "Vol. 5" stayed five separate recordings until an admin found the suggestion in Review and accepted it. Now the scanner groups them as it reads the library: sibling folders of one creator that share a name before a set number that differs between them (Vol. 1…5, 01…13, Volume 1 and 2). They become one series in numbered order. A series you set yourself (or none) in Review still wins, on every later scan. Sets that only share a name ("Open Sky - To Rest", "… - To Joy") are still offered rather than assumed, and a note on the creator's page (for the admin) now points to them.
- The next-step card on a creator's page no longer repeats the series name.

## [0.35.0] — 2026-09-24

### Added

- **Start the library over.** Admin → Library folders → **Start over** reads the whole library again, as if for the first time: titles, creators, series, types, parts, covers, lengths and guides. It also forgets what the AI made of it (levels, programme or pack, descriptions, the pictures it found, suggested fixes), then lets the AI enhance it again once the fresh read is done. You choose which enhancements run, and whether found pictures and descriptions are used as found.
  - **Your own corrections are kept by default.** Switch that off to have them read afresh too.
  - **Nobody's practice is touched.** Sessions, finished parts, places, favourites, plans and the journal come back on the same recordings, because each recording keeps the id it had.
  - **A copy of the database is kept first.**
  - **Deliberate:** it takes a second tap to confirm, and it will not start while a scan or an enhancement is running.
- Lengths the player measured before are kept for a fresh read too.

### Fixed

- The Enhance page updates its counts once the library it was waiting for has been read, instead of saying "All checked" meanwhile.

## [0.34.2] — 2026-09-24

### Fixed

- **Opened from the Home Screen, the app no longer runs off the bottom of the phone or freezes.** 0.32.4 sized the app's frame to the whole screen when opened from the Home Screen. But iOS 26 can show that app shorter than the screen, by about the status bar's height (after a sheet such as What's new closes, or on launch). The frame then ran past the bottom: the tab bar was cut, and the page, taller than its view, panned instead of scrolling and felt stuck. The frame is again exactly as tall as iOS shows, never taller.

## [0.34.1] — 2026-09-24

The 0.34.0 release, published. Its build stopped on a formatting check, so 0.34.0 was never released.

## [0.34.0] — 2026-09-24

### Added

- **Recordings that belong together.** A set filed as sibling folders was read as separate recordings: five "Advanced Workshop - Vol. 1" to "Vol. 5", thirteen numbered "Walking Meditation 01…15", ten "Synchronizing … - To …". Review the library now has **Belong together**. It finds these sets from their names (numbered, or three or more sharing a name) within one creator's folder, and shows each in its numbered order. **Group as one series** makes them one series, named as you like, on the creator's page, programme or pack and level included. **Not together** is remembered. Nothing in your folders changes, and it needs no AI.
- **Lengths from the start.** Each scan now reads every track's length from its file's header (MP3, MP4/M4V/M4A, FLAC, WAV), a few kilobytes per file. Before, a length was known only once a track had played, so a new library showed none, and the AI's picks and plans could not weigh time. The reading step shows it as its last phase.

### Fixed

- **An introduction and one meditation in versions is one meditation, not a pack.** For example: "Lay Down Version" and "Non-Lay Down Version", a meditation and its live or music version, "Version 1 / Version 2", or breath, meditation and the two combined. Two more kinds of introduction are now recognised: one that "explains", and a short first part before one long one. Different meditations (morning and evening, day and night) stay a pack. These rules come before the AI's reading, and the AI is told the same.
- Inside a series, parts no longer repeat the series' name: "Vol. 2 (2014)" under "Advanced Workshop Meditations".

## [0.33.1] — 2026-09-24

### Fixed

- **Back returns to where you were.** Going back from a recording to a creator page (or any page) jumped to the top. The page scrolls inside the app's frame on a phone, so the browser's own restoring never applied, and every change of page went to the top. Now each page remembers how far it was scrolled: Back and Forward return there (waiting a moment if the page is still drawing, and never fighting your own scrolling). A page opened anew starts at the top, and a filter or search on the same page leaves your place alone.

## [0.33.0] — 2026-09-24

### Changed

- **AI costs much less, with the same answers.** Every AI feature was gone through:
  - **Thinking kept small.** Thinking models (GPT-5, o-series, Gemini 2.5/3, and through OpenRouter) are asked for low reasoning effort, or medium for a whole plan. Their default is far more, and that hidden thinking is billed as output.
  - **A cheaper model for simple jobs.** Levels, fixes, finding creator pictures and today's pick run on the cheaper sibling of the model you chose: the newest GPT mini, Claude Haiku or Gemini Flash, when your key has one. Writing, plans, the guide, Discover and descriptions stay on your chosen model. The AI page says which model is used for what.
  - **Settled work is not paid for twice.** Levels go only to recordings without one (or whose programme/pack reading was a guess from names). Fixes go only to recordings that are new or changed since the AI last looked; each is remembered by a fingerprint of how it read. Running either over a settled library makes no request at all. "Look for fixes" and "Set the missing levels" say how much is left.
  - **Leaner web searches.** OpenAI's search pulls in the short version of each page; Claude searches at most 4 times per request; OpenRouter takes 3 results.
  - **Safe.** If a provider or model turns a setting down, the request is asked again without it. If the cheaper model is not available, the chosen one answers.

  On a copy of a 174-recording library, levels, pictures and fixes together took 146 seconds. A second run made no AI requests and took no time.

## [0.32.4] — 2026-09-24

### Fixed

- **The tab bar meets the bottom of the phone when ZenPort is opened from the Home Screen.** There, iOS can report the window's height without the status bar and home indicator areas. The app's frame, sized from that, ended some 80 points short, with the tab bar floating above a band of empty screen. As a whole-screen app, the frame now takes the screen's full height. In Safari nothing changes.

## [0.32.3] — 2026-09-24

### Changed

- **Reviewing the library says what to look at.** Each recording opens with a "What to look at" panel that names, in plain words, why it is there, and shows what would change:
  - **Part names** still named like files, with the tidier names side by side (before → after) and one tap to use them.
  - **Order**, when videos and audio are mixed: how it plays now, and that you can drag to change it.
  - **Creator**, when ZenPort could not tell who made it.
  - **What your AI suggests** for this recording (a title, a type, part names, an order), each as before → after with the AI's reason, and **Apply** or **Keep as is** right there.

  Nothing to change? "Looks right" marks it checked and moves on.
- An **AI suggests** filter and an "AI: title, part names" tag on each row show which recordings have open AI fixes.
- **Part names show in full.** They wrap onto more lines instead of being cut off at the edge. A renamed part shows what it was (and can be undone).
- **AI requests are smaller.** The library sent with a plan, a practice review or today's pick is grouped under "creator > series" headings, instead of repeating both on every line. Numbered parts are sent as a range ("Day 1–30, ~10m each"). What should not be picked is left out rather than listed. For a library of 174 recordings, that is about 20–35% fewer tokens per request, with nothing dropped that an answer depends on.

## [0.32.2] — 2026-09-24

### Fixed

- **The welcome's AI step no longer asks again for a key you already gave.** It read your AI settings once when the welcome opened, before you connected on the reading step. Every step now looks again. With a key connected, it shows "OpenAI is connected" and moves on.
- **The last step no longer says the library is "waiting for a folder"** after you chose, read and enhanced it (same cause). It now shows how many recordings were read.
- **Reading your library, from the first moment.** The step kept looking only while a scan was running, so opening it in the second before the scan started could leave it on "Nothing to read yet". It now says "Getting ready to read…" until reading starts, and keeps watching.
- The reading ring is redone: a slim gradient ring in the app's colours around a quiet disc, with the number and "recordings" inside it and a tick when done. Before, it was yellow, and the word spilled over the edge.
- On a phone, the AI provider tiles keep the longest name inside the tile.

### Changed

- **A sharp, new background.** The old one was a small, grainy picture stretched across the screen, with its stars painted in, so on a large display it looked soft and smudged. It is now a smooth, high-resolution aurora sized for retina desktops, with the stars drawn as vector dots that stay pin-sharp at any size. A fine grain keeps the dark gradients from banding. The drift is slower and smaller.
- "Three for today" wording left over in AI settings and the welcome now reads "For you today", one recording.

## [0.32.1] — 2026-09-24

### Fixed

- **Choosing libraries is instant.** A tick shows the moment you tap, and the server catches up behind it (or the tick is put back, with a note, if it refuses). Folder names appear at once, while their recording counts fill in ("Counting…") from a separate, cached call. Before, every view recounted the whole share. Opening a folder shows a loading state right away, and folders already seen open instantly. Folders inside a chosen library show as read with it. Ticks are worked out from the libraries actually chosen, so they never go stale (choosing an inner folder replaces its parent, and the parent's tick now clears). Several quick changes make one scan, a moment after the last.

## [0.32.0] — 2026-09-24

### Added

- **Setting ZenPort up, in the welcome flow.** Whoever creates the first admin account is walked through it:
  1. **Where your recordings live.** Browse the mounted folder and tick the folders that should be libraries. Each shows how many recording files it holds, and you can look inside and choose sub-folders instead. Libraries can be renamed. Choosing starts reading at once.
  2. **Reading your library,** live. A ring fills as it goes, and the counts climb (files, recordings) through each phase: reading, understanding, artwork, saving. Recognised recordings tick by, and each creator pops in as it is found. At the end come the totals by kind, programmes, and the creators' faces. Meanwhile you can **connect your AI** right there.
  3. **Let your AI tidy it.** Tick what you would like, each with an honest time estimate:
     - levels and programmes
     - creator pictures
     - descriptions, for the first 12–96 recordings
     - suggested fixes

     Choose whether found pictures and descriptions are used straight away. It then runs **on the server**, waiting for the library to be read first, and keeps going while you finish the welcome or close the page. Each step shows its progress. A live feed shows what the AI just decided ("Discovery Series · Part 1 - Intermediate · a programme", a part name it fixed, a picture it found), and pictures pop in as they are found. The last welcome step says whether it is still working. Enhance the library shows the same progress.
- **Libraries chosen in the app.** With `ZP_LIBRARY_BASE` set to a mounted folder, admins choose which folders inside it are libraries, name them, and add or remove them later under Admin → Library folders. Changes apply live, with no restart, and every path is checked to stay inside the mount. `ZP_LIBRARY_DIRS` still works, for libraries fixed by configuration.
- **Scan progress.** Every scan (at boot, on its timer, Rescan, a new library) goes through one coordinator. The scan state reports its phase, counts, and the creators and recordings met so far. A change made mid-scan is always read by a scan that follows.

### Changed

- The folder-layout advice in the welcome flow is shown only to admins, who own the folders. Everyone else sees what the library holds.

## [0.31.1] — 2026-09-24

### Fixed

- **The tab bar always meets the bottom of the phone.** Sometimes (with Safari's toolbar hidden, or after the keyboard had come and gone) it floated above the bottom with a band of page beneath it. iOS pins fixed bars to a viewport it does not always keep current. Now the app's frame is sized to the visible screen, and the tab bar, its fade, the mini player and notices sit at that frame's bottom. Any leftover pan from the keyboard is set back as the field lets go.

## [0.31.0] — 2026-09-24

### Added

- **Levels for everything.** Every recording can be beginner, intermediate, advanced or for every level. Names are read first ("(ADV)", "Advanced", "Basics", "Beginners", "Level 2"), then approved research, then the AI. Under Enhance the library → **Levels**, one run sets the rest in parts, and you can change any recording, or a whole series or folder, at once. Your choice always wins. The Library can sort **By level, beginner first**, and cards show the level on a creator's page.
- **Programmes and packs.** Several meditations are either a **programme** (in order, each part building on the last) or a **pack** or collection (any order). It is read from the parts' names (numbered days, parts, weeks, waves), not counting introductions and closings, so an introduction plus one meditation stays one meditation. The AI confirms it in the Levels run, and admins can set it on a recording's or series' page. Cards and rows are tagged Programme, Pack or Collection.
- **A creator's page, walked in order.** It opens with **your next step**: the programme you are in, or the first one to begin, with Continue. Then come programmes (easier first; numbered ones like "Series 1" before "Series 2"; "1." prefixes honoured and hidden), then packs and collections, then each shelf of collections, then single recordings by kind. You can filter by level and switch between grid and list.
- **Done, for whole series.** A series or programme whose every part is finished shows **Done** on its card, row and page.
- **Guides and notes for creators and series.** Documents in a creator's or series' own folder, like manuals and study guides beside the recordings, are kept and shown on that page to read or download. Previously they were skipped.

## [0.30.1] — 2026-09-24

### Changed

- **Finished parts stand out.** On any recording with several parts, meditations included, each part has a tick: an empty numbered circle while it is ahead, a filled circle with a check once done, plus a coloured "Practised" (or "Done", "Watched") label and a soft highlight on the row. Titles no longer dim, which made a finished part look unavailable.
- **Untick to come back to it.** Tap a filled tick to mark the part not done again, whether you'd like to repeat it or it didn't go the way you wanted. The same tick is in the player.

## [0.30.0] — 2026-09-24

### Changed

- **For you today is one meditation.** A single guided meditation from your library (a soundscape only if there are no meditations), in a larger card: its artwork, what it is, why it fits now, **Begin** to play it straight away, and Details.
- **It stays until you have sat with it.** A new pick comes only when you begin the current one, tap **Something else**, or leave it unopened for three days (opening its page counts). It no longer changes every day. A new pick is never the one it replaces, one of the recent picks, or the last thing you played.

## [0.29.0] — 2026-09-24

### Added

- **Made for you** (AI → Made for you). A guided meditation written for this moment and spoken by a calm voice, with real silence between the words.
  - **What you choose:** how you are arriving (up to three: restless, anxious, tired, scattered…), anything you would like it to hold, 5, 10, 15 or 20 minutes, what to rest on (breath, body, kindness, open awareness, sleep, or let it choose), and one of four voices, each of which you can hear first.
  - **How it is made:** your AI writes it from that and your intentions, and OpenAI's speech model speaks each passage. ZenPort then sizes the silences from the real length of the speech, so it lasts exactly the minutes asked for: a quiet lead-in, longer silences in the middle and a soft close.
  - **How it plays:** in the player, like any recording. It counts in your history, streaks and times sat, and can be reflected on in the journal.
  - **It stays:** every one is kept to sit with again. Read the words, or delete it (your history keeps the time you sat). Only you can play yours, and friends see only "Made for you".
  - **The voice needs an OpenAI key,** your own, or the admin's shared one if they open it for Made for you. Writing can use any provider.
  - **No ffmpeg:** speech and silence are joined in ZenPort itself (silence as real empty MP3 frames, with a seek table for exact length and seeking), so a 10-minute sit is about 3 MB.

## [0.28.0] — 2026-09-24

### Added

- **Creators, managed in one place** (Admin → Review the library → Creators). Every creator with their picture, recordings and series. Open one to:
  - **Rename** it. Every recording, series and picture follows, and so do recordings found later under the old spelling.
  - **Merge** it into another, from a list or just by renaming it to an existing name. Undo any merge from the creator it went into ("Also known as").
  - **Set the picture.** Upload one (JPEG, PNG, WebP, GIF, AVIF), paste a link, remove it, or find one with AI.
- **Looks like the same creator.** Names that differ only in spelling, spaces, punctuation or a leading "The" are paired, with a one-tap Merge (into the one with more recordings), The other way, or Different (hides the pair).
- The same creator editor opens from Enhance the library → Creator pictures.

## [0.27.1] — 2026-09-24

### Fixed

- **The tab bar stays put on a phone.** A fling up a long page could carry the tab bar along with the content and leave it stranded mid-screen (iOS moves fixed bars on its own while the page itself scrolls). On phones and small tablets the page no longer scrolls: the content does, inside a frame the size of the screen, so the tab bar, top bar and fade never move. Scrolling, the top bar's frosting, back-to-top on a new page, sheets holding the page still and drag-to-reorder all work as before.
- **Feel the breath on iPhone.** The taps are made the way Safari plays them: a fresh switch, flipped through its own label. "Try it" taps at once, inside your touch. System Haptics has to be on in the iPhone's settings, which the hint now says.
- **For you today** is spaced like every other section on Today, and its invitation is redesigned: a section of its own, a glimpse of three picks, and Turn on beside Not now.

### Changed

- **Admins decide what a shared AI is for.** When an admin shares their AI with everyone here, they choose what it may be used for: Plan with AI, Your guide, For you today, Discover or Made for you. The server holds to it, and features that aren't shared say so and point to connecting your own key. Enhancing the library stays admin-only, as does connecting an AI server by address.

- **For you today** sits right under Begin, at the top of Today, as first planned.
- **Discover without web search.** With your own AI server (which cannot search the web), Discover still works from what the model already knows. Such searches are marked "From the AI's own knowledge", and every link is still checked.

## [0.27.0] — 2026-09-24

### Added

- **Discover** (AI → Discover). Teachers, courses, books, and retreats and workshops beyond your library, found on the web by your AI and chosen for you. It knows your intentions, what you practise most and who is already in your library, and says why each one suits you. Choose the kinds and, if you like, what you are after ("something for sleep").
  - **Every link is checked.** Each recommendation's page is opened before you see it. One that does not open is left out, and the page says how many.
  - **Keep what you like.** Save any of them. Searches stay, dated, until you forget them, and what you saved stays saved. It does not suggest the same thing twice.

### Fixed

- Web-search answers (Discover, and About research in Enhance the library) no longer carry the provider's inline citations or tracking parameters in their text and links.

## [0.26.0] — 2026-09-24

### Added

- **For you today** (opt-in). Three recordings from your library, picked by your AI once a day from what you practise, what you have not tried and your intentions - never your plan - each with a line on why it fits now. They sit on Today under your plan, can be picked again, and leave out what Today already offers (the last thing you played). Turn it on from the invitation on Today, under AI → On Today, or in the welcome tour's AI step.

## [0.25.0] — 2026-09-24

### Added

- **Your guide** (AI → Your guide). An AI mentor looks back over a week, a month or three months: your sessions and when you sit, streaks, courses, how your plans have gone, your intentions and, if you ask, what is on your mind. It answers with how it is going, what is going well, what it notices, up to four things to try (linked to recordings in your library), where to head next (with Plan with AI or Adjust your plan when that fits), and a question to sit with. "Write about it" opens the journal with that question.
  - **Your journal, only when you say.** A switch for each review, off every time. Before anything is sent, the page lists exactly what will be.
  - **Notes are kept.** Every answer is saved as a dated note, only for you, and can be deleted.

## [0.24.0] — 2026-09-24

### Added

- **Enhance the library with AI** (admin; AI → Enhance the library, also under Admin). Every result is a suggestion to approve or dismiss, and nothing changes until you do.
  - **Fixes.** The AI reads the library in parts and suggests corrections: a wrong type, a title that is a bare folder or file name, a creator or series spelled two ways, raw part names, parts out of order. Anything you corrected by hand is left alone. Suggestions for one recording share a card, each change is decided on its own, and "Apply the sure ones" applies every confident one in one go. A long check can stop and continue later, and a pencil opens the recording in Review.
  - **About.** Choose up to six recordings and the AI looks each one up on the web: a short description, who it suits, its level, and the pages it used. Where it cannot find that exact recording it says so rather than guess.
  - **Creator pictures.** Choose up to four creators and the AI finds each a portrait, or a logo or cover for an organisation. Or set a picture yourself from any https link, and remove one any time.
- **Creator pictures everywhere.** Library, Creators and each creator's page (now with the picture beside the name) use the creator's picture when there is one.
- **About on a recording's page.** The description sits under the title, a few lines with More, then the sources. The level shows beside the length.

### Security

- Suggested pictures are fetched defensively: https only, public addresses only (checked again on every redirect), at most 8 MB within 15 seconds, and decoded and re-encoded as a 512px square, so only ZenPort's own copy is kept and served.

## [0.23.0] — 2026-09-24

### Added

- **Must include.** When planning with AI you can pick courses, and meditations too if you like, that have to be in the plan. The picker shows what is done, part-way or already in another plan. The AI places them in the right order and may add more. If it leaves one out, ZenPort asks once more, and if it is still missing, places it itself and says so.
- **Long plans.** Lengths go up to 6 months, 1, 2 or 3 years, or until done. A long path comes in phases, and every stage has a milestone: what you will have done by its end. Milestones show in the plan review and in each plan's "Why this path".
- **This week.** Plans opens with a check-in per path: the last seven days as dots (done, missed, skipped, today) and how many sessions were done. When several slipped by, it says so kindly and offers Adjust with AI.
- **Adjust with AI** (on the check-in and on every path). Say what changed ("I have less time now", "I want to go deeper"), and the AI reworks the rest of the path. It sees how the path has gone: sessions done and missed, courses finished or part-way. What is finished stays finished, and unfinished courses stay in the path. Accepting ends the old stages today, with their history kept, and continues the same path from tomorrow.

## [0.22.0] — 2026-09-24

### Added

- **AI, its own section** (sidebar, and More on a phone). One page for your AI and everything it does: the provider and model in use, the owner's choice to share it with everyone here, your intentions, and the features.
- **Bring your own AI.**
  - **Providers:** OpenAI, Anthropic (Claude), Google Gemini, OpenRouter (one key, many models), or your own OpenAI-compatible server such as Ollama or LM Studio, which is admin only because the server connects to the address given.
  - **Keys:** each key is checked with its provider, sealed on this server, and never shown again. Connect several and switch between them without pasting a key twice. Models are ranked per provider, and OpenRouter and your own server take any model name.
  - **The provider layer:** it also supports each provider's own web search, for the features to come.
- **Your intentions.** Six short questions, mostly taps: why you practise, what you hope for a year from now, your experience, your time, what you enjoy, and anything to keep in mind. They are asked once in onboarding (the first four, optional) and editable under AI → Your intentions. Plans with AI already use them.
- **Plan with AI without AI set up** leads to Set up AI and back into the planner. The AI page's "Plan with AI" opens the planner directly (`/plans?ai=1`).

### Changed

- Your existing OpenAI key moves across by itself (migration v14). Settings' AI section is now a card that leads to the AI page.
- The planner's privacy note names the provider and model in use, and says your intentions go with the request.

## [0.21.0] — 2026-09-24

### Added

- **Continue, redesigned.** A row you swipe (arrows on a desktop) of wide cards. Each shows where you are ("3 of 9 lessons", "Stopped at 12:03"), a progress bar in the type's colour, and one round button that **resumes right there**: the saved place, or the next part not done. A small ✕ on the cover sets it aside, with **Undo** for a few seconds. It stays hidden on every device until you open it or play any of it again. Starting over clears the progress, so it leaves the row too.
- **Creators, round.** People are no longer square tiles: a ring around their artwork, like a story, in a row you swipe. **See all** opens a new Creators page. Find one by name, browse A-Z with a letter strip for long lists, or order by size. Each creator shows what kinds of work they have here (meditations, courses, talks, soundscapes) and the total length.
- **Grid or list** for Everything. A small switch beside the section's title; grid stays the default, and the choice is remembered. The list is one compact line per recording, with its type, length, progress, offline and practised marks, and a favourite star.

### Changed

- A creator's page breadcrumb reads Library / Creators / name.

## [0.20.0] — 2026-09-24

### Added

- **Clear practice history.** History is a card per day, in your own timezone: Today, Yesterday, then the weekday and date, with the day's minutes and sessions. **Clear day** removes a whole day; each session can be removed or its minutes corrected. Both ask first, in the app's own sheet rather than a browser box, and say what changes: streaks, totals and charts are counted again, and journal entries stay.

### Changed

- **Today's Begin, at a glance.** There are two main cards, what to practise and what to keep learning. Each has a cover, a one- or two-word tag (Your plan · Last time · Favourite · New · Course) instead of a sentence, and one round action. Learning shows its progress as a bar. **Breathe** and **Write** (was "Write something down") are two compact tiles. On a desktop the main cards sit left with the tiles stacked beside them; on a phone they stack, with the tiles side by side.
- **Hover on a desktop** eases instead of jumping. Cards rise 4px over 380ms, the artwork drifts a touch closer and the shadow deepens. A press style had been replacing the cards' transition, so the lift snapped. Touch screens have no hover and keep only the press.
- **Scrollbars in the app's colours** on a desktop: a slim plum thumb on a clear track, brighter under the pointer.

### Fixed

- Opening What's new, or any sheet, on a desktop no longer shifts the page sideways by a scrollbar's width and back on close. The scrollbar's room is kept (`scrollbar-gutter: stable`) while the page is locked.
- "1 minutes so far today" reads "1 minute".

## [0.19.0] — 2026-09-24

### Added

- **Review the library** (Admin → Review library): how every recording was read, and one place to correct any of it.
  - **Filters that are also counts:** New (added since the library was first read and not looked at), Worth a look (an unknown creator, names that are still file names, or videos among audio), Corrected, Hidden and Everything. There is also search and a type filter.
  - **The editor:** title, creator and series (each shows what the scan read, with a way back), type (for one item or its whole series), the parts' names, lesson or meditation roles, and drag-to-reorder, plus show or hide in the library and "How ZenPort read it".
  - **A quick sweep:** the one button is **Looks right**, or **Save & next** once something changed, and goes straight to the next item. The arrows skip. ⌘/Ctrl+Enter works too.
  - **Tidy names** offers readable names for file-like ones. "creativity pack- tip- day 27 640x360-video" becomes "Creativity pack - tip - day 27", and bare upload numbers become sessions. It only touches names you have not typed yourself.
  - **Mark all as reviewed** clears New in one go.
- Corrections are stored apart from the scanner's reading and laid back over it after every scan, so no rescan or moved folder undoes them. Giving a field back what the scanner read clears that correction.
- Admin's overview leads with a Review library card and its counts. The scan card links to what the last scan found.
- **"Library scan finished"** notice for admins: when a scan finds recordings never seen before, a small card offers to review them. It never interrupts onboarding, and says nothing about scans that found nothing.
- The first-run tour's library step offers an optional "Review it now" for admins.

### Changed

- The drag-to-reorder behaviour is shared by the order editor and the review editor, and works inside a sheet: it scrolls the sheet, not the page, and pulling a grip never closes the sheet.

## [0.18.1] — 2026-09-24

### Changed

- On a phone the action tiles under the main button sit together and centred, each no wider than it needs. Two tiles no longer spread to opposite sides of the screen; four or five still share the width of a small phone.

## [0.18.0] — 2026-09-24

### Changed

- **A calmer recording page.** One primary action, full width on the phone: Begin practice, Resume, Continue, Watch. The other actions sit beneath it as borderless tiles in one even row, each an icon in a soft well with a short label. They are Save offline (with its size), Add to plan and With a friend, plus Begin again or Start over when they apply. The resume note sits with the button it explains. On a phone the type chip, facts and times-practised line are centred with the title.
- **"Download" is now "Save offline".** It never put a file in the phone's downloads; it keeps the meditation inside ZenPort to play with no connection. While saving, a ring fills inside the tile's icon with the percentage beneath (tap to stop). Once saved, the tile turns a calm green, "Saved offline", and a tap asks before removing the copy. The page and menu entry are now *Offline* / *Saved offline*. Downloading a note (a PDF) still says Download, because it is one.

## [0.17.2] — 2026-09-24

### Changed

- *Edit order* has Save order, Cancel and Automatic order above the list as well as below it, so a long series need not be scrolled to its end to save.

## [0.17.1] — 2026-09-24

### Fixed

- **Intro placement reads more numbering styles.** A part numbered `#4`, `2.` (as in `IM - 2. Title`) or `S01E12` counts as numbered in the sequence and keeps its place. 0.17.0 moved some such parts, for example "#4 - Introduction to Focus 15".
- An intro whose name carries the collection's number ("Heart Series 2 Intro-video") now leads parts named only by an upload number (`audio-2338.mp3`). Series, season, volume and book name the collection, and a number carried by only one part is not a sequence. Checked against every multi-part recording in the library: 8 of 136 change order, all intros moving first.

## [0.17.0] — 2026-09-24

### Added

- **Your own order.** Admins get *Edit order* on any recording with several parts: drag each part by its grip, by finger or mouse, or use the arrow keys. The page scrolls on its own near the edges. The order is kept apart from the scanner's, so no rescan undoes it; parts added later follow it, and *Automatic order* puts the scanner's order back.
- **ZenPort recognises what moved.** Every file carries a fingerprint: its size plus its first and last 64 KiB, re-read only when the file changes. Rename a folder, move it somewhere else, rename a file, or mount the whole library back at another path, and ZenPort knows the recordings again. Everyone's places, ticks, history, favourites, and your types, roles, order and plans come along. The scan notes say when it happens.
- **Libraries that are no longer mounted.** Take a folder out of `ZP_LIBRARY_DIRS` and its recordings leave the shelves quietly, but nothing about them is thrown away. Admin → Library folders lists it under *No longer mounted* and asks: keep everything, so it is recognised if it comes back, or forget it for good. Forgetting removes the recordings with everyone's places, ticks, favourites, types, roles and orders; practice history and journal entries stay.

### Changed

- **Intros go first.** Parts not numbered in a series' sequence are placed by what they are: an introduction, or an unnumbered video framing numbered audio, goes first; a closing or bonus goes last. A number every part shares (the `Part 1` in `Part 1 Day 3`) is not a sequence number, and a numbered explanation video keeps its place.
- Libraries keep their id by path, so reordering `ZP_LIBRARY_DIRS` or taking an entry out no longer gives every recording a new identity. On the first boot after upgrading, existing libraries keep the ids they had.
- The first scan after upgrading reads a little of every file once, to fingerprint it; later scans read only new or changed files.

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
