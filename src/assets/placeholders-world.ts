// L4 assets: procedural stand-in art for every world sprite id (tiles, specials, fx, props) + the small draw helpers -ui reuses.
// Spec: docs/architecture-assets-sprites-2.md §2.3-2.4, §3.1-3.5 and sprites-3.md §2 "Placeholder" lines, style §4.2 zone ramp, pipeline §3.3.
// Origin = sprite pivot (tiles: top-left, 0..32), world units, scale 1, no ctx transforms. `anim` is the manifest anim key; `frame` is clamped.
// Pure: canvas 2D calls only, noise from core, `t` is a parameter. Flat colours only: every glow/light/shaft is the runtime pass, not drawn here.
import { hash2 } from '../core/noise.ts'
import { SPRITES } from './sprites.ts'
import type { SpriteId } from './sprites.ts'
import type { DrawFn } from './placeholders-actors.ts'

type Ctx = CanvasRenderingContext2D
type Pt = readonly [number, number]
const TAU = Math.PI * 2

// Manifest frame index for (id, anim, frame); unknown anim falls back to the first anim, bad frame to 0 (never throws in the render loop).
function frameOf(id: SpriteId, anim: string, frame: number): number {
  const a = SPRITES[id].anims[anim] ?? Object.values(SPRITES[id].anims)[0]
  return Number.isFinite(frame) ? Math.max(0, Math.min(a.n - 1, Math.floor(frame))) : 0
}
export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  ctx.fillStyle = col
  ctx.fillRect(x, y, w, h)
}
export function disc(ctx: Ctx, x: number, y: number, r: number, col: string, edge?: string, ew = 1): void {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fillStyle = col
  ctx.fill()
  if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = ew; ctx.stroke() }
}
export function seg(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, col: string): void {
  ctx.strokeStyle = col
  ctx.lineWidth = w
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}
export function poly(ctx: Ctx, pts: readonly Pt[], col: string, edge?: string, ew = 1): void {
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.closePath()
  ctx.fillStyle = col
  ctx.fill()
  if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = ew; ctx.stroke() }
}
function ring(ctx: Ctx, r: number, w: number, col: string, sweep = TAU): void {
  ctx.strokeStyle = col
  ctx.lineWidth = w
  ctx.beginPath()
  ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + sweep)
  ctx.stroke()
}
function curve(ctx: Ctx, c: readonly number[], w: number, col: string): void {
  ctx.strokeStyle = col
  ctx.lineWidth = w
  ctx.beginPath()
  ctx.moveTo(c[0], c[1])
  ctx.quadraticCurveTo(c[2], c[3], c[4], c[5])
  ctx.stroke()
}

// Wraps a body: resolves the frame, isolates ctx state (alpha, joins) from the caller. Round joins/caps keep strokes inside the frame.
type Body = (ctx: Ctx, f: number, t: number, anim: string) => void
export const sprite = (id: SpriteId, body: Body): DrawFn => (ctx, anim, frame, t) => {
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  body(ctx, frameOf(id, anim, frame), t, anim)
  ctx.restore()
}

// style §4.2 zone ramp: wall-dark, wall, floor-dark, floor, floor-light
const ZONES = [
  { wd: '#1c1714', w: '#2a2420', fd: '#2e2823', f: '#3a332d', fl: '#544a40' },
  { wd: '#13161b', w: '#1f242b', fd: '#22272e', f: '#2d333b', fl: '#454e59' },
  { wd: '#111612', w: '#1b231d', fd: '#1f2821', f: '#29342c', fl: '#3f5044' },
  { wd: '#120d16', w: '#1d1524', fd: '#211a28', f: '#2b2234', fl: '#463a55' },
] as const
const OUT = '#0a0809'
const DEEP = '#141114'
export const MINERAL = {
  sodium: { base: '#c9a400', light: '#ffe14a', rock: '#454e59' },
  copper: { base: '#0e7f74', light: '#1fd6b8', rock: '#2f5a3a' },
  strontium: { base: '#7a0a1a', light: '#e0182d', rock: '#22272e' },
} as const
export type Mineral = keyof typeof MINERAL

