// L3 systems: escape-run guide wisp (issue #81). A small light drifts ahead of the player along the real shortest walkable route to the
// exit and eases back when the player slows down. Cosmetic: it only reads the world and writes s.wisp, never gameplay state.
// The route is the steepest descent on an exit field with the same blocked set as getExitDist (the exit marker's field), so it avoids
// walls, landed rocks and pending rock shadows and re-routes when either changes. Pure and deterministic: no clock, no random; render is in render/particles.ts.
import type { State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { bfs4 } from '../world/bfs.ts'
import { getPendingMask, getSolid } from '../world/caches.ts'
import { idx, inMap, isSolidPx, N4, TILE, tileToWorld, worldToTile } from '../world/grid.ts'
import { downhill, playerSources } from '../world/route.ts'

export const WISP_LEAD_MIN_PX = 64 // wisp distance from the player (along the route) when the player stands still
export const WISP_LEAD_MAX_PX = 192 // ... and at full sprint
const WISP_PATH_TILES = 9 // cached route length: 8 tile steps = 256 px, enough for the lead plus the trail
const WISP_EASE = 4 // 1/s, how fast the lead follows the player's speed
export const WISP_MAX_PX_S = 360 // orb top speed: above the sprint speed (walkPxS * sprintMul = 240) so it can lead, far from a teleport
export const WISP_STEER_PER_S = 4 // 1/s, velocity approach rate (time constant 0.25 s): floaty, like the shades' steerPerS
const WISP_ARRIVE_K = 8 // 1/s, seek slows inside maxSpeed/8 px of the target; also the steady-state lag behind a moving target (30 px at sprint)
export const WISP_LEASH = 1.5 // the orb is pulled back to the player when farther than WISP_LEAD_MAX_PX * this
export const WISP_RESEED_PX = 2 * WISP_LEAD_MAX_PX * WISP_LEASH // ... and re-seeded at the player when farther than this (the pull cannot get round walls)
const TARGET = { x: 0, y: 0 } // scratch point (no per-tick allocation)
const WAY = { x: 0, y: 0 } // scratch waypoint

// Own exit field: same blocked set as getExitDist (walls + landed rocks + pending rock shadows) but a private buffer. getExitDist
// recycles two shared buffers; an extra caller would shift when other readers' fields get overwritten (rocks-prop.check's bot
// holds one across steps and stops winning).
// ponytail: module-level rebuildable cache (like world/caches.ts), rebuilt only when a rock signature changes (rocks land about every
// second); the key covers run, tiles, size and exit. Upgrade: expose a non-flipping field from world/caches.ts and delete this.
let field = new Int32Array(0), blocked = new Uint8Array(0), fieldKey = ''
function exitField(s: State): Int32Array {
  const wd = s.world, n = wd.w * wd.h
  const key = s.meta.runId + ':' + wd.tilesHash + ':' + wd.w + 'x' + wd.h + ':' + wd.exit.tx + ',' + wd.exit.ty + ':' + wd.solidSig + ':' + wd.pendingSig
  if (key === fieldKey && field.length === n) return field
  if (field.length !== n) { field = new Int32Array(n); blocked = new Uint8Array(n) }
  const solid = getSolid(s), pend = getPendingMask(s)
  for (let i = 0; i < n; i++) blocked[i] = solid[i] | pend[i]
  const e = inMap(s, wd.exit.tx, wd.exit.ty) ? idx(s, wd.exit.tx, wd.exit.ty) : -1
  if (e < 0 || blocked[e]) field.fill(-1)
  else bfs4(blocked, wd.w, wd.h, e, field)
  fieldKey = key
  return field
}

// Route start: the tile under the player when it is on the field, else the lowest-distance tile the player circle overlaps
// (a pending rock shadow), else -1 (no route; the wisp draws nothing).
function startTile(s: State, E: Int32Array): number {
  const tx = worldToTile(s.player.x), ty = worldToTile(s.player.y)
  if (inMap(s, tx, ty) && E[idx(s, tx, ty)] >= 0) return idx(s, tx, ty)
  let best = -1
  for (const i of playerSources(s, [])) if (E[i] >= 0 && (best < 0 || E[i] < E[best])) best = i
  return best
}

export function stepWisp(s: State, dt: number): void {
  const w = s.wisp
  if (s.meta.phase !== 'escape') { // off outside the escape: also clears a run that ended mid-escape
    if (w.on) { w.on = false; w.path = [] }
    return
  }
  const fresh = !w.on
  if (fresh) Object.assign(w, { on: true, d: 0, p0: -1, ss: -1, ps: -1, path: [] })
  // Starts at the player at rest, then glides out. Also re-seeded when the orb is stale or lost: in a wall or off the map or NaN (isSolidPx
  // covers all three; migrate() fills a missing wx/wy with 0,0, a border wall), under a landed rock, or farther than WISP_RESEED_PX
  // (noclip, teleport, hot reload far from the player). Re-seeding is a deliberate jump; no other path moves the orb faster than its top speed.
  if (fresh || isSolidPx(s, w.wx, w.wy) || Math.hypot(w.wx - s.player.x, w.wy - s.player.y) > WISP_RESEED_PX) {
    w.wx = s.player.x
    w.wy = s.player.y
    w.wvx = 0
    w.wvy = 0
  }
  // ponytail: recompute only when the player's tile or a rock signature changes (about 7 times a second at sprint); the exit field
  // is not even asked for otherwise. Upgrade: reuse the old path tail instead of walking the field again if profiling shows it.
  const here = idx(s, worldToTile(s.player.x), worldToTile(s.player.y))
  if (here !== w.p0 || w.ss !== s.world.solidSig || w.ps !== s.world.pendingSig) {
    Object.assign(w, { p0: here, ss: s.world.solidSig, ps: s.world.pendingSig })
    const E = exitField(s), start = startTile(s, E)
    w.path = start < 0 ? [] : downhill(s, E, start, WISP_PATH_TILES)
  }
  const run = Math.min(1, Math.hypot(s.player.vx, s.player.vy) / (T.player.walkPxS * T.escape.sprintMul))
  const want = WISP_LEAD_MIN_PX + (WISP_LEAD_MAX_PX - WISP_LEAD_MIN_PX) * run
  w.d += (want - w.d) * (1 - Math.exp(-WISP_EASE * dt))
  // The orb is a body with its own velocity (like the shades in entities/steer.ts): the route point at the eased lead is only its
  // TARGET. It seeks that point, its velocity eases toward the wanted one, then it moves. A re-route moves the target, never the orb.
  // ponytail: axis slide (x then y, a point test on the solid mask) plus a waypoint fallback: when the straight line to the target is
  // blocked, the orb heads for the farthest tile it can see on its own steepest descent of the exit field. Ceiling: no path smoothing,
  // so it can still snag in concave corners and cuts along tile centres. Beyond the leash the target is the player and there is no
  // waypoint (the exit field leads away from the player): the orb seeks the player and slides along walls, and past WISP_RESEED_PX
  // it is re-seeded. Upgrade: full path-following with funnel smoothing, and a field rooted at the player for the leash case.
  wispAt(s, w.d, TARGET)
  let tx = TARGET.x, ty = TARGET.y
  const leashed = Math.hypot(w.wx - s.player.x, w.wy - s.player.y) > WISP_LEAD_MAX_PX * WISP_LEASH
  if (leashed) { tx = s.player.x; ty = s.player.y } // too far: come back (still by velocity)
  else if (!clear(s, w.wx, w.wy, tx, ty) && waypoint(s, w.wx, w.wy)) { tx = WAY.x; ty = WAY.y } // a wall between orb and target: go round by the route
  // seek (entities/steer.ts) inlined, same numbers, so the tick allocates nothing: speed ramps down inside MAX / ARRIVE_K px of the target
  const dx = tx - w.wx, dy = ty - w.wy, len = Math.hypot(dx, dy), speed = Math.min(WISP_MAX_PX_S, len * WISP_ARRIVE_K)
  const dvx = len < 1e-6 ? 0 : dx / len * speed, dvy = len < 1e-6 ? 0 : dy / len * speed, k = 1 - Math.exp(-WISP_STEER_PER_S * dt)
  w.wvx += (dvx - w.wvx) * k
  w.wvy += (dvy - w.wvy) * k
  // Slide: a blocked axis keeps its position and its velocity (the blend keeps steering it). The orb never starts a tick inside a solid
  // tile (re-seeded above), so it never stays stuck.
  const nx = w.wx + w.wvx * dt, ny = w.wy + w.wvy * dt
  if (!isSolidPx(s, nx, w.wy)) w.wx = nx
  if (!isSolidPx(s, w.wx, ny)) w.wy = ny
}

// True when the straight segment between two world points crosses no solid tile (point samples at most half a tile apart).
function clear(s: State, ax: number, ay: number, bx: number, by: number): boolean {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) / (TILE / 2))
  for (let i = 1; i <= n; i++) if (isSolidPx(s, ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n)) return false
  return true
}

