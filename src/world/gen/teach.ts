// Zone-1 teaching layout T1-T4 (CG2 §4, 'cave:teach' stream, R-152, R-156). Returns tile indices only; populate builds the objects.
// Purity: only the T3 carve writes, and only into the t / dist / wide2 arrays the caller passes (COPIES); Fields.main, mainMask and nearMain are never written.
import type { MineralId } from '../../core/types.ts'
import type { Rnd } from '../../core/rng.ts'
import { depthOf, zoneOfDepth } from '../../core/score.ts'
import { isEdge } from './carve.ts'
import { refreshWide2 } from './pockets.ts'
import type { Fields, Pocket, Terrain } from './pockets.ts'

export type TeachPlan = {
  resin: number // T1 small resin tile (a main tile)
  vein: { tile: number; stand: number; mineral: MineralId; pieces: number } // T2: copper, 2 pieces
  lurker: number // T4 spawn tile
  patch: number[] // T3 dark patch (',' tiles): the teach pocket tiles, or the 9 carved block tiles
  carved: boolean
}

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const // E, S, W, N
const T1_WIN: readonly [number, number] = [7, 11], T1_WIDE: readonly [number, number] = [7, 20]
const T2_WIN: readonly [number, number] = [12, 20], T2_WIDE: readonly [number, number] = [8, 40]
const T3_WIN: readonly [number, number] = [15, 60] // R-156
const T4_WIN: readonly [number, number] = [14, 24], T4_WIDE: readonly [number, number] = [14, 40]
const T4_EUCLID: readonly [number, number] = [8, 16] // tiles from the entrance
const CARVE_REACH = 6 // upper bound of how many steps behind its main tile a carved tile can lie (real max is 5)

const inWin = (d: number, win: readonly [number, number]): boolean => d >= win[0] && d <= win[1]
const draw = (rnd: Rnd, len: number): number => rnd.int(0, Math.max(0, len - 1)) // always taken, even for an empty list

// Neighbour of tile i in direction (dx, dy), or -1 off the map.
function nb(w: number, h: number, i: number, dx: number, dy: number): number {
  const x = (i % w) + dx, y = Math.floor(i / w) + dy
  return x < 0 || y < 0 || x >= w || y >= h ? -1 : y * w + x
}

function t1Candidates(c: Terrain, f: Fields, win: readonly [number, number]): number[] {
  return f.main.filter((m) => f.wide2[m] && inWin(c.dist[m], win))
}

type VeinSpot = { tile: number; stand: number }

function t2Candidates(c: Terrain, f: Fields): VeinSpot[] {
  const { w, h, t, dist } = c, out: VeinSpot[] = [], seen = new Set<number>()
  for (const m of f.main) {
    if (!inWin(dist[m], T2_WIN)) continue
    for (const [dx, dy] of DIRS) {
      const j = nb(w, h, m, dx, dy)
      if (j < 0 || t[j] !== 0 || isEdge(j % w, Math.floor(j / w), w, h) || seen.has(j)) continue
      seen.add(j)
      out.push({ tile: j, stand: m })
    }
  }
  if (out.length > 0) return out
  for (let i = 0; i < t.length; i++) { // fallback: any wall with a zone-1 floor stand
    if (t[i] !== 0 || isEdge(i % w, Math.floor(i / w), w, h)) continue
    const stand = DIRS.map(([dx, dy]) => nb(w, h, i, dx, dy)).find((j) => j >= 0 && t[j] > 0 && inWin(dist[j], T2_WIDE) && zoneOfDepth(depthOf(dist[j], c.beaconDist)) === 1)
    if (stand !== undefined) out.push({ tile: i, stand })
  }
  return out
}

// T3 carve: attachment a = m + d (wall) and a 3x3 block centred at m + 3d (spans m + 2d .. m + 4d), directly beyond a. Everything around the block except a
// must stay wall (no break-through). Adds floor only (R-049) and keeps dist equal to a fresh BFS. Returns the block tiles, or null.
function carvePatch(c: Terrain, f: Fields, veinTile: number): number[] | null {
  const { w, h, t, dist } = c
  for (const m of f.main) {
    if (!inWin(dist[m], T3_WIN) || dist[m] + CARVE_REACH > c.beaconDist) continue // keeps the Beacon the deepest tile
    const mx = m % w, my = Math.floor(m / w)
    for (const [dx, dy] of DIRS) {
      const a = nb(w, h, m, dx, dy), cx = mx + 3 * dx, cy = my + 3 * dy
      if (a < 0 || isEdge(a % w, Math.floor(a / w), w, h) || t[a] !== 0 || a === veinTile) continue
      const block: number[] = []
      let good = true
      for (let y = cy - 1; y <= cy + 1 && good; y++) for (let x = cx - 1; x <= cx + 1 && good; x++) {
        if (isEdge(x, y, w, h)) { good = false; break }
        const i = y * w + x
        if (t[i] !== 0 || i === veinTile) good = false
        block.push(i)
      }
      if (!good) continue
      for (const i of block) {
        const x = i % w, y = Math.floor(i / w)
        for (const [ex, ey] of DIRS) {
          const nx = x + ex, ny = y + ey, j = ny * w + nx
          if ((Math.abs(nx - cx) <= 1 && Math.abs(ny - cy) <= 1) || j === a) continue
          if (t[j] !== 0) good = false
        }
      }
      if (!good) continue
      applyCarve(c, f, a, block)
      return block
    }
  }
  return null
}

