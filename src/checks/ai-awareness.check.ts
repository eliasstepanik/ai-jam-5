// Issue #113 A6 awareness check: notice / lose / search timings, cone + wall + hearing gates, frozen states, escape override,
// determinism, the 24-shade budget and the AC7 light rule for searching shades.
// Spec: KB plan note ai-jam-5-issue-113-plan-2-steps-1-3, chunk 20 (A6 row). R-039/R-040: local ok(), `export function run(): void`,
// no import-time work, no DOM, no node: imports, no L4 imports.
// ponytail: unit rules (1-6, 9, 10) call stepAwareness directly on a hand-placed shade (no movement, exact step counts);
// rules 7, 8 and 11 need motion and go through stepMonsters / step(). The player is stationary unless a rule says otherwise.
import type { Monster, MonsterAi, State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { stepAwareness } from '../systems/awareness.ts'
import { findSpawn } from '../systems/director.ts'
import { insideLight, lightRadius } from '../systems/light.ts'
import { stepMonsters } from '../systems/monsters.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60
const BUDGET_MS = 1000 // same bound as ai.check.ts (monsters-ai-2 §8): 3 600 steps with 24 shades
const TOL = 2 // steps: accumulated float dt may land a step either side of the exact threshold
const NOTICE = Math.round(T.ai.noticeT / DT)
const LOSE = Math.round(T.ai.loseT / DT)
const SEARCH = Math.round(T.ai.searchT / DT)
const WALL_TX = 158 // full-height wall column, left of the player tile (160)

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

const idle = { keys: new Set<string>(), pressed: new Set<string>(), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 } }

// Open floor (every tile floor), player mid-map, director silenced, descent phase (insideLight is true everywhere in escape).
// wall: one solid column at tile WALL_TX. tilesHash differs per layout so the solid cache rebuilds.
function field(wall = false): State {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.director.spawnT = 1e9
  s.meta.phase = 'descent'
  Object.assign(s, { monsters: [], pickups: [] })
  const w = s.world.w
  const row = '.'.repeat(WALL_TX) + (wall ? '#' : '.') + '.'.repeat(w - WALL_TX - 1)
  s.world.tiles = row.repeat(s.world.h)
  s.world.tilesHash = wall ? 6102 : 6101
  s.player.x = w * 16
  s.player.y = s.world.h * 16
  return s
}

// A lurker at player + (dx, dy), facing +x, lunges off (stepMonsters rules must not turn into a bite).
function place(s: State, dx: number, awareness: Monster['awareness'], dy = 0): Monster {
  const m = spawnMonster(s, 'lurker', s.player.x + dx, s.player.y + dy, lightRadius(s))
  m.awareness = awareness
  m.facing = 0
  m.lungeCd = 1e9
  return m
}

// Steps stepAwareness until pred() holds; returns the 1-based step count, -1 if never within max.
function until(s: State, m: Monster, max: number, pred: () => boolean): number {
  for (let k = 1; k <= max; k++) {
    stepAwareness(s, m, DT)
    if (pred()) return k
  }
  return -1
}

const within = (n: number, target: number): boolean => n >= target - TOL && n <= target + TOL

function notice(): void {
  // (1) in range + cone + LOS: suspicious first, hunting after noticeT
  let s = field()
  let m = place(s, -150, 'unaware')
  stepAwareness(s, m, DT)
  ok(m.awareness === 'suspicious', '(1) a seen shade turns suspicious on the first step')
  const n = until(s, m, 200, () => m.awareness === 'hunting')
  ok(within(n, NOTICE - 1), '(1) notice after noticeT (' + NOTICE + ' steps), got ' + n)
  ok(m.detectionTimer === 0 && m.lastKnownX === s.player.x, '(1) noticing resets the meter and records the player')
  // (2) wall between: never notices over 300 steps
  s = field(true)
  m = place(s, -150, 'unaware')
  ok(until(s, m, 300, () => m.awareness !== 'unaware') === -1 && m.detectionTimer === 0, '(2) a wall blocks sight for 300 steps')
  // (3) player behind (outside the cone, in range, no wall)
  s = field()
  m = place(s, 150, 'unaware')
  ok(until(s, m, 300, () => m.awareness !== 'unaware') === -1, '(3) a player behind the shade is not noticed')
}

