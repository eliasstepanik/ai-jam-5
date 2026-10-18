---
type: architecture
title: Last Ember – Render Architecture (2/3) – Tiles, Entities, Particles, Darkness and Memory
description: Last Ember rendering part 2 – chunked tile cache with zone map, floor variant hash and wall bitmask auto-tiling, entity passes with the shared inLight predicate, the analytic particle pool fed by the fx event queue, and the darkness layer with pre-rendered light mask sprites, flicker, memory map and flame-out look.
tags: [project, ai-jam-5, architecture, last-ember, render]
timestamp: 2026-10-17T22:00:00Z
---

# Last Ember – Render Architecture (2/3)

Part 2 of 3. Previous: [[architecture-render]] (frame order, camera). Next: [[architecture-render-3]] (glow, overlays, budget, quality, `drawSprite`, raycast seam, debug). Resources and lifecycle: [[architecture-resources]], [[architecture-resources-2]]. Hub: [[architecture]]. Spec: [[last-ember-design]]. State: [[architecture-state]], [[architecture-state-2]]. Art: [[architecture-assets-style]], [[architecture-assets-sprites-2]].

## 1. Shared helpers (`src/core/noise.ts`, DOM-free, checked; R-008 moved them out of `src/render/`)

```ts
// Stateless integer hash -> [0, 1). Used for floor variants, shake, eye phase, flicker.
export function hash2(x: number, y: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
// 1D value noise in [-1, 1], smooth (cosine interpolation between integer lattice points).
export function vnoise(t: number, salt: number): number {
  const i = Math.floor(t)
  const f = t - i
  const a = hash2(i, 0, salt) * 2 - 1
  const b = hash2(i + 1, 0, salt) * 2 - 1
  const k = (1 - Math.cos(f * Math.PI)) / 2
  return a + (b - a) * k
}
export const quantAngle = (a: number): number => Math.round(a / (Math.PI / 8)) * (Math.PI / 8) // 16 steps
```

Check (`src/checks/render.check.ts`, covers only `src/core/noise.ts` and `src/core/view.ts`, R-043): `hash2` in `[0,1)`, same input same output, `quantAngle(0.2) === Math.PI / 8`, `vnoise` within `[-1, 1]`.

## 2. Tile pass (`src/render/tiles.ts`)

### 2.1 Derived maps (cached, key `tilesHash`)

Built once per run on first draw, held in `res.tiles` ([[architecture-resources]] §2):

| Array | Type, size | Content |
|---|---|---|
| `zone` | `Uint8Array(w*h)` (76 800) | floor: `zoneOfDepth(depthOf(dist, beaconDist))`; wall and unreachable floor: zone of the nearest reachable floor tile (multi-source BFS from all reachable floor tiles, 4-neighbour). Never 0. |
| `mask` | `Uint8Array(w*h)` | wall cells: bitmask N=1 E=2 S=4 W=8, bit set = neighbour is floor (`.` or `,`); off-map counts as wall ([[architecture-assets-sprites-2]] §2.1) |
| `inner` | `Uint8Array(w*h)` | bits 0..3 = inner-corner overlays NE, SE, SW, NW: set when both orthogonals are wall and the diagonal is floor |
| `variant` | `Uint8Array(w*h)` | floor: `v = floor(hash2(tx, ty, seed) * 16)`; 0–9 → 0, 10–12 → 1, 13–14 → 2, 15 → 3 |

Cost: one pass over 76 800 tiles (320×240) plus BFS, about 4–8 ms once per run, on the first world frame (one long frame, accepted; [[architecture-scale-and-economy-4]] §1.3). Landed rocks are NOT baked (they are entities, pass 12).

### 2.2 Chunk cache (DEFAULT, architect)

