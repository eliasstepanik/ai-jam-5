---
type: architecture
title: Last Ember – Render Architecture (1/3) – Modules, Frame Pipeline, Camera Transform
description: Last Ember rendering part 1 – render module map, purity rules, the numbered per-frame draw order with exact canvas calls, the world-to-screen camera transform with integer device zoom, DPR handling, pixel snapping and screen shake.
tags: [project, ai-jam-5, architecture, last-ember, render]
timestamp: 2026-10-22T22:30:00+02:00
---

# Last Ember – Render Architecture (1/3)

> **2.5D view pivot (2026-10-22, [[ADR-123-2-5d-view]], R-178..R-186 in [[architecture-rulings-3]] §9).** The world is drawn in a fixed-south 3/4 look: the floor is a 24 px repeating pattern, walls are caps plus 48-unit faces that hang into the south cell, and walls and actors are depth-sorted per tile row (R-180). Pass 5 below is split into 5a/5b, the camera is clamped to the map in `systems/camera.ts`, not in `makeView` (R-181), and actors draw at scale 1.0 (R-184). Asset facts: [[ai-jam-5-asset-formats-25d]]. Where this file disagrees with those rulings, the rulings win.

Part 1 of 3. Next: [[architecture-render-2]] (tile pass, entities, particles, darkness layer), [[architecture-render-3]] (glow, Beacon mode, overlays, budget, quality ladder, `drawSprite`, raycast seam, debug overlay). Non-State resources: [[architecture-resources]], [[architecture-resources-2]]. HUD and menus: [[architecture-ui]], [[architecture-ui-2]]. Hub: [[architecture]]. Spec (governs): [[last-ember-design]]. State: [[architecture-state]], [[architecture-state-2]], [[architecture-state-3]]. Host contract: [[architecture-host-changes]], [[architecture-host-changes-2]]. Colours: [[architecture-assets-style]]. Sprites: [[architecture-assets-sprites]], [[architecture-assets-sprites-2]], [[architecture-assets-sprites-3]]. Loader: [[architecture-assets-pipeline]].

**Mode:** brownfield-extension of the KB architecture. Every number marked **DEFAULT (architect)** is an architect choice; every timing in the budget tables is an **estimate, not measured** (no build exists yet).

## 1. Binding rules

1. `render(ctx, s, w, h)` is **pure with respect to State**: it reads `s`, never writes a field of `s`, never calls `rand(s, …)`. It MAY mutate non-State resources (caches, particle pool, perf counters) in `getResources()` ([[architecture-resources]]).
2. **No `Math.random` in render.** Cosmetic variation comes from (a) `hash2(x, y, salt)` of coordinates or ids, (b) the stateless event noise `noise(e.seq, i)` of [[architecture-determinism]] §4, (c) value noise over `meta.time`. A rendered frame is a pure function of `(s, resources-cache, w, h, dpr)`.
3. **Visibility uses the gameplay predicate.** Render imports `lightRadius`, `lightSources`, `insideLight` (R-083; older text says `inLight`) from `src/systems/light.ts` (systems layer, DOM-free). It never re-derives a radius. The light mask is cosmetic; WHO is drawn fully is decided by `insideLight()` only.
4. **No allocation per frame in hot loops** (no gradients, no `Path2D`, no arrays per entity). Gradients live in pre-rendered sprites (§ light cache, [[architecture-render-2]] §6).
5. **Draw in world space with one transform**, then switch to screen space once for overlays and HUD. No `save()/restore()` per sprite: sprite drawing uses `setTransform` directly ([[architecture-render-3]] §5).
6. The host already wraps `render` in `ctx.save()/restore()` and pre-sets `setTransform(dpr,0,0,dpr,0,0)` (`main.ts:121-129`). Render may set any state; it must leave `globalCompositeOperation` at `'source-over'` and `globalAlpha` at `1` before calling the HUD so the HUD starts clean.

## 2. Module map (`src/render/`, `src/assets/`, `src/ui/`)

