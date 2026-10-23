// A7 score checks. Spec: docs/architecture-scoring-and-save.md §2/§4/§7, architecture-tuning-2.md §7 (T.score pinned to the approved
// literals), R-080 (one score.check.ts, also asserts the 5488 worked win), R-040 (run(), no side effect on import, DOM-free, no node:).
// B7a (R-168): storageChecks is the spec's Best round trip through a fake store, incl. the throwing setItem.
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { DEPTH_MAX, computeScore, depthOf, zoneOfDepth } from '../core/score.ts'
import { T } from '../core/tuning.ts'
import { migrate } from '../core/migrate.ts'
import { endRun, startRun } from '../systems/run.ts'
import { commitBest, loadBest, loadSettings, saveSettings } from '../core/storage.ts'
import type { Store } from '../core/storage.ts'

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: score: ' + msg)
}

// scoring-and-save §4 rows A-I: [depth, won, seconds, minerals used, hp left, depth pts, win, time, minerals, hp, score]. Literals from the spec table.
const ROWS: readonly (readonly [string, number, boolean, number, number, number, number, number, number, number, number, number])[] = [
  ['A', 15, false, 115, 1, 0, 1500, 0, 485, 25, 0, 2010],
  ['B', 25, false, 193, 3, 0, 2500, 0, 407, 75, 0, 2982],
  ['C', 35, false, 270, 5, 0, 3500, 0, 330, 125, 0, 3955],
  ['D', 40, false, 380, 6, 0, 4000, 0, 220, 150, 0, 4370],
  ['E', 40, true, 480, 6, 2, 4000, 1000, 120, 150, 100, 5370],
  ['F', 40, true, 417, 6, 3, 4000, 1000, 183, 150, 150, 5483],
  ['G', 40, true, 360, 8, 3, 4000, 1000, 240, 200, 150, 5590],
  ['H', 40, true, 307, 12, 5, 4000, 1000, 293, 300, 250, 5843],
  ['I', 0, false, 25, 0, 0, 0, 0, 575, 0, 0, 575],
]

function formula(): void {
  const w = T.score
  ok(w.depthPts === 100 && w.winPts === 1000 && w.timeCapS === 600 && w.mineralPts === 25 && w.hpPts === 50, 'T.score equals the approved literals 100/1000/600/25/50')
  let prev = -1
  for (const [name, depth, won, seconds, mineralsUsed, hpLeft, dp, win, time, min, hp, total] of ROWS) {
    const p = computeScore({ depth, won, seconds, mineralsUsed, hpLeft })
    ok(p.depth === dp && p.win === win && p.time === time && p.minerals === min && p.hp === hp, `row ${name}: parts ${JSON.stringify(p)}`)
    ok(p.total === total, `row ${name}: total ${p.total} === ${total}`)
    if (name !== 'I') { ok(total > prev, `row ${name}: score ordering A < B < ... < H`); prev = total }
  }
  ok(computeScore({ depth: 40, won: true, seconds: 412, mineralsUsed: 6, hpLeft: 3 }).total === 5488, 'worked win at 412 s, depth 40, 6 minerals, 3 HP scores 5488')
  ok(computeScore({ depth: 0, won: false, seconds: 9999, mineralsUsed: 0, hpLeft: 0 }).time === 0, 'time term is clamped at 0 past the 600 s cap')
  ok(computeScore({ depth: 40, won: true, seconds: 565, mineralsUsed: 0, hpLeft: 1 }).total === 5085, 'worst win (565 s, hp 1, 0 minerals) scores 5085')
}

function depthChecks(): void {
  ok(DEPTH_MAX === 40, 'DEPTH_MAX is 40')
  for (const n of [459, 510, 600, 690]) {
    ok(depthOf(0, n) === 0, `depthOf(0, ${n}) === 0`)
    ok(depthOf(n, n) === 40, `depthOf(${n}, ${n}) === 40`)
    ok(depthOf(-1, n) === 0, `depthOf(-1, ${n}) === 0 (unreachable)`)
    ok(depthOf(n * 2, n) === 40, `depthOf(2n, ${n}) clamps to 40`)
    let prev = 0
    for (let d = 0; d <= n; d++) {
      const v = depthOf(d, n)
      ok(Number.isInteger(v) && v >= prev && v <= 40, `depthOf(${d}, ${n}) = ${v} is an int, monotonic, in 0..40`)
      prev = v
    }
  }
  ok(depthOf(5, 0) === 0 && depthOf(5, -3) === 0, 'depthOf with beaconDist <= 0 is 0')
}