- Chunk = 8 × 8 tiles = 256 × 256 world px, drawn at 1 texel per world px into an `OffscreenCanvas`/`HTMLCanvasElement` (`res.tiles.chunks`). Chunk grid `CHUNKS_W × CHUNKS_H = ceil(w / 8) × ceil(h / 8)` = 40 × 30 = 1 200 chunks at 320×240 (full map as chunks: 76 800 × 32² × 4 B ≈ 315 MB, never resident, the LRU below is mandatory).
- Contents: floor sprite, wall sprite (frame = mask), inner overlays, decor decals (the crater is excluded: it belongs to a landed rock, pass 12; there are no crack entities and `spec_crack` is dropped, R-138). Order inside a tile: floor → wall → inner frames NE, SE, SW, NW → decor.
- **Cache key:** `cx + cy * CHUNKS_W` (no literal grid width) in a `Map<number, Canvas>`, valid while `res.tiles.key === tilesHash + ':' + res.images.gen` (`gen` +1 when a sheet finishes loading or fails, so placeholder-built chunks get rebuilt with art). Key mismatch → clear map.
- **LRU cap 40 chunks** (40 × 256 KB = 10 MB; unchanged at 320×240, viewport-bound). Visible at 1080p z=2: 960 × 540 world px → at most 5 × 4 = 20 chunks; 1440p z=3: 853 × 480 → 5 × 3 = 15.
- **Build quota: 4 chunks per frame** (unchanged: sprint 240 px/s crosses a chunk column every 1.07 s). A visible chunk without a canvas beyond the quota is drawn directly tile-by-tile into the main context with the same function (`paintChunk(target, cx, cy, offX, offY)`), so the view is never incomplete.
- Drawing: in world transform, `ctx.drawImage(chunk, cx * 256, cy * 256)`; `imageSmoothingEnabled = false` gives exact `z × z` texels.

```ts
function paintChunk(c: CanvasRenderingContext2D, s: State, t: TileMaps, cx: number, cy: number, ox: number, oy: number): void {
  for (let ty = cy * 8; ty < cy * 8 + 8 && ty < s.world.h; ty++) {
    for (let tx = cx * 8; tx < cx * 8 + 8 && tx < s.world.w; tx++) {
      const i = ty * s.world.w + tx
      const x = tx * TILE - ox
      const y = ty * TILE - oy
      const z = t.zone[i] as Zone
      if (s.world.tiles.charCodeAt(i) !== HASH) {
        drawTile(c, FLOOR_ID[z], t.variant[i], x, y)
      } else {
        drawTile(c, WALL_ID[z], t.mask[i], x, y)
        for (let k = 0; k < 4; k++) if (t.inner[i] & (1 << k)) drawTile(c, INNER_ID[z], k, x, y)
      }
    }
  }
}
```

`drawTile` = `drawSprite` without rotation (pivot 0,0). `FLOOR_ID = { 1: 'tile_z1_floor', ... }` etc. are module constants. Placeholder tiles use the `PLACEHOLDERS` geometry ([[architecture-assets-sprites-2]] §2.3–2.4).

### 2.3 Culling

Visible tile range from `View` (`tx0..tx1`, `ty0..ty1`, padded by one tile). Chunks: `cx0 = tx0 >> 3` .. `cx1 = tx1 >> 3`. Entities: skip when the centre is outside `[x0 - 48, x1 + 48] × [y0 - 48, y1 + 48]` (48 = half the devourer canvas).

## 3. Entity passes (`src/render/entities.ts`)

### 3.1 Veins, pickups, landmarks

- **Veins** (pass 7): `spec_vein-<mineral>` on the wall cell; rotation = direction of the stand tile (`stand - tile`: `+w` → 0 (art faces south), `-w` → π, `+1` → −π/2, `-1` → π/2). Anim `mining` while `player.mining.targetTile === v.tile`, else `full`. Mined veins are absent (State), so there is no `depleted` draw (the anim is dropped from the catalog, R-138).
- **Pickups** (pass 8): resin `p.size === 'large' ? 'item_resin-large' : 'item_resin-small'` (R-139), plants `item_plant`; `y += Math.sin(meta.time * 2 * Math.PI + p.bob)` (±1 px, 1 Hz), no rotation, anim `idle` at its fps from `meta.time`.
- **Landmarks** (pass 9): `spec_entrance` at the entrance centre; `spec_beacon` anim `unlit` (hold 0), `charging` (`beaconHold > 0`), `lit` (`world.beaconLit`).

### 3.2 Monsters (pass 10) and eyes (pass 16)

