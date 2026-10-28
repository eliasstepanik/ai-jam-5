// Issue #113 F7 follow-up (chunk 38b): unit coverage for the windowed flow field itself and the
// getFlowField cache - the gap the chunk 38 retrospect found (ai-tactics-3.check.ts covers the
// steering integration, not these contracts). Spec: KB plan note ai-jam-5-issue-113-plan-3-steps-4-7,
// chunk 38 (F7) rules (1)-(4) and (7). Pure: hand-built grids for (1)-(3); a real cave fixture for
// (4)/(7). No RNG, no clocks (check-guard).
import type { State } from '../core/types.ts'
import { init, TILE } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { buildFlow, flowStep } from '../world/flowfield.ts'
import { getFlowField, getSolid, clearCaches } from '../world/caches.ts'
import { startRun } from '../systems/run.ts'
import { stepMonsters } from '../systems/monsters.ts'
import { spawnMonster } from '../entities/monster.ts'
import { lightRadius } from '../systems/light.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

// Hand-made solid grid (1 = solid), indexed ty * w + tx.
function grid(w: number, h: number, walls: readonly (readonly [number, number])[]): Uint8Array {
  const g = new Uint8Array(w * h)
  for (const [x, y] of walls) g[y * w + x] = 1
  return g
}

// Window-local index, the shared formula of buildFlow/flowStep (unclipped origin ptx - win).
const idx = (tx: number, ty: number, ptx: number, pty: number, win: number): number =>
  (ty - (pty - win)) * (2 * win + 1) + (tx - (ptx - win))

// Walk the downhill path from (tx,ty) until flowStep stops; returns the visited tile indices.
// Fails if any step enters a solid tile; the caller asserts the walk ends at the source.
function walkDown(dist: Int16Array, solid: Uint8Array, w: number, ptx: number, pty: number, win: number, tx: number, ty: number): number[] {
  const path = [ty * w + tx]
  let x = tx, y = ty
  for (let k = 0; k < 4 * w * w; k++) {
    const st = flowStep(dist, ptx, pty, win, x, y)
    if (st === null) break
    x += st[0]; y += st[1]
    ok(solid[y * w + x] !== 1, 'flowStep led into a solid tile (' + x + ',' + y + ')')
    path.push(y * w + x)
  }
  return path
}

// (1) L-wall: the only route from behind the wall to the source crosses the vertical leg below
// its lower end; every downhill step decreases dist and never enters a solid tile.
function lWallRouting(): void {
  const w = 12, h = 12, win = 11
  const walls: [number, number][] = []
  for (let y = 0; y <= 6; y++) walls.push([5, y]) // vertical leg
  for (let x = 6; x <= 9; x++) walls.push([x, 6]) // horizontal leg (corner (5,6) set above)
  const solid = grid(w, h, walls)
  const dist = new Int16Array((2 * win + 1) * (2 * win + 1))
  buildFlow(solid, w, h, 2, 2, win, dist)
  ok(dist[idx(8, 8, 2, 2, win)] > 0, 'tile behind the L-wall must be reachable')
  const path = walkDown(dist, solid, w, 2, 2, win, 8, 8)
  ok(path[path.length - 1] === 2 * w + 2, 'the downhill walk must end at the source tile')
  for (const i of path) {
    const x = i % w
    ok(x !== 5 || i / w >= 7, 'the route must cross x=5 below the wall leg (tile ' + x + ',' + i / w + ')')
  }
}

// (1) tie order: at (5,5) the W and N neighbours both have dist 1; the fixed N4 order E,S,W,N
// must pick W. Also: the source tile has no downhill step.
function tieOrder(): void {
  const w = 9, h = 9, win = 8
  const solid = grid(w, h, [])
  const dist = new Int16Array((2 * win + 1) * (2 * win + 1))
  buildFlow(solid, w, h, 4, 4, win, dist)
  const st = flowStep(dist, 4, 4, win, 5, 5)
  ok(st !== null && st[0] === -1 && st[1] === 0, 'tie between W and N must pick W (E,S,W,N order)')
  ok(flowStep(dist, 4, 4, win, 4, 4) === null, 'the source tile has no downhill step')
}

