// Dev panel depth control (issue #80): DEV -> Navigate depth buttons restart the running seed in the chosen depth class, keep debug settings,
// keep Best per class, and only set the next-run class from the title. Drives debugAction + stepScreens with a Map-backed fake localStorage.
// Exports run(); no side effect on import; the fake store is installed and restored inside run().
import type { Input } from '../main.ts'
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { debugAction, debugDepthClass } from '../systems/debug.ts'
import { begin, stepScreens } from '../systems/screens.ts'
import { debugLayout } from '../ui/debug-layout.ts'

const SEED = '4' // generates in a few chunked calls (see depth-run.check.ts)
const MAX_CALLS = 12

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: dev-depth: ' + msg)
}

const inp = (): Input => ({ keys: new Set<string>(), pressed: new Set<string>(), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 } })
const record = (score: number): string => JSON.stringify({ v: 1, score, depth: 1, seconds: 1, mineralsUsed: 0, hpLeft: 3 })
const keyOf = (c: number): string => (c === 3 ? 'last-ember:best' : 'last-ember:best:' + c)

function finish(s: State, tag: string): void {
  let n = 0
  while (n < MAX_CALLS && s.ui.genPending !== '') { stepScreens(s, inp()); n++ }
  ok(s.ui.genPending === '' && s.meta.screen === 'playing', tag + ': generation finished and the run started')
}

const depthIds = (s: State): string[] => debugLayout(s, 640, 360, true, 3).controls.filter((c) => c.id.startsWith('depth')).map((c) => c.id)
const lit = (s: State): number[] => debugLayout(s, 640, 360, true, 3).controls.filter((c) => c.id.startsWith('depth') && c.on).map((c) => Number(c.id.slice(5)))

function body(mem: Map<string, string>): void {
  for (const c of [1, 2, 3, 4]) mem.set(keyOf(c), record(c * 10))
  const s = init()
  s.meta.time = 10
  s.settings.loaded = true
  ok(depthIds(s).join() === 'depth1,depth2,depth3,depth4', 'Navigate tab lists depth1..depth4, got ' + depthIds(s).join())
  ok(debugLayout(s, 640, 360, true, 2).controls.every((c) => !c.id.startsWith('depth')), 'depth buttons only on the Navigate tab')

  // Title (no run): sets the next-run class and its Best, starts nothing.
  debugAction(s, 'depth4')
  ok(s.settings.depthClass === 4 && s.ui.genPending === '' && debugDepthClass(s) === 4 && lit(s).join() === '4', 'title: depth4 sets the next-run class only')
  stepScreens(s, inp())
  ok(s.best?.score === 40, 'title: Best follows the chosen class, got ' + String(s.best?.score))

  // Run at class 3, then switch to every other class: same seed, new class, debug settings kept, Best of the new class.
  s.settings.depthClass = 3
  begin(s, SEED)
  finish(s, 'class 3 start')
  ok(s.world.depthClass === undefined, 'class 3 world has no depthClass key')
  const hash3 = s.world.tilesHash, run3 = s.meta.runId
  debugAction(s, 'noclip')
  ok(lit(s).join() === '3', 'running class 3: button 3 lit')
  debugAction(s, 'depth3')
  ok(s.ui.genPending === '' && s.meta.runId === run3, 'same class: no restart')
  for (const c of [1, 2, 4]) {
    debugAction(s, ('depth' + c) as 'depth1')
    ok(s.ui.genPending === SEED && s.settings.depthClass === c, `class ${c}: restart pending on the running seed`)
    finish(s, 'class ' + c)
    ok(s.world.depthClass === c && s.meta.seedText === SEED, `class ${c}: world.depthClass ${String(s.world.depthClass)}, seed ${s.meta.seedText}`)
    ok(s.debug.noclip, `class ${c}: debug settings survive the restart`)
    ok(s.best?.score === c * 10 && debugDepthClass(s) === c && lit(s).join() === String(c), `class ${c}: Best ${String(s.best?.score)} and panel show the class`)
  }
  debugAction(s, 'depth3')
  finish(s, 'back to class 3')
  ok(s.world.depthClass === undefined && s.world.tilesHash === hash3, 'class 3 restart reproduces the original class-3 cave byte for byte')
  ok(s.best?.score === 30, 'class 3 Best restored')
}

export function run(): void {
  const mem = new Map<string, string>()
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) } }, configurable: true, writable: true })
  try { body(mem) } finally { Object.defineProperty(globalThis, 'localStorage', prev ?? { value: undefined, configurable: true, writable: true }) }
  console.log('dev-depth check ok')
}