| File | Exports | Lines (est.) |
|---|---|---|
| `src/render/index.ts` | `render(ctx, s, w, h)` – the orchestrator below; re-exported by `src/game.ts` | ~120 |
| `src/render/view.ts` | `type View`, `makeView(ctx, s, w, h): View`, `worldXf(ctx, v)`, `screenXf(ctx, v)`, `toScreen(v, x, y)` | ~80 |
| `src/render/tiles.ts` | `drawFloor(ctx, s, v, q)`, `drawWallRow(ctx, s, v, ty)`, chunk cache keyed by `tilesHash` (2.5D, [[architecture-modules-render]]) | ~180 |
| `src/render/entities.ts` | `actorRows(s, v)`, `drawRowEntities(ctx, s, v, ty)`, `drawMonsters`, `drawPlayer`; `drawEyes` lives in `glow.ts` (C5) | ~200 |
| `src/render/props.ts` | `drawVeins`, `drawPickups`, `drawLandmarks`, `drawRocks`; pickups, landmarks and landed rocks go into the actor row buckets (R-180), telegraph and falling rocks are drawn after the row loop ([[architecture-modules-render]] §3) | ~130 |
| `src/render/particles.ts` | `consumeEvents(s)`, `drawParticles(ctx, s, v, pass)` | ~200 |
| `src/render/light.ts` | light sprite cache, `drawDarkness(ctx, s, v, q)`, `drawGlow(ctx, s, v, q)` | ~220 |
| `src/render/memory.ts` | memory canvas cache (`w × h` px, 1 px per tile), dirty-rect upload ([[architecture-render-2]] §5.2), `drawMemory(dctx, s, v, q)` | ~110 |
| `src/render/overlay.ts` | `drawBeaconMode`, `drawFlashes`, `drawVignettes` | ~150 |
| `src/render/quality.ts` | `type Quality`, `frameBegin()`, `passMark(name)`, `currentQuality(s)` | ~120 |
| ~~`src/render/noise.ts`~~ → `src/core/noise.ts` (R-008) | `hash2`, `vnoise`, `quantAngle` (pure, DOM-free; L0 so `images.ts` and `audio/sfx.ts` can import it) | ~40 |
| `src/core/view.ts` (R-018, R-131) | `VIEW_H_DEV = 480`, `deviceZoom(ch)`, `viewZoomCss(h, dpr)` (DOM-free, used by update and render) | ~15 |
| `src/assets/images.ts` | `drawSprite(...)`, `spriteReady(id)`, sheet loading ([[architecture-assets-pipeline]] §6) | ~200 |
| `src/ui/hud.ts`, `src/ui/menus.ts`, `src/ui/debug.ts` | `drawHud`, `drawScreen`, `drawDebug` ([[architecture-ui]]) | – |

Import DAG (no cycles, [[architecture-host-changes-2]] §4): `core ← world ← entities ← systems ← render ← game.ts`; `assets/sprites.ts` (DOM-free) ← `assets/images.ts` ← `render`; `ui/layout.ts` (DOM-free) ← `ui/hud.ts` ← `render/index.ts`. `render` never imports `audio`.

## 3. The frame, numbered (exact order)

`render(ctx, s, w, h)` in `src/render/index.ts`. `q` = current quality level ([[architecture-render-3]] §3). Pass names in brackets are the perf-marker names.

