// L4 render: world props in the 2.5D row sort (R-180). Pickups (pass 8), landmarks: entrance and Beacon (pass 9), landed rocks (pass 12)
// and non-south-facing veins (pass 7) go into the actor row buckets through `propActors`; `drawProp` draws one bucket entry inside the
// row loop. South-facing veins (stand tile directly south, cap mask bit S set) are skipped here: the wall layer bakes the tileset ore frame (R-186).
// `drawRocks` draws the telegraph circles and falling boulders after the row loop.
// Prop tags in the bucket entries (entities.ts owns 0 monster, 1 player); `i` is the index into the State array named here:
//   2 TAG_PICKUP    i = index in s.pickups
//   3 TAG_LANDMARK  i = 0 entrance, 1 Beacon
//   4 TAG_ROCK      i = index in s.rocks (landed rocks only)
//   5 TAG_VEIN      i = index in s.veins (veins the wall layer does not bake: stand not south, or bit S unset)
// Spec: docs/architecture-render-2.md §3.1, §3.4, architecture-modules-render.md (props.ts row), R-180, R-186.
// Reads State only, draws in world space (the caller sets worldXf). Time-driven art uses s.meta.time. No state, no rng, no random calls.
import type { Rock, State } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { T } from '../core/tuning.ts'
import { clamp } from '../core/math.ts'
import { drawSprite, frameAt } from '../assets/images.ts'
import type { SpriteId } from '../assets/sprites.ts'
import { inView } from './view.ts'
import type { View } from './view.ts'
import { blit, tilesetOf } from './tileset.ts'
import { FACE_H } from './tiles-paint.ts'

const HASH = 35 // '#', wall char of World.tiles (same value as tiles-paint.ts)

export const TAG_PICKUP = 2
export const TAG_LANDMARK = 3
export const TAG_ROCK = 4
export const TAG_VEIN = 5

const VEIN_ID: Record<string, SpriteId> = {
  sodium: 'spec_vein-sodium', copper: 'spec_vein-copper', strontium: 'spec_vein-strontium',
}
const BOB_PX = 1 // render-2 §3.1: +-1 px at 1 Hz
const TAU = Math.PI * 2
const FALL_S = 0.35 // render-2 §3.4: a rock shows as a falling boulder when r.t < 0.35 s
const FALL_GROW = 0.8 // falling boulder scale 1 + 0.8 * (r.t / FALL_S)
const FALL_FADE = 0.6 // falling boulder alpha 1 - 0.6 * (r.t / FALL_S)

// Rotation that turns the south-facing vein art toward the stand tile (render-2 §3.1): +w 0, -w PI, +1 -PI/2, -1 PI/2.
// A stand that is not an orthogonal neighbour (cannot happen for generated veins) keeps the art unrotated.
export function veinRotation(tile: number, stand: number, w: number): number {
  const d = stand - tile
  return d === w ? 0 : d === -w ? Math.PI : d === 1 ? -Math.PI / 2 : d === -1 ? Math.PI / 2 : 0
}

const centre = (tile: number, w: number): [number, number] => [(tile % w) * TILE + TILE / 2, Math.floor(tile / w) * TILE + TILE / 2]

// True when the wall layer bakes the south ore frame for this vein: `tile` is a wall cell and its south neighbour is in the map and not
// wall, i.e. bit S (4) of the cap mask. ponytail: mirrors the S bit of buildMaps in tiles.ts (wall cells only, off-map = wall) so props.ts
// needs no tiles.ts import (module tree); keep in sync with it. Callers guarantee tiles.length === w * h and w > 0.
function southBaked(s: State, tile: number): boolean {
  const { w, h, tiles } = s.world, y = Math.floor(tile / w)
  return tiles.charCodeAt(tile) === HASH && y + 1 < h && tiles.charCodeAt(tile + w) !== HASH
}

// Pushes every visible prop into the actor row buckets. Foot y = pivot y (footOffset 0, R-180).
export function propActors(s: State, v: View, push: (footY: number, tag: number, i: number) => void): void {
  const { w, h, tiles, entrance, beacon } = s.world, mapped = w > 0 && tiles.length === w * h // false: no wall bake runs, veins are props
  for (let i = 0; i < s.pickups.length; i++) {
    const p = s.pickups[i]
    if (inView(v, p.x, p.y)) push(p.y, TAG_PICKUP, i)
  }
  const [ex, ey] = [entrance.tx * TILE + TILE / 2, entrance.ty * TILE + TILE / 2]
  if (inView(v, ex, ey)) push(ey, TAG_LANDMARK, 0)
  const [bx, by] = [beacon.tx * TILE + TILE / 2, beacon.ty * TILE + TILE / 2]
  if (inView(v, bx, by)) push(by, TAG_LANDMARK, 1)
  for (let i = 0; i < s.rocks.length; i++) {
    const r = s.rocks[i]
    if (r.landed && inView(v, r.x, r.y)) push(r.y, TAG_ROCK, i)
  }
  for (let i = 0; i < s.veins.length; i++) {
    const vn = s.veins[i]
    // South ore: paintWalls (tiles-paint.ts) bakes it into the walls canvas only when the stand is directly south and the cap mask has bit S (4).
    // Skip exactly then (the complement of its `stand !== tile + w || !(mask & 4)` skip); a south stand without bit S, or an empty/mismatched
    // world (no bake runs), is drawn here as a prop so it never vanishes (R-186).
    if (mapped && vn.stand === vn.tile + w && southBaked(s, vn.tile)) continue
    const [x, y] = centre(vn.tile, w)
    if (inView(v, x, y)) push(y, TAG_VEIN, i)
  }
}

