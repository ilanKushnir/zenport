# YouTube sources

The Sources page keeps _references_ to meditations you found on YouTube. ZenPort's position is deliberate:

- **Nothing is downloaded.** Not media, not thumbnails. ZenPort stores the video ID, URL, title, creator, and your organization (tags, collection, provenance).
- **Your mounted library remains the private path.** YouTube sources are a convenience layer beside it, not a substitute.

## What works

- **Save a video**: paste any watch/short/live/youtu.be URL. Classification is strict (host allowlist, ID validation); unsupported hosts and malformed links are rejected with a plain reason. Public metadata comes from YouTube's oEmbed endpoint server-side; when unavailable (private/removed videos), you are asked for a title yourself.
- **Import a playlist or channel** _(optional)_: when the self-hoster has configured `ZP_YTDLP_PATH`, ZenPort runs `yt-dlp --flat-playlist --dump-single-json` — metadata only, capped at 500 entries — shows a preview, and imports **only after you confirm**. Canonical video IDs are deduplicated; each import records its playlist/channel provenance. Without `yt-dlp`, the import UI shows an honest unavailable state.
- **Play**: through YouTube's privacy-enhanced embed (`youtube-nocookie.com`), loaded **only after an explicit consent tap** that names the external request, or open the link on YouTube directly.

## Network calls, completely enumerated

1. `https://www.youtube.com/oembed?...` — server-side, when you check/save a video URL.
2. `yt-dlp` (your binary, your network) — when you request a playlist/channel listing.
3. `https://www.youtube-nocookie.com/embed/...` — from your browser, after the consent tap.

That's the list. Nothing runs on a schedule, nothing is prefetched.

## Legal position

ZenPort does not and will not bypass DRM, paywalls, age gates, or access controls, and does not download YouTube media. The Coming-Soon downloader integrations (UBAL, MeTube) keep the same separation: external tools you run under your own responsibility write into a folder, and ZenPort scans that folder read-only like any other library. Respect creators — if a teacher sells their meditations, buy them.
