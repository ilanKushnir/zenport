# ZenPort style lock — v0.1 "warm twilight"

Established 2026-09-22 from the product brief (no external references). Mood:
premium contemplative editorial. Reuse these tokens; do not re-derive.

## Color contract (verified with contrast matrix)

| Role       | Hex       | Notes                                                    |
| ---------- | --------- | -------------------------------------------------------- |
| bg         | `#181420` | deep ink-plum                                            |
| surface    | `#221D2E` | cards, sheets                                            |
| raised     | `#2A2440` | fallback cover base                                      |
| border     | `#3A3348` | structural borders (decorative vs bg — never state-only) |
| text       | `#EFE7DA` | warm parchment                                           |
| muted      | `#A89FB5` | secondary text                                           |
| primary    | `#D49A6A` | restrained copper — actions, active states               |
| accent     | `#B7A8D9` | soft lavender — links, focus ring, secondary emphasis    |
| on-primary | `#241409` | ink on copper fills                                      |

Text-safe (>=4.5): text/bg 14.8 · text/surface 13.3 · copper/bg 7.4 ·
lavender/bg 8.3 · on-primary/copper 7.3 · lavender/surface 7.5.
Decorative only: border on bg/surface (hairlines), never the sole state carrier.

## Type

- Display: `Iowan Old Style, Palatino Linotype, Palatino, Book Antiqua, Georgia, serif` — headings, titles, wordmark.
- UI: `system-ui` stack. Base 15px / 1.55.
- Wordmark is TEXT-ONLY on purpose: the real logo is designed by another agent; nothing here may lock a mark in.

## Density & spacing

4px scale (`--s1..--s16`); radius 8/12/16 concentric; hairline `rgba(239,231,218,.09)`; shadows layered transparent, borders for structure only.

## Motion

`cubic-bezier(0.2,0,0,1)`, 150/220ms; press scale 0.96; sheet rise 16px fade;
skeleton shimmer only where latency exists; full `prefers-reduced-motion` kill.

## Assets

- Covers: real library art when present; deterministic typographic duotone fallback (4 palette-constrained hues) — never stock/AI imagery.
- Icons: single inline SVG set, 1.5px stroke, currentColor.
- Bell audio: WebAudio-synthesized (no licensed asset).
- No photography by design: the product's imagery IS the user's own library.

## Explicit prohibitions (from the brief)

Green wellness palette, lotus/mandala clichés, glassmorphism, gradient blobs, oversized empty heroes, fake charts/stats, any committed logo mark.
