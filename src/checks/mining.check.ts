// B1a checks: stepMining through step() (hold E 120 steps, cap 3, energy drain, cancels, pouch full, ties, walls-cache counter, migrate).
// Spec: architecture-systems-2.md §4 (S11), architecture-systems-4.md §8 #5, R-127, R-043 (checks import L0-L3 only: the render key
// function tileKey lives in src/render/keys.ts (L4), so the cache invalidation is asserted on its input, world.veinGen).
// Exports run(); no side effect on import; DOM-free; all state is local to each scenario.
import type { Input } from '../main.ts'
import type { FxEventKind, State, Vein } from '../core/types.ts'
import { init } from '../core/state.ts'
import { migrate } from '../core/migrate.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60
const TILE = 32

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: mining: ' + msg)
}
const inp = (held: string[] = [], pressed: string[] = []): Input => ({
  keys: new Set(held), pressed: new Set(pressed), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 },
})
const onStep = (s: State, kind: FxEventKind): number[] => s.fx.events.filter(e => e.kind === kind && e.step === s.meta.steps).map(e => e.a)

// Quiet run, one vein, the player on its stand tile (face 16 px away, inside the 40 px reach).
function setup(pieces = 2, mineral: Vein['mineral'] = 'sodium'): State {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.director.spawnT = 1e9
  s.debug.freezeAi = true
  Object.assign(s, { monsters: [], pickups: [] })
  const v = s.veins[0]
  s.veins = [{ ...v, mineral, pieces }]
  s.player.x = (v.stand % s.world.w) * TILE + TILE / 2
  s.player.y = Math.floor(v.stand / s.world.w) * TILE + TILE / 2
  return s
}
const hold = (s: State, n: number, keys: string[] = ['KeyE']): void => { for (let k = 0; k < n; k++) step(s, inp(keys), DT) }