```ts
// pass 10, normal blend, under the darkness
for (const m of s.monsters) {
  if (!inView(v, m.x, m.y)) continue
  if (!inLight(s, m.x, m.y)) continue // SAME predicate as update (src/systems/light.ts); equals m.seen
  const [anim, frame] = monsterFrame(s, m)
  drawSprite(ctx, MON_ID[m.kind], `${anim}-${monsterDirection(s, m)}`, frame, m.x, m.y, 0, MON_SCALE[m.kind])
  drawSprite(ctx, EYES_ID[m.kind], `${eyeAnim(m)}-${monsterDirection(s, m)}`, eyeFrame(s, m), m.x, m.y, 0, MON_SCALE[m.kind])
}
// pass 16, after the darkness, ctx.globalCompositeOperation === 'lighter'
for (const m of s.monsters) {
  if (!inView(v, m.x, m.y) || inLight(s, m.x, m.y) || m.ai === 'dying') continue
  const a = eyeAlpha(s, m) // 0.55 idle with blink, 1.0 telegraph
  drawGlowSprite(ctx, 'eye', m.x + ex, m.y + ey, EYE_HALO_R[m.kind], a) // halo #6b4fb8 / telegraph #b48cff
  drawSprite(ctx, EYES_ID[m.kind], `${eyeAnim(m)}-${monsterDirection(s, m)}`, eyeFrame(s, m), m.x, m.y, 0, MON_SCALE[m.kind], a)
}
```

- `monsterFrame`: `ring`/`stalk`/`recover`/`stunned` → `idle`, loop frame `floor(meta.time * fps + m.id * 0.37) % n`; `windup` → `telegraph` (devourer: `telegraph_a` when `beat === 0`, else `telegraph_b`), once frame `min(n - 1, floor(aiT * fps))`; `lunge` → `lunge`; `dying` → `death`.
- `monsterAngle`: `windup` and `lunge` → `lungeDir`; `dying` → frozen `lungeDir` (no State field needed); else `atan2(vy, vx)` when speed > 5 px/s, else angle to the player. This is only an input to direction selection, never a sprite rotation. `monsterDirection` selects the nearest of `e,se,s,sw,w,nw,n,ne` with clockwise halfway ties. Hold the selected death direction from its first frame; switching other actions’ facing retains the action timer/frame. `MON_SCALE = { lurker: 0.5, stalker: 0.75, devourer: 1.5 }` for both body and eyes; procedural placeholders draw at scale 1 (R-155).
- Eye blink (idle): blink when `hash2(floor(meta.time / 3), m.id, 7) < 0.25` and `meta.time % 3 < 0.25` (stateless).
- `eyeFrame` selects the 3-frame blink sequence when blinking, otherwise frame 0. Eye halo offsets `ex, ey` come from per-kind, per-direction authored eye centres relative to pivot (32,32), multiplied by `MON_SCALE`; do not rotate the east eye positions to approximate another view. Fallback uses the centres for the resolved eye action/direction.

### 3.3 Player (pass 11)

- Body anim priority: `death` (`screen === 'dead'`) > `roll` (`roll.t > 0`) > `hurt` (`hitFlash > 0`) > `swing` (`swing.active`) > `walk` (`hypot(vx, vy) > 10`) > `idle`. Walk fps ×1.6 in `escape`.
- Player direction: nearest of `e,se,s,sw,w,nw,n,ne` to `facing` in descent or `atan2(vy, vx)` while moving in escape, otherwise retained facing. Halfway ties go clockwise. Use `<action>-<direction>` and sprite angle 0; do not rotate or mirror player art. Freeze direction when death begins (R-154).
- Player set: `player_body-torch` in descent (even with energy 0), `player_body` in escape. Both are 64×64 with pivot (32,32), drawn at scale 0.5; collision radius stays 10. Walk has 4 frames. The stick is baked into the torch-set frames; never draw `player_torch`. `torchTip(s)` remains the glow seam: resolve the displayed frame and its source-pixel tip anchor, then return player position plus `(tip - [32,32]) * 0.5`. In escape, the flame/glow caller skips the torch effect. Missing art uses the matching fallback frame and anchor. See catalog Section 4 (R-154).
- Hit flash: while `hitFlash > 0`, a second `drawSprite` of the same frame with `tint = '#ffffff'` and alpha `hitFlash / HIT_FLASH` ([[architecture-render-3]] §5 tint path).
- Swing arc trail: in pass 17 (additive), `ctx.arc(px, py, 22, a0, a1)` stroke width 6 in the flame mantle colour, alpha `1 - swing.t / SWING_ACTIVE`. One path per frame, no allocation beyond `beginPath`.

