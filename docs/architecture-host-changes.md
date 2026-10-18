---
type: architecture
title: Last Ember – Host Changes and HMR Architecture (Part 1)
description: Code-level host (src/main.ts) changes for Last Ember – input, render context and resource registry, pause on blur, HMR topology for 40–60 modules, state merge. Part 2 covers seed/URL, dev features, index.html, Vite config, CI and the summary table.
tags: [project, ai-jam-5, architecture, last-ember, host, hmr]
timestamp: 2026-10-17T20:00:00Z
---

# Last Ember – Host Changes and HMR Architecture (Part 1)

Part 2: [[architecture-host-changes-2]] (sections 4 cont.–12). Hub: [[architecture]]. Product spec: [[last-ember-design]]. HMR pattern background: [[vite-canvas-hmr-state-preservation]]. State shape and `migrate`: [[architecture-state]].

**Mode:** brownfield-extension. The host stays the host. Every change below is additive, keeps `init(): State`, `update(s, input, dt)`, `render(ctx, s, w, h)` and optional `migrate`, and grows `main.ts` from 170 to ~186 lines (incl. the step-time bailout of [[architecture-host-changes-2]] §12, which needs owner approval). Game code that tests "any key" (for example an audio unlock on the first `pressed` edge) must ignore the `'Blur'` pseudo-code from section 3.

**Code governs.** Line references are `src/main.ts` at the scaffold commit (170 lines). Re-check the quoted lines before applying a diff.

**Verification status:** derived from reading the code and from Vite HMR semantics. Vite was NOT run for this document (no `node_modules` in the checkout). Section 4 lists the claims to confirm with the test procedure.

## 1. INPUT

### Current behaviour

- `main.ts:8-13` `Input = { keys, pressed, mouse: { x, y, down }, clicks }`. Keys are `KeyboardEvent.code`.
- `main.ts:71-76` keydown: `preventDefault` only for `/^(Arrow|Space)/` (`main.ts:58`). Dev-only `KeyR` reset (`main.ts:73`) returns before the game sees it. `pressed` gets the code only if it was not already held, so auto-repeat never re-fires `pressed`.
- `main.ts:77` keyup deletes from `keys`. There is no `released` set.
- `main.ts:78-81` window `blur` clears `keys` and `mouse.down`. Blur handling exists. There is no `visibilitychange` listener.
- `main.ts:83-93` pointer events on the canvas with `offsetX/offsetY` (CSS px relative to the canvas). `setPointerCapture` exists (`main.ts:88`). `touch-action: none` is set (`main.ts:82` and `index.html:9`).
- **Defect for this game:** `pointerdown` (`main.ts:87-93`) reacts to ANY button. A right click sets `mouse.down` and pushes a click, so it would trigger a parry. `pointerup` (`main.ts:94`) clears `down` for any button.
- **Defect for this game:** there is no `contextmenu` suppression. A right click opens the browser menu over the game.
- `main.ts:117-118` `pressed` and `clicks` are cleared after EACH fixed step.

### What the game needs (all by `KeyboardEvent.code`)

| Use | Codes | Edge or held |
|---|---|---|
| Move | `KeyW KeyA KeyS KeyD`, `ArrowUp/Down/Left/Right` | held (`keys`) |
| Roll (escape phase) | `Space` | edge (`pressed`) |
| Mineral select | `Digit1 Digit2 Digit3`, `KeyQ`/`KeyE` cycle | edge |
| Toss mineral | `KeyF` | edge |
| Shake off effect | `KeyG` | edge |
| Interact hold (mine, Beacon) | `KeyE` held (see note) | held + edge |
| Pause / resume | `Escape`, `KeyP` | edge |
| Confirm / start / restart | `Enter` | edge |
| Aim | mouse position | continuous |
| Swing / parry | left button | edge (`clicks`) |

Note: the brief lists `E` both for cycling and for interact. Resolve in the controls task. Recommended: `Q`/`E` NOT used for cycling (`Digit1-3` only), `E` = interact. This is a game-side binding decision with no host impact.

