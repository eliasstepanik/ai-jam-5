// Issue #113 D4 (chunk 33): descent spawns are out of the player's sight, and the post-encounter
// calm period holds. Continuation of ai-tactics.check.ts (300-line cap); later chunks (E3, F7)
// append here as further small named functions called from run().
// Spec: KB plan note ai-jam-5-issue-113-plan-3-steps-4-7, chunk 33 (D4 row).
// ponytail: spawn detection diffs the monster array across a full step() (director runs inside it);
// upgrade path: call stepDirector directly if a spawn-time-exact probe is ever needed.
import type { Monster, State } from '../core/types.ts'
import { wrapPi } from '../core/math.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { insideLight, lightRadius } from '../systems/light.ts'
import { lineOfSightPx } from '../world/los.ts'
import { stepDirector } from '../systems/director.ts'
import { stepMonsters } from '../systems/monsters.ts'
import { startRun } from '../systems/run.ts'
import { step } from '../systems/step.ts'
import { caveOf } from './caves.ts'
import { scriptedInput } from './input.ts'

const DT = 1 / 60
const STEPS = 4000 // plan D4: 4000 descent steps, require 2*N <= STEPS for the first spawn N

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

// D4(1)+(3): cave seed 1, descent, director live (NO spawnT silencing), full flame held at 100,
// walking player (scriptedInput), god mode so the run never ends. Every monster that appears
// across a step is a director spawn (the only spawner here); at that step it must be outside the
// player's line of sight (lineOfSightPx) and outside lightRadius. Returns first-N + spawn trace.
// Mutation: remove the lineOfSightPx reject in director.ts findSpawn -> the LOS assert goes red.
function spawnOutOfSightRun(): string {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.meta.phase = 'descent'
  s.debug.god = true
  let first = -1
  const trace: string[] = []
  let before = new Set<Monster>(s.monsters)
  for (let k = 1; k <= STEPS; k++) {
    s.player.energy = 100 // full flame held (stepFlame burns it back down each step)
    step(s, scriptedInput(k), DT)
    for (const m of s.monsters) {
      if (before.has(m)) continue
      if (first < 0) first = k
      const R = lightRadius(s)
      const d = Math.hypot(m.x - s.player.x, m.y - s.player.y)
      ok(!lineOfSightPx(s, s.player.x, s.player.y, m.x, m.y), 'D4: the spawn at step ' + k + ' is inside the player line of sight')
      ok(!insideLight(s, m.x, m.y), 'D4: the spawn at step ' + k + ' is inside the light (' + Math.round(d) + ' <= ' + Math.round(R) + ' px)')
      trace.push(k + ':' + m.x.toFixed(1) + ',' + m.y.toFixed(1))
    }
    before = new Set(s.monsters)
  }
  ok(first >= 1, 'D4: at least 1 director spawn in ' + STEPS + ' steps')
  ok(2 * first <= STEPS, 'D4: first spawn at step ' + first + ' must satisfy 2*N <= ' + STEPS)
  return first + '|' + trace.join(';')
}

// D4(2): after a forced recover-exit retreat (monsters.ts C4(c)/(d)) the director stays calm:
// spawnT is floored at calmS and no spawn happens for calmS seconds. spawnT = 0 before the exit
// pins the floor (the interval at zone 0 is 4 s < calmS 6 s, so without the floor a spawn lands
// inside the window). Mutation: remove the calmS floor in monsters.ts -> both asserts go red.
function calmAfterRecoverExit(): void {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.meta.phase = 'descent'
  const m = spawnMonster(s, 'lurker', s.player.x + 200, s.player.y, lightRadius(s))
  m.awareness = 'hunting'
  m.ai = 'recover'
  m.aiDur = 0 // the next stepMonsters exits recover
  s.director.spawnT = 0
  stepMonsters(s, DT)
  ok((m.ai as string) === 'ring' && m.retreatT === T.ai.retreatT, 'D4 fixture: the recover exit started the retreat') // cast: stepMonsters mutates m.ai; narrowing cannot see through the call
  ok(s.director.spawnT >= T.director.calmS - DT, 'D4: spawnT floored at calmS after the recover exit (' + s.director.spawnT.toFixed(3) + ')')
  const n0 = s.monsters.length
  let elapsed = 0
  while (elapsed < T.director.calmS - DT) {
    stepDirector(s, DT)
    stepMonsters(s, DT)
    elapsed += DT
    ok(s.director.spawnT >= T.director.calmS - elapsed - 1e-9, 'D4: spawnT stays >= calmS - elapsed through the calm window (t=' + elapsed.toFixed(2) + ')')
    ok(s.monsters.length === n0, 'D4: no director spawn during the calm window (t=' + elapsed.toFixed(2) + ')')
  }
}

