---
type: architecture
title: Last Ember – Render Architecture (3/3) – Glow, Beacon Mode, Overlays, Budget, Quality, Sprites, Raycast Seam, Debug
description: Last Ember rendering part 3 – additive flame glow with core and mantle sprites, Beacon-lit transition, damage and low-HP vignettes, per-pass frame-time budget at 1080p and 1440p, the auto-quality degradation ladder, the drawSprite helper with rotation decision, the wall-shadow raycasting seam and the dev debug overlay.
tags: [project, ai-jam-5, architecture, last-ember, render]
timestamp: 2026-10-22T21:00:00+02:00
---

# Last Ember – Render Architecture (3/3)

> **2.5D pivot ([[ADR-123-2-5d-view]], R-178..R-186 in [[architecture-rulings-3]] §9).** Sections 6 (actor facing, scale 1.0, atlas frames) and 7 (raycast stays a STRETCH seam, light is radial only, R-182) are updated. Glow, overlays, budget and quality are unchanged except that the tile pass now draws one floor layer plus one wall band per visible row ([[architecture-render]] §3).

Part 3 of 3. Previous: [[architecture-render]] (frame order, camera), [[architecture-render-2]] (tiles, entities, particles, darkness). Resources: [[architecture-resources]], [[architecture-resources-2]]. UI: [[architecture-ui]], [[architecture-ui-2]]. Hub: [[architecture]]. Spec: [[last-ember-design]]. State: [[architecture-state]], [[architecture-state-2]], [[architecture-state-3]]. Colours: [[architecture-assets-style]] §4.3, §5.

## 1. Additive glow pass (pass 17, `'lighter'`, world transform)

Glow sprites are pre-rendered COLOURED radial sprites (cache `res.light`, key `'g:' + colourHex + ':' + bucket`, buckets 32 | 64 | 128 | 256 px diameter). Build: `createRadialGradient` centre → edge, stops `0: rgba(c,1)`, `0.25: rgba(c,0.55)`, `0.6: rgba(c,0.15)`, `1: rgba(c,0)`. Drawn with `globalAlpha` for intensity, scaled with `drawImage`; never a gradient per frame.

| Layer | Centre | Radius (world px) | Colour | Alpha | Quality |
|---|---|---|---|---|---|
| ambient mantle wash | player | `0.9 · R` | mantle (`plain #ff8a1e`, `sodium #ffe14a`, `copper #1fd6b8`, `strontium #e0182d`) | `0.10 + 0.08 · e` | `q.glow` |
| flame mantle | torch tip | `14 · f` | mantle | `0.55` | always |
| flame outer fringe | tip `-2 px y` | `20 · f` | fringe (`#c2410c`, `#f5b700`, `#0e8f9c`, `#8a0a1e`) | `0.35` | `q.glow` |
| flame core | torch tip | `6 · f` | core (`#fff4d6`, `#ffffff`, `#e8fff9`, `#ffe0e0`) | `0.9` | always |
| tongue | tip `+ (0, -4 - 3·vnoise)` | `5` | core | `0.6` | `q.glow` |
| perfect-parry flare | player | `R · (1 + 0.6 · fl)` | core | `0.7 · fl` | always |
| pickup glows | pickup | `14` | resin `#d9861c`, plant `#b6ff8a` | `0.25 + 0.2 · (0.5 + 0.5 sin(t·1.5·2π))` | `q.glow` |
| vein glints | vein | `10` | crystal light (style 4.4) | `0.3` only when within `R + 32` | `q.glow` |
| eye halos | see [[architecture-render-2]] §3.2 | `4 / 6 / 9` | `#6b4fb8` idle, `#b48cff` telegraph | `0.55 / 1` | always |
| Beacon fire | Beacon | `40` (lit `64`) | `#ffb347` + core `#fff4d6` r 16 | `0.4 + 0.3 · hold` / `0.8` | always |
| entrance shaft | entrance | `48` + dust motes | `#cfe3ff` | `0.25` | always |
| ember (flame out) | torch tip | `6` | `#c2410c` | `0.5 + 0.2 · vnoise(t·3)` | always |