### 3.4 Rocks (pass 12, escape)

- Telegraph (`!landed`): `k = 1 - r.t / ROCK_WARN`; `fillStyle = 'rgba(0,0,0,' + (0.2 + 0.4 * k) + ')'`, `arc(x, y, (6 + 10 * k) * r.size, 0, 2π)`. Falling boulder shown when `r.t < 0.35`: scale `1 + 0.8 * (r.t / 0.35)`, alpha `1 - r.t / 0.35 * 0.6`.
- Landed: `spec_boulder` variant `r.id % 3`, size 2 drawn at scale 2. Crater decal under it.

## 4. Particles (`src/render/particles.ts`)

### 4.1 Pool (analytic, pause-safe)

- Fixed capacity `P_MAX = 512` (DEFAULT, architect) in typed arrays held in `res.particles` (never in State): `x0, y0, vx, vy, born, life, size, drag, grav` (`Float32Array`), `col` (`Uint8Array` palette index), `add` (`Uint8Array` 0 normal / 1 additive), `shape` (`Uint8Array` 0 square, 1 line, 2 sprite). Ring write index `head`; full pool overwrites the oldest.
- **Position is analytic in simulated time**, so particles freeze in `paused` and survive frame-rate changes: `t = meta.time - born`, `e = (1 - Math.exp(-drag * t)) / drag`, `x = x0 + vx * e`, `y = y0 + vy * e + 0.5 * grav * t * t`. Dead when `t > life`; alpha `= 1 - t / life`.
- Randomness: `noise(e.seq, i)` = `hash2(e.seq, i, salt)` per spawned particle ([[architecture-determinism]] §4). No `Math.random`.
- Event cursor `res.particles.lastSeq` (`-1` on a fresh pool → set to max seq present, spawn nothing).

### 4.2 Event → particle table (counts at quality 0; × `q.particles`)

| Event | Count | Shape, blend | Colour | Speed px/s, life s |
|---|---|---|---|---|
| `swing` | 6 | line, add | sparks of the flame (style 4.3) | 60–140, 0.25 |
| `parryPerfect` | 24 + ring | square, add | complementary spark colour + core `#fff4d6` | 120–260, 0.45 |
| `parryGood` | 10 | square, add | complementary | 80–180, 0.35 |
| `parryPoor`, `flameHit` | 8 smoke + 6 | square normal / add | smoke `#2c2540`, sparks mantle | 30–90, 0.6 |
| `hpHit` | 10 | square, normal | `#ff3b2a` | 60–150, 0.4 |
| `monsterDie` | 14 | square, normal | `#1b1726`, `#2c2540` ink | 40–120, 0.6 |
| `flameOut` | 10 | square, normal | smoke `#3a3a3a` rising (`grav = -40`) | 10–40, 1.0 |
| `relight`, `toss` | 16 | square, add | new flame mantle | 40–160, 0.5 |
| `shakeOff` | 8 | square, add | plain mantle `#ff8a1e` | 40–120, 0.4 |
| `heal` | 10 | square, add | `#b6ff8a` rising | 10–40, 0.9 |
| `mineTick` / `mineDone` | 4 / 10 | square, add | mineral crystal light (style 4.4) | 50–140, 0.35 |
| `roll`, `rockLand` | 6 / 14 | `fx_dust` sprite, normal | `#8c8070` | 20–60, 0.5 |
| `beaconLit` | 48 | square, add | `#ffb347`, `#fff4d6` | 60–300, 1.2 |

Additive particles draw in pass 18 (above darkness), normal ones in pass 13 (under darkness: ink and dust are only visible in light). Square = `fillRect(round(x), round(y), size, size)` with `fillStyle` set once per colour bucket (particles are bucketed by `col` per pass: 16 colours max).

