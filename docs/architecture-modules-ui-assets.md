---
type: architecture
title: Last Ember – Module Tree – UI, Assets, Host, Tooling
description: Authoritative file list (part 1/2) for the UI, assets and facade areas of Last Ember – layer placement, the src/game.ts facade, every src/ui and src/assets file with exported signatures copied from the specs, allowed imports, spec section, line estimate and delivery slice. Part 2 covers host, tooling, package scripts, check wiring, asset folders and the conflict table.
tags: [project, ai-jam-5, architecture, last-ember, modules]
timestamp: 2026-10-17T22:30:00Z
---

# Last Ember – Module Tree: UI, Assets, Host, Tooling (1/2)

Part 2: [[architecture-modules-ui-assets-2]] (host and tooling table, `package.json` scripts, check wiring, asset folders, conflicts and gaps). Siblings: [[architecture-modules-core]], [[architecture-modules-world]], [[architecture-modules-systems]], [[architecture-modules-render]]. Hub: [[architecture]], [[index]]. Product spec: [[last-ember-design]].

Sources (this file copies, never invents): [[architecture-ui]], [[architecture-ui-2]], [[architecture-assets-pipeline]], [[architecture-assets-pipeline-2]], [[architecture-host-changes]], [[architecture-host-changes-2]], [[architecture-resources]] §0–3, §5, §7. Repo read 2026-10-17: `src/main.ts` 170 lines, `src/game.ts` 74 lines (template), `src/merge.ts` 16, `src/check.ts` 32.

Conflict ids `C1`…`C18` and gap ids `G1`…`G8` are defined in [[architecture-modules-ui-assets-2]] §5. Where a cell says "signature not in specs", the spec gives only the name; the implementer picks the signature and records it back in the owning spec. That is a gap, not an invention.

## 0. Layer rule (global, applies to every file below)

```
L0 src/core
L1 src/world, src/assets (data-only registry and manifests)
L2 src/entities
L3 src/systems
L4 src/render, src/audio, src/ui
L5 src/game.ts (facade)
host: src/main.ts, src/merge.ts  (game code: `import type` from main.ts only)
```

- Imports go only to lower layers or the same layer. No cycles.
- `src/checks/*` import L0–L3 only. They never touch `document`, `window` or `import.meta.env` at import time. Node ≥ 22.18 type stripping: `.ts` extensions, no `enum`, no parameter properties.
- Same-layer rule inside L4 (cycle guard): the render frame module imports `src/ui/hud.ts`, `menus.ts`, `debug.ts`. `src/ui` imports only render LEAF helpers (`toScreen`, `makeView`, [[architecture-render]] §4.2), never the render frame module.
- Specs that imply otherwise are flagged: `images.ts` and `placeholders-*.ts` are runtime drawing code in L1 (C9); `resources.ts` importing `../audio/engine.ts` (C8); checks importing `src/ui/layout.ts`, `src/render/noise.ts`, `src/audio/trigger.ts` (C6); systems writing toasts through a `src/ui` helper (C11).

## 1. `src/game.ts` – the facade (L5, EDIT)

Replaces the template body completely (template `State`, `init`, `update`, `render` at `game.ts:6-74` go away). Spec: [[architecture-host-changes]] §1, §4; [[architecture-host-changes-2]] §5, §7; [[architecture-resources]] §3, §5; [[architecture-ui]] §5.

