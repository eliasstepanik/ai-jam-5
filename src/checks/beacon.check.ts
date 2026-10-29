// B1b checks: stepBeacon / lightBeacon through step() (START GATE on max(eStart, e), hold ON step 300 not 299, cancels, lightBeacon effects).
// Spec: architecture-systems-2.md §5, architecture-systems-4.md §8 #7/#7a/#7b, R-125, R-127. Contradiction resolved per the plan: systems-4 wins
// over the module-tree "e = 6" row (START GATE denies e = 6). Checks import L0-L3 only (R-043); DOM-free; all state is local to each scenario.
import type { Input } from '../main.ts'
import type { FxEventKind, State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { LIGHT_ALL, lightRadius } from '../systems/light.ts'
import { spawnMonster } from '../entities/monster.ts'
import { DEPTH_MAX, depthOf } from '../core/score.ts'
import { getDepthField } from '../world/caches.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60
const TILE = 32

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: beacon: ' + msg)
}
const inp = (held: string[] = [], pressed: string[] = []): Input => ({
  keys: new Set(held), pressed: new Set(pressed), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 },
})
const count = (s: State, kind: FxEventKind): number => s.fx.events.filter(e => e.kind === kind).length
const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol

// Quiet run, player on the Beacon centre, zone 4 (depth 40), energy e.
function setup(e: number): State {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.director.spawnT = 1e9
  s.debug.freezeAi = true
  Object.assign(s, { monsters: [], pickups: [], veins: [] })
  s.player.x = s.world.beacon.tx * TILE + TILE / 2
  s.player.y = s.world.beacon.ty * TILE + TILE / 2
  s.player.energy = e
  return s
}
// Events are pruned after 30 steps, so denied cues are tallied per step (returned and summed in `denied`).
const denied = new WeakMap<State, number>()
const nDenied = (s: State): number => denied.get(s) ?? 0
const tick = (s: State, held: string[], pressed: string[]): void => {
  step(s, inp(held, pressed), DT)
  denied.set(s, nDenied(s) + s.fx.events.filter(e => e.kind === 'denied' && e.step === s.meta.steps).length)
}
const hold = (s: State, n: number, held: string[] = ['KeyE'], pressed: string[] = []): void => {
  for (let k = 0; k < n; k++) tick(s, held, k === 0 ? pressed : [])
}