`e = energy / energyMax`, `f = 0.8 + 0.4 · e` (flame size), `fl = fx.flare / FLARE_TIME`. The flame tip wobbles: `tip.x += 0.8 · vnoise(t · 7, 11)`, `tip.y += 0.8 · vnoise(t · 7, 13)`. Sparks are particles (pass 18), colour = complementary column of style 4.3 (`#5ab0ff`, `#6a5cff`, `#ff5c7a`, `#3dffb0`). The flame colour table lives in `src/render/flame.ts` as `FLAME_COL: Record<FlameKind, { core, mantle, fringe, spark }>`; gameplay `radiusMul`/`flickerFreq` stay in the systems flame table.

## 2. Beacon-lit mode

- `beaconBlend(s) = world.beaconLit ? clamp((meta.time - beaconLitAt) / 1.5, 0, 1) : 0`, eased `k = k * k * (3 - 2k)`.
- **Requires a State field** `world.beaconLitAt: number` (meta.time when lit; default `0`). `fx.beaconFlash` alone cannot drive a 1.5 s ramp that must persist; listed in the State additions (§9).
- Pass 14 draws the darkness with `globalAlpha = 1 - k`; at `k = 1` the darkness layer is skipped entirely (cheaper escape phase).
- Pass 15: `ctx.globalCompositeOperation = 'multiply'`, `fillStyle = '#ffb36b'`, `globalAlpha = 0.55 · k`, `fillRect(0, 0, cw, ch)` (style §5), then reset. Tiles never touched by the memory layer show too (whole cave lit, spec).
- Pass 19 white-out: `fillStyle = '#fff4d6'`, `globalAlpha = 0.85 · fx.beaconFlash / BEACON_FLASH` (`reducedFlash` → ×0.3).
- `inLight()` returns true everywhere once `beaconLit` (systems rule), so pass 10 draws all shades fully in escape and pass 16 draws no lone eyes.

## 3. Frame-time budget and degradation ladder

### 3.1 Per-pass budget (ESTIMATES, mid laptop: Intel Iris Xe / AMD Vega 8, Chrome, GPU canvas)

| Pass | 1080p (dpr 1, z 2) | 1440p (dpr 1, z 3) | Notes |
|---|---|---|---|
| clear | 0.05 | 0.08 | one `fillRect` |
| tiles (cached chunks) | 0.25 | 0.3 | ≤ 20 chunk `drawImage`; first visit +0.5 ms per built chunk (quota 4); tile maps 4–8 ms once per run, first world frame ([[architecture-scale-and-economy-4]] §1.3) |
| entities | 0.4 | 0.45 | ≤ 24 monsters × 2 sprites + player + ≤ 60 pickups/veins culled to ~15 |
| particles | 0.2 | 0.25 | ≤ 512 `fillRect`, bucketed fill styles |
| darkness build (full res) | 0.6 | 1.0 | fill + memory blit + 1–3 stamps on a w×h canvas |
| darkness composite | 0.5 | 0.9 | one full-screen `drawImage`, fill-rate bound |
| warm overlay (escape) | 0.4 | 0.7 | full-screen multiply; darkness skipped then |
| glow (`'lighter'`) | 0.6 | 0.9 | 5–10 large additive sprites, fill-rate bound |
| overlays / vignettes | 0.3 | 0.5 | vignette sprite full-screen when active |
| HUD | 0.3 | 0.3 | ~30 small draws + text |
| update (60 Hz step, not render) | 1.0 | 1.0 | game logic, ref only |
| **Total** | **≈ 4.6 ms** | **≈ 6.4 ms** | budget 16.7 ms; dominated by full-screen fill rate (darkness + glow + vignette) |

**DPR 2 laptops (1440p physical at dpr 2):** device fill is 4× CSS; darkness stays at CSS res (cap 1), so only composite, glow and overlays scale: ≈ 9–11 ms. This is the case the ladder exists for.

### 3.2 Quality levels (DEFAULT, architect)

