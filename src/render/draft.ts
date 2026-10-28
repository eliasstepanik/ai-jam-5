// L4 render: the cave's "draft" toward the beacon (cave overhaul G4, design-gen §3, design-render A6).
// Warm dust motes on main-route tiles drift one tile-edge toward the beacon (the neighbour with distB - 1), and a faint warm bleed lights
// every 2nd floor tile within 24 steps of the beacon. Fully stateless: positions are pure functions of s.meta.time and a stateless hash2
// (salt 0xd4af, unused elsewhere), so the pass freezes while paused, never touches the rng streams, never writes State and keeps no
// module-level timers or listeners. The guide fields come from the memoized core accessor. Drawn after the vine glow (index.ts wiring: I1).
// ponytail: each mote restarts at the same spot every 2 s cycle (alpha is 0 at both ends, so no pop); add k-keyed hash2 jitter if it reads as a loop.
import type { State } from '../core/types.ts'
import { hash2 } from '../core/noise.ts'
import { TILE } from '../core/state.ts'
import { guideFields } from '../core/cave-guide.ts'
import type { GuideFields } from '../core/cave-guide.ts'
import { flameRadius } from '../systems/light.ts'
import { getResources } from '../assets/resources.ts'
import { GLOW_BUCKETS, bucketOf, glowKey } from './keys.ts'
import { ctx2d, newCanvas } from './light.ts'
import type { Quality } from './quality.ts'
import type { View } from './view.ts'

const SALT = 0xd4af // grep-verified unused; per-tile hash lanes are x * 4 + {0 slot, 1 phase, 2 start x, 3 start y}
export const MOTE_EVERY = 6 // one mote site per 6 main tiles on average
export const MOTE_DRIFT = 8 // px/s toward the lower-distB neighbour
export const MOTE_LIFE = 2 // seconds
export const MOTE_ALPHA = 0.22
export const BLEED_RANGE = 24 // tiles of distB
export const BLEED_ALPHA = 0.12
const BLEED_COL = '#d9861c', MOTE_COL = '#f0c890'

export type Mote = { x: number; y: number; a: number }

export const guideOf = (s: State): GuideFields => {
  const { w, h, tiles, entrance, beacon } = s.world
  return guideFields(tiles, w, h, entrance.ty * w + entrance.tx, beacon.ty * w + beacon.tx)
}

// Neighbour index with distB exactly one less than tile (x, y), or -1 (wall, unreachable, the beacon itself). Order N, W, E, S like the guide.
export function lowerNeighbour(g: GuideFields, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return -1
  const d = g.distB[y * g.w + x]
  if (d <= 0) return -1
  if (y > 0 && g.distB[(y - 1) * g.w + x] === d - 1) return (y - 1) * g.w + x
  if (x > 0 && g.distB[y * g.w + x - 1] === d - 1) return y * g.w + x - 1
  if (x + 1 < g.w && g.distB[y * g.w + x + 1] === d - 1) return y * g.w + x + 1
  if (y + 1 < g.h && g.distB[(y + 1) * g.w + x] === d - 1) return (y + 1) * g.w + x
  return -1
}

