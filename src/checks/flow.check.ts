// A31 flow check: screen flow title -> playing -> paused -> dead / won -> title, the end-screen lockout, and run determinism.
// Spec: docs/architecture-modules-systems-2.md §1 (flow.check row), architecture-systems-4.md §8 #9/#10, R-038 (startRun, then step()).
// R-039/R-040: local ok(), `export function run(): void`, no import-time work, no DOM, no node: imports, no L4 imports (R-043).
// ponytail: flow goes through step() only (the real host path); pointer / hover / cursor-key navigation is screens.check.ts's job.
import type { Input } from '../main.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import type { State } from '../core/types.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'
import { scriptedInput } from './input.ts'

const DT = 1 / 60
const LOCK_STEPS = 16 // 16 / 60 = 0.267 s: past the 0.25 s screen lock
const END_STEPS = 32 // 32 / 60 = 0.533 s: past the 0.5 s end-screen lock

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

const inp = (pressed: string[] = [], clicks = 0): Input => ({
  keys: new Set(), pressed: new Set(pressed), mouse: { x: 0, y: 0, down: false },
  clicks: Array.from({ length: clicks }, () => ({ x: 1, y: 1 })), view: { w: 640, h: 360, dpr: 1 },
})

const idle = (s: State, n: number): void => { for (let k = 0; k < n; k++) step(s, inp(), DT) }

function fresh(seed: string): State {
  const s = init()
  startRun(s, seed, caveOf(parseSeed(seed)))
  s.settings.loaded = true
  s.director.spawnT = 1e9 // no spawns: the flow is what is under test
  return s
}

// Dead (hp 0) or won (escape phase, on the exit tile) after one step; returns that state.
function ended(won: boolean): State {
  const s = fresh('1')
  if (won) {
    s.meta.phase = 'escape'
    s.player.x = s.world.exit.tx * 32 + 16
    s.player.y = s.world.exit.ty * 32 + 16
  } else s.player.hp = 0
  step(s, inp(), DT)
  return s
}

function runN(seed: string, n: number): State {
  const s = fresh(seed)
  s.debug.god = true // keep the run alive so all n steps simulate
  for (let k = 0; k < n; k++) step(s, scriptedInput(k), DT)
  return s
}

export function run(): void {
  // title + Enter -> playing (chunked generation: Play sets genPending, the next update starts the run, no world step yet)
  const s = init()
  s.settings.loaded = true
  s.ui.seedInput = '1'
  ok(s.meta.screen === 'title', 'init() starts on the title')
  step(s, inp(['Enter']), DT)
  ok(s.meta.screen === 'title' && s.ui.genPending === '', 'Enter inside the 0.25 s screen lock does nothing')
  idle(s, LOCK_STEPS)
  step(s, inp(['Enter']), DT)
  ok(s.meta.screen === 'title' && s.ui.genPending === '1', 'Enter on Play queues the seed')
  for (let k = 0; k < 12 && s.meta.screen === 'title'; k++) idle(s, 1)
  ok(s.meta.screen === 'playing' && s.meta.steps === 0 && s.meta.seedText === '1', 'title -> playing without a world step')
  idle(s, 5)
  ok(s.meta.steps === 5, 'playing: one world step per update')

  // playing + Blur -> paused at once, that update does not simulate; resume only after the 0.25 s lock
  step(s, inp(['Blur']), DT)
  ok(s.meta.screen === 'paused' && s.meta.steps === 5, 'Blur pauses without a world step')
  step(s, inp(['Escape']), DT)
  ok(s.meta.screen === 'paused', 'Escape inside the screen lock does not resume')
  idle(s, LOCK_STEPS)
  step(s, inp(['Escape']), DT)
  ok(s.meta.screen === 'playing', 'paused + Escape -> playing')

  // paused + KeyQ -> title (run abandoned)
  step(s, inp(['Blur']), DT)
  idle(s, LOCK_STEPS)
  step(s, inp(['KeyQ']), DT)
  ok(s.meta.screen === 'title', 'paused + KeyQ -> title')

  // playing -> dead -> title; dead + Enter inside 0.5 s stays dead, after it Retry queues a new generation
  const d = ended(false)
  ok(d.meta.screen === 'dead' && d.result !== null && !d.result.won, 'hp 0 -> dead with a result')
  idle(d, 24) // 0.4 s after death: past the screen lock, inside the end lock
  step(d, inp(['Enter']), DT)
  ok(d.meta.screen === 'dead' && d.ui.genPending === '', 'dead + Enter within 0.5 s stays dead')
  idle(d, END_STEPS - 24)
  step(d, inp(['Escape']), DT)
  ok(d.meta.screen === 'title' && d.ui.genPending === '', 'dead + Escape after the lock -> title')
  const r = ended(false)
  idle(r, END_STEPS)
  step(r, inp(['Enter']), DT)
  ok(r.meta.screen === 'title' && r.ui.genPending !== '', 'dead + Enter after the lock starts Retry (title, generation queued)')

  // playing -> won -> title, same lock
  const w = ended(true)
  ok(w.meta.screen === 'won' && w.result !== null && w.result.won, 'escape phase on the exit tile -> won')
  idle(w, 24)
  step(w, inp(['Enter']), DT)
  ok(w.meta.screen === 'won', 'won + Enter within 0.5 s stays won')
  idle(w, END_STEPS - 24)
  step(w, inp(['Escape']), DT)
  ok(w.meta.screen === 'title', 'won + Escape after the lock -> title')

  // determinism: same seed + scripted input => identical State after 1800 steps (30 s of game time)
  const a = runN('42', 1800)
  ok(a.meta.steps === 1800 && a.meta.screen === 'playing' && a.meta.time > 1800 * DT - 1e-6, 'determinism run simulated all 1800 steps')
  ok(JSON.stringify(a) === JSON.stringify(runN('42', 1800)), 'same seed + input => same State after 1800 steps')
  ok(JSON.stringify(a) !== JSON.stringify(runN('43', 1800)), 'a different seed gives a different State')
}
