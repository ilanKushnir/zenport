# Security Policy

## Supported versions

Only the latest release (and `main`) receive security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private vulnerability reporting on this repository ("Report a vulnerability" under the Security tab). You will get an acknowledgment within a few days.

## Scope notes for self-hosters

- ZenPort ships with session-cookie auth, scrypt password hashing, CSRF protection, login/setup rate limiting, opaque media IDs with path containment, and no default credentials.
- ZenPort does **not** terminate TLS. Anything beyond your LAN belongs behind a reverse proxy with HTTPS.
- Journals and history are private per account, but the server admin (OS level) can always read the SQLite database — that is inherent to self-hosting, not a bug.

Details in [docs/security.md](docs/security.md).
