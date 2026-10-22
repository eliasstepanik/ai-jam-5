// L4 render: world props. Veins (pass 7), pickups (pass 8), landmarks: entrance and Beacon (pass 9). Rocks (pass 12) are B17.
// Spec: docs/architecture-render-2.md §3.1, architecture-modules-render.md (props.ts row), GAP G6 (landmarks).
// Reads State only, draws in world space (the caller sets worldXf). Time-driven art uses s.meta.time. No state, no rng, no random calls.
import type { State } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { drawSprite, frameAt } from '../assets/images.ts'
import type { SpriteId } from '../assets/sprites.ts'
import { inView } from './view.ts'
import type { View } from './view.ts'

const VEIN_ID: Record<string, SpriteId> = {
  sodium: 'spec_vein-sodium', copper: 'spec_vein-copper', strontium: 'spec_vein-strontium',
}
const BOB_PX = 1 // render-2 §3.1: +-1 px at 1 Hz
const TAU = Math.PI * 2

// Rotation that turns the south-facing vein art toward the stand tile (render-2 §3.1): +w 0, -w PI, +1 -PI/2, -1 PI/2.
// A stand that is not an orthogonal neighbour (cannot happen for generated veins) keeps the art unrotated.
export function veinRotation(tile: number, stand: number, w: number): number {
  const d = stand - tile
  return d === w ? 0 : d === -w ? Math.PI : d === 1 ? -Math.PI / 2 : d === -1 ? Math.PI / 2 : 0
}

// Pass 7. Mined veins are absent from State, so there is nothing to draw for them.
export function drawVeins(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const w = s.world.w, target = s.player.mining.targetTile
  for (const vn of s.veins) {
    const x = (vn.tile % w) * TILE + TILE / 2, y = Math.floor(vn.tile / w) * TILE + TILE / 2
    if (!inView(v, x, y)) continue
    const id = VEIN_ID[vn.mineral]
    drawSprite(ctx, id, target === vn.tile ? 'mining' : 'full', frameAt(id, target === vn.tile ? 'mining' : 'full', s.meta.time),
      x, y, veinRotation(vn.tile, vn.stand, w))
  }
}

// Pass 8. Resin and plants bob +-1 px; idle frames follow meta.time.
export function drawPickups(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const t = s.meta.time
  for (const p of s.pickups) {
    if (!inView(v, p.x, p.y)) continue
    const id: SpriteId = p.kind === 'plant' ? 'item_plant' : p.size === 'large' ? 'item_resin-large' : 'item_resin-small'
    drawSprite(ctx, id, 'idle', frameAt(id, 'idle', t), p.x, p.y + BOB_PX * Math.sin(t * TAU + p.bob))
  }
}

// Pass 9 (GAP G6, DEFAULT: the entrance art is drawn here). Beacon anim: lit, else charging while held, else unlit.
export function drawLandmarks(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const { entrance, beacon, beaconLit } = s.world, t = s.meta.time
  const ex = entrance.tx * TILE + TILE / 2, ey = entrance.ty * TILE + TILE / 2
  if (inView(v, ex, ey)) drawSprite(ctx, 'spec_entrance', 'idle', 0, ex, ey)
  const bx = beacon.tx * TILE + TILE / 2, by = beacon.ty * TILE + TILE / 2
  if (!inView(v, bx, by)) return
  const anim = beaconLit ? 'lit' : s.player.beaconHold > 0 ? 'charging' : 'unlit'
  drawSprite(ctx, 'spec_beacon', anim, frameAt('spec_beacon', anim, t), bx, by)
}
