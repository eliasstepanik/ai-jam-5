// B11 escape check, all through step(): the escape-phase economy rules (light, frozen energy, resin ignored, plant heals) and the
// movement rows (sprint 240 px/s, roll 126 px with 18 i-frames, cooldown 1.5 s, win within Chebyshev 1 of the exit).
// Spec: docs/architecture-systems-4.md §8, architecture-systems-3.md §6, R-127. Overlaps light-flame/minerals/roll checks on purpose
// with the same fixtures: this is the one place that asserts the whole escape list in one run. L0-L3 imports only; DOM-free.
import type { Input } from '../main.ts'
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { clearCaches } from '../world/caches.ts'
import { LIGHT_ALL, lightRadius } from '../systems/light.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60
const TILE = 32
const ok = (cond: boolean, msg: string): void => { if (!cond) throw new Error('check failed: escape: ' + msg) }
const inp = (keys: string[] = [], pressed: string[] = []): Input =>
  ({ keys: new Set(keys), pressed: new Set(pressed), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 } })
const rollCount = (s: State): number => s.fx.events.filter(e => e.kind === 'roll' && e.step === s.meta.steps).length

// Open all-floor arena in the escape phase, exit far away, no spawns, no rocks, no monsters, zone 4 (the highest burn rate).
function arena(): State {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.world.tiles = '.'.repeat(s.world.w * s.world.h)
  s.world.tilesHash = 31
  s.world.exit = { tx: 5, ty: 5 }
  s.meta.phase = 'escape'
  s.meta.zone = 4
  Object.assign(s, { monsters: [], pickups: [], veins: [] })
  s.director.spawnT = 1e9
  s.director.quakeT = 1e9
  s.player.x = s.world.w * 16
  s.player.y = s.world.h * 16
  clearCaches()
  return s
}

function economy(): void {
  // Light is unlimited and energy is frozen for 600 steps (10 s), whatever the energy and the active mineral.
  for (const [e, mineral] of [[13, 'none'], [60, 'sodium'], [1, 'copper']] as const) {
    const s = arena()
    s.player.energy = e
    s.player.activeMineral = mineral
    ok(lightRadius(s) === LIGHT_ALL, 'lightRadius === LIGHT_ALL in escape (energy ' + e + ')')
    for (let k = 0; k < 600; k++) step(s, inp(), DT)
    ok(s.meta.phase === 'escape' && s.player.energy === e, 'energy frozen for 600 steps at ' + e + ' (got ' + s.player.energy + ')')
    ok(s.fx.events.every(v => v.kind !== 'flameOut'), 'no flameOut in escape')
    ok(lightRadius(s) === LIGHT_ALL, 'lightRadius still LIGHT_ALL after 600 steps')
  }
  // Resin on the ground stays (energy untouched, nothing counted) while a plant under the player heals once.
  const s = arena()
  s.player.energy = 10
  s.player.hp = 1
  s.pickups.push({ id: 1, kind: 'resin', x: s.player.x, y: s.player.y, bob: 0, size: 'large' })
  s.pickups.push({ id: 2, kind: 'plant', x: s.player.x, y: s.player.y, bob: 0, size: 'small' })
  for (let k = 0; k < 5; k++) step(s, inp(), DT)
  ok(s.player.energy === 10 && s.player.stats.resinUsed === 0, 'escape: resin pickup gives no energy')
  ok(s.pickups.length === 1 && s.pickups[0].kind === 'resin', 'escape: resin stays on the ground, the plant is eaten')
  ok(s.player.hp === 1 + T.plant.healHp && s.player.stats.plantsEaten === 1, 'escape: the plant heals (hp ' + s.player.hp + ')')
}

function movement(): void {
  // Sprint: from rest the speed reaches 240 px/s (4 px per step) and stays there.
  const sp = arena()
  for (let k = 0; k < 20; k++) step(sp, inp(['KeyD']), DT)
  const x0 = sp.player.x
  step(sp, inp(['KeyD']), DT)
  ok(Math.abs(sp.player.x - x0 - 240 * DT) < 1e-6, 'sprint 240 px/s (got ' + (sp.player.x - x0) / DT + ')')
  // Roll: 126 px +-1 over 18 steps, 18 i-frame steps, then sprint speed straight away; the cooldown re-rolls on step 61, not 60.
  const r = arena(), rx = r.player.x
  step(r, inp(['KeyD'], ['Space']), DT)
  ok(rollCount(r) === 1 && r.player.roll.t > 0, 'Space in escape starts a roll')
  let inv = 1
  for (let k = 2; k <= 18; k++) { step(r, inp(['KeyD']), DT); if (r.player.roll.invuln > 0) inv++ }
  ok(Math.abs(r.player.x - rx - 126) <= 1, 'roll covers 126 px +-1 (got ' + (r.player.x - rx) + ')')
  ok(inv === 18, '18 i-frame steps (got ' + inv + ')')
  step(r, inp(['KeyD']), DT)
  ok(r.player.roll.t === 0 && r.player.roll.invuln === 0, 'step 19: roll and i-frames over')
  ok(T.roll.cooldownS === 1.0, 'tuning: roll cooldown 1.0 s')
  const c = arena(), starts: number[] = []
  for (let k = 1; k <= 62; k++) { step(c, inp([], ['Space']), DT); if (rollCount(c) > 0) starts.push(k) }
  ok(starts.join() === '1,61', 'cooldown 1.0 s: second roll on step 61 (got ' + starts.join() + ')')
}

function win(): void {
  // The run is won within Chebyshev distance 1 of the exit tile, not at distance 2.
  for (const [tx, ty, won] of [[100, 100, true], [101, 101, true], [99, 99, true], [102, 100, false], [100, 98, false], [102, 102, false]] as const) {
    const s = arena()
    s.world.exit = { tx: 100, ty: 100 }
    s.player.x = tx * TILE + 16
    s.player.y = ty * TILE + 16
    clearCaches()
    step(s, inp(), DT)
    ok((s.meta.screen === 'won') === won, `tile (${tx},${ty}) vs exit (100,100): ${won ? 'won' : 'still playing'} (got ${s.meta.screen})`)
  }
  ok(T.escape.winRadiusTiles === 1, 'tuning: winRadiusTiles 1')
}

export function run(): void {
  economy()
  movement()
  win()
}
