// B2q checks: stepQuake through step() (first rock at firstRockS, telegraph = rockWarnS exactly, ramp, route kept, determinism,
// no activity in descent, lose beats win) plus direct rows for the BFS-deferral rule and the cap puff.
// Spec: architecture-rocks-2 §5, architecture-rocks §2, R-127, R-169. L0-L3 imports only; DOM-free; every scenario builds its own State.
import type { Input } from '../main.ts'
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { fnv1a } from '../core/rng.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { playerSources, routeDist } from '../world/route.ts'
import { clearCaches } from '../world/caches.ts'
import { lightBeacon } from '../systems/beacon.ts'
import { stepQuake } from '../systems/quake.ts'
import { commitRock } from '../systems/rocks.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60
const ok = (cond: boolean, msg: string): void => { if (!cond) throw new Error('check failed: quake: ' + msg) }
const inp = (): Input => ({ keys: new Set(), pressed: new Set(), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 } })

// Per-step tallies (fx events prune after 30 steps): step numbers (steps since the call) of each rockWarn / rockLand.
type Log = { warn: number[]; land: number[] }
function runSteps(s: State, n: number): Log {
  const log: Log = { warn: [], land: [] }
  const t0 = s.meta.steps
  for (let k = 0; k < n; k++) {
    step(s, inp(), DT)
    for (const e of s.fx.events) {
      if (e.step !== s.meta.steps) continue
      if (e.kind === 'rockWarn') log.warn.push(s.meta.steps - t0)
      else if (e.kind === 'rockLand') log.land.push(s.meta.steps - t0)
    }
  }
  return log
}

// A started run (god, quiet), Beacon lit through the real lightBeacon.
function descent(seed = '1'): State {
  const s = init()
  startRun(s, seed, caveOf(parseSeed(seed)))
  s.settings.loaded = true
  s.debug.god = true
  s.debug.freezeAi = true
  s.director.spawnT = 1e9
  s.monsters = []
  return s
}

function escape(seed: string): State {
  const s = descent(seed)
  s.player.x = s.world.beacon.tx * 32 + 16 // the real start is next to the exit: stand at the Beacon so the run is not won at once
  s.player.y = s.world.beacon.ty * 32 + 16
  lightBeacon(s)
  s.director.spawnT = 1e9 // lightBeacon arms the escape spawner; keep the scenario monster-free
  return s
}

// Corridor map (as in rocks-unit): '#X' + 26 floor + 'P#', phase escape.
function corridor(): State {
  const s = init(), row = '#X' + '.'.repeat(26) + 'P#', w = row.length
  Object.assign(s.world, { w, h: 3, tiles: '#'.repeat(w) + row + '#'.repeat(w), entrance: { tx: 1, ty: 1 }, exit: { tx: 1, ty: 1 }, beacon: { tx: 900, ty: 900 } })
  s.world.tilesHash = fnv1a(s.world.tiles)
  s.meta.runId = 1
  s.meta.phase = 'escape'
  s.player.x = 28 * 32 + 16
  s.player.y = 48
  clearCaches()
  return s
}

// Open 90x30 hall, exit at the west wall, player at the east end; rocks pile up but never close the hall.
function hall(): State {
  const w = 90, h = 30, s = init()
  const rows: string[] = []
  for (let y = 0; y < h; y++) rows.push(y === 0 || y === h - 1 ? '#'.repeat(w) : '#' + '.'.repeat(w - 2) + '#')
  Object.assign(s.world, { w, h, tiles: rows.join(''), entrance: { tx: 1, ty: 15 }, exit: { tx: 1, ty: 15 }, beacon: { tx: 900, ty: 900 } })
  s.world.tilesHash = fnv1a(s.world.tiles)
  s.meta.runId = 1
  s.meta.phase = 'escape'
  s.player.x = 86 * 32 + 16
  s.player.y = 15 * 32 + 16
  clearCaches()
  return s
}

