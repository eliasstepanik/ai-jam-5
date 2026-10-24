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

export const DT = 1 / 60
export const SPRINT = T.player.walkPxS * T.escape.sprintMul
export const LEASH = WISP_LEAD_MAX_PX * WISP_LEASH
const STEP = WISP_MAX_PX_S * DT + 1e-6
const K = 1 - Math.exp(-WISP_STEER_PER_S * DT)
const ok = (cond: boolean, msg: string): void => { if (!cond) throw new Error('check failed: escape-wisp-glide: ' + msg) }

let runs = 5000
// '#' wall, 'X' exit, 'P' player (tile centre), everything else floor. Escape phase, standing.
export function grid(rows: string[]): State {
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
const hall = (row: (r: number) => string): string[] => Array.from({ length: 14 }, (_, r) => '#' + (r === 0 || r === 13 ? '#'.repeat(30) : row(r)) + '#')
const HALL = hall((r) => r === 12 ? 'P' + '.'.repeat(28) + 'X' : '.'.repeat(30)) // open hall, route runs right along the player's row
const VHALL = hall((r) => r === 12 ? 'P' + '.'.repeat(29) : r === 1 ? 'X' + '.'.repeat(29) : '.'.repeat(30)) // ... route runs straight up
const ROOM = ['#########', '#X......#', '#.......#', '#.......#', '#.......#', '#########']

// One tick with the per-tick continuity asserts (position step <= max speed * dt, velocity change <= what the blend allows).
// Returns true when the route was recomputed this tick (player tile or a rock signature changed).
export function tick(s: State, msg: string): boolean {
  const w = s.wisp, ox = w.wx, oy = w.wy, ovx = w.wvx, ovy = w.wvy, p0 = w.p0, ss = w.ss, ps = w.ps
  stepWisp(s, DT)
  ok(Math.hypot(w.wx - ox, w.wy - oy) <= STEP, msg + ': orb moved ' + Math.hypot(w.wx - ox, w.wy - oy) + ' px in one tick (max ' + STEP + ')')
  const dv = Math.hypot(w.wvx - ovx, w.wvy - ovy), bound = K * (WISP_MAX_PX_S + Math.hypot(ovx, ovy)) + 1e-6
  ok(dv <= bound, msg + ': velocity snapped by ' + dv + ' px/s (blend allows ' + bound + ')')
  ok(!isSolidPx(s, w.wx, w.wy), msg + ': orb is in a wall tile at (' + w.wx + ',' + w.wy + ')') // a re-seed or a slide never leaves it in a wall
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

// Sprint the WHOLE route with no pauses (the player never stands) and watch the orb: it must keep up round the corners, not stall.
// Returns lag = orb distance to the route sample at the lead (mean over ticks 200..260, a straight stretch), the share of ticks after a
// 60-tick warm-up with lag < 100 px, windows of 10 ticks that stalled (target > 30 px away all window, orb moved < 1 px), the closest
// approach to the exit tile, the largest orb-to-player distance and the final orb / player points. The player stops on the exit tile.
export function sprintRoute(s: State, ticks: number, msg: string): { lag: number; near: number; stalls: number; exit: number; far: number; x: number; y: number } {
  const w = s.wisp, mw = s.world.w, tgt = { x: 0, y: 0 }, ex = tileToWorld(s.world.exit.tx), ey = tileToWorld(s.world.exit.ty)
  stepWisp(s, DT)
  let lagSum = 0, near = 0, stalls = 0, exit = Infinity, far = 0, minGap = Infinity, sx = w.wx, sy = w.wy
  for (let k = 0; k < ticks; k++) {
    s.player.vx = w.path.length > 1 ? SPRINT : 0
    if (w.path.length > 1) { // walk to the next route tile centre at sprint speed
      const nx = tileToWorld(w.path[1] % mw), ny = tileToWorld(Math.floor(w.path[1] / mw)), dx = nx - s.player.x, dy = ny - s.player.y, len = Math.hypot(dx, dy)
      const f = len > SPRINT * DT ? (SPRINT * DT) / len : 1
      s.player.x += dx * f
      s.player.y += dy * f
    }
    tick(s, msg + ' ' + k)
    wispAt(s, w.d, tgt)
    const gap = Math.hypot(w.wx - tgt.x, w.wy - tgt.y)
    if (k >= 60 && gap < 100) near++
    if (k >= 200 && k < 260) lagSum += gap
    exit = Math.min(exit, Math.hypot(w.wx - ex, w.wy - ey))
    far = Math.max(far, Math.hypot(w.wx - s.player.x, w.wy - s.player.y))
    minGap = k % 10 === 0 ? gap : Math.min(minGap, gap)
    if (k % 10 === 9) { // window end
      if (k >= 69 && minGap > 30 && Math.hypot(w.wx - sx, w.wy - sy) < 1) stalls++
      sx = w.wx
      sy = w.wy
    } else if (k % 10 === 0) { sx = w.wx; sy = w.wy }
  }
  return { lag: lagSum / 60, near: near / (ticks - 60), stalls, exit, far, x: w.wx, y: w.wy }
}

// BEND without a pause: the orb rounds the corner pair, stays near its target for >= 95% of the ticks and reaches the last leg.
// Steady lag behind a target moving at sprint: seek speed = lag * ARRIVE_K must equal SPRINT, so about SPRINT / 8 = 30 px; measured 25.7 px
// on the straight stretch. Band 19..32 (-25% / +25%): ARRIVE_K 12 gives 15.9 px, 6 gives 35.8, 3 gives 76 (and fails 'near' above).
// (WISP_LEASH 1.5 -> 1.45 is not killed on purpose: a 3% shift of the leash is not observable in a cosmetic orb; leashEdge pins 1.4 / 1.6.)
function bendRound(): void {
  const s = grid(BEND), r = sprintRoute(s, 800, 'bend')
  ok(r.near >= 0.95, 'bend: orb within 100 px of its target on only ' + r.near + ' of the ticks (want >= 0.95)')
  ok(r.exit < 100, 'bend: orb never reached the last leg, closest to the exit ' + r.exit + ' px')
  ok(r.lag > 19 && r.lag < 32, 'bend: steady lag ' + r.lag + ' px at sprint, want 19..32 (ARRIVE_K)')
}

// Thin-wall hairpin: the route runs along row 3, up the gap at (10,2) and back along row 1. The straight line from the orb to its target
// crosses the one-tile wall, so only the waypoint fallback gets it round (the previous version stalled 2763 of 3000 ticks on row 3).
function hairpin(): void {
  const s = grid(['############', '#X.........#', '##########.#', '#P.........#', '############']), r = sprintRoute(s, 600, 'hairpin')
  ok(r.stalls === 0, 'hairpin: the orb stalled in ' + r.stalls + ' windows of 10 ticks')
  ok(r.y < tileToWorld(2) && Math.hypot(r.x - s.player.x, r.y - s.player.y) < 8, 'hairpin: orb ended at (' + r.x + ',' + r.y + ') but the player rests at (' + s.player.x + ',' + s.player.y + ')')
  ok(r.exit < 8, 'hairpin: the orb came only ' + r.exit + ' px close to the exit')
}

// A far orb accelerates at once: after 0.5 s the displacement is the steered travel, not half of it (integration at dt / 2).
// (Stale and lost orbs are in escape-wisp-edge.check.ts.)
function farAndStale(): void {
  const s = grid(VHALL), w = s.wisp
  stepWisp(s, DT)
  w.d = 64
  w.wx = s.player.x + 200
  w.wy = s.player.y - 64
  for (let k = 0; k < 30; k++) tick(s, 'far')
  const moved = Math.hypot(w.wx - s.player.x - 200, w.wy - s.player.y + 64)
  ok(moved >= 80, 'far: the orb moved only ' + moved + ' px in 30 ticks (measured 104.7, half-step integration gives about 52)')
}

// Orb dragged far away (beyond the leash) from the player at a full sprint lead: it returns toward the PLAYER, not toward the route point.
function leash(): void {
  const s = grid(HALL), w = s.wisp
  s.player.vx = SPRINT
  for (let k = 0; k < 240; k++) stepWisp(s, DT) // standing in place with sprint speed: the lead grows to the maximum
  ok(w.d > WISP_LEAD_MAX_PX - 1, 'leash: lead at the maximum (got ' + w.d + ')')
  w.wx = s.player.x // 330 px above the player: the route runs along the player's row, the player is straight below
  w.wy = s.player.y - 330
  w.wvx = 0
  w.wvy = 0
  stepWisp(s, DT)
  ok(Math.abs(w.wvx) < 1e-9 && w.wvy > 0, 'leash: beyond the leash the orb is pulled to the player (wvx ' + w.wvx + ', wvy ' + w.wvy + ')')
  for (let k = 0; k < 240; k++) tick(s, 'leash')
  ok(Math.hypot(w.wx - s.player.x, w.wy - s.player.y) <= LEASH, 'leash: back within the leash after 4 s')
}

// Leash with the orb off the player in BOTH axes. Route runs straight up from the player, so the route target lies far above the orb;
// a pull to the player has wvx < 0 and wvy > 0, a retarget that keeps only one player axis (or the route's y) gets a component wrong.
function leashDiagonal(): void {
  const s = grid(VHALL), w = s.wisp
  stepWisp(s, DT)
  w.d = WISP_LEAD_MAX_PX
  w.wx = s.player.x + 280
  w.wy = s.player.y - 100
  w.wvx = 0
  w.wvy = 0
  ok(Math.hypot(280, 100) > LEASH, 'leash diagonal: fixture orb is inside the leash')
  stepWisp(s, DT)
  ok(w.wvx < -1e-3 && w.wvy > 1e-3, 'leash diagonal: both components point to the player (wvx ' + w.wvx + ', wvy ' + w.wvy + ')')
}

// Leash boundary from both sides. Open hall, route runs right along the player's row; the orb sits straight above the player, so a pull
// toward the route target has vx > 0 and a pull toward the player has vx = 0. A leash multiplier that drifts either way flips a case.
function leashEdge(): void {
  // Edges: 0.97/1.03 x the live leash (tracks the constant), and fixed 1.4/1.6 x WISP_LEAD_MAX_PX anchors that pin the design value (~1.5).
  for (const [dist, toRoute] of [[0.97 * LEASH, true], [1.03 * LEASH, false], [1.4 * WISP_LEAD_MAX_PX, true], [1.6 * WISP_LEAD_MAX_PX, false]] as const) {
    const s = grid(HALL), w = s.wisp, f = dist / LEASH
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
  bendRound()
  hairpin()
  farAndStale()
  reroute()
  leash()
  leashDiagonal()
  leashEdge()
  emptyRoute()
}