| # | Pass [marker] | Space | Canvas calls (summary) | Condition |
|---|---|---|---|---|
| 0 | perf begin | – | `frameBegin()` reads `performance.now()` | always |
| 1 | non-world screens | screen | `drawScreen(ctx, s, w, h)` then **return** | `screen` is `title` or `help` |
| 2 | consume events | – | `consumeEvents(s)` spawns particles for new `fx.events` | always while a world exists |
| 3 | clear [clear] | device | `setTransform(1,0,0,1,0,0)`; `fillStyle = '#000'`; `fillRect(0,0,cw,ch)` | always |
| 4 | camera [view] | world | `v = makeView(ctx,s,w,h)`; `setTransform(v.z,0,0,v.z,v.ox,v.oy)`; `imageSmoothingEnabled = false` | always |
| 5a | floor [tiles] | world | `drawFloor`: visible floor chunks (24 px floor pattern + ground overlays, R-179) | always |
| 5b | wall rows interleaved with actor rows [tiles] | world | for `ty` in `ty0..ty1`: `drawWallRow(ctx, s, v, ty)` (caps, faces, wall overlays), then the actors, pickups, veins and landmarks whose foot row is `ty`, sorted by foot y (R-180). Passes 7–12 below are drawn inside this loop | always |
| 6 | decor [tiles] | world | closed: ground overlays are part of the floor chunks (5a), no separate decor pass (G6 closed, [[tasks]]) | – |
| 7 | veins [ents] (inside 5b) | world | south-facing veins: tileset ore frames; other facings: rotated `spec_vein-*` placeholders (R-186) | always |
| 8 | pickups [ents] | world | sprite with bob `y + sin(meta.time·2π + bob)` | always |
| 9 | Beacon + entrance [ents] | world | `spec_beacon` frame by state; `spec_entrance` | always |
| 10 | monsters FULL [ents] | world | atlas body sprite at scale 1.0 + eyes placeholder for `m` with `inLight(s, m.x, m.y)`, y-sorted with the wall rows (R-180, R-184) | per monster |
| 11 | player [ents] | world | eight-direction 64×64 atlas frame at scale 1.0 (R-184), animation set by phase, lit player uses the flame-palette copy (R-185); y-sorted with the wall rows; procedural swing trail in pass 17 | always |
| 12 | rocks [ents] | world | telegraph shadow circles and falling boulders after the row loop (`drawRocks`); landed boulders are drawn in the row bucket pass by foot row (R-180, `props.ts`) | `phase === 'escape'` |
| 13 | world particles, normal blend [fx] | world | dust, ink droplets, chips | always |
| 14 | DARKNESS composite [dark] | screen | build offscreen darkness, then `drawImage(dark, 0, 0, w, h)` | `!reveal` and Beacon transition < 1 |
| 15 | Beacon-lit warm overlay [dark] | screen | `'multiply'` fill `#ffb36b` at `0.55·k` | `world.beaconLit` |
| 16 | eyes outside light [glow] | world | additive eye halo + eyes sprite for visible-but-unlit monsters | per monster |
| 17 | additive glow [glow] | world | `'lighter'`: flame mantle + core, sparks, pickup glows, Beacon glow, shaft | `q.glow` (core always) |
| 18 | additive particles [glow] | world | sparks in complementary colour, embers | always |
| 19 | flashes and vignettes [ovl] | screen | perfect-parry flare, Beacon white-out, damage flash, low-HP vignette | timers |
| 20 | HUD [hud] | screen | `setTransform(dpr,0,0,dpr,0,0)`; `drawHud(ctx, s, w, h)` | `playing` |
| 21 | menu overlays [hud] | screen | `drawScreen(ctx, s, w, h)` for `paused`, `dead`, `won` over the frozen world | those screens |
| 22 | debug [dbg] | screen | NOT in `render/index.ts`: the `src/game.ts` facade calls `drawDebug(ctx, s, w, h)` after `renderFrame` (R-096) | `import.meta.env.DEV && res.debug.on` |
| 23 | perf end | – | `qualityTick(s)` updates rolling frame stats | always |

Why this order: world sprites (5–13) sit UNDER the darkness so the mask hides them; anything that must glow through darkness (eyes, flame, sparks, pickup glints) comes AFTER the darkness and uses `'lighter'`, which only adds light and never reveals hidden bodies. Overlays (19) are above glow so the damage flash tints everything. HUD is never darkened.

Orchestrator sketch:

```ts
// src/render/index.ts
export function render(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  frameBegin()
  const sc = s.meta.screen
  if (sc === 'title' || sc === 'help' || s.world.tiles === '') return drawScreen(ctx, s, w, h)
  consumeEvents(s)
  const q = currentQuality(s)
  const v = makeView(ctx, s, w, h)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, v.cw, v.ch)
  worldXf(ctx, v)
  ctx.imageSmoothingEnabled = false
  drawFloor(ctx, s, v, q) // 5a
  actorRows(s, v) // bucket actors, pickups, veins, landmarks by foot row (R-180)
  for (let ty = v.ty0; ty <= v.ty1; ty++) { // 5b: walls and actors interleaved per tile row
    drawWallRow(ctx, s, v, ty)
    drawRowEntities(ctx, s, v, ty) // veins, pickups, landmarks, monsters, player sorted by foot y
  }
  drawRocks(ctx, s, v) // after the row loop: telegraph circles + falling boulders only; landed rocks are drawn in the row buckets
  drawParticles(ctx, s, v, 'normal') // after the row loop
  passMark('ents')
  drawDarkness(ctx, s, v, q)
  drawBeaconMode(ctx, s, v)
  passMark('dark')
  worldXf(ctx, v)
  ctx.globalCompositeOperation = 'lighter'
  drawEyes(ctx, s, v)
  drawGlow(ctx, s, v, q)
  drawParticles(ctx, s, v, 'add')
  ctx.globalCompositeOperation = 'source-over'
  passMark('glow')
  drawFlashes(ctx, s, v, q)
  drawVignettes(ctx, s, v, q)
  passMark('ovl')
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
  if (sc === 'playing') drawHud(ctx, s, w, h)
  else drawScreen(ctx, s, w, h)
  passMark('hud')
  qualityTick(s) // drawDebug is called by the game.ts facade after this returns (R-096)
}
```