| Export | Signature | Body (order matters) |
|---|---|---|
| `State` | `export type { State } from './core/state.ts'` | `main.ts:4` needs `import type { State } from './game.ts'` |
| `init` | `init(): State` | re-export from `src/core/state.ts`. Cheap and pure: `title` screen, empty world, no cave generation ([[architecture-host-changes-2]] §5) |
| `migrate` | `migrate(old: unknown): State` | re-export from `src/core/state.ts`. Idempotent, fills nested defaults only |
| `update` | `update(s: State, input: Input, dt: number): void` | **Binding: [[architecture-rulings-2]] R-096, extended by [[architecture-rulings-3]] R-133.** 1. dev only (`import.meta.env.DEV`): ALL dev-key toggles live here – `Backquote` toggles `getResources().debug.on`, `Shift+Digit1..6` the debug flags (R-132). 2. `step(s, input, dt)` from `src/systems/step.ts` (runs `stepScreens` first, world systems only when `playing`). 3. `platformStep(s)` (`src/ui/platform.ts`, R-003). 4. `try { audioStep(s, input) } catch (e) { warnOnce(e) }`. |
| `render` | `render(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void` | 1. `renderFrame` (`src/render/index.ts`; it calls `startPreload(res)` itself, R-095; HUD is pass 20–21). 2. `drawDebug(ctx, s, w, h)` LAST behind `if (import.meta.env.DEV && getResources().debug.on)` (R-096) |

- Imports: `import type { Input } from './main.ts'` (type only), `src/core/state.ts`, `src/systems/step.ts`, `src/ui/platform.ts`, `src/ui/debug.ts`, the render frame, the audio step, `src/assets/resources.ts`, `src/assets/images.ts`.
- Forbidden: module-level state, listeners, timers, `import.meta.hot` (no `accept` outside `main.ts`, [[architecture-host-changes-2]] §4).
- Checks never import `game.ts`.
- About 60 lines. Owner: facade/integration. Slice **A**.

## 2. `src/ui/` (L4)

All files are NEW. Allowed imports for every `src/ui` file: L0–L3, `src/assets/sprites.ts`, `sounds.ts`, `resources.ts` (L1), `images.ts` and `placeholders-*.ts` (path in L1, ranked L4 per C9), render leaf helpers (§0), other `src/ui` files without cycles, and `import type { Input } from '../main.ts'`. No DOM listeners and no `document` access in any UI file ([[architecture-ui]] §1, [[architecture-resources]] §5).

| File | Responsibility | Exports (signatures as in the specs) | Spec | Lines | Slice |
|---|---|---|---|---|---|
| `layout.ts` | Reference 1280×720, half-step scale, anchors, all screen rects, hit-testing. DOM-free. Update and render call the same `*Layout` ([[architecture-ui]] §3) | `type Rect = { x: number; y: number; w: number; h: number }`; `type Button = Rect & { id: string; enabled: boolean }`; `uiScale(w: number, h: number): number`; `place(w: number, h: number, u: number, ax: number, ay: number, x: number, y: number, bw: number, bh: number): Rect`; `hit(bs: readonly Button[], x: number, y: number): number`; `titleLayout`, `helpLayout`, `pauseLayout`, `endLayout`, `hudLayout` called as `*Layout(w, h, s)`, return type not in specs (G1) | [[architecture-ui]] §2–3, §7–8; [[architecture-ui-2]] §1–3 | ~200 | A (title, pause, hud), B (help, end) |
| `strings.ts` | All English text and help data. Data only | `STR` (incl. `STR.tagline`), `HELP` (`HELP[0].controls`, `HELP[2].minerals`), shapes not in specs (G1) | [[architecture-ui]] §2, §8; [[architecture-ui-2]] §7 | ~150 | A (STR), B (HELP) |
| ~~`screens.ts`~~ → `platform.ts` | **Superseded by [[architecture-rulings]] R-003.** The pure screen machine is `stepScreens(s, input): boolean` in `src/systems/screens.ts` (L3). `src/ui/platform.ts` keeps only DOM effects: clipboard write on `copyLink`, `?seed` read once (`res.ui.urlRead`, R-077) and write on `meta.runId` change, `res.ui.copyResult` → `ui.copyMsg`. Absorbs `url.ts` | `platformStep(s: State): void`; `readSeed(): string \| null`; `writeSeed(seed: string): void` (R-029) | [[architecture-ui]] §2; [[architecture-ui-2]] §3 | ~80 | A (URL), B (copy link) |
| `draw.ts` | Text with 1u shadow, panel, button styles (focused, hover, disabled, ember ticks), keycap, hold ring, font stack | `text`, `panel`, `button`, `keycap`, `ring` (signatures not in specs, G1); `FONT = 'ui-monospace, "Cascadia Mono", "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace'` | [[architecture-ui]] §2, §4, §7 | ~120 | A |
| `menus.ts` | Draws title (key art or procedural backdrop, logo, loading bar, buttons, seed box, best, sound hint, storage warning), the `Carving the cave…` loading view while `ui.genPending !== ''` (spinner, debug `attempt n/8`; [[architecture-scale-and-economy-4]] §1.9, input handling in `screens.ts`: Escape cancels, rest ignored), help pages 0–2 incl. the timing ring, paused, dead and won with score count-up | `drawScreen(ctx, s, w, h)` | [[architecture-ui]] §2, §7–8; [[architecture-ui-2]] §2–3, §5 | ~280; split point `menus-end.ts` (dead/won) when it passes 300, per spec | A (title text-only, paused, minimal dead/won), B (help, full end screen), C (fades, logo breathe) |
| `hud.ts` | Playing HUD: toasts, HP pips, hotbar, active flame, depth and zone, run clock, E prompt with hold ring, exit marker, `RUN!` banner, PERFECT/GOOD/POOR text | `drawHud(ctx, s, w, h)` | [[architecture-ui-2]] §1, §1.1, §5 | ~250 | A (HP, hotbar, flame, depth, prompt), B (exit marker, toasts, parry text), C (pip shake, deny shake, pulses) |
| `debug.ts` | Dev overlay: FPS, steps, shade count, pickups, seed, zone, flame energy, screen | `drawDebug(ctx, s, w, h)` | [[architecture-ui]] §2; [[architecture-host-changes-2]] §7; [[architecture-render-3]] §8 | ~80 | C |
| ~~`url.ts`~~, ~~`storage.ts`~~ | Not created: URL handling is in `platform.ts` (R-003, R-029); storage is `src/core/storage.ts` (L0, R-005; `SettingsRecord` adds `quality`, R-142) | – | – | – | – |