// Boulder art at the rock centre: the tileset frame ground_rock_01/02 (r.id % 2) when the sheet is loaded, else spec_boulder.
// A 2x2 rock scales the 32 px art by `k`. The frame anchor is (16, 24); (x, y + 8k) puts the frame centre on the rock centre.
function boulder(ctx: CanvasRenderingContext2D, v: View, r: Rock, k: number, alpha: number): void {
  const ts = tilesetOf(), x = Math.round(r.x * v.z) / v.z, y = Math.round(r.y * v.z) / v.z
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(k, k)
  if (ts) {
    ctx.globalAlpha = alpha
    blit(ctx, ts, 'ground_rock_0' + (1 + (r.id % 2)), 0, 8)
  } else drawSprite(ctx, 'spec_boulder', 'v', r.id % 3, 0, 0, 0, 1, alpha)
  ctx.restore()
}

// Draws the bucket entry (tag, i) written by `propActors`; an index that no longer exists draws nothing.
export function drawProp(ctx: CanvasRenderingContext2D, s: State, v: View, tag: number, i: number): void {
  const t = s.meta.time
  if (tag === TAG_PICKUP) {
    const p = s.pickups[i]
    if (!p) return
    const id: SpriteId = p.kind === 'plant' ? 'item_plant' : p.size === 'large' ? 'item_resin-large' : 'item_resin-small'
    drawSprite(ctx, id, 'idle', frameAt(id, 'idle', t), p.x, p.y + BOB_PX * Math.sin(t * TAU + p.bob))
  } else if (tag === TAG_LANDMARK) {
    const { entrance, beacon, beaconLit } = s.world
    if (i === 0) drawSprite(ctx, 'spec_entrance', 'idle', 0, entrance.tx * TILE + TILE / 2, entrance.ty * TILE + TILE / 2)
    else {
      const anim = beaconLit ? 'lit' : s.player.beaconHold > 0 ? 'charging' : 'unlit'
      drawSprite(ctx, 'spec_beacon', anim, frameAt('spec_beacon', anim, t), beacon.tx * TILE + TILE / 2, beacon.ty * TILE + TILE / 2)
    }
  } else if (tag === TAG_ROCK) {
    const r = s.rocks[i]
    if (!r || !r.landed) return
    // Crater decal under the boulder (render-2 §3.4); the walls canvas does not hold it.
    ctx.save()
    ctx.translate(r.x, r.y)
    ctx.scale(r.size, r.size)
    drawSprite(ctx, 'spec_crater', 'idle', 0, 0, 0)
    ctx.restore()
    boulder(ctx, v, r, r.size, 1)
  } else if (tag === TAG_VEIN) {
    const vn = s.veins[i]
    if (!vn) return
    const w = s.world.w, [x, y] = centre(vn.tile, w), id = VEIN_ID[vn.mineral], anim = s.player.mining.targetTile === vn.tile ? 'mining' : 'full'
    drawSprite(ctx, id, anim, frameAt(id, anim, t), x, y - FACE_H, veinRotation(vn.tile, vn.stand, w))
  }
}

// Pass 12 after the row loop: telegraph shadow circles and falling boulders. Landed rocks are drawn in the row buckets (tag 4).
export function drawRocks(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  for (const r of s.rocks) {
    if (r.landed || !inView(v, r.x, r.y)) continue
    const k = clamp(1 - r.t / T.escape.rockWarnS, 0, 1)
    ctx.fillStyle = 'rgba(0,0,0,' + (0.2 + 0.4 * k) + ')'
    ctx.beginPath()
    ctx.arc(r.x, r.y, (6 + 10 * k) * r.size, 0, TAU)
    ctx.fill()
    if (r.t >= FALL_S) continue
    const f = Math.max(0, r.t) / FALL_S
    boulder(ctx, v, r, r.size * (1 + FALL_GROW * f), 1 - FALL_FADE * f)
  }
}
