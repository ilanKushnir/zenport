# ZenPort

**A calm, self-hosted home for the meditation library you already own.**

ZenPort indexes the meditation audio, covers, and companion notes sitting in your own folders — read-only, without renaming or moving a single file — and wraps them in a practice companion: a meditation-first player, plans, honest statistics, and a private journal. No cloud, no telemetry, no AI guessing at your library.

> **Status: v0.1 released, with the next release in progress on `main`.** The core loop (arrive → practice → reflect → plan → review) works end to end. Screenshots below will be added once real captures are committed; the interface ships a single dark "warm twilight" theme, in four accents, with English copy. Known limitations are listed honestly [at the bottom](#current-limitations).

## What it does

- **A front door that answers "what now?"** — Today opens on one suggestion, your plan, what you were part-way through, and your favourites, so the app never greets you with a wall of files. A six-step welcome flow sets your accent, daily target, sit length, bell and motion preferences on first run, and can be replayed from Settings.
- **Unguided timer** — sit with nothing playing: opening bowl, optional interval bells, closing bell, an optional breath guide (4 in · 1 hold · 6 out), and a screen wake lock. Silent sits record to the same history and the same streak as guided ones.
- **Deterministic library scanner** — mounts your folders read-only, infers creators, collections, sessions, and track order from structure alone (no AI), and can show you the evidence for every decision. Rescans are idempotent; files that vanish are marked missing, never deleted, and your history survives.
- **Meditation-first player** — multi-track playback with resume, an optional settling lead-in, optional interval bells (synthesized in the app, nothing licensed), a gentle end timer with fade-out, a distraction-free focus mode, screen wake lock (with an honest fallback), and lock-screen controls where browsers allow them.
- **Durable practice history** — sessions record what you actually listened to, survive refreshes, can be corrected or deleted by you, and are the _only_ source for statistics. Empty stats stay empty — nothing is ever invented.
- **Planning** — plans with intention, date range, weekly cadence, target minutes, and a timeline that treats missed days as information, not failure. Complete, skip, move, pause, end — without rewriting history.
- **Private journaling** — a low-friction reflection sheet after each sit, plus free writing: mood, tags, voice notes (recorded in the browser, stored on your server), optional transcription through _your own_ Whisper-compatible endpoint (off by default), Markdown export, and no admin backdoor into anyone's journal.
- **YouTube sources** — save video links as references with fetched or manual metadata, import playlists/channels as metadata via your own `yt-dlp` (optional), and play through YouTube's privacy-enhanced embed only after an explicit tap. ZenPort never downloads YouTube media.
- **Made yours** — four accents derived from the logo's own amber→violet sweep, a choice of landing page, an optional daily target, bell volume with a test strike, and independent opt-outs for decorative motion and the ambient background (a system "reduce motion" setting always wins). Favourites get their own shelf and filter. ⌘K/Ctrl-K opens a palette over every meditation, page and preference.
- **Generated cover art** — recordings with no embedded artwork get a small abstract piece derived from their title, so an untagged shelf still reads as distinct things. Deterministic: the same meditation always gets the same image.
- **Self-hosting done properly** — one container, one port, SQLite in a named volume, read-only library mounts, non-root runtime, first-run admin setup with no default credentials, CSRF protection, rate-limited login, and a PWA shell.

## Screenshots

_Coming with the first tagged release — the placeholders here will only ever be replaced by real captures of the running app._

## Quick start (Docker Compose)

```bash
git clone https://github.com/ilanKushnir/zenport.git
cd zenport
cp .env.example .env
# in .env: set ZP_SESSION_SECRET (openssl rand -hex 32)
#          point ZP_MEDITATION_PATH at your meditation folder
docker compose up -d --build
```

Open `http://<host>:8484` and create your admin account. Until you point `ZP_MEDITATION_PATH` somewhere real, ZenPort serves the bundled sample library so you can feel the app immediately.

### Mounts and formats

| Mount                  | Mode          | Purpose                                       |
| ---------------------- | ------------- | --------------------------------------------- |
| `/library/meditations` | **read-only** | your meditation folders (any nesting)         |
| `/data`                | read-write    | ZenPort's own SQLite database and voice notes |

Audio: `.mp3 .m4a .m4b .flac .ogg .opus .wav .aac` · Covers: `.jpg .jpeg .png .webp .avif` · Companion documents: `.pdf .txt .md .html`

### ⚠️ Security warning

ZenPort holds private journals and listening history. Do not expose it directly to the internet without HTTPS and a reverse proxy; see [docs/security.md](docs/security.md) for the honest version of what ZenPort does and does not protect you from.

## Architecture (short version)

npm workspaces monorepo: `shared` (types + pure logic), `server` (Fastify + `node:sqlite`, scanner, auth, media streaming, stats), `web` (React + Vite PWA). One production HTTP port; the server serves the built frontend and a `/api/*` JSON API. Details in [docs/architecture.md](docs/architecture.md).

## Development

```bash
npm install
npm run fixtures        # generate the sample library
ZP_LIBRARY_DIRS=./fixtures/library/meditations ZP_DATA_DIR=./data npm run dev   # API on :8484
npm run dev:web         # Vite dev server on :5484 (proxies /api)
npm test                # unit + integration tests
npm run typecheck && npm run lint && npm run format:check
npm run qa              # browser QA sweep against a running server
```

> Note: `node_modules` needs a filesystem with symlink support — develop on a local disk, not an SMB share.

## Documentation

- [Self-hosting](docs/self-hosting.md) · [Configuration](docs/configuration.md) · [Scanner & indexing rules](docs/scanner.md) · [Player behavior](docs/player.md) · [YouTube sources](docs/youtube-sources.md) · [Privacy & security](docs/security.md) · [Architecture](docs/architecture.md)

## Current limitations

Honesty section — v0.1 does **not** yet have:

- track durations before first playback (they are learned from the browser as you play; no server-side probing yet);
- a light theme, localization, or RTL copy (layout primitives are RTL-safe; copy is English — the four accents all sit on the same dark ground);
- sits longer than 60 minutes on the timer (the practice API caps a session at 3600 listened seconds);
- audio transcoding — browsers must support your formats natively (notably: some browsers cannot play `.flac`/`.opus` in all containers);
- background scanning progress push — rescan state is polled;
- UBAL / MeTube integrations (visible as honest "coming soon" cards; the planned contract is a mounted download folder, nothing more);
- multi-library per-user permissions — every account sees the same library (journals, history, and plans are per-user and private);
- guaranteed background audio on iOS Safari — mobile OS policies win; see [docs/player.md](docs/player.md).

## License

[MIT](LICENSE)
