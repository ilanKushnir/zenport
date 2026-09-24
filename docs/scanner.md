# Scanner and indexing rules

ZenPort's scanner is deliberately boring: fixed rules over folder structure, applied deterministically, with every decision recorded as evidence you can read in the app ("Why ZenPort read it this way" on any meditation). No AI, no fuzzy matching, no network.

## Guarantees

- **Read-only.** The scanner opens files for reading only. It never renames, moves, writes, or "fixes" anything in a library root.
- **Contained.** Symlinks are resolved and verified to stay inside the root (`realpath` check); anything pointing outside is skipped with a warning. Path traversal cannot escape a root — the same check guards media serving at request time.
- **Idempotent.** A new item or track gets an id hashed from its library root and source-relative path. Rescans upsert; nothing is duplicated.
- **Recognises what moved.** Every track also carries a fingerprint: a hash of its size, first 64 KiB and last 64 KiB, re-read only when its size or modified time changes. A file at a path ZenPort has never seen, matching a file that is gone from where it was, takes that file's id. A new folder, most of whose files are such matches, takes the old folder's id. That covers a moved or renamed folder or file, and a library unmounted and mounted back at another path. Everything stored against those ids comes along: places, ticks, practice history, favourites, types, roles, the owner's order and plans. Path still wins over content, so a retagged file at the same path keeps its identity. A file that was both moved and retagged falls back to name + size.
- **Libraries keep their ids.** A root's id follows its path, not its place in `ZP_LIBRARY_DIRS`, so reordering the list, or taking an entry out, renumbers nothing.
- **History-safe.** Files that disappear mark their items _missing_ instead of deleting them. Practice history, plans, and journal links survive; when the files return, the items revive. A library taken out of `ZP_LIBRARY_DIRS` leaves the shelves quietly and is kept. Admin → Library folders lists it under _No longer mounted_, where the admin can keep it or forget it for good. Forgetting removes its recordings with everyone's places, ticks, favourites, types, roles and orders; practice history and journal entries stay.
- **Deterministic.** Same tree in, same index out, including ordering.

## Reviewing and correcting (admin)

**Admin → Review library** shows how every recording was read, and lets the admin correct any of it. They can change the title, creator, series and type (for one item or its whole series), and the parts' names, their lesson or meditation role, and their order. They can also hide an item from the library. It opens on what matters:

- **New:** added since the library was first read, and not looked at yet.
- **Worth a look:** ZenPort flags an unknown creator, names that are still file names (`-video`, `640x360`, `audio-2248`), or videos mixed among audio, where the order may need a check.

The editor's main button is **Looks right**, or **Save & next** once something changed, and moves straight on to the next item. **Tidy names** suggests clean names for file-like ones; nothing is saved until the admin saves.

Corrections are stored apart from what the scanner reads: `item_edits`, `track_edits`, `item_types`, `track_roles`, `track_order` and `excluded_folders`, keyed by ids that follow moved files. The scanner writes its own reading on every scan (`inferred_*`) and lays the corrections back over it, so nothing corrected is ever undone. Giving a field back what the scanner read clears that correction.

When a scan finds recordings never seen before, admins get a small notice with a link to review them. The first-run tour offers the same link, clearly optional.

## Supported files

- Audio: `mp3 m4a m4b flac ogg opus wav aac`
- Images (covers): `jpg jpeg png webp avif`
- Documents: `pdf txt md html`
- Skipped without complaint: hidden files/folders (dotfiles), `Thumbs.db`, `desktop.ini`, `._*` resource forks, and any unsupported extension (counted as "skipped" in scan state).

## Hierarchy inference

A folder that directly contains audio is a **meditation** ("media leaf"). Around that anchor:

1. **Wrapper collapse.** A generic top folder name (`Meditations`, `Library`, `Audio`, `Collections`, `Media`, `Downloads`, `Content`…) is never a creator. The same applies to a _sole_ top-level folder whose children hold no audio of their own (`My Stuff/…`).
2. **Category detection.** A top folder with **two or more** children, none of which hold audio directly but all of which lead to audio deeper, reads as a category (`Sleep/`), and its children become the creators. Sibling evidence is the point: one child alone is not enough.
3. **Creator.** The first remaining ancestor above the meditation. Nothing suitable → **Unknown creator** — ZenPort prefers an honest unknown over a fabricated name.
4. **Collection.** Any folders between the creator and the meditation, joined (`21 Day Journey`).
5. **Tracks vs. separate meditations.** Multiple audio files in one folder are **one meditation with ordered tracks** when they read as a set (all stems numbered, or identical stems with trailing numbers). Heterogeneous files directly in a creator-level folder are **one meditation each** (`Orin Vale/Body Scan.wav`).
6. **Natural order.** `2 - opening` sorts before `10 - closing`. Track titles drop the numeric prefix.
   Parts that are not numbered in the sequence are placed by what they are. An introduction (`Intro`, `Welcome`, `Overview`, `Trailer`…) goes first. So does an unnumbered video among numbered audio parts, which frames the series. A closing or bonus goes last. A number every part shares, such as the `Part 1` in `Series Part 1 Day 3`, does not count as a sequence number. A numbered explanation video keeps its place in the middle.
   The admin can then drag the parts into any order on the item's page (**Edit order**). That order is stored apart from the scanner's, so rescans never undo it. Parts added later follow it, and **Automatic order** puts the scanner's order back.
