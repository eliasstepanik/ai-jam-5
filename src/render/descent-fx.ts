// L4 render: falling dust motes and pebbles around the player that thicken with depth (cave overhaul A9, design-render §3).
// Fully stateless: every position is a pure function of s.meta.time through hash2 (salt 0xd057), so the pass freezes while the game is
// paused, never touches the rng streams, never writes State and keeps no module-level state. Drawn under the darkness (index.ts wiring: I1).
// ponytail: spawn boxes follow the player instead of staying world-anchored, so the dust rides with the camera; anchor to a world grid if that reads wrong.
import type { State } from '../core/types.ts'
import { hash2, vnoise } from '../core/noise.ts'
import { TILE } from '../core/state.ts'
import { currentQuality } from './quality.ts'
import { playerDepth01 } from './depth-tone.ts'
import { inView } from './view.ts'
import type { View } from './view.ts'

export type Mote = { x: number; y: number; a: number }
export type Pebble = { x: number; y: number; lx: number; ly: number; a: number; puff: boolean }

const SALT = 0xd057 // unused elsewhere; the plan reserves it for this pass
const BOX = 160 // px edge of the spawn box around the player
const MOTE_DRIFT = 8 // px/s downwards
const PEBBLE_FALL = 0.5, PEBBLE_DROP = 48, PEBBLE_PUFF = 0.2 // seconds, px, seconds
const MOTE_COL = '#9a8f86', PEBBLE_COL = '#6d625a'

const clamp01 = (d: number): number => d > 0 ? (d < 1 ? d : 1) : 0 // NaN -> 0

export const moteCount = (d: number): number => Math.round(2 + 10 * clamp01(d) ** 1.5)
export const pebbleCount = (d: number): number => Math.floor(6 * clamp01(d) ** 2)

// Mote i at time t around the centre (cx, cy): period 3..6 s, a fresh spawn point each cycle, 8 px/s drift with a gentle sway.
export function moteAt(i: number, t: number, cx: number, cy: number): Mote {
  const per = 3 + 3 * hash2(i, 0, SALT), q = (t + per * hash2(i, 1, SALT)) / per, k = Math.floor(q), f = q - k
  return {
    x: cx + (hash2(i, k * 8 + 2, SALT) - 0.5) * BOX + vnoise(t * 0.4 + i * 13, SALT) * 4,
    y: cy + (hash2(i, k * 8 + 3, SALT) - 0.5) * BOX + f * per * MOTE_DRIFT,
    a: 0.5 * Math.sin(Math.PI * f),
  }
}

// Pebble j at time t: period 2.5..4 s; a 0.5 s ease-in fall of 48 px onto (lx, ly), then a 0.2 s puff there. null between cycles.
export function pebbleAt(j: number, t: number, cx: number, cy: number): Pebble | null {
  const per = 2.5 + 1.5 * hash2(j, 0, SALT), q = (t + per * hash2(j, 1, SALT)) / per, k = Math.floor(q), u = (q - k) * per
  const lx = cx + (hash2(j, k * 8 + 2, SALT) - 0.5) * BOX, ly = cy + (hash2(j, k * 8 + 3, SALT) - 0.5) * BOX
  if (u < PEBBLE_FALL) { const p = u / PEBBLE_FALL; return { x: lx, y: ly - PEBBLE_DROP * (1 - p * p), lx, ly, a: 1, puff: false } }
  if (u < PEBBLE_FALL + PEBBLE_PUFF) return { x: lx, y: ly, lx, ly, a: 1 - (u - PEBBLE_FALL) / PEBBLE_PUFF, puff: true }
  return null
}

// Active pebbles for depth d. A cycle whose landing tile is a wall or outside the map is skipped entirely (no fall, no puff).
export function pebbleList(tiles: string, w: number, h: number, t: number, cx: number, cy: number, d: number): Pebble[] {
  const out: Pebble[] = []
  for (let j = 0, n = pebbleCount(d); j < n; j++) {
    const p = pebbleAt(j, t, cx, cy)
    if (!p) continue
    const tx = Math.floor(p.lx / TILE), ty = Math.floor(p.ly / TILE)
    if (tx < 0 || ty < 0 || tx >= w || ty >= h || tiles[ty * w + tx] === '#') continue
    out.push(p)
  }
  return out
}

export function drawDescentFx(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  if (!currentQuality(s).decor) return
  const px = s.player.x, py = s.player.y
  if (!Number.isFinite(px) || !Number.isFinite(py)) return
  const d = playerDepth01(s), t = s.meta.time, { tiles, w, h } = s.world
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = MOTE_COL
  for (let i = 0, n = moteCount(d); i < n; i++) {
    const m = moteAt(i, t, px, py)
    if (m.a <= 0.01 || !inView(v, m.x, m.y)) continue
    ctx.globalAlpha = m.a
    ctx.fillRect(Math.round(m.x), Math.round(m.y), 1, 1)
  }
  for (const p of pebbleList(tiles, w, h, t, px, py, d)) {
    if (!inView(v, p.x, p.y)) continue
    ctx.globalAlpha = p.a
    if (p.puff) { ctx.fillStyle = MOTE_COL; ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3) }
    else { ctx.fillStyle = PEBBLE_COL; ctx.fillRect(Math.round(p.x), Math.round(p.y) - 1, 1, 2) }
  }
  ctx.restore()
}
