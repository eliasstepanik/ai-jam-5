// B7b checks: stepMinerals (select, toss, denied, shake off), resin size and cap, plant heal, escape-phase rules.
// Spec: architecture-systems-2.md §3 (S10) and §6 (S13), R-009 (flame.ts writes ui.denyT), R-127.
// Exports run(); no side effect on import; DOM-free; all state is local to each scenario.
import { MATERIAL_CHANGE_S } from '../core/player-actions.ts'
import type { Input } from '../main.ts'
import type { FxEventKind, Pickup, State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { stepFlame, stepMinerals } from '../systems/flame.ts'
import { resolveIntent } from '../systems/intent.ts'
import type { Intent } from '../systems/intent.ts'
import { stepPickups } from '../systems/pickups.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: minerals: ' + msg)
}
const events = (s: State, kind: FxEventKind): number[] => s.fx.events.filter(e => e.kind === kind).map(e => e.a)

const inp = (pressed: string[] = []): Input => ({
  keys: new Set(), pressed: new Set(pressed), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 },
})
const intent = (s: State, pressed: string[]): Intent => resolveIntent(s, inp(pressed))

const resin = (s: State, size: 'small' | 'large'): Pickup =>
  ({ id: s.meta.nextId++, kind: 'resin', x: s.player.x, y: s.player.y, bob: 0, size })

function quiet(): State {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.director.spawnT = 1e9
  s.debug.freezeAi = true
  Object.assign(s, { monsters: [], pickups: [] })
  return s
}

const finish = (s: State): void => {
  if (s.player.pendingMaterial === null) return
  s.meta.time += MATERIAL_CHANGE_S
  stepMinerals(s, intent(s, []))
}