export function run(): void {
  // 1. First rock after lightBeacon follows quakeT = firstRockS; its landing is exactly rockWarnS (60 steps) later (R-127 epsilon).
  {
    const s = escape('1')
    ok(s.director.quakeT === T.escape.firstRockS && s.meta.phase === 'escape', 'lightBeacon sets quakeT = firstRockS')
    const log = runSteps(s, 200)
    const first = Math.round(T.escape.firstRockS / DT)
    ok(log.warn.length > 0 && Math.abs(log.warn[0] - first) <= 1, 'first rockWarn near firstRockS (step ' + log.warn[0] + ' vs ' + first + ')')
    const warnN = Math.round(T.escape.rockWarnS / DT)
    ok(log.land.includes(log.warn[0] + warnN), 'rockLand exactly ' + warnN + ' steps after rockWarn (warn ' + log.warn[0] + ', lands ' + log.land.join(',') + ')')
    ok(!log.land.some(l => l > log.warn[0] && l < log.warn[0] + warnN), 'no landing before the telegraph ends')
    ok(s.world.solidSig > 0 && s.world.pendingSig > 0, 'solidSig and pendingSig progressed')
    ok(s.rocks.some(r => r.landed) && s.rocks.every(r => r.t > -DT), 'rocks landed, none overdue')
  }
  // 2. Route stays reachable after 20 s of god-mode escape (a player standing still at the Beacon).
  {
    const s = escape('1')
    runSteps(s, 1200)
    ok(s.rocks.length > 5 && routeDist(s, [], playerSources(s, []), false) >= 0, 'route reachable after 20 s with ' + s.rocks.length + ' rocks')
    ok(Math.abs(s.director.escapeT - 1200 * DT) < 1e-6, 'escapeT counts escape time')
  }
  // 2b. Ramp: in an open hall, a 30 s window at escapeT 80 plans clearly more rocks than one at escapeT 0 (rate 1.6 vs 0.6 per s).
  {
    const commits = (e0: number): number => {
      const s = hall()
      s.director.escapeT = e0
      let n = 0
      for (let k = 0; k < 1800; k++) {
        const before = s.rocks.length
        stepQuake(s, DT)
        if (s.rocks.length > before) n++
      }
      return n
    }
    const early = commits(0), late = commits(T.rocks.rampS)
    ok(late > early * 1.5 && early > 5, 'rate ramps: ' + early + ' rocks at escapeT 0, ' + late + ' at escapeT ' + T.rocks.rampS)
  }
  // 3. No activity outside escape: quakeT 0 and a live descent never plan, count or touch rocks.
  {
    const s = descent()
    s.director.quakeT = 0.01 // would fire at once if the driver ran
    runSteps(s, 600)
    ok(s.meta.phase === 'descent' && s.meta.steps === 600, 'descent ran 600 steps')
    ok(s.rocks.length === 0 && s.director.escapeT === 0 && s.director.quakeT === 0.01, 'descent: no rocks, escapeT 0, quakeT untouched')
  }
  // 4. Determinism: the same seed twice gives the same rocks and gameplay stream.
  {
    const a = escape('1'), b = escape('1')
    runSteps(a, 2400)
    runSteps(b, 2400)
    ok(a.rocks.length > 10 && JSON.stringify(a.rocks) === JSON.stringify(b.rocks) && a.rng.gameplay === b.rng.gameplay, 'same seed, same rocks')
  }
  // 5. BFS deferral: a landing that ran a BFS in the step the timer expired defers planning by one step (no draws, no commit).
  {
    const s = corridor()
    const r = commitRock(s, { tx: 10, ty: 1, size: 1, tiles: [1 * 30 + 10], x: 10 * 32 + 16, y: 48 }) // pocket race: cancel, one BFS
    r.t = DT
    s.director.quakeT = 0
    const g = s.rng.gameplay
    stepQuake(s, DT)
    ok(s.rocks.length === 0 && s.director.quakeT === DT, 'landing with BFS: quakeT = dt, rock cancelled')
    ok(s.rng.gameplay === g, 'deferred step drew nothing from the gameplay stream')
    stepQuake(s, DT)
    ok(s.rng.gameplay !== g, 'the next step plans')
  }
  // 5b. Epsilon (R-127): float residue of 1e-12 after the last telegraph step still lands this step, a real 1e-3 remainder does not.
  for (const [resid, lands] of [[1e-12, true], [1e-3, false]] as const) {
    const s = corridor()
    const r = commitRock(s, { tx: 10, ty: 1, size: 1, tiles: [1 * 30 + 10], x: 10 * 32 + 16, y: 48 })
    r.t = DT + resid
    s.director.quakeT = 1
    stepQuake(s, DT)
    ok(lands ? s.rocks.length === 0 : s.rocks.length === 1 && !r.landed, 'epsilon: residue ' + resid + (lands ? ' lands' : ' waits'))
  }
  // 6. Landed cap: no new rock, retry timer, cosmetic puff (cosmetic stream only) on the null plan.
  {
    const s = corridor()
    for (let i = 0; i < T.escape.rocksMax; i++) s.rocks.push({ id: i + 1, x: 0, y: 0, size: 1, tiles: [0], t: 0, landed: true, hit: true, shrunk: false })
    s.director.quakeT = 0
    const g = s.rng.gameplay, c = s.rng.cosmetic
    stepQuake(s, DT)
    ok(s.rocks.length === T.escape.rocksMax && s.director.quakeT === T.rocks.retryS, 'cap: no commit, quakeT = retryS')
    ok(s.rng.gameplay === g && s.rng.cosmetic !== c, 'cap: only the cosmetic stream drew')
  }
  // 7. Lose beats win on a same-step tie: a rock lands on a 1-hp player standing at the exit (stepQuake runs before checkEnd).
  {
    const s = descent()
    s.debug.god = false
    s.meta.phase = 'escape'
    s.player.hp = 1
    s.player.x = s.world.exit.tx * 32 + 16
    s.player.y = s.world.exit.ty * 32 + 16
    const tile = s.world.exit.ty * s.world.w + s.world.exit.tx
    const r = commitRock(s, { tx: s.world.exit.tx, ty: s.world.exit.ty, size: 1, tiles: [tile], x: s.player.x, y: s.player.y })
    r.t = DT
    runSteps(s, 1)
    ok(s.meta.screen === 'dead', 'same-step rock kill and exit reach: dead, not won (got ' + s.meta.screen + ')')
  }
}
