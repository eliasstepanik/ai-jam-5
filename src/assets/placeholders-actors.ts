// L4 assets: procedural stand-in art for every actor id (player sets, three shades, their eye sheets).
// Spec: docs/architecture-assets-pipeline.md §3.3, architecture-assets-sprites.md §2, §4.1, §5 (R-154, R-155), style §palette.
// Origin = sprite pivot, world units, scale 1, caller rotation 0. `anim` is the full key '<action>-<direction>'. Each direction is
// built directly by mapping east-reference coordinates through that direction's axes: no ctx.rotate/scale, no mirrored art.
// Pure: only canvas 2D calls, noise from core, `t` is a parameter. No module-level state besides constants.
import { hash2, vnoise } from '../core/noise.ts'
import { ACTOR_FRAME, SPRITES } from './sprites.ts'
import type { ActorId, Direction } from './sprites.ts'

// DrawFn lives HERE (not in placeholders-ui.ts as the module table says): ui.ts imports this file for the spread, so a type
// import back from ui would be a type-only cycle (R-150). placeholders-world/-ui import it from here; ui re-exports it.
export type DrawFn = (ctx: CanvasRenderingContext2D, anim: string, frame: number, t: number) => void

const TAU = Math.PI * 2
const QUARTER = Math.PI / 4
const DIR_ANGLE: Record<Direction, number> = {
  e: 0, se: QUARTER, s: 2 * QUARTER, sw: 3 * QUARTER, w: 4 * QUARTER, nw: 5 * QUARTER, n: 6 * QUARTER, ne: 7 * QUARTER,
}
const C = {
  outline: '#0a0809', deep: '#141114', hood: '#3b2a1e', leather: '#5a4030', rope: '#8c8070', hurt: '#ff3b2a',
  dark: '#0d0b12', mid: '#1b1726', wisp: '#2c2540', alert: '#6b4fb8', maw: '#3a0f2a',
  eyeCore: '#cbb8ff', eyeHalo: '#6b4fb8', telCore: '#ffffff', telHalo: '#b48cff',
}
const PLAYER_SCALE = 0.5 // the renderer maps torch tips as (tip - pivot) * 0.5, so the stick ends there in world units
const PIVOT = ACTOR_FRAME / 2

type Pt = (f: number, l: number) => [number, number] // facing-frame (forward, lateral) -> canvas
type Pose = { action: string; ang: number; f: number; n: number; p: number; m: Pt; key: string }

const isDir = (s: string): s is Direction => Object.hasOwn(DIR_ANGLE, s)

// ponytail: an unknown key falls back to east/idle instead of throwing inside the render loop; images.ts only passes manifest keys.
function pose(id: ActorId, anim: string, frame: number): Pose {
  const i = anim.lastIndexOf('-'), tail = anim.slice(i + 1), has = i > 0 && isDir(tail)
  const ang = has ? DIR_ANGLE[tail as Direction] : 0, key = has ? anim : 'idle-e'
  const n = SPRITES[id].anims[key]?.n ?? 1
  const f = Number.isFinite(frame) ? Math.max(0, Math.min(n - 1, Math.floor(frame))) : 0
  const c = Math.cos(ang), s = Math.sin(ang)
  return { action: has ? anim.slice(0, i) : anim, ang, f, n, p: n > 1 ? f / (n - 1) : 0, key,
    m: (a, b) => [a * c - b * s, a * s + b * c] }
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string): void {
  ctx.fillStyle = col
  ctx.beginPath()
  ctx.arc(x, y, Math.max(r, 0.05), 0, TAU)
  ctx.fill()
}
// Ellipse centred at facing-frame (f, l) with radii along / across the facing; optional rim stroke.
function blob(ctx: CanvasRenderingContext2D, q: Pose, f: number, l: number, rf: number, rl: number, fill: string, rim?: string, rw = 1): void {
  const [x, y] = q.m(f, l)
  ctx.beginPath()
  ctx.ellipse(x, y, Math.max(rf, 0.05), Math.max(rl, 0.05), q.ang, 0, TAU)
  ctx.fillStyle = fill
  ctx.fill()
  if (rim) { ctx.strokeStyle = rim; ctx.lineWidth = rw; ctx.stroke() }
}
function seg(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, col: string): void {
  ctx.strokeStyle = col
  ctx.lineWidth = w
  ctx.beginPath()
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.stroke()
}
const fseg = (ctx: CanvasRenderingContext2D, q: Pose, f0: number, l0: number, f1: number, l1: number, w: number, col: string): void => {
  const a = q.m(f0, l0), b = q.m(f1, l1)
  seg(ctx, a[0], a[1], b[0], b[1], w, col)
}

