// #81 escape guide wisp: off outside the escape, the cached route runs from the player's tile down the exit field to the exit, every
// point of the wisp polyline is walkable floor, a landed or pending rock re-routes it, the lead follows the player's speed, it only
// writes s.wisp, and two identical runs agree. Real caves (seeds 7, 42, 1234) plus a small ring corridor. L0-L3 imports only; DOM-free.
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { fnv1a } from '../core/rng.ts'
import { T } from '../core/tuning.ts'
import { clearCaches, getExitDist, getSolid } from '../world/caches.ts'
import { idx, tileToWorld, worldToTile } from '../world/grid.ts'
import type { Input } from '../main.ts'
import { lightBeacon } from '../systems/beacon.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { stepWisp, wispAt, WISP_LEAD_MAX_PX, WISP_LEAD_MIN_PX } from '../systems/escape-wisp.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60
const ok = (cond: boolean, msg: string): void => { if (!cond) throw new Error('check failed: escape-wisp: ' + msg) }

// Real cave at the Beacon (the entrance is also the exit tile), escape phase, nothing else running (stepWisp is called directly).
function cave(seed: string): State {
  const s = init()
  startRun(s, seed, caveOf(parseSeed(seed)))
  s.meta.phase = 'escape'
  s.player.x = tileToWorld(s.world.beacon.tx)
  s.player.y = tileToWorld(s.world.beacon.ty)
  clearCaches()
  return s
}

let gridRuns = 0
// '#' wall, 'X' exit, 'P' player (tile centre), everything else floor. Escape phase.
function grid(rows: string[]): State {
  const s = init(), w = rows[0].length, raw = rows.join(''), x = raw.indexOf('X'), p = raw.indexOf('P')
  Object.assign(s.world, { w, h: rows.length, tiles: raw.replace('X', '.').replace('P', '.'),
    entrance: { tx: p % w, ty: Math.floor(p / w) }, exit: { tx: x % w, ty: Math.floor(x / w) } })
  s.world.tilesHash = fnv1a(s.world.tiles)
  s.meta.runId = ++gridRuns // the wisp's field cache keys on runId + rock signatures: every grid is its own run
  s.meta.phase = 'escape'
  s.player.x = tileToWorld(p % w)
  s.player.y = tileToWorld(Math.floor(p / w))
  clearCaches()
  return s
}

const at = (s: State, x: number, y: number): number => y * s.world.w + x
const tileOf = (s: State, p: { x: number; y: number }): number => idx(s, worldToTile(p.x), worldToTile(p.y))

function rock(s: State, i: number, landed: boolean): void {
  s.rocks.push({ id: s.meta.nextId++, x: tileToWorld(i % s.world.w), y: tileToWorld(Math.floor(i / s.world.w)),
    size: 1, tiles: [i], t: 0, landed, hit: false, shrunk: false })
  if (landed) s.world.solidSig++
  else s.world.pendingSig++
}

// Every sampled point of the wisp line (player .. end of the route) sits on a floor tile.
function onFloor(s: State, msg: string): void {
  const solid = getSolid(s), p = { x: 0, y: 0 }
  for (let d = 0; d <= 400; d += 4) {
    wispAt(s, d, p)
    ok(solid[tileOf(s, p)] === 0, msg + ': point at ' + d + ' px is inside a wall or rock')
  }
}

function inactive(): void {
  const s = cave('7')
  s.meta.phase = 'descent'
  stepWisp(s, DT)
  ok(!s.wisp.on && s.wisp.path.length === 0, 'inactive in the descent phase')
  s.meta.phase = 'escape'
  stepWisp(s, DT)
  ok(s.wisp.on && s.wisp.path.length > 1, 'active in the escape phase')
  s.meta.phase = 'descent'
  stepWisp(s, DT)
  ok(!s.wisp.on && s.wisp.path.length === 0, 'switched off again when the phase leaves escape')
}

