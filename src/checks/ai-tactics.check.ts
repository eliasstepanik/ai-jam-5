// Issue #113 B5 tactics check: patrol for unaware shades (AC3) and the AC7 light rules
// (a lit unaware/suspicious shade flees the light; patrol points are never lit).
// Spec: KB plan note ai-jam-5-issue-113-plan-2-steps-1-3, chunk 22 (B5 row).
// Later chunks append here (C6 retreat, D4, E3, F7); keep run() one small named function per rule.
// ponytail: movement rules drive the full step() with a stationary idle player so meta.steps advances
// (patrolBrain hashes on it; step.ts is the only steps writer). No timing budget here (env flake rule).
import type { Monster, State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { patrolBrain } from '../systems/ai-patrol.ts'
import { insideLight, lightRadius } from '../systems/light.ts'
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

export function run(): void {
  patrolBasics()
  patrolDeterminism()
  patrolRejectsLitPoints()
  patrolLight()
  fleeLight()
}
