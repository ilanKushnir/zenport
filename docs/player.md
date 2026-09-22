# Player behavior

The player is built for practice, not playlists.

## Playback

- Tracks play sequentially in natural order; previous/next, seek, elapsed/remaining, volume, and conservative speed steps (0.75×–1.25×) only — meditation audio is not podcast audio.
- Audio streams from opaque track IDs with HTTP byte ranges; seeking is instant and nothing is transcoded (your browser must support the format natively).
- Resume checkpoints are saved per user/meditation/track every few seconds and on pause; the detail page offers "Resume at …".
- Track durations are learned from the browser on first play and stored, so cards and stats can show them afterwards. Before that, duration shows honestly as unknown.

## Practice framing

- **Settling lead-in** (off / 10 s / 30 s / 1 min): a quiet countdown before the audio begins.
- **Interval bells** (off by default): a struck-bowl tone synthesized with WebAudio — generated in the app, nothing bundled or licensed — every 5/10/15/20 minutes of practice.
- **End timer** (off by default): after the chosen practice length, volume fades over ten seconds, a closing bell sounds, and the session completes.
- **Focus mode**: cover, title, your plan's intention if one applies, elapsed time, and minimal controls. Nothing else.

## Sessions

Starting playback starts a practice session; pausing, finishing, or leaving ends it honestly (`completed` / `abandoned` with a reason). Listened time is accumulated from real playback heartbeats and clamped server-side to wall-clock time, so replaying a segment can never double-count. Refreshing the page loses at most a few seconds.

## Screen wake lock

The moon toggle asks the browser to keep the screen on during practice (Screen Wake Lock API). Where unsupported or declined (some browsers, battery saver), ZenPort says so plainly — playback continues, but the OS may sleep the screen.

## Background audio and lock screens

ZenPort sets Media Session metadata and handlers, so lock-screen/hardware controls work where the browser offers them (Chrome/Android, desktop browsers, recent Safari to a degree).

**Honest limits:** no web app can override OS battery policy. iOS Safari in particular may pause background audio, ignore wake locks, or reclaim the tab; installing the PWA helps but does not guarantee. If unattended overnight playback matters to you, a native audio app on the device will always beat a browser.