Notes:

- Cursor: native CSS crosshair in `index.html`, no canvas cursor. `ui_cursor` sprite dropped (C1).
- Buttons activate on press edges. There is no `released` set (C2).
- Toasts are drawn by `hud.ts`. Systems write them with `toast(s, text)`, and that helper cannot live in `src/ui` (C11).
- Clipboard: `navigator.clipboard?.writeText(shareText)` inside `platformStep` when `stepScreens` emitted `copyLink`. The promise result goes to `res.ui.copyResult`, never into State from a callback ([[architecture-ui-2]] §3; R-003 supersedes C7).

## 3. `src/assets/` (L1)

| File | NEW / GEN | Responsibility | Exports (copied) | Allowed imports | Spec | Lines | Slice |
|---|---|---|---|---|---|---|---|
| `resources.ts` | NEW | Non-serialised registry kept in `import.meta.hot.data`. Data only, no functions in the registry. Created on first use. No `hot.dispose` | types `Canvas2D`, `ImageStore`, `TileCache`, `MemoryCache`, `LightCache`, `Particles`, `Perf`, `AudioRes`, `Voice`, `MusicRes`, `Resources`; `const RES_VERSION = 1`; `getResources(): Resources` (internal `fillRes`, `makeRes(ctx)`, `releaseRes(r)`) | `import type` from `./sprites.ts`, `./sounds.ts` only (C8) | [[architecture-resources]] §2–3 | ~150 | A |
| `sprites.ts` | NEW | Sprite manifest. DOM-free and Node-runnable (scripts import it) | `type Anim`, `type SpriteDef`, `SPRITES` (`as const satisfies Record<string, SpriteDef>`, catalog ids as quoted keys), `type SpriteId = keyof typeof SPRITES`, `SCREENS = { keyart: 'title-keyart', logo: 'logo', helpParry: 'help-parry', helpGoal: 'help-goal' } as const` | none | [[architecture-assets-pipeline]] §3.1 | ~200; split into `sprites-actors.ts` / `sprites-world.ts` past 300 | A |
| `sounds.ts` | NEW | Sound manifest. DOM-free and Node-runnable | `type Group = 'music' \| 'amb' \| 'sfx' \| 'ui'`, `type SoundDef`, `SOUNDS` (43 entries after R-138), `type SoundId = keyof typeof SOUNDS`, `PENDING_AUDIO` allow-list (empty by Day 11) | none | [[architecture-assets-pipeline]] §3.2; [[architecture-assets-pipeline-2]] §2 #5 | ~120 | A |
| `placeholders-actors.ts` | NEW | `DrawFn` per `player_*`, `mon_*` | `ACTORS: Record<Extract<SpriteId, \`player_${string}\` \| \`mon_${string}\`>, DrawFn>` | `./sprites.ts` (type), `./placeholders-ui.ts` (type `DrawFn` only), L0 | [[architecture-assets-pipeline]] §3.3 | ~200 | A |
| `placeholders-world.ts` | NEW | `DrawFn` per `tile_*`, `spec_*`, `fx_*`, `prop_*`; `spec_chamber` is an explicit no-op | `WORLD` (same `Extract` pattern) | same | same | ~250 | A |
| `placeholders-ui.ts` | NEW | `DrawFn` per `item_*`, `ui_*`; merges all three | `type DrawFn = (ctx: CanvasRenderingContext2D, anim: string, frame: number, t: number) => void`; `UI`; `PLACEHOLDERS: Record<SpriteId, DrawFn> = { ...ACTORS, ...WORLD, ...UI }` | same + the two files above | same | ~150 | A |
| `images.ts` | NEW | Atlas and screen loading, per-frame rect resolution, tint LRU, `drawSprite`. `?ph=1` forces placeholders | `drawSprite(ctx, id, anim, frame, x, y, angle, scale, alpha)`; `startPreload(res)` | `./atlas.json`, `./sprites.ts`, `./placeholders-ui.ts`, `./resources.ts`, `import.meta.glob` | [[architecture-assets-pipeline]] §5–6, §8; [[architecture-resources]] §4, §6 | ~200 | A (placeholders only), B (atlas + screens) |
| `atlas.json` | GEN | Frame rects + source hash. 300-line exception #1/#2 | – | – | [[architecture-assets-pipeline]] §4 | ~622 (616 frames, R-154) | A (empty seed file, G3), B (real) |
| `atlas-0.png` (`atlas-1.png`) | GEN | Packed sheets, ≤ 1024², max 4 (R-154) | – | – | [[architecture-assets-pipeline-2]] §1 | binary | B |

