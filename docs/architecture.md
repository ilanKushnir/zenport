# Architecture

## Shape

```
zenport/
├── shared/    @zenport/shared — DTO types + pure logic (natural sort,
│              YouTube URL classification, formatting). Zero runtime deps
│              beyond zod-free pure TS; consumed by server and web.
├── server/    @zenport/server — Fastify 5 + node:sqlite.
│   └── src/
│       ├── config.ts        ZP_* env (with _FILE variants)
│       ├── db/              migrations (sequential, forward-only), open
│       ├── scanner/         safeWalk (containment), classify, scan persistence
│       ├── library/         inference engine (pure), query/DTO assembly
│       ├── practice/        durable sessions with clamped heartbeats
│       ├── plans/           occurrence expansion (pure)
│       ├── stats/           timezone bucketing, streaks, trends (pure)
│       ├── auth/            scrypt, hashed session tokens, rate limiter
│       ├── deps.ts          the only outbound integrations (oEmbed, yt-dlp,
│       │                    transcription) — injectable for tests
│       └── api/             app assembly (hooks: security headers, CSRF,
│                            auth) + one route module per domain
└── web/       @zenport/web — React 19 + Vite PWA.
    └── src/
        ├── theme.css / app.css   design tokens + components ("warm twilight")
        ├── api.ts / hooks.ts     fetch client (CSRF header), useApi
        ├── player/               provider (audio element, sessions, bells,
        │                         end timer, wake lock, Media Session), bar,
        │                         focus mode
        ├── components/           ui primitives (Sheet w/ focus trap, Cover
        │                         fallback, icons), reflection form + recorder
        └── pages/                one file per surface
```

## Decisions worth knowing

- **`node:sqlite` over an ORM/driver**: zero native modules, synchronous API that keeps services trivially testable, WAL mode, forward-only migrations in one file.
- **Stable identity**: items/tracks/assets are keyed by sha1(root, relative path) when first seen. Roots keep their id by path (`library_roots`), and a file or folder that moves is recognised by its content fingerprint and keeps its id, so user data follows it. Rescans upsert; disappearance sets `missing=1`; user data references never break. See [scanner.md](scanner.md).
- **Pure cores, thin routes**: inference, occurrence expansion, and stats are pure functions with the heaviest test coverage; routes validate (zod), call services, and shape DTOs.
- **Injected externals**: oEmbed/yt-dlp/transcription enter through `deps.ts`, so integration tests run fully offline and the "disabled" states are first-class.
- **Client-reported durations**: no ffprobe dependency in v0.1; the browser reports `loadedmetadata` durations once and the server persists them.
- **One port**: the server serves `web/dist` with an SPA fallback; `/api/*` is JSON. Dev uses Vite's proxy instead.

## Testing

- `shared`: natural ordering, YouTube classification.
- `server`: scanner walk/containment (real temp dirs + symlinks), 12 inference fixtures, scan persistence/idempotence/missing-revival, practice clamping, planner rules, stats/streaks/timezones, auth primitives, and API integration tests (setup→auth→CSRF→library→media ranges→practice→plans→journal/voice→YouTube import) via `app.inject` with an in-memory DB.
- Browser QA: `scripts/qa-browser.mjs` drives Chromium against a running server at 1440/834/390/320 widths, screenshots every surface, and fails on console errors and horizontal overflow.
