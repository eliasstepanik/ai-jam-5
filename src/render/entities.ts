// L4 render: monsters FULL (pass 10) from the character atlas, the foot-row actor buckets (R-180), and the angle/frame/eye helpers
// glow.ts needs for pass 16. The player body lives in entities-player.ts (torchTip re-exported here).
// Spec: docs/architecture-render-2.md §3.2, architecture-modules-render.md row `src/render/entities.ts`, R-180, R-184.
// Atlas art is never rotated or mirrored: the direction index picks one of eight authored views, scale 1.0, pivot (32, 32).
// Reads State and the image registry only; writes registry caches (scratch rows, swapped, tints). No rng.
import type { Monster, MonsterKind, State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { clamp } from '../core/math.ts'
import { dirIndex, footRow } from '../core/grid.ts'
import type { Dir8 } from '../core/grid.ts'
import { lineOfSightPx } from '../world/los.ts'
import { getResources } from '../assets/resources.ts'
import type { Resources } from '../assets/resources.ts'
import type { View } from './view.ts'
import { charFrame, animLen, drawAtlas } from './charatlas.ts'
import { propActors, drawProp } from './props.ts'
import { ctx2d, newCanvas } from './light.ts'
import { directionOf, drawPlayerBody, fitFrame, frameAt, snap } from './entities-player.ts'

export { torchTip } from './entities-player.ts'

export const MON_FOOT: Record<MonsterKind, number> = { lurker: 25, stalker: 30, devourer: 24 } // R-180: px below the pivot
const PIVOT = 32 // source px of the 64x64 actor frame pivot
const CULL_MARGIN = 48 // render-2 §2.3: half the devourer canvas, added to the View rect (which already holds one tile)
const MON_MOVE_SPEED = 5 // render-2 §3.2: faces its velocity above this speed (px/s), else the player
const IDLE_PHASE_MS = 370 // render-2 §3.2: loop offset per monster id
const DEATH_FADE_FRAMES = 3 // assets-sprites §5: eyes fade out over the first 3 death frames
const EYE_IDLE_A = 0.55 // render-3 §1 eye halo alpha (idle), telegraph is 1

// Cull on [x0 - 48, x1 + 48] x [y0 - 48, y1 + 48]; view.ts inView has no entity margin and is left as is.
export const entityInView = (v: View, x: number, y: number): boolean =>
  x >= v.x0 - CULL_MARGIN && x <= v.x1 + CULL_MARGIN && y >= v.y0 - CULL_MARGIN && y <= v.y1 + CULL_MARGIN

// --- monsters ---
// Direction input: windup, lunge and dying use lungeDir (dying keeps the value it had, so death holds its direction), otherwise
// the velocity heading above 5 px/s, else the bearing to the player. Never a sprite rotation.
export function monsterAngle(s: State, m: Monster): number {
  if (m.ai === 'windup' || m.ai === 'lunge' || m.ai === 'dying') return m.lungeDir
  return Math.hypot(m.vx, m.vy) > MON_MOVE_SPEED ? Math.atan2(m.vy, m.vx) : Math.atan2(s.player.y - m.y, s.player.x - m.x)
}
export const monsterDirection = (s: State, m: Monster): Dir8 => directionOf(monsterAngle(s, m))

// [atlas animation, frame] of the body (render-2 §3.2). Loops start at time*1000 + id*370 ms; one-shots (lunge, death) are stretched
// over the gameplay duration of the state (aiDur / dyingS), so the last frame lands when the state ends.
export function monsterFrame(s: State, m: Monster): [string, number] {
  const k = m.kind, ms = s.meta.time * 1000 + m.id * IDLE_PHASE_MS, frac = m.aiDur > 0 ? m.aiT / m.aiDur : 0
  const loop = (anim: string): [string, number] => [anim, frameAt(k, anim, ms)]
  switch (m.ai) {
    case 'ring': case 'stalk': return loop('walk_forward')
    case 'windup':
      // DEFAULT: devourer attack frames 0-1 map to its two windup beats (beat 0 -> frame 0, beat 1 -> frame 1).
      return k === 'devourer' ? ['attack', Math.min(m.beat, 1)] : loop('idle')
    case 'lunge':
      if (k === 'lurker') return loop('sprint')
      // DEFAULT: devourer attack frames 2-3 split the lunge in halves.
      if (k === 'devourer') return ['attack', frac >= 0.5 ? 3 : 2]
      return ['leap', fitFrame(k, 'leap', frac)]
    case 'dying': return ['death', fitFrame(k, 'death', m.aiT / T.monsters[k].dyingS)]
    default: return loop('idle') // recover, stunned. DEFAULT: no hurt state exists in Monster.ai, so hit/hurt anims are unreachable.
  }
}

export const monsterLit = (s: State, m: Monster): boolean => s.meta.phase === 'escape' || s.debug.noFog || s.debug.reveal || m.seen // light classification for mist; body drawing uses only viewport culling

function drawMonster(ctx: CanvasRenderingContext2D, s: State, v: View, m: Monster): void {
  if (!entityInView(v, m.x, m.y)) return
  const [anim, frame] = monsterFrame(s, m)
  drawAtlas(ctx, charFrame(m.kind, anim, dirIndex(monsterDirection(s, m)), frame), snap(m.x, v.z) - PIVOT, snap(m.y - MON_FOOT[m.kind], v.z) - PIVOT)
}

export const eyeAnim = (m: Monster): 'idle' | 'telegraph' => (m.ai === 'windup' || m.ai === 'lunge' ? 'telegraph' : 'idle')

// Dying eyes fade out over the first 3 death frames (assets-sprites §5). The atlas death anim is stretched over dyingS, so the
// fade lasts dyingS * 3 / frameCount. ponytail: assumes equal frame spacing; upgrade: sum the real frame durations.
const dyingFade = (m: Monster): number => {
  const n = animLen(m.kind, 'death'), fadeS = n > 0 ? T.monsters[m.kind].dyingS * DEATH_FADE_FRAMES / n : 0
  return fadeS > 0 ? clamp(1 - m.aiT / fadeS, 0, 1) : 0
}

// Pass 16 halo/sprite alpha: 0.55 idle, 1 telegraph; a dying shade multiplies in dyingFade (assets-sprites §5).
export function eyeAlpha(_s: State, m: Monster): number {
  if (m.ai === 'dying') return EYE_IDLE_A * dyingFade(m)
  return eyeAnim(m) === 'telegraph' ? 1 : EYE_IDLE_A
}

// Atlas emission is independent of torch range. Walls still block line of sight, preventing eye glow through solid rock.
export function eyeVisible(s: State, m: Monster): boolean {
  return lineOfSightPx(s, s.player.x, s.player.y, m.x, m.y)
}

// --- actor row buckets (R-180) ---
// res.scratch.rows layout (Int32Array, grown never shrunk): [ty0, nRows, count] header, then nRows bucket heads (entry index or -1),
// then 4 ints per entry: next, tag, i, footY * 16. Each bucket list is kept ascending by footY (insertion on push, ties keep push order).
// Tags: 0 monster (i = index in s.monsters), 1 player (i = 0). Tags >= 2 belong to props.ts (propActors pushes, drawProp draws).
export const TAG_MONSTER = 0
export const TAG_PLAYER = 1
export type PushFn = (footY: number, tag: number, i: number) => void
const HEAD = 3, ENTRY = 4, FOOT_FIX = 16

function ensureRows(res: Resources, need: number): Int32Array {
  // DEFAULT: Scratch requires a canvas (resources.ts type); a 1x1 one is created when rows is the first scratch user.
  const sc = res.scratch ?? (res.scratch = (() => { const canvas = newCanvas(1, 1); return { canvas, ctx: ctx2d(canvas), w: 1, h: 1, rows: new Int32Array(0) } })())
  if (sc.rows.length < need) {
    const grown = new Int32Array(Math.max(need, sc.rows.length * 2, 256))
    grown.set(sc.rows)
    sc.rows = grown
  }
  return sc.rows
}

// State x/y is the collision ground contact for actors and props; atlas sole offsets affect drawing only, never depth sorting.
// push regrows the buffer per entry (ensureRows), so any number of visible props fits.
export function actorRows(s: State, v: View): void {
  const res = getResources(), nRows = Math.max(1, v.ty1 - v.ty0 + 1), E = HEAD + nRows
  let rows = ensureRows(res, E)
  rows[0] = v.ty0; rows[1] = nRows; rows[2] = 0
  rows.fill(-1, HEAD, E)
  const push: PushFn = (footY, tag, i) => {
    const e = rows[2]
    rows = ensureRows(res, E + ENTRY * (e + 1))
    rows[2] = e + 1
    const at = E + ENTRY * e, fy = Math.round(footY * FOOT_FIX)
    const b = HEAD + clamp(footRow(footY) - v.ty0, 0, nRows - 1)
    let prev = -1, cur = rows[b]
    while (cur >= 0 && rows[E + ENTRY * cur + 3] <= fy) { prev = cur; cur = rows[E + ENTRY * cur] }
    rows[at] = cur; rows[at + 1] = tag; rows[at + 2] = i; rows[at + 3] = fy
    if (prev < 0) rows[b] = e
    else rows[E + ENTRY * prev] = e
  }
  propActors(s, v, push) // ground props first on equal depth, so the entrance does not cover the player spawned on it
  for (let i = 0; i < s.monsters.length; i++) {
    const m = s.monsters[i]
    if (entityInView(v, m.x, m.y)) push(m.y, TAG_MONSTER, i)
  }
  if (entityInView(v, s.player.x, s.player.y)) push(s.player.y, TAG_PLAYER, 0)
}

// Walks the bucket of tile row `ty` (ascending footY) and calls `fn(tag, i)`; nothing when actorRows has not run or ty is outside it.
function eachInRow(ty: number, fn: PushFn): void {
  const rows = getResources().scratch?.rows
  if (!rows || rows.length < HEAD) return
  const n = ty - rows[0]
  if (n < 0 || n >= rows[1]) return
  const E = HEAD + rows[1]
  for (let e = rows[HEAD + n]; e >= 0; e = rows[E + ENTRY * e]) fn(0, rows[E + ENTRY * e + 1], rows[E + ENTRY * e + 2])
}

// Monsters whose foot row is `ty`, ascending footY, from the buckets actorRows filled. DEFAULT: takes `s` as a second argument,
// the spec signature `(ty)` has no way to reach s.monsters without module-level state, which hot reload forbids.
export function monstersInRow(ty: number, s: State): Iterable<Monster> {
  const out: Monster[] = []
  eachInRow(ty, (_f, tag, i) => { if (tag === TAG_MONSTER && s.monsters[i]) out.push(s.monsters[i]) })
  return out
}

// Draws every actor of tile row `ty` in footY order, interleaved with the wall row the caller just drew (R-180).
export function drawRowEntities(ctx: CanvasRenderingContext2D, s: State, v: View, ty: number): void {
  eachInRow(ty, (_f, tag, i) => {
    if (tag === TAG_MONSTER) { if (s.monsters[i]) drawMonster(ctx, s, v, s.monsters[i]) }
    else if (tag === TAG_PLAYER) drawPlayerBody(ctx, s, v.z)
    else drawProp(ctx, s, v, tag, i)
  })
}