// (2) sealed pocket: unreachable tile keeps dist -1 and flowStep null.
function sealedPocket(): void {
  const w = 11, h = 11, win = 10
  const solid = grid(w, h, [[7, 8], [9, 8], [8, 7], [8, 9]])
  const dist = new Int16Array((2 * win + 1) * (2 * win + 1))
  buildFlow(solid, w, h, 1, 1, win, dist)
  ok(dist[idx(8, 8, 1, 1, win)] === -1, 'sealed pocket tile must be -1')
  ok(flowStep(dist, 1, 1, win, 8, 8) === null, 'flowStep from an unreachable tile must be null')
}

// (3) window clipping: dist length (2*win+1)^2 (tiles beyond the window have no slot at all),
// flowStep outside the window is null; off-map window cells inside the array stay -1.
function windowClipping(): void {
  const w = 21, h = 21, win = 3
  const solid = grid(w, h, [])
  const dist = new Int16Array((2 * win + 1) * (2 * win + 1))
  buildFlow(solid, w, h, 10, 10, win, dist)
  ok(dist.length === (2 * win + 1) * (2 * win + 1), 'dist length is (2*win+1)^2')
  ok(dist[idx(10, 13, 10, 10, win)] === 3, 'tile at the window edge is filled')
  ok(flowStep(dist, 10, 10, win, 10, 14) === null, 'flowStep outside the window must be null')
  buildFlow(solid, w, h, 1, 1, win, dist)
  ok(dist[idx(0, 0, 1, 1, win)] === 2, 'in-map corner next to the source is reached')
  ok(dist[idx(-2, -2, 1, 1, win)] === -1, 'off-map window cells stay -1')
}

// (3) window bounds are exact: a tile inside the window that is reachable only by a path leaving
// the window must stay -1. Window (win 2, source (7,7)) is x5..9, y5..9; (5,9) has walls on its
// in-window neighbours (5,8) and (6,9) and is open only toward (4,9)/(5,10), outside the window.
// A bound loosened by one tile makes the BFS step to (10,8): its window-local index wraps onto
// the next row's first cell, which is exactly (5,9). On a map clipped at the right/bottom edge
// the same loosening reaches off-map window cells, which must stay -1 too.
function windowBounds(): void {
  const win = 2, side = 2 * win + 1
  const dist = new Int16Array(side * side)
  buildFlow(grid(15, 15, [[5, 8], [6, 9]]), 15, 15, 7, 7, win, dist)
  ok(dist[idx(9, 8, 7, 7, win)] === 3, 'fixture: the window-edge tile (9,8) is reached')
  ok(dist[idx(5, 9, 7, 7, win)] === -1, 'in-window tile reachable only outside the window must be -1')
  ok(flowStep(dist, 7, 7, win, 5, 9) === null, 'flowStep from it must be null')
  buildFlow(grid(9, 9, []), 9, 9, 7, 7, win, dist)
  ok(dist[idx(9, 7, 7, 7, win)] === -1, 'off-map window cell right of the map must stay -1')
  ok(dist[idx(7, 9, 7, 7, win)] === -1, 'off-map window cell below the map must stay -1')
  ok(dist[idx(8, 8, 7, 7, win)] === 2, 'in-map corner tile is reached')
}

// (1) flowStep at the source: a wall next to the source tile has dist -1, which equals the
// source's d - 1; the source must still have no downhill step (d <= 0, not d < 0).
function sourceWall(): void {
  const w = 5, h = 5, win = 4
  const dist = new Int16Array((2 * win + 1) * (2 * win + 1))
  buildFlow(grid(w, h, [[3, 2]]), w, h, 2, 2, win, dist)
  ok(dist[idx(3, 2, 2, 2, win)] === -1, 'fixture: the wall next to the source has dist -1')
  ok(flowStep(dist, 2, 2, win, 2, 2) === null, 'the source tile has no step even with a wall beside it')
}

// cave seed 1 fixture (plan part 3 setup), caches cold for deterministic identity checks.
function caveFixture(): State {
  clearCaches()
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  return s
}

