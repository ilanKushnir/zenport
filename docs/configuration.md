# Configuration reference

All configuration is environment variables. Every `ZP_*` variable also accepts a `ZP_*_FILE` variant pointing at a file with the value (for Docker secrets).

| Variable                   | Default                        | Meaning                                                                     |
| -------------------------- | ------------------------------ | --------------------------------------------------------------------------- |
| `ZP_HOST`                  | `127.0.0.1` (image: `0.0.0.0`) | bind address                                                                |
| `ZP_PORT`                  | `8484`                         | HTTP port                                                                   |
| `ZP_DATA_DIR`              | `./data` (image: `/data`)      | writable state: SQLite + voice notes                                        |
| `ZP_LIBRARY_DIRS`          | _(empty)_                      | comma-separated read-only library roots                                     |
| `ZP_SESSION_SECRET`        | _(required in production)_     | >= 32 chars; `openssl rand -hex 32`                                         |
| `ZP_SESSION_DAYS`          | `30`                           | session cookie lifetime                                                     |
| `ZP_SETUP_TOKEN`           | _(empty = open first run)_     | token the setup wizard demands before the first account exists              |
| `ZP_TRUST_HTTPS`           | `0`                            | set `1` behind HTTPS to mark cookies `Secure`                               |
| `ZP_SCAN_INTERVAL_MINUTES` | `60`                           | automatic rescan cadence; `0` = manual only                                 |
| `ZP_YTDLP_PATH`            | _(empty = disabled)_           | path to a `yt-dlp` executable for metadata-only playlist/channel listing    |
| `ZP_TRANSCRIBE_URL`        | _(empty = disabled)_           | Whisper-compatible `POST /v1/audio/transcriptions` endpoint for voice notes |
| `ZP_TRANSCRIBE_API_KEY`    | _(empty)_                      | bearer token for that endpoint                                              |
| `ZP_TRANSCRIBE_MODEL`      | `whisper-1`                    | model name sent to the endpoint                                             |
| `ZP_LOG_LEVEL`             | `info`                         | fastify/pino level                                                          |
| `ZP_WEB_DIST`              | _(auto-detected)_              | explicit path to the built frontend                                         |
| `PUID` / `PGID` / `TZ`     | `1000`/`1000`/`Etc/UTC`        | container entrypoint: run-as user and timezone                              |

Per-user timezone (used for streaks and day bucketing) is set in the app under **Settings**, not by environment.

## Data retention

- Practice sessions, plans, and journal entries live in SQLite until _you_ delete them in the app.
- Voice notes are files under `<data>/voice/<user-id>/`; deleting the journal entry (or the voice note) deletes the file.
- Transcripts are stored alongside the voice note only after you explicitly request transcription.
- Deleting a user (admin) deletes their sessions, plans, journals, and voice notes.
