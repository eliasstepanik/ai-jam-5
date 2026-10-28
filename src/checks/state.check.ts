// State checks. Spec: docs/architecture-state-3.md §7 (#1-#6), architecture-modules-core.md §4 (state.check row), R-038/R-039/R-040, C19.
// Exports run(); no side effect on import; DOM-free; no node: imports (R-039). Imports L0 core only, never game.ts.
// ponytail: #2 step part (init(), startRun(s, '12345'), 600 x step(s, scriptedInput(k), 1/60) then walk + round trip) needs
// startRun and step (A29), which are not on master. The tree walk and the mid-run fixture below are the parts that exist now;
// A29 extends run() with the stepping loop and feeds the stepped state to the same walk/roundTrip helpers.
import { init, MAP_H, MAP_W } from '../core/state.ts'
import { migrate, DEFAULT_MONSTER, DEFAULT_PICKUP, DEFAULT_VEIN, DEFAULT_ROCK, DEFAULT_FX_EVENT, DEFAULT_TOAST } from '../core/migrate.ts'
import { DEFAULT_BEST, DEFAULT_RESULT } from '../core/score.ts'
import { T } from '../core/tuning.ts'
import type { Best, FxEvent, Monster, Pickup, Rock, RunResult, State, Toast, Vein } from '../core/types.ts'

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

// C19: State must be JSON-only. Throws on undefined, NaN, Infinity, functions, symbols, bigint, sparse arrays and non-plain objects.
function walk(v: unknown, path: string): void {
  if (v === null || typeof v === 'boolean' || typeof v === 'string') return
  if (typeof v === 'number') return ok(Number.isFinite(v), `${path} is ${String(v)}, not a finite number`)
  ok(typeof v === 'object', `${path} has type ${typeof v}`)
  const o = v as object
  if (Array.isArray(o)) {
    ok(Object.getPrototypeOf(o) === Array.prototype, `${path} is not a plain array`)
    for (let i = 0; i < o.length; i++) {
      ok(i in o, `${path}[${i}] is a hole`)
      walk(o[i], `${path}[${i}]`)
    }
    return
  }
  ok(Object.getPrototypeOf(o) === Object.prototype, `${path} is not a plain object (${Object.prototype.toString.call(o)})`)
  ok(Object.getOwnPropertySymbols(o).length === 0, `${path} has a symbol key`)
  for (const [k, c] of Object.entries(o)) walk(c, `${path}.${k}`)
}

// Structural equality for JSON-only values (key order does not matter, undefined keys do).
function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  const rb = b as Record<string, unknown>
  return ka.every((k) => k in rb && deepEq((a as Record<string, unknown>)[k], rb[k]))
}

// walk + JSON round trip deep-equals the original.
function roundTrip(s: unknown, name: string): void {
  walk(s, name)
  ok(deepEq(JSON.parse(JSON.stringify(s)), s), `${name} survives a JSON round trip`)
}

// Mid-run state: every collection non-empty and every field away from its default, so migrate must preserve real values.
// Entities are typed against types.ts: a new field breaks tsc here, a stale DEFAULT_* breaks #5 at run time.
const monster: Monster = {
  ...DEFAULT_MONSTER, id: 2, kind: 'stalker', x: 1200, y: 900, vx: 12, vy: -3, hp: 1, ai: 'stalk', aiT: 0.4, aiDur: 1.2, beat: 1,
  ringAngle: 0.5, ringRadius: 90, orbitDir: -1, lungeDir: 1.2, lungeCd: 0.7, stunned: 0.5, seen: true,
  contactT: 0.25, stuckT: 0.1, behindT: 0.3, lastX: 1198, lastY: 901, fleeing: true,
  awareness: 'searching', detectionTimer: 0.3, lastKnownX: 5, lastKnownY: 7, searchT: 2, homeX: 1150, homeY: 870,
  patrolX: 30, patrolY: -20, patrolT: 0.5, retreatT: 1, facing: 0.7, stalkT: 0.4, stalkAngle: 1,
  suspectT: 0.5, patience: 1.5,
}
// Issue #113 (M5): the 14 monster keys added by the smarter-monsters work. The literal sets them to non-default
// values, so migrate(mid) deep-equal (below) proves migrate keeps them; deleting them below proves migrate fills them.
const ISSUE_113_KEYS = ['awareness', 'detectionTimer', 'lastKnownX', 'lastKnownY', 'searchT', 'homeX', 'homeY',
  'patrolX', 'patrolY', 'patrolT', 'retreatT', 'facing', 'stalkT', 'stalkAngle']
