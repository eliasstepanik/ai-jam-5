// L4 render: world props in the 2.5D row sort (R-180). Pickups (pass 8), landmarks: entrance and Beacon (pass 9), landed rocks (pass 12)
// and fallback veins go into actor row buckets through `propActors`; `drawProp` draws one bucket entry inside the row loop.
// All four mapped ore directions are baked into their owning wall row.
// `drawRocks` draws the telegraph circles and falling boulders after the row loop.
// Prop tags in the bucket entries (entities.ts owns 0 monster, 1 player); `i` is the index into the State array named here:
//   2 TAG_PICKUP    i = index in s.pickups
//   3 TAG_LANDMARK  i = 0 entrance, 1 Beacon
//   4 TAG_ROCK      i = index in s.rocks (landed rocks only)
//   5 TAG_VEIN      i = index in s.veins (veins the wall layer does not bake: unmapped or malformed wall cell)
// Spec: docs/architecture-render-2.md §3.1, §3.4, architecture-modules-render.md (props.ts row), R-180, R-186.
// Reads State only, draws in world space (the caller sets worldXf). Time-driven art uses s.meta.time. No state, no rng, no random calls.
import { visibleDressing, dressingCache, drawDressingProp } from './dressing.ts'
import { CAVE_DRESSING } from '../core/cave-props.ts'
import { beaconPosition } from '../world/beacon-position.ts'
import type { Rock, State } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { T } from '../core/tuning.ts'
import { clamp } from '../core/math.ts'
import { drawSprite, frameAt } from '../assets/images.ts'
import type { SpriteId } from '../assets/sprites.ts'
import { inView } from './view.ts'
import type { View } from './view.ts'
import { beaconName, blit, oreDirection, oreName, rockName, tilesetOf } from './tileset.ts'
import { entranceWall } from '../world/entrance-art.ts'
import { FACE_H } from './tiles-paint.ts'


export const TAG_PICKUP = 2
export const TAG_LANDMARK = 3
export const TAG_ROCK = 4
export const TAG_VEIN = 5
export const TAG_DRESSING = 6

const VEIN_ID: Record<string, SpriteId> = {
  sodium: 'spec_vein-sodium', copper: 'spec_vein-copper', strontium: 'spec_vein-strontium',
}
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

// Every mapped wall vein is baked using its authored direction. Unmapped test worlds retain the prop fallback.
function wallBaked(s: State, tile: number): boolean {
  return s.world.tiles[tile] === '#'
}

// Pushes every visible prop into the actor row buckets. Foot y = pivot y (footOffset 0, R-180).
export function propActors(s: State, v: View, push: (footY: number, tag: number, i: number) => void): void {
  for (const p of visibleDressing(s, v)) if (CAVE_DRESSING[p.def].layer === 'actor') push(p.y, TAG_DRESSING, p.tile)
  const { w, h, tiles, entrance } = s.world, mapped = w > 0 && tiles.length === w * h // false: no wall bake runs, veins are props
  for (let i = 0; i < s.pickups.length; i++) {
    const p = s.pickups[i]
    if (inView(v, p.x, p.y)) push(p.y, TAG_PICKUP, i)
  }
  const [ex, ey] = [entrance.tx * TILE + TILE / 2, entrance.ty * TILE + TILE / 2]
  if (inView(v, ex, ey)) push(ey, TAG_LANDMARK, 0)
  const { x: bx, y: by } = beaconPosition(s)
  if (bx >= v.x0 - 64 && bx <= v.x1 + 64 && by >= v.y0 - 56 && by <= v.y1 + 104) push(by, TAG_LANDMARK, 1)
  for (let i = 0; i < s.rocks.length; i++) {
    const r = s.rocks[i]
    if (r.landed && inView(v, r.x, r.y)) push(r.y, TAG_ROCK, i)
  }
  for (let i = 0; i < s.veins.length; i++) {
    const vn = s.veins[i]
    // Wall row painting owns all four ore orientations.
    if (mapped && wallBaked(s, vn.tile)) continue
    const [x, y] = centre(vn.tile, w)
    if (inView(v, x, y)) push(y, TAG_VEIN, i)
  }
}

