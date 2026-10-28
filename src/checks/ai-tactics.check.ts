// Issue #113 B5 tactics check: patrol for unaware shades (AC3) and the AC7 light rules
// (a lit unaware/suspicious shade flees the light; patrol points are never lit).
// Spec: KB plan note ai-jam-5-issue-113-plan-2-steps-1-3, chunk 22 (B5 row).
// Later chunks append here (C6 retreat, D4, E3, F7); keep run() one small named function per rule.
// ponytail: movement rules drive the full step() with a stationary idle player so meta.steps advances
// (patrolBrain hashes on it; step.ts is the only steps writer). No timing budget here (env flake rule).
import type { Monster, MonsterKind, State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { patrolBrain } from '../systems/ai-patrol.ts'
import { insideLight, lightRadius } from '../systems/light.ts'
import { nearCount } from '../systems/ai-retreat.ts'
import { stepDirector } from '../systems/director.ts'
import { stepMonsters } from '../systems/monsters.ts'
import { clearCaches } from '../world/caches.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { circleHitsSolid } from '../world/collide.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60
const WINDOW = 600 // steps per patrol rule (plan B5)

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

const idle = { keys: new Set<string>(), pressed: new Set<string>(), mouse: { x: 0, y: 0, down: false }, clicks: [], view: { w: 640, h: 360, dpr: 1 } }

// Open floor (every tile floor), player mid-map, director silenced, descent phase
// (insideLight is true everywhere in escape). Distinct tilesHash so the solid cache rebuilds.
function field(): State {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.director.spawnT = 1e9
  s.meta.phase = 'descent'
  Object.assign(s, { monsters: [], pickups: [] })
  s.meta.nextId = 72 // pin the monster id: patrolBrain hashes on it, and startRun's pickup ids moved it with the resin layout
  const w = s.world.w
  s.world.tiles = '.'.repeat(w).repeat(s.world.h)
  s.world.tilesHash = 6201
  s.player.x = w * 16
  s.player.y = s.world.h * 16
  return s
}

// A lurker at player + (dx, dy), facing +x (a player on its -x side stays outside the cone), lunges off.
function place(s: State, dx: number, awareness: Monster['awareness'], dy = 0): Monster {
  const m = spawnMonster(s, 'lurker', s.player.x + dx, s.player.y + dy, lightRadius(s))
  m.awareness = awareness
  m.facing = 0
  m.lungeCd = 1e9
  return m
}

const dist = (s: State, m: Monster): number => Math.hypot(m.x - s.player.x, m.y - s.player.y)
const homeDist = (m: Monster): number => Math.hypot(m.x - m.homeX, m.y - m.homeY)

// Longest run of consecutive true flags; push() resets on every false (a break), never on a mere
// new max (retrospect F1: carry-over let separate stretches add up). Self-tested in run().
const runTracker = () => { let run = 0, best = 0; return { push(bad: boolean) { run = bad ? run + 1 : 0; if (run > best) best = run }, max: () => best } }

// AC3: an unaware shade far from the player (out of sight and sound) patrols near home,
// stays in the dark and off solids, pauses between legs.
function patrolBasics(): void {
  const s = field()
  const m = place(s, 380, 'unaware') // > viewRange; the whole patrol disc (380 - patrolRadius) is dark
  ok(!insideLight(s, m.x, m.y), 'AC3 fixture: patrol home starts in the dark')
  let moved = 0
  let pauseSteps = 0
  let wasMoving = false
  let prevX = m.x
  let prevY = m.y
  for (let k = 0; k < WINDOW; k++) {
    step(s, idle, DT)
    ok(homeDist(m) <= T.ai.patrolRadius + 16, 'AC3 patrol stays within patrolRadius + 16 of home (step ' + k + ')')
    ok(!circleHitsSolid(s, m.x, m.y, T.monsters.lurker.radiusPx), 'AC3 patrol never ends a step inside a solid (step ' + k + ')')
    ok(!insideLight(s, m.x, m.y), 'AC3 the dark-area patroller never enters the light (step ' + k + ')')
    const d = Math.hypot(m.x - prevX, m.y - prevY)
    moved += d
    if (d > 0.05) wasMoving = true
    else if (wasMoving) pauseSteps++
    prevX = m.x
    prevY = m.y
  }
  ok(moved > 100, 'AC3 the shade actually moves (' + Math.round(moved) + ' px over ' + WINDOW + ' steps)')
  ok(pauseSteps >= 30, 'AC3 pauses exist after movement (' + pauseSteps + ' near-still steps, patrolPauseT = ' + Math.round(T.ai.patrolPauseT / DT) + ')')
  ok(m.awareness === 'unaware', 'AC3 the shade stays unaware (player out of sight and sound)')
}

// One patrol run as a position trace; the full step() advances meta.steps, the patrolBrain hash input.
function patrolTrace(dx: number): string {
  const s = field()
  const m = place(s, dx, 'unaware')
  const out: string[] = []
  for (let k = 0; k < WINDOW; k++) {
    step(s, idle, DT)
    out.push(m.x.toFixed(2) + ',' + m.y.toFixed(2))
  }
  return out.join('\n')
}

// AC3: two identical runs produce identical position traces (and the trace is not vacuous).
function patrolDeterminism(): void {
  const a = patrolTrace(380)
  const b = patrolTrace(380)
  ok(a === b, 'AC3 two identical runs give identical position traces')
  ok(new Set(a.split('\n')).size > 100, 'AC3 the traced run actually moves')
}

// AC7 (patrol half): the light covers part of the patrol disc; lit patrol points are rejected,
// so the patroller never ends a step inside the light and no chosen patrol point is lit.
// Awareness may oscillate (the patrol disc reaches viewRange); the rules below hold either way.
function patrolLight(): void {
  const s = field()
  const R = lightRadius(s)
  const m = place(s, R + 110, 'unaware') // home dark and beyond viewRange; patrol disc overlaps the light disc
  ok(!insideLight(s, m.x, m.y), 'AC7 fixture: patrol home is outside the light')
  ok(R + 110 - T.ai.patrolRadius < R, 'AC7 fixture: the light covers part of the patrol disc')
  let walked = 0
  for (let k = 0; k < WINDOW; k++) {
    step(s, idle, DT)
    ok(!insideLight(s, m.x, m.y), 'AC7 a patrolling shade never ends a step inside the light (step ' + k + ')')
    if (m.patrolT < 0) {
      walked++
      ok(!insideLight(s, m.patrolX, m.patrolY), 'AC7 a chosen patrol point is never lit (step ' + k + ')')
    }
  }
  ok(walked > 60, 'AC7 the patroller actually walks patrol legs (' + walked + ' walking steps)')
}

// AC7 (flee half): a lit unaware or suspicious shade flees the light (chunk-21 dispatch),
// never steps closer while lit, and ends outside the light clearly farther from the player.
// The suspicious fixture re-arms detectionTimer each step to keep it inside (0, noticeT)
// so stepAwareness cannot demote it before the dispatch runs.
function fleeLight(): void {
  for (const awareness of ['unaware', 'suspicious'] as const) {
    const s = field()
    const m = place(s, 0.5 * lightRadius(s), awareness)
    ok(insideLight(s, m.x, m.y), 'AC7 fixture: the ' + awareness + ' shade starts inside the light')
    const d0 = dist(s, m)
    let prev = d0
    for (let k = 0; k < 150; k++) {
      if (awareness === 'suspicious') m.detectionTimer = T.ai.noticeT / 2
      step(s, idle, DT)
      const d = dist(s, m)
      if (insideLight(s, m.x, m.y)) ok(d >= prev - 1e-9, 'AC7 a lit ' + awareness + ' shade never steps closer while lit (step ' + k + ')')
      prev = d
    }
    ok(!insideLight(s, m.x, m.y) || dist(s, m) > d0, 'AC7 the ' + awareness + ' shade ends outside the light or farther than it started')
    ok(dist(s, m) > d0 + 40, 'AC7 the ' + awareness + ' shade ends clearly farther from the player (' + Math.round(dist(s, m)) + ' > ' + Math.round(d0) + ')')
  }
}

// AC7 (reject unit rule): with the patrol home inside the light disc edge most candidates are lit;
// patrolBrain must still only ever choose unlit, free points. Direct call (like ai-awareness unit
// rules); s.meta.steps is bumped per pick here only to vary the patrolBrain hash (step.ts is the
// sim's sole steps writer). Mutation: drop the insideLight reject in ai-patrol.ts -> red.
function patrolRejectsLitPoints(): void {
  const s = field()
  const R = lightRadius(s)
  const m = place(s, 0.9 * R, 'unaware') // home inside the light edge: a wide share of candidates is lit
  ok(insideLight(s, m.homeX, m.homeY), 'AC7 fixture: patrol home sits inside the light edge')
  let picks = 0
  for (let k = 0; k < 60; k++) {
    s.meta.steps += 1
    m.patrolT = 0
    patrolBrain(s, m)
    if (m.patrolT < 0) {
      picks++
      ok(!circleHitsSolid(s, m.patrolX, m.patrolY, T.monsters.lurker.radiusPx), 'AC7 patrol point is never solid (pick ' + k + ')')
      ok(!insideLight(s, m.patrolX, m.patrolY), 'AC7 patrol point is never lit (pick ' + k + ')')
    }
  }
  ok(picks > 20, 'AC7 fixture: patrolBrain chose points often enough (' + picks + '/60)')
}

// ---- C6 (issue #113 step 3): flame scatter, retreat after recover, near cap ----
// C4(b)/AC7 flame trigger, probed through stepMonsters directly (step() burns energy before
// stepMonsters, so a threshold probe must pin the energy itself). Strict > flameRetreat; devourers
// exempt; escape never retreats (mutation: drop the energy gate -> the threshold loop goes red).
function flameRetreatRules(): void {
  const probe = (energy: number, kind: MonsterKind, esc: boolean): number => {
    const s = field()
    s.player.energy = energy
    if (esc) s.meta.phase = 'escape'
    const m = spawnMonster(s, kind, s.player.x + 200, s.player.y, lightRadius(s))
    m.awareness = 'hunting'
    m.lungeCd = 1e9
    stepMonsters(s, DT)
    return m.retreatT
  }
  ok(probe(100, 'lurker', false) >= T.ai.retreatT - DT, 'AC1: full flame scatters a hunting shade inside nearRadius')
  ok(probe(100, 'devourer', false) === 0, 'AC1: devourers never flee the flame')
  ok(probe(100, 'lurker', true) === 0, 'AC1: the escape phase never retreats')
  const s = field()
  s.player.energy = T.ai.flameRetreat // exactly the threshold; step() only burns it down from here
  const m = place(s, 200, 'hunting')
  for (let k = 0; k < 300; k++) { step(s, idle, DT); ok(m.retreatT === 0, 'AC7: energy <= flameRetreat never starts a retreat (step ' + k + ')') }
}

// C4(c): a forced recover exit starts the retreat at full retreatT and the shade grows distant
// until it ends; devourer recover exits stay exempt.
function recoverExitRetreat(): void {
  const s = field()
  s.player.energy = T.ai.flameRetreat // only the recover exit may start a retreat here
  const m = place(s, 200, 'hunting')
  m.ai = 'recover'
  m.aiDur = 0 // the next pipeline step exits recover
  stepMonsters(s, DT)
  ok((m.ai as string) === 'ring' && m.retreatT === T.ai.retreatT, 'recover exit starts the retreat at full retreatT') // cast: stepMonsters mutates m.ai; narrowing cannot see through the call
  const d0 = dist(s, m)
  let k = 0
  while (m.retreatT > 0 && k < 600) { stepMonsters(s, DT); k++ }
  ok(m.retreatT === 0 && dist(s, m) > d0 + 40, 'the retreat ends with the shade clearly farther away')
  const dv = spawnMonster(s, 'devourer', s.player.x + 200, s.player.y, lightRadius(s))
  dv.awareness = 'hunting'; dv.ai = 'recover'; dv.aiDur = 0
  stepMonsters(s, DT)
  ok(dv.retreatT === 0, 'a devourer recover exit never retreats')
}

// C5 excess enforcement: with > nearCap hunting shades inside nearRadius (flame out) the extras in
// array order start retreating and the near count falls to the cap; the cap never removes monsters.
function nearCapExcess(): void {
  const s = field()
  s.player.energy = T.ai.flameRetreat // flame trigger out; only the C5 block may retreat anyone
  const ms = [0, 1, 2, 3].map((i) => place(s, 200 + i * 20, 'hunting'))
  ok(nearCount(s) === 4 && 4 > T.director.nearCap, 'C5 fixture: more than nearCap shades near')
  stepDirector(s, DT)
  ok(ms[0].retreatT === 0 && ms[1].retreatT === 0, 'C5: the first nearCap shades keep their orbit')
  ok(ms[2].retreatT === T.ai.retreatT && ms[3].retreatT === T.ai.retreatT, 'C5: the excess shades start retreating')
  let k = 0
  while (nearCount(s) > T.director.nearCap && k < 180) { step(s, idle, DT); k++ }
  ok(nearCount(s) <= T.director.nearCap, 'C5: near count falls to <= nearCap within ' + k + ' steps')
  ok(s.monsters.length === 4, 'C5: the cap never removes monsters')
}

// C5 spawn refusal: descent refuses while nearCount >= nearCap; escape stays relentless
// (mutation: drop the !esc gate on the refusal -> the escape assert goes red).
function nearCapSpawnRefusal(): void {
  const s = field()
  place(s, 100, 'hunting'); place(s, 150, 'hunting')
  s.director.spawnT = 0
  const n = s.monsters.length
  stepDirector(s, DT)
  ok(nearCount(s) >= T.director.nearCap && s.monsters.length === n, 'descent: no director spawn while nearCount >= nearCap')
  const e = field()
  e.meta.phase = 'escape'
  e.world.exit = { tx: 5, ty: 5 }
  clearCaches()
  spawnMonster(e, 'lurker', e.player.x + 100, e.player.y, 0); spawnMonster(e, 'lurker', e.player.x + 150, e.player.y, 0)
  e.director.spawnT = 0
  const n0 = e.monsters.length
  stepDirector(e, DT)
  ok(nearCount(e) >= T.director.nearCap && e.monsters.length > n0, 'escape: the near-cap refusal is inert, a spawn happened')
}

// AC1 + AC4 on a real cave (seed 1, director live, no spawnT silencing): full flame held at 100 for
// 4000 steps with a walking player (turn left every 60 steps - "a normal run"; the idle player
// never breaks the parked-shade ring). Reports the measured first-spawn step N.
function caveFullFlameRun(): string {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true; s.meta.phase = 'descent'; s.debug.god = true
  let first = -1, sum = 0
  const gapT = runTracker(), overT = runTracker()
  for (let k = 1; k <= 4000; k++) {
    s.player.energy = 100 // full flame held (stepFlame burns it back down each step)
    step(s, { ...idle, keys: new Set([['KeyD', 'KeyS', 'KeyA', 'KeyW'][Math.floor(k / 60) % 4]]) }, DT)
    if (first < 0 && s.monsters.length > 0) first = k
    const n = nearCount(s)
    sum = (sum * 31 + n * 8 + s.monsters.length) | 0
    gapT.push(first > 0 && n === 0)
    overT.push(n > T.director.nearCap)
  }
  ok(first >= 1 && 2 * first <= 4000, 'AC1 cave seed 1: first director spawn at step ' + first + ' (2N <= 4000)')
  ok(gapT.max() >= 180, 'AC1: full flame keeps a >= 180-step stretch with nobody within nearRadius (max ' + gapT.max() + ')')
  ok(overT.max() <= 120, 'AC4: nearCount never stays above nearCap for > 120 steps (max over-run ' + overT.max() + ')')
  return sum + '|' + s.monsters.map((m) => m.x.toFixed(1) + ',' + m.y.toFixed(1)).join(';')
}

export function run(): void {
  const t = runTracker()
  for (const b of [true, true, false, true, true, false, true, true]) t.push(b)
  ok(t.max() === 2, 'runTracker: [1,1,0,1,1,0,1,1] longest run is 2, not 6')
  patrolBasics()
  patrolDeterminism()
  patrolRejectsLitPoints()
  patrolLight()
  fleeLight()
  flameRetreatRules()
  recoverExitRetreat()
  nearCapExcess()
  nearCapSpawnRefusal()
  const t1 = caveFullFlameRun()
  ok(t1 === caveFullFlameRun(), 'C6: two identical cave runs produce identical traces')
}
