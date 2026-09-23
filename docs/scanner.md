# Scanner and indexing rules

ZenPort's scanner is deliberately boring: fixed rules over folder structure, applied deterministically, with every decision recorded as evidence you can read in the app ("Why ZenPort read it this way" on any meditation). No AI, no fuzzy matching, no network.

## Guarantees

- **Read-only.** The scanner opens files for reading only. It never renames, moves, writes, or "fixes" anything in a library root.
- **Contained.** Symlinks are resolved and verified to stay inside the root (`realpath` check); anything pointing outside is skipped with a warning. Path traversal cannot escape a root — the same check guards media serving at request time.
- **Idempotent.** Item/track/asset identities are stable hashes of (root, source-relative path). Rescans upsert; nothing is duplicated.
- **History-safe.** Files that disappear mark their items _missing_ instead of deleting them. Practice history, plans, and journal links survive; when the files return, the items revive.
- **Deterministic.** Same tree in, same index out, including ordering.

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

The scanner guesses (`server/src/library/contentType.ts`) from two kinds of evidence, in order:

1. **Names, nearest first.** Walking up from the item, the first folder or file whose name says what it is wins: _Courses, Lessons, Class_ → course; _Livestreams, Lecture, Talk, Q&A, Webinar_ → talk; _Sound bath, Music, Ambient_ → soundscape; _Meditations, Guided_ → meditation. Hebrew equivalents are recognised too. Nearest first, so `Courses/<course>/Week 1/Meditation.mp3` is a course and `Meditations/<album> Workshop Meditations` is a meditation.
2. **The files.** A run of episode-numbered videos (`S1E1`, `Session 2`, `Part 3`…) is a course; one or two videos are a talk; audio is a meditation.

The owner can correct any item - or a whole series - from its page. A correction is stored apart from the guess (`item_types`), so a rescan never undoes it; "Let ZenPort decide" removes it.

**Series** are items sharing a creator and a collection; the Library and a series page show them as one thing with one progress. A creator's own sorting folders (_Courses, Livestreams, Meditations…_) are not collections, and a sorting folder holding separate recordings yields one item per recording.

**Video.** `mp4`, `m4v`, `webm` and `mov` play as video in the player (with full screen and picture-in-picture); audio always plays through an audio element so it keeps going with the screen locked. `mpg` and `flv` are not playable in a browser and are skipped.

## Scan lifecycle

- A scan runs at boot and every `ZP_SCAN_INTERVAL_MINUTES` (0 = off), plus on demand via the **Rescan** button (`POST /api/library/rescan`).
- Scan state (`GET /api/library/scan-state`) exposes status, timestamps, per-root readability, counts (items/tracks/covers/documents/skipped/missing), and human-readable warnings — all visible under **Settings**.