// Five authored falling/impact pairs per size, selected by stable rock id. Native 2x2 art is not scaled twice.
function boulder(ctx: CanvasRenderingContext2D, v: View, r: Rock, k: number, alpha: number): void {
  const ts = tilesetOf(), x = Math.round(r.x * v.z) / v.z, y = Math.round(r.y * v.z) / v.z
  ctx.save()
  ctx.translate(x, y)
  const scale = ts ? k / r.size : k
  ctx.scale(scale, scale)
  if (ts) {
    ctx.globalAlpha = alpha
    blit(ctx, ts, rockName(r.size, r.id, r.landed), 0, 0)
  } else drawSprite(ctx, 'spec_boulder', 'v', r.id % 3, 0, 0, 0, 1, alpha)
  ctx.restore()
}

// Draws the bucket entry (tag, i) written by `propActors`; an index that no longer exists draws nothing.
export function drawProp(ctx: CanvasRenderingContext2D, s: State, v: View, tag: number, i: number): void {
  const t = s.meta.time
  if (tag === TAG_DRESSING) {
    const p = dressingCache(s).cells.get(i)
    if (p) drawDressingProp(ctx, p)
  } else if (tag === TAG_PICKUP) {
    const p = s.pickups[i]
    if (!p) return
    const id: SpriteId = p.kind === 'plant' ? 'item_plant' : p.size === 'large' ? 'item_resin-large' : 'item_resin-small'
    const ts = tilesetOf(), y = p.y
    const name = p.kind === 'plant' ? 'ground_heal_plant' : (p.size === 'large' ? 'ground_resin_big_0' : 'ground_resin_blob_0') + (1 + i % 3)
    if (ts) blit(ctx, ts, name, p.x, y)
    else drawSprite(ctx, id, 'idle', frameAt(id, 'idle', t), p.x, y)
  } else if (tag === TAG_LANDMARK) {
    const { entrance, beaconLit } = s.world
    if (i === 0) {
      if (!tilesetOf() || !entranceWall(s)) drawSprite(ctx, 'spec_entrance', 'idle', 0, entrance.tx * TILE + TILE / 2, entrance.ty * TILE + TILE / 2)
    }
    else {
      const anim = beaconLit ? 'lit' : s.player.beaconHold > 0 ? 'charging' : 'unlit'
      const ts = tilesetOf(), { x, y } = beaconPosition(s)
      if (ts) blit(ctx, ts, beaconName(beaconLit, t), x, y)
      else drawSprite(ctx, 'spec_beacon', anim, frameAt('spec_beacon', anim, t), x, y)
    }
  } else if (tag === TAG_ROCK) {
    const r = s.rocks[i]
    if (!r || !r.landed) return
    // Crater decal under the boulder (render-2 §3.4); the walls canvas does not hold it.
    if (!tilesetOf()) {
      ctx.save(); ctx.translate(r.x, r.y); ctx.scale(r.size, r.size)
      drawSprite(ctx, 'spec_crater', 'idle', 0, 0, 0)
      ctx.restore()
    }
    boulder(ctx, v, r, r.size, 1)
  } else if (tag === TAG_VEIN) {
    const vn = s.veins[i]
    if (!vn) return
    const w = s.world.w, [x, y] = centre(vn.tile, w), id = VEIN_ID[vn.mineral], anim = s.player.mining.targetTile === vn.tile ? 'mining' : 'full'
    const ts = tilesetOf(), direction = oreDirection(vn.tile, vn.stand, w)
    if (ts) blit(ctx, ts, oreName(vn.mineral, vn.id, direction), direction === 'south' ? x : x - 16, direction === 'south' ? y - 8 : y - 16 - FACE_H)
    else drawSprite(ctx, id, anim, frameAt(id, anim, t), x, y - FACE_H, veinRotation(vn.tile, vn.stand, w))
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
