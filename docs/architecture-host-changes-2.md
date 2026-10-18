---
type: architecture
title: Last Ember – Host Changes and HMR Architecture (Part 2)
description: Continuation of the Last Ember host architecture – full-reload hazards and HMR test procedure, state merge, seed and URL, R reset vs restart, dev overlay, index.html, Vite config, CI and check script, and the summary table of all host changes.
tags: [project, ai-jam-5, architecture, last-ember, host, hmr]
timestamp: 2026-10-17T20:00:00Z
---

# Last Ember – Host Changes and HMR Architecture (Part 2)

Part 1 (sections 1–4): [[architecture-host-changes]]. Hub: [[architecture]]. Spec: [[last-ember-design]]. Pattern: [[vite-canvas-hmr-state-preservation]].

## 4 (continued). Full-reload hazards and test procedure

### What breaks the boundary (causes a full page reload or a stale swap)

| Hazard | Effect | Rule |
|---|---|---|
| Runtime (non-type) import of `main.ts` from any game module | `main.ts` becomes an importer in the chain. An edit re-runs the host via self-accept, and the circular edge `main → game → x → main` can force a reload | Only `import type { Input } from '../main.ts'`. `verbatimModuleSyntax` erases it. Never import a value from `main.ts` |
| Circular imports between game modules (`a.ts` ⇄ `b.ts`) | Vite 7.3.7 (source read): a module inside a circular import is re-imported normally; the client reloads the page only if that re-evaluation throws (TDZ on a cycle binding). The "circular import invalidate" full reload applies only to `hot.invalidate` (R-136, [[architecture-rulings-3]]) | The DAG rule stays because the layer rule demands it, not because of HMR. Keep the import graph a DAG: `core` ← `world` ← `entities` ← `systems` ← `render`/`audio`/`ui` ← `game.ts`. Shared types go into `src/core/types.ts` |
| Module imported by `index.html` directly, or a second entry | Has no accepting importer, so a full reload | Only `/src/main.ts` stays in `index.html` |
| Sub-module with `import.meta.hot.accept()` | Becomes its own boundary. Importers keep old bindings, so the logic is half-swapped | No `accept` outside `main.ts` |
| Module-level side effects (listeners, timers, `new AudioContext()`, rAF) | Not a reload, but each edit stacks a duplicate | Lazy creation through the registry ([[architecture-host-changes]] §2), never at import time |
| Module-level mutable game state (`let enemies = []`) | Resets on each re-evaluation, so state is lost silently | Everything goes into `State` |
| `import.meta.hot.invalidate()` or `decline()` anywhere | Forces propagation upward or a reload | Do not use it |
| Syntax error in any module | Vite error overlay. `mod` is `undefined` and handled at `main.ts:149` | Fix and save. No reload is needed |
| Throw while evaluating the new module graph | The import fails, Vite logs `[hmr] Failed to reload`. The old game keeps running | Fix and save |

Asset imports (`import url from './ember.png'`) and JSON imports are ordinary modules. They bubble to `game.ts` like code, which is fine.

Editing `src/merge.ts` bubbles to `main.ts` (its only importer). `main.ts` self-accepts (`main.ts:163`) and re-runs. The dispose handler (`main.ts:164-169`) hands `state` over through `data.state`. State is kept, the canvas is recreated, and the `game.ts` chain is NOT re-evaluated.

### Test procedure (run after the host changes and after each new module folder)