7. **Covers.** Preference order: canonical stems (`cover`, `folder`, `front`, `album`, `art`) → image named like the folder → first image. File-level meditations use an image with a matching stem. No image → the UI renders a typographic fallback (never stock art).
8. **Documents.** Attach to the meditation whose folder (or audio-less subfolder, e.g. `handouts/`) contains them.

### Known limitation (v0.1, documented on purpose)

A creator folder that _only_ contains programs (no direct-audio meditation folder at all, e.g. `X/{Program A/S1/a.mp3, Program B/S1/b.mp3}`) matches the category shape and will read its programs as creators. The evidence trail shows exactly which rule fired; a future release may add an override UI.

## Content types

Every item is one of four types, shown on its card and page and used by the Library tabs, Plans and Stats:

| Type           | What it is                                      | Counts as |
| -------------- | ----------------------------------------------- | --------- |
| **Meditation** | A guided practice, intro tracks included        | Practice  |
| **Soundscape** | Music, sound baths, ambient or sleep sound      | Practice  |
| **Course**     | Lessons worked through in order, video or audio | Learning  |
| **Talk**       | A single lecture, livestream, workshop or Q&A   | Learning  |

The scanner guesses (`server/src/library/contentType.ts`) from three kinds of evidence, in order:

1. **Your filing.** A folder above the item whose whole name is a kind (_Courses, Meditations, Livestreams, Talks, Soundscapes_, or numbered, like _2. Courses_) is where you put it, and that wins: `Meditations/Open Heart (Livestream Extract)` is a meditation, and `Courses/<course>/Week 1/Meditation.mp3` is a course. The nearest such folder decides.
2. **Names, nearest first.** Otherwise, walking up from the item, the first folder or file whose name mentions what it is wins: _Lessons, Class, Masterclass_ → course; _Livestream, Lecture, Talk, Q&A, Webinar_ → talk; _Sound bath, Music, Ambient_ → soundscape; _Meditation, Guided_ → meditation. Hebrew equivalents are recognised too.
3. **The files.** A run of episode-numbered videos (`S1E1`, `Session 2`, `Part 3`…) is a course; one or two videos are a talk; audio is a meditation.

The owner can correct any item - or a whole series - from its page. A correction is stored apart from the guess (`item_types`), so a rescan never undoes it; "Let ZenPort decide" removes it.

**Series** are items sharing a creator and a collection; the Library and a series page show them as one thing with one progress. A creator's own sorting folders (_Courses, Livestreams, Meditations…_) are not collections, and a sorting folder holding separate recordings yields one item per recording.

**Video.** `mp4`, `m4v`, `webm` and `mov` play as video in the player (with full screen and picture-in-picture); audio always plays through an audio element so it keeps going with the screen locked. `mpg` and `flv` are not playable in a browser and are skipped.

## Packs, in order or any order, and levels

Several meditations together are a **pack**. That covers a recording of several parts, and a series of several recordings. Some packs are meant **in order**, a path taken a step at a time. The rest are a set to choose from in any order (`shared/src/structure.ts`, `meantInOrder`):

- **In order**: most parts' names name a step, and the steps differ. For example _Day 1…10, Week 2, Session 3, Lesson 4, Part 1 Day 3, Wave III, S1E2, Exploring #4_, or a run of raw, consecutively numbered files (_audio-2248, audio-2249…_).
- **Any order**: everything else. That includes catalogue numbers and volumes (_Energy Circles 01…11, Vol. 1…5_), track numbers (_1. Friday Morning, 2. Saturday Healing_), and different meditations (_Morning, Evening_).

Parts that frame the practice rather than being one do not count, so an introduction and one meditation is **one meditation**, not a pack. Framing parts are an introduction, instructions, an explanation ("… explains …"), a welcome or a close. A short first part (at most 8 minutes, and at most 15% of the longest) before one long one counts as framing, whatever it is called. One meditation **in versions** is one meditation too: lying down and walking, a live or music version, _Version 1 / Version 2_, or its breath, its meditation and the two combined.

