import type { Rnd } from '../../core/rng.ts'
import { bfs4, shortestPath } from '../bfs.ts'
import { carveTunnel } from './carve.ts'
import { BEACON_DIST_BAND, macroCellOf } from './macro.ts'
import type { MacroLayout } from './macro.ts'

export const GAIN_MIN = 50, SPREAD = 60, TUN_MAX = 12, U = 1000
export const DMIN = BEACON_DIST_BAND[0]

export function dilate(blk: Uint8Array, w: number, h: number, i: number, k: number): void {
  const cx = i % w, cy = Math.floor(i / w)
  for (let y = Math.max(0, cy - k); y <= Math.min(h - 1, cy + k); y++) {
    for (let x = Math.max(0, cx - k); x <= Math.min(w - 1, cx + k); x++) blk[y * w + x] = 1
  }
}

export function reopen(blk: Uint8Array, g: Uint8Array, w: number, h: number, a: number, k: number): void {
  const cx = a % w, cy = Math.floor(a / w)
  for (let y = Math.max(0, cy - k); y <= Math.min(h - 1, cy + k); y++) {
    for (let x = Math.max(0, cx - k); x <= Math.min(w - 1, cx + k); x++) blk[y * w + x] = g[y * w + x]
  }
}

export function hasAlternativeRoute(g: Uint8Array, w: number, h: number, a: number, b: number, k = 2, minLen = 40): boolean {
  if (a < 0 || b < 0 || a >= g.length || b >= g.length || g[a] || g[b]) return false
  const path = shortestPath(bfs4(g, w, h, a), w, b)
  if (path.length === 0) return false
  const blk = g.slice()
  // ponytail: greedy one-path removal; swap for 2-unit max-flow on a k-coarsened grid if false negatives starve seeds.
  for (const i of path) dilate(blk, w, h, i, k)
  reopen(blk, g, w, h, a, k + 1); reopen(blk, g, w, h, b, k + 1)
  return bfs4(blk, w, h, a)[b] >= minLen
}

type Pair = { u: number; v: number; gain: number }

// Runs pass 8 in place. A22 rejects the attempt if the returned loops count is < 2.
export function pickLoopPairs(g: Uint8Array, w: number, h: number, entrance: number, L: MacroLayout, rnd: Rnd): {
  loops: number; tunnelTiles: number; pairs: [number, number][]
} {
  const D0 = bfs4(g, w, h, entrance)
  let dmax = 0, mv = 0
  for (const d of D0) if (d > dmax) dmax = d
  for (const [a, b] of L.loops) if (hasAlternativeRoute(g, w, h, L.centre[a], L.centre[b])) mv++
  const k = rnd.int(0, 1), pool: number[] = []
  for (let i = 0; i < g.length; i++) if (!g[i] && D0[i] >= 0.2 * dmax) pool.push(i)
  const adjacent = new Set<number>()
  for (const e of L.edges) {
    const a = e < 42 ? Math.floor(e / 7) * 8 + e % 7 : e - 42, b = a + (e < 42 ? 1 : 8)
    adjacent.add(a * 48 + b); adjacent.add(b * 48 + a)
  }
  const candidates: Pair[] = []
  for (let sample = 0; sample < U; sample++) {
    const pick = rnd.int(0, Math.max(0, pool.length - 1)) // Always draw all U samples, including k=0 / empty pool.
    if (pool.length === 0) continue
    const u = pool[pick], ux = u % w, uy = Math.floor(u / w), uc = macroCellOf(u, w)
    let best = -1, gain = -Infinity
    for (let y = Math.max(0, uy - TUN_MAX); y <= Math.min(h - 1, uy + TUN_MAX); y++) {
      for (let x = Math.max(0, ux - TUN_MAX); x <= Math.min(w - 1, ux + TUN_MAX); x++) {
        const ring = Math.max(Math.abs(x - ux), Math.abs(y - uy)), v = y * w + x
        if (ring < 3 || g[v] || D0[v] < 0.2 * dmax) continue
        const vc = macroCellOf(v, w)
        if (uc !== vc && !adjacent.has(uc * 48 + vc)) continue
        const value = Math.abs(D0[u] - D0[v]) - Math.abs(x - ux) - Math.abs(y - uy)
        if (value > gain) { best = v; gain = value }
      }
    }
    if (best >= 0 && gain >= 25) candidates.push({ u, v: best, gain })
  }
  candidates.sort((a, b) => b.gain - a.gain || a.u - b.u || a.v - b.v)
  const pairs: [number, number][] = [], attempted = new Set<number>(), target = Math.max(k, 2 - mv)
  let tunnelTiles = 0
  for (const [minGain, spread] of [[GAIN_MIN, SPREAD], [25, 40]]) {
    for (let c = 0; c < candidates.length && pairs.length < target; c++) {
      const { u, v, gain } = candidates[c]
      if (gain < minGain || attempted.has(c)) continue
      const mx = (u % w + v % w) / 2, my = (Math.floor(u / w) + Math.floor(v / w)) / 2
      if (pairs.some(([a, b]) => Math.max(Math.abs(mx - (a % w + b % w) / 2),
        Math.abs(my - (Math.floor(a / w) + Math.floor(b / w)) / 2)) <= spread)) continue
      attempted.add(c)
      const copy = g.slice(), carved = carveTunnel(copy, w, h, u, v, rnd)
      if (!hasAlternativeRoute(copy, w, h, u, v)) continue
      const dist = bfs4(copy, w, h, entrance)
      let max = 0
      for (const d of dist) if (d > max) max = d
      if (max < Math.max(DMIN, 0.95 * dmax)) continue
      g.set(copy)
      tunnelTiles += carved
      pairs.push([u, v])
    }
  }
  return { loops: mv + pairs.length, tunnelTiles, pairs }
}
