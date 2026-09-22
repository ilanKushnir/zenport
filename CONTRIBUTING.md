# Contributing to ZenPort

Thanks for considering it. ZenPort is young; small, focused contributions land best.

## Ground rules

- **Read-only libraries are sacred.** Nothing may ever write into, rename, or reorganize a mounted library. Patches that do are rejected regardless of how useful they are.
- **No telemetry, ever.** No outbound calls except the explicitly user-initiated ones (YouTube metadata/embed, the self-hoster's own transcription endpoint).
- **Honest UI.** No invented statistics, no fake progress, no "coming soon" that looks shipped.
- **Deterministic inference.** The scanner is rules + evidence, not ML. New heuristics need tests and recorded evidence strings.

## Workflow

1. Fork, branch from `main`.
2. `npm install && npm run fixtures`.
3. Make the change **test-first** for scanner, inference, planner, stats, auth, or API behavior.
4. `npm test && npm run typecheck && npm run lint && npm run format:check`.
5. For UI changes, run the browser QA sweep (`npm run qa`) against a dev server and attach screenshots at desktop and 390px widths.
6. Open a PR describing what changed and why; small PRs review fastest.

## Code style

Prettier and ESLint are the law (`npm run format`). TypeScript is strict; avoid `any`. Comments explain constraints, not restate code.

## Reporting bugs / proposing features

Use the issue templates. For anything security-relevant, see [SECURITY.md](SECURITY.md) first — do not open a public issue.
