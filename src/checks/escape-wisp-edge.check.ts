// #81 escape wisp glide, edge cases: a stale or lost orb (hot reload through the real migrate(), off the map, NaN, under a landed rock) is
// re-seeded at the player, an orb behind a wall in a parallel corridor still comes back to the player, and the multi-step look-ahead of the
// waypoint fallback keeps the orb with the player on a staircase corridor. Pure sim, deterministic, DOM-free; stepWisp is called directly.
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { migrate } from '../core/migrate.ts'
import { parseSeed } from '../core/seed.ts'
import { clearCaches } from '../world/caches.ts'
import { isSolidPx, tileToWorld } from '../world/grid.ts'
import { startRun } from '../systems/run.ts'
import { stepWisp, WISP_LEAD_MAX_PX, WISP_LEASH, WISP_RESEED_PX } from '../systems/escape-wisp.ts'
import { caveOf } from './caves.ts'
import { DT, LEASH, grid, sprintRoute, tick } from './escape-wisp-glide.check.ts'

const ok = (cond: boolean, msg: string): void => { if (!cond) throw new Error('check failed: escape-wisp-edge: ' + msg) }
const dist = (s: State): number => Math.hypot(s.wisp.wx - s.player.x, s.wisp.wy - s.player.y)

// Real cave at the Beacon, escape phase, orb running (one step taken).
function cave(seed: string): State {
  const s = init()
  startRun(s, seed, caveOf(parseSeed(seed)))
  s.meta.phase = 'escape'
  s.player.x = tileToWorld(s.world.beacon.tx)
  s.player.y = tileToWorld(s.world.beacon.ty)
  clearCaches()
  stepWisp(s, DT)
  return s
}

// Hot reload from a save that predates the orb's position: the real migrate() fills wx, wy with init()'s 0,0. That is tile (0,0), a border
// wall INSIDE the map, so an off-map test alone misses it. The orb must be back on the player within a few ticks and stay there.
function staleMigrate(): void {
  for (const seed of ['42', '1234']) {
    const old = JSON.parse(JSON.stringify(cave(seed))) as { wisp: Record<string, unknown> }
    for (const k of ['wx', 'wy', 'wvx', 'wvy']) delete old.wisp[k]
    const s = migrate(old)
    clearCaches()
    ok(s.wisp.on && s.wisp.wx === 0 && s.wisp.wy === 0, 'stale ' + seed + ': migrate() did not produce the 0,0 fixture (' + s.wisp.wx + ',' + s.wisp.wy + ')')
    ok(isSolidPx(s, s.wisp.wx, s.wisp.wy), 'stale ' + seed + ': tile (0,0) is not a wall, the fixture is vacuous')
    ok(dist(s) > WISP_RESEED_PX, 'stale ' + seed + ': the 0,0 orb is only ' + dist(s) + ' px from the player, the fixture does not test the wall rule')
    stepWisp(s, DT) // the re-seed is a deliberate jump: the per-tick step bound of tick() applies from the next tick
    for (let k = 0; k < 4; k++) tick(s, 'stale ' + seed + ' ' + k)
    ok(dist(s) < 5 && Math.hypot(s.wisp.wvx, s.wisp.wvy) < 60, 'stale ' + seed + ': orb ' + dist(s) + ' px from the player after 5 ticks (measured 1.5; before the fix 1722 / 9936)')
    s.player.vx = 0
    s.player.vy = 0
    for (let k = 0; k < 1800; k++) tick(s, 'stale ' + seed + ' rest ' + k)
    ok(dist(s) <= LEASH, 'stale ' + seed + ': orb ' + dist(s) + ' px from the standing player after 30 s (leash ' + LEASH + ')')
  }
}

// Stale values on a small grid, where the orb's tile is a wall right next to the player, or off the map, or NaN: all re-seeded at once.
function staleGrid(): void {
  for (const [name, x, y] of [['wall corner (0,0)', 0, 0], ['wall beside the player', 0, tileToWorld(3)], ['off the map', -50, 20], ['NaN y', 100, Number.NaN], ['NaN x', Number.NaN, 100]] as const) {
    const s = grid(['#######', '#X....#', '#.....#', '#P....#', '#######']), w = s.wisp
    stepWisp(s, DT)
    w.wx = x
    w.wy = y
    w.wvx = 40
    w.wvy = -40
    ok(Math.hypot(x - s.player.x, y - s.player.y) < WISP_RESEED_PX || Number.isNaN(x + y), 'stale grid ' + name + ': fixture is beyond the re-seed radius')
    stepWisp(s, DT) // deliberate jump, no step bound
    ok(dist(s) < 2 && Math.hypot(w.wvx, w.wvy) < 30, 'stale grid ' + name + ': orb ' + w.wx + ',' + w.wy + ' not re-seeded at the player')
  }
}

