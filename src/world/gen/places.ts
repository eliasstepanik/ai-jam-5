import type { Rnd } from '../../core/rng.ts'
import { bfs4 } from '../bfs.ts'
import { carveDisc } from './carve.ts'
import { macroCellOf } from './macro.ts'

export const ENTRANCE_R = 3, CHAMBER_R = 3, CHAMBER_MASK_R = 5

// Index order is already stable row order: the first 16 have the smallest ty.
export function placeEntrance(g: Uint8Array, w: number, h: number, root: number, rnd: Rnd): number {
  const pool: number[] = []
  for (let i = 0; i < Math.min(w * h, 18 * w) && pool.length < 16; i++) {
    if (!g[i] && macroCellOf(i, w) === root) pool.push(i)
  }
  const pick = rnd.int(0, Math.max(0, pool.length - 1)) // One draw, even for an empty pool.
  if (pool.length === 0) return -1
  const entrance = pool[pick]
  carveDisc(g, w, h, entrance, ENTRANCE_R)
  return entrance
}

function farthest(dist: Int32Array, w: number, entrance: number): number {
  const ex = entrance % w, ey = Math.floor(entrance / w)
  let best = -1, bestSq = -1
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] < 0) continue
    const dx = i % w - ex, dy = Math.floor(i / w) - ey, sq = dx * dx + dy * dy
    if (best < 0 || dist[i] > dist[best] || (dist[i] === dist[best] && sq > bestSq)) { best = i; bestSq = sq }
  }
  return best
}

export function beaconRoomMask(g: Uint8Array, w: number, beacon: number, D: Int32Array, beaconDist: number): number[] {
  const out: number[] = [], bx = beacon % w, by = Math.floor(beacon / w), R = CHAMBER_MASK_R
  const h = Math.floor(g.length / w)
  for (let y = Math.max(0, by - R); y <= Math.min(h - 1, by + R); y++) {
    for (let x = Math.max(0, bx - R); x <= Math.min(w - 1, bx + R); x++) {
      const i = y * w + x
      if (!g[i] && D[i] >= beaconDist - 2 * R) out.push(i)
    }
  }
  return out
}

export function placeBeacon(g: Uint8Array, w: number, h: number, entrance: number): {
  beacon: number; beaconDist: number; dist: Int32Array; chamberR: number; chamber: number[]
} | null {
  if (entrance < 0 || entrance >= w * h || g[entrance]) return null
  const before = bfs4(g, w, h, entrance), first = farthest(before, w, entrance)
  let dist = before, chamberR = 0
  for (let R = CHAMBER_R; R > 0; R--) {
    const copy = g.slice()
    carveDisc(copy, w, h, first, R)
    const after = bfs4(copy, w, h, entrance)
    if (after[first] < 0.92 * before[first]) continue
    g.set(copy)
    dist = after; chamberR = R
    break
  }
  const beacon = farthest(dist, w, entrance), beaconDist = dist[beacon]
  return { beacon, beaconDist, dist, chamberR, chamber: beaconRoomMask(g, w, beacon, dist, beaconDist) }
}