Only the names decide, so the same kind of recording always reads the same way. The AI does not; its earlier guesses were cleared (migration v29). An admin can say otherwise on a recording's or a series' page (_In order_ / _Any order_). On a creator's page, packs are listed together, the ones meant in order first; "Your next step" follows those.

Every recording also has a **level** - beginner, intermediate, advanced or every level (`server/src/library/levels.ts`). The strongest word wins: an admin's choice; then the name, which often says it outright (_(ADV)_, _Advanced_, _Basics_, _Beginners_, _Level 2_); then approved web research; then the AI's reading. A series' level is where it starts - its first part's.

A creator's page is walked in that light: the next step (the pack in order under way, else the first not begun), then packs (in order first, easier first, as numbered - _Series 1_ before _Series 2_), then each shelf (a folder of several series), then single recordings by kind (series of courses or talks with their kind).

### Recordings that belong together

Each folder with audio is its own recording, so a set filed as sibling folders reads as separate recordings with no series. Only the names say they belong together.

- **Numbered sets become a series as they are read** (`groupNumberedSets` in `server/src/library/infer.ts`). Two or more sibling folders of one creator share a name before a set number that differs between them: _Calm Harbour - Vol. 1_ to _Vol. 5_, _Quiet Walk 01…13_, _Open Sky Volume 1, 2_. They become one series of that name, in numbered order. A bare number needs a name of two words or more, so _Take 10_ is a title, not the tenth of a set. Recordings already in a series from their folders are left alone. An admin's series (or no series) set in Review always wins, on every later scan.
- **Sets sharing a lead name become a series too** (`sharedLeads` in `server/src/library/setNames.ts`): three or more siblings like _Generating Change_, _Generating Flow_, _Generating Joy_, or _Open Sky - To Rest_, _… - To Joy_. The lead must say something: at least 7 letters, not filler like _The_ or _Love_ alone. Each title can be only a few words past it, and a joining word at its end is dropped (_Open Sky - To_ is _Open Sky_).
- **Not one series:** on a series' page, an admin can take it apart. A set ZenPort made is remembered and not made again; a grouping the admin made is undone. Anything the rules leave out can still be offered in Review the library → **Belong together** (`server/src/library/groups.ts`).

Nothing in the folders changes either way.

## Starting over

Admin → Library folders → **Start over** reads the whole library again from scratch (`POST /api/admin/library/start-over`, `server/src/library/reset.ts`):

- **Forgotten:** how it was read (recordings, parts, covers, lengths, folder guides) and what the AI made of it (levels and programme/pack calls it set, descriptions, pictures found on the web, suggested fixes, what it had already checked).
- **Kept by default:** the admin's own corrections (titles, creators, series, types, part names, roles and order, hidden folders, levels, structures and pictures set by hand, merged creators). The admin can choose to forget those too.
- **Never touched:** everyone's practice history, finished parts, playback places, favourites, plans, journal and today's pick. The fresh scan gives every recording and part still in place the id it had, so all of it comes back attached. Hiding is by folder, so it survives either way.
- **A copy first:** the database is copied to `data/zenport-before-start-over-<time>.db` before anything is forgotten (the newest two are kept).

It can also start the AI enhancement (levels, pictures, fixes, descriptions), which waits for the fresh scan to finish. It refuses to start while a scan or an enhancement is running.

## Lengths

A track's length is read from its file's header as part of each scan (the last phase, _Measuring how long each one is_): MP3 (Xing/Info or VBRI frame, else bitrate), MP4/M4A/M4V/MOV (the `mvhd` movie header), FLAC (STREAMINFO) and WAV. Only a few kilobytes are read per file, only for tracks with no length yet, four at a time, and every path is resolved inside its library first (`server/src/scanner/duration.ts`). Other formats get their length when first played (the player reports it).

## Folder documents

Documents in a folder with no audio of its own - a manual in a creator's folder, a study guide at the top of a series - are kept with that folder (`folder_docs`) and shown on the creator's or the series' page as **Guides and notes**. Documents in a recording's own folder (or below it) stay that recording's companion notes.

## Scan lifecycle

- A scan runs at boot and every `ZP_SCAN_INTERVAL_MINUTES` (0 = off), plus on demand via the **Rescan** button (`POST /api/library/rescan`).
- Scan state (`GET /api/library/scan-state`) exposes status, timestamps, per-root readability, counts (items/tracks/covers/documents/skipped/missing), and human-readable warnings — all visible under **Settings**.
