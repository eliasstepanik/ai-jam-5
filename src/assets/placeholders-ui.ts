// L4 assets: procedural stand-in art for item_* and ui_* ids, and the merged PLACEHOLDERS table (ACTORS + WORLD + UI).
// Spec: docs/architecture-assets-sprites-3.md §1 (pickups, minerals) and §3 (HUD) "Placeholder" lines, pipeline §3.3, R-097, R-138, R-139.
// Origin = sprite pivot, world/screen units, scale 1, no ctx transforms. Flat colours only: pickup glow and the keycap hold ring are runtime passes.
// ui_cursor does not exist (R-097); hotbar icons are item_mineral-* drawn centred in the slot by the HUD (no separate sprite).
import { ACTORS } from './placeholders-actors.ts'
import type { DrawFn } from './placeholders-actors.ts'
import { WORLD, MINERAL, disc, poly, rect, seg, sprite } from './placeholders-world.ts'
import type { Mineral } from './placeholders-world.ts'
import type { SpriteId } from './sprites.ts'

export type { DrawFn }

const TAU = Math.PI * 2
const OUT = '#0a0809'
type Pt = readonly [number, number]

// ---- pickups ----
// small: one lump + glint travelling over the 4 frames; large: three lumps on a scrap of bark.
const resinSmall = sprite('item_resin-small', (ctx, f) => {
  disc(ctx, 0, 0, 5, '#d9861c', '#8a4a0c')
  rect(ctx, [-2, 0, 1, -1][f], [-2, -2, 0, 1][f], 1, 1, '#ffd27a')
})
const LUMPS: readonly Pt[] = [[-3, 0], [3, -2], [2, 3]]
const resinLarge = sprite('item_resin-large', (ctx, f) => {
  rect(ctx, -9, 2, 18, 6, '#3b2a1e')
  for (const [x, y] of LUMPS) disc(ctx, x, y, 4, '#d9861c', '#8a4a0c')
  const g = LUMPS[f % 3]
  rect(ctx, g[0] - 2, g[1] - 2, 1, 1, '#ffd27a')
})
const plant = sprite('item_plant', (ctx, f) => {
  const sway = [0, 1, 1, 0][f] * 0.5
  for (let k = 0; k < 6; k++) {
    const a = k * TAU / 6
    ctx.beginPath()
    ctx.ellipse(Math.cos(a) * 4 + sway, Math.sin(a) * 4, 5, 2, a, 0, TAU)
    ctx.fillStyle = k % 2 ? '#2e6b3a' : '#4fa35a'
    ctx.fill()
  }
  disc(ctx, 0, 0, 2.5 + 0.4 * Math.sin(f * TAU / 4), '#b6ff8a')
})

// Rotated w x h rectangle as a polygon (no ctx.rotate): centre (0,0), angle in radians.
function bar(w: number, h: number, a: number): Pt[] {
  const c = Math.cos(a), s = Math.sin(a)
  return ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as Pt[]).map(([x, y]) => [x * c - y * s, x * s + y * c])
}
const SHAPE: Record<Mineral, DrawFn> = {
  sodium: sprite('item_mineral-sodium', (ctx) => { // blocky cube
    rect(ctx, -5, -5, 10, 10, OUT)
    rect(ctx, -4, -4, 8, 8, MINERAL.sodium.light)
    rect(ctx, -4, -4, 3, 3, '#ffffff')
  }),
  copper: sprite('item_mineral-copper', (ctx) => { // needle spray on malachite
    disc(ctx, 0, 0, 3, MINERAL.copper.rock, OUT)
    for (const deg of [-30, -90, -150]) {
      const a = deg * Math.PI / 180, x = Math.cos(a) * 6, y = Math.sin(a) * 6
      seg(ctx, 0, 0, x, y, 4, OUT)
    }
    for (const deg of [-30, -90, -150]) {
      const a = deg * Math.PI / 180
      seg(ctx, 0, 0, Math.cos(a) * 6, Math.sin(a) * 6, 2, MINERAL.copper.light)
    }
  }),
  strontium: sprite('item_mineral-strontium', (ctx) => { // two prisms crossed at +-30 degrees
    for (const a of [Math.PI / 6, -Math.PI / 6]) poly(ctx, bar(3, 9, a), MINERAL.strontium.light, OUT)
  }),
}

// ---- HUD ----
const hpPip = sprite('ui_hp-pip', (ctx, f) => {
  if (f === 0) { disc(ctx, 0, 0, 5, '#ff6b4a'); rect(ctx, -2, -3, 1, 1, '#ffb59e') } // full
  else if (f === 1) disc(ctx, 0, 0, 5, '#2a1a16', '#6a4a3e') // empty
  else { // lost: cracked in two, halves pulled apart
    poly(ctx, [[-5, -1], [-1, -1], [-2, 1], [-1, 5], [-5, 3]], '#ff6b4a')
    poly(ctx, [[0, -5], [5, -2], [4, 3], [1, 2], [2, 0]], '#ff6b4a')
    seg(ctx, -1, -5, 1, 5, 1, '#6a4a3e')
  }
})
const slot = sprite('ui_slot', (ctx, f) => {
  ctx.beginPath()
  ctx.rect(-10, -10, 20, 20) // inset by half the stroke so the 22x22 outer box stays inside 24x24
  ctx.fillStyle = '#120f0d'
  ctx.fill()
  ctx.strokeStyle = f ? '#ffd27a' : '#3a2e24'
  ctx.lineWidth = f ? 2 : 1
  ctx.stroke()
  if (f) for (const [x, y] of [[-10, -10], [8, -10], [-10, 8], [8, 8]]) rect(ctx, x, y, 2, 2, '#ffd27a') // selected: corner sparks
})
const depth = sprite('ui_depth', (ctx) => {
  poly(ctx, [[-4, -4], [4, -4], [0, 1]], '#8a7f70')
  seg(ctx, -4, 3, 4, 3, 1, '#8a7f70') // strata lines under the chevron
  seg(ctx, -3, 5, 3, 5, 1, '#8a7f70')
})
// ponytail: spec tip (12,0) pulled in to x=11 so the 1 px outline stays inside the 24 px frame; art replaces this.
const exitArrow = sprite('ui_exit-arrow', (ctx) => poly(ctx, [[11, 0], [-8, -8], [-8, 8]], '#cfe3ff', OUT))
const keycap = sprite('ui_keycap', (ctx) => { // the letter and the hold ring are drawn by the HUD
  rect(ctx, -7, -7, 14, 14, '#3a2e24')
  rect(ctx, -7, -7, 14, 3, '#5c4a38')
})

type UiId = Extract<SpriteId, `item_${string}` | `ui_${string}`>
export const UI: Record<UiId, DrawFn> = {
  'item_resin-small': resinSmall, 'item_resin-large': resinLarge, item_plant: plant,
  'item_mineral-sodium': SHAPE.sodium, 'item_mineral-copper': SHAPE.copper, 'item_mineral-strontium': SHAPE.strontium,
  'ui_hp-pip': hpPip, ui_slot: slot, ui_depth: depth, 'ui_exit-arrow': exitArrow, ui_keycap: keycap,
}

export const PLACEHOLDERS: Record<SpriteId, DrawFn> = { ...ACTORS, ...WORLD, ...UI }