// ---- tiles: opaque edge to edge (no seams in a mixed 3x3), grit is hash2 noise salted by the variant ----
const floor = (id: SpriteId, zone: number): DrawFn => sprite(id, (ctx, v) => {
  const z = ZONES[zone]
  rect(ctx, 0, 0, 32, 32, z.f)
  for (let k = 0; k < 9; k++) rect(ctx, Math.floor(hash2(k, v, 11 + zone) * 31), Math.floor(hash2(k, v, 37 + zone) * 31), 1, 1, z.fd)
  const dot = [null, [8, 8], [20, 14], [12, 24]][v]
  if (dot) rect(ctx, dot[0], dot[1], 2, 2, z.fl)
})
// Bit set = floor neighbour on that side (N1 E2 S4 W8): a 4 px wall-dark band plus a 1 px crease. Rock-top lumps ignore the mask so interiors join up.
const wall = (id: SpriteId, zone: number): DrawFn => sprite(id, (ctx, mask) => {
  const z = ZONES[zone]
  rect(ctx, 0, 0, 32, 32, z.w)
  for (let k = 0; k < 7; k++) rect(ctx, Math.floor(hash2(k, 0, 53 + zone) * 26) + 1, Math.floor(hash2(k, 1, 53 + zone) * 26) + 1, 5, 3, z.fd)
  if (mask & 1) { rect(ctx, 0, 0, 32, 4, z.wd); rect(ctx, 0, 4, 32, 1, OUT) }
  if (mask & 2) { rect(ctx, 28, 0, 4, 32, z.wd); rect(ctx, 27, 0, 1, 32, OUT) }
  if (mask & 4) { rect(ctx, 0, 28, 32, 4, z.wd); rect(ctx, 0, 27, 32, 1, OUT) }
  if (mask & 8) { rect(ctx, 0, 0, 4, 32, z.wd); rect(ctx, 4, 0, 1, 32, OUT) }
})
const INNER: readonly Pt[] = [[28, 0], [28, 28], [0, 28], [0, 0]] // NE, SE, SW, NW
const inner = (id: SpriteId, zone: number): DrawFn => sprite(id, (ctx, k) => rect(ctx, INNER[k][0], INNER[k][1], 4, 4, ZONES[zone].wd))

// ---- specials ----
const entrance = sprite('spec_entrance', (ctx) => {
  rect(ctx, -28, -28, 56, 56, '#544a40')
  for (let i = 1; i <= 4; i++) rect(ctx, -28 + 6 * i, -28 + 6 * i, 56 - 12 * i, 56 - 12 * i, i % 2 ? '#3a332d' : '#544a40')
  seg(ctx, -30, -22, -30, 8, 2, '#8c8070') // frayed rope pegged beside the steps; the light shaft is the runtime pass
})
const beacon = sprite('spec_beacon', (ctx, f, t, anim) => {
  const lit = anim === 'lit', charging = anim === 'charging'
  disc(ctx, 0, 0, 28, '#4a4a55', '#2a2a30', 2)
  for (let k = 0; k < 12; k++) disc(ctx, Math.cos(k * TAU / 12) * 24, Math.sin(k * TAU / 12) * 24, 1.5, lit ? '#ffb347' : '#2a2a30')
  disc(ctx, 0, 0, 16, '#5a3a1e', '#8a5a2a', 2)
  disc(ctx, 0, 0, 12, DEEP)
  if (charging) { // ponytail: sweep follows the frame (hold progress is not a DrawFn input); cracks grow with it
    const p = (f + 1) / 4
    for (let k = 0; k < 6; k++) seg(ctx, Math.cos(k + 0.3) * 2, Math.sin(k + 0.3) * 2, Math.cos(k + 0.3) * (2 + 9 * p), Math.sin(k + 0.3) * (2 + 9 * p), 1.5, '#c2410c')
    ring(ctx, 30, 3, '#ff8a1e', TAU * p)
  } else if (lit) { // flat stand-in for the radial fire: three flat discs; licks rotate clockwise with the frame, core pulses 12 +- 2 at 3 Hz
    const rr = 12 + 2 * Math.sin(TAU * 3 * t)
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6 + f * TAU / 36
      seg(ctx, Math.cos(a) * 8, Math.sin(a) * 8, Math.cos(a) * (rr + 4), Math.sin(a) * (rr + 4), 3, '#ff6a00')
    }
    disc(ctx, 0, 0, rr, '#ffb347')
    disc(ctx, 0, 0, rr - 5, '#fff4d6')
  }
})
// Crystals grow toward the floor (south): 4 triangles base 6 height 10 on the lower half, host rock under them. mining = shake, chips, crack.
const vein = (m: Mineral): DrawFn => sprite(`spec_vein-${m}`, (ctx, f, _t, anim) => {
  const c = MINERAL[m], mining = anim === 'mining', dx = mining ? [-1, 0, 1][f] : 0
  rect(ctx, -13, 3, 26, 4, c.rock)
  for (const x of [6, 12, 18, 24]) {
    const cx = x - 16 + dx
    poly(ctx, [[cx - 3, 5], [cx + 3, 5], [cx, 15]], c.light, OUT)
    rect(ctx, cx - 1, 6, 1, 3, c.base)
  }
  if (!mining) return
  rect(ctx, -6 + 4 * f, 8 + 2 * f, 2, 2, c.light)
  rect(ctx, 4 + 3 * f, 6 + 3 * f, 2, 2, c.light)
  seg(ctx, -2, 4, -2 + 3 * f, 4 - 2 * f, 1, OUT)
})
// ponytail: spec_chamber decor is invisible until art exists (spec: pipeline §3.3, sprites-2 §3.4 "none drawn"); the explicit no-op keeps the table total.
const chamber: DrawFn = () => {}
const boulder = sprite('spec_boulder', (ctx, v) => {
  const pts: Pt[] = []
  for (let k = 0; k < 12; k++) { const r = 11 + 2 * hash2(k, v, 41); pts.push([Math.cos(k * TAU / 12) * r, Math.sin(k * TAU / 12) * r]) }
  poly(ctx, pts, '#454e59', OUT)
  for (let k = 0; k < 3; k++) disc(ctx, (hash2(k, v, 43) - 0.5) * 10, (hash2(k, v, 47) - 0.5) * 10, 2 + hash2(k, v, 49), '#2d333b')
})
const crater = sprite('spec_crater', (ctx) => {
  ring(ctx, 18, 3, DEEP)
  for (let k = 0; k < 8; k++) {
    const a = k * TAU / 8 + hash2(k, 0, 59) * 0.4, r = 6 + 8 * hash2(k, 1, 59)
    seg(ctx, Math.cos(a) * 6, Math.sin(a) * 6, Math.cos(a) * r, Math.sin(a) * r, 1, DEEP)
  }
})
const dust = sprite('fx_dust', (ctx, f) => {
  const p = f / 4, r = 4 + 10 * p
  ctx.globalAlpha = 0.6 - 0.52 * p // spec fades to 0; the last frame keeps 0.08 so every frame still draws
  if (f < 2) disc(ctx, 0, 0, r, '#8c8070')
  else for (let k = 0; k < 8; k++) disc(ctx, Math.cos(k * TAU / 8) * (r - 3), Math.sin(k * TAU / 8) * (r - 3), 2.5 + 1.5 * hash2(k, f, 61), '#8c8070')
})

