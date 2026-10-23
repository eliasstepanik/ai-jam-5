// Best follows the depth class (R-164) through the screen machine: the first load, the title Depth row, a ?depth= link, and the run start all
// show the Best of the class in play, and a same-class call never re-reads storage. Drives stepScreens with a Map-backed fake localStorage.
// Each class has a stored Best with score 10 * class (class 3 under the legacy key, the others under ':<class>'), so a wrong class is a wrong score.
// Exports run(); no side effect on import; the fake store is installed and restored inside run().
import type { Input } from '../main.ts'
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { hashSeed } from '../core/rng.ts'
import { parseSeed } from '../core/seed.ts'
import { loadBest } from '../core/storage.ts'
import { stepScreens } from '../systems/screens.ts'
import { parseDepth } from '../ui/platform.ts'

const SEED = '4' // generates in a few chunked calls (see depth-run.check.ts)
const MAX_CALLS = 12 // MAX_ATTEMPTS (8) + the accepting call, with slack
const STORED = [1, 2, 3] // classes with a stored Best; class 4 has none, so its Best is null

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

const inp = (pressed: string[] = []): Input => ({
  keys: new Set<string>(), pressed: new Set(pressed), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 },
})

const record = (score: number): string => JSON.stringify({ v: 1, score, depth: 1, seconds: 1, mineralsUsed: 0, hpLeft: 3 })
const keyOf = (c: number): string => (c === 3 ? 'last-ember:best' : 'last-ember:best:' + c)
// Best score a class shows: its stored score, or -1 for no Best.
const want = (c: number): number => (STORED.includes(c) ? c * 10 : -1)
const shown = (s: State): number => s.best?.score ?? -1

// A title screen with every lock expired. `settings`: the stored settings JSON for a first load, or null for a session that already loaded.
function title(mem: Map<string, string>, settings: object | null): State {
  mem.clear()
  for (const c of STORED) mem.set(keyOf(c), record(c * 10))
  const s = init()
  s.meta.time = 10
  if (settings) mem.set('last-ember:settings', JSON.stringify({ v: 1, volume: 0.5, ...settings }))
  else s.settings.loaded = true
  return s
}

// A session that already loaded (settings.loaded) with the legacy class-3 Best in memory and a pending generation, as begin() leaves it.
function pending(mem: Map<string, string>, depthClass: number | 'random', seedText: string): State {
  const s = title(mem, null)
  loadBest(s) // legacy no-class load: class 3
  ok(shown(s) === 30, 'setup: the legacy load gives the class-3 Best')
  s.settings.depthClass = depthClass
  s.ui.genPending = seedText
  s.ui.genAttempt = 0
  return s
}

// Steps until generation finishes. The Best at the moment the run starts is what the first playing step would see.
function finish(s: State, tag: string): void {
  let n = 0
  while (n < MAX_CALLS && s.ui.genPending !== '') { stepScreens(s, inp()); n++ }
  ok(s.ui.genPending === '' && s.meta.screen === 'playing', tag + ': generation finished and the run started')
}

function install(mem: Map<string, string>): () => void {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v) } }, configurable: true, writable: true })
  // ponytail: an absent store comes back as undefined; read() catches the TypeError like any missing store
  return () => { Object.defineProperty(globalThis, 'localStorage', prev ?? { value: undefined, configurable: true, writable: true }) }
}

// (1) The run start reloads Best for the run's class: setting class 1, Best of class 3 loaded, no title frame in between (genPending set directly).
function runStart(mem: Map<string, string>): void {
  for (const c of [1, 2, 4]) {
    const s = pending(mem, c, SEED)
    finish(s, 'class ' + c)
    ok(s.world.depthClass === c, `class ${c} run: world.depthClass is ${String(s.world.depthClass)}`)
    ok(shown(s) === want(c), `class ${c} run start shows its Best ${want(c)}, got ${shown(s)} (generate() must reload Best for the run's class)`)
  }
  // Same class as the loaded Best (3): no reload, an in-memory Best that storage does not hold survives the run start.
  const s = pending(mem, 3, SEED)
  s.best = { ...s.best!, score: 99 }
  finish(s, 'class 3')
  ok(shown(s) === 99, 'class 3 run start keeps the class-3 Best in memory (no reload for the same class), got ' + shown(s))

  // 'random' resolves per seed after the title showed class 3: the real path (title Enter -> begin -> generate) must reload for the resolved class.
  let text = '', cls = 3
  for (let i = 0; cls === 3; i++) { text = 'r' + i; cls = (hashSeed(parseSeed(text), 'cave:depth') % 4) + 1 }
  const r = title(mem, { depthClass: 'random' })
  r.ui.seedInput = text
  stepScreens(r, inp(['Enter'])) // first load (class 3 shown for 'random'), then Play
  ok(r.ui.genPending !== '' && shown(r) === 30, `random: title shows the class-3 Best and a run is pending (got ${shown(r)})`)
  finish(r, 'random')
  ok(r.world.depthClass === cls, `random seed ${text} resolves to class ${cls}, got ${String(r.world.depthClass)}`)
  ok(shown(r) === want(cls), `random seed ${text} (class ${cls}) run start shows its Best ${want(cls)}, got ${shown(r)}`)
}