// Route waypoint for an orb that cannot see its target: walk the orb's own tile down the exit field (steepest neighbour, fixed E,S,W,N
// tie order, so deterministic and monotone: E strictly falls, no flip-flop) and stop at the last tile centre still in clear sight.
// Written to WAY; false when the orb's tile is off the field (inside a wall or a pending shadow): then the plain target stands.
// `field` is current here: stepWisp rebuilt it on the last rock-signature change, the same trigger that recomputes the route. No allocation.
function waypoint(s: State, x: number, y: number): boolean {
  const mw = s.world.w
  let cx = worldToTile(x), cy = worldToTile(y), found = false
  if (!inMap(s, cx, cy) || field.length !== mw * s.world.h || field[idx(s, cx, cy)] < 0) return false
  for (let step = 0; step < WISP_PATH_TILES; step++) {
    let best = field[idx(s, cx, cy)], bx = -1, by = -1
    for (let k = 0; k < 4; k++) {
      const nx = cx + N4[k][0], ny = cy + N4[k][1]
      if (inMap(s, nx, ny) && field[idx(s, nx, ny)] >= 0 && field[idx(s, nx, ny)] < best) { best = field[idx(s, nx, ny)]; bx = nx; by = ny }
    }
    if (bx < 0 || !clear(s, x, y, tileToWorld(bx), tileToWorld(by))) break
    WAY.x = tileToWorld(bx)
    WAY.y = tileToWorld(by)
    cx = bx
    cy = by
    found = true
  }
  return found
}

// Point `d` px along the route from the player (clamped to the route end), written to `out`. The first leg runs from the player's own
// position to the next tile centre: both lie in two adjacent tiles, so the polyline never leaves walkable floor.
export function wispAt(s: State, d: number, out: { x: number; y: number }): void {
  const path = s.wisp.path, mw = s.world.w
  let x = s.player.x, y = s.player.y
  if (path.length > 0 && idx(s, worldToTile(x), worldToTile(y)) !== path[0]) { // shadow case: start on the tile centre
    x = tileToWorld(path[0] % mw)
    y = tileToWorld(Math.floor(path[0] / mw))
  }
  let left = Math.max(0, d)
  for (let i = 1; i < path.length && left > 0; i++) {
    const nx = tileToWorld(path[i] % mw), ny = tileToWorld(Math.floor(path[i] / mw)), seg = Math.hypot(nx - x, ny - y)
    if (seg >= left) { // seg >= left > 0
      x += ((nx - x) * left) / seg
      y += ((ny - y) * left) / seg
      left = 0
      break
    }
    left -= seg
    x = nx
    y = ny
  }
  out.x = x
  out.y = y
}