function leadsToExit(): void {
  for (const seed of ['7', '42', '1234']) {
    const s = cave(seed), exit = at(s, s.world.exit.tx, s.world.exit.ty), mw = s.world.w
    let hops = 0
    for (; hops < 400; hops++) {
      stepWisp(s, DT)
      const E = getExitDist(s), p = s.wisp.path
      ok(p.length > 1 || E[p[0]] === 0, seed + ': route exists at hop ' + hops)
      ok(p[0] === tileOf(s, { x: s.player.x, y: s.player.y }), seed + ': route starts on the player tile')
      for (let i = 1; i < p.length; i++) {
        ok(Math.abs((p[i] % mw) - (p[i - 1] % mw)) + Math.abs(Math.floor(p[i] / mw) - Math.floor(p[i - 1] / mw)) === 1, seed + ': 4-connected step')
        ok(E[p[i]] === E[p[i - 1]] - 1, seed + ': distance to the exit shrinks by one per tile')
      }
      onFloor(s, seed + ' hop ' + hops)
      if (p[p.length - 1] === exit) break
      s.player.x = tileToWorld(p[p.length - 1] % mw) // walk to the end of the cached route, then ask again
      s.player.y = tileToWorld(Math.floor(p[p.length - 1] / mw))
    }
    ok(hops < 400, seed + ': the route reaches the exit tile (' + hops + ' hops)')
  }
}

function reroutes(): void {
  const rows = ['#########', '#X.....P#', '#.#####.#', '#.......#', '#########']
  const s = grid(rows)
  stepWisp(s, DT)
  ok(s.wisp.path[1] === at(s, 6, 1), 'short upper corridor first')
  const sig = s.wisp.ss
  rock(s, at(s, 4, 1), true)
  stepWisp(s, DT)
  ok(s.wisp.ss !== sig && s.wisp.path[1] === at(s, 7, 2) && !s.wisp.path.includes(at(s, 4, 1)), 'landed rock re-routes through the lower corridor')
  onFloor(s, 'after landed rock')
  const t = grid(rows)
  stepWisp(t, DT)
  rock(t, at(t, 4, 1), false)
  stepWisp(t, DT)
  ok(t.wisp.path[1] === at(t, 7, 2), 'pending rock shadow re-routes too')
  rock(t, at(t, 4, 3), true)
  stepWisp(t, DT)
  ok(t.wisp.path.length === 0 || t.wisp.path[t.wisp.path.length - 1] !== at(t, 1, 1) || getExitDist(t)[t.wisp.path[0]] < 0, 'sealed route never leads through a rock')
  for (const i of t.wisp.path) ok(getSolid(t)[i] === 0, 'no path tile is solid after the seal')
}

function lead(): void {
  const s = cave('42')
  for (let k = 0; k < 600; k++) stepWisp(s, DT)
  ok(Math.abs(s.wisp.d - WISP_LEAD_MIN_PX) < 1, 'standing still: lead ' + WISP_LEAD_MIN_PX + ' px (got ' + s.wisp.d + ')')
  s.player.vx = T.player.walkPxS * T.escape.sprintMul
  for (let k = 0; k < 600; k++) stepWisp(s, DT)
  ok(Math.abs(s.wisp.d - WISP_LEAD_MAX_PX) < 1, 'sprinting: lead ' + WISP_LEAD_MAX_PX + ' px (got ' + s.wisp.d + ')')
  const p = { x: 0, y: 0 }
  wispAt(s, 0, p)
  ok(p.x === s.player.x && p.y === s.player.y, 'lead 0 is the player position')
}

function pure(): void {
  const s = cave('1234'), before = JSON.stringify({ ...s, wisp: 0 })
  for (let k = 0; k < 120; k++) stepWisp(s, DT)
  ok(JSON.stringify({ ...s, wisp: 0 }) === before, 'stepWisp writes only s.wisp')
  const a = cave('1234'), b = cave('1234')
  for (let k = 0; k < 120; k++) { stepWisp(a, DT); stepWisp(b, DT) }
  ok(JSON.stringify(a.wisp) === JSON.stringify(b.wisp), 'two identical runs give the same wisp')
}