## 5. Darkness layer (`src/render/light.ts`, `src/render/memory.ts`)

### 5.1 Canvas and resize rule

- One canvas `res.dark` (+ its 2D context, `{ alpha: true }`), created once, never recreated; resized in place by assigning `width`/`height` only when the wanted size differs.
- Wanted size: `dw = ceil(w * min(dpr, DARK_DPR_CAP) * q.darkRes)`, `dh` likewise, `DARK_DPR_CAP = 1` (DEFAULT, architect: the mask is soft, CSS resolution is enough even on HiDPI). `q.darkRes` = 1 (levels 0–1) or 0.5 (levels 2–3).
- Mapping device px → dark px: `r = dw / cw`. World → dark: `xd = (x * z + ox) * r`. World length → dark: `L * z * r`.
- Memory: 1080p 1920 × 1080 × 4 B = 8.3 MB; 1440p 2560 × 1440 = 14.7 MB; half-res quarters these.

### 5.2 Memory map canvas (`res.memory`)

- `w × h` = `320 × 240` px canvas, 1 px per tile (76 800 px ≪ 16.7 M px Safari limit), plus an `ImageData` buffer of the same size (307 KB) and an `Int32Array(2400)` (`ceil(w*h/32)`) copy of `world.explored`.
- Pixel colour: unexplored → zone darkness fill (style §5: z1 `#0a0806`, z2 `#06080b`, z3 `#050906`, z4 `#0a050c`), alpha 255. Explored floor → `mix(darkFill, memoryTint, 0.35)`; explored wall → `mix(darkFill, memoryTint, 0.12)`; memory tints z1 `#4a4236`, z2 `#3b4a5c`, z3 `#3a5244`, z4 `#4a3a5c`. Zone from `res.tiles.zone`.
- Update per frame: compare 2 400 words with the copy (≈ 2 µs); for each changed word repaint its 32 tiles in the buffer and grow a dirty rect over those tiles; if dirty, upload only that rect: `putImageData(buf, 0, 0, dx, dy, dw, dh)` (a full 307 KB upload would cost ≈ 0.3–0.5 ms). Typical cost: 0–1 words per frame. Key: `tilesHash` (new run → full rebuild).

### 5.3 Build and composite (pass 14)

```ts
export function drawDarkness(ctx: CanvasRenderingContext2D, s: State, v: View, q: Quality): void {
  if (s.debug.reveal) return
  const k = beaconBlend(s)                    // 0 before lighting, ramps to 1 over 1.5 s ([[architecture-render-3]] §2)
  if (k >= 1) return
  const d = ensureDark(v, q)                  // resize in place if needed
  const c = d.ctx
  const r = d.w / v.cw
  c.globalCompositeOperation = 'source-over'
  c.setTransform(1, 0, 0, 1, 0, 0)
  c.fillStyle = '#000'
  c.fillRect(0, 0, d.w, d.h)                  // off-map area
  c.imageSmoothingEnabled = true              // soft memory edges
  const sx = v.tx0, sy = v.ty0, sw = v.tx1 - v.tx0 + 1, sh = v.ty1 - v.ty0 + 1
  const k2 = TILE * v.z * r
  c.drawImage(memoryCanvas(s), sx, sy, sw, sh, (sx * TILE * v.z + v.ox) * r, (sy * TILE * v.z + v.oy) * r, sw * k2, sh * k2)
  c.globalCompositeOperation = 'destination-out'
  for (const L of lightSources(s)) stampMask(c, L, v, r, s)   // §5.4
  c.globalCompositeOperation = 'source-over'
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.globalAlpha = 1 - k
  ctx.drawImage(d.canvas, 0, 0, d.w, d.h, 0, 0, v.cw, v.ch)
  ctx.globalAlpha = 1
  ctx.imageSmoothingEnabled = false
}
```

Monsters standing on remembered tiles stay hidden: their bodies were never drawn (pass 10 uses `inLight`), and the memory pixels are opaque.

### 5.4 Light mask sprites (cache `res.light`)