- **Right button:** not used by the spec. It is filtered out, not exposed.
- **`released`:** not needed. Mining and Beacon are "hold `E`" (`keys.has('KeyE')` per step), and the swing is edge-triggered. Skipped. Add it when a charged or release-triggered action appears: `released: Set<string>`, with `input.released.add(e.code)` in keyup and `input.released.clear()` next to `main.ts:117`.
- **Preventing browser defaults:** `GAME_KEYS` (`main.ts:58`) already blocks scroll for Space and arrows. `KeyW/A/S/D/Q/E/F/G/P`, `Digit1-3`, `Enter` and `Escape` have no page default on a canvas page. Unchanged.

### Required changes (diff-style, `main.ts`)

1. **Type `Input`** (`main.ts:8-13`). Replace with:

```ts
export type Input = {
  keys: Set<string> // held, KeyboardEvent.code
  pressed: Set<string> // went down since the last update step; also 'Blur' when focus or visibility was lost
  mouse: { x: number; y: number; down: boolean } // CSS pixels relative to the canvas, primary button only
  clicks: { x: number; y: number }[] // primary-button downs since the last update step
  view: { w: number; h: number; dpr: number } // canvas size in CSS pixels (same w, h that render receives) + devicePixelRatio used by resize
}
```

2. **Input literal** (`main.ts:57`). Append `view: { w: 0, h: 0, dpr: 1 }`:

```ts
const input: Input = { keys: new Set(), pressed: new Set(), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 0, h: 0, dpr: 1 } }
```

3. **`resize()`** (`main.ts:48-54`). After `canvas.height = ...` add:

```ts
  input.view.w = w
  input.view.h = h
  input.view.dpr = dpr
```

`dpr` lets update compute the same integer zoom that render uses (`viewZoomCss(h, dpr)`, R-018 refined by R-131 in [[architecture-rulings-3]]). Part of the OD-1 host PR.

This is safe. `resize` is first called at `main.ts:97`, after `input` is initialised at `main.ts:57`, so there is no TDZ error.

4. **`pointerdown`** (`main.ts:87-93`). Update the position for every button, but act only on the primary one:

```ts
on<PointerEvent>(canvas, 'pointerdown', (e) => {
  input.mouse.x = e.offsetX
  input.mouse.y = e.offsetY
  if (e.button !== 0) return // primary only: a right click must not swing/parry
  canvas.setPointerCapture(e.pointerId) // keeps move/up coming if the drag leaves the canvas
  input.mouse.down = true
  input.clicks.push({ x: e.offsetX, y: e.offsetY })
})
```

5. **`pointerup`** (`main.ts:94`): keep it unchanged (it clears `down` for any button). **`pointermove`**: add `input.mouse.down = (e.buttons & 1) !== 0`. A chorded release (L down, R down, L up) fires `pointermove`, not `pointerup`, so a `button === 0` filter on `pointerup` would leave `down` stuck (R-135, [[architecture-rulings-3]]). Leave `pointercancel` (`main.ts:95`) unchanged.
6. **`contextmenu`**. Add after `main.ts:95`: `on<Event>(canvas, 'contextmenu', (e) => e.preventDefault())`. It goes through `on()`, so dispose removes it.
7. Blur and visibility: see section 3.

### Screen to world (game code, no host change)

- `mouse.x/y` are **CSS pixels** relative to the canvas. The canvas fills the viewport, so they are viewport CSS px. `w`/`h` and `input.view` use the same units.
- **DPR reaches game math only through the zoom helper.** The host sets `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` every frame (`main.ts:121-122`). Game code draws in CSS px. Update reads `input.view.dpr`; render reads `const dpr = ctx.getTransform().a`. Both feed `viewZoomCss(h, dpr)`.
- Camera: stored in `State` as `cam: { x, y }`, the world-px centre of the view. `zoom` (CSS px per world px) is derived each step and NEVER stored. **Superseded by R-084 / R-131:** `zoom = viewZoomCss(view.h, view.dpr)` from `src/core/view.ts` (= `deviceZoom(Math.round(h * dpr)) / dpr`, integer device zoom, [[architecture-render]] §4.1). The old `VIEW_H = 360` constant and `T.view.heightPx` are deleted.
- Formulas (`w`, `h`, `dpr` = `input.view` in update, or the `render` args plus `ctx.getTransform().a`):