// Public driver: the real step() must run the wisp (the stepWisp call in step.ts is the only wiring).
function viaStep(): void {
  const s = init(), inp: Input = { keys: new Set(), pressed: new Set(), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 } }
  startRun(s, '42', caveOf(parseSeed('42')))
  s.settings.loaded = true
  s.director.spawnT = 1e9
  s.monsters = []
  s.player.x = tileToWorld(s.world.beacon.tx) // a run starts on the exit tile and would be won at once: stand at the Beacon
  s.player.y = tileToWorld(s.world.beacon.ty)
  lightBeacon(s)
  clearCaches()
  ok(s.meta.phase === 'escape', 'lightBeacon starts the escape')
  ok(!s.wisp.on && s.wisp.path.length === 0, 'wisp is off before the first step')
  step(s, inp, DT)
  ok(s.wisp.on && s.wisp.path.length >= 2, 'step() turns the wisp on with a route in the escape phase')
  ok(s.wisp.path[0] === tileOf(s, s.player), 'step(): the route starts on the player tile')
  onFloor(s, 'step()')
}

// Second escape on the same tile and rock state must rebuild the route from scratch (cached p0/ss/ps and the lead are reset).
function restart(): void {
  const s = cave('42')
  s.player.vx = T.player.walkPxS * T.escape.sprintMul
  for (let k = 0; k < 600; k++) stepWisp(s, DT)
  ok(s.wisp.d > WISP_LEAD_MAX_PX - 1, 'first escape: lead grew to the sprint lead')
  s.meta.phase = 'descent'
  stepWisp(s, DT)
  ok(!s.wisp.on && s.wisp.path.length === 0, 'off after the first escape')
  s.meta.phase = 'escape'
  s.player.vx = 0
  stepWisp(s, DT)
  ok(s.wisp.on && s.wisp.path.length >= 2, 'second escape: wisp on with a route of >= 2 tiles')
  ok(s.wisp.path[0] === tileOf(s, s.player), 'second escape: the route starts on the player tile')
  ok(s.wisp.d < 10, 'second escape: the lead starts again at the player (got ' + s.wisp.d + ' px)')
}

const ROOM = ['#########', '#X......#', '#.......#', '#.......#', '#.......#', '#########']
const sh = (s: State, tx: number, ty: number, dx: number, dy: number): void => { // player tile (tx,ty) shifted by (dx,dy) px
  s.player.x = tileToWorld(tx) + dx
  s.player.y = tileToWorld(ty) + dy
}
function pathOk(s: State, msg: string): void {
  const p = s.wisp.path, mw = s.world.w, solid = getSolid(s)
  ok(p.length >= 2, msg + ': route has >= 2 tiles (got ' + p.length + ')')
  for (let i = 0; i < p.length; i++) {
    ok(solid[p[i]] === 0, msg + ': route tile ' + i + ' is walkable')
    if (i > 0) ok(Math.abs((p[i] % mw) - (p[i - 1] % mw)) + Math.abs(Math.floor(p[i] / mw) - Math.floor(p[i - 1] / mw)) === 1, msg + ': 4-connected')
  }
  onFloor(s, msg)
}