function applyCarve(c: Terrain, f: Fields, a: number, block: number[]): void {
  const { w, h, t, dist } = c
  // Real global distance: 1 + the closest floor neighbour of a. The ring test makes m a's only floor neighbour (a's lateral tiles touch
  // the block's near row, so they are wall), hence no existing tile gets closer (no shortcut); the min is kept as a cheap guard.
  let best = -1
  for (const [dx, dy] of DIRS) {
    const j = nb(w, h, a, dx, dy)
    if (j >= 0 && t[j] > 0 && dist[j] >= 0 && (best < 0 || dist[j] < best)) best = dist[j]
  }
  t[a] = 1
  dist[a] = best + 1
  for (const i of block) t[i] = 2
  const queue = [a]
  for (let q = 0; q < queue.length; q++) {
    for (const [dx, dy] of DIRS) {
      const j = nb(w, h, queue[q], dx, dy)
      if (j < 0 || t[j] !== 2 || dist[j] >= 0 || !block.includes(j)) continue
      dist[j] = dist[queue[q]] + 1
      queue.push(j)
    }
  }
  refreshWide2(f.wide2, t, w, h, queue)
}

function t4Candidates(c: Terrain, f: Fields, win: readonly [number, number], allowMain: boolean, skip: ReadonlySet<number>): number[] {
  const { w, h, t, dist } = c, ex = c.entrance % w, ey = Math.floor(c.entrance / w), out: number[] = []
  for (let i = 0; i < t.length; i++) {
    if (t[i] === 0 || !inWin(dist[i], win) || (!allowMain && f.mainMask[i]) || skip.has(i)) continue
    const x = i % w, y = Math.floor(i / w), e2 = (x - ex) * (x - ex) + (y - ey) * (y - ey)
    if (e2 < T4_EUCLID[0] * T4_EUCLID[0] || e2 > T4_EUCLID[1] * T4_EUCLID[1]) continue
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue
    if (DIRS.every(([dx, dy]) => t[i + dy * w + dx] > 0) && t[i - w - 1] > 0 && t[i - w + 1] > 0 && t[i + w - 1] > 0 && t[i + w + 1] > 0) out.push(i)
  }
  return out
}

// rnd = makeRnd(hashSeed(cs, 'cave:teach')). Exactly 3 draws (T1, T2, T4) whatever happens; T3 draws nothing. null = any element missing.
export function placeTeach(c: Terrain, f: Fields, rnd: Rnd, teach: Pocket | null): TeachPlan | null {
  const r1 = t1Candidates(c, f, T1_WIN), r1c = r1.length > 0 ? r1 : t1Candidates(c, f, T1_WIDE)
  const resin = r1c[draw(rnd, r1c.length)]
  const v2 = t2Candidates(c, f), vein = v2[draw(rnd, v2.length)]

  let patch: number[] | null = null, carved = false
  if (teach) patch = teach.tiles.slice()
  else { patch = carvePatch(c, f, vein ? vein.tile : -1); carved = patch !== null }

  const skip = new Set<number>(patch ?? [])
  if (resin !== undefined) skip.add(resin)
  if (vein) skip.add(vein.stand)
  let l4 = t4Candidates(c, f, T4_WIN, false, skip)
  if (l4.length === 0) l4 = t4Candidates(c, f, T4_WIN, true, skip)
  if (l4.length === 0) l4 = t4Candidates(c, f, T4_WIDE, true, skip)
  const lurker = l4[draw(rnd, l4.length)]

  if (resin === undefined || !vein || !patch || lurker === undefined) return null
  return { resin, vein: { tile: vein.tile, stand: vein.stand, mineral: 'copper', pieces: 2 }, lurker, patch, carved }
}