```
zoom   = viewZoomCss(h, dpr)                    // R-131, same value in update and render
worldX = cam.x + (mouse.x - w / 2) / zoom
worldY = cam.y + (mouse.y - h / 2) / zoom
screenX = (worldX - cam.x) * zoom + w / 2      // inverse, CSS px
screenY = (worldY - cam.y) * zoom + h / 2
devicePx = cssPx * dpr                          // done by the host transform, never by game code
aim = Math.atan2(worldY - player.y, worldX - player.x)
```

- Render applies the same transform: `ctx.translate(w / 2, h / 2)`, `ctx.scale(zoom, zoom)`, `ctx.translate(-cam.x, -cam.y)`. The host wraps `render` in `save/restore` (`main.ts:123,129`), so the game needs no reset.
- Order inside one step: read aim with the `cam` from the end of the previous step, move the player, then update `cam`. The lag of at most one step (16.7 ms) is invisible.
- `update` must use `input.view`, never `window.innerWidth`. That keeps update logic DOM-free, so `src/checks` can call it under Node.

### Edge-detection discipline per fixed step

- One frame runs N fixed steps, with N = 0..15 (`acc` clamp, `main.ts:106`; fewer when the 12 ms bailout of [[architecture-host-changes-2]] §12 drops the backlog, which loses no edge because edges are consumed by the first step). The host clears `pressed` and `clicks` after each step (`main.ts:117-118`).
- **N ≥ 2:** an edge is seen by the FIRST step only. The steps that follow see `keys`/`mouse.down` (held) but no edge. Rule: consume edges (`pressed.has`, `clicks.length`) only in the step function. Never cache "was pressed" in State across steps unless it is a deliberate input buffer.
- **N = 0** (fast monitor, accumulator below `STEP`): nothing is cleared. The edge carries over to the next frame that steps, so it is never lost.
- **Tap shorter than a step** (down and up before the next step): `pressed` holds the code but `keys` does not. Edge actions work. Hold actions see nothing, which is correct.
- **Input buffer (recommended, game-side):** a parry click arriving 1–3 steps before the swing cooldown ends is otherwise lost. Store `s.swingBufferT = 0.1` when a click arrives during cooldown and fire when the cooldown ends. This is plain data in `State`, so it is HMR-safe.

### Effect

- `check`: none, because `main.ts` is not imported at runtime by checks.
- Build: `tsc` validates the new field. The old `game.ts` compiles unchanged because the field is additive.
- HMR: a `main.ts` edit self-accepts and re-runs. Dispose (`main.ts:164-169`) removes all listeners incl. the new ones because they use `on()`.

## 2. RENDER CONTEXT AND RESOURCE REGISTRY

### Current behaviour

`resize()` (`main.ts:48-54`) stores CSS `w`/`h` and sizes the backing store to `w*dpr` × `h*dpr`. Each frame does `setTransform(dpr…)` and `save()`, calls `game.render(ctx, state, w, h)`, then `restore()` (`main.ts:121-129`). There is no channel for non-serialised objects (images, AudioContext, offscreen canvases, cached gradients).

### Required behaviour

- `render(ctx, s, w, h)` stays exactly as it is. DPR: see section 1.
- Non-serialised resources live OUTSIDE `State`, in `src/assets/resources.ts`. They survive hot swaps, are created lazily on first use, and never enter `mergeState`.

### Design: `src/assets/resources.ts` (game side, NO host change)

> **Superseded by [[architecture-rulings]] R-020 and [[architecture-rulings-2]] R-091, R-101:** the binding registry is [[architecture-resources]] §2–3 (`import type` only for audio/sprites, frame times in `res.perf`, never `debug.frameMs`; one AudioContext per page, never closed). The sketch below is history; keep only its `import.meta.hot.data` holder idea.