- **Not in `src/assets/`:** `audio.ts`, `synth.ts`, `synth-2.ts` move to `src/audio/{engine,mixer,synth,synth-2,music,sfx}.ts` ([[architecture-resources]] §0, C10). Owned by the render/audio module list [[architecture-modules-render]].
- **Glob mechanism** ([[architecture-assets-pipeline]] §5): `import.meta.glob('./atlas-*.png' | './art/*.png' | './audio/*.{ogg,m4a}', { eager: true, query: '?url', import: 'default' })`. A missing file is just absent from the map, so undelivered art never breaks the build. `atlas.json` is a static import and must exist (G3).
- Checks may import only `sprites.ts`, `sounds.ts` and type-only `resources.ts`. Never `images.ts` or the placeholder files: `import.meta.glob` is Vite-only ([[architecture-resources]] §7).

## Related

- [[architecture-modules-ui-assets-2]]
- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-modules-core]]
- [[architecture-modules-world]]
- [[architecture-modules-systems]]
- [[architecture-modules-render]]
- [[architecture-ui]]
- [[architecture-ui-2]]
- [[architecture-assets-pipeline]]
- [[architecture-assets-pipeline-2]]
- [[architecture-host-changes]]
- [[architecture-host-changes-2]]
- [[architecture-resources]]
- [[architecture-resources-2]]
- [[architecture-render]]
- [[architecture-render-3]]
- [[architecture-scoring-and-save]]
- [[architecture-rulings]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]
