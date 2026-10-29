// Copper trail (playtest tuning 1 §1.1): on only in the descent with a lit copper flame and energy > 0, the route runs from the player
// tile toward the Beacon (distance falls by one per tile, all floor), it clears when the flame, energy or phase changes, and it draws
// no random numbers. Real caves (seeds 7, 42). L0-L3 imports only; DOM-free.
import { copperHint, COPPER_HINT_SLOTS } from '../core/copper-hints.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { bfs4 } from '../world/bfs.ts'
import { clearCaches, getSolid } from '../world/caches.ts'
import { idx, tileToWorld } from '../world/grid.ts'
import { beaconTile } from '../world/beacon-position.ts'
import { startRun } from '../systems/run.ts'
import { stepCopperTrail, trailAt } from '../systems/copper-trail.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60
const ok = (cond: boolean, msg: string): void => { if (!cond) throw new Error('check failed: copper-trail: ' + msg) }

function lit(seed: string) {
  const s = init()
  startRun(s, seed, caveOf(parseSeed(seed)))
  clearCaches()
  s.meta.phase = 'descent'
  s.player.activeMineral = 'copper'
  s.player.energy = 50
  s.player.x = tileToWorld(s.world.entrance.tx)
  s.player.y = tileToWorld(s.world.entrance.ty)
  return s
}

function leadsToBeacon(): void {
  for (const seed of ['7', '42']) {
    const s = lit(seed), rng = JSON.stringify(s.rng)
    stepCopperTrail(s, DT)
    ok(s.trail.on && s.trail.path.length > 1, seed + ': on with a route')
    ok(JSON.stringify(s.rng) === rng, seed + ': no RNG draws')
    const b = beaconTile(s), E = bfs4(getSolid(s), s.world.w, s.world.h, idx(s, b.tx, b.ty)), p = s.trail.path
    ok(p[0] === idx(s, s.world.entrance.tx, s.world.entrance.ty), seed + ': route starts on the player tile')
    for (let i = 1; i < p.length; i++) ok(E[p[i]] === E[p[i - 1]] - 1, seed + ': distance to the Beacon falls by one per tile')
    ok(E[p[p.length - 1]] < E[p[0]], seed + ': route end is nearer the Beacon than the start')
    const a = { x: 0, y: 0 }, z = { x: 0, y: 0 }
    trailAt(s, 0, a)
    trailAt(s, 1e6, z)
    ok(Math.hypot(a.x - s.player.x, a.y - s.player.y) < 1e-6, seed + ': trailAt(0) is the player')
    ok(Math.hypot(z.x - tileToWorld(p[p.length - 1] % s.world.w), z.y - tileToWorld(Math.floor(p[p.length - 1] / s.world.w))) < 1e-6, seed + ': trailAt clamps to the path end')
  }
}

function clears(): void {
  const off: Array<[string, (s: ReturnType<typeof lit>) => void]> = [
    ['no mineral', s => { s.player.activeMineral = 'none' }],
    ['other mineral', s => { s.player.activeMineral = 'sodium' }],
    ['energy 0', s => { s.player.energy = 0 }],
    ['escape phase', s => { s.meta.phase = 'escape' }],
  ]
  for (const [name, cut] of off) {
    const s = lit('7')
    stepCopperTrail(s, DT)
    ok(s.trail.on && s.trail.path.length > 0, name + ': on before')
    cut(s)
    stepCopperTrail(s, DT)
    ok(!s.trail.on && s.trail.path.length === 0 && s.trail.p0 === -1, name + ': cleared')
  }
}

function sporadic(): void {
  let quiet = 0, visible = 0, max = 0, bright = 0
  const sideways = new Set<number>()
  for (let tick = 0; tick < 3600; tick++) {
    let n = 0
    for (let slot = 0; slot < COPPER_HINT_SLOTS; slot++) {
      const a = copperHint(42, tick / 60, slot), b = copperHint(42, tick / 60, slot)
      ok(JSON.stringify(a) === JSON.stringify(b), 'same clock is stable between render calls')
      if (!a) continue
      if (a.alpha >= .7) bright++
      n++; sideways.add(Math.round(a.side))
      ok(a.alpha >= 0 && a.alpha <= .9 && a.distance >= 38 && a.distance < 150, 'bright bounded nearby directional cue')
      ok(a.size >= 2 && a.size <= 3 && Math.abs(a.side) <= 22, 'native small cube with bounded lateral scatter')
    }
    if (!n) quiet++
    visible += n; max = Math.max(max, n)
  }
  ok(quiet > 600 && visible > 300 && max <= 3, 'sporadic visible hints with long quiet gaps and bounded count')
  ok(bright > 300, 'many cubes reach torch-like visible opacity')
  ok(sideways.size > 12, 'particles scatter sideways rather than forming a line')
}
export function run(): void {
  sporadic()
  leadsToBeacon()
  clears()
}
