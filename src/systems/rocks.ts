// L3 systems: falling-rock planner and lander (architecture-rocks §3-§4, architecture-rocks-2 §1-§3). No render/ui imports.
// stepQuake (B2q, quake.ts) drives these three functions; monsters.ts and director.ts never import this file.
import type { Rock, State } from '../core/types.ts'
import { clamp } from '../core/math.ts'
import { rand } from '../core/rng.ts'
import { T } from '../core/tuning.ts'
import { getExitDist, getPendingMask, getSolid, isBeaconRoom } from '../world/caches.ts'
import { circleRectOverlap } from '../world/collide.ts'
import { paramsOf } from '../world/gen/params.ts'
import { idx, inMap, TILE } from '../world/grid.ts'
import { downhill, physicalExitReachable, playerSources, routeDist } from '../world/route.ts'
import { hurtPlayerHp } from './combat.ts'
import { addShake, emit } from './fx.ts'
import { setDying } from './monsters.ts'

export type RockPlan = { tx: number; ty: number; size: 1 | 2; tiles: number[]; x: number; y: number }

const CANDIDATES = 8 // 8 candidates x 5 gameplay draws = 40 per call, whatever the outcome (determinism, rocks §3.2)
const SHAKE_FALLOFF_PX = 400
const sgn = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0)

// Footprint tile indices in the order TL, TR, BL, BR (1 or 4), or null if any tile is off the map.
function footprint(s: State, tx: number, ty: number, size: 1 | 2): number[] | null {
  const out: number[] = []
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
    if (!inMap(s, tx + dx, ty + dy)) return null
    out.push(idx(s, tx + dx, ty + dy))
  }
  return out
}

const centre = (tx: number, ty: number, size: 1 | 2): [number, number] =>
  size === 1 ? [tx * TILE + TILE / 2, ty * TILE + TILE / 2] : [(tx + 1) * TILE, (ty + 1) * TILE]

// Footprint rect of a rock: tiles[0] is always the top-left tile (TL, TR, BL, BR order).
function rectOf(s: State, r: Rock): [number, number, number, number] {
  const x0 = (r.tiles[0] % s.world.w) * TILE, y0 = Math.floor(r.tiles[0] / s.world.w) * TILE
  return [x0, y0, x0 + r.size * TILE, y0 + r.size * TILE]
}

// P2 ramp length is per depth class (R-164; class 3 = T.rocks.rampS = 80).
function p2(s: State): number {
  return T.rocks.p2Start + (T.rocks.p2End - T.rocks.p2Start) * Math.min(1, s.director.escapeT / paramsOf(s.world.depthClass).rampS)
}

// Cheap filters of rocks §3.3 for a candidate footprint.
function placeable(s: State, tx: number, ty: number, size: 1 | 2, tiles: number[]): boolean {
  const solid = getSolid(s), pend = getPendingMask(s), E = getExitDist(s), w = s.world.w
  const ex = s.world.exit, bc = s.world.beacon
  for (const i of tiles) {
    if (solid[i] || pend[i] || E[i] < 0) return false
    const x = i % w, y = Math.floor(i / w)
    if (Math.max(Math.abs(x - ex.tx), Math.abs(y - ex.ty)) <= T.rocks.exitClearTiles) return false
    if (Math.max(Math.abs(x - bc.tx), Math.abs(y - bc.ty)) <= T.rocks.beaconClearTiles || isBeaconRoom(s, i)) return false
  }
  const x0 = tx * TILE, y0 = ty * TILE, x1 = (tx + size) * TILE, y1 = (ty + size) * TILE
  // Player gap: circle of radius (player + gap) must not touch the rect, so a rock never spawns onto the player.
  if (circleRectOverlap(s.player.x, s.player.y, T.player.radiusPx + T.rocks.playerGapPx, x0, y0, x1, y1)) return false
  return !s.pickups.some((k) => k.x >= x0 && k.x < x1 && k.y >= y0 && k.y < y1)
}

// Solid 4-neighbours outside the footprint (rocks §3.4 `narrow`); 2x2 is halved to normalise.
function narrowness(s: State, tiles: number[], size: 1 | 2): number {
  const solid = getSolid(s), w = s.world.w, h = s.world.h
  let n = 0
  for (const i of tiles) {
    const x = i % w, y = Math.floor(i / w)
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      if (x + dx < 0 || y + dy < 0 || x + dx >= w || y + dy >= h) continue
      const j = idx(s, x + dx, y + dy)
      if (!tiles.includes(j) && solid[j]) n++
    }
  }
  return size === 2 ? n / 2 : n
}

type Cand = { tx: number; ty: number; size: 1 | 2; tiles: number[]; score: number }

