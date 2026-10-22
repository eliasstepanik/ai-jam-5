---
type: architecture
title: Last Ember – Render Architecture (2/3) – Tiles, Entities, Particles, Darkness and Memory
description: Last Ember rendering part 2 – chunked tile cache with zone map, floor variant hash and wall bitmask auto-tiling, entity passes with the shared inLight predicate, the analytic particle pool fed by the fx event queue, and the darkness layer with pre-rendered light mask sprites, flicker, memory map and flame-out look.
tags: [project, ai-jam-5, architecture, last-ember, render]
timestamp: 2026-10-22T21:00:00+02:00
---

# Last Ember – Render Architecture (2/3)

> **2.5D pivot ([[ADR-123-2-5d-view]], R-178..R-186 in [[architecture-rulings-3]] §9).** The view is fixed-south 3/4 (2D canvas, 2.5D look). Sections 2.1, 2.2, 3.1–3.4 and 5 below are updated for it: two-canvas chunks with an overhang, tileset atlas frames instead of per-tile sprites, characters from the character atlas at scale 1.0, row-sorted actors. Cell and entity names come from [[ai-jam-5-asset-formats-25d]].

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
| `variant` | `Uint8Array(w*h)` | wall cells: face variant `floor(hash2(tx, ty, seed ^ 0x9e37) * 4)` (`face_fill_<variant>`). Floor variants are NOT stored: they are computed per 24 px cell at paint time, `floorVariant(fx, fy, seed) = floor(hash2(fx, fy, seed) * 10)` (R-179, `keys.ts`) |

Cost: one pass over 76 800 tiles (320×240) plus BFS, about 4–8 ms once per run, on the first world frame (one long frame, accepted; [[architecture-scale-and-economy-4]] §1.3). Landed rocks are NOT baked (they are entities, pass 12).

### 2.2 Chunk cache (DEFAULT, architect)

- Chunk = 8 × 8 tiles = 256 × 256 world px, drawn at 1 texel per world px into TWO canvases per chunk (`OffscreenCanvas`/`HTMLCanvasElement`): `floor` 256 × 256 and `walls` 256 × 304 (transparent; 256 + 48 px south overhang, R-181). `res.tiles.chunks: Map<number, { floor, walls }>`. Chunk grid `CHUNKS_W × CHUNKS_H = ceil(w / 8) × ceil(h / 8)` = 40 × 30 = 1 200 chunks at 320×240 (full map as chunks: 76 800 × 32² × 4 B ≈ 315 MB, never resident, the LRU below is mandatory).
- Contents: floor pattern, ground overlays, wall caps, wall faces, inner-corner cutouts and rims, wall overlays, south-facing ores (all from the tileset atlas, [[architecture-assets-pipeline]] §5). The crater is excluded: it belongs to a landed rock, pass 12. Order: floor pattern → ground overlays → caps → faces → erase cutout then rim → wall overlays and south ores. The `floor` canvas holds the first two steps; the `walls` canvas holds the rest (the wall layer is built on a scratch canvas, then composited into it).
- **Overhang:** a chunk draws the faces of its last tile row into the 48 px below it. The next chunk repaints its own first-row faces on top, so overlapping pixels are identical and chunk build order does not matter.
- **Cache key:** `cx + cy * CHUNKS_W` (no literal grid width) in a `Map<number, { floor, walls }>`, valid while `res.tiles.key === tilesHash + ':' + res.images.gen` (`gen` +1 when a sheet finishes loading or fails, so placeholder-built chunks get rebuilt with art). Key mismatch → clear map.
- **LRU cap 40 chunks** (40 × (256 + 304) × 256 × 4 B ≈ 22 MB, viewport-bound). Visible at 1080p z=2: 960 × 540 world px → at most 5 × 4 = 20 chunks; 1440p z=3: 853 × 480 → 5 × 3 = 15.
- **Build quota: 4 chunks per frame** (unchanged: sprint 240 px/s crosses a chunk column every 1.07 s). A visible chunk without a canvas beyond the quota is drawn directly tile-by-tile into the main context with the same function (`paintChunk(target, cx, cy, offX, offY)`), so the view is never incomplete.
- Drawing: in world transform, `drawFloor` draws `chunk.floor` at `(cx * 256, cy * 256)` for every visible chunk before the actor passes; `drawWallRow(ctx, s, v, ty)` draws the band `[ty * 32, ty * 32 + 32)` of `chunk.walls` (source rect, so each tile row interleaves with the actors of that row, R-180). `imageSmoothingEnabled = false` gives exact `z × z` texels.
- Zone tint (OD-D1, DEFAULT on): each chunk is multiplied once with its majority zone colour at alpha 0.25 (z1 none, z2 `#b8c4d6`, z3 `#b4d0b0`, z4 `#c4b0d8`); the result is cached in the same canvases.