// ---- player: radius-9 hooded body, shoulders, backpack with rope, facing line; torch set adds the stick ----
function player(ctx: CanvasRenderingContext2D, id: ActorId, anim: string, frame: number, torch: boolean): void {
  const q = pose(id, anim, frame), ph = (q.f / q.n) * TAU, a = q.action
  let bf = 0, bl = 0, r = 9, flash = 0, flat = 0, spin = 0
  if (a === 'idle') r += 0.5 * Math.sin(ph)
  else if (a === 'walk') bl = 1.2 * Math.sin(ph)
  else if (a === 'swing') bf = 3 * Math.sin(q.p * Math.PI)
  else if (a === 'roll') { r *= 0.8; spin = q.p * TAU; bf = 2 }
  else if (a === 'hurt') { bf = -3 + 2 * q.p; flash = 0.7 - 0.35 * q.p }
  else if (a === 'death') flat = q.p
  const rf = r * (1 + 0.5 * flat), rl = r * (1 - 0.5 * flat), fade = 1 - 0.6 * flat
  ctx.save()
  ctx.lineCap = 'round'
  blob(ctx, q, bf, bl, rf + 1, rl + 1, C.outline)
  blob(ctx, q, bf, bl, rf, rl, C.hood)
  ctx.globalAlpha = fade
  const sw = a === 'walk' ? 1.5 * Math.sin(ph) : 0
  for (const side of [-1, 1]) {
    const [x, y] = q.m(bf - 1 + side * sw, bl + side * rl * 0.8)
    disc(ctx, x, y, 3, C.leather)
  }
  const pa = Math.PI + spin, [px, py] = q.m(bf + Math.cos(pa) * 6.5 * (1 + 0.3 * flat), bl + Math.sin(pa) * 6.5)
  disc(ctx, px, py, 4, C.leather)
  const [r0x, r0y] = q.m(bf + Math.cos(pa) * 6.5 - Math.sin(pa) * 3, bl + Math.sin(pa) * 6.5 + Math.cos(pa) * 3)
  const [r1x, r1y] = q.m(bf + Math.cos(pa) * 6.5 + Math.sin(pa) * 3, bl + Math.sin(pa) * 6.5 - Math.cos(pa) * 3)
  seg(ctx, r0x, r0y, r1x, r1y, 1, C.rope)
  fseg(ctx, q, bf, bl, bf + rf - 1, bl, 1.5, C.deep)
  const [hx, hy] = q.m(bf + rf * 0.45, bl)
  disc(ctx, hx, hy, 3, C.deep)
  if (flash > 0) { ctx.globalAlpha = flash; blob(ctx, q, bf, bl, rf, rl, C.hurt) }
  ctx.globalAlpha = 1
  const tip = torch ? SPRITES['player_body-torch'].anims[q.key]?.torchTips?.[Math.min(q.f, q.n - 1)] : undefined
  if (tip) {
    const tx = (tip[0] - PIVOT) * PLAYER_SCALE, ty = (tip[1] - PIVOT) * PLAYER_SCALE, hx0 = tx * 0.3, hy0 = ty * 0.3
    seg(ctx, hx0, hy0, tx, ty, 3, C.outline)
    seg(ctx, hx0, hy0, tx, ty, 1.6, C.leather)
    disc(ctx, tx, ty, 1.6, C.deep) // charred head: the torch-tip anchor, flame is drawn by the engine
  }
  ctx.restore()
}

// ---- monsters ----
type Look = { sx: number; sl: number; k: number; a: number }
function look(kind: 'lurker' | 'stalker' | 'devourer', q: Pose): Look {
  const a = q.action, small = kind !== 'devourer'
  if (a === 'death') return { sx: 1, sl: 1, k: small ? 1 + 0.4 * q.p : 1 - 0.4 * q.p, a: 1 - q.p }
  if (small && a === 'telegraph') return { sx: 0.8, sl: 1.15, k: 1, a: 1 }
  if (small && a === 'lunge') return { sx: 1.5, sl: 0.7, k: 1, a: 1 }
  // ponytail: spec stretch is 20 %, capped to 5 % because the body must stay inside the 64 px frame; art replaces this.
  if (!small && a === 'lunge') return { sx: 1.05, sl: 0.92, k: 1, a: 1 }
  return { sx: 1, sl: 1, k: !small && a.startsWith('telegraph') ? 1.06 : 1, a: 1 }
}