```ts
// Non-serialised resources (images, audio graph, offscreen canvases, dev counters).
// One instance per page. Kept in import.meta.hot.data so re-evaluating this module
// (HMR chain) returns the SAME instance instead of leaking a second AudioContext.
import { createAudio } from '../audio/engine.ts'
import type { Audio } from '../audio/engine.ts'

export type Resources = {
  audio: Audio // lazily resumed on the first user gesture, see section 3
  images: Map<string, HTMLImageElement> // keyed by Vite asset URL
  debug: { on: boolean; frameMs: number[] } // dev overlay data, section 7
}

const holder: { res?: Resources } = import.meta.hot?.data ?? {}

export function getResources(): Resources {
  return (holder.res ??= { audio: createAudio(), images: new Map(), debug: { on: false, frameMs: [] } })
}

export function image(url: string): HTMLImageElement {
  const m = getResources().images
  let img = m.get(url)
  if (!img) {
    img = new Image()
    img.src = url
    m.set(url, img)
  }
  return img // draw only when img.complete; a changed asset gets a new hashed URL and loads fresh
}
```

- **Why `holder` is allowed** although module-level state is forbidden: it holds no game state. In dev it IS `import.meta.hot.data`, which Vite keeps per module across re-evaluation. In prod the module is evaluated once. `holder` does not exist when the module is not evaluated, so no side effect runs at import time.
- **Callers:** `update` and `render` modules call `getResources()` directly. There is no new parameter and no host plumbing.
- **Dispose:** nobody disposes. The registry must outlive both a `game.ts` swap and a `main.ts` re-run. A `main.ts` re-run does not re-evaluate `resources.ts`, because unchanged imports stay cached. A full page reload frees everything. Do NOT add `import.meta.hot.dispose` to `resources.ts`: it would close the AudioContext on every edit in its chain.
- **`main.ts` dispose handler:** **nothing changes** (`main.ts:164-169`).
- **Limitation (`ponytail:`):** editing `createAudio`/`resources.ts` code does NOT rebuild an already created instance. The old graph keeps running. Reload the browser tab after editing the audio engine. Upgrade path: store a `VERSION` constant in the holder and rebuild when it differs. Add that only if audio is edited often.
- **Node checks:** `import.meta.hot?.data` is `undefined` under Node, so the holder falls back to `{}`. Checks must still NOT import `resources.ts`: it pulls in asset imports and DOM `Image`. See section 10.

### Effect

None on check, build or the host. HMR: an edited module that imports `resources.ts` re-evaluates normally. `resources.ts` itself re-evaluates only when it or one of its imports changes, and it returns the same instance.

## 3. PAUSE ON BLUR / VISIBILITY

### Current behaviour

- `main.ts:78-81` blur clears held input only. The game is not told.
- In a hidden tab the browser stops rAF, so no steps run. On return, `frame` clamps the elapsed time to `MAX_FRAME = 0.25` (`main.ts:21,106`). Verified: at most 15 catch-up steps (0.25 / (1/60)), no spiral. **Not enough at 320×240:** one cave-generation attempt costs ≈ 55 ms, so 15 catch-up steps during generation would freeze one frame for ≈ 825 ms ([[architecture-scale-and-economy-4]] §1.8). Fix: the `STEP_BUDGET_MS = 12` wall-time bailout, host change §12 in [[architecture-host-changes-2]] (REQUIRES OWNER APPROVAL).
- An AudioContext keeps playing in a hidden tab. Nothing suspends it today.

### Design (split host / game)

- **Host (minimal):** signals the loss once as a pseudo-key edge `'Blur'` in `pressed`. `'Blur'` cannot collide with a real `KeyboardEvent.code` (codes look like `KeyB`). Replace `main.ts:78-81` with:

```ts
function lostFocus(): void {
  input.keys.clear()
  input.mouse.down = false
  input.pressed.add('Blur') // game pauses on its next step
}
on<Event>(window, 'blur', lostFocus)
on<Event>(document, 'visibilitychange', () => {
  if (document.hidden) lostFocus()
})
```

  `'Blur'` stays in `pressed` until the next step. A hidden tab runs zero steps, so the first step after return sees it, before the other catch-up steps.