`drawScreen` for `title`/`help` draws its own backdrop ([[architecture-ui]] §4). `paused`/`dead`/`won` draw the world first (frozen, State does not advance in those screens) and the panel on top.

## 4. Camera transform (`src/render/view.ts`)

### 4.1 Zoom decision (DEFAULT, architect) – resolves a KB conflict

- [[architecture-host-changes]] §1 originally proposed `zoom = h / VIEW_H` with `VIEW_H = 360` (fractional zoom; superseded by R-084/R-131, and `T.view.heightPx` is deleted from the tuning shape). [[architecture-assets-style]] §2 demands an **integer** art zoom (2× at 1080p, 30 × 17 tiles visible). Fractional zoom with `imageSmoothingEnabled = false` makes texel columns 2 and 3 device px wide alternately and they crawl while the camera moves (shimmer).
- **Decision:** integer zoom in DEVICE pixels: `z = max(1, round(ch / VIEW_H_DEV))` where `ch = canvas.height` (device px) and `VIEW_H_DEV = 480` world px. Results: 720 device px → 2 (360 world px tall), 1080 → 2 (540), 1440 → 3 (480), 2160 → 4 or 5 (`round(4.5) = 5`, 432). Visible world height stays within 360–540 px.
- **Update (aim) uses the SAME zoom as render (R-131, refines R-018):** `src/core/view.ts` (DOM-free) exports `deviceZoom(ch) = max(1, round(ch / VIEW_H_DEV))` and `viewZoomCss(h, dpr) = deviceZoom(Math.round(h * dpr)) / dpr`. Update reads `input.view.dpr` (host field, OD-1 PR); render reads `ctx.getTransform().a`. The old one-argument `viewZoomCss(h) = max(1, round(h / 480))` was off by 33 % at dpr 2 (h 720: 2 vs 1.5), which with camera lag gave 4–8° aim error. **Gameplay consequence (open question):** the maximum light radius must stay below `0.5 × 360 = 180` world px or the light edge leaves the screen at 720p.

### 4.2 Formulas

```
dpr  = ctx.getTransform().a                  // host set setTransform(dpr,...) just before render
cw   = round(w * dpr), ch = round(h * dpr)   // backing store size (host main.ts:52-53)
z    = max(1, round(ch / 480))               // device px per world px, integer
camX = cam.x + shakeX, camY = cam.y + shakeY // world px (shake in world px, §4.4)
ox   = round(cw / 2 - camX * z)              // integer device px: pixel snapping rule
oy   = round(ch / 2 - camY * z)
screenDevX = worldX * z + ox                 // world -> device px
screenCssX = screenDevX / dpr                // world -> CSS px (HUD anchoring)
worldX     = (cssX * dpr - ox) / z           // CSS px -> world (render-side only)
```