function hearing(): void {
  // (4) fast player inside hearRadius, behind the shade (not seen): notice at ~2x noticeT
  let s = field()
  s.player.vx = T.ai.hearSpeed + 40
  let m = place(s, 60, 'unaware')
  const n = until(s, m, 300, () => m.awareness === 'hunting')
  ok(within(n, 2 * NOTICE - 1), '(4) heard notice at ~2x noticeT (' + 2 * NOTICE + ' steps), got ' + n)
  // slower than hearSpeed never; fast but outside hearRadius never
  s = field()
  s.player.vx = T.ai.hearSpeed - 10
  m = place(s, 60, 'unaware')
  ok(until(s, m, 300, () => m.awareness !== 'unaware') === -1, '(4) a slow player is never heard')
  s = field()
  s.player.vx = T.ai.hearSpeed + 40
  m = place(s, T.ai.hearRadius + 40, 'unaware')
  ok(until(s, m, 300, () => m.awareness !== 'unaware') === -1, '(4) a fast player outside hearRadius is never heard')
}

function loseAndSearch(): void {
  // (5) hunting sees the player (lastKnown follows), then the player vanishes out of range: searching after loseT
  let s = field()
  let m = place(s, -150, 'hunting')
  for (let k = 0; k < 10; k++) stepAwareness(s, m, DT)
  const seenX = s.player.x, seenY = s.player.y
  ok(m.awareness === 'hunting' && m.lastKnownX === seenX && m.lastKnownY === seenY, '(5) a hunter that senses the player stays hunting and tracks lastKnown')
  s.player.x += 600 // beyond viewRange * 1.5
  const n = until(s, m, 300, () => m.awareness === 'searching')
  ok(within(n, LOSE), '(5) searching after loseT (' + LOSE + ' steps), got ' + n)
  ok(m.lastKnownX === seenX && m.lastKnownY === seenY, '(5) lastKnown is the last seen position')
  ok(m.searchT === T.ai.searchT && m.detectionTimer === 0, '(5) the search budget starts full')
  // sensing blocked by a wall (player still close): same transition, lastKnown untouched
  s = field(true)
  m = place(s, -150, 'hunting')
  m.lastKnownX = 111
  m.lastKnownY = 222
  ok(within(until(s, m, 300, () => m.awareness === 'searching'), LOSE), '(5) a wall between loses the hunt after loseT')
  ok(m.lastKnownX === 111 && m.lastKnownY === 222, '(5) a blocked hunter never updates lastKnown')
  // (6) searching gives up after searchT: unaware, home = where it stands now
  s = field()
  m = place(s, 600, 'searching')
  m.searchT = T.ai.searchT
  m.patrolT = 5
  m.detectionTimer = 0.3
  for (let k = 0; k < 100; k++) stepAwareness(s, m, DT)
  ok(m.awareness === 'searching', '(6) still searching mid-budget')
  m.x -= 37 // moved while searching: home must be the position at give-up time
  m.y += 11
  const g = until(s, m, 400, () => m.awareness === 'unaware')
  ok(within(g + 100, SEARCH), '(6) gives up after searchT (' + SEARCH + ' steps), got ' + (g + 100))
  ok(m.homeX === m.x && m.homeY === m.y && m.patrolT === 0 && m.detectionTimer === 0, '(6) home is the give-up position, patrol reset')
}

function frozen(): void {
  // (9) frozen ai states and fleeing never change awareness; (10) escape forces hunting
  const states: MonsterAi[] = ['windup', 'lunge', 'recover', 'stunned', 'dying']
  for (const ai of [...states, 'fleeing' as const]) {
    const s = field()
    const seen = place(s, -150, 'unaware') // would notice the player
    const lost = place(s, 600, 'hunting') // would start searching
    const gone = place(s, 600, 'searching') // would give up
    gone.searchT = T.ai.searchT
    for (const m of [seen, lost, gone]) {
      if (ai === 'fleeing') m.fleeing = true
      else m.ai = ai
    }
    for (let k = 0; k < SEARCH + 40; k++) for (const m of [seen, lost, gone]) stepAwareness(s, m, DT)
    ok(seen.awareness === 'unaware' && seen.detectionTimer === 0, '(9) ' + ai + ': a frozen unaware shade never notices')
    ok(lost.awareness === 'hunting' && lost.detectionTimer === 0, '(9) ' + ai + ': a frozen hunter never loses the player')
    ok(gone.awareness === 'searching' && gone.searchT === T.ai.searchT, '(9) ' + ai + ': a frozen searcher keeps its budget')
  }
  const s = field()
  s.meta.phase = 'escape'
  const ms = (['unaware', 'suspicious', 'searching', 'hunting'] as const).map((a, i) => place(s, i % 2 ? 600 : -150, a))
  for (const m of ms) stepAwareness(s, m, DT)
  ok(ms.every((m) => m.awareness === 'hunting'), '(10) escape forces every shade to hunting')
  for (let k = 0; k < SEARCH + 40; k++) for (const m of ms) stepAwareness(s, m, DT)
  ok(ms.every((m) => m.awareness === 'hunting'), '(10) escape keeps them hunting with the player out of sight')
}