// A rock lands on the orb's tile: the orb is re-seeded at the player (a deliberate jump), never left in the rock.
function rockOnOrb(): void {
  const s = grid(['##############', '#............#', '#............#', '#P..........X#', '##############']), w = s.wisp
  stepWisp(s, DT)
  s.player.vx = 0
  w.wx = tileToWorld(6)
  w.wy = tileToWorld(2)
  w.wvx = 30
  w.wvy = 0
  s.rocks.push({ id: s.meta.nextId++, x: w.wx, y: w.wy, size: 1, tiles: [2 * s.world.w + 6], t: 0, landed: true, hit: false, shrunk: false })
  s.world.solidSig++
  stepWisp(s, DT) // deliberate jump, no step bound
  ok(dist(s) < 2 && Math.hypot(w.wvx, w.wvy) < 30, 'rock on orb: orb ' + w.wx + ',' + w.wy + ' (' + dist(s) + ' px from the player) was not re-seeded')
  for (let k = 0; k < 60; k++) tick(s, 'rock on orb after ' + k)
}

// Two parallel corridors, the route runs right along the player's, up a gap at the far end and back left along the other to the exit.
// The standing player is 10 tiles left of and 2 below the orb, one wall row between them (distance 326 px, inside the band LEASH..WISP_RESEED_PX where
// the pull to the player is on and the re-seed is not). The previous version walked the exit field from the orb's tile there, away from the
// player (stayed 340..531 px away). Now the orb seeks the player and slides along the wall until it is back inside the leash; there the leash lets
// go and the route target pushes it out again, so it rests on the leash edge (measured 288.5 px, the leash is soft).
function parallel(): void {
  const s = grid(['#' + '#'.repeat(38) + '#', '#' + '.'.repeat(20) + 'X' + '.'.repeat(17) + '#', '#' + '#'.repeat(37) + '.#', '#P' + '.'.repeat(37) + '#', '#' + '#'.repeat(38) + '#']), w = s.wisp
  stepWisp(s, DT)
  s.player.vx = 0
  w.wx = tileToWorld(11)
  w.wy = tileToWorld(1)
  w.wvx = 0
  w.wvy = 0
  const d0 = dist(s)
  ok(d0 > LEASH && d0 < WISP_RESEED_PX, 'parallel: fixture orb ' + d0 + ' px away is outside the band ' + LEASH + '..' + WISP_RESEED_PX)
  ok(WISP_LEAD_MAX_PX * WISP_LEASH === LEASH, 'parallel: leash constant mismatch')
  for (let k = 0; k < 300; k++) tick(s, 'parallel ' + k)
  ok(dist(s) <= LEASH + 8, 'parallel: orb behind the wall ended ' + dist(s) + ' px from the player (leash ' + LEASH + ')')
  // Beyond WISP_RESEED_PX the pull cannot be trusted to get round walls: the orb is re-seeded at the player (on a floor tile, not a wall).
  w.wx = tileToWorld(20)
  w.wy = tileToWorld(1)
  const d1 = dist(s)
  ok(d1 > WISP_RESEED_PX && d1 < 2 * WISP_RESEED_PX && !isSolidPx(s, w.wx, w.wy), 'parallel: far fixture orb ' + d1 + ' px away, want ' + WISP_RESEED_PX + '..' + 2 * WISP_RESEED_PX + ' on floor')
  stepWisp(s, DT) // deliberate jump, no step bound
  ok(dist(s) < 2, 'parallel: an orb ' + d1 + ' px away (re-seed radius ' + WISP_RESEED_PX + ') was not re-seeded, it is ' + dist(s) + ' px away')
}

// Staircase corridor, one tile wide: 3 tiles left, 3 up, ten times. Every step needs the waypoint fallback with a look-ahead of several
// tiles. Real code keeps the orb 34 px from the sprinting player at most; a look-ahead cut to its first visible tile gives 298 px, cut to
// two tiles 75 px. Bound 55 = 1.6x headroom over the measured 34.1.
function staircase(): void {
  const n = 10, a = 3, b = 3, g = Array.from({ length: n * b + 3 }, () => Array<string>(n * a + 3).fill('#'))
  let x = n * a + 1, y = n * b + 1
  g[y][x] = 'P'
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < a; k++) g[y][--x] = '.'
    for (let k = 0; k < b; k++) g[--y][x] = '.'
  }
  g[y][x] = 'X'
  const s = grid(g.map((r) => r.join(''))), r = sprintRoute(s, 2500, 'staircase')
  ok(r.far < 55, 'staircase: the orb got ' + r.far + ' px from the sprinting player (want < 55)')
  ok(r.exit < 100, 'staircase: the orb never reached the last leg, closest to the exit ' + r.exit + ' px')
}

export function run(): void {
  staleMigrate()
  staleGrid()
  rockOnOrb()
  parallel()
  staircase()
}
