// #81 escape wisp glide: the guide wisp is a steered orb (own velocity) that eases toward the route point at the eased lead. Checks that
// the orb never jumps (position and velocity stay continuous across route recomputes and re-routes), starts on the player, settles on
// the route sample, is leashed to the player, and copes with an empty route. Pure sim, deterministic, DOM-free; stepWisp is called directly.
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { fnv1a } from '../core/rng.ts'
import { T } from '../core/tuning.ts'
import { clearCaches } from '../world/caches.ts'
import { isSolidPx, tileToWorld } from '../world/grid.ts'
import { stepWisp, wispAt, WISP_LEAD_MAX_PX, WISP_LEASH, WISP_MAX_PX_S, WISP_STEER_PER_S } from '../systems/escape-wisp.ts'

const DT = 1 / 60
const SPRINT = T.player.walkPxS * T.escape.sprintMul
const LEASH = WISP_LEAD_MAX_PX * WISP_LEASH
const STEP = WISP_MAX_PX_S * DT + 1e-6
const K = 1 - Math.exp(-WISP_STEER_PER_S * DT)
const ok = (cond: boolean, msg: string): void => { if (!cond) throw new Error('check failed: escape-wisp-glide: ' + msg) }

let runs = 5000
// '#' wall, 'X' exit, 'P' player (tile centre), everything else floor. Escape phase, standing.
function grid(rows: string[]): State {
  const s = init(), w = rows[0].length, raw = rows.join(''), x = raw.indexOf('X'), p = raw.indexOf('P')
  Object.assign(s.world, { w, h: rows.length, tiles: raw.replace('X', '.').replace('P', '.'),
    entrance: { tx: p % w, ty: Math.floor(p / w) }, exit: { tx: x % w, ty: Math.floor(x / w) } })
  s.world.tilesHash = fnv1a(s.world.tiles)
  s.meta.runId = ++runs
  s.meta.phase = 'escape'
  s.player.x = tileToWorld(p % w)
  s.player.y = tileToWorld(Math.floor(p / w))
  clearCaches()
  return s
}

// Long S-bend: player (1,3) runs right along row 3, up the gap at (40,2), left along row 1 to the exit (1,1): 80 route tiles, one corner pair.
const BEND = ['#'.repeat(42), '#X' + '.'.repeat(39) + '#', '#'.repeat(40) + '.#', '#P' + '.'.repeat(39) + '#', '#'.repeat(42)]
const RING = ['#########', '#X.....P#', '#.#####.#', '#.......#', '#########']
const ROOM = ['#########', '#X......#', '#.......#', '#.......#', '#.......#', '#########']

// One tick with the per-tick continuity asserts (position step <= max speed * dt, velocity change <= what the blend allows).
// Returns true when the route was recomputed this tick (player tile or a rock signature changed).
function tick(s: State, msg: string): boolean {
  const w = s.wisp, ox = w.wx, oy = w.wy, ovx = w.wvx, ovy = w.wvy, p0 = w.p0, ss = w.ss, ps = w.ps, wasIn = isSolidPx(s, ox, oy)
  stepWisp(s, DT)
  ok(Math.hypot(w.wx - ox, w.wy - oy) <= STEP, msg + ': orb moved ' + Math.hypot(w.wx - ox, w.wy - oy) + ' px in one tick (max ' + STEP + ')')
  const dv = Math.hypot(w.wvx - ovx, w.wvy - ovy), bound = K * (WISP_MAX_PX_S + Math.hypot(ovx, ovy)) + 1e-6
  ok(dv <= bound, msg + ': velocity snapped by ' + dv + ' px/s (blend allows ' + bound + ')')
  ok(wasIn || !isSolidPx(s, w.wx, w.wy), msg + ': orb moved into a wall tile at (' + w.wx + ',' + w.wy + ')') // a fixture may place the orb outside the map on purpose
  return w.p0 !== p0 || w.ss !== ss || w.ps !== ps
}

function settled(s: State, msg: string): void { // standing still for 4 s: the orb rests on the route point at the eased lead
  s.player.vx = 0
  s.player.vy = 0
  for (let k = 0; k < 240; k++) tick(s, msg)
  const p = { x: 0, y: 0 }
  wispAt(s, s.wisp.d, p)
  ok(Math.hypot(s.wisp.wx - p.x, s.wisp.wy - p.y) < 8, msg + ': orb ' + Math.hypot(s.wisp.wx - p.x, s.wisp.wy - p.y) + ' px from the route sample after settling')
  ok(Math.hypot(s.wisp.wvx, s.wisp.wvy) < 1, msg + ': orb still moving after settling')
}

