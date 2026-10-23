// Route queries over the escape field (architecture-rocks §4, architecture-rocks-2 §6). L1: pure, DOM-free.
import type { State } from '../core/types.ts'
import { bfs4 } from './bfs.ts'
import { wrapPi } from '../core/math.ts'
import { T } from '../core/tuning.ts'
import { getEmptyMask, getExitDist, getPendingMask, getSolid } from './caches.ts'
import { circleRectOverlap } from './collide.ts'
import { idx, inMap, isSolidAt, TILE, tileToWorld, worldToTile } from './grid.ts'
import { lineOfSight } from './los.ts'

export const ROUTE_VISIT_MAX = 19_200 // ponytail: visit cap = old 160x120 map (~0.3 ms); exceeded -> -1 (conservative for every caller)

// ponytail: scratch buffers are rebuildable module caches, never State. gen marks "visited", gen + 1 marks "extra-blocked";
// stamps never need clearing between calls. Add a pool only if routeDist ever runs re-entrantly.
let stamp = new Uint16Array(0)
let gen = 0
let queue = new Int32Array(0)
let dist = new Int32Array(0)

// Fixed neighbour order E, S, W, N (architecture-world-queries §2).
const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

// Shortest 4-connected path length from any source to the exit over base solid + landed rocks (+ pending if pendingBlocks)
// + `blocked`. Returns -1 when unreachable or when more than ROUTE_VISIT_MAX cells were dequeued. Early exit returns
// dist[t] + E[t], a real route length and so an upper bound of the true distance (R-119).
export function routeDist(s: State, blocked: readonly number[], sources: readonly number[], pendingBlocks = true): number {
  const w = s.world.w, n = w * s.world.h
  const { tx, ty } = s.world.exit
  if (!inMap(s, tx, ty)) return -1
  if (stamp.length !== n) { stamp = new Uint16Array(n); queue = new Int32Array(n); dist = new Int32Array(n); gen = 0 }
  gen += 2
  if (gen >= 65534) { stamp.fill(0); gen = 2 }
  const solid = getSolid(s), pend = pendingBlocks ? getPendingMask(s) : getEmptyMask(s)
  const E = getExitDist(s)
  let eF = Infinity // min E over the blocked footprint
  for (const i of blocked) {
    if (!(i >= 0 && i < n)) continue
    stamp[i] = gen + 1
    if (E[i] >= 0 && E[i] < eF) eF = E[i]
  }
  const goal = ty * w + tx
  let head = 0, tail = 0
  for (const i of sources) {
    if (!(i >= 0 && i < n) || stamp[i] === gen + 1 || stamp[i] === gen) continue
    stamp[i] = gen; dist[i] = 0; queue[tail++] = i
  }
  while (head < tail) {
    const i = queue[head++]
    if (i === goal) return dist[i]
    if (E[i] >= 0 && E[i] < eF) return dist[i] + E[i] // early exit by proof: E strictly falls along downhill and avoids every blocked tile
    if (head > ROUTE_VISIT_MAX) return -1
    const x = i % w
    for (let k = 0; k < 4; k++) {
      if ((k === 0 && x === w - 1) || (k === 2 && x === 0)) continue
      const j = i + (k === 0 ? 1 : k === 1 ? w : k === 2 ? -1 : -w)
      if (j < 0 || j >= n || stamp[j] === gen || stamp[j] === gen + 1 || solid[j] || pend[j]) continue
      stamp[j] = gen; dist[j] = dist[i] + 1; queue[tail++] = j
    }
  }
  return -1
}

// Step from tile i to the 4-neighbour k (E, S, W, N), or -1 off the map.
function neighbour(w: number, n: number, i: number, k: number): number {
  const x = i % w
  if ((k === 0 && x === w - 1) || (k === 2 && x === 0)) return -1
  const j = i + (k === 0 ? 1 : k === 1 ? w : k === 2 ? -1 : -w)
  return j >= 0 && j < n ? j : -1
}