function lurker(ctx: CanvasRenderingContext2D, q: Pose, L: Look, t: number): void {
  const rim = q.action === 'telegraph' ? C.alert : C.wisp, rf = 8 * L.sx * L.k, rl = 8 * L.sl * L.k
  if (q.action === 'death') {
    for (let k = 0; k < 5; k++) {
      const ang = ((k + hash2(k, 0, 3) * 0.6) / 5) * TAU, d = 3 + 20 * q.p, [x, y] = q.m(Math.cos(ang) * d, Math.sin(ang) * d)
      disc(ctx, x, y, 2.4 * (1 - 0.8 * q.p) + 0.6, C.mid)
    }
  } else {
    const len = q.action === 'telegraph' ? 8 : q.action === 'lunge' ? 20 : 12
    for (let k = 0; k < 4; k++) {
      const l0 = (k - 1.5) * 2.4 * L.sl, sway = vnoise(t * 2 + k * 5.3, 17) * 1.2 + (q.action === 'idle' ? ((q.f + k) % 4 - 1.5) * 0.6 : 0)
      fseg(ctx, q, -rf * 0.75, l0, -rf * 0.75 - len, l0 * (q.action === 'lunge' ? 0.3 : 1.6) + sway, 1.5, rim)
    }
  }
  blob(ctx, q, 0, 0, rf, rl, C.mid, rim)
}

function stalker(ctx: CanvasRenderingContext2D, q: Pose, L: Look, t: number): void {
  const rim = q.action === 'telegraph' ? C.alert : C.wisp, rf = 14 * L.sx * L.k, rl = 5 * L.sl * L.k, a = q.action
  for (const sf of [-1, 1]) for (const sl of [-1, 1]) {
    const gait = a === 'idle' ? (((q.f + (sf > 0 ? 0 : 1)) % 2) ? 1.5 : -1.5) + vnoise(t + sl * 3, 31) * 0.4 : 0
    let kf = sf * 8, kl = sl * 9, ff = sf * 10 + gait, fl = sl * 14
    if (a === 'telegraph') { kf = sf * 6 - 2; kl = sl * 7; ff = -9 - (sf > 0 ? 0 : 3); fl = sl * 6 }
    else if (a === 'lunge') { kf = sf * 5 - 4; kl = sl * 5; ff = -16; fl = sl * 3 }
    else if (a === 'death') { kl += sl * 3 * q.p; fl += sl * 4 * q.p; ff += sf * 3 * q.p } // k grows to 1.4, limbs must stay in frame
    fseg(ctx, q, sf * 4 * L.k, 0, kf * L.k, kl * L.k, 1.5, rim)
    fseg(ctx, q, kf * L.k, kl * L.k, ff * L.k, fl * L.k, 1.5, rim)
  }
  blob(ctx, q, 0, 0, rf, rl, C.mid, rim)
  const h = [q.m(rf - 1, -3 * L.sl * L.k), q.m(rf + 5, 0), q.m(rf - 1, 3 * L.sl * L.k)]
  ctx.beginPath()
  ctx.moveTo(h[0][0], h[0][1])
  ctx.lineTo(h[1][0], h[1][1])
  ctx.lineTo(h[2][0], h[2][1])
  ctx.closePath()
  ctx.fillStyle = C.dark
  ctx.fill()
}