export function planRockFall(s: State): RockPlan | null {
  let landed = 0, pending = 0
  for (const r of s.rocks) if (r.landed) landed++; else pending++
  if (landed >= T.escape.rocksMax || pending >= T.rocks.pendingMax) return null
  const E = getExitDist(s), w = s.world.w
  const src = playerSources(s, [])
  let p0 = -1
  for (const i of src) if (E[i] >= 0 && (p0 < 0 || E[i] < E[p0])) p0 = i
  if (p0 < 0) return null // no sources, or every source stands in a shadow: rocks pause (rocks-2 §4)
  const route = downhill(s, E, p0, T.rocks.lookahead), L = route.length
  const routeSet = new Set(route), fullRoute = new Set(downhill(s, E, p0, Infinity))
  const px = p0 % w, py = Math.floor(p0 / w)
  const cands: Cand[] = []
  for (let c = 0; c < CANDIDATES; c++) {
    const u0 = rand(s, 'gameplay'), u1 = rand(s, 'gameplay'), u2 = rand(s, 'gameplay'), u3 = rand(s, 'gameplay'), u4 = rand(s, 'gameplay')
    let tx: number, ty: number
    if (u0 < T.rocks.routeModeP && L >= 6) {
      // ponytail: L = 6 gives an empty 5..4 range; clamp j to L-2 so route[j + 1] exists.
      const j = Math.min(5 + Math.floor(u1 * (Math.min(L - 2, 20) - 5 + 1)), L - 2)
      const a = route[j - 1], b = route[j + 1]
      const dx = (b % w) - (a % w), dy = Math.floor(b / w) - Math.floor(a / w)
      let qx = -sgn(dy), qy = sgn(dx)
      if (qx === 0 && qy === 0) qy = 1
      const o = Math.round((u2 * 2 - 1) * T.rocks.lateralTiles)
      tx = (route[j] % w) + o * qx
      ty = Math.floor(route[j] / w) + o * qy
    } else {
      const a = u1 * 2 * Math.PI, r = 4 + u2 * 8
      tx = px + Math.round(r * Math.cos(a))
      ty = py + Math.round(r * Math.sin(a))
    }
    const size: 1 | 2 = u3 < p2(s) ? 2 : 1
    const tiles = footprint(s, tx, ty, size)
    if (!tiles || !placeable(s, tx, ty, size, tiles)) continue
    const onRoute = tiles.some((i) => routeSet.has(i)) ? 1 : 0
    cands.push({ tx, ty, size, tiles, score: 2 * onRoute + narrowness(s, tiles, size) + u4 * 0.01 })
  }
  cands.sort((a, b) => b.score - a.score) // stable (ES2019): equal scores keep candidate order
  const d0 = E[p0]
  let bfsUsed = 0
  for (const c of cands) {
    let ok = !c.tiles.some((i) => fullRoute.has(i)) // fast accept: the current downhill route survives, detour 0
    if (!ok && bfsUsed < T.rocks.bfsTestsMax) {
      bfsUsed++
      const d1 = routeDist(s, c.tiles, src, true)
      ok = d1 >= 0 && d1 - d0 <= Math.max(T.rocks.detourMaxTiles, Math.floor(T.rocks.detourMaxFrac * d0))
    }
    if (ok) {
      const [x, y] = centre(c.tx, c.ty, c.size)
      return { tx: c.tx, ty: c.ty, size: c.size, tiles: c.tiles, x, y }
    }
  }
  return null
}

export function commitRock(s: State, plan: RockPlan): Rock {
  const r: Rock = { id: s.meta.nextId++, x: plan.x, y: plan.y, size: plan.size, tiles: plan.tiles.slice(),
    t: T.escape.rockWarnS, landed: false, hit: false, shrunk: false }
  s.rocks.push(r)
  s.world.pendingSig++
  emit(s, 'rockWarn', r.x, r.y, r.size)
  return r
}

// Cosmetic dust puff when the landed cap blocks new rocks (rocks-2 §4): a random floor tile near the player, cosmetic stream only.
export function cosmeticRockLand(s: State): void {
  const solid = getSolid(s), px = Math.floor(s.player.x / TILE), py = Math.floor(s.player.y / TILE)
  const ux = rand(s, 'cosmetic'), uy = rand(s, 'cosmetic')
  const tx = px + Math.round((ux * 2 - 1) * 10), ty = py + Math.round((uy * 2 - 1) * 6)
  if (inMap(s, tx, ty) && !solid[idx(s, tx, ty)]) emit(s, 'rockLand', tx * TILE + TILE / 2, ty * TILE + TILE / 2, 0)
}

