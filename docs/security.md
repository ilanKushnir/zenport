# Privacy and security

## Model

ZenPort assumes: a self-hosted server holding private practice data (journals, history), reachable by a small set of trusted people, ideally on a LAN or behind an authenticated HTTPS proxy.

## What ZenPort implements

- **First-run setup, no defaults.** The first visitor creates the first admin account; the window then closes permanently. `ZP_SETUP_TOKEN` can lock even that window.
- **Invitations, not sign-up.** Every later account starts from an admin's invitation link: 192 random bits, stored only as a SHA-256 hash, shown once, single-use (claimed atomically), expiring after one to thirty days, revocable. The public join endpoints are rate limited and answer the same for unknown, used, expired and revoked links. Password-reset links work the same way, last two days, and sign the account out everywhere.
- **Roles.** Members practise, study, plan, journal and make friends. Only admins change the library (rescans, folders, types, track roles, YouTube sources), share their AI key, and manage people; the server enforces this on every route, and there is always at least one admin.
- **Friends see what each person allows.** Friendships need both sides; either can end one. Each person picks full, summary (minutes, streaks and days, no titles) or off, and the server strips the rest before it leaves - never journals, reflections or plans.
- **Passwords**: scrypt (N=16384, per-hash random salt), constant-time comparison, minimum 10 characters.
- **Sessions**: 256-bit random tokens in `HttpOnly` `SameSite=Lax` cookies; only SHA-256 hashes are stored server-side; expiry enforced; `Secure` flag with `ZP_TRUST_HTTPS=1`.
- **CSRF**: every mutation requires a custom `x-zenport-csrf` header (unsettable cross-site) and same-origin `Origin` when the browser sends one.
- **Rate limiting**: login and setup are limited per IP (and per IP+username) in fixed windows.
- **Media routes**: opaque hash IDs only — no client-supplied paths; every request re-resolves and `realpath`-verifies containment inside a configured root; MIME comes from a server-side allowlist; range responses are size-capped; HTML documents are served with a sandboxing CSP and rendered in sandboxed iframes.
- **Uploads** (voice notes): type allowlist, 25 MB cap, server-generated filenames, stored under ZenPort's own `/data`, owner-only access.
- **Privacy boundaries**: plans, history, journals, and voice notes are scoped to their owner. There is deliberately **no admin UI to read another user's journal or practice**. Admin powers over people are invitations, roles, reset links and removal.
- **What stays on a device.** The service worker caches the app itself (shell, hashed assets, artwork). From `/api` it keeps nothing - except meditations the person chose to download for offline use: their audio and cover sit in the browser's Cache Storage on that device until removed from the Downloads page (or the browser clears site data). To make the app open offline, the device also keeps the signed-in account's name and preferences in local storage; signing out clears the account. Sits played offline wait in local storage until they are sent.
- **AI, only when asked.** Each person's AI key is checked with its provider, sealed at rest with AES-256-GCM under a key derived from the session secret, and never sent back to the browser. Nothing goes to a provider until someone asks for something (a plan, a review, a library suggestion) - or turns on For you today, which asks for one pick when Today is opened and a new one is due (the last was begun, refreshed, or left unopened three days), with their history, intentions and library titles (never plans or journal) - and only what that feature needs. The guide says exactly what a review will send before it is sent, includes the journal only when it is switched on for that one review (never as a standing setting), and keeps its notes for their owner alone.
- **Pictures from the web** (admin, AI → Enhance the library, or set by hand): an address is fetched only over https, only to public addresses (every redirect hop is resolved and checked, so no address can point the server into your network), at most 8 MB within 15 seconds. Whatever arrives is decoded and re-encoded as a 512px WebP, so ZenPort serves its own copy, never the original bytes.
- **No telemetry.** Outbound calls are exactly: the three user-initiated YouTube/transcription cases in [youtube-sources.md](youtube-sources.md) and [configuration.md](configuration.md), the AI provider a person connected (when they use a feature; Made for you's voice is OpenAI's speech model, with an OpenAI key), the picture fetches above, and Discover's link checks: each recommended link is opened once, under the same https-and-public-addresses-only guard, before it is shown.
- **Container**: non-root runtime (PUID/PGID), read-only library mounts, `no-new-privileges`, single exposed port, health endpoint without auth but without data.

## What ZenPort does not do — be honest with yourself

- **No TLS.** Use a reverse proxy for HTTPS; set `ZP_TRUST_HTTPS=1` behind it.
- **No protection from the host admin.** Whoever can read `/data` can read the SQLite database, including journals. Full-disk or volume encryption is the tool for that threat.
- **No 2FA / SSO yet.** If you need them today, gate ZenPort behind an authenticating proxy.
- **Proxy IP spoofing**: ZenPort does not trust `X-Forwarded-For` (rate-limit keys use the TCP peer). Behind a proxy, all clients share the proxy's IP for rate limiting — acceptable for a household, worth knowing.