// Mixed standing / sprinting along a real route: 1000 ticks, the player walks the route at sprint speed, rock signatures tick over too.
function glide(): void {
  const s = grid(BEND), w = s.wisp, mw = s.world.w
  stepWisp(s, DT)
  let reroutes = 0, travel = 0, far = 0
  for (let k = 0; k < 1000; k++) {
    const sprint = k % 120 >= 60
    s.player.vx = sprint ? SPRINT : 0
    if (sprint && w.path.length > 1) { // walk to the next route tile centre at sprint speed
      const nx = tileToWorld(w.path[1] % mw), ny = tileToWorld(Math.floor(w.path[1] / mw)), dx = nx - s.player.x, dy = ny - s.player.y, len = Math.hypot(dx, dy)
      const f = len > SPRINT * DT ? (SPRINT * DT) / len : 1
      s.player.x += dx * f
      s.player.y += dy * f
    }
    if (k % 90 === 89) s.world.pendingSig++ // a rock signature change recomputes the route without moving the player
    const ox = w.wx, oy = w.wy
    if (tick(s, 'glide tick ' + k)) reroutes++
    travel += Math.hypot(w.wx - ox, w.wy - oy)
    far = Math.max(far, Math.hypot(w.wx - s.player.x, w.wy - s.player.y))
  }
  ok(reroutes >= 20, 'glide: the route was recomputed ' + reroutes + ' times (want >= 20)')
  ok(travel > 1000, 'glide: the orb travelled only ' + travel + ' px, it did not follow the player')
  ok(far <= LEASH + 8, 'glide: the orb got ' + far + ' px from the player (leash ' + LEASH + ')')
  settled(s, 'glide settle')
}

// A landed rock flips the route to the other corridor: the target jumps, the orb must not.
function reroute(): void {
  const s = grid(RING), w = s.wisp, p = { x: 0, y: 0 }
  stepWisp(s, DT) // activation tick (the orb starts at the player)
  settled(s, 'ring settle')
  wispAt(s, w.d, p)
  const bx = p.x, by = p.y
  s.rocks.push({ id: s.meta.nextId++, x: tileToWorld(4), y: tileToWorld(1), size: 1, tiles: [1 * s.world.w + 4], t: 0, landed: true, hit: false, shrunk: false })
  s.world.solidSig++
  ok(tick(s, 'ring reroute'), 'ring: the landed rock recomputes the route')
  wispAt(s, w.d, p)
  ok(Math.hypot(p.x - bx, p.y - by) > 40, 'ring: the target jumped only ' + Math.hypot(p.x - bx, p.y - by) + ' px, the fixture is not a re-route')
  for (let k = 0; k < 120; k++) tick(s, 'ring after reroute ' + k)
  settled(s, 'ring settle after reroute')
}

// First step of an escape starts the orb at the player at rest, again on the next escape.
function activation(): void {
  const s = grid(BEND), w = s.wisp
  s.player.x += 7
  s.player.y -= 5
  ok(!w.on, 'activation: wisp starts off')
  stepWisp(s, DT)
  ok(Math.hypot(w.wx - s.player.x, w.wy - s.player.y) < 0.1 && Math.hypot(w.wvx, w.wvy) < 5, 'activation: orb at (' + w.wx + ',' + w.wy + ') v ' + Math.hypot(w.wvx, w.wvy) + ', player (' + s.player.x + ',' + s.player.y + ')')
  s.player.vx = SPRINT
  for (let k = 0; k < 120; k++) tick(s, 'activation run')
  ok(Math.hypot(w.wvx, w.wvy) > 10, 'activation: the orb moves once the lead grows')
  s.meta.phase = 'descent'
  stepWisp(s, DT)
  s.meta.phase = 'escape'
  s.player.x = tileToWorld(30)
  s.player.y = tileToWorld(1)
  s.player.vx = 0
  stepWisp(s, DT)
  ok(Math.hypot(w.wx - s.player.x, w.wy - s.player.y) < 0.1 && Math.hypot(w.wvx, w.wvy) < 5, 'second escape: orb at (' + w.wx + ',' + w.wy + ') v ' + Math.hypot(w.wvx, w.wvy) + ', player (' + s.player.x + ',' + s.player.y + ')')
}

