// E0a: standalone 24-shade step-budget check, copied verbatim from ai.check.ts budget() (chunk 30 removes the original there).
// Spec: docs/architecture-monsters-ai-2.md §8. R-039/R-040: local ok(), `export function run(): void`, no import-time work, no DOM, no node: imports.
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { findSpawn } from '../systems/director.ts'
import { lightRadius } from '../systems/light.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60
// monsters-ai-2 §8: 3 600 steps with 24 shades, generous for CI noise. The wall-clock timer (performance.now) runs in a
// check, which check-guard does not scan and determinism §6 (clock ban in simulation code) does not cover.
const BUDGET_MS = 1000

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

const idle = { keys: new Set<string>(), pressed: new Set<string>(), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 } }

// 24 forced shades in the real cave, topped up every step; god mode so bites never end the run.
export function run(): void {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.director.spawnT = 1e9
  s.debug.god = true
  const n = T.director.monstersMax
  const t0 = performance.now()
  for (let k = 0; k < 3600; k++) {
    while (s.monsters.length < n) {
      const pos = findSpawn(s, 'lurker') ?? { x: s.player.x + 30, y: s.player.y }
      spawnMonster(s, 'lurker', pos.x, pos.y, lightRadius(s))
    }
    step(s, idle, DT)
  }
  const ms = performance.now() - t0
  ok(s.meta.steps === 3600 && s.meta.screen === 'playing' && s.monsters.length > 0, '3 600 steps simulated with shades alive')
  ok(ms < BUDGET_MS, '3 600 steps with ' + n + ' shades in ' + ms + ' ms (budget ' + BUDGET_MS + ' ms)')
}