function zoneChecks(): void {
  const want: readonly (readonly [number, number])[] = [[0, 1], [9, 1], [10, 2], [19, 2], [20, 3], [29, 3], [30, 4], [40, 4]]
  for (const [depth, zone] of want) ok(zoneOfDepth(depth) === zone, `zoneOfDepth(${depth}) === ${zone}, got ${zoneOfDepth(depth)}`)
}

// endRun (A29) must route through computeScore: seconds = floor(steps / 60), hp counts only on a win.
function endRunChecks(): void {
  const mk = (): State => {
    const s = init()
    s.player.stats.maxDepth = 40
    s.player.stats.mineralsUsed = 6
    s.player.hp = 3
    s.meta.steps = 412 * 60 + 59 // floor(steps / 60) = 412
    return s
  }
  const won = mk()
  endRun(won, true)
  ok(won.result !== null && won.result.parts.total === 5488 && won.result.seconds === 412 && won.meta.screen === 'won', 'endRun(win) scores the 5488 worked win')
  const dead = mk()
  endRun(dead, false)
  ok(dead.result !== null && dead.result.hpLeft === 0 && dead.result.parts.total === 4000 + 188 + 150 && dead.meta.screen === 'dead', 'endRun(death) drops the win bonus and the HP term')
}

// fake-store helper: a Map-backed Store; `throws` makes setItem throw like a full or blocked store.
function fake(throws = false): Store & { m: Map<string, string> } {
  const m = new Map<string, string>()
  return {
    m,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { if (throws) throw new Error('QuotaExceededError'); m.set(k, v) },
  }
}

function ended(score: number, seconds: number): State {
  const s = init()
  s.result = {
    won: true, depth: 40, zone: 4, seconds, mineralsUsed: 6, hpLeft: 3, seed: 1, seedText: 'x', kills: 0, parries: 0, perfectParries: 0,
    parts: { depth: 0, win: 0, time: 0, minerals: 0, hp: 0, total: score }, isNewBest: false, prevBest: 0, endAt: 0,
  }
  return s
}

function storageChecks(): void {
  const st = fake()
  const a = ended(5488, 412)
  commitBest(a, st)
  ok(a.result !== null && a.result.isNewBest && a.result.prevBest === 0 && a.best !== null && a.best.score === 5488, 'first commit is a new best with prevBest 0')
  ok(a.best !== null && a.best.v === 1 && /^\d{4}-\d\d-\d\dT/.test(a.best.at) && a.best.seconds === 412 && a.best.seedText === 'x', 'Best fields and ISO timestamp')
  const b = init()
  loadBest(b, st)
  ok(JSON.stringify(b.best) === JSON.stringify(a.best), 'commit then loadBest in a new State equals the committed Best')
  const lower = ended(5000, 300)
  lower.best = b.best
  commitBest(lower, st)
  ok(lower.result !== null && !lower.result.isNewBest && lower.result.prevBest === 5488 && lower.best !== null && lower.best.score === 5488, 'lower score keeps the best, prevBest 5488')
  const tie = ended(5488, 400)
  tie.best = b.best
  commitBest(tie, st)
  ok(tie.result !== null && tie.result.isNewBest && tie.best !== null && tie.best.seconds === 400, 'equal score in fewer seconds is a new best')
  const slow = ended(5488, 413)
  slow.best = tie.best
  commitBest(slow, st)
  ok(slow.result !== null && !slow.result.isNewBest && slow.best !== null && slow.best.seconds === 400, 'equal score in more seconds is not')
  const same = ended(5488, 400)
  same.best = tie.best
  commitBest(same, st)
  ok(same.result !== null && !same.result.isNewBest, 'equal score and equal seconds is not')

  const bad = fake(true)
  const f = ended(100, 10)
  commitBest(f, bad)
  commitBest(f, bad)
  saveSettings(f, bad)
  ok(!f.ui.storageOk && f.best !== null && f.best.score === 100, 'throwing setItem: storageOk false, in-memory best kept, no throw')
  ok(f.ui.toasts.filter((t) => t.text === 'Saving disabled in this browser').length === 1, 'failure toasts exactly once')
  const none = init()
  loadSettings(none, { getItem: () => { throw new Error('SecurityError') }, setItem: () => undefined })
  ok(!none.ui.storageOk && none.settings.loaded && none.ui.toasts.length === 1, 'throwing getItem: storageOk false, loaded set, one toast')
  const nog = init()
  loadBest(nog)
  saveSettings(nog)
  ok(nog.best === null && (nog.ui.storageOk || nog.ui.toasts.length === 1), 'default store never throws')

  for (const raw of ['{not json', '{"v":2,"score":9999,"depth":1,"seconds":1,"mineralsUsed":0,"hpLeft":0}', '{"v":1,"score":"9","depth":1,"seconds":1,"mineralsUsed":0,"hpLeft":0}', 'null', '[1]', '7']) {
    const c = fake()
    c.m.set('last-ember:best', raw)
    const s = init()
    loadBest(s, c)
    ok(s.best === null && s.ui.storageOk && c.m.get('last-ember:best') === raw, `unreadable best ignored and kept: ${raw}`)
  }
  const sv = fake()
  const s1 = init()
  s1.settings.volume = 0.3
  s1.settings.muted = true
  s1.settings.lastSeed = '42'
  s1.settings.reducedFlash = true
  saveSettings(s1, sv)
  const s2 = init()
  loadSettings(s2, sv)
  ok(s2.settings.volume === 0.3 && s2.settings.muted && s2.settings.lastSeed === '42' && s2.settings.reducedFlash && s2.settings.loaded, 'settings round trip')
  sv.m.set('last-ember:settings', '{"v":2,"volume":0.1}')
  const s3 = init()
  loadSettings(s3, sv)
  ok(s3.settings.volume === 0.7 && s3.settings.loaded, 'settings v:2 ignored, defaults kept, loaded still set')
  sv.m.set('last-ember:settings', '{"v":1,"volume":0.2,"quality":"bogus"}')
  const s4 = init()
  loadSettings(s4, sv)
  ok(s4.settings.volume === 0.2 && s4.settings.quality === 'auto' && !s4.settings.muted, 'partial settings fill defaults, bad quality becomes auto')
}