```ts
// floor canvas: 24 px cells, each covered by one 32-tile (the tile under the cell centre)
function paintFloor(c: CanvasRenderingContext2D, s: State, ts: Tileset, cx: number, cy: number): void {
  for (let fy = Math.floor((cy * 256) / 24); fy < Math.ceil(((cy + 1) * 256) / 24); fy++) {
    for (let fx = Math.floor((cx * 256) / 24); fx < Math.ceil(((cx + 1) * 256) / 24); fx++) {
      if (!isFloorAt(s, fx * 24 + 12, fy * 24 + 12)) continue
      blit(c, ts, `floor_${floorVariant(fx, fy, s.meta.seed)}`, fx * 24 - cx * 256, fy * 24 - cy * 256)
    }
  }
  // ground overlays: floor tiles with hash2(tx, ty, seed ^ 0x51) < 0.08 pick a 32x32 ground frame;
  // frames 96x64 and larger (large cracks) only when every covered tile is floor
}
// walls canvas, per tile (ty rows cy*8 .. cy*8+7): cap, then face (bit S set), then inner corners
//   blit(scratch, ts, capName(mask), tx * 32, ty * 32)              // cap_fill_<1+hash%3> for mask 0 when hash < 0.3
//   blit(scratch, ts, faceName(mask, wOpen, eOpen, variant), tx * 32, ty * 32 + 32)
//   per inner bit k: destination-out inner_cutout_k, then source-over inner_rim_k
// then composite scratch -> chunk.walls; wall overlays (wall_vine/roots/moss/crack, south faces, hash < 0.10)
// and south-facing ores wall_<mineral>_<1+vein.id%3> at (tx * 32, ty * 32 + 32)
```

Frame names and anchors come from `cave_tileset.json` through `src/render/tileset.ts` (`tileFrame`, `capName`, `faceName`, `oreName`, `floorName`; [[architecture-modules-render]]). The pure hash and face-kind helpers live in `src/render/keys.ts`. Placeholder tiles (art not loaded) use flat per-zone fills in the same geometry ([[architecture-assets-sprites-2]] §2.3–2.4).

### 2.3 Culling

Visible tile range from `View` (`tx0..tx1`, `ty0..ty1`, padded by one tile). Chunks: `cx0 = tx0 >> 3` .. `cx1 = tx1 >> 3`. Entities: skip when the centre is outside `[x0 - 48, x1 + 48] × [y0 - 48, y1 + 48]` (48 = half the devourer canvas).

## 3. Entity passes (`src/render/entities.ts`)

### 3.1 Veins, pickups, landmarks