- One **alpha-only** radial sprite per flame profile and size bucket. Colour is irrelevant for `destination-out`; the profile differs per kind. **Cache key:** `'m:' + kind + ':' + bucket`, `kind ∈ 'none' | 'sodium' | 'copper' | 'strontium' | 'beacon' | 'shaft' | 'ember'`, `bucket ∈ 64 | 128 | 256 | 512` = sprite diameter in px = smallest bucket ≥ the drawn dark-px diameter (cap 512, larger draws scale up; a soft gradient upscales cleanly).
- Build (once per key): `const g = c.createRadialGradient(b/2, b/2, 0, b/2, b/2, b/2)`, stops below with `rgba(255,255,255,a)`, `fillRect(0, 0, b, b)`. Max 7 × 4 = 28 sprites; sizes sum ≈ 7 × (512² + 256² + 128² + 64²) × 4 B ≈ 9.7 MB worst case; in practice only the buckets in use exist (≈ 2–3 MB).
- Drawn radius: outer `Ro = R * 1.25` where `R` = gameplay light radius from `lightSources` (so `inLight` boundary R sits at mask alpha ≈ 0.35, the visible fade-in band). Stamp: `c.drawImage(sprite, xd - Ro', yd - Ro', 2 Ro', 2 Ro')`, `Ro' = Ro * v.z * r * flick`.

| Profile | Stops `(offset: alpha removed)` |
|---|---|
| `none` (plain) | 0: 1, 0.50: 1, 0.80: 0.65, 0.92: 0.25, 1: 0 |
| `sodium` | 0: 1, 0.58: 1, 0.82: 0.6, 0.94: 0.2, 1: 0 |
| `copper` | same as `none` |
| `strontium` | 0: 0.9, 0.40: 0.85, 0.75: 0.45, 0.90: 0.12, 1: 0 (dimmer, hard to navigate) |
| `beacon` (charging) | 0: 1, 0.3: 0.9, 0.7: 0.4, 1: 0 |
| `shaft` (entrance) | 0: 0.85, 0.5: 0.5, 1: 0 |
| `ember` (flame out) | 0: 0.55, 0.6: 0.3, 1: 0 |

### 5.5 Flicker

`flick = 1 + FLICKER_AMP * vnoise(meta.time * flickerFreq, saltOf(seed, kind))` with `FLICKER_AMP = 0.04` (DEFAULT) and `flickerFreq` from the shared flame table `FLAME[kind].flickerFreq` (spec params `tint`, `radiusMul`, `flickerFreq`; DEFAULT none 6 Hz, sodium 9, copper 5, strontium 4). Salt = `hashSeed(meta.seed, 'flicker')`, derived from the run seed, not from the stored cosmetic stream (render may not advance it). Flicker is mask-only; `inLight` uses the unflickered `R`.

### 5.6 Light sources and flame-out

`lightSources(s)` (systems) returns `{ x, y, r, kind }[]`: player flame (`r = lightRadius(s)`, includes `radiusMul`, Devourer push-back and the perfect-parry flare boost), entrance shaft (`r = 72`), Beacon while charging (`r = 96 * beaconHold / BEACON_HOLD`). **Flame out** (`energy <= 0`): gameplay `r = 0`; render additionally stamps `ember` at the player with `r = MIN_PLAYER_GLOW = 22` world px (DEFAULT) so the player silhouette is always readable, and draws a 6 px orange ember glow at the torch tip (pass 17). This mini-glow is cosmetic: `inLight` stays false, so shades next to a flame-out player still show only eyes.

## Related

- [[architecture]]
- [[architecture-render]]
- [[architecture-render-3]]
- [[architecture-resources]]
- [[architecture-resources-2]]
- [[architecture-ui]]
- [[architecture-state]]
- [[architecture-state-2]]
- [[architecture-determinism]]
- [[architecture-assets-style]]
- [[architecture-assets-sprites]]
- [[architecture-assets-sprites-2]]
- [[architecture-assets-sprites-3]]
- [[last-ember-design]]
- [[architecture-scale-and-economy-4]]
- [[architecture-rulings]]
- [[architecture-rulings-3]]
- [[index]]