const pickup: Pickup = { id: 3, kind: 'plant', x: 1300, y: 850, bob: 1.5, size: 'large' }
const vein: Vein = { id: 4, mineral: 'copper', tile: 2400, stand: 2401, pieces: 2 }
const rock: Rock = { id: 5, x: 1100, y: 800, size: 2, tiles: [1000, 1001, 1320, 1321], t: 0.8, landed: false, hit: true, shrunk: true }
const fxEvent: FxEvent = { seq: 7, kind: 'parryGood', x: 1210, y: 905, a: 0.5, step: 598 }
const toast: Toast = { text: 'Flame low', t: 1.5 }
const best: Best = { v: 1, score: 1234, depth: 22, seconds: 300, won: true, mineralsUsed: 3, hpLeft: 4, seedText: '12345', at: '2026-10-18T00:00:00.000Z' }
const result: RunResult = {
  won: false, depth: 17, zone: 2, seconds: 10, mineralsUsed: 1, hpLeft: 0,
  parts: { depth: 1700, win: 0, time: 590, minerals: 25, hp: 0, total: 2315 },
  seed: 12345, seedText: '12345', kills: 2, parries: 5, perfectParries: 1, isNewBest: true, prevBest: 1000, endAt: 10.2,
}

function midRunState(): State {
  const s = init()
  const n = MAP_W * MAP_H
  const row = 10 * MAP_W
  s.meta = { seed: 12345, seedText: '12345', screen: 'playing', phase: 'escape', time: 10.2, steps: 600, palette: [1, 1, 1], zone: 2, runId: 1, nextId: 8 }
  s.world.tiles = '#'.repeat(row) + '.'.repeat(MAP_W) + '#'.repeat(n - row - MAP_W)
  s.world.tilesHash = 123456789
  s.world.entrance = { tx: 5, ty: 10 }
  s.world.exit = { tx: 5, ty: 10 }
  s.world.beacon = { tx: 200, ty: 10 }
  s.world.beaconDist = 195
  s.world.beaconLit = true
  s.world.beaconLitAt = 4.5
  s.world.explored = Array.from({ length: Math.ceil(n / 32) }, (_, i) => (i * 2654435761) | 0)
  s.world.solidSig = 3
  s.world.exploreKey = 42
  s.world.pendingSig = 5
  s.world.veinGen = 2
  s.player.x = 1200; s.player.y = 900; s.player.hp = 3; s.player.energy = 42.5
  s.player.activeMineral = 'copper'; s.player.minerals.copper = 2
  s.player.parry.lastGrade = 'good'; s.player.parry.lastAt = 598
  s.player.roll.cooldown = 0.5; s.player.stats.kills = 2
  s.monsters = [monster]
  s.pickups = [pickup]
  s.veins = [vein]
  s.rocks = [rock]
  s.director.alive.stalker = 1
  s.director.escapeT = 5.7
  s.fx.seq = 8
  s.fx.events = [fxEvent]
  s.ui.toasts = [toast]
  s.settings.loaded = true // C16: mid-run states have loaded settings
  s.best = best
  s.result = result
  return s
}

function sortedKeys(o: object): string {
  return Object.keys(o).sort().join(',')
}

