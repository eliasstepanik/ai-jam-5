// Copper trail (playtest tuning 1 §1.1): on only in the descent with a lit copper flame and energy > 0, the route runs from the player
// tile toward the Beacon (distance falls by one per tile, all floor), it clears when the flame, energy or phase changes, and it draws
// no random numbers. Real caves (seeds 7, 42). L0-L3 imports only; DOM-free.
import { copperPixel, createCopperHints, sampleCopperHints, COPPER_TWINKLE_PIXELS } from '../core/copper-hints.ts'
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

function anchoredTwinkles(): void {
  const p = createCopperHints(), seed = 42
  let x = 100, y = 200, choices = 0, previousEnd = -1, seen = -1, births = 0
  const choose = (): { x: number; y: number } => { choices++; return { x, y } }
  for (let tick = 0; tick < 7200; tick++) {
    const time = tick / 60
    sampleCopperHints(p, 1, time, true, seed, choose)
    const b = p.burst
    if (b && b.id !== seen) {
      seen = b.id; births++
      ok(b.life >= .5 && b.life <= 1, 'twinkle lasts .5-1 second')
      if (previousEnd >= 0) ok(b.born - previousEnd >= 1 && b.born - previousEnd <= 2 + DT, 'gap after twinkle is 1-2 seconds')
      previousEnd = b.born + b.life
      const birthX = b.x, birthY = b.y
      x += 64; y -= 32 // walking/path changes only affect the NEXT spawn
      const before = choices
      sampleCopperHints(p, 1, time, true, seed, choose)
      ok(choices === before && b.x === birthX && b.y === birthY, 'same clock does not respawn or follow player')
      for (let i = 0; i < COPPER_TWINKLE_PIXELS; i++) {
        const a = copperPixel(b, seed, b.born + b.life * .3, i), z = copperPixel(b, seed, b.born + b.life * .7, i)
        ok(!!a && !!z && a.x === z.x && a.y === z.y && a.size === z.size, 'pixels stay world-fixed throughout twinkle')
        ok(a!.alpha > 0 && a!.alpha <= .95 && z!.alpha <= .95, 'bright smooth bounded alpha')
      }
      ok(copperPixel(b, seed, b.born - .1, 0) === null && copperPixel(b, seed, b.born + b.life, 0) === null, 'no pixel outside lifetime')
    }
  }
  ok(births > 40 && births === choices, 'one world anchor choice per burst, with repeated quiet gaps')
  sampleCopperHints(p, 1, 120, false, seed, choose)
  ok(!p.active && !p.burst, 'unequip clears active cluster')
  sampleCopperHints(p, 1, 120, true, seed, choose)
  ok(!p.burst && p.nextAt >= 121 && p.nextAt <= 122, 're-equip waits one gap')
  sampleCopperHints(p, 2, 0, true, seed, choose)
  ok(p.runId === 2 && p.seq === 0 && !p.burst, 'new run clears old anchors')
  sampleCopperHints(p, 2, 100, true, seed, choose)
  ok(p.seq === 1, 'large render gap produces one fresh cluster, no catch-up pile')
  sampleCopperHints(p, 2, 0, true, seed, choose)
  ok(p.seq === 0 && !p.burst, 'clock rollback resets pool')
  const empty = createCopperHints()
  sampleCopperHints(empty, 1, 0, true, seed, () => null)
  sampleCopperHints(empty, 1, 3, true, seed, () => null)
  ok(!empty.burst && empty.nextAt >= 4 && empty.nextAt <= 5, 'no visible route spot waits without inventing a marker')
}

export function run(): void {
  anchoredTwinkles()
  leadsToBeacon()
  clears()
}
