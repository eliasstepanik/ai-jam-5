import type { CaveCore, CaveResult, GenOpts } from '../core/types.ts'
import { MAP_W, MAP_H } from '../core/state.ts'
import { hashSeed, makeRnd } from '../core/rng.ts'
import { buildMacro, carveSpine, macroCellOf, cellActive, MW, MH, CELL, CELL_FLOOR_MIN } from './gen/macro.ts'
import { PARAMS, paramsOf } from './gen/params.ts'
import type { CaveParams } from './gen/params.ts'
import { noiseFill, smooth, widen, fixDiagonals } from './gen/ca.ts'
import { largestRegion } from './gen/region.ts'
import { placeEntrance, placeBeacon } from './gen/places.ts'
import { hasAlternativeRoute, pickLoopPairs } from './gen/loops.ts'
import { sculpt } from './gen/sculpt.ts'
import { populate } from './gen/populate.ts'
import { fallbackCave } from './gen/fallback.ts'
import { validateCave } from './validate.ts'

export type { CaveCore, CaveResult, CaveStats, GenOpts, SpawnHint } from '../core/types.ts'
export const MAX_ATTEMPTS = 8

// GenOpts lives in core/types.ts (at its line cap), so the depth class rides on this intersection; paramsOf rounds, clamps and defaults to 3.
export type CaveOpts = GenOpts & { depthClass?: number }

export const caveSeed = (seed: number, a: number): number =>
  a === 0 ? seed >>> 0 : hashSeed(seed >>> 0, 'cave:' + a)

// One terrain attempt (passes 0-9); populate, validateCave and fallbackCave complete it in generateCave below.
// `skip` names optional passes to leave out ('sculpt'); checks use it to compare against the unsculpted terrain.
export function carveCore(cs: number, p: CaveParams = PARAMS[3], skip: readonly string[] = []): CaveCore | null {
  const w = MAP_W, h = MAP_H, stream = (tag: string) => makeRnd(hashSeed(cs, 'cave:' + tag))
  const layout = buildMacro(stream('macro'), w, h, p), raw = new Uint8Array(w * h)
  noiseFill(raw, w, h, stream('fill'), layout.M)
  const g = smooth(raw, w, h)
  carveSpine(g, w, h, layout, stream('spine'))
  widen(g, w, h)
  fixDiagonals(g, w, h)
  const region = largestRegion(g, w, h)
  if (region.keep < Math.round(16000 * p.cols * p.rows / 48)) return null // 16000 at 8x6; 16000 per 48 cells otherwise

  const cells = new Int32Array(MW * MH)
  let minX = w, maxX = -1, minY = h, maxY = -1, hasEntrance = false
  for (let i = 0; i < g.length; i++) if (!g[i]) {
    const x = i % w, y = Math.floor(i / w), c = macroCellOf(i, w)
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    cells[c]++
    if (y < 18 && c === layout.root) hasEntrance = true
  }
  // bbox is 90 % of the active area (w = 8 cells, h = 6 cells for class 3); the cell floor skips masked cells, which stay wall.
  if (maxX - minX + 1 < 0.9 * (p.cols * CELL) || maxY - minY + 1 < 0.9 * (p.rows * CELL) || !hasEntrance) return null
  if (cells.some((n, c) => cellActive(c, p) && n < CELL_FLOOR_MIN)) return null

  const entrance = placeEntrance(g, w, h, layout.root, stream('entrance'))
  if (entrance < 0) return null
  const loops = pickLoopPairs(g, w, h, entrance, layout, stream('tunnels'), p)
  if (loops.loops < 2) return null
  if (!skip.includes('sculpt')) sculpt(g, w, h, entrance, hashSeed(cs, 'cave:sculpt')) // hash2 only: draws nothing from any stream
  const B = placeBeacon(g, w, h, entrance)
  if (!B || B.beaconDist < p.bdLo || B.beaconDist > p.bdHi) return null

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

// R-115 / R-160: stats.mainLoop (CG1 §9.3: hasAlternativeRoute entrance -> Beacon on the final tiles) is computed once per accepted
// cave, for the sync loop below and the chunked game path alike. Pure: returns a copy, the input result is not written.
export function finalizeCave(res: CaveResult): CaveResult {
  const w = MAP_W, g = new Uint8Array(w * MAP_H)
  for (let i = 0; i < g.length; i++) g[i] = res.tiles.charCodeAt(i) === 35 ? 1 : 0 // '#'
  const mainLoop = hasAlternativeRoute(g, w, MAP_H, res.entrance.ty * w + res.entrance.tx, res.beacon.ty * w + res.beacon.tx)
  return { ...res, stats: { ...res.stats, mainLoop } }
}

// CG2 §6: up to MAX_ATTEMPTS attempts, each pure in (seed, a); the first valid one wins, else the fixed ring (fallbackCave validates it).
export function generateCave(seed: number, opts: CaveOpts = {}): CaveResult {
  const p = paramsOf(opts.depthClass)
  for (let a = 0; a < MAX_ATTEMPTS && !opts.forceFail; a++) {
    const cs = caveSeed(seed, a), core = carveCore(cs, p)
    const res = core && populate(core, cs, a, opts)
    if (res && validateCave(res, p).ok) return finalizeCave(res)
  }
  return finalizeCave(fallbackCave(seed, p))
}