// R-164 depth classes: Best per class (class 3 keeps the legacy key and v1 record), settings.depthClass clamp and round trip.
const LEGACY = 'last-ember:best'
const OLD_BEST = '{"v":1,"score":777,"depth":5,"seconds":9,"mineralsUsed":1,"hpLeft":2,"won":false,"seedText":"old","at":"2020-01-01T00:00:00.000Z"}'

function bestPerClassChecks(): void {
  const st = fake()
  commitBest(ended(3000, 100), st) // no class argument: class 3, legacy key
  commitBest(ended(3000, 100), st, 3)
  ok([...st.m.keys()].join() === LEGACY, `class 3 writes only the legacy key, got ${[...st.m.keys()].join()}`)
  const legacy = st.m.get(LEGACY)
  const one = ended(111, 10)
  commitBest(one, st, 1)
  const four = ended(444, 40)
  commitBest(four, st, 4)
  const two = ended(222, 20)
  commitBest(two, st, 2)
  ok(st.m.get(LEGACY) === legacy, 'class 1/2/4 commits leave the legacy (class 3) record byte-identical')
  ok([...st.m.keys()].sort().join() === [LEGACY, LEGACY + ':1', LEGACY + ':2', LEGACY + ':4'].sort().join(), 'classes 1, 2, 4 use the :<class> key suffix')
  ok(one.best?.score === 111 && four.best?.score === 444 && two.best?.score === 222 && one.result?.prevBest === 0, 'a class commit is a new best (prevBest 0) even when other classes have records')
  const sc = (cls: number | undefined): number | undefined => {
    const s = init()
    loadBest(s, st, cls)
    return s.best?.score
  }
  ok(sc(1) === 111 && sc(2) === 222 && sc(3) === 3000 && sc(4) === 444, 'each explicit class loads its own Best')
  ok(sc(undefined) === 3000, 'loadBest without a class loads the legacy class-3 Best')

  const old = fake()
  old.m.set(LEGACY, OLD_BEST) // saved before depth classes existed
  for (const cls of [undefined, 3]) {
    const s = init()
    loadBest(s, old, cls)
    ok(s.best !== null && s.best.score === 777 && s.best.depth === 5 && s.best.seedText === 'old' && s.best.v === 1, `old saved Best loads as class 3 (class arg ${cls})`)
  }
  const none = init()
  loadBest(none, old, 1)
  ok(none.best === null, 'old saved Best is not visible in class 1')
  const sw = init() // s.best is a one-class mirror: an explicit class without a record clears it (no stale other-class Best)
  loadBest(sw, st, 3)
  loadBest(sw, fake(), 1)
  ok(sw.best === null, 'explicit class without a record sets s.best = null')
  const keep = init()
  loadBest(keep, st, 4)
  loadBest(keep, fake())
  ok(keep.best?.score === 444, 'no class argument and no record keeps s.best (old behaviour)')
  const clamp = fake()
  commitBest(ended(5, 5), clamp, 9)
  commitBest(ended(6, 6), clamp, 0)
  ok([...clamp.m.keys()].sort().join() === [LEGACY + ':1', LEGACY + ':4'].join(), 'commitBest clamps the class to 1..4')
}