// Mote site: a main-route tile (never a dead end or alcove) that wins the 1-in-6 hash slot.
export const moteSite = (g: GuideFields, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < g.w && y < g.h && g.main[y * g.w + x] === 1 && hash2(x * 4, y, SALT) * MOTE_EVERY < 1

// Tile index a mote on (x, y) drifts toward (distB one less), or -1 when (x, y) is not a mote site.
export const moteTarget = (g: GuideFields, x: number, y: number): number => moteSite(g, x, y) ? lowerNeighbour(g, x, y) : -1

// Mote of site (x, y) drifting to tile `target` at time t: 2 s life, 8 px/s, alpha 0.22 under a sine envelope. Pure in t.
export function moteAt(g: GuideFields, x: number, y: number, target: number, t: number): Mote {
  const f = ((t / MOTE_LIFE + hash2(x * 4 + 1, y, SALT)) % 1 + 1) % 1, run = f * MOTE_LIFE * MOTE_DRIFT
  const tx = target % g.w, ty = (target - tx) / g.w
  return {
    x: (x + 0.25 + 0.5 * hash2(x * 4 + 2, y, SALT)) * TILE + (tx - x) * run,
    y: (y + 0.25 + 0.5 * hash2(x * 4 + 3, y, SALT)) * TILE + (ty - y) * run,
    a: MOTE_ALPHA * Math.sin(Math.PI * f),
  }
}

// Warm bleed alpha of a floor tile: every 2nd tile (checkerboard) within 24 steps of the beacon, 0.12 * (1 - distB / 24); else 0.
export function bleedAlpha(g: GuideFields, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h || ((x + y) & 1) !== 0) return 0
  const d = g.distB[y * g.w + x]
  return d >= 0 && d <= BLEED_RANGE ? BLEED_ALPHA * (1 - d / BLEED_RANGE) : 0
}

// Same radial sprite and cache key as glow.ts drawGlowSprite (glow.ts is frozen and its import chain loads characters.json, which the node
// check runner cannot import, so the checks could not load this module through it). Shared cache: whoever builds a (hex, bucket) sprite first serves both.
// ponytail: gradient duplicated from glow.ts; export glowSprite from glow.ts and import it here once glow.ts is unfrozen.
function bleedSprite(hex: string, b: number): HTMLCanvasElement {
  const cache = getResources().light, key = glowKey(hex, b)
  let sprite = cache.get(key)
  if (sprite) return sprite
  sprite = newCanvas(b, b)
  const g = ctx2d(sprite), rgb = parseInt(hex.slice(1), 16), c = (rgb >> 16 & 255) + ',' + (rgb >> 8 & 255) + ',' + (rgb & 255)
  const grad = g.createRadialGradient(b / 2, b / 2, 0, b / 2, b / 2, b / 2)
  grad.addColorStop(0, 'rgba(' + c + ',1)')
  grad.addColorStop(0.25, 'rgba(' + c + ',0.55)')
  grad.addColorStop(0.6, 'rgba(' + c + ',0.15)')
  grad.addColorStop(1, 'rgba(' + c + ',0)')
  g.fillStyle = grad
  g.fillRect(0, 0, b, b)
  cache.set(key, sprite)
  return sprite
}

export function drawDraft(ctx: CanvasRenderingContext2D, s: State, v: View, q: Quality): void {
  if (!q.decor) return
  const px = s.player.x, py = s.player.y, R = flameRadius(s)
  if (!Number.isFinite(px) || !Number.isFinite(py)) return
  const g = guideOf(s), t = s.meta.time
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const sprite = bleedSprite(BLEED_COL, bucketOf(2 * TILE * ctx.getTransform().a, GLOW_BUCKETS))
  for (let y = v.ty0; y <= v.ty1; y++) for (let x = v.tx0; x <= v.tx1; x++) {
    const a = bleedAlpha(g, x, y)
    if (a <= 0) continue
    ctx.globalAlpha = a
    ctx.drawImage(sprite, x * TILE - TILE / 2, y * TILE - TILE / 2, 2 * TILE, 2 * TILE)
  }
  ctx.fillStyle = MOTE_COL
  for (let y = v.ty0; y <= v.ty1; y++) for (let x = v.tx0; x <= v.tx1; x++) {
    const dx = (x + 0.5) * TILE - px, dy = (y + 0.5) * TILE - py
    if (dx * dx + dy * dy > R * R) continue
    const target = moteTarget(g, x, y)
    if (target < 0) continue
    const m = moteAt(g, x, y, target, t)
    if (m.a <= 0.01) continue
    ctx.globalAlpha = m.a
    ctx.fillRect(Math.round(m.x), Math.round(m.y), 2, 2)
  }
  ctx.restore()
}