// (2) The first load reads the Best of the saved (or preset) class, not the legacy class 3.
function firstLoad(mem: Map<string, string>): void {
  for (const c of [1, 2, 3, 4]) {
    const s = title(mem, { depthClass: c })
    stepScreens(s, inp())
    ok(s.settings.depthClass === c && shown(s) === want(c), `first load with saved class ${c} shows its Best ${want(c)}, got ${shown(s)}`)
  }
  // The title frame would also sync the class (idempotent with the load), so a first frame on another screen isolates the load itself.
  for (const sc of ['help', 'paused'] as const) {
    const h = title(mem, { depthClass: 1 })
    h.meta.screen = sc
    stepScreens(h, inp())
    ok(shown(h) === 10, `first load on the ${sc} screen with saved class 1 shows the class-1 Best, got ${shown(h)}`)
  }
  const s = title(mem, null) // preset class with no saved settings: the load is skipped, but a fresh State still follows the preset on the title
  s.settings.loaded = false
  s.settings.depthClass = 1
  stepScreens(s, inp())
  ok(shown(s) === 10, 'first load with no saved settings and class 1 preset shows the class-1 Best, got ' + shown(s))
}

// (3) The Depth row (focus 4) changes the shown Best at once, in the same frame.
function depthRow(mem: Map<string, string>): void {
  const s = title(mem, null)
  loadBest(s) // a session that loaded class 3 (the cache default)
  s.ui.cursor = 4
  stepScreens(s, inp()) // the settled title: class 3
  ok(shown(s) === 30, 'depth row setup: class 3 shows 30, got ' + shown(s))
  for (const [key, to] of [['ArrowLeft', 2], ['ArrowLeft', 1], ['ArrowRight', 2], ['ArrowRight', 3], ['ArrowRight', 4], ['ArrowLeft', 3]] as const) {
    stepScreens(s, inp([key]))
    ok(s.settings.depthClass === to && shown(s) === want(to), `depth row ${key} gives class ${to} with Best ${want(to)} in that frame, got class ${String(s.settings.depthClass)} Best ${shown(s)}`)
  }
  for (const to of [4, 1, 2, 3]) { // Enter cycles 3 -> 4 -> 1 -> 2 -> 3
    stepScreens(s, inp(['Enter']))
    ok(s.settings.depthClass === to && shown(s) === want(to), `depth row Enter gives class ${to} with Best ${want(to)}, got class ${String(s.settings.depthClass)} Best ${shown(s)}`)
  }
}

// (4) A ?depth= link changes settings.depthClass without a reload (platformStep, after the first load); the title follows on its next frame.
// platformStep itself needs location and the resource registry (DOM globals), so the link value goes through the public parseDepth instead.
function link(mem: Map<string, string>): void {
  ok(parseDepth('1') === 1 && parseDepth('7') === 4 && parseDepth('x') === null && parseDepth(null) === null, 'parseDepth: 1 -> 1, 7 -> 4, x and absent -> null')
  const s = title(mem, null)
  loadBest(s)
  stepScreens(s, inp())
  ok(shown(s) === 30, 'link setup: class 3 shows 30')
  s.settings.depthClass = parseDepth('1') ?? 3
  stepScreens(s, inp())
  ok(shown(s) === 10, 'a ?depth=1 link shows the class-1 Best on the next title frame, got ' + shown(s))
  s.settings.depthClass = parseDepth('4') ?? 3
  stepScreens(s, inp())
  ok(shown(s) === -1 && s.best === null, 'a ?depth=4 link shows no Best (class 4 has none), got ' + shown(s))
}

// (5) The same class never re-reads storage: an in-memory Best that storage does not hold survives idle title frames and Depth row presses that do not change the class.
function sameClass(mem: Map<string, string>): void {
  // Class 1 and 4 are the clamp edges: ArrowLeft/Minus at 1 and ArrowRight/Equal at 4 press the row without changing the class.
  for (const [c, keys] of [[1, ['', '', 'ArrowLeft', 'Minus']], [3, ['', '', 'KeyH']], [4, ['', 'ArrowRight', 'Equal']]] as const) {
    const s = title(mem, { depthClass: c })
    stepScreens(s, inp()) // first load
    s.best = JSON.parse(record(99)) as State['best'] // not in storage: a reload would replace it
    s.ui.cursor = 4
    for (const key of keys) {
      s.meta.screen = 'title' // KeyH opens the help screen
      stepScreens(s, inp(key === '' ? [] : [key]))
      ok(s.settings.depthClass === c && shown(s) === 99, `class ${c}: same-class frame (${key || 'idle'}) leaves the in-memory Best, got class ${String(s.settings.depthClass)} Best ${shown(s)}`)
    }
  }
}

export function run(): void {
  const mem = new Map<string, string>(), restore = install(mem)
  try {
    runStart(mem)
    firstLoad(mem)
    depthRow(mem)
    link(mem)
    sameClass(mem)
  } finally { restore() }
}