1. `npm run dev`, open the URL, open the DevTools console and enable "Preserve log". A full reload is then visible as a "Navigated to" line.
2. Start a run (`screen === 'playing'`) and move away from the spawn point.
3. Edit `src/systems/flame.ts`: change a tunable constant, for example the burn rate. Save. Expected result: exactly one `[hmr] game.ts swapped, state kept`, no "Navigated to", the player position is unchanged, and the new burn rate takes effect.
4. Repeat for a leaf in each folder: `src/core/rng.ts`, `src/world/cave.ts`, `src/entities/shade.ts`, `src/render/light.ts`, `src/ui/platform.ts` (R-003: no `src/ui/screens.ts`), `src/audio/sfx.ts`. Expected result: the same log line each time.
5. Edit `src/audio/engine.ts`. Expected result: the swap log appears and no second AudioContext exists (`getResources().audio` is the same object; check in DevTools that the sound is not doubled). Engine code changes need a manual tab reload ([[architecture-host-changes]] §2 limitation).
6. (Deleted by R-136: a cycle reloads only when re-evaluation throws, so the old "expect a reload" step proves nothing.)
7. Edit `src/main.ts`: add a blank comment. Expected result: no swap log, but state is kept (the player stays in place), there is no second canvas, and input still works once (no doubled listeners).
8. Edit `src/merge.ts`: add a comment. Expected result: the same as step 7.

## 5. STATE MERGE

### Current behaviour

`merge.ts:9-16`: non-object `old` → `init()`. If `migrate` exists → `migrate(old)`. Otherwise `{ ...init(), ...old }` (shallow).

### Decision: `merge.ts` does NOT change

- Last Ember `State` is nested (`player`, `flame`, `cam`, `cave`, `shades[]`, `inv`). A shallow merge keeps an old nested object whole. A new nested field (for example `flame.flickerFreq`) is then `undefined`, which gives `NaN` in the arithmetic.
- Fix in the game, not the host: `game.ts` exports `migrate`, implemented in `src/core/state.ts` and re-exported. It fills nested defaults idempotently with `x.field ??= default`, and never transforms values. Shape and rules: [[architecture-state]] (sibling task).
- `migrate` runs on EVERY swap (`merge.ts:11`) and calls `init()` for the defaults. **So `init()` must be cheap and pure:** no cave generation, no `history`, no RNG side effects. It returns the `title` screen with an empty world. The cave is generated when a run starts (section 6).
- **Assertion that must exist** (in `src/checks/state.check.ts`, per [[architecture-state]]). It imports `init`/`migrate` from `src/core/state.ts` and NOT from `game.ts`, because `game.ts` pulls in render and assets, which break under Node:

```ts
const old = init() as any
delete old.flame.flickerFreq // simulate a state saved before a nested field existed
const once = migrate(old)
ok(typeof once.flame.flickerFreq === 'number', 'migrate fills a missing nested default')
ok(JSON.stringify(migrate(once)) === JSON.stringify(once), 'migrate is idempotent on nested state')
const full = init()
full.flame.energy = 0.37
ok(migrate(full).flame.energy === 0.37, 'migrate never transforms valid values')
```

- `src/check.ts` (merge assertions) stays unchanged. It already covers precedence and idempotency of `mergeState` itself (`check.ts:21-30`).
- State must stay plain data: numbers, strings, booleans, arrays, plain objects, `Uint8Array` for tiles. No class instances, `Map`, `Set` or DOM objects. These go into the registry.

## 6. SEED AND URL — game code, no host change

> **Superseded by [[architecture-rulings]] R-029, R-003, R-030 and [[architecture-rulings-2]] R-077:** seeds are text. `readSeed(): string | null` and `writeSeed(seed: string): void` live in `src/ui/platform.ts`; `platformStep` reads the URL once (`res.ui.urlRead`) and writes it when `meta.runId` changes; hashing is in `src/core/seed.ts`. The numeric sketch below is history.

- **Read:** `src/ui/url.ts` exports `readSeed(): number | null`. It returns `null` when `typeof location === 'undefined'` (Node checks), otherwise it parses `new URLSearchParams(location.search).get('seed')` with `Number.parseInt(v, 10) >>> 0`. Invalid input gives `null`.
- **Write:** `writeSeed(seed: number): void`, which does

```ts
export function writeSeed(seed: number): void {
  if (typeof history === 'undefined') return
  const u = new URL(location.href)
  u.searchParams.set('seed', String(seed))
  history.replaceState(history.state, '', u) // no reload, keeps other params and the hash
}
```

