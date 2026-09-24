# Self-hosting ZenPort

## The short path

```bash
cp .env.example .env
# set ZP_SESSION_SECRET (openssl rand -hex 32)
# set ZP_MEDITATION_PATH to your library folder
docker compose up -d --build
```

Open `http://<host>:8484`, create the one admin account, and you are in.

## First start: claiming the instance

The first-start flow is deliberate and closes behind you:

1. **No default credentials exist — ever.** A fresh ZenPort has zero accounts and nothing to guess; there is no seeded admin, no magic password, nothing baked into the image.
2. **The first visitor claims the instance in the UI.** While the database has no users, `GET /api/setup/status` answers `{ "needsSetup": true, … }` and the app shows the setup wizard instead of a login form. Creating that account makes it the **admin** and signs it in immediately (session cookie).
3. **Optional lock while unclaimed: `ZP_SETUP_TOKEN`.** Empty (the default) means you simply open the app and claim it — right for a LAN where you will finish setup promptly. If the port is reachable from somewhere hostile before you get there, set `ZP_SETUP_TOKEN` (e.g. `openssl rand -hex 16`): the status endpoint then advertises `"setupTokenRequired": true` (never the token itself), the wizard asks for the token up front, and `POST /api/setup` refuses without it (constant-time comparison, rate-limited like login).
4. **The window closes for good.** The moment the admin account exists, `/api/setup` answers `403` for everyone — with or without the token — and `setupTokenRequired` reports `false` because it no longer matters. There is no open signup; everyone else joins through an invitation link an admin makes under **People** (single-use, expiring, shown once).
5. **From then on: session-cookie login.** Sign-in issues a 256-bit random token in an `HttpOnly` `SameSite=Lax` cookie (only its SHA-256 hash is stored server-side); mutations additionally require the CSRF header. Set `ZP_TRUST_HTTPS=1` behind your HTTPS proxy so the cookie carries `Secure`. Details in [security.md](security.md).

## Mounts

| Container path         | Mode              | What it holds                                                                                              |
| ---------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `/library/meditations` | `:ro`             | your meditation files. ZenPort only ever reads.                                                            |
| `/data`                | rw (named volume) | SQLite database + journal voice notes. Local disk only — never SMB/NFS, SQLite corrupts on network shares. |

**Choosing libraries in the app (recommended).** Mount one parent folder read-only at `/library` and set `ZP_LIBRARY_BASE=/library`. The admin then picks which folders inside it are libraries, in the welcome flow or under Admin → Library folders, names them, and can add or remove them any time. Each change is read at once, with no restart. Chosen paths are checked to stay inside the base.

**Fixed libraries.** Alternatively (or as well), set `ZP_LIBRARY_DIRS=/library/a,/library/b` and add matching read-only volume lines to a compose override. These show in the app as set by the server. Each root is scanned on its own and keeps its identity by path. A root you take out is kept, not deleted: bring it back, even at another path, and its recordings are recognised with everyone's progress. To let it go for good, use Admin → Library folders → _No longer mounted_.

## Reverse proxy / HTTPS

ZenPort does not terminate TLS. For anything beyond a trusted LAN put Caddy/Traefik/nginx in front, then set `ZP_TRUST_HTTPS=1` so session cookies carry the `Secure` flag. PWA installation ("Add to Home Screen") and the service worker require HTTPS (or localhost).

Example Caddy site:

```
zenport.example.com {
    reverse_proxy 127.0.0.1:8484
}
```

## Upgrades and backups

- State lives entirely in the `zp-data` volume. Back it up by copying the volume (the database uses WAL; stop the container for a guaranteed-consistent copy).
- Rebuild with `docker compose up -d --build` after a `git pull`. Migrations run automatically and only forward.
- The library mount needs no backup consideration from ZenPort's side — it is never written to.

## Bare metal

Node.js >= 24 (26 recommended). `npm install && npm run build`, then:

```bash
NODE_ENV=production ZP_DATA_DIR=/var/lib/zenport \
ZP_LIBRARY_DIRS=/srv/meditations ZP_SESSION_SECRET=... \
node server/dist/index.js
```

The server finds the built frontend in `web/dist` automatically.