// Runs fn with console.warn muted: migrate() warns on every version-mismatch reset, which is expected noise here.
function quietly(fn: () => void): void {
  const warn = console.warn
  console.warn = () => {}
  try { fn() } finally { console.warn = warn }
}

export function run(): void {
  // #1 init() is JSON-safe and round-trips
  const fresh = init()
  roundTrip(fresh, 'init()')
  ok(deepEq(init(), fresh), 'init() is deterministic (two calls deep-equal)')
  ok(init().ui !== init().ui, 'init() returns fresh objects each call')

  // mid-run fixture (the stepped state of #2 joins here once A29 lands startRun/step)
  const mid = midRunState()
  roundTrip(mid, 'mid-run state')

  // #3 migrate is idempotent on 7 inputs, never mutates them, and fills defaults
  const noRoll = structuredClone(mid) as unknown as { player: { roll?: unknown } }
  delete noRoll.player.roll
  const noStunned = structuredClone(mid) as unknown as { monsters: Record<string, unknown>[] }
  delete noStunned.monsters[0].stunned
  const noIssue113 = structuredClone(mid) as unknown as { monsters: Record<string, unknown>[] }
  for (const k of ISSUE_113_KEYS) delete noIssue113.monsters[0][k]
  const inputs: [string, unknown][] = [
    ['init()', init()], ['mid-run', mid], ['player.roll deleted', noRoll], ['monster.stunned deleted', noStunned],
    ['monster.issue-113 keys deleted', noIssue113],
    ['{ version: 0 }', { version: 0 }], ['null', null], ['5', 5],
  ]
  quietly(() => {
    for (const [name, x] of inputs) {
      const before = structuredClone(x)
      const once = migrate(x)
      ok(deepEq(x, before), `migrate does not mutate its input (${name})`)
      roundTrip(once, `migrate(${name})`)
      ok(deepEq(migrate(once), once), `migrate is idempotent (${name})`)
    }
    ok(deepEq(migrate(noRoll).player.roll, init().player.roll), 'migrate fills a deleted player.roll with its default')
    ok(migrate(noStunned).monsters[0].stunned === DEFAULT_MONSTER.stunned, 'migrate fills a missing monster.stunned with its default')
    ok(migrate(noStunned).monsters[0].x === monster.x, 'migrate keeps the other monster fields')
    const filled113 = migrate(noIssue113).monsters[0] as unknown as Record<string, unknown>
    ok(ISSUE_113_KEYS.every((k) => filled113[k] === (DEFAULT_MONSTER as Record<string, unknown>)[k]),
      'migrate fills the 14 deleted issue-113 monster keys with their defaults')
    // playtest-tuning-1b §5.6: suspectT and patience fill to 0 on old monsters, set values survive, idempotent
    const noF1 = structuredClone(mid) as unknown as { monsters: Record<string, unknown>[] }
    delete noF1.monsters[0].suspectT; delete noF1.monsters[0].patience
    const f1 = migrate(noF1)
    ok(f1.monsters[0].suspectT === 0 && f1.monsters[0].patience === 0, 'migrate fills a missing monster.suspectT and patience with 0')
    ok(deepEq(migrate(f1), f1), 'migrate is idempotent (monster.suspectT and patience deleted)')
    ok(migrate(mid).monsters[0].suspectT === 0.5 && migrate(mid).monsters[0].patience === 1.5, 'migrate keeps set suspectT and patience')
    const pz = T.monsters
    ok(T.ai.suspectMaxS === 2 && T.ai.noticeLitMarginPx === 80, 'T.ai.suspectMaxS 2, noticeLitMarginPx 80')
    ok(deepEq(pz.lurker.patienceS, [6, 5.5, 5, 4.5]) && deepEq(pz.stalker.patienceS, [0, 4, 3.5, 3]) && deepEq(pz.devourer.patienceS, [0, 0, 5, 4.5]),
      'T.monsters patienceS rows')
    for (const bad of [{ version: 0 }, null, 5]) ok(deepEq(migrate(bad), init()), `migrate(${JSON.stringify(bad)}) is init()`)

    // B2s: an old save without the rock/escape fields gets the defaults; set values survive
    const old = structuredClone(mid) as unknown as { world: Record<string, unknown>; director: Record<string, unknown>; rocks: Record<string, unknown>[] }
    delete old.world.pendingSig; delete old.director.escapeT; delete old.rocks[0].shrunk
    const up = migrate(old)
    ok(up.world.pendingSig === 0 && up.director.escapeT === 0 && up.rocks[0].shrunk === DEFAULT_ROCK.shrunk, 'migrate fills pendingSig, escapeT and rock.shrunk defaults')
    ok(up.rocks[0].t === rock.t && up.rocks[0].hit === rock.hit, 'migrate keeps the other rock fields')
    ok(deepEq(migrate(up), up), 'migrate is idempotent (rock/escape fields deleted)')
    ok(DEFAULT_ROCK.shrunk === false && init().world.pendingSig === 0 && init().director.escapeT === 0, 'B2s defaults: shrunk false, pendingSig 0, escapeT 0')
  })

  // B2s: T.rocks table (architecture-rocks.md §1-§4, tuning-2 §6)
  const r = T.rocks
  // playtest-tuning-1 §4 values (supersede economy-3 §3 and tuning-2 §6): harsher escape rocks
  ok(r.rateStart === 1.0 && r.rateEnd === 2.4 && r.rampS === 60 && r.minIntervalS === 0.3 && r.retryS === 0.25, 'T.rocks cadence values')
  ok(r.pendingMax === 6 && r.p2Start === 0.25 && r.p2End === 0.5 && r.routeModeP === 0.9 && r.lateralTiles === 1, 'T.rocks selection values')
  ok(r.lookahead === 36 && r.exitClearTiles === 5 && r.beaconClearTiles === 6 && r.playerGapPx === 16 && r.damageHp === 1, 'T.rocks clear-zone values')
  ok(r.detourMaxTiles === 12 && r.detourMaxFrac === 0.5 && r.bfsTestsMax === 5, 'T.rocks detour and BFS values')
  ok(!('rockIntervalS' in T.escape), 'T.escape.rockIntervalS is deleted (R-056)')

  // #4 migrate does not change valid values
  ok(deepEq(migrate(mid), mid), 'migrate(midRun) deep-equals midRun')
  ok(migrate(mid).monsters[0] !== mid.monsters[0], 'migrate returns new entity objects (no aliasing)')

  // #5 DEFAULT_* key sets equal the spawned entities (same keys, same value types)
  const pairs: [string, object, object][] = [
    ['monster', DEFAULT_MONSTER, mid.monsters[0]], ['pickup', DEFAULT_PICKUP, mid.pickups[0]], ['vein', DEFAULT_VEIN, mid.veins[0]],
    ['rock', DEFAULT_ROCK, mid.rocks[0]], ['fx event', DEFAULT_FX_EVENT, mid.fx.events[0]], ['toast', DEFAULT_TOAST, mid.ui.toasts[0]],
    ['best', DEFAULT_BEST, best], ['result', DEFAULT_RESULT, result],
  ]
  for (const [name, def, ent] of pairs) {
    ok(sortedKeys(def) === sortedKeys(ent), `DEFAULT_${name.toUpperCase().replace(' ', '_')} keys equal the ${name} keys`)
    for (const k of Object.keys(def)) {
      const d = (def as Record<string, unknown>)[k]
      const e = (ent as Record<string, unknown>)[k]
      ok(typeof d === typeof e && Array.isArray(d) === Array.isArray(e), `${name}.${k} default has the entity's value type`)
    }
  }

  // #6 budget: JSON under 300 000 chars (scale-and-economy-4 §1.1)
  ok(JSON.stringify(fresh).length < 300_000, 'init() JSON is under 300000 chars')
  ok(JSON.stringify(mid).length < 300_000, 'mid-run JSON is under 300000 chars')
}