- **When** (game `update`, the screen transition into `playing`): the first run started from `title` uses `readSeed() ?? randomSeed()`. Every restart from `dead`/`won` uses a fresh `randomSeed()` (spec: a new seed by default). Then `writeSeed(seed)`, `s.seed = seed`, and the cave is generated. `randomSeed()` = `(Math.random() * 2 ** 32) >>> 0`. `Math.random` is only for picking the seed. The run itself uses the seeded RNG in `State`.
- These side effects run inside the step that handles the `Enter`/click edge. They run exactly once per transition, never in `init()`/`migrate`/`render`.
- **Host:** provides nothing. `location`/`history` are globals.
- **itch.io caveat:** the game runs in an iframe (`html-classic.itch.zone/...`). `replaceState` changes the iframe URL, not the itch page URL. So the end screen must SHOW the seed as text. A `?seed=` share link only works on the direct iframe URL. Accepted for the jam.
- In dev, `replaceState` does not trigger Vite reloads.

## 7. ERROR OVERLAY, R RESET, DEV-ONLY FEATURES

- **Conflict:** in dev the host consumes `KeyR` (`main.ts:73`) before the game sees it. In prod `KeyR` reaches the game. **Resolution:** the game binds nothing to `R` in any build. Restart = `Enter` (or a left click) on `dead`/`won`. Start = `Enter`/click on `title`. Pause = `Escape`/`P`. Resume = `Escape`/`P`/`Enter`. Behaviour is then identical in dev and prod, and the host stays unchanged.
- Host reset (`main.ts:65-69`) → `game.init()` → `title` screen. That is the correct dev "hard reset" for a broken nested state.
- **Error overlay** (`main.ts:133-142`): unchanged. The text "Fix game.ts and save" also applies to sub-modules, because their swap clears the error (`main.ts:155`). Its `fillStyle` and `font` do not leak, because `drawError` runs after `restore()` and sets everything it uses.
- **Superseded in part by [[architecture-rulings-2]] R-096, R-101 and [[architecture-rulings-3]] R-132, R-133:** frame times live in `res.perf.frameMs` (registry), never `debug.frameMs`; ALL dev toggles (Backquote, `Shift+Digit1..6`) are read in `src/game.ts` `update` step 1, and `render` in `game.ts` calls `drawDebug` after `renderFrame`. L0–L3 never read `import.meta.env`, not even in function bodies.
- **Debug overlay (game side):** `src/ui/debug.ts` exports `drawDebug(ctx, s, w, h)`. `render` calls it LAST behind `if (import.meta.env.DEV && getResources().debug.on)`. The toggle is `Backquote`, handled in `update` and gated by `import.meta.env.DEV`. It shows FPS (from `debug.frameMs`, the last 60 `performance.now()` deltas pushed at the start of render), the step count, `s.shades.length`, the pickup count, the seed, the zone, flame energy and the screen. Vite replaces `import.meta.env.DEV` with `false` in the build, so the branch and the module code are removed by the minifier.
- **Node checks:** `import.meta.env` is `undefined` under Node, so `import.meta.env.DEV` THROWS. Modules imported by checks (`src/core`, `src/world`, `src/entities`, `src/systems`) must not read `import.meta.env`. Dev gating lives only in `src/ui`, `src/render`, `src/audio` and `game.ts`.

## 8. INDEX.HTML / CSS / CANVAS