// Six shades with mixed awareness, the player walking a sine; one full field sequence as a string.
function trace(): string {
  const s = field()
  const ms = [place(s, -150, 'unaware'), place(s, 150, 'unaware'), place(s, 600, 'hunting'),
    place(s, 80, 'searching', 40), place(s, -250, 'suspicious'), place(s, 0, 'hunting', 300)]
  ms[3].searchT = T.ai.searchT
  const out: string[] = []
  for (let k = 0; k < 600; k++) {
    s.player.vx = 120 * Math.cos(k / 50)
    s.player.x += s.player.vx * DT
    stepMonsters(s, DT)
    for (const m of ms) {
      out.push([m.awareness, m.detectionTimer, m.x, m.y, m.lastKnownX, m.lastKnownY, m.searchT, m.homeX, m.homeY, m.facing].join(','))
    }
  }
  return out.join('\n')
}

function determinism(): void {
  // (7) two identical runs, identical field sequences (and the run is not vacuous: awareness changes)
  const a = trace(), b = trace()
  ok(a === b, '(7) two identical runs give identical field sequences')
  ok(new Set(a.split('\n').map((l) => l.split(',')[0])).size >= 3, '(7) the traced run visits at least 3 awareness states')
}

// (8) 24 shades in the real cave, awareness mixed by id, topped up every step; god mode so bites never end the run.
function budget(): void {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.director.spawnT = 1e9
  s.debug.god = true
  const n = T.director.monstersMax
  const kinds = ['hunting', 'unaware', 'searching', 'suspicious'] as const
  const t0 = performance.now()
  for (let k = 0; k < 3600; k++) {
    while (s.monsters.length < n) {
      const pos = findSpawn(s, 'lurker') ?? { x: s.player.x + 30, y: s.player.y }
      const m = spawnMonster(s, 'lurker', pos.x, pos.y, lightRadius(s))
      m.awareness = kinds[m.id % kinds.length]
      m.searchT = T.ai.searchT
    }
    step(s, idle, DT)
  }
  const ms = performance.now() - t0
  ok(s.meta.steps === 3600 && s.meta.screen === 'playing' && s.monsters.length > 0, '(8) 3 600 steps simulated with shades alive')
  ok(ms < BUDGET_MS, '(8) 3 600 steps with ' + n + ' shades in ' + ms + ' ms (budget ' + BUDGET_MS + ' ms)')
}

// (11) AC7: a searching shade stays out of the player's light. Descent phase (escape lights the whole map).
function light(): void {
  const s = field()
  const R = lightRadius(s)
  const dist = (m: Monster): number => Math.hypot(m.x - s.player.x, m.y - s.player.y)
  // inside the light, lastKnown deeper inside: it must back away, never closer than where it started
  const a = place(s, 0.5 * R, 'searching')
  a.searchT = T.ai.searchT
  a.lastKnownX = s.player.x + 0.1 * R
  a.lastKnownY = s.player.y
  ok(insideLight(s, a.x, a.y) && insideLight(s, a.lastKnownX, a.lastKnownY), '(11) fixture: shade and lastKnown start inside the light')
  const d0 = dist(a)
  let closest = d0
  for (let k = 0; k < 120; k++) {
    stepMonsters(s, DT)
    closest = Math.min(closest, dist(a))
  }
  ok(closest >= d0 - 1e-9, '(11) a searching shade in the light never ends a step closer than the window start (' + closest + ' < ' + d0 + ')')
  ok(dist(a) >= d0 && a.awareness === 'searching', '(11) it ends the window no closer to the player and still searching')
  // outside the light, lastKnown inside it: the shade must not walk in (never ends a step inside over 300 steps)
  s.monsters.length = 0
  const b = place(s, 1.2 * R, 'searching')
  b.searchT = T.ai.searchT
  b.lastKnownX = s.player.x + 0.3 * R
  b.lastKnownY = s.player.y
  ok(!insideLight(s, b.x, b.y) && insideLight(s, b.lastKnownX, b.lastKnownY), '(11) fixture: shade starts outside the light, lastKnown inside')
  for (let k = 0; k < 300; k++) {
    stepMonsters(s, DT)
    ok(!insideLight(s, b.x, b.y), '(11) a searching shade outside the light never ends a step inside it (step ' + k + ')')
  }
  ok(b.awareness === 'searching', '(11) the outside shade kept searching (budget is longer than the window)')
}

export function run(): void {
  notice()
  hearing()
  loseAndSearch()
  frozen()
  determinism()
  light()
  budget() // last: wall-clock rule, kept after the logic rules so a timing flake never masks them
}