// (4) getFlowField cache: identity on the same key, rebuild on player-tile or solidSig change,
// the ping-pong guarantee for a held field, null on a solid player tile, and clearCaches drop.
function cacheIdentity(): void {
  const s = caveFixture()
  const win = T.ai.flowWindow, side = 2 * win + 1
  const f1 = getFlowField(s)
  if (f1 === null) throw new Error('check failed: flow field at the spawn tile must not be null')
  ok(getFlowField(s) === f1, 'same key must return the same object')
  ok(f1.dist.length === side * side, 'dist length is (2*win+1)^2')
  ok(f1.dist[win * side + win] === 0, 'the window centre is the source')
  const px0 = s.player.x, py0 = s.player.y
  const ptx = Math.floor(px0 / TILE), pty = Math.floor(py0 / TILE)
  const solid = getSolid(s), w = s.world.w
  let ntx = -1, nty = -1
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    if (solid[(pty + dy) * w + ptx + dx] === 0) { ntx = ptx + dx; nty = pty + dy; break }
  }
  ok(ntx >= 0, 'fixture: the player tile needs a free neighbour')
  s.player.x = ntx * TILE + TILE / 2
  s.player.y = nty * TILE + TILE / 2
  const f3 = getFlowField(s)
  if (f3 === null) throw new Error('check failed: flow field at the neighbour tile must not be null')
  ok(f3 !== f1, 'a player-tile change must rebuild the field')
  ok(f3.dist !== f1.dist, 'the rebuilt field uses the other ping-pong buffer')
  ok(f1.dist[win * side + win] === 0, 'a held field survives one rebuild intact (ping-pong guarantee)')
  s.world.solidSig += 1
  const f4 = getFlowField(s)
  ok(f4 !== null && f4 !== f3, 'a solidSig change must rebuild the field')
  s.player.x = px0
  s.player.y = py0
  let stx = -1, sty = -1
  for (let i = 0; i < solid.length; i++) if (solid[i] === 1) { stx = i % w; sty = (i - (i % w)) / w; break }
  ok(stx >= 0, 'fixture: the cave has a solid tile')
  s.player.x = stx * TILE + TILE / 2
  s.player.y = sty * TILE + TILE / 2
  ok(getFlowField(s) === null, 'a solid player tile returns null')
  ok(getFlowField(s) === null, 'the null result is cached under the same key')
  s.player.x = px0
  s.player.y = py0
  const f5 = getFlowField(s)
  ok(f5 !== null, 'flow field after restoring the player must not be null')
  clearCaches()
  ok(getFlowField(s) !== f5, 'clearCaches must drop the flow entry')
}

// (7) UNCOVERED / vacuous: the identity assert below does NOT test that the flow build is lazy.
// getFlowField keys on runId, tiles, solidSig, player tile and win only; with the stationary
// player of this fixture no code path in stepMonsters can change that key, so the warm entry is
// returned whether or not the F6 flow gate in monsters.ts opens (chunk 38b retrospect proved it:
// forcing the gate open still passes). Real coverage needs a DEV build/call counter in caches.ts,
// a production edit that was not approved in chunk 38c. Until then rule (7) is marked uncovered;
// this assert only guards against an accidental key change during stepMonsters.
function lazyFlowBuild(): void {
  const s = caveFixture()
  s.meta.phase = 'descent'
  s.debug.god = true
  s.director.spawnT = 1e9
  const m = spawnMonster(s, 'lurker', s.player.x + 96, s.player.y, lightRadius(s))
  const f0 = getFlowField(s)
  if (f0 === null) throw new Error('check failed: flow field at the spawn tile must not be null')
  for (let k = 0; k < 300; k++) {
    m.stuckT = 0 // pin: no monster is stuck, so the F6 flow gate in monsters.ts never opens
    stepMonsters(s, DT)
  }
  ok(getFlowField(s) === f0, 'the flow cache key is unchanged over 300 steps (vacuous for rule 7, see above)')
}

export function run(): void {
  lWallRouting()
  tieOrder()
  sealedPocket()
  windowClipping()
  windowBounds()
  sourceWall()
  cacheIdentity()
  lazyFlowBuild()
}