// Steepest-descent walk on the exit field E. Result starts with p0 (element 0) and holds at most `maxTiles` tiles in total
// (Infinity = to the exit); a complete walk ends at the exit tile (E = 0). Returns [] when p0 is off the field (E < 0 or out of range).
export function downhill(s: State, E: Int32Array, p0: number, maxTiles: number): number[] {
  const w = s.world.w, n = E.length
  if (!Number.isInteger(p0) || p0 < 0 || p0 >= n || E[p0] < 0) return []
  const path = [p0]
  let cur = p0
  while (E[cur] > 0 && path.length < maxTiles) {
    let next = -1
    for (let k = 0; k < 4 && next < 0; k++) {
      const j = neighbour(w, n, cur, k)
      if (j >= 0 && E[j] === E[cur] - 1) next = j
    }
    if (next < 0) break
    path.push(next)
    cur = next
  }
  return path
}

// Non-solid tiles overlapped by the player circle (closest-point distance < r) that are not in `exclude`; at most 4.
// Pending tiles count (the player may stand in a shadow). Order: row-major.
export function playerSources(s: State, exclude: readonly number[]): number[] {
  const { x, y } = s.player, r = T.player.radiusPx, out: number[] = []
  for (let ty = worldToTile(y - r); ty <= worldToTile(y + r); ty++) {
    for (let tx = worldToTile(x - r); tx <= worldToTile(x + r); tx++) {
      if (!inMap(s, tx, ty) || out.length >= 4) continue
      const i = idx(s, tx, ty)
      if (isSolidAt(s, i) || exclude.includes(i)) continue
      if (circleRectOverlap(x, y, r, tx * TILE, ty * TILE, (tx + 1) * TILE, (ty + 1) * TILE)) out.push(i)
    }
  }
  return out
}

// Pure L1 core of the exit marker (rocks-2 §6 steps 1-4). null = no source with E >= 0 (caller keeps its previous angle).
// Among equal-descent neighbours the one closest to prevAngle wins (no diagonal flicker), then the order E, S, W, N.
export function exitHeading(s: State, prevAngle: number): { angle: number; dist: number } | null {
  const E = getExitDist(s), w = s.world.w, n = E.length
  let p0 = -1
  for (const i of playerSources(s, [])) if (E[i] >= 0 && (p0 < 0 || E[i] < E[p0])) p0 = i
  if (p0 < 0) return null
  const route = [p0]
  for (let cur = p0; route.length <= T.hud.exitLookTiles && E[cur] > 0;) {
    let next = -1, best = Infinity
    for (let k = 0; k < 4; k++) {
      const j = neighbour(w, n, cur, k)
      if (j < 0 || E[j] !== E[cur] - 1) continue
      const off = Math.abs(wrapPi(Math.atan2(DY[k], DX[k]) - prevAngle))
      if (off < best) { best = off; next = j }
    }
    if (next < 0) break
    route.push(next)
    cur = next
  }
  // Take the farthest route tile that is still in a straight line of sight: removes the zig-zag of 4-connected paths.
  let q = route[0]
  for (let k = route.length - 1; k >= 1; k--) if (lineOfSight(s, p0, route[k])) { q = route[k]; break }
  const dx = tileToWorld(q % w) - s.player.x, dy = tileToWorld(Math.floor(q / w)) - s.player.y
  return { angle: dx === 0 && dy === 0 ? prevAngle : Math.atan2(dy, dx), dist: E[p0] }
}

// Final physical escape proof at impact: current walls + landed rubble + this footprint, from the player's actual tile.
// Pending shadows remain walkable; every later impact must prove its own route too.
export function physicalExitReachable(s: State, blocked: readonly number[]): boolean {
  const { w, h, exit } = s.world, p = s.player
  const tx = worldToTile(p.x), ty = worldToTile(p.y)
  if (!inMap(s, tx, ty) || !inMap(s, exit.tx, exit.ty)) return false
  const grid = getSolid(s).slice(), source = ty * w + tx, goal = exit.ty * w + exit.tx
  for (const i of blocked) if (i >= 0 && i < grid.length) grid[i] = 1
  if (grid[source] || grid[goal]) return false
  return bfs4(grid, w, h, goal)[source] >= 0
}