```ts
// src/render/quality.ts
export type Quality = { level: 0 | 1 | 2 | 3; dprCap: number; darkRes: 1 | 0.5; glow: boolean; decor: boolean; particles: number; vignette: boolean }
export const QUALITY: readonly Quality[] = [
  { level: 0, dprCap: 2, darkRes: 1, glow: true, decor: true, particles: 1, vignette: true },
  { level: 1, dprCap: 1.5, darkRes: 1, glow: true, decor: true, particles: 1, vignette: true },
  { level: 2, dprCap: 1, darkRes: 0.5, glow: true, decor: false, particles: 0.5, vignette: true },
  { level: 3, dprCap: 1, darkRes: 0.5, glow: false, decor: false, particles: 0.25, vignette: false },
]
```

- **`dprCap` is a host-level knob**: the host sizes the backing store with `window.devicePixelRatio`. Render cannot change it. Two options: (a) host change `dpr = Math.min(window.devicePixelRatio || 1, getDprCap())`; (b) render-only fallback: when `dpr > dprCap`, render the world into `res.lowres` (canvas `w·dprCap × h·dprCap`) and upscale once. **DEFAULT: (a)**, a 1-line host change reading `globalThis.__lastEmberDprCap ?? 2`, written by `quality.ts`. Needs owner approval (stable host); without it levels 1–2 skip the `dprCap` step. Listed as open question.
- **Ladder order** (cheapest visual loss first): 0 → 1 lower DPR → 2 half-res darkness, no decor, half particles → 3 no fringe/wash/pickup glow, no vignette, quarter particles. Core flame, eyes and the light mask are NEVER dropped (gameplay readability).

### 3.3 Auto-quality switch

- `res.perf.frameMs`: ring of the last 120 rAF intervals (`performance.now()` deltas taken in `frameBegin`). Average `avg` over 120 frames (2 s at 60 Hz).
- **Down:** `avg > 18.5 ms` for 2 consecutive windows → level + 1 (max 3). **Up:** `avg < 12 ms` for 5 windows (10 s) → level − 1. After any change, 3 s cool-down (frames ignored) so the shader/canvas warm-up does not oscillate.
- vsync-limited 30 Hz displays read 33 ms constantly: if `avg` is within 1 ms of 33.3 and the render work itself (`frameEnd - frameBegin`) is < 8 ms, do NOT degrade (`ponytail:` frame-time heuristic, upgrade path: measure work time only).
- Hidden tab / pause: `frameMs` entries > 100 ms are discarded.
- Level storage: the live auto level is a RESOURCE (`res.perf.level`), not State (it is per machine, changes from render, render may not write State). The **user/dev override** is a setting: `settings.quality: 'auto' | 'q0' | 'q1' | 'q2' | 'q3'` (State addition §9), persisted in `last-ember:settings` (`SettingsRecord.quality`, R-142 amends R-025). `currentQuality(s) = QUALITY[s.settings.quality === 'auto' ? res.perf.level : Number(s.settings.quality[1])]`. Dev key: `Shift+Digit6` cycles the override (R-132: F-keys are browser keys, F5 reloads and loses State, F6 focuses the address bar). The toggle lives in `src/game.ts` `update` step 1 with the other dev toggles (R-133 extends R-096); L0–L3 (incl. `stepScreens`) never read `import.meta.env`.

## 4. Damage flash, vignettes, flame-out look (pass 19, screen space)

| Effect | Trigger | Draw | Reduced flash |
|---|---|---|---|
| damage flash | `player.hitFlash > 0` | `fillStyle '#ff3b2a'`, `globalAlpha = 0.35 · hitFlash / HIT_FLASH`, full-screen `fillRect` | alpha × 0.3 |
| hit vignette | same | vignette sprite tinted `#ff3b2a`, alpha `0.6 · hitFlash / HIT_FLASH` | kept |
| low-HP vignette | `hp === 1` (and `hp === 2` at half strength) | vignette sprite `#ff3b2a`, alpha `0.25 + 0.15 · sin(meta.time · 2π · 70/60)` (heartbeat 70 BPM) | pulse amplitude 0 |
| flame-out vignette | `energy <= 0` in descent | vignette `#000`, alpha 0.5 (narrows the view) | kept |
| perfect-parry flare | `fx.flare > 0` | full-screen `'lighter'` `#fff4d6` alpha `0.25 · fl` + glow pass layer | alpha × 0.3 |

