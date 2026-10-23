// Best follows the depth class (R-164) through the screen machine: the first load, the title Depth row, a ?depth= link, and the run start all
// show the Best of the class in play, and a same-class call never re-reads storage. Drives stepScreens with a Map-backed fake localStorage.
// Each class has a stored Best with score 10 * class (class 3 under the legacy key, the others under ':<class>'), so a wrong class is a wrong score.
// Exports run(); no side effect on import; the fake store is installed and restored inside run().
import type { Input } from '../main.ts'
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { hashSeed } from '../core/rng.ts'
import { parseSeed } from '../core/seed.ts'
import { migrate } from '../core/migrate.ts'
import { loadBest } from '../core/storage.ts'
import { endRun } from '../systems/run.ts'
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

// (6) The first load records the class it loaded in s.ui.bestClass. A first frame on the help screen isolates the load: the title sync would
// otherwise reload a missing cache and hide a load that forgot to set it.
function firstLoadCache(mem: Map<string, string>): void {
  for (const c of [1, 2, 4]) {
    const s = title(mem, { depthClass: c })
    s.meta.screen = 'help'
    stepScreens(s, inp())
    ok(s.ui.bestClass === c, `first load with saved class ${c} sets ui.bestClass to ${c}, got ${s.ui.bestClass}`)
    ok(shown(s) === want(c), `first load with saved class ${c} shows its Best ${want(c)}, got ${shown(s)}`)
  }
  const s = title(mem, null) // preset class, no saved settings: the load is skipped but the Best load and the cache still follow the preset
  s.settings.loaded = false
  s.settings.depthClass = 1
  s.meta.screen = 'help'
  stepScreens(s, inp())
  ok(s.ui.bestClass === 1 && shown(s) === 10, `first load with a class 1 preset: ui.bestClass 1 and Best 10, got ${s.ui.bestClass} and ${shown(s)}`)
}

// The first frame of a state hot-swapped like the dev host does: the JSON round trip drops anything not plain data, migrate fills the rest.
const swap = (s: State): State => migrate(JSON.parse(JSON.stringify(s)) as State)

// A 'random' run whose seed resolves to class 1, started through the real path (title Enter -> begin -> generate). Ends with a class-1 Best loaded
// in memory (ui.bestClass 1) while the setting still says 'random' (title class 3): the stale-Best situation a hot swap must not turn into class 3.
function randomClassOne(mem: Map<string, string>): State {
  let text = '', cls = 3
  for (let i = 0; cls !== 1; i++) { text = 'h' + i; cls = (hashSeed(parseSeed(text), 'cave:depth') % 4) + 1 }
  const s = title(mem, { depthClass: 'random' }) // stores Best 10 * class per class
  mem.set(keyOf(3), record(300)) // class-3 Best 300 vs class-1 Best 10
  s.ui.seedInput = text
  stepScreens(s, inp(['Enter']))
  finish(s, 'random class 1')
  ok(s.world.depthClass === 1 && shown(s) === 10 && s.ui.bestClass === 1, `random seed ${text}: class-1 run start has Best 10 cached as class 1, got class ${String(s.world.depthClass)} Best ${shown(s)} cache ${s.ui.bestClass}`)
  return s
}

// (7) A dev hot swap keeps ui.bestClass, so the title still shows (and a run still commits against) the Best of the right class.
function hotSwap(mem: Map<string, string>): void {
  // The title after a swap shows the class of the setting ('random': 3), not the class-1 Best left in memory.
  const a = randomClassOne(mem)
  a.meta.screen = 'title'
  const sa = swap(a)
  ok(sa.ui.bestClass === 1, 'hot swap keeps ui.bestClass 1, got ' + sa.ui.bestClass)
  ok(sa.best?.score === 10, 'hot swap keeps the class-1 Best in memory, got ' + shown(sa))
  stepScreens(sa, inp())
  ok(shown(sa) === 300 && sa.ui.bestClass === 3, `after a swap the title shows the class-3 Best 300, got ${shown(sa)} (cache ${sa.ui.bestClass})`)

  // A class-3 run after the swap must not compare against, or overwrite, the class-3 Best with the stale class-1 one: score 50 < 300 stays unsaved.
  const b = swap(randomClassOne(mem))
  b.meta.screen = 'title'
  b.meta.time = 20 // past the screen change lock
  b.settings.depthClass = 3
  b.ui.seedInput = SEED
  stepScreens(b, inp(['Enter']))
  finish(b, 'class 3 after swap')
  ok((b.world.depthClass ?? 3) === 3 && shown(b) === 300, `class 3 run after a swap starts with Best 300, got class ${String(b.world.depthClass ?? 3)} Best ${shown(b)}`)
  b.meta.steps = 550 * 60 // 600 - 550 seconds = 50 points, nothing else: below 300, above the stale 10
  endRun(b, false)
  ok(b.result?.parts.total === 50 && b.result.isNewBest === false, `class 3 run scores 50 and is no new Best, got ${String(b.result?.parts.total)} isNewBest ${String(b.result?.isNewBest)}`)
  const stored = JSON.parse(mem.get(keyOf(3)) ?? 'null') as { score: number } | null
  ok(stored?.score === 300, `the stored class-3 Best stays 300 after a lower class-3 run, got ${String(stored?.score)}`)
  ok((JSON.parse(mem.get(keyOf(1)) ?? 'null') as { score: number } | null)?.score === 10, 'the stored class-1 Best stays 10')

  // Same class across a swap: no reload, an in-memory Best that storage does not hold survives (the cache said class 1 is loaded).
  const c = title(mem, { depthClass: 1 })
  stepScreens(c, inp()) // first load: class 1
  c.best = JSON.parse(record(99)) as State['best']
  const sc = swap(c)
  stepScreens(sc, inp())
  ok(sc.ui.bestClass === 1 && shown(sc) === 99, `class 1 title after a swap keeps the loaded class-1 Best (no reload), got cache ${sc.ui.bestClass} Best ${shown(sc)}`)
}

export function run(): void {
  const mem = new Map<string, string>(), restore = install(mem)
  try {
    runStart(mem)
    firstLoad(mem)
    depthRow(mem)
    link(mem)
    sameClass(mem)
    firstLoadCache(mem)
    hotSwap(mem)
  } finally { restore() }
}