function devourer(ctx: CanvasRenderingContext2D, q: Pose, L: Look, t: number): void {
  const a = q.action, tel = a.startsWith('telegraph'), rim = tel ? C.alert : C.wisp, R = 28 * L.k, rf = R * L.sx, rl = R * L.sl
  for (let j = 0; j < 14; j++) { // boiling fringe: short spokes kept inside the frame
    const phi = (j / 14) * TAU, boil = vnoise(t * 2 + j * 1.7, 23) * 0.4 + hash2(j, q.f, 29) * 0.3
    const tp = a === 'telegraph_b' ? phi - 0.2 * Math.sin(phi) : phi, out = 0.3 + 0.5 * Math.max(0, boil) + (a === 'death' ? 6 * q.p : 0)
    const s1 = 1 + out / R
    fseg(ctx, q, rf * 0.93 * Math.cos(phi), rl * 0.93 * Math.sin(phi), rf * s1 * Math.cos(tp), rl * s1 * Math.sin(tp), 1.5, rim)
  }
  blob(ctx, q, 0, 0, rf, rl, C.dark, rim, 3)
  const mr = 20 * L.k, wide = a === 'telegraph_b' || a === 'lunge'
  ctx.strokeStyle = C.maw
  ctx.lineWidth = a === 'death' ? 3 * (1 - q.p) + 0.5 : a === 'telegraph_a' ? 6 : wide ? 10 : 3
  ctx.beginPath()
  ctx.arc(0, 0, mr, q.ang - 0.698, q.ang + 0.698)
  ctx.stroke()
  if (a === 'telegraph_a' || wide) for (let k = 0; k < 5; k++) { // jagged shadow teeth along the open maw
    const ang = q.ang - 0.5 + k * 0.25, r0 = mr * 0.8, r1 = mr * 0.9
    seg(ctx, Math.cos(ang) * r0, Math.sin(ang) * r0, Math.cos(ang) * r1, Math.sin(ang) * r1, 1.5, C.wisp)
  }
}

const SHADE: Record<'mon_lurker' | 'mon_stalker' | 'mon_devourer', (ctx: CanvasRenderingContext2D, q: Pose, L: Look, t: number) => void> = {
  mon_lurker: lurker, mon_stalker: stalker, mon_devourer: devourer,
}
const body = (id: keyof typeof SHADE): DrawFn => (ctx, anim, frame, t) => {
  const q = pose(id, anim, frame), L = look(id.slice(4) as 'lurker' | 'stalker' | 'devourer', q)
  ctx.save()
  ctx.globalAlpha = L.a
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  SHADE[id](ctx, q, L, t)
  ctx.restore()
}

// ---- eye sheets: only the glowing eyes; telegraph is brighter and 0.5 px bigger, blink closes them over three frames ----
type EyeId = Extract<ActorId, `${string}_eyes`>
const EYES: Record<EyeId, { r: number; at: readonly (readonly [number, number])[] }> = {
  mon_lurker_eyes: { r: 1.5, at: [[5, -2], [5, 2]] },
  mon_stalker_eyes: { r: 1.5, at: [[11, 0], [9, -2], [9, 2]] },
  mon_devourer_eyes: { r: 2.5, at: [[14, -6], [14, 6], [10, -14], [10, 14]] }, // idle shows only the first two
}
const LID = [1, 0.5, 0.08]
const eyes = (id: EyeId): DrawFn => (ctx, anim, frame) => {
  const q = pose(id, anim, frame), E = EYES[id], tel = q.action === 'telegraph'
  const lid = q.action === 'blink' ? LID[Math.min(q.f, LID.length - 1)] : 1
  const open = id === 'mon_devourer_eyes' && !tel ? 2 : E.at.length
  ctx.save()
  for (let i = 0; i < open; i++) {
    const [f, l] = E.at[i], [x, y] = q.m(f, l), r = E.r + (tel ? 0.5 : 0)
    ctx.globalAlpha = tel ? 0.65 : 0.35
    disc(ctx, x, y, r + (tel ? 3 : 2), tel ? C.telHalo : C.eyeHalo)
    ctx.globalAlpha = 1
    blob(ctx, q, f, l, r, r * lid, tel ? C.telCore : C.eyeCore)
  }
  ctx.restore()
}

export const ACTORS: Record<ActorId, DrawFn> = {
  player_body: (ctx, anim, frame) => player(ctx, 'player_body', anim, frame, false),
  'player_body-torch': (ctx, anim, frame) => player(ctx, 'player_body-torch', anim, frame, true),
  mon_lurker: body('mon_lurker'), mon_lurker_eyes: eyes('mon_lurker_eyes'),
  mon_stalker: body('mon_stalker'), mon_stalker_eyes: eyes('mon_stalker_eyes'),
  mon_devourer: body('mon_devourer'), mon_devourer_eyes: eyes('mon_devourer_eyes'),
}