// ---- props ----
const stalagmite = sprite('prop_stalagmite', (ctx, zone) => {
  const z = ZONES[zone]
  disc(ctx, 0, 0, 10, z.w, z.wd)
  ring(ctx, 7, 1, z.wd)
  disc(ctx, 0, 0, 4, z.fl)
})
const bones = sprite('prop_bones', (ctx, v) => {
  if (v === 0) {
    seg(ctx, -9, -5, 2, 4, 2, '#8c8070'); seg(ctx, -6, 4, 9, -3, 2, '#8c8070'); seg(ctx, -2, -9, 8, 7, 2, '#8c8070')
    disc(ctx, -9, -5, 1.5, '#b8ab94'); disc(ctx, 9, -3, 1.5, '#b8ab94')
  } else {
    seg(ctx, 0, 0, 11, 8, 2, '#8c8070'); seg(ctx, 2, 6, 10, -6, 2, '#8c8070')
    disc(ctx, -4, -3, 4, '#b8ab94')
    rect(ctx, -6, -4, 1, 2, DEEP); rect(ctx, -3, -4, 1, 2, DEEP)
  }
})
const roots = sprite('prop_roots', (ctx, v) => {
  const m = (x: number): number => (v ? 32 - x : x)
  for (const c of [[2, 3, 14, 8, 20, 18], [6, 29, 16, 22, 29, 12]]) {
    const q = [m(c[0]), c[1], m(c[2]), c[3], m(c[4]), c[5]]
    curve(ctx, q, 3, '#3b2a1e')
    curve(ctx, q, 1, '#5a4030')
  }
})
const CLUSTER: readonly (readonly Pt[])[] = [[[-3, -2], [2, 0], [-1, 3]], [[-4, 1], [1, -3], [3, 2]], [[0, -3], [-3, 2], [3, 3]]]
const mushroom = sprite('prop_mushroom', (ctx, v) => {
  for (const [x, y] of CLUSTER[v]) { seg(ctx, x, y + 1, x, y + 4, 1, '#463a55'); disc(ctx, x, y, 2, '#6a5a88') }
})
const puddle = sprite('prop_puddle', (ctx, v) => {
  ctx.beginPath()
  ctx.ellipse(16, 16, 12, 7, v * 0.5, 0, TAU)
  ctx.fillStyle = '#13161b'
  ctx.fill()
  ctx.strokeStyle = '#454e59'
  ctx.lineWidth = 1
  ctx.stroke()
})

type WorldId = Extract<SpriteId, `tile_${string}` | `spec_${string}` | `fx_${string}` | `prop_${string}`>
export const WORLD: Record<WorldId, DrawFn> = {
  tile_z1_floor: floor('tile_z1_floor', 0), tile_z1_wall: wall('tile_z1_wall', 0), tile_z1_inner: inner('tile_z1_inner', 0),
  tile_z2_floor: floor('tile_z2_floor', 1), tile_z2_wall: wall('tile_z2_wall', 1), tile_z2_inner: inner('tile_z2_inner', 1),
  tile_z3_floor: floor('tile_z3_floor', 2), tile_z3_wall: wall('tile_z3_wall', 2), tile_z3_inner: inner('tile_z3_inner', 2),
  tile_z4_floor: floor('tile_z4_floor', 3), tile_z4_wall: wall('tile_z4_wall', 3), tile_z4_inner: inner('tile_z4_inner', 3),
  spec_entrance: entrance, spec_beacon: beacon, spec_chamber: chamber, spec_boulder: boulder, spec_crater: crater,
  'spec_vein-sodium': vein('sodium'), 'spec_vein-copper': vein('copper'), 'spec_vein-strontium': vein('strontium'),
  fx_dust: dust, prop_stalagmite: stalagmite, prop_bones: bones, prop_roots: roots, prop_mushroom: mushroom, prop_puddle: puddle,
}