export function run(): void {
  // 1. 120 steps of E: the vein is gone exactly on step 120 (not 119), pieces are added, energy is drained by at least 6 E (3 E/s * 2 s).
  {
    const s = setup(2)
    const e0 = s.player.energy, gen0 = s.world.veinGen
    let ticks = 0
    for (let k = 1; k <= 119; k++) { step(s, inp(['KeyE']), DT); ticks += onStep(s, 'mineTick').length }
    ok(s.veins.length === 1 && s.player.mining.progress > 1.9, 'step 119: vein still there, progress ' + s.player.mining.progress)
    ok(s.player.minerals.sodium === 0 && s.world.veinGen === gen0, 'step 119: nothing granted yet')
    step(s, inp(['KeyE']), DT)
    ok(s.veins.length === 0, 'step 120: vein removed')
    ok(s.player.minerals.sodium === 2 && s.player.stats.mineralsMined === 2, 'two pieces granted, mineralsMined 2')
    ok(onStep(s, 'mineDone').join() === '0', 'mineDone a = MINERALS.indexOf(sodium) = 0 (got ' + onStep(s, 'mineDone').join() + ')')
    ok(ticks === 3, 'mineTick every 0.5 s: 3 ticks before the completion step (got ' + ticks + ')')
    ok(e0 - s.player.energy >= 6, 'energy drained >= 6 E (got ' + (e0 - s.player.energy) + ')')
    ok(s.player.mining.progress === 0 && s.player.mining.targetTile === -1, 'mining state reset after completion')
    ok(s.world.veinGen === gen0 + 1, 'walls cache counter veinGen +1 after a vein is removed (tileKey input changes)')
  }
  // 2. Cap at 3: 2 + 2 pieces give 3 and count only the 1 added; a full pouch before gives nothing.
  {
    const s = setup(2)
    s.player.minerals.sodium = 2
    hold(s, 120)
    ok(s.player.minerals.sodium === 3 && s.player.stats.mineralsMined === 1, 'cap 3: sodium 3, mineralsMined 1 (got ' + s.player.minerals.sodium + '/' + s.player.stats.mineralsMined + ')')
    const c = setup(2, 'copper')
    hold(c, 120)
    ok(c.player.minerals.copper === 2 && c.player.minerals.sodium === 0, 'pieces go to the vein mineral (copper 2)')
  }
  // 3. Moving at step 60 resets progress to 0; holding still afterwards needs a fresh 120 steps.
  {
    const s = setup(2)
    hold(s, 59)
    ok(s.player.mining.progress > 0.9, 'progress builds before the move')
    step(s, inp(['KeyE', 'KeyD']), DT) // step 60: moving
    ok(s.player.mining.progress === 0 && s.player.mining.targetTile === -1, 'moving cancels: progress 0')
    s.player.x = (s.veins[0].stand % s.world.w) * TILE + TILE / 2 // back on the stand
    hold(s, 119)
    ok(s.veins.length === 1, 'after a cancel 119 more steps do not finish')
    hold(s, 1)
    ok(s.veins.length === 0, 'after a cancel 120 more steps finish')
  }
  // 4. Cancels: E released, roll in progress, energy 0, out of reach.
  {
    const s = setup(2)
    hold(s, 30)
    step(s, inp(), DT)
    ok(s.player.mining.progress === 0, 'E released: progress 0')
    hold(s, 30)
    s.player.roll.t = 0.2
    step(s, inp(['KeyE']), DT)
    ok(s.player.mining.progress === 0, 'roll.t > 0: progress 0')
    s.player.roll.t = 0
    hold(s, 5)
    ok(s.player.mining.progress > 0, 'control: progress builds again')
    s.player.energy = 0
    step(s, inp(['KeyE']), DT)
    ok(s.player.mining.progress === 0 && s.veins.length === 1, 'energy <= 0: cancelled, no progress')
    ok(onStep(s, 'flameOut').length === 0, 'energy <= 0: cancelled before the cost, so no second flameOut')
    s.player.energy = 50
    s.player.x += 5 * TILE
    step(s, inp(['KeyE']), DT)
    ok(s.player.mining.progress === 0 && s.player.mining.targetTile === -1, 'no vein in reach: cancelled')
  }
  // 5. The mining cost snuffs the flame: energy 0 exactly, flameOut, progress 0.
  {
    const s = setup(2)
    s.player.energy = 0.01
    step(s, inp(['KeyE']), DT)
    ok(s.player.energy === 0 && s.player.mining.progress === 0 && s.veins.length === 1, 'cost to zero: energy 0, cancelled')
    ok(onStep(s, 'flameOut').length >= 1, 'flameOut emitted')
  }
  // 6. Pouch full: no progress, no cost, one mineDone a=-1 per interactEdge, then the 'Pouch full' toast (stepScreens, R-003).
  {
    const s = setup(2)
    s.player.minerals.sodium = T.minerals.cap
    const e0 = s.player.energy
    step(s, inp(['KeyE'], ['KeyE']), DT)
    ok(onStep(s, 'mineDone').join() === '-1', 'pouch full: mineDone a=-1 on the edge step')
    ok(s.player.mining.progress === 0 && s.veins.length === 1, 'pouch full: no progress')
    let more = 0
    for (let k = 0; k < 20; k++) { step(s, inp(['KeyE']), DT); more += onStep(s, 'mineDone').length }
    ok(more === 0, 'pouch full: held E without a new edge emits nothing (got ' + more + ')')
    ok(s.ui.toasts.some(t => t.text === 'Pouch full'), 'toast "Pouch full" shown')
    ok(s.player.energy > e0 - 21 * T.flame.burnPerS[0] * DT - 1e-6 && s.player.energy < e0, 'pouch full: only the passive burn, no mining cost')
    step(s, inp(['KeyE'], ['KeyE']), DT)
    ok(onStep(s, 'mineDone').join() === '-1', 'a second edge emits again')
  }
  // 7. Nearest vein wins, ties go to the lower id.
  {
    const s = setup(1)
    const a = s.veins[0]
    s.veins = [{ ...a, id: 9 }, { ...a, id: 4 }]
    hold(s, 120)
    ok(s.veins.length === 1 && s.veins[0].id === 9, 'tie: the lower id (4) is mined first')
    const f = setup(1)
    const near = f.veins[0]
    f.veins = [{ ...near, id: 1, tile: near.tile + 4 * f.world.w + 3, stand: near.stand + 4 * f.world.w + 3 }, { ...near, id: 2 }]
    hold(f, 120)
    ok(f.veins.length === 1 && f.veins[0].id === 1, 'nearest wins over the lower id')
  }
  // 8. veinGen: additive State field, default 0, idempotent migrate, filled for old saves.
  {
    const s = init()
    ok(s.world.veinGen === 0, 'init: veinGen 0')
    const old = JSON.parse(JSON.stringify(s)) as { world: Record<string, unknown> }
    delete old.world.veinGen
    const m1 = migrate(old)
    ok(m1.world.veinGen === 0, 'migrate fills a missing veinGen with 0')
    old.world.veinGen = 3
    const m2 = migrate(old), m3 = migrate(m2)
    ok(m2.world.veinGen === 3 && JSON.stringify(m3) === JSON.stringify(m2), 'migrate keeps veinGen and is idempotent')
  }
}
