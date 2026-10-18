import type { CaveCore } from '../core/types.ts'
import { MAP_W, MAP_H } from '../core/state.ts'
import { hashSeed, makeRnd } from '../core/rng.ts'
import { buildMacro, carveSpine, macroCellOf, MW, MH, CELL_FLOOR_MIN, BEACON_DIST_BAND } from './gen/macro.ts'
import { noiseFill, smooth, widen, fixDiagonals } from './gen/ca.ts'
import { largestRegion } from './gen/region.ts'
import { placeEntrance, placeBeacon } from './gen/places.ts'
import { pickLoopPairs } from './gen/loops.ts'

export type { CaveCore, CaveResult, CaveStats, GenOpts, SpawnHint } from '../core/types.ts'
export const MAX_ATTEMPTS = 8

export const caveSeed = (seed: number, a: number): number =>
  a === 0 ? seed >>> 0 : hashSeed(seed >>> 0, 'cave:' + a)

// One terrain attempt only. Population, validation and the guaranteed fallback
// wrapper belong to B4-B6; this module does not claim a complete CaveResult yet.
export function carveCore(cs: number): CaveCore | null {
  const w = MAP_W, h = MAP_H, stream = (tag: string) => makeRnd(hashSeed(cs, 'cave:' + tag))
  const layout = buildMacro(stream('macro'), w, h), raw = new Uint8Array(w * h)
  noiseFill(raw, w, h, stream('fill'), layout.M)
  const g = smooth(raw, w, h)
  carveSpine(g, w, h, layout, stream('spine'))
  widen(g, w, h)
  fixDiagonals(g, w, h)
  const region = largestRegion(g, w, h)
  if (region.keep < 16000) return null

  const cells = new Int32Array(MW * MH)
  let minX = w, maxX = -1, minY = h, maxY = -1, hasEntrance = false
  for (let i = 0; i < g.length; i++) if (!g[i]) {
    const x = i % w, y = Math.floor(i / w), c = macroCellOf(i, w)
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    cells[c]++
    if (y < 18 && c === layout.root) hasEntrance = true
  }
  if (maxX - minX + 1 < 0.9 * w || maxY - minY + 1 < 0.9 * h || !hasEntrance) return null
  if (cells.some((n) => n < CELL_FLOOR_MIN)) return null

  const entrance = placeEntrance(g, w, h, layout.root, stream('entrance'))
  if (entrance < 0) return null
  const loops = pickLoopPairs(g, w, h, entrance, layout, stream('tunnels'))
  if (loops.loops < 2) return null
  const B = placeBeacon(g, w, h, entrance)
  if (!B || B.beaconDist < BEACON_DIST_BAND[0] || B.beaconDist > BEACON_DIST_BAND[1]) return null

  // The work grid is 1=wall; CaveCore.t uses the core contract 0='#', 1='.', 2=','.
  const t = new Uint8Array(g.length), beaconMask = new Uint8Array(g.length)
  let floor = 0
  for (let i = 0; i < g.length; i++) { t[i] = g[i] ? 0 : 1; floor += t[i] }
  for (const i of B.chamber) beaconMask[i] = 1
  return {
    w, h, t, entrance, beacon: B.beacon, dist: B.dist, beaconDist: B.beaconDist,
    beaconMask, chamber: B.chamber,
    stats: {
      attempts: 1, floor, dropped: region.dropped, beaconDist: B.beaconDist,
      loops: loops.loops, tunnelTiles: loops.tunnelTiles, chamberR: B.chamberR,
      // R-115: mainLoop is finalised only after full-cave validation, never per attempt.
      mainLoop: false, fallback: false, ecc: layout.ecc, treeDraws: layout.treeDraws,
    },
  }
}