Current: `index.html:1-15` has the title "AI Jam 5 Game", background `#111`, `overflow: hidden`, a canvas at 100% with `touch-action: none`, and no favicon, description or noscript. The canvas is created by the host (`main.ts:43-44`) and sized to the viewport × DPR (`main.ts:48-54`). Replace the whole file with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Last Ember: carry a dying flame into a seeded cave, light the Beacon, escape alive." />
    <meta name="theme-color" content="#000000" />
    <meta name="color-scheme" content="dark" />
    <title>Last Ember</title>
    <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect width='16' height='16' fill='%23000'/%3E%3Cpath d='M8 2C10 6 13 8 11 12A3 3 0 0 1 5 12C3 9 7 7 8 2Z' fill='%23ff8a1f'/%3E%3Ccircle cx='8' cy='11' r='1.6' fill='%23fff6d8'/%3E%3C/svg%3E" />
    <style>
      html, body { margin: 0; height: 100%; overflow: hidden; background: #000; user-select: none; -webkit-user-select: none; }
      canvas { display: block; width: 100%; height: 100%; touch-action: none; outline: none; cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Cg stroke='%230a0809' stroke-width='4'%3E%3Cpath d='M16 3v8M16 21v8M3 16h8M21 16h8'/%3E%3C/g%3E%3Cg stroke='%23ff8a1e' stroke-width='2'%3E%3Cpath d='M16 4v6M16 22v6M4 16h6M22 16h6'/%3E%3C/g%3E%3C/svg%3E") 16 16, crosshair; }
      noscript { color: #ccc; font: 16px sans-serif; display: block; padding: 2em; }
    </style>
  </head>
  <body>
    <noscript>Last Ember needs JavaScript and a canvas-capable browser.</noscript>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- **Cursor:** the canvas rule carries the crosshair of [[architecture-ui]] §6 (R-097: native CSS cursor, no `ui_cursor` sprite; OD-3).
- **Background `#000`:** the unlit cave is black. Letterbox flashes before the first frame match it.
- **Favicon:** an inline SVG data URI, so there is no extra file and nothing to hash. Vite leaves `data:` alone.
- **`image-rendering: pixelated`: NOT set.** The backing store is already device-px sized (`main.ts:52-53`), so CSS scaling is 1:1 and the property has no effect. The look is procedural with gradients, where smoothing is wanted. If pixel sprites arrive, set `ctx.imageSmoothingEnabled = false` around those `drawImage` calls in render (game side).
- **itch.io:** project type HTML, "Embed in page", viewport 1280×720, "Mobile friendly" off (desktop only), fullscreen button on, "Automatically start on page load" off (a click on the itch launch button gives focus and a user gesture for audio). `overflow: hidden` prevents scrollbars. The host resizes on `resize`, so fullscreen works. **Focus:** keyboard events need the iframe focused, so the title screen text says "Click or press Enter to start". A click focuses the iframe.

## 9. VITE CONFIG — no change

- `vite.config.ts:4` `defineConfig({ base: './' })` stays. CI guards it (`ci.yml:54-55`).
- **Superseded by [[architecture-rulings-2]] R-100 (C12, C13):** sample files (`.ogg` + `.m4a`, synth fallback) are allowed; the `dist/` budget is 9 MB, not 512 KB ([[architecture-assets-pipeline-2]] §3). The procedural-only sentence and the 512 KB step below are history.
- Assets: audio is procedural (WebAudio, `src/audio`), so there are no `.ogg` files. Optional PNGs are imported as URLs (`import url from './x.png'`). Default `build.assetsInlineLimit` is 4096 bytes: smaller files are inlined as base64, larger ones are emitted to `assets/` with a hash and a relative path. Both are fine, so no override is needed. JSON imports are bundled natively.
- Types: `tsconfig.json:7` `types: ["vite/client"]` declares `*.png`, `*.ogg` and `import.meta.env`/`import.meta.hot`. It has NO `*.json` declaration: JSON imports type-check because TS 5.9 with `moduleResolution: "bundler"` implies `resolveJsonModule: true` (`tsc --showConfig`, verified). No change; add the flag only for explicitness (R-137 downgrades [[architecture-rulings]] R-045).
- Chunking: one JS chunk. No dynamic `import()` in game code, so there are no extra requests and no chunk config.
- **Size budget (CI step idea, Node built-ins only)**, after "Verify dist/index.html…" in `ci.yml`:

```yaml
      - name: Bundle size budget (512 KB)
        run: node -e "const fs=require('fs'),p=require('path');let t=0;const w=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){const q=p.join(d,e.name);e.isDirectory()?w(q):t+=fs.statSync(q).size}};w('dist');console.log('dist bytes',t);if(t>524288)process.exit(1)"
```

  `node -e` evaluates as CommonJS by default even though `package.json` has `"type": "module"`, so `require` works. It is not part of `tsc`, so `@types/node` is not needed. The step is optional; adopting it is a CI change for `@git-manager`'s PR flow.

## 10. CI IMPACT AND CHECK SCRIPT

Must stay true: job name `ci` unchanged (`ci.yml:30-31`). No new dependencies (`package.json:16-19`). `npm run check` uses only Node ≥ 22.18 type stripping and finishes in < 30 s, with a target < 15 s (typical ≈ 9 s, worst ≈ 16 s at 320×240; bounded loops, never thousands of generations; [[architecture-scale-and-economy-4]] §1.10). `npm run build` = `tsc --noEmit && vite build` passes. `dist/index.html` contains `./assets/`.

**Script change (`package.json:10`)** — the original side-effect-import design is **superseded by [[architecture-rulings]] R-040** (binding):

```json
    "check": "node src/check.ts && node src/checks/all.ts && node scripts/check-assets.ts && node scripts/check-guard.ts",
```

- **No glob:** `node a.ts b.ts` would run only `a.ts` and pass `b.ts` as argv, so a shell glob silently skips files. `&&` works in POSIX `sh` (npm on Linux) and `cmd`.
- Each `src/checks/*.check.ts` exports `run(): void`, has no side effect on import and throws on failure (the `ok()` pattern from `check.ts:4-6`). `src/checks/all.ts` imports every `run` and calls them in order:

```ts
// Runs every pure-logic check. Add one import + one call per new *.check.ts file.
import { run as state } from './state.check.ts'
import { run as determinism } from './determinism.check.ts'
import { run as cave } from './cave.check.ts'
state()
determinism()
cave()
console.log('checks ok')
```

  A list instead of `readdirSync` discovery, because `tsc` type-checks `src/` with only `vite/client` types and no `node:` import is allowed under `src/` (R-039). File-system work (asset check, determinism grep guard) lives in `scripts/` outside the tsconfig `include`.
- The list must be kept in sync by hand. Ceiling: a forgotten import silently skips a check. Upgrade path: `scripts/check-guard.ts` may assert that every `src/checks/*.check.ts` appears in `all.ts`.
- Check files and everything they import: no DOM, no `import.meta.env`, no asset imports, `.ts` extension on imports, erasable syntax only (already enforced by `tsconfig.json:13`).

## 11. SUMMARY

| File | Change | Lines (net) | Risk |
|---|---|---|---|
| `src/main.ts` | `Input.view = { w, h, dpr }` field + init literal + 3 lines in `resize` (R-131) | +5 | low |
| `src/main.ts` | `pointerdown` primary-only; `pointermove` sets `down = (e.buttons & 1) !== 0`, `pointerup` unchanged (R-135) | +2 | low |
| `src/main.ts` | `contextmenu` preventDefault | +1 | low |
| `src/main.ts` | `lostFocus()` + `visibilitychange`, `'Blur'` pseudo-edge | +6 | low |
| `src/main.ts` | `STEP_BUDGET_MS = 12` wall-time bailout in the step loop (§12), **REQUIRES OWNER APPROVAL** | +3 | low |
| `index.html` | title, meta, inline SVG favicon, `#000`, noscript, user-select, crosshair cursor | +6 | low |
| `package.json` | `check` script per R-040 (`all.ts`, `check-assets.ts`, `check-guard.ts`) | 0 | low |
| `.github/workflows/ci.yml` | optional size-budget step | +2 | low |
| `src/merge.ts` | none | 0 | — |
| `vite.config.ts` | none | 0 | — |

`main.ts` grows from 170 to about 186 lines. The `update` call is unchanged. Implementation is one PR, tier **medium** (host file, 3–4 files).

**Does NOT change:** `render(ctx, s, w, h)`, `update(s, input, dt)`, `init()`, optional `migrate` signatures. `STEP` and `MAX_FRAME` (the loop gains the §12 bailout). DPR handling and `setTransform`. The `save/restore` around render. `accept('./game.ts')`, the self-accept and the dispose handler. Dev `KeyR` reset. The error overlay. `mergeState` and `src/check.ts`. `vite.config.ts` and `base: './'`. `tsconfig.json`. Dependencies. CI job name and steps (except the optional budget step).

**Game-side contracts created here** (not host): `src/assets/resources.ts` registry, `'Blur'` → `paused`, no `R` binding, `Enter` restart, `src/ui/platform.ts` seed (R-003, R-029), `src/checks/all.ts` (R-040), DOM-free and `import.meta.env`-free logic folders, an import DAG with no cycles.

## 12. STEP-TIME BAILOUT — REQUIRES OWNER APPROVAL (`main.ts` edit)

Binding rule: [[architecture-scale-and-economy-4]] §1.8. Why: at 320×240 one cave-generation attempt costs ≈ 55 ms (chunked, one attempt per `update`). `MAX_FRAME = 0.25` still allows 15 catch-up steps, so a run of failed attempts would freeze one frame for ≈ 825 ms. `main.ts` is the stable host (AGENTS.md "Golden rule"), so this change needs explicit owner approval before `@build` applies it.

Rule code (verbatim from the ruling):

```ts
const STEP_BUDGET_MS = 12 // ponytail: wall-time bailout; per-system time slicing if a normal step ever nears it
// inside frame(), around the existing while (acc >= STEP) loop
const t0 = performance.now()
while (acc >= STEP) {
  game.update(state, input, STEP); acc -= STEP
  if (performance.now() - t0 > STEP_BUDGET_MS) { acc = 0; break }   // drop the backlog, never spiral
}
```

Applied to the real loop (`main.ts:110-119`, constant next to `STEP`/`MAX_FRAME` at `main.ts:21`; re-check the lines first):

```diff
+const STEP_BUDGET_MS = 12 // ponytail: wall-time bailout; per-system time slicing if a normal step ever nears it
 ...
+  const t0 = performance.now()
   while (acc >= STEP) {
     acc -= STEP
     try {
       game.update(state, input, STEP)
     } catch (e) {
       fail('update', e)
     }
     input.pressed.clear()
     input.clicks.length = 0
+    if (performance.now() - t0 > STEP_BUDGET_MS) { acc = 0; break } // drop the backlog, never spiral
   }
```

The bailout sits after the input clear, so a dropped backlog never replays an edge. `acc -= STEP` stays before `update` as in the current host (same result as the ruling's order).

- `MAX_FRAME = 0.25` and `dt = STEP` stay. Cheap steps still run up to 15 per frame (15 × 0.3 ms AI ≈ 4.5 ms < 12 ms), so it never triggers in normal play.
- During generation one attempt (≥ 30 ms on any machine) exceeds 12 ms, so **exactly one attempt per frame**. The loading screen renders between attempts at ≈ 13–18 fps.
- Determinism: unaffected. The simulation is step-counted; only wall-time backlog is dropped. The score uses `meta.steps`.
- After the last attempt the next frame carries ≈ 80 ms backlog → ≤ 5 catch-up `playing` steps (0.08 s). Accepted.

### Effect

`npm run check`: none (`main.ts` is not imported by checks). Build: `tsc` passes, no new types. HMR: none (a `main.ts` edit self-accepts; no new listener, no new module state beyond the existing `acc`). `main.ts` +3 lines.

## Related

- [[architecture-host-changes]]
- [[architecture]]
- [[architecture-state]]
- [[index]]
- [[last-ember-design]]
- [[vite-canvas-hmr-state-preservation]]
- [[architecture-scale-and-economy-4]]
- [[architecture-rulings]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]
- [[architecture-ui]]
- [[architecture-assets-pipeline-2]]