- **Veins** (pass 7): veins whose wall tile has bit S set (stand tile south) are drawn by the wall layer as `wall_<mineral>_<1+vein.id%3>` tileset frames (R-186); the entity pass skips them. Other veins keep the rotated `spec_vein-<mineral>` placeholder on the wall cell; rotation = direction of the stand tile (`stand - tile`: `+w` → 0, `-w` → π, `+1` → −π/2, `-1` → π/2). Anim `mining` while `player.mining.targetTile === v.tile`, else `full`. Mined veins are absent (State), so there is no `depleted` draw (R-138).
- **Pickups** (pass 8): resin `p.size === 'large' ? 'item_resin-large' : 'item_resin-small'` (R-139), plants `item_plant`; `y += Math.sin(meta.time * 2 * Math.PI + p.bob)` (±1 px, 1 Hz), no rotation, anim `idle` at its fps from `meta.time`. Pickups sort with the actors by `footRow(y)` (`footOffset` 0, R-180).
- **Landmarks** (pass 9): `spec_entrance` at the entrance centre; `spec_beacon` anim `unlit` (hold 0), `charging` (`beaconHold > 0`), `lit` (`world.beaconLit`). Row-sorted like pickups (`footOffset` 0).

### 3.2 Monsters (pass 10) and eyes (pass 16)

```ts
// pass 10, normal blend, under the darkness: drawn inside the row loop (drawRowEntities), footY sorted (R-180)
for (const m of monstersInRow(ty)) {
  if (!inLight(s, m.x, m.y)) continue // SAME predicate as update (src/systems/light.ts); equals m.seen
  const [anim, frame] = monsterFrame(s, m)
  const f = charFrame(m.kind, anim, dirIndex(monsterDirection(s, m)), frame) // charatlas.ts, atlas character 'lurker' | 'stalker' | 'devourer'
  drawAtlas(ctx, f, m.x - 32, m.y - 32) // scale 1.0 (R-184), pivot (32,32); no MON_SCALE
}
// pass 16, after the darkness, ctx.globalCompositeOperation === 'lighter'
for (const m of s.monsters) {
  if (!inView(v, m.x, m.y) || inLight(s, m.x, m.y) || m.ai === 'dying') continue
  const a = eyeAlpha(s, m) // 0.55 idle with blink, 1.0 telegraph
  drawGlowSprite(ctx, 'eye', m.x + ex, m.y + ey, EYE_HALO_R[m.kind], a) // halo #6b4fb8 / telegraph #b48cff
  drawSprite(ctx, EYES_ID[m.kind], `${eyeAnim(m)}-${monsterDirection(s, m)}`, eyeFrame(s, m), m.x, m.y, 0, 1, a)
}
```

- Monster bodies are atlas frames at scale 1.0 (R-184). The old `MON_SCALE` table is removed. The eye layer (`mon_*_eyes` placeholders) is drawn only outside the light (pass 16) until the atlas has eye-only frames (OD-D7, DEFAULT keep).
- `monsterFrame` maps gameplay states to atlas animations: `ring`/`stalk` → `walk_forward`; `recover`/`stunned` → `idle`; `windup` → `idle` (lurker, stalker) or `attack` frames 0–1 (devourer); `lunge` → `sprint` (lurker), `leap` (stalker) or `attack` frames 2–3 (devourer); `dying` → `death`; hurt → `hit` (stalker), `hurt` (devourer), `idle` (lurker). Frame timing comes from the per-frame `duration_ms`, clamped to the gameplay duration of the state; loop animations start at `floor(meta.time * 1000 + m.id * 370)` ms offset.
- `monsterAngle`: `windup` and `lunge` → `lungeDir`; `dying` → frozen `lungeDir` (no State field needed); else `atan2(vy, vx)` when speed > 5 px/s, else angle to the player. This is only an input to direction selection, never a sprite rotation. `monsterDirection` selects the nearest of the 8 directions (`dirIndex` in `keys.ts`) with clockwise halfway ties. Hold the selected death direction from its first frame; switching other actions’ facing retains the action timer/frame.
- Foot offsets for the row sort (R-180): lurker 25, stalker 30, devourer 24 px below the pivot.
- Eye blink (idle): blink when `hash2(floor(meta.time / 3), m.id, 7) < 0.25` and `meta.time % 3 < 0.25` (stateless). `eyeFrame` selects the 3-frame blink sequence when blinking, otherwise frame 0. Eye halo offsets `ex, ey` come from per-kind, per-direction authored eye centres relative to pivot (32,32) at scale 1.0; do not rotate east eye positions to approximate another view.