Vignette sprite: `res.light` key `'v:' + bucketW + 'x' + bucketH` (buckets of 256 px), a canvas `w × h` at CSS res filled with `createRadialGradient(cx, cy, 0.45·min(w,h), cx, cy, 0.75·hypot(w,h)/2)` stops `0: rgba(255,255,255,0)`, `1: rgba(255,255,255,1)`; tint by drawing it into a scratch canvas once per colour (`'source-in'` fill) → key `'v:' + hex + ':' + size`. Only 3 colours are used.

## 5. `drawSprite` helper (`src/assets/images.ts`)

```ts
export function drawSprite(
  ctx: CanvasRenderingContext2D, id: SpriteId, anim: string, frame: number,
  x: number, y: number, rot = 0, scale = 1, alpha = 1, tint: string | null = null,
): void {
  const d = SPRITES[id]
  const z = ctx.getTransform().a                          // current device zoom (world transform)
  const b = ctx.getTransform()
  const sx = Math.round(x * z) / z                        // snap to device grid ([[architecture-render]] §4.3)
  const sy = Math.round(y * z) / z
  const a = quantAngle(rot)
  const c = Math.cos(a) * scale * z, sn = Math.sin(a) * scale * z
  ctx.setTransform(c, sn, -sn, c, b.e + sx * z, b.f + sy * z)
  ctx.globalAlpha = alpha
  const r = resolved(id, anim, frame)                     // [sheet, x, y, w, h] | null, [[architecture-assets-pipeline]] §6
  if (r && !forcePlaceholders()) {
    const img = tint ? tinted(r, tint) : sheet(r[0])
    ctx.drawImage(img, r[1], r[2], r[3], r[4], -d.px, -d.py, r[3], r[4])
  } else {
    PLACEHOLDERS[id](ctx, anim, frame, 0)
  }
  ctx.setTransform(b)                                     // restore world transform (DOMMatrix, no save/restore)
  ctx.globalAlpha = 1
}
```

- Signature extends the brief's `drawSprite(ctx, id, frame, x, y, rot, scale, tint?)` with `anim` and `alpha`, matching [[architecture-assets-pipeline]] §6. `frame` is an index inside `anim`; callers compute it from `meta.time` and fps (`frameAt(id, anim, t)` helper; once-anims clamp to `n - 1`).
- `getTransform()` allocates a `DOMMatrix` per call (2 per sprite, ~120 per frame): acceptable (`ponytail:` pass the View in if a profile shows GC). Upgrade: `drawSprite(ctx, v, ...)` with `v.z, v.ox, v.oy`.
- `tint`: `tinted(rect, hex)` caches a per-frame tinted copy (`res.images.tints`, key `id:anim:frame:hex`, `'source-atop'` fill), used only for the white hit flash and the 30 % hotbar icons. Cap 64 entries.
- Placeholders draw with `fillStyle`/`arc` around the origin (pivot) in the same transform.

## 6. Actor facing: authored directions, no sprite rotation

R-184 supersedes R-154/R-155 and the old 16-step actor rotation decision. Player and monster body frames come from the character atlas: 64×64, pivot (32,32), scale 1.0, eight authored views per animation, per-frame `duration_ms`. Select the direction index from facing (`dirIndex`, `src/core/grid.ts`) and draw the atlas frame with no rotation. Do not rotate, mirror, or build a rotated cache for actor art. Monster body and eye layer use the same direction; hold death facing from the first frame. See [[architecture-assets-sprites]] and [[architecture-render-2]] §3.2–3.3.

Runtime transforms and `quantAngle` remain available for non-actor sprites such as veins and the exit arrow. Actor procedural placeholders (art not loaded) draw the selected directional geometry at scale 1 with rotation 0. Nearest sampling remains enabled for all pixel art.

## 7. Wall-shadow raycasting seam (STRETCH, not in the core build)

In the 2.5D view the light stays radial only (R-182); a visibility polygon would also have to account for wall height, so it remains an upgrade path. The only seam is the mask stamp in [[architecture-render-2]] §5.3:

```ts
// src/render/light.ts
export type MaskStamp = (c: CanvasRenderingContext2D, L: LightSource, v: View, r: number, s: State) => void
export const stampRadial: MaskStamp = (c, L, v, r, s) => { /* drawImage of the cached radial sprite */ }
let stamp: MaskStamp = stampRadial // ponytail: one implementation until raycast exists
```

Raycast version `stampOccluded` (`src/render/occlusion.ts`): (1) `visibilityPolygon(solid, L.x, L.y, L.r)` from the cached solid grid ([[architecture-state-3]] §5): cast rays to every wall-tile corner within `L.r` (±0.0001 rad), sort by angle, ≤ ~400 points; cache by `(tileX, tileY, rBucket, solidSig)` of the light. (2) Into a scratch canvas: draw the radial sprite, then `'destination-in'` fill the polygon path. (3) `'destination-out'` the scratch into the darkness. Cost ≈ +0.6–1.2 ms. **Gameplay rule:** if shadows ship, `inLight` must use the same polygon (LOS test in systems), otherwise eyes-vs-body would disagree with the mask. That makes it a systems change too, which is why it is a stretch goal.

## 8. Debug overlay (`src/ui/debug.ts`, dev only)

- Toggle `Backquote` ([[architecture-host-changes-2]] §7), flag `res.debug.on`; read in `src/game.ts` `update` step 1 together with every other dev toggle (`Shift+Digit1..6`, R-132, R-133). Called by the `game.ts` facade after `renderFrame` (R-096). Drawn last, screen space, `font = '12px ui-monospace, monospace'`, panel `rgba(0,0,0,0.7)` at (8, 8), 300 × 200 CSS px, line height 14.
- Lines: `FPS 60 · frame 4.6 ms (p95 6.1)`; `clear .05 tiles .25 ents .40 dark 1.1 glow .60 ovl .30 hud .30`; `Q auto→1 dpr 1.5 dark 1920×1080`; `mons 7 (L5 S2 D0) parts 143/512 chunks 18/40 built 2`; `light R 132 kind copper flick 1.03 energy 64/100`; `screen playing phase descent zone 2 depth 14 steps 8123`; `seed 8812 hash 3fa2… solidSig 0`; `events seq 410 lastSeq r410 a410`.
- Pass timings: `passMark(name)` stores `performance.now()` deltas in `res.perf.pass[name]` (rolling avg over 30 frames). Note: canvas calls are queued, so CPU marks underestimate GPU cost; treat as relative.
- `debug.showPaths` (State) draws depth numbers per visible floor tile and zone borders in world space before pass 14 (so they are hidden in darkness unless `reveal`).

## 9. State additions required (not yet in [[architecture-state]])

| Field | Type, default | Why |
|---|---|---|
| `world.beaconLitAt` | `number`, `0` | 1.5 s Beacon transition (§2) |
| `settings.quality` | `'auto' \| 'q0' \| 'q1' \| 'q2' \| 'q3'`, `'auto'` | dev/user override of the ladder (§3.3). All-string union on purpose: `fill()` in `migrate` keeps a value only if `typeof` matches the default, so a mixed `'auto' \| number` union would be reset to `'auto'` on every swap |
| `settings.reducedFlash` | `boolean`, `false` | accessibility ([[architecture-ui-2]]) |

## Related

- [[architecture]]
- [[architecture-render]]
- [[architecture-render-2]]
- [[architecture-resources]]
- [[architecture-resources-2]]
- [[architecture-ui]]
- [[architecture-ui-2]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-state-3]]
- [[architecture-host-changes]]
- [[architecture-host-changes-2]]
- [[architecture-assets-style]]
- [[architecture-assets-sprites]]
- [[architecture-assets-pipeline]]
- [[last-ember-design]]
- [[architecture-scale-and-economy-4]]
- [[architecture-rulings-2]]
- [[architecture-rulings-3]]
- [[architecture-modules-render]]
- [[ADR-123-2-5d-view]]
- [[ai-jam-5-asset-formats-25d]]
- [[index]]
