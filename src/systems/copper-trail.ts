// L3 systems: copper flame trail (playtest tuning 1 §1.1). While a lit copper flame is carried in the descent, a faint string of sparks
// points along the shortest walkable route to the Beacon. Cosmetic: it only reads the world and writes s.trail, no RNG draws, no clock.
// Render is in render/copper-trail.ts. The route is the steepest descent on a Beacon-rooted distance field (walls only).
import type { State } from '../core/types.ts'
import { bfs4 } from '../world/bfs.ts'
import { getSolid } from '../world/caches.ts'
import { idx, inMap, tileToWorld, worldToTile } from '../world/grid.ts'
import { downhill, playerSources } from '../world/route.ts'
import { beaconTile } from '../world/beacon-position.ts'

export const TRAIL_TILES = 12 // route length in tiles: 11 steps = 352 px
export const TRAIL_MOTES = 6 // sparks on the line at once
export const TRAIL_PERIOD_S = 2.4 // one spark's trip from start to end of the line
export const TRAIL_START_PX = 24 // first point of the line, px along the route from the player
export const TRAIL_LEN_PX = 300 // length of the line
export const TRAIL_ALPHA = 0.22
export const TRAIL_R_PX = 2

// Own Beacon-rooted field: no such field exists in world/caches.ts (getDepthField is entrance-rooted).
// ponytail: module-level rebuildable cache (like escape-wisp.ts), rebuilt only when the key changes (about once per run in the descent;
// no rocks before the escape); the key covers run, tiles, size, Beacon tile and rock signature. Upgrade: a Beacon field in world/caches.ts.
let field = new Int32Array(0), trailKey = '', rebuilt = false
function beaconField(s: State): Int32Array {
  const wd = s.world, n = wd.w * wd.h, b = beaconTile(s)
  const key = s.meta.runId + ':' + wd.tilesHash + ':' + wd.w + 'x' + wd.h + ':' + b.tx + ',' + b.ty + ':' + wd.solidSig
  if (key === trailKey && field.length === n) return field
  if (field.length !== n) field = new Int32Array(n)
  const solid = getSolid(s), e = inMap(s, b.tx, b.ty) ? idx(s, b.tx, b.ty) : -1
  if (e < 0 || solid[e]) field.fill(-1)
  else bfs4(solid, wd.w, wd.h, e, field)
  trailKey = key
  rebuilt = true
  return field
}

// Route start: the tile under the player when it is on the field, else the lowest-distance tile the player circle overlaps, else -1.
function startTile(s: State, E: Int32Array): number {
  const tx = worldToTile(s.player.x), ty = worldToTile(s.player.y)
  if (inMap(s, tx, ty) && E[idx(s, tx, ty)] >= 0) return idx(s, tx, ty)
  let best = -1
  for (const i of playerSources(s, [])) if (E[i] >= 0 && (best < 0 || E[i] < E[best])) best = i
  return best
}

export function stepCopperTrail(s: State, dt: number): void {
  const tr = s.trail
  // stepFlame keeps activeMineral at energy <= 0, so the energy test is needed; the escape clears the trail (minerals are inert there)
  if (!(s.meta.phase === 'descent' && s.player.activeMineral === 'copper' && s.player.energy > 0)) {
    if (tr.on || tr.path.length > 0) { tr.on = false; tr.path = []; tr.p0 = -1 }
    return
  }
  tr.on = true
  tr.t += dt
  rebuilt = false
  const E = beaconField(s)
  const here = idx(s, worldToTile(s.player.x), worldToTile(s.player.y))
  // ponytail: recompute only when the player's tile changes (or the field was rebuilt); a 12-tile walk. Upgrade: reuse the path tail.
  if (here !== tr.p0 || rebuilt) {
    tr.p0 = here
    const start = startTile(s, E)
    tr.path = start < 0 ? [] : downhill(s, E, start, TRAIL_TILES)
  }
}

// Point `d` px along the route from the player (clamped to the route end), written to `out`. Same walk as escape-wisp.ts wispAt, on
// s.trail.path: the first leg runs from the player's own position to the next tile centre.
export function trailAt(s: State, d: number, out: { x: number; y: number }): void {
  const path = s.trail.path, mw = s.world.w
  let x = s.player.x, y = s.player.y
  if (path.length > 0 && idx(s, worldToTile(x), worldToTile(y)) !== path[0]) { // start tile is not under the player: begin on its centre
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
