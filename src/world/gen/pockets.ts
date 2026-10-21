// Cave pre-pass fields (wide2, main, nearMain), dead-end pocket detection and dark chambers (CG2 §2).
// Purity: no function here mutates a CaveCore; callers pass a Terrain view with COPIES of t/dist (only pickChambers writes t, only refreshWide2 writes wide2).
import type { CaveCore, Zone } from '../../core/types.ts'
import type { Rnd } from '../../core/rng.ts'
import { depthOf, zoneOfDepth } from '../../core/score.ts'
import { shortestPath } from '../bfs.ts'

export type Terrain = Pick<CaveCore, 'w' | 'h' | 't' | 'dist' | 'beaconMask' | 'beaconDist' | 'entrance' | 'beacon'>
export type Pocket = { leaf: number; tiles: number[]; zone: Zone; size: number }
export type Fields = { wide2: Uint8Array; main: number[]; mainMask: Uint8Array; nearMain: Uint8Array }

export const CHAMBERS: readonly [number, number, number, number] = [2, 2, 2, 2] // max dark chambers per zone, zone 1 includes the teaching patch
export const POCKET_MIN = 12, POCKET_MAX = 90
export const NECK_MAX = 4
export const TEACH_LEAF_MAX = 40 // zone-1 pocket usable as the teaching chamber only if its leaf dist <= this
export const NEAR_MAIN_R = 3

// 1 where tile i lies in at least one all-floor 2x2 block.
export function buildWide2(t: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = y * w + x
    if (t[i] > 0 && t[i + 1] > 0 && t[i + w] > 0 && t[i + w + 1] > 0) out[i] = out[i + 1] = out[i + w] = out[i + w + 1] = 1
  }
  return out
}

// Floor was only added at `changed`, so wide2 only gains ones: re-test the four 2x2 blocks that touch each new tile.
export function refreshWide2(wide2: Uint8Array, t: Uint8Array, w: number, h: number, changed: readonly number[]): void {
  for (const c of changed) {
    const cx = c % w, cy = (c - cx) / w
    for (let y = cy - 1; y <= cy; y++) for (let x = cx - 1; x <= cx; x++) {
      if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) continue
      const i = y * w + x
      if (t[i] > 0 && t[i + 1] > 0 && t[i + w] > 0 && t[i + w + 1] > 0) wide2[i] = wide2[i + 1] = wide2[i + w] = wide2[i + w + 1] = 1
    }
  }
}

// Entrance -> Beacon, inclusive. shortestPath steps E, S, W, N to the first neighbour with dist - 1 (CG2 §2), then reverse.
export function buildMain(dist: Int32Array, w: number, entrance: number, beacon: number): number[] {
  const path = shortestPath(dist, w, beacon).reverse()
  return path.length > 0 && path[0] === entrance ? path : []
}

// 1 where the Chebyshev distance to a main tile is <= NEAR_MAIN_R.
export function buildNearMain(main: readonly number[], w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (const m of main) {
    const mx = m % w, my = (m - mx) / w
    for (let y = Math.max(0, my - NEAR_MAIN_R); y <= Math.min(h - 1, my + NEAR_MAIN_R); y++) {
      for (let x = Math.max(0, mx - NEAR_MAIN_R); x <= Math.min(w - 1, mx + NEAR_MAIN_R); x++) out[y * w + x] = 1
    }
  }
  return out
}

export function buildFields(c: Terrain): Fields {
  const main = buildMain(c.dist, c.w, c.entrance, c.beacon), mainMask = new Uint8Array(c.w * c.h)
  for (const m of main) mainMask[m] = 1
  return { wide2: buildWide2(c.t, c.w, c.h), main, mainMask, nearMain: buildNearMain(main, c.w, c.h) }
}

