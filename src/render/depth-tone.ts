// L4 render: continuous depth foundation for the cave overhaul. Pure: no DOM/canvas, never writes State, no rng, no timers or listeners.
// `depth01` = BFS path distance from the entrance / beaconDist, so darkness and tint follow depth continuously instead of per-zone steps.
// Module-level caches below are derived data only (rebuilt when the world cache field changes identity), same precedent as world/caches.ts.
import type { State } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { CAVE_DRESSING, dressingAt } from '../core/cave-props.ts'
import { getDepthField } from '../world/caches.ts'

export type Tone = { r: number; g: number; b: number; amb: number }

const HASH = 35 // '#'
const ORTHO: readonly (readonly [number, number])[] = [[0, -1], [1, 0], [0, 1], [-1, 0]]
const WET_RADIUS = 3 // Chebyshev tiles around a water dressing anchor
// depth01, then world multiply r, g, b, then darkness-memory ambient multiplier (design-render §2).
const STOPS: readonly (readonly [number, number, number, number, number])[] = [
  [0.00, 0.86, 0.97, 1.00, 1.00],
  [0.35, 0.74, 0.86, 0.92, 0.78],
  [0.65, 0.70, 0.64, 0.84, 0.55],
  [1.00, 0.64, 0.50, 0.70, 0.32],
]

const clamp01 = (v: number): number => v > 0 ? (v < 1 ? v : 1) : 0 // NaN -> 0

let depthSrc: Int32Array | null = null, depthBd = -1, depthV = new Float32Array(0)
let wetSrc: Int32Array | null = null, wetSeed = -1, wetV = new Uint8Array(0)

// Floor and reachable cells: d / beaconDist. Walls and unreachable cells: value of the nearest such cell (4-neighbour multi-source BFS,
// same algorithm as zoneMap in render/tiles.ts).
export function depth01Field(s: State): Float32Array {
  const src = getDepthField(s), bd = s.world.beaconDist
  if (depthSrc === src && depthBd === bd) return depthV
  const { w, h, tiles } = s.world, n = w * h, v = new Float32Array(n), seen = new Uint8Array(n), queue = new Int32Array(n)
  const valid = tiles.length === n && src.length === n, div = Math.max(1, bd)
  let qn = 0
  if (valid) {
    for (let i = 0; i < n; i++) {
      if (tiles.charCodeAt(i) === HASH || src[i] < 0) continue
      v[i] = clamp01(src[i] / div)
      seen[i] = 1
      queue[qn++] = i
    }
  }
  for (let qi = 0; qi < qn; qi++) {
    const i = queue[qi], x = i % w, y = (i - x) / w
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const j = ny * w + nx
      if (!seen[j]) { seen[j] = 1; v[j] = v[i]; queue[qn++] = j }
    }
  }
  depthSrc = src; depthBd = bd; depthV = v // no reachable floor at all: the field stays 0
  return v
}

// Depth at the player's tile, clamped into the map so an out-of-map or non-finite position never throws.
export function playerDepth01(s: State): number {
  const { w, h } = s.world, f = depth01Field(s)
  if (!f.length) return 0
  const tx = Math.min(w - 1, Math.max(0, Math.floor(s.player.x / TILE) || 0))
  const ty = Math.min(h - 1, Math.max(0, Math.floor(s.player.y / TILE) || 0))
  return f[ty * w + tx]
}

// Piecewise linear over STOPS with smoothstep inside each segment: continuous, no knees, `amb` strictly decreasing.
export function toneOf(d: number): Tone {
  const t = clamp01(d)
  let k = 0
  while (k < STOPS.length - 2 && t > STOPS[k + 1][0]) k++
  const a = STOPS[k], b = STOPS[k + 1], u = (t - a[0]) / (b[0] - a[0]), e = u * u * (3 - 2 * u)
  return { r: a[1] + (b[1] - a[1]) * e, g: a[2] + (b[2] - a[2]) * e, b: a[3] + (b[3] - a[3]) * e, amb: a[4] + (b[4] - a[4]) * e }
}

export const crackMul = (d: number): number => 0.5 + clamp01(d)

export const vineDensity = (d: number, wet: boolean): number => clamp01(1 - clamp01(d) / (wet ? 0.7 : 0.55)) ** 1.5

// 1 within Chebyshev 3 of a water dressing anchor. Only the 3x3-block anchors (x % 3 === 1, y % 3 === 1) can hold a dressing.
// ponytail: raw dressingAt water anchors; chunk W1 re-points this to the purposed water anchors once generation decides them.
export function wetField(s: State): Uint8Array {
  const src = getDepthField(s), seed = s.meta.seed
  if (wetSrc === src && wetSeed === seed) return wetV
  const { w, h, tiles } = s.world, v = new Uint8Array(w * h)
  if (tiles.length === w * h) {
    for (let y = 1; y < h; y += 3) for (let x = 1; x < w; x += 3) {
      const n = dressingAt(tiles, w, h, x, y, seed)
      if (n < 0 || !CAVE_DRESSING[n].water) continue
      for (let yy = Math.max(0, y - WET_RADIUS); yy <= Math.min(h - 1, y + WET_RADIUS); yy++) {
        for (let xx = Math.max(0, x - WET_RADIUS); xx <= Math.min(w - 1, x + WET_RADIUS); xx++) v[yy * w + xx] = 1
      }
    }
  }
  wetSrc = src; wetSeed = seed; wetV = v
  return v
}