```ts
export type View = {
  dpr: number; cw: number; ch: number; w: number; h: number
  z: number; ox: number; oy: number
  x0: number; y0: number; x1: number; y1: number // visible world rect (px), padded by 1 tile
  tx0: number; ty0: number; tx1: number; ty1: number // visible tile range, clamped to the map
}
export function makeView(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): View {
  const dpr = ctx.getTransform().a
  const cw = Math.round(w * dpr)
  const ch = Math.round(h * dpr)
  const z = deviceZoom(ch) // src/core/view.ts; equals viewZoomCss(h, dpr) * dpr
  const { x: sx, y: sy } = shakeOffset(s) // src/systems/camera.ts (R-017)
  const k = s.settings.reducedFlash ? 0.4 : 1
  // 2.5D (R-181): s.cam is already clamped to the map (48 px south overhang) by stepCamera/clampCam in
  // src/systems/camera.ts (task D8), so aim and this view agree; read it as is, NO second clamp here
  const ox = Math.round(cw / 2 - (s.cam.x + sx * k) * z)
  const oy = Math.round(ch / 2 - (s.cam.y + sy * k) * z)
  const x0 = -ox / z - TILE, y0 = -oy / z - TILE
  const x1 = (cw - ox) / z + TILE, y1 = (ch - oy) / z + TILE
  return { dpr, cw, ch, w, h, z, ox, oy, x0, y0, x1, y1,
    tx0: Math.max(0, Math.floor(x0 / TILE)), ty0: Math.max(0, Math.floor(y0 / TILE)),
    tx1: Math.min(s.world.w - 1, Math.floor(x1 / TILE)),
    ty1: Math.min(s.world.h - 1, Math.floor(y1 / TILE) + 2) } // +2 rows: a wall face hangs 48 px into the south cell
}
export const worldXf = (ctx: CanvasRenderingContext2D, v: View): void => ctx.setTransform(v.z, 0, 0, v.z, v.ox, v.oy)
export const toScreen = (v: View, x: number, y: number): [number, number] => [(x * v.z + v.ox) / v.dpr, (y * v.z + v.oy) / v.dpr]
```

### 4.3 Pixel snapping rule (anti-shimmer)

1. Camera offset `ox`, `oy` are integers in device px (rounded once per frame).
2. Tiles are drawn at integer world coordinates (`tx * 32`), so with integer `z` every texel covers exactly `z × z` device px: zero shimmer for the static world.
3. Moving sprites are drawn at `round(x * z) / z` (snap to the device grid, not the world grid) so they move smoothly at `z ≥ 2` without sub-texel blur.
4. Actor sprites select one of eight authored directions without rotation or mirroring (R-184, which replaces R-154/R-155). Non-actor rotated sprites use nearest sampling and 16-step quantisation ([[architecture-render-3]] §6).
5. Fractional DPR (1.25, 1.5) is handled automatically: `z` is integer in device px, so the CSS scale is fractional but the device mapping is exact.

### 4.4 Screen shake

`fx.shake` (s left) and `fx.shakeMag` (px) are written by update. **R-017:** the one `shakeOffset(s): { x: number; y: number }` lives in `src/systems/camera.ts` ([[architecture-systems-4]] §5); `view.ts` does not define it. Render imports it and scales by 0.4 when `settings.reducedFlash`. Shape of the stateless offset (illustrative):

```ts
// src/systems/camera.ts (R-017)
const SHAKE_DECAY = 0.25 // s, DEFAULT (architect): amplitude ramps to 0 over the last 0.25 s
export function shakeOffset(s: State): { x: number; y: number } {
  if (s.fx.shake <= 0) return { x: 0, y: 0 }
  const a = s.fx.shakeMag * Math.min(1, s.fx.shake / SHAKE_DECAY)
  const n = s.meta.steps // changes once per step: shake at 60 Hz, stable between frames of one step
  return { x: a * (hash2(n, 1, 0x5a) * 2 - 1), y: a * (hash2(n, 2, 0x5a) * 2 - 1) } // hash2 from src/core/noise.ts
}
// render/view.ts: const k = s.settings.reducedFlash ? 0.4 : 1, then sx * k, sy * k
```

The offset enters `ox/oy` BEFORE rounding, so shaken frames stay pixel-snapped. The HUD does not shake. During `escape` the quake keeps refreshing `fx.shake`, so the world trembles continuously at `shakeMag ≈ 1.5` px (tuning, quake system).

## Related

- [[architecture]]
- [[architecture-render-2]]
- [[architecture-render-3]]
- [[architecture-resources]]
- [[architecture-resources-2]]
- [[architecture-ui]]
- [[architecture-ui-2]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-host-changes]]
- [[architecture-determinism]]
- [[architecture-assets-style]]
- [[architecture-assets-sprites]]
- [[architecture-assets-pipeline]]
- [[last-ember-design]]
- [[architecture-scale-and-economy-4]]
- [[architecture-rulings]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]
- [[architecture-systems-4]]
- [[architecture-modules-render]]
- [[ADR-123-2-5d-view]]
- [[ai-jam-5-asset-formats-25d]]
- [[index]]