export function run(): void {
  // 1. e = 40.0 exactly (R-125): the press step's burn to 39.98 does not deny; escape begins ON step 300, not 299; energy ~13.0.
  {
    const s = setup(40)
    hold(s, 1, ['KeyE'], ['KeyE'])
    ok(s.meta.zone === 4, 'setup: zone 4 at the Beacon (got ' + s.meta.zone + ')')
    ok(s.player.beaconHold > 0 && nDenied(s) === 0, 'e = 40.0: hold starts on the press step, no denied')
    hold(s, 298)
    ok(s.meta.phase === 'descent' && !s.world.beaconLit, 'step 299: still descent')
    hold(s, 1)
    ok(s.meta.phase === 'escape' && s.world.beaconLit, 'step 300: escape begins exactly')
    ok(near(s.player.energy, 13, 0.1) && s.player.energy >= T.beacon.minEnergyE, 'energy ~13.0 at completion (got ' + s.player.energy + ')')
    ok(count(s, 'beaconLit') === 1 && s.player.beaconHold === 0, 'one beaconLit event, beaconHold reset')
    ok(lightRadius(s) === LIGHT_ALL, 'lightRadius === LIGHT_ALL after lighting')
    const e = s.player.energy
    hold(s, 30)
    ok(s.player.energy === e, 'energy frozen in escape')
  }
  // 2. e = 39.9: denied once, no hold, no cost beyond the passive burn (39.9 - 300 * 1.4 / 60 = 32.9).
  {
    const s = setup(39.9)
    hold(s, 2, ['KeyE'], ['KeyE']) // stepScreens turns the denied event of step 1 into the toast on step 2
    ok(s.ui.toasts.some(t => t.text === 'The Beacon needs more light'), 'denied shows the toast')
    hold(s, 298)
    ok(nDenied(s) === 1, 'e = 39.9: exactly one denied (got ' + nDenied(s) + ')')
    ok(s.player.beaconHold === 0 && s.meta.phase === 'descent' && !s.world.beaconLit, 'e = 39.9: no hold, still descent')
    ok(near(s.player.energy, 32.9, 0.01), 'e = 39.9: only the passive burn (got ' + s.player.energy + ')')
    // release, energy 40.0, press again: the hold starts
    tick(s, [], [])
    s.player.energy = 40
    hold(s, 2, ['KeyE'], ['KeyE'])
    ok(s.player.beaconHold > 0 && nDenied(s) === 1, 'e = 40.0 after a release: hold starts, no new denied')
  }
  // 3. e = 30 plus a small resin under the player: gateE = max(eStart, e) sees 55 - burn, the hold starts.
  {
    const s = setup(30)
    s.pickups.push({ id: 1, kind: 'resin', x: s.player.x, y: s.player.y, bob: 0, size: 'small' })
    hold(s, 1, ['KeyE'], ['KeyE'])
    ok(s.player.beaconHold > 0 && nDenied(s) === 0, 'e = 30 + small resin on the press step: hold starts')
  }
  // 4. Cancels: moving, release, flame-out; each needs the gate again.
  {
    const s = setup(60)
    hold(s, 100, ['KeyE'], ['KeyE'])
    ok(s.player.beaconHold > 1.6, 'hold builds')
    tick(s, ['KeyE', 'KeyD'], [])
    ok(s.player.beaconHold === 0, 'moving cancels the hold')
    s.player.x = s.world.beacon.tx * TILE + TILE / 2
    hold(s, 50, ['KeyE'], ['KeyE'])
    ok(s.player.beaconHold > 0, 'restart above the gate works')
    tick(s, [], [])
    ok(s.player.beaconHold === 0, 'releasing E cancels the hold')
    s.player.energy = 39
    hold(s, 5, ['KeyE'], ['KeyE'])
    ok(s.player.beaconHold === 0 && nDenied(s) === 1, 'restart below the gate is denied (once)')
    s.player.energy = 60
    hold(s, 10, ['KeyE'], ['KeyE'])
    s.player.energy = 0
    tick(s, ['KeyE'], [])
    ok(s.player.beaconHold === 0, 'flame-out cancels the hold')
    const far = setup(60)
    far.player.x += 3 * TILE
    hold(far, 10, ['KeyE'], ['KeyE'])
    ok(far.player.beaconHold === 0 && nDenied(far) === 0, 'out of reach: nothing happens, no denied')
  }
  // 5. lightBeacon effects: phase, monsters dying without kill credit, director timers, fx, beaconLitAt.
  {
    const s = setup(80)
    for (let k = 0; k < 2; k++) spawnMonster(s, 'lurker', s.player.x + 150, s.player.y, 100)
    s.fx.shake = 0.1
    s.fx.shakeMag = 20
    hold(s, 1, ['KeyE'], ['KeyE'])
    hold(s, 298)
    s.fx.shake = 0.1
    s.fx.shakeMag = 20
    hold(s, 1)
    ok(s.meta.phase === 'escape' && s.world.beaconLit && s.player.beaconHold === 0, 'phase escape, beaconLit, hold reset')
    ok(s.monsters.length === 2 && s.monsters.every(m => m.ai === 'dying'), 'monsters set to dying')
    ok(s.player.stats.kills === 0, 'no kill credit')
    ok(near(s.director.spawnT, T.escape.firstSpawnS - DT, 1e-6) || s.director.spawnT <= T.escape.firstSpawnS, 'spawnT set to firstSpawnS')
    ok(s.director.quakeT === T.escape.firstRockS || s.director.quakeT < T.escape.firstRockS, 'quakeT set to firstRockS')
    ok(near(s.fx.beaconFlash, T.beacon.flashS - DT, 1e-6), 'beaconFlash set (then ticked once)')
    ok(s.fx.shakeMag <= T.cam.shakeMaxPx && s.fx.shakeMag >= T.beacon.shakePx, 'shakeMag within [shakePx, shakeMaxPx]')
    ok(s.fx.shake >= T.beacon.shakeS - DT - 1e-6, 'shake >= shakeS')
    ok(s.world.beaconLitAt === s.meta.time && s.world.beaconLitAt > 0, 'beaconLitAt = meta.time of the lighting step')
    ok(s.player.mining.progress === 0 && s.player.mining.targetTile === -1, 'mining reset')
    ok(s.fx.events.filter(e => e.kind === 'beaconLit').length === 1, 'beaconLit emitted once')
  }
  // 6. #146: lighting from a tile that reads depth 39 sets the reached depth to 40 and keeps it.
  {
    const s = setup(80)
    const field = getDepthField(s), bd = s.world.beaconDist, w = s.world.w
    const bx = s.world.beacon.tx, by = s.world.beacon.ty
    let tx = -1, ty = -1
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (depthOf(field[(by + dy) * w + (bx + dx)], bd) === 39) { tx = bx + dx; ty = by + dy; break }
    }
    ok(tx >= 0, 'setup: a tile next to the Beacon reads depth 39')
    s.player.x = tx * TILE + TILE / 2
    s.player.y = ty * TILE + TILE / 2
    tick(s, [], [])
    ok(s.player.stats.maxDepth === 39, 'setup: reached depth is 39 before lighting (got ' + s.player.stats.maxDepth + ')')
    hold(s, 300, ['KeyE'], ['KeyE'])
    ok(s.world.beaconLit && s.meta.phase === 'escape', 'Beacon lit from the depth-39 tile')
    ok(s.player.stats.maxDepth === DEPTH_MAX, 'lighting from depth 39 sets maxDepth to 40 (got ' + s.player.stats.maxDepth + ')')
    ok(s.player.stats.deepestZone === 4, 'deepestZone is 4 after lighting')
    ok(s.player.stats.maxPathDist >= bd, 'maxPathDist >= beaconDist after lighting')
    hold(s, 30)
    ok(s.player.stats.maxDepth === DEPTH_MAX && s.player.stats.deepestZone === 4, 'trackDepth afterwards does not lower them')
  }
}