// Player standing in a pending rock shadow: the start falls back to the lowest-distance floor tile the player circle overlaps.
function shadowStart(): void {
  const s = grid(ROOM) // exit (1,1); pending rock on (5,2), player straddles (4,2) | (5,2)
  rock(s, at(s, 5, 2), false)
  sh(s, 5, 2, -12, 0)
  stepWisp(s, DT)
  ok(s.wisp.path[0] === at(s, 4, 2), 'shadow: the route starts on the overlapped free neighbour (4,2), got ' + s.wisp.path[0])
  pathOk(s, 'shadow')
  const p = { x: 0, y: 0 }
  wispAt(s, 0, p)
  ok(p.x === tileToWorld(4) && p.y === tileToWorld(2), 'shadow: the wisp line starts on the centre of the start tile')
  const t = grid(ROOM) // corner of the pending tile: overlaps (4,1) E=3, (5,1) E=4, (4,2) E=4 -> lowest distance wins
  rock(t, at(t, 5, 2), false)
  sh(t, 5, 2, -12, -12)
  stepWisp(t, DT)
  ok(t.wisp.path[0] === at(t, 4, 1), 'shadow corner: the lowest-distance overlapped tile (4,1) starts the route, got ' + t.wisp.path[0])
  pathOk(t, 'shadow corner')
  const u = grid(ROOM) // centred in the shadow: nothing else overlapped, no route, wisp draws nothing and does not throw
  rock(u, at(u, 5, 2), false)
  sh(u, 5, 2, 0, 0)
  stepWisp(u, DT)
  ok(u.wisp.on && u.wisp.path.length === 0, 'shadow centred: no route')
  wispAt(u, 100, p)
  ok(p.x === u.player.x && p.y === u.player.y, 'shadow centred: the wisp stays on the player')
  const x = grid(ROOM) // exit buried under a pending rock: the exit field is empty, no route
  rock(x, at(x, 1, 1), false)
  sh(x, 3, 3, 0, 0)
  stepWisp(x, DT)
  ok(x.wisp.on && x.wisp.path.length === 0, 'blocked exit: no route')
  const v = grid(ROOM) // free tile under the player wins over a closer overlapped neighbour
  sh(v, 5, 2, -12, 0)
  stepWisp(v, DT)
  ok(v.wisp.path[0] === at(v, 5, 2), 'straddling free floor: the route starts on the tile under the player, got ' + v.wisp.path[0])
}

// wispAt against an independent walk: player position (or start-tile centre in the shadow case), then the tile centres.
function sampler(): void {
  const s = grid(['#####', '#X..#', '###.#', '###P#', '#####']) // corner at (3,1)
  for (const [dx, dy] of [[0, 0], [5, 3], [-6, 0]]) {
    sh(s, 3, 3, dx, dy)
    s.wisp.p0 = -1
    stepWisp(s, DT)
    const path = s.wisp.path, mw = s.world.w
    ok(path.length === 5 && path[0] === at(s, 3, 3) && path[2] === at(s, 3, 1) && path[4] === at(s, 1, 1), 'sampler: route (3,3) (3,2) (3,1) (2,1) (1,1)')
    const pts = [{ x: s.player.x, y: s.player.y }]
    for (let i = 1; i < path.length; i++) pts.push({ x: tileToWorld(path[i] % mw), y: tileToWorld(Math.floor(path[i] / mw)) })
    const p = { x: 0, y: 0 }
    for (let d = 0; d <= 160; d += 3) {
      let left = d, want = pts[pts.length - 1]
      for (let i = 1; i < pts.length; i++) {
        const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
        if (left <= len) { want = { x: pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * left) / len, y: pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * left) / len }; break }
        left -= len
      }
      wispAt(s, d, p)
      ok(Math.hypot(p.x - want.x, p.y - want.y) < 1e-6, 'sampler: point at ' + d + ' px (offset ' + dx + ',' + dy + ') is (' + p.x + ',' + p.y + '), want (' + want.x + ',' + want.y + ')')
    }
    wispAt(s, 1e6, p)
    ok(p.x === tileToWorld(1) && p.y === tileToWorld(1), 'sampler: past the route end the wisp rests on the last tile centre')
  }
}

export function run(): void {
  inactive()
  viaStep()
  restart()
  leadsToExit()
  reroutes()
  shadowStart()
  sampler()
  lead()
  pure()
}