function settingsClassChecks(): void {
  ok(init().settings.depthClass === 3, 'init() default settings.depthClass is 3')
  const old = JSON.parse(JSON.stringify(init())) as { settings: { depthClass?: number } }
  delete old.settings.depthClass
  ok(migrate(old).settings.depthClass === 3, 'migrate of a State without settings.depthClass gives 3')

  const sv = fake()
  const load = (raw: unknown): unknown => {
    sv.m.set('last-ember:settings', JSON.stringify({ v: 1, volume: 0.5, depthClass: raw }))
    const s = init()
    s.settings.depthClass = 2 // a mutant that skips the field would leave this
    loadSettings(s, sv)
    return s.settings.depthClass
  }
  const cases: readonly (readonly [unknown, unknown])[] = [
    [1, 1], [2, 2], [3, 3], [4, 4], [9, 4], [5, 4], [0, 1], [-5, 1], [2.6, 3], [1.4, 1], [3.5, 4], ['x', 3], ['3', 3], [null, 3], [true, 3], [{}, 3], ['random', 'random'],
  ]
  for (const [raw, want] of cases) {
    const got = load(raw)
    ok(got === want, `loadSettings depthClass ${JSON.stringify(raw)} -> ${String(want)}, got ${String(got)}`)
  }
  sv.m.set('last-ember:settings', '{"v":1,"volume":0.5}')
  const miss = init()
  miss.settings.depthClass = 2
  loadSettings(miss, sv)
  ok(miss.settings.depthClass === 3, 'stored settings without depthClass load as 3')

  for (const want of [1, 2, 3, 4, 'random'] as const) {
    const a = init()
    a.settings.depthClass = want
    saveSettings(a, sv)
    ok(JSON.parse(sv.m.get('last-ember:settings') as string).depthClass === want, `saveSettings writes depthClass ${want}`)
    const b = init()
    b.settings.depthClass = want === 3 ? 1 : 3 // differs from the saved value
    loadSettings(b, sv)
    ok(b.settings.depthClass === want, `settings depthClass round trip ${want}, got ${String(b.settings.depthClass)}`)
  }
  const wild = init()
  wild.settings.depthClass = 9
  saveSettings(wild, sv)
  ok(JSON.parse(sv.m.get('last-ember:settings') as string).depthClass === 4, 'saveSettings clamps 9 to 4')
}

// endRun has no store argument: it commits through globalThis.localStorage. Install a fake for the call, then restore.
function endRunClassChecks(): void {
  const prev = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const keysAfter = (cls: number | undefined): string => {
    const st = fake()
    Object.defineProperty(globalThis, 'localStorage', { value: st, configurable: true, writable: true })
    try {
      const s = init()
      startRun(s, '7', undefined, cls)
      s.player.stats.maxDepth = 10
      endRun(s, false)
      ok(s.best !== null && s.best.score > 0, `endRun class ${cls} sets s.best`)
    } finally {
      if (prev) Object.defineProperty(globalThis, 'localStorage', prev)
      else delete (globalThis as { localStorage?: unknown }).localStorage
    }
    return [...st.m.keys()].join()
  }
  const k1 = keysAfter(1)
  ok(k1 === LEGACY + ':1', `endRun of a class-1 run writes last-ember:best:1, got ${k1}`)
  ok(keysAfter(3) === LEGACY && keysAfter(undefined) === LEGACY, 'endRun of a class-3 (or classless) run writes the legacy key')
}

export function run(): void {
  formula()
  depthChecks()
  zoneChecks()
  endRunChecks()
  storageChecks()
  bestPerClassChecks()
  settingsClassChecks()
  endRunClassChecks()
}