function land(s: State, r: Rock): number {
  if (!physicalExitReachable(s, r.tiles)) {
    s.rocks.splice(s.rocks.indexOf(r), 1)
    s.world.pendingSig++
    emit(s, 'rockLand', r.x, r.y, 0)
    return 1
  }
  r.landed = true
  r.hit = true
  s.world.solidSig++
  s.world.pendingSig++
  const [x0, y0, x1, y1] = rectOf(s, r)
  for (const m of s.monsters) {
    if (m.ai !== 'dying' && circleRectOverlap(m.x, m.y, T.monsters[m.kind].radiusPx, x0, y0, x1, y1)) setDying(s, m)
  }
  emit(s, 'rockLand', r.x, r.y, r.size)
  addShake(s, 'rockLand', Math.max(0, 1 - Math.hypot(r.x - s.player.x, r.y - s.player.y) / SHAKE_FALLOFF_PX))
  return 1
}

// Push the player out of footprint F into the best 4-adjacent free tile (rocks-2 §2). Returns BFS runs used, or -1 when no target.
function pushOut(s: State, r: Rock): { runs: number; ok: boolean } {
  const p = s.player, solid = getSolid(s), E = getExitDist(s), w = s.world.w, h = s.world.h, rad = T.player.radiusPx
  const ring: number[] = []
  for (const i of r.tiles) {
    const x = i % w, y = Math.floor(i / w)
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      if (x + dx < 0 || y + dy < 0 || x + dx >= w || y + dy >= h) continue
      const j = idx(s, x + dx, y + dy)
      if (!r.tiles.includes(j) && !solid[j] && !ring.includes(j)) ring.push(j)
    }
  }
  const pushDist = (i: number): number => {
    const lo = (i % w) * TILE + rad, hi = (i % w) * TILE + TILE - rad, lo2 = Math.floor(i / w) * TILE + rad, hi2 = Math.floor(i / w) * TILE + TILE - rad
    return Math.hypot(p.x - clamp(p.x, lo, hi), p.y - clamp(p.y, lo2, hi2))
  }
  const eKey = (i: number): number => (E[i] >= 0 ? E[i] : Infinity) // unreachable-in-E tiles sort last on ties
  ring.sort((a, b) => pushDist(a) - pushDist(b) || eKey(a) - eKey(b) || a - b)
  let target = ring.find((i) => E[i] >= 0) ?? -1, runs = 0
  if (target < 0) {
    for (const i of ring.slice(0, 2)) {
      runs++
      if (routeDist(s, r.tiles, [i], false) >= 0) { target = i; break }
    }
  }
  if (target < 0) return { runs, ok: false }
  const tx = target % w, ty = Math.floor(target / w)
  p.x = clamp(p.x, tx * TILE + rad, tx * TILE + TILE - rad)
  p.y = clamp(p.y, ty * TILE + rad, ty * TILE + TILE - rad)
  return { runs, ok: true }
}

// Impact of a rock whose telegraph ended (rocks-2 §1). Returns route-query work (0..7), including the final physical proof; quake defers planning when non-zero.
export function landRock(s: State, r: Rock): number {
  let runs = 0
  if (!circleRectOverlap(s.player.x, s.player.y, T.player.radiusPx, ...rectOf(s, r))) {
    const E = getExitDist(s), src = playerSources(s, r.tiles)
    if (src.some((i) => E[i] >= 0)) return land(s, r) // E proves pending safety; final physical proof still runs
    runs++
    if (routeDist(s, r.tiles, src, false) >= 0) return runs + land(s, r)
  } else {
    hurtPlayerHp(s, 'rock') // roll i-frames never dodge rocks; hurtT / god are handled inside
    const push = pushOut(s, r)
    runs += push.runs
    if (push.ok) return runs + land(s, r)
  }
  if (r.size === 2) {
    const p = s.player, w = s.world.w
    const order = r.tiles.map((i, k) => ({ i, k, d: Math.hypot((i % w) * TILE + TILE / 2 - p.x, Math.floor(i / w) * TILE + TILE / 2 - p.y) }))
      .sort((a, b) => b.d - a.d || a.k - b.k)
    for (const { i } of order) {
      const x0 = (i % w) * TILE, y0 = Math.floor(i / w) * TILE
      if (circleRectOverlap(p.x, p.y, T.player.radiusPx, x0, y0, x0 + TILE, y0 + TILE)) continue
      runs++
      if (routeDist(s, [i], playerSources(s, [i]), false) < 0) continue
      r.size = 1
      r.tiles = [i]
      r.x = x0 + TILE / 2
      r.y = y0 + TILE / 2
      r.shrunk = true
      return runs + land(s, r)
    }
  }
  s.rocks.splice(s.rocks.indexOf(r), 1)
  s.world.pendingSig++
  emit(s, 'rockLand', r.x, r.y, 0)
  return runs
}