// Orb dragged far away (beyond the leash) from the player at a full sprint lead: it returns toward the PLAYER, not toward the route point.
function leash(): void {
  const s = grid(BEND), w = s.wisp
  s.player.vx = SPRINT
  for (let k = 0; k < 240; k++) stepWisp(s, DT) // standing in place with sprint speed: the lead grows to the maximum
  ok(w.d > WISP_LEAD_MAX_PX - 1, 'leash: lead at the maximum (got ' + w.d + ')')
  w.wx = s.player.x // 400 px above the player: the route runs along the corridor, the player is straight below
  w.wy = s.player.y - 400
  w.wvx = 0
  w.wvy = 0
  stepWisp(s, DT)
  ok(Math.abs(w.wvx) < 1e-9 && w.wvy > 0, 'leash: beyond the leash the orb is pulled to the player (wvx ' + w.wvx + ', wvy ' + w.wvy + ')')
  for (let k = 0; k < 240; k++) tick(s, 'leash')
  ok(Math.hypot(w.wx - s.player.x, w.wy - s.player.y) <= LEASH, 'leash: back within the leash after 4 s')
}

// Leash boundary from both sides. Open hall, route runs right along the player's row; the orb sits straight above the player, so a pull
// toward the route target has vx > 0 and a pull toward the player has vx = 0. A leash multiplier that drifts either way flips a case.
function leashEdge(): void {
  const rows = Array.from({ length: 14 }, (_, r) => '#' + (r === 0 || r === 13 ? '#'.repeat(30) : r === 12 ? 'P' + '.'.repeat(28) + 'X' : '.'.repeat(30)) + '#')
  // Edges: 0.97/1.03 x the live leash (tracks the constant), and fixed 1.4/1.6 x WISP_LEAD_MAX_PX anchors that pin the design value (~1.5).
  for (const [dist, toRoute] of [[0.97 * LEASH, true], [1.03 * LEASH, false], [1.4 * WISP_LEAD_MAX_PX, true], [1.6 * WISP_LEAD_MAX_PX, false]] as const) {
    const s = grid(rows), w = s.wisp, f = dist / LEASH
    stepWisp(s, DT)
    w.d = WISP_LEAD_MAX_PX
    w.wx = s.player.x
    w.wy = s.player.y - dist
    w.wvx = 0
    w.wvy = 0
    ok(!isSolidPx(s, w.wx, w.wy), 'leash edge: fixture orb sits in a wall')
    stepWisp(s, DT)
    ok(toRoute ? w.wvx > 1e-3 : Math.abs(w.wvx) < 1e-9 && w.wvy > 0, 'leash edge ' + f + ' x leash: orb pulled to the ' + (toRoute ? 'route target' : 'player') + ' (wvx ' + w.wvx + ', wvy ' + w.wvy + ')')
  }
}

// No route (exit buried under a pending rock): no throw, the orb drifts to the player and rests there.
function emptyRoute(): void {
  const s = grid(ROOM), w = s.wisp
  s.rocks.push({ id: s.meta.nextId++, x: tileToWorld(1), y: tileToWorld(1), size: 1, tiles: [1 * s.world.w + 1], t: 0, landed: false, hit: false, shrunk: false })
  s.world.pendingSig++
  s.player.x = tileToWorld(3)
  s.player.y = tileToWorld(3)
  stepWisp(s, DT)
  ok(w.on && w.path.length === 0, 'empty: no route')
  w.wx = s.player.x + 60
  w.wy = s.player.y
  const before = Math.hypot(w.wx - s.player.x, w.wy - s.player.y)
  tick(s, 'empty first')
  ok(Math.hypot(w.wx - s.player.x, w.wy - s.player.y) < before && w.wvx < 0, 'empty: the orb moves toward the player')
  for (let k = 0; k < 240; k++) tick(s, 'empty')
  ok(Math.hypot(w.wx - s.player.x, w.wy - s.player.y) < 3, 'empty: the orb rests on the player (' + Math.hypot(w.wx - s.player.x, w.wy - s.player.y) + ' px)')
}

export function run(): void {
  activation()
  glide()
  reroute()
  leash()
  leashEdge()
  emptyRoute()
}
