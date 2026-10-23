// Regression coverage for the reported death score, foreground pickups, sliding and physical rock escape proof.
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { computeScore } from '../core/score.ts'
import { fnv1a } from '../core/rng.ts'
import { clearCaches } from '../world/caches.ts'
import { circleHitsSolid, moveCircle } from '../world/collide.ts'
import { physicalExitReachable } from '../world/route.ts'
import { commitRock, landRock } from '../systems/rocks.ts'
import { startRun } from '../systems/run.ts'
import { pickupFloorVisible, placeVisiblePickups } from '../systems/pickup-placement.ts'
import { caveOf } from './caves.ts'
import { parseSeed } from '../core/seed.ts'

const ok = (v: boolean, why: string): void => { if (!v) throw new Error('reported bugs: ' + why) }
function grid(rows: string[], x: number, y: number): State {
  const s = init(), w = rows[0].length, tiles = rows.join('')
  Object.assign(s.world, { w, h: rows.length, tiles, tilesHash: fnv1a(tiles), exit: { tx: 1, ty: 1 }, entrance: { tx: 1, ty: 1 } })
  s.player.x = x; s.player.y = y; s.meta.screen = 'playing'; s.meta.runId = 1
  clearCaches()
  return s
}

function sliding(): void {
  for (const direction of [-1, 1]) {
    const rows = Array.from({ length: 24 }, (_, y) => y === 0 || y === 23 ? '#'.repeat(12) : '#....#.....#')
    const s = grid(rows, 5 * 32 + 32 + 10, direction > 0 ? 52 : 700)
    let x = s.player.x, y = s.player.y
    for (let frame = 0; frame < 200; frame++) {
      const next = moveCircle(s, x, y, -Math.SQRT2, direction * Math.SQRT2, 10)
      ok(Math.abs(next.y - y - direction * Math.SQRT2) < 1e-7, 'vertical wall seam never steals tangential movement')
      ok(!next.hitY && !circleHitsSolid(s, next.x, next.y, 10), 'slide remains free without falsely blocking tangent axis')
      x = next.x; y = next.y
    }
  }
  const rows = ['########################', '#......................#', '#......................#', '########################']
  const s = grid(rows, 48, 86)
  let p = { x: 48, y: 86 }
  for (let i = 0; i < 200; i++) {
    const n = moveCircle(s, p.x, p.y, 2, 2, 10)
    ok(n.x - p.x === 2 && !n.hitX && !circleHitsSolid(s, n.x, n.y, 10), 'horizontal wall seams preserve slide')
    p = n
  }
}

function pickups(): void {
  for (const seed of ['1', '2', '3', '4', '5', '6', '7', '8', '13', '53']) {
    const s = init(), cave = caveOf(parseSeed(seed)), before = JSON.stringify(cave.pickups)
    startRun(s, seed, cave)
    ok(s.pickups.length === cave.pickups.length, 'all resin and plants retained for seed ' + seed)
    for (let k = 0; k < s.pickups.length; k++) {
      const p = s.pickups[k], tile = Math.floor(p.y / 32) * s.world.w + Math.floor(p.x / 32)
      ok(pickupFloorVisible(s, tile), p.kind + ' is clear of foreground walls, seed ' + seed)
      ok(!circleHitsSolid(s, p.x, p.y, 11), p.kind + ' remains physically accessible')
      ok(p.kind === cave.pickups[k].kind && p.size === cave.pickups[k].size, 'pickup type and restoration value retained')
    }
    const snapshot = JSON.stringify(s.pickups), rng = JSON.stringify(s.rng)
    placeVisiblePickups(s)
    ok(JSON.stringify(s.pickups) === snapshot && JSON.stringify(s.rng) === rng, 'placement is idempotent and consumes no random draws')
    ok(JSON.stringify(cave.pickups) === before, 'run placement does not mutate the generated cave')
  }
}

function rockRoutes(): void {
  const s = grid(['#########', '#.......#', '####.####', '####.####', '####.####', '#########'], 144, 144)
  s.world.beacon = { tx: 7, ty: 1 }; s.meta.phase = 'escape'
  ok(physicalExitReachable(s, []), 'corridor initially connects to exit')
  ok(!physicalExitReachable(s, [2 * 9 + 4]), 'closing the only neck fails the physical escape proof')
  const r = commitRock(s, { tx: 4, ty: 2, size: 1, tiles: [22], x: 144, y: 80 })
  landRock(s, r)
  ok(!r.landed && physicalExitReachable(s, []), 'rock in the final escape neck is cancelled at impact')
  s.player.x = 112; s.player.y = 112 // inside solid rock: an overlapping neighbour is not a valid physical route
  ok(!physicalExitReachable(s, []), 'a solid containing tile cannot borrow an exit proof from a neighbouring source')
}

export function run(): void {
  for (const seconds of [0, 25, 200, 599, 600, 9999]) {
    const input = { depth: 20, seconds, mineralsUsed: 2, hpLeft: 0 }
    const dead = computeScore({ ...input, won: false }), won = computeScore({ ...input, won: true })
    ok(dead.time === 0 && dead.total === 2050, 'death has no time bonus at ' + seconds + ' seconds')
    ok(won.time === Math.max(0, 600 - seconds), 'win retains the time bonus')
  }
  sliding(); pickups(); rockRoutes()
}
