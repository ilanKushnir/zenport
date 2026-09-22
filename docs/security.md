# Privacy and security

## Model

ZenPort assumes: a self-hosted server holding private practice data (journals, history), reachable by a small set of trusted people, ideally on a LAN or behind an authenticated HTTPS proxy.

## What ZenPort implements

- **First-run setup, no defaults.** The first visitor creates the single admin account; the window then closes permanently. `ZP_SETUP_TOKEN` can lock even that window.
- **Passwords**: scrypt (N=16384, per-hash random salt), constant-time comparison, minimum 10 characters.
- **Sessions**: 256-bit random tokens in `HttpOnly` `SameSite=Lax` cookies; only SHA-256 hashes are stored server-side; expiry enforced; `Secure` flag with `ZP_TRUST_HTTPS=1`.
- **CSRF**: every mutation requires a custom `x-zenport-csrf` header (unsettable cross-site) and same-origin `Origin` when the browser sends one.
- **Rate limiting**: login and setup are limited per IP (and per IP+username) in fixed windows.
- **Media routes**: opaque hash IDs only — no client-supplied paths; every request re-resolves and `realpath`-verifies containment inside a configured root; MIME comes from a server-side allowlist; range responses are size-capped; HTML documents are served with a sandboxing CSP and rendered in sandboxed iframes.
- **Uploads** (voice notes): type allowlist, 25 MB cap, server-generated filenames, stored under ZenPort's own `/data`, owner-only access.
- **Privacy boundaries**: plans, history, journals, and voice notes are scoped to their owner. There is deliberately **no admin UI to read another user's journal**. Admin powers are account management only.
- **No telemetry.** Outbound calls are exactly the three user-initiated YouTube/transcription cases enumerated in [youtube-sources.md](youtube-sources.md) and [configuration.md](configuration.md).
- **Container**: non-root runtime (PUID/PGID), read-only library mounts, `no-new-privileges`, single exposed port, health endpoint without auth but without data.

## What ZenPort does not do — be honest with yourself

- **No TLS.** Use a reverse proxy for HTTPS; set `ZP_TRUST_HTTPS=1` behind it.
- **No protection from the host admin.** Whoever can read `/data` can read the SQLite database, including journals. Full-disk or volume encryption is the tool for that threat.
- **No 2FA / SSO yet.** If you need them today, gate ZenPort behind an authenticating proxy.
- **Proxy IP spoofing**: ZenPort does not trust `X-Forwarded-For` (rate-limit keys use the TCP peer). Behind a proxy, all clients share the proxy's IP for rate limiting — acceptable for a household, worth knowing.