export function run(): void {
  // A canceled action cannot change color later or spend a piece; the selected target is latched.
  {
    const s = init(), p = s.player; p.minerals.sodium = 1
    stepMinerals(s, intent(s, ['KeyF']))
    ok(p.activeMineral === 'none' && p.minerals.sodium === 1 && events(s, 'toss').length === 0, 'starting the clip has no material effect/cost')
    s.meta.time += MATERIAL_CHANGE_S - DT
    stepMinerals(s, intent(s, ['Digit2']))
    ok(p.activeMineral === 'none', 'no change before the final frame finishes')
    s.meta.time += DT
    stepMinerals(s, intent(s, []))
    ok(String(p.activeMineral) === 'sodium' && Number(p.minerals.sodium) === 0, 'finish applies the latched material exactly once')
    stepMinerals(s, intent(s, ['KeyG']))
    ok(p.activeMineral === 'sodium', 'shake-off also waits for the animation')
    stepMinerals(s, { ...intent(s, []), moving: true, mx: 1 })
    finish(s)
    ok(p.pendingMaterial === null && p.materialChangeAt === -1 && p.activeMineral === 'sodium', 'walking cancels shake-off and the displayed clip')
    p.minerals.copper = 1
    stepMinerals(s, intent(s, ['KeyF']))
    stepMinerals(s, { ...intent(s, []), moving: true, mx: 1 })
    s.meta.time += 5; stepMinerals(s, intent(s, []))
    ok(p.minerals.copper === 1 && p.activeMineral === 'sodium' && p.stats.mineralsUsed === 1, 'canceled toss costs nothing and never applies later')
  }
  // 1. Select, toss, denied, shake off: the worked example of systems-2 §6 (sodium 2, copper 1, active none).
  {
    const s = init()
    Object.assign(s.player.minerals, { sodium: 2, copper: 1, strontium: 0 })
    stepMinerals(s, intent(s, ['Digit2']))
    ok(s.player.selected === 'copper' && s.player.minerals.copper === 1 && events(s, 'toss').length === 0, 'Digit2 only moves the cursor')
    stepMinerals(s, intent(s, ['KeyF'])); finish(s)
    ok(s.player.minerals.copper === 0 && s.player.activeMineral === 'copper' && s.player.stats.mineralsUsed === 1, 'F tosses a copper piece')
    ok(events(s, 'toss').join() === '1', 'toss event a = copper index 1')
    stepMinerals(s, intent(s, ['Digit1']))
    stepMinerals(s, intent(s, ['KeyF'])); finish(s)
    ok(s.player.minerals.sodium === 1 && s.player.activeMineral === 'sodium' && s.player.stats.mineralsUsed === 2, 'sodium toss swaps the effect, used = 2')
    ok(events(s, 'toss').join() === '1,0', 'toss event a = sodium index 0')
    stepMinerals(s, intent(s, ['KeyG'])); finish(s)
    ok(s.player.activeMineral === 'none' && events(s, 'shakeOff').length === 1 && s.player.minerals.sodium === 1, 'G clears the effect, no refund')
    stepMinerals(s, intent(s, ['KeyG'])); finish(s)
    ok(events(s, 'shakeOff').length === 1, 'G with no active mineral emits nothing')
    ok(s.ui.denyT === 0, 'no deny so far')
    stepMinerals(s, intent(s, ['Digit2']))
    stepMinerals(s, intent(s, ['KeyF'])); finish(s)
    ok(s.player.minerals.copper === 0 && s.player.activeMineral === 'none' && s.player.stats.mineralsUsed === 2, 'denied toss changes nothing')
    ok(events(s, 'toss').join() === '1,0,-1' && s.ui.denyT === 0.25, 'denied toss emits a = -1 and sets denyT 0.25 (R-009)')
    stepFlame(s, DT)
    ok(Math.abs(s.ui.denyT - (0.25 - DT)) < 1e-12, 'stepFlame counts denyT down by dt')
    for (let k = 0; k < 20; k++) stepFlame(s, DT)
    ok(s.ui.denyT === 0, 'denyT clamps at 0')
  }

  // 2. Re-tossing the active type consumes a piece and counts; a toss into a dead flame is denied.
  {
    const s = init()
    Object.assign(s.player.minerals, { sodium: 2 })
    s.player.selected = 'sodium'
    stepMinerals(s, intent(s, ['KeyF'])); finish(s)
    stepMinerals(s, intent(s, ['KeyF'])); finish(s)
    ok(s.player.minerals.sodium === 0 && s.player.activeMineral === 'sodium' && s.player.stats.mineralsUsed === 2, 're-toss of the active type costs a piece and counts')
    const dead = init()
    dead.player.minerals.copper = 3
    dead.player.selected = 'copper'
    dead.player.energy = 0
    stepMinerals(dead, intent(dead, ['KeyF'])); finish(dead)
    ok(dead.player.minerals.copper === 3 && dead.player.activeMineral === 'none' && dead.player.stats.mineralsUsed === 0, 'toss into a dead flame changes nothing')
    ok(events(dead, 'toss').join() === '-1' && dead.ui.denyT === 0.25, 'toss into a dead flame: a = -1, denyT 0.25')
  }

  // 3. Through step(): Digit/F/G keys reach stepMinerals in descent; none of it runs in escape.
  {
    const s = quiet()
    s.player.minerals.strontium = 1
    step(s, inp(['Digit3']), DT)
    step(s, inp(['KeyF']), DT)
    ok(s.player.activeMineral === 'none' && s.player.minerals.strontium === 1, 'step(): color and inventory wait for the clip')
    for (let k = 0; k < Math.ceil(MATERIAL_CHANGE_S / DT); k++) step(s, inp(), DT)
    ok(s.player.activeMineral === 'strontium' && s.player.minerals.strontium === 0, 'step(): Digit3 then F tosses strontium')
    const esc = quiet()
    esc.meta.phase = 'escape'
    esc.player.minerals.copper = 1
    esc.player.selected = 'copper'
    step(esc, inp(['KeyF']), DT)
    ok(esc.player.minerals.copper === 1 && esc.player.activeMineral === 'none', 'escape: F does nothing')
  }

  // 4. Resin by size, cap at energyMax, plant heal, escape ignores resin.
  {
    const s = init()
    s.meta.time = 10
    s.player.energy = 0
    s.pickups.push(resin(s, 'small'))
    stepPickups(s)
    ok(s.player.energy === T.resin.smallE && s.pickups.length === 0 && s.player.stats.resinUsed === 1, 'small resin restores smallE and is consumed')
    ok(events(s, 'relight').join() === '0', 'resin on a dead flame: relight a = 0')
    ok(s.player.pickupAt === -1, 'resin relights without starting the player pickup animation')
    s.player.pickupAt = 7
    s.pickups.push(resin(s, 'large'))
    stepPickups(s)
    ok(s.player.energy === T.resin.smallE + T.resin.largeE, 'large resin restores largeE')
    ok(events(s, 'relight').join() === '0,1', 'resin on a lit flame: relight a = 1')
    ok(s.player.pickupAt === 7, 'large resin does not restart or cancel another pickup animation')
    s.player.energy = s.player.energyMax - 10
    s.pickups.push(resin(s, 'large'))
    stepPickups(s)
    ok(s.player.energy === s.player.energyMax, 'large resin caps at energyMax')
    s.player.energy = s.player.energyMax - 1
    s.pickups.push(resin(s, 'small'))
    stepPickups(s)
    ok(s.player.energy === s.player.energyMax, 'small resin caps at energyMax')
    s.player.hp = 1; s.player.pickupAt = -1
    s.pickups.push({ id: 98, kind: 'plant', x: s.player.x, y: s.player.y, bob: 0, size: 'small' })
    stepPickups(s)
    ok(s.player.hp === 2 && s.player.pickupAt === 10, 'healing plants retain their pickup animation')
    const esc = init()
    esc.meta.phase = 'escape'
    esc.player.energy = 10
    esc.pickups.push(resin(esc, 'large'))
    stepPickups(esc)
    ok(esc.player.energy === 10 && esc.pickups.length === 1, 'escape: resin is ignored and stays')
    esc.player.hp = 1
    esc.pickups.push({ id: 99, kind: 'plant', x: esc.player.x, y: esc.player.y, bob: 0, size: 'small' })
    stepPickups(esc)
    ok(esc.player.hp === 2 && esc.pickups.length === 1 && esc.player.stats.plantsEaten === 1, 'escape: a plant still heals')
  }
}