// E3 (chunk 34): the stalker commits its approach angle (latch) and holds while the player looks at
// it. Tactics-level counterpart of the brain-level rows in ai.check.ts stalker(): driven through
// stepMonsters, not by calling the brain directly. Spec: KB plan note
// ai-jam-5-issue-113-plan-3-steps-4-7, chunk 34 (E3 row); issue AC5.

// Open arena mirroring ai.check.ts arena(): every tile floor (LOS always clear, so hunting is never
// lost mid-test), player mid-map, director silenced. The cave fixture would risk LOS-blocked
// hunting loss (loseT is only 1 s). energy 50 < flameRetreat 80: no C4(b) near-flame retreat.
// ponytail: duplicated from ai.check.ts (checks cannot import each other); upgrade: a shared
// checks/arena.ts helper if a third copy appears.
function stalkerArena(): State {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.meta.phase = 'descent'
  s.director.spawnT = 1e9
  Object.assign(s, { monsters: [], pickups: [] })
  s.world.tiles = '.'.repeat(s.world.w * s.world.h)
  s.world.tilesHash = 31
  s.player.x = s.world.w * 16
  s.player.y = s.world.h * 16
  s.player.energy = 50
  return s
}

const huntStalker = (s: State): Monster => {
  const m = spawnMonster(s, 'stalker', s.player.x + 300, s.player.y, lightRadius(s))
  m.awareness = 'hunting'
  m.ai = 'stalk'
  return m
}

// E3(1): the player spins (facing changes every step); the committed stalkAngle must stay constant
// for the whole stalkCommitT window (48 steps, +-2 for the stalkT float countdown) and only then
// re-pick from the then-current facing - no per-step re-orientation. The per-step trace
// (stalkAngle + position) also feeds the determinism compare in run().
// Mutation: remove the latch in ai-stalker.ts (always re-pick) -> the hold-window assert goes red.
function stalkerSpinRun(): string {
  const s = stalkerArena()
  const m = huntStalker(s)
  const win = Math.round(T.ai.stalkCommitT / DT) // 48 steps
  let committed = NaN
  let firstChange = -1
  let facingAtChange = NaN
  const trace: string[] = []
  for (let k = 1; k <= win + 6; k++) {
    s.player.facing = k * 0.07 // spin: a new facing every step
    stepMonsters(s, DT)
    if (Number.isNaN(committed)) committed = m.stalkAngle
    else if (firstChange < 0 && m.stalkAngle !== committed) { firstChange = k; facingAtChange = s.player.facing }
    trace.push(k + ':' + m.stalkAngle.toFixed(6) + ':' + m.x.toFixed(2) + ',' + m.y.toFixed(2))
  }
  ok(firstChange >= win - 2, 'E3 latch: stalkAngle changed at step ' + firstChange + ', must hold through step ' + (win - 2))
  ok(firstChange <= win + 2, 'E3 latch: stalkAngle changed at step ' + firstChange + ', must re-pick by step ' + (win + 2))
  ok(m.stalkAngle === wrapPi(facingAtChange + Math.PI), 'E3 latch: the re-pick commits the facing at the re-pick step + PI')
  return trace.join(';')
}

// E3(2): direction-sensitive hold, one shade, one spot: while the player looks at it (isBehind
// false) it does not advance at all over 60 steps; with the player's back turned the same shade
// closes on its ring point. Mutation: remove the !isBehind hold in ai-stalker.ts -> the hold assert goes red.
function holdWhenLookedAt(): void {
  const s = stalkerArena()
  const m = huntStalker(s)
  s.player.facing = 0 // the shade sits due east (theta 0): the player looks straight at it
  const x0 = m.x
  const y0 = m.y
  for (let k = 0; k < 60; k++) stepMonsters(s, DT)
  ok(m.x === x0 && m.y === y0, 'E3 hold: the stalker did not advance while looked at (moved ' + Math.hypot(m.x - x0, m.y - y0).toFixed(3) + ' px in 60 steps)')
  s.player.facing = Math.PI // back turned: the same shade is now behind (off PI > 110 deg)
  for (let k = 0; k < 60; k++) stepMonsters(s, DT)
  const d1 = Math.hypot(m.x - s.player.x, m.y - s.player.y)
  ok(d1 < 300 - 10, 'E3 hold: with the player facing away the stalker closes on its ring (d ' + d1.toFixed(1) + ' from 300)')
  ok(Math.abs(d1 - m.ringRadius) < Math.abs(300 - m.ringRadius), 'E3 hold: it closes toward the ring radius, not away (ring ' + m.ringRadius.toFixed(1) + ')')
}

export function run(): void {
  const t = spawnOutOfSightRun()
  ok(t === spawnOutOfSightRun(), 'D4: two identical runs produce identical spawn traces')
  calmAfterRecoverExit()
  const st = stalkerSpinRun()
  ok(st === stalkerSpinRun(), 'E3: two identical runs produce identical stalker traces')
  holdWhenLookedAt()
}
