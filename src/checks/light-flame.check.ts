// A32 light + flame checks: light radius curve, inside-light predicate, passive flame burn.
// Spec: architecture-systems-4.md §8 #1 and #3, architecture-systems-2.md §1-§2, R-144 (curve reads T), R-145 (flameRadius), R-127.
// Exports run(); no side effect on import; DOM-free; all state is local to each scenario.
import type { Input } from '../main.ts'
import type { FxEventKind, State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { baseRadius, flameRadius, insideLight, lightFrac, lightRadius, LIGHT_ALL } from '../systems/light.ts'
import { stepFlame } from '../systems/flame.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: light-flame: ' + msg)
}
const near = (a: number, b: number, tol: number, msg: string): void =>
  ok(Math.abs(a - b) <= tol, msg + ' (got ' + a + ', want ' + b + ' +-' + tol + ')')
const count = (s: State, kind: FxEventKind): number => s.fx.events.filter(e => e.kind === kind).length

const idle = (): Input => ({
  keys: new Set(), pressed: new Set(), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 },
})

export function run(): void {
  // 1. baseRadius table (§8 #1): 100 -> 170, 50 -> 131.92, 0 -> 22; monotonic on 0..100.
  near(baseRadius(100), 170, 1e-9, 'baseRadius(100)')
  near(baseRadius(50), 131.92, 0.01, 'baseRadius(50)')
  near(baseRadius(0), 22, 1e-9, 'baseRadius(0) is the out radius')
  near(baseRadius(-5), 22, 1e-9, 'negative energy is the out radius')
  let prev = baseRadius(0)
  for (let e = 1; e <= 100; e++) {
    const r = baseRadius(e)
    ok(r > prev, 'baseRadius strictly increases on 0..100 (e=' + e + ': ' + r + ' <= ' + prev + ')')
    prev = r
  }
  near(baseRadius(25, 50), baseRadius(50), 1e-9, 'eMax scales the fraction (25 of 50 = 50 of 100)')

  // 2. The curve reads T (R-144): curveExp 1 makes baseRadius(50) = 40 + 130 * 0.5 = 105. Restored in finally.
  const exp0 = T.flame.curveExp
  try {
    T.flame.curveExp = 1
    near(baseRadius(50), 105, 1e-9, 'baseRadius(50) with curveExp = 1 reads T.flame.curveExp')
  } finally {
    T.flame.curveExp = exp0
  }
  near(baseRadius(50), 131.92, 0.01, 'curveExp restored')

  // 3. flameRadius / lightRadius / insideLight / lightFrac.
  {
    const s = init()
    s.player.x = 100; s.player.y = 100
    near(flameRadius(s), 170, 1e-9, 'flameRadius at full energy')
    near(lightRadius(s), 170, 1e-9, 'lightRadius = flameRadius in descent')
    s.debug.reveal = true
    near(flameRadius(s), 170, 1e-9, 'flameRadius ignores debug.reveal (R-145)')
    ok(lightRadius(s) === LIGHT_ALL, 'debug.reveal gives LIGHT_ALL')
    s.debug.reveal = false
    s.meta.phase = 'escape'
    ok(lightRadius(s) === LIGHT_ALL, 'escape gives LIGHT_ALL')
    near(flameRadius(s), 170, 1e-9, 'flameRadius ignores the escape phase (R-145)')
    ok(lightFrac(s) === 1, 'escape: lightFrac = 1 whatever the energy')
    s.meta.phase = 'descent'
    s.player.energy = 50
    near(lightFrac(s), 0.5, 1e-9, 'lightFrac = energy / energyMax')
    s.player.energy = 100
    s.player.activeMineral = 'sodium'
    near(flameRadius(s), 170 * T.minerals.table.sodium.radiusMul, 1e-9, 'sodium widens the flame (radiusMul)')
    s.player.activeMineral = 'strontium'
    near(flameRadius(s), 170 * T.minerals.table.strontium.radiusMul, 1e-9, 'strontium narrows the flame (radiusMul)')
    s.player.energy = 0
    s.player.activeMineral = 'sodium'
    near(flameRadius(s), T.flame.radiusOutPx, 1e-9, 'flame out: the out radius ignores the mineral')
    s.player.energy = 100
    s.player.activeMineral = 'none'
    ok(insideLight(s, 270, 100), 'point exactly on the light edge is inside')
    ok(!insideLight(s, 270.01, 100), 'point 0.01 px beyond the edge is outside')
    ok(insideLight(s, 280, 100, 10), 'pad widens the light')
    ok(!insideLight(s, 100, 271, 0), 'y axis counts too')
    // Devourer light push: nearest live devourer at nearPx (80 px) pushes the light by pushMax (0.35); a dying one does not.
    const d = spawnMonster(s, 'devourer', 100 + T.devourerLight.nearPx, 100, 170)
    near(flameRadius(s), 170 * (1 - T.devourerLight.pushMax), 1e-9, 'devourer at nearPx pushes the flame by pushMax')
    d.ai = 'dying'
    near(flameRadius(s), 170, 1e-9, 'a dying devourer pushes nothing')
  }

  // 4. stepFlame unit rules (S9).
  {
    for (let z = 1; z <= 4; z++) {
      const s = init()
      s.meta.zone = z as 1 | 2 | 3 | 4
      s.player.energy = 50
      stepFlame(s, DT)
      near(50 - s.player.energy, T.flame.burnPerS[z - 1] / 60, 1e-12, 'zone ' + z + ' burns burnPerS[' + (z - 1) + '] per second')
    }
    const so = init()
    so.player.energy = 50; so.player.activeMineral = 'sodium'
    stepFlame(so, DT)
    near(50 - so.player.energy, 0.5 * T.minerals.table.sodium.burnMul / 60, 1e-12, 'sodium burns burnMul faster')
    const esc = init()
    esc.player.energy = 50; esc.meta.phase = 'escape'
    stepFlame(esc, DT)
    ok(esc.player.energy === 50, 'escape: energy frozen')
    const god = init()
    god.player.energy = 50; god.debug.god = true
    stepFlame(god, DT)
    ok(god.player.energy === 50, 'god mode: energy frozen')
    const out = init()
    out.player.energy = 0
    stepFlame(out, DT)
    ok(out.player.energy === 0 && count(out, 'flameOut') === 0, 'flame already out: nothing burns, no second flameOut')
    const edge = init()
    edge.player.energy = 0.001
    stepFlame(edge, DT)
    ok(edge.player.energy === 0 && count(edge, 'flameOut') === 1, 'crossing zero lands on exactly 0 and emits one flameOut')
    stepFlame(edge, DT)
    ok(edge.player.energy === 0 && count(edge, 'flameOut') === 1, 'next step: still 0, still one flameOut')
    const hold = init()
    hold.player.energy = T.beacon.minEnergyE + 0.0001; hold.player.beaconHold = 0.5
    stepFlame(hold, DT)
    ok(hold.player.energy === T.beacon.minEnergyE && count(hold, 'flameOut') === 0, 'a Beacon hold floors the burn at minEnergyE and never snuffs the flame')
  }

  // 5. Full step() burn (§8 #3): started run, zone 1, energy 10, no input. 10 / (0.5 / 60) = 1200 steps. Accumulated float
  // residue (R-127) may leave ~1e-15 after step 1200, so the flame must be out by step 1201, never earlier, never negative.
  {
    const s = init()
    startRun(s, '1', caveOf(parseSeed('1')))
    s.settings.loaded = true
    s.director.spawnT = 1e9
    s.debug.freezeAi = true
    Object.assign(s, { monsters: [], pickups: [] })
    s.meta.zone = 1
    s.player.energy = 10
    let lastSeq = s.fx.seq, outs = 0, outStep = -1
    for (let k = 1; k <= 1210; k++) {
      step(s, idle(), DT)
      ok(s.player.energy >= 0, 'energy never negative (step ' + k + ': ' + s.player.energy + ')')
      ok(s.meta.zone === 1, 'player stays in zone 1 at the entrance (step ' + k + ')')
      for (const e of s.fx.events) if (e.seq >= lastSeq && e.kind === 'flameOut') { outs++; if (outStep < 0) outStep = k }
      lastSeq = s.fx.seq
      if (k === 1198) ok(s.player.energy > 0, 'flame still lit at step 1198')
    }
    ok(s.player.energy === 0, 'energy is exactly 0 after the burn (got ' + s.player.energy + ')')
    ok(outs === 1, 'exactly one flameOut over 1210 steps (got ' + outs + ')')
    ok(outStep >= 1199 && outStep <= 1201, 'flameOut at step 1200 +-1 float residue (got ' + outStep + ')')
  }
}
