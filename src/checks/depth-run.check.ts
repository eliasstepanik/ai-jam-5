// Chunked runs keep the depth class (R-164): the real game starts every run through genStep (begin -> stepScreens -> genStep -> startRun), never
// through a direct startRun. A genStep that drops the class when it calls startRun makes every chunked run a class-3 world; this check fails then.
// Per class 1..4: the finished world carries the class (key absent for 3, never written as 3) and its tiles equal the directly generated cave of the same seed and class.
// Exports run(); no side effect on import; DOM-free; all state is local to each scenario.
import type { Input } from '../main.ts'
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { fnv1a } from '../core/rng.ts'
import { parseSeed } from '../core/seed.ts'
import { genStep } from '../systems/run.ts'
import { stepScreens } from '../systems/screens.ts'
import { caveOf } from './caves.ts'

const SEED = '4' // needs 2 attempts, so the chunked loop runs a rejected attempt before the accepting one
const CLASSES = [1, 2, 3, 4]
const MAX_CALLS = 12 // MAX_ATTEMPTS (8) + the accepting call, with slack

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

const quiet = (): Input => ({
  keys: new Set(), pressed: new Set(), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 },
})

function pending(): State {
  const s = init()
  s.ui.genPending = SEED
  s.ui.genAttempt = 0
  return s
}

// What both paths must satisfy once generation is done.
function verify(s: State, c: number, calls: number, how: string): void {
  const tag = how + ' class ' + c
  ok(calls > 0 && calls < MAX_CALLS && s.ui.genPending === '', tag + ': generation finished in ' + calls + ' calls')
  ok(s.meta.screen === 'playing' && s.meta.seedText === SEED, tag + ': run started')
  // class 3 keeps the key absent (startRun ponytail: class-3 worlds stay byte-identical), so a written 3 is a failure too
  if (c === 3) ok(!('depthClass' in s.world), tag + ': class-3 world has no depthClass key (found ' + String(s.world.depthClass) + ')')
  else ok(s.world.depthClass === c, tag + ': world.depthClass is ' + String(s.world.depthClass))
  const want = caveOf(parseSeed(SEED), c)
  ok(s.world.tilesHash === fnv1a(want.tiles), tag + ': tilesHash equals the direct cave')
  ok(s.world.tiles === want.tiles, tag + ': tiles equal the direct cave')
}

export function run(): void {
  const hashes = new Set<number>()
  for (const c of CLASSES) {
    // genStep driven directly with the class, as stepScreens does for the pending seed.
    const a = pending()
    let calls = 0
    while (calls < MAX_CALLS && a.ui.genPending !== '') { genStep(a, c); calls++ }
    verify(a, c, calls, 'genStep')

    // The real game path: the class comes from settings.depthClass and stepScreens drives the chunks (settings.loaded keeps storage out).
    const b = pending()
    b.settings.depthClass = c
    b.settings.loaded = true
    let n = 0
    while (n < MAX_CALLS && b.ui.genPending !== '') { stepScreens(b, quiet()); n++ }
    verify(b, c, n, 'stepScreens')
    ok(a.world.tilesHash === b.world.tilesHash && calls === n, 'class ' + c + ': both chunked paths build the same world')
    hashes.add(a.world.tilesHash)
  }
  ok(hashes.size === CLASSES.length, 'the four classes give four different worlds for one seed (' + hashes.size + ')')
}
