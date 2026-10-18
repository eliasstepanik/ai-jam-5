---
type: architecture
title: Last Ember – Module Tree – Render and Audio
description: Authoritative src/ file list for the render and audio areas of Last Ember (src/render/*, src/audio/*) – per file path, NEW/EDIT, responsibility, exported signatures copied from the specs, allowed imports under the global layer rule, spec section, size, owner, slice tag and the cross-area seams. Part 1 of 2; checks, State additions and conflicts are in part 2.
tags: [project, ai-jam-5, architecture, last-ember, modules]
timestamp: 2026-10-17T22:30:00Z
---

# Last Ember – Module Tree: Render and Audio (1/2)

Part 1 of 2. Part 2: [[architecture-modules-render-2]] (audio files, checks, State additions, conflicts and gaps). Sibling trees: [[architecture-modules-core]], [[architecture-modules-world]], [[architecture-modules-systems]], [[architecture-modules-ui-assets]]. Hub: [[architecture]], [[index]]. Spec (governs): [[last-ember-design]].

Sources (only these were read): [[architecture-render]], [[architecture-render-2]], [[architecture-render-3]], [[architecture-resources]], [[architecture-resources-2]], [[architecture-resources-3]], [[architecture-assets-audio]], [[architecture-assets-audio-2]]. Specs cited by those files but not read here (State, UI, host, pipeline) are referenced, not verified: every field marked "(verify)" must be confirmed by the owning sibling tree.

**Mode:** brownfield-extension. All `src/render/*` and `src/audio/*` files are NEW (the repo today has only `src/main.ts`, `src/game.ts`, `src/merge.ts`, `src/check.ts`). Where this tree differs from a spec, the row says **CONFLICT Cn** or **GAP Gn**; resolution in [[architecture-modules-render-2]] §5.

## 1. Layer rule (global, binding)

```
L0 src/core
L1 src/world, src/assets
L2 src/entities
L3 src/systems
L4 src/render, src/audio, src/ui
L5 src/game.ts (facade)
host: src/main.ts, src/merge.ts  (other modules: `import type` from main.ts only)
```

- A module imports only from lower layers or its own layer, without cycles.
- render, audio and ui do not import each other, except through the seams in §2.
- Render is PURE with respect to State: it never writes a field of `s`, never calls `rand(s, …)`, never uses `Math.random` ([[architecture-render]] §1). It MAY mutate non-State resources held in `getResources()`.
- `src/assets/resources.ts` is the only holder of non-serialised resources (canvases, caches, particle pool, perf ring, AudioContext, nodes, buffers) ([[architecture-resources]] §1–2).
- Modules imported by checks must not touch `document`, `window`, `navigator`, `localStorage`, `AudioContext`, `Image`, `import.meta.env` or `import.meta.glob` at import time ([[architecture-resources]] §7).
- Zoom is a whole number of DEVICE pixels per world pixel: `z = deviceZoom(ch) = max(1, round(ch / 480))`. Update uses the same value in CSS px, `viewZoomCss(h, dpr) = deviceZoom(Math.round(h * dpr)) / dpr` with `dpr` from `Input.view` ([[architecture-render]] §4.1; R-084, R-131 in [[architecture-rulings-3]]). The old fractional host formula is gone.

## 2. Cross-area seams (the only allowed edges between L4 areas)

| Seam | Direction | Contract | Source |
|---|---|---|---|
| S1 HUD pass | render → ui | `render/index.ts` calls `drawHud(ctx, s, w, h)` (pass 20), `drawScreen(ctx, s, w, h)` (`src/ui/menus.ts`, passes 1, 21, R-094). `drawDebug` is called by the `src/game.ts` facade after `renderFrame`, not by render (R-096). ui never imports the render frame module. | [[architecture-render]] §2–3 |
| S2 fx events, render side | systems → State → render | `render/particles.ts` reads `s.fx.events` by `seq`; cursor `res.particles.lastSeq` (registry, not State) | [[architecture-render-2]] §4.1 |
| S3 fx events, audio side | systems → State → audio | `audio/engine.ts` reads `s.fx.events` by `seq`; cursor `res.audio.lastSeq`; independent of S2 (two cursors, no render↔audio edge) | [[architecture-resources-2]] §8 |
| S4 audio call site | game.ts → audio | facade per R-096 (+ R-133): dev toggles, `step`, `platformStep`, then `try { audioStep(s, input) } catch (e) { warnOnce(e) }`; audio never runs from render | [[architecture-resources-2]] §1 |
| S5 visibility | render, audio → systems | `insideLight` (R-083; older text `inLight`), `lightSources`, `lightRadius` from `src/systems/light.ts` (DOM-free). Render never re-derives a radius | [[architecture-render]] §1 rule 3 |
| S6 sound hint | ui → registry | title `Click for sound` reads `getResources().audio.state` (registry, L1); ui does not import audio | [[architecture-resources-2]] §2.5 |
| S7 sprites | render → assets | `drawSprite`, `spriteReady`, `startPreload` from `src/assets/images.ts` (assets sibling file) | [[architecture-render-3]] §5 |
| S8 dprCap | render → host | `quality.ts` writes `globalThis.__lastEmberDprCap`; host reads it only after an approved 1-line `main.ts` change (open question Q1) | [[architecture-render-3]] §3.2 |

Shared pure helpers `hash2`, `vnoise`, `quantAngle` move to `src/core/noise.ts` (L0). Reason: `src/assets/images.ts` (L1) and `src/audio/sfx.ts` (L4) both need them; importing them from `src/render/noise.ts` breaks the layer rule and the render↔audio rule (**CONFLICT C2**).

## 3. Render files (`src/render/`)

Abbreviations: `ctx` = `CanvasRenderingContext2D`, `s` = `State`, `v` = `View`, `q` = `Quality`. Exports without a parameter list in the spec are written as the spec uses them in code (the `render/index.ts` sketch, [[architecture-render]] §3).

| Path | N/E | Responsibility | Exported symbols (signatures from spec) | Allowed imports | Spec | Lines | Owner | Slice |
|---|---|---|---|---|---|---|---|---|
| `src/render/index.ts` | NEW | frame orchestrator, passes 0–23 in fixed order; resets composite/alpha before HUD | `render(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void` (re-exported by `src/game.ts`) | all `src/render/*`; `src/ui/hud.ts` `drawHud`, `src/ui/menus.ts` `drawScreen` (S1); `src/assets/resources.ts` `getResources`; `src/assets/images.ts` `startPreload` (G2); core types | [[architecture-render]] §3 | ~130 | render | A |
| `src/render/view.ts` | NEW | camera transform, integer device zoom, pixel snap, culling rect, shake offset | `type View`; `makeView(ctx, s, w, h): View`; `worldXf(ctx, v): void`; `screenXf(ctx, v)`; `toScreen(v, x, y): [number, number]` (`shakeOffset` is NOT here: one `shakeOffset(s): { x, y }` in `src/systems/camera.ts`, R-017); GAP G3: `inView(v, x, y): boolean`, `beaconBlend(s: State): number` | `src/core/*` (State type, `TILE`, `src/core/view.ts` `deviceZoom`), `src/systems/camera.ts` `shakeOffset`, `src/render/keys.ts` | [[architecture-render]] §4.2–4.4; [[architecture-render-3]] §2 | ~90 | render | A |
| `src/render/keys.ts` | NEW (GAP G4) | pure, DOM-free numbers and cache keys (browser-verified; checks cover only `src/core/view.ts`, R-043) | `VIEW_H_DEV`, `deviceZoom` are imported from `src/core/view.ts` (R-018), not defined here; `LIGHT_VERSION`; `bucketOf(d: number, buckets: readonly number[]): number`; `maskKey(kind, b)`, `glowKey(hex, b)`, `vigKey(hex, w, h)`, `tileKey(tilesHash, gen)`, `chunkKey(cx, cy)`; `variantOf(h: number): number` (16-way hash → 0/1/2/3) | `src/core/*` types only | formulas from [[architecture-render]] §4.2, [[architecture-render-2]] §2.1–2.2, §5.4; key format from [[architecture-resources]] §2–3.1 | ~50 | render | A |
| `src/render/tiles.ts` | NEW | derived tile maps (zone, mask, inner, variant), 8×8 chunk cache with LRU 40 and build quota 4, `CHUNKS_W = ceil(w/8)` (key `cx + cy * CHUNKS_W`), direct-paint fallback | `drawTiles(ctx, s, v, q): void` (**CONFLICT C3**: map says 3 args) | `view.ts`, `keys.ts`, `quality.ts` (type), `src/assets/images.ts` `drawSprite`, `src/assets/sprites.ts` ids/`PLACEHOLDERS`, `src/assets/resources.ts`, `src/world/*` (`zoneOfDepth`, `depthOf` (verify)), core | [[architecture-render-2]] §2 | ~190 | render | A (placeholder tiles), C (atlas swap is automatic via `images.gen` in the key) |
| `src/render/memory.ts` | NEW | 320×240 (`w×h`) memory canvas, per-word diff of `world.explored` (`Int32Array(2400)` copy), dirty-rect upload `putImageData(buf, 0, 0, dx, dy, dw, dh)` ([[architecture-scale-and-economy-4]] §1.3) | `memoryCanvas(s: State)` (used by `drawDarkness`) **CONFLICT C4** vs map `drawMemory(dctx, s, v, q)` | `src/assets/resources.ts`, `tiles.ts` (zone map via `res.tiles`), core | [[architecture-render-2]] §5.2; [[architecture-render]] §2 | ~110 | render | A |
| `src/render/light.ts` | NEW | darkness canvas (resize in place), memory blit, `destination-out` mask stamps, flicker, flame-out ember stamp, mask sprite cache | `drawDarkness(ctx, s, v, q): void`; `type MaskStamp = (c, L, v, r, s) => void`; `stampRadial: MaskStamp` | `view.ts`, `keys.ts`, `memory.ts`, `quality.ts` (type), `src/systems/light.ts` `lightSources`, `lightRadius`; `src/systems/flame.ts` `FLAME` (`flickerFreq`); `src/core/noise.ts` `vnoise`; registry | [[architecture-render-2]] §5.1, §5.3–5.6; [[architecture-render-3]] §7 | ~170 | render | A |
| `src/render/glow.ts` | NEW (split, **CONFLICT C5**) | pass 16 lone eyes and pass 17 additive glow; glow sprite cache `'g:'` keys | `drawEyes(ctx, s, v): void` (moved from entities); `drawGlow(ctx, s, v, q): void` (map lists it in light.ts); `drawGlowSprite(ctx, …)` (**CONFLICT C6**: spec calls `drawGlowSprite(ctx, 'eye', x, y, r, a)`) | `view.ts`, `keys.ts`, `flame.ts`, `entities.ts` (`torchTip`, `monsterAngle`, `eyeAnim`, `eyeAlpha`), `src/systems/light.ts` `inLight`, `lightRadius`; `src/assets/images.ts` `drawSprite`; `src/core/noise.ts` `vnoise`; registry | [[architecture-render-2]] §3.2; [[architecture-render-3]] §1 | ~180 | render | A (flame core + mantle, eyes), B (fringe, wash, pickup and vein glints, Beacon fire, shaft, ember, swing arc) |
| `src/render/flame.ts` | NEW (GAP G5: not in map) | flame colour table; gameplay `radiusMul`/`flickerFreq` stay in systems | `FLAME_COL: Record<FlameKind, { core, mantle, fringe, spark }>` | core types only (pure) | [[architecture-render-3]] §1 | ~25 | render | A |
| `src/render/entities.ts` | NEW | monsters FULL (pass 10, `inLight` only), player body + torch + hit-flash tint (pass 11); frame/angle helpers | `drawMonsters(ctx, s, v)`; `drawPlayer(ctx, s, v)`; `torchTip(s)`; helpers exported for glow.ts: `monsterFrame(s, m)`, `monsterAngle(s, m)`, `eyeAnim(m)`, `eyeAlpha(s, m)` (names from spec code; parameter types per State spec (verify)) | `view.ts`, `src/assets/images.ts` `drawSprite`, `src/assets/sprites.ts`, `src/systems/light.ts` `inLight`, `src/core/noise.ts` `hash2`, core | [[architecture-render-2]] §3.2–3.3 | ~200 | render | A |
| `src/render/props.ts` | NEW (split, C5) | veins (pass 7), pickups with bob (8), Beacon + entrance (9), rocks telegraph/falling/landed (12) | `drawVeins(ctx, s, v)`; `drawPickups(ctx, s, v)`; `drawLandmarks(ctx, s, v)` (**GAP G6**: in sketch, not in map); `drawRocks(ctx, s, v)` | `view.ts`, `src/assets/images.ts` `drawSprite`, `src/assets/sprites.ts`, core | [[architecture-render-2]] §3.1, §3.4 | ~130 | render | A (veins, pickups, landmarks), B (rocks) |
| `src/render/particles.ts` | NEW | analytic typed-array pool `P_MAX = 512`, event→particle table, bucketed draw per pass | `consumeEvents(s: State): void`; `drawParticles(ctx, s, v, pass: 'normal' \| 'add'): void` | `view.ts`, `quality.ts` (`currentQuality`), `flame.ts`, `src/core/noise.ts` `hash2`, registry, core | [[architecture-render-2]] §4 | ~200 | render | B (core events), C (full table, polish) |
| `src/render/overlay.ts` | NEW | Beacon-lit multiply (pass 15), white-out, damage flash, vignettes, flare (pass 19); vignette sprite cache | `drawBeaconMode(ctx, s, v)`; `drawFlashes(ctx, s, v, q)`; `drawVignettes(ctx, s, v, q)`; GAP G7: escape marker draw | `view.ts` (`beaconBlend`), `keys.ts`, registry, core | [[architecture-render-3]] §2, §4 | ~150 | render | B |
| `src/render/quality.ts` | NEW | quality table, override from `settings.quality`, perf ring, pass marks, auto ladder with cool-down, dprCap global | `type Quality`; `QUALITY: readonly Quality[]`; `frameBegin(): void`; `passMark(name: string): void`; `currentQuality(s: State): Quality`; `qualityTick(s)` (**GAP G8**: in sketch, not in map) | registry, core | [[architecture-render-3]] §3.2–3.3; [[architecture-render]] §2 | ~120 | render | A (table + override + marks), C (auto ladder, dprCap) |
| `src/render/occlusion.ts` | STRETCH, not created | wall-shadow raycast stamp `stampOccluded`; needs a matching LOS `inLight` in systems | not in the core build (no stub file) | – | [[architecture-render-3]] §7 | – | render+systems | post-jam |
| ~~`src/render/noise.ts`~~ | moved | becomes `src/core/noise.ts` (core sibling owns it) | `hash2(x, y, salt): number`; `vnoise(t, salt): number`; `quantAngle(a): number` | none | [[architecture-render-2]] §1 | ~40 | core | A |

Render-adjacent files owned by siblings (listed so the seam is explicit):

| Path | Owner tree | Used by render for | Spec |
|---|---|---|---|
| `src/assets/images.ts` | [[architecture-modules-ui-assets]] | `drawSprite(ctx, id, anim, frame, x, y, rot = 0, scale = 1, alpha = 1, tint = null): void`, `spriteReady(id)`, `startPreload(res)`, `frameAt(id, anim, t)` | [[architecture-render-3]] §5; [[architecture-resources]] §6 |
| `src/assets/resources.ts` | [[architecture-modules-ui-assets]] | `getResources(): Resources`, types `Resources`, `TileCache`, `MemoryCache`, `LightCache`, `Particles`, `Perf`, `Canvas2D` | [[architecture-resources]] §2–3 |
| `src/systems/light.ts` | [[architecture-modules-systems]] | `insideLight(s, x, y, pad = 0)` (R-083), `lightSources(s)` → `{ x, y, r, kind }[]`, `lightRadius(s)` | [[architecture-render-2]] §5.6 |
| `src/core/view.ts` | [[architecture-modules-core]] | `VIEW_H_DEV = 480`, `deviceZoom(ch)`, `viewZoomCss(h, dpr) = deviceZoom(Math.round(h * dpr)) / dpr` (update-side aim; R-131 replaces the one-argument form) | [[architecture-render]] §4.1 |
| `src/ui/hud.ts`, ui screen module, `src/ui/debug.ts` | [[architecture-modules-ui-assets]] | seam S1 | [[architecture-render-3]] §8 |

## 4. Render import graph (no cycles)

```
index ─► view, tiles, props, entities, particles, light, glow, overlay, quality, ui (S1)
glow ──► entities, flame, view, keys
light ─► memory, view, keys
tiles ─► view, keys          memory ─► (registry only)
particles ─► view, quality, flame
overlay ─► view, keys        entities, props ─► view
view ─► keys                 keys, flame ─► core only
```

`entities.ts` does not import `glow.ts`; `glow.ts` imports `entities.ts`. This is why `drawEyes` moves to `glow.ts` (C5): eyes need `drawGlowSprite`, glow needs `torchTip`.

## Related

- [[architecture-modules-render-2]]
- [[architecture-modules-core]]
- [[architecture-modules-world]]
- [[architecture-modules-systems]]
- [[architecture-modules-ui-assets]]
- [[architecture]]
- [[index]]
- [[last-ember-design]]
- [[architecture-render]]
- [[architecture-render-2]]
- [[architecture-render-3]]
- [[architecture-resources]]
- [[architecture-resources-2]]
- [[architecture-resources-3]]
- [[architecture-assets-audio]]
- [[architecture-assets-audio-2]]
- [[architecture-host-changes]]
- [[architecture-rulings]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]