// A leaf is a floor tile no floor 4-neighbour of which is deeper.
function isLeaf(c: Terrain, i: number): boolean {
  const { w, t, dist, beaconMask } = c, n = t.length, x = i % w, d = dist[i]
  if (t[i] === 0 || d <= 0 || beaconMask[i]) return false
  return !((x + 1 < w && t[i + 1] > 0 && dist[i + 1] > d) || (i + w < n && t[i + w] > 0 && dist[i + w] > d)
    || (x > 0 && t[i - 1] > 0 && dist[i - 1] > d) || (i >= w && t[i - w] > 0 && dist[i - w] > d))
}

// Bounded flood from a leaf over floor with dist >= dist[leaf] - depth; null when the region is not a dead-end pocket.
function flood(c: Terrain, f: Fields, leaf: number, depth: number, stamp: Int32Array, sv: number): number[] | null {
  const { w, t, dist, beaconMask } = c, n = t.length, dl = dist[leaf], low = dl - depth
  const tiles = [leaf]
  let neck = 0
  stamp[leaf] = sv
  for (let q = 0; q < tiles.length; q++) {
    const i = tiles[q], x = i % w
    if (f.mainMask[i] || beaconMask[i]) return null
    if (dist[i] === low && ++neck > NECK_MAX) return null
    const nb = [x + 1 < w ? i + 1 : -1, i + w < n ? i + w : -1, x > 0 ? i - 1 : -1, i >= w ? i - w : -1]
    for (const j of nb) {
      if (j < 0 || t[j] === 0 || stamp[j] === sv || dist[j] < 0 || dist[j] < low) continue
      if (dist[j] > dl) return null // a deeper tile: not a dead end
      stamp[j] = sv
      tiles.push(j)
      if (tiles.length > POCKET_MAX) return null
    }
  }
  return tiles.length >= POCKET_MIN ? tiles : null
}

// depth: T.cave.pocketDepth for main caves, T.cave.fallbackPocketDepth for the fallback ring (R-163).
export function findPockets(c: Terrain, f: Fields, depth: number): Pocket[] {
  const stamp = new Int32Array(c.t.length), covered = new Uint8Array(c.t.length), out: Pocket[] = []
  let ordinal = 0
  for (let i = 0; i < c.t.length; i++) {
    if (covered[i] || !isLeaf(c, i)) continue
    const tiles = flood(c, f, i, depth, stamp, ++ordinal) // fresh stamp per leaf: a rejected flood never blocks later leaves
    if (!tiles) continue
    tiles.sort((a, b) => a - b)
    for (const j of tiles) covered[j] = 1
    out.push({ leaf: i, tiles, zone: zoneOfDepth(depthOf(c.dist[i], c.beaconDist)), size: tiles.length })
  }
  return out
}

// Dark chambers ('cave:rooms'). Teaching chamber first: one draw among zone-1 pockets with leaf dist <= TEACH_LEAF_MAX.
// None -> no draw, teach = null, teachSlot = true (the carved patch of teach.ts uses one of zone 1's slots).
// Then per zone up to CHAMBERS[z-1] minus used slots, one draw per pick. Writes t[i] = 2 for every chosen tile (c.t must be a work copy).
export function pickChambers(c: Terrain, rnd: Rnd, pockets: readonly Pocket[]):
  { chosen: Pocket[]; teach: Pocket | null; teachSlot: boolean } {
  const pool: Pocket[][] = [[], [], [], []], chosen: Pocket[] = []
  for (const p of pockets) pool[p.zone - 1].push(p)
  const near = pool[0].filter((p) => c.dist[p.leaf] <= TEACH_LEAF_MAX)
  let teach: Pocket | null = null
  if (near.length > 0) {
    teach = near[rnd.int(0, near.length - 1)]
    pool[0].splice(pool[0].indexOf(teach), 1)
    chosen.push(teach)
  }
  for (let z = 0; z < 4; z++) {
    const slots = CHAMBERS[z] - (z === 0 ? 1 : 0) // zone 1: the teaching chamber or the carved patch holds one slot
    for (let k = 0; k < slots && pool[z].length > 0; k++) chosen.push(pool[z].splice(rnd.int(0, pool[z].length - 1), 1)[0])
  }
  for (const p of chosen) for (const i of p.tiles) c.t[i] = 2
  return { chosen, teach, teachSlot: teach === null }
}