- **Game (`src/ui` screen machine):** at the top of `update`: `if (input.pressed.has('Blur') && s.screen === 'playing') s.screen = 'paused'`. While the screen is `paused`, no world system runs, so the catch-up steps are harmless. Resume needs an explicit `Escape`/`P`/`Enter`. It never resumes on focus, because the player may not be ready.
- **Audio (game side, `src/audio/engine.ts`):** `createAudio()` registers ONE `visibilitychange` listener that calls `ctx.suspend()` when hidden and `ctx.resume()` when visible and the screen is `playing`. `createAudio()` runs once per page via the registry (section 2), so the listener never stacks on HMR. In addition, the audio system mutes the master gain whenever `s.screen !== 'playing'`. This is decided per step and survives everything.
- **Autoplay:** create the AudioContext lazily and call `resume()` from the step that sees the first `pressed`/`clicks` edge. Chrome and Firefox use sticky user activation, so `resume()` succeeds after a gesture even outside the event handler. Not verified on Safari (out of jam scope).
- **No giant dt:** `dt` is always `STEP`. The 0.25 s clamp bounds catch-up to 15 steps, and they run in `paused`. Wall time is bounded too: the `STEP_BUDGET_MS = 12` bailout ([[architecture-host-changes-2]] §12, [[architecture-scale-and-economy-4]] §1.8, REQUIRES OWNER APPROVAL) drops the backlog once a frame's steps exceed 12 ms, so cave generation runs exactly one attempt per frame. `MAX_FRAME` and `dt = STEP` stay; cheap play steps never trigger it.

### Effect

Host +6 lines. Check: none. HMR: the new listener goes through `on()`, so dispose removes it.

## 4. HMR TOPOLOGY (40–60 modules)

### Current behaviour

`main.ts:148` `import.meta.hot.accept('./game.ts', cb)`. `main.ts:163` `import.meta.hot.accept()` (self-accept). `game.ts` has no `import.meta.hot`. `game.ts:4` is `import type` from `main.ts`, which is erased under `verbatimModuleSyntax`, so there is no runtime edge to `main.ts`.

### Propagation when `src/systems/flame.ts` is edited (Vite 7)

1. Vite invalidates `flame.ts` and walks **up its importers**. A module that does not accept the update bubbles it on. For example: `flame.ts` → `src/systems/index.ts` (if any) → `game.ts`.
2. `game.ts` does not accept itself, so the walk reaches its importer `main.ts`. `main.ts` accepts the dep `./game.ts`, which makes `main.ts` the boundary. If EVERY importer path from `flame.ts` reaches an accepting boundary, there is no full reload.
3. Every module on the walked path gets a new HMR timestamp. The client re-imports `game.ts?t=…`. When Vite serves it, its imports of invalidated modules are rewritten with `?t=` query strings. So `flame.ts` and each intermediate importer are **re-evaluated**. Modules NOT on the path (for example `src/render/hud.ts` when only `flame.ts` changed) are served from cache and are not re-evaluated.
4. The callback (`main.ts:148-161`) receives the NEW `game.ts` namespace, runs `mergeState(next, state)` (→ `migrate`), swaps, and logs `[hmr] game.ts swapped, state kept`.
5. Path to any `src` module with several importers (for example `src/core/rng.ts` imported by world and entities): every path bubbles up to `game.ts`, and all of them end at the same boundary. That is still fine.

**Conclusion: no `import.meta.hot.accept` additions are needed anywhere.** Do NOT add self-accept to sub-modules: their importers would keep stale bindings.

Part 2 continues with full-reload hazards, the test procedure, the state merge, and sections 6–11: [[architecture-host-changes-2]].

## Related

- [[architecture-host-changes-2]]
- [[architecture]]
- [[architecture-state]]
- [[index]]
- [[last-ember-design]]
- [[vite-canvas-hmr-state-preservation]]
- [[architecture-scale-and-economy-4]]
- [[architecture-rulings]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]
- [[architecture-render]]
- [[architecture-resources]]
