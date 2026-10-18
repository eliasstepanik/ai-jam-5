---
type: note
title: Vite Canvas Game HMR With Preserved State
description: Verified pattern for hot-swapping a vanilla-canvas game module under Vite HMR while keeping game state, plus gotchas found in review.
tags: [vite, hmr, canvas, typescript, gamejam, pattern]
timestamp: 2026-10-13T19:10:00Z
---

# Vite Canvas Game HMR With Preserved State

Verified in project `ai-jam-5` (Vite 7.3.7, TS 5.9, Node 24).

## Pattern

- **Host module** (`src/main.ts`) owns canvas, fixed-timestep rAF loop, input, and `state`. Game logic lives in a separate module (`src/game.ts`) exporting `init / update / render` (and optionally `migrate`).
- `import.meta.hot.accept('./game.ts', mod => { game = mod; state = mergeState(game, state) })` swaps logic without re-running the host, so state survives.
- `import.meta.hot.accept()` + `dispose(data => { data.state = state; cancelAnimationFrame(raf); remove listeners; canvas.remove() })` makes host self-reload safe: no duplicate loop, no duplicate listeners, no second canvas. New instance reads `import.meta.hot.data.state`.
- Track every `addEventListener` in a list so dispose can remove all of them.
- `mergeState`: `{ ...init(), ...old }` (old values win, new keys filled). Shallow only; nested shape changes need `migrate()` or a reset key.
- Wrap `update`/`render` in try/catch, log once (dedupe), draw overlay; clear error on next successful swap.
- `game.ts` may `import type` from `main.ts`. With `verbatimModuleSyntax` the import is erased, so no runtime cycle and HMR boundary stays at `main.ts`.
- `vite.config.ts` `base: './'` makes `dist/` work from an itch.io iframe subpath.
- `node src/check.ts` runs a pure TS self-check via Node's built-in type stripping (Node >= 22.18), no test framework needed.

## Gotchas

- If `game.ts` exports `migrate`, it runs on **every** save, not only on shape changes.
- `npm run zip` using the `zip` CLI fails on hosts without `zip` installed (e.g. this NixOS box). Chain the build first: `npm run build && cd dist && zip -r ../game.zip .`.
- Dedup variable for error logging must be cleared on manual reset too, or a recurring identical error is not re-logged.
- In the `accept('./game.ts')` callback, compute `mergeState(next, state)` first inside try/catch, then assign `game` and `state`. Assigning `game` before a throwing `migrate` leaves new logic running on old state.
- Prove `migrate` idempotency in the self-check: `mergeState(m, mergeState(m, old))` must deep-equal `mergeState(m, old)`. A mutation (`score + 1`) is caught by this assertion.
- Use pointer events + `setPointerCapture` + `touch-action: none` instead of mouse events; clear `mouse.down` on window blur and `pointercancel`.
- Gating a debug key with `import.meta.env.DEV` means any HUD text advertising it must be gated too.

## Related

- [[session-state]]
- [[2026-10-13-ai-jam-5-hmr-scaffold-review]]