### 3.3 Player (pass 11)

- Body anim priority: `death` (`screen === 'dead'`) > `roll` (`roll.t > 0`) > `hurt` (`hitFlash > 0`) > `swing` (`swing.active`) > `mining` > `walk` (`hypot(vx, vy) > 10`) > `idle`. Walk fps ×1.6 in `escape`.
- Player direction: nearest of the 8 directions to `facing` in descent or `atan2(vy, vx)` while moving in escape, otherwise retained facing. Halfway ties go clockwise. Index with `dirIndex`, sprite angle 0; do not rotate or mirror player art. Freeze direction when death begins (R-184).
- Player torch state: `escape ? no_torch : lit ? lit_torch_base : unlit_torch`. Atlas animation mapping: `death` → `death_with_unlit_torch` (torch lit or unlit) or `death_without_torch` (escape); `roll` → `dodge_roll_no_torch` (OD-D2, DEFAULT); `hurt` → `hurt_<state>`; `swing` → `swing_lit_torch_base` (lit only); `mining` → `material_change_lit_torch_base`; walk speed > 10 and ≤ 60 → `walk_lit_torch_base` / `run_without_torch` / `idle_unlit_torch` (OD-D3, DEFAULT: idle while moving when unlit); speed > 60 → the matching `run_*`. There is no pickup timer, so the pickup animation is skipped.
- Player frames are 64×64 with pivot (32,32), drawn at scale 1.0 (R-184); collision radius stays 10; row-sort foot offset 24 (R-180). The stick is baked into the torch-state frames; never draw `player_torch`. `torchTip(s)` remains the glow seam: take `flame_center_anchor` of the displayed frame (`flameAnchor` in `charatlas.ts`) and return player position plus `(anchor - [32,32])`; fallback `(-12, -11)` when the frame has no anchor. In escape, the flame/glow caller skips the torch effect.
- Flame palette swap (R-185): a frame whose flame colours differ from the active mineral flame is swapped with exact RGB compare on the three flame colours, alpha preserved. Swapped frames are lazy 64×64 canvases in an LRU of 256 (≈ 4 MB) keyed `anim|dir|i|material` (`swappedFrame` in `charatlas.ts`, slot in `res`).
- Hit flash: while `hitFlash > 0`, a second `drawSprite` of the same frame with `tint = '#ffffff'` and alpha `hitFlash / HIT_FLASH` ([[architecture-render-3]] §5 tint path).
- Swing arc trail: in pass 17 (additive), `ctx.arc(px, py, 22, a0, a1)` stroke width 6 in the flame mantle colour, alpha `1 - swing.t / SWING_ACTIVE`. One path per frame, no allocation beyond `beginPath`.

### 3.4 Rocks (pass 12, escape)

- Telegraph (`!landed`): `k = 1 - r.t / ROCK_WARN`; `fillStyle = 'rgba(0,0,0,' + (0.2 + 0.4 * k) + ')'`, `arc(x, y, (6 + 10 * k) * r.size, 0, 2π)`. Falling boulder shown when `r.t < 0.35`: scale `1 + 0.8 * (r.t / 0.35)`, alpha `1 - r.t / 0.35 * 0.6`.
- Landed (OD-D4, DEFAULT yes): the `ground_rock_01` / `ground_rock_02` tileset frame (`r.id % 2`) replaces `spec_boulder`, row-sorted like other actors, `footOffset` 0. Crater decal under it.

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

**No wall occlusion (R-182):** the light is a radial mask only. Wall faces and caps inside the radius are lit by the same mask as the floor; nothing casts shadows. A raycast mask stays the STRETCH upgrade ([[architecture-render-3]] §7).

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
- [[architecture-modules-render]]
- [[architecture-assets-pipeline]]
- [[ADR-123-2-5d-view]]
- [[ai-jam-5-asset-formats-25d]]
- [[index]]
