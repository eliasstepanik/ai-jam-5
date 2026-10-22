// A31 order check: the system order inside step() that changes outcomes, observed through behaviour (R-079, R-176: no counting spy).
// Spec: docs/architecture-modules-systems-2.md §1 (order.check row, (a)-(d)), architecture-systems.md 1.1-1.3 (D1, D13/D14, D16), MS-25.
// R-039/R-040: local ok(), `export function run(): void`, no import-time work, no DOM, no node: imports, no L4 imports (R-043).
// ponytail: (b) "a resin under the player with e = 0 relights before the mining cost (#6 before #7)" needs stepMining (B1), which is
// not on master. step.check.ts pins D5 stepFlame before D6 stepPickups; add (b) here when B1 lands. (e) is dropped by R-079.
import type { Input } from '../main.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import type { State } from '../core/types.ts'
import { spawnMonster } from '../entities/monster.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

const inp = (pressed: string[] = [], clicks = 0, held: string[] = []): Input => ({
  keys: new Set(held), pressed: new Set(pressed), mouse: { x: 0, y: 0, down: false },
  clicks: Array.from({ length: clicks }, () => ({ x: 1, y: 1 })), view: { w: 640, h: 360, dpr: 1 },
})

// Quiet run: no spawns, shades frozen where the test puts them, nothing on the floor.
function quiet(): State {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.director.spawnT = 1e9
  s.debug.freezeAi = true
  Object.assign(s, { monsters: [], pickups: [] })
  return s
}

// A lunging shade latched 24 px from the player, due to bite on this step (aiT = contactS, contactT + lateMaxS reached).
function latched(s: State): void {
  const m = spawnMonster(s, 'lurker', s.player.x + 24, s.player.y, 100)
  Object.assign(m, { ai: 'lunge', aiT: T.monsters.lurker.contactS, contactT: T.monsters.lurker.contactS - T.parry.lateMaxS })
}

function atExit(s: State): void {
  s.meta.phase = 'escape'
  s.player.x = s.world.exit.tx * 32 + 16
  s.player.y = s.world.exit.ty * 32 + 16
}

export function run(): void {
  // (a) D13 before D14: a swing and a bite landing on the same step give a parry and no bite
  {
    const bite = quiet()
    latched(bite)
    step(bite, inp(), DT)
    ok(bite.player.stats.parries === 0 && bite.player.hurtT > 0 && bite.player.stats.kills === 1, 'control: without a swing the bite lands')
    const s = quiet(), m = (latched(s), s.monsters[0])
    Object.assign(s.player.swing, { active: true, t: 0.05, dir: 0 })
    step(s, inp(), DT)
    ok(s.player.stats.parries === 1 && s.player.parry.lastGrade !== 'none', 'swing + bite on one step: parry (got parries ' + s.player.stats.parries + ')')
    ok(m.ai === 'dying' && s.player.hurtT === 0 && s.player.hitFlash === 0, 'swing + bite on one step: no bite (hurtT ' + s.player.hurtT + ')')
    ok(s.player.energy > s.player.energyMax - T.monsters.lurker.energyHitE, 'swing + bite on one step: parry cost stays below energyHitE')
  }

  // (c) D16 checkEnd: hp 0 on the exit tile in the escape phase gives dead, not won (lose beats win)
  {
    const s = quiet()
    atExit(s)
    s.player.hp = 0
    step(s, inp(), DT)
    ok(s.meta.screen === 'dead' && s.result !== null && !s.result.won, 'hp 0 on the exit tile: dead (got ' + s.meta.screen + ')')
    ok(s.player.hp === 0, 'hp stays clamped at 0')
    const w = quiet()
    atExit(w)
    step(w, inp(), DT)
    ok(w.meta.screen === 'won' && w.result !== null && w.result.won, 'control: alive on the exit tile in escape: won (got ' + w.meta.screen + ')')
  }

  // (d) D1 hitstop: only the clocks advance (time, steps, hitstop, fx timers); the world is frozen; a click survives into the buffer
  {
    const s = quiet()
    spawnMonster(s, 'lurker', s.player.x + 150, s.player.y, 100)
    s.debug.freezeAi = false // a live shade must not move either
    s.director.spawnT = 10
    s.fx.hitstop = 2.5 * DT // 3 steps, the last one clamps to exactly 0 (3 * DT can leave a float residue)
    s.fx.shake = 0.3
    const x = s.player.x, y = s.player.y, e = s.player.energy, mx = s.monsters[0].x, my = s.monsters[0].y, t0 = s.meta.time, n0 = s.meta.steps
    for (let k = 0; k < 3; k++) step(s, inp([], k === 1 ? 1 : 0, ['KeyD']), DT)
    ok(s.player.x === x && s.player.y === y && s.player.energy === e, 'hitstop: player and flame frozen')
    ok(s.monsters[0].x === mx && s.monsters[0].y === my && s.director.spawnT === 10, 'hitstop: shade and director frozen')
    ok(Math.abs(s.meta.time - t0 - 3 * DT) < 1e-12 && s.meta.steps === n0 + 3, 'hitstop: time and steps advance')
    ok(s.fx.hitstop === 0 && s.fx.shake < 0.3, 'hitstop: hitstop counts down, fx timers fade (ponytail: fx fades in hitstop)')
    ok(s.player.swing.buffer === T.swing.bufferS && !s.player.swing.active, 'hitstop: the click is buffered, not yet swung')
    step(s, inp([], 0, ['KeyD']), DT)
    ok(s.player.swing.active && s.player.x > x, 'first free step: the buffered click swings and the world moves')
  }
}
