// Issue #113 F7 (chunk 38): flow-field steering integration (step 6) plus the carried-over E3 stalker
// windup coverage (chunk 34 retrospect). Continuation of ai-tactics-2.check.ts (300-line cap).
// Spec: KB plan note ai-jam-5-issue-113-plan-3-steps-4-7, chunk 38 (F7 row) + chunk 34 (E3 row).
// Flow A/B method: the plan's own mutant - with T.ai.flowStuckT = 1e9 both the F6 gate in monsters.ts
// and flowSeek's internal check fall back to plain seek, so one file proves flow-on beats flow-off
// without touching src. Fixtures pin awareness/searchT/detectionTimer/stuckT before each step because
// stepAwareness runs before the dispatch inside stepMonsters and would otherwise decay the branch
// under test (searchT starts at 0; hunting decays to searching after loseT).
// ponytail: the pins are the ceiling of these fixtures; upgrade: a steering-only harness if flow checks grow.
import type { State } from '../core/types.ts'
import { init } from '../core/state.ts'
import { parseSeed } from '../core/seed.ts'
import { T } from '../core/tuning.ts'
import { spawnMonster } from '../entities/monster.ts'
import { lightRadius } from '../systems/light.ts'
import { stepMonsters } from '../systems/monsters.ts'
import { startRun } from '../systems/run.ts'
import { caveOf } from './caves.ts'

const DT = 1 / 60

function ok(cond: boolean, msg: string): void {
  if (!cond) throw new Error('check failed: ' + msg)
}

// cave seed 1, descent, god, director silenced, energy 50 (<= flameRetreat 80: no near-flame retreat;
// lightRadius at energy 50 is 131.9 px, player spawn at 5648,368).
function caveFixture(): State {
  const s = init()
  startRun(s, '1', caveOf(parseSeed('1')))
  s.settings.loaded = true
  s.meta.phase = 'descent'
  s.debug.god = true
  s.director.spawnT = 1e9
  s.player.energy = 50
  return s
}

// Tile (178,20) on cave seed 1: 295 px from the spawn player, line of sight blocked by the wall,
// flow-reachable (flowStep non-null). Straight seek grinds on the wall; flow routes around it.
const WALL_TILE: [number, number] = [178, 20]

// F7(5) runner: a hunting lurker pinned stuck at WALL_TILE for `steps` steps; returns the minimum
// player distance and the position trace. stuckT is passed so the boundary check can probe the gate.
function huntRun(stuckT: number, flowOn: boolean, steps: number): [number, string] {
  const s = caveFixture()
  const save = T.ai.flowStuckT
  if (!flowOn) T.ai.flowStuckT = 1e9
  try {
    const m = spawnMonster(s, 'lurker', WALL_TILE[0] * 32 + 16, WALL_TILE[1] * 32 + 16, lightRadius(s))
    m.awareness = 'hunting'
    m.ai = 'ring'
    let minD = Infinity
    const tr: string[] = []
    for (let k = 0; k < steps; k++) {
      m.awareness = 'hunting'
      m.detectionTimer = 0 // pin: hunting never decays to searching inside stepAwareness
      m.stuckT = stuckT
      stepMonsters(s, DT)
      const d = Math.hypot(m.x - s.player.x, m.y - s.player.y)
      if (d < minD) minD = d
      tr.push(m.x.toFixed(2) + ',' + m.y.toFixed(2))
    }
    return [minD, tr.join(';')]
  } finally {
    T.ai.flowStuckT = save
  }
}

// F7(5): flow routes the stuck hunting shade around the wall to the light edge (measured min 127.5 px
// over 600 steps); the plan's mutant flowStuckT = 1e9 (plain seek) stalls at the wall (min 209.1 px).
// Mutation: remove the F6 block in monsters.ts -> both runs equal -> red.
function flowBeatsSeek(): void {
  const [flowMin, flowTr] = huntRun(1, true, 600)
  const [seekMin] = huntRun(1, false, 600)
  ok(flowMin < 140, 'F7 hunt: the flow run must reach the light edge (min ' + flowMin.toFixed(1) + ' px, light 131.9)')
  ok(seekMin > 180, 'F7 hunt: the plain-seek mutant must stall at the wall (min ' + seekMin.toFixed(1) + ' px)')
  ok(flowMin < seekMin - 40, 'F7 hunt: flow must beat seek by > 40 px (flow ' + flowMin.toFixed(1) + ' vs seek ' + seekMin.toFixed(1) + ')')
  ok(flowTr === huntRun(1, true, 600)[1], 'F7 hunt: two identical flow runs produce identical traces')
}

// F7 boundary: the gate is strict (stuckT > flowStuckT). Pinned exactly at the threshold the run equals
// the plain-seek trace; one step above it diverges. Mutation: flip flowSeek's internal `<=` to `<` in
// ai-flow.ts -> the at-threshold run follows the flow -> the equality assert goes red.
function flowStuckBoundary(): void {
  const seekTr = huntRun(1, false, 300)[1]
  ok(huntRun(T.ai.flowStuckT, true, 300)[1] === seekTr, 'F7 boundary: stuckT == flowStuckT must behave as plain seek')
  ok(huntRun(T.ai.flowStuckT + DT, true, 300)[1] !== seekTr, 'F7 boundary: stuckT one step above flowStuckT must diverge from plain seek')
}

// F7 escape: the F6 gate excludes the escape phase (relentless by design), so the escape trace is
// identical with flow on and off. Mutation: remove !esc from the F6 gate -> traces differ -> red.
function escapeUnchanged(): void {
  const trace = (flowOn: boolean): string => {
    const s = caveFixture()
    s.meta.phase = 'escape'
    const save = T.ai.flowStuckT
    if (!flowOn) T.ai.flowStuckT = 1e9
    try {
      const m = spawnMonster(s, 'lurker', WALL_TILE[0] * 32 + 16, WALL_TILE[1] * 32 + 16, lightRadius(s))
      m.ai = 'ring'
      const tr: string[] = []
      for (let k = 0; k < 300; k++) {
        m.stuckT = 1 // stepAwareness forces hunting in escape, no awareness pin needed
        stepMonsters(s, DT)
        tr.push(m.x.toFixed(2) + ',' + m.y.toFixed(2))
      }
      return tr.join(';')
    } finally {
      T.ai.flowStuckT = save
    }
  }
  ok(trace(true) === trace(false), 'F7 escape: the escape-phase trace must be identical with flow on and off')
}

// F7(6): a stuck searching shade in the dark walks toward lastKnown; with lastKnown behind the wall on
// the player side, plain seek grinds on the wall while flow routes around it. Measured over 300 steps
// from 204.9 px: flow min 126.5 px, seek min 158.4 px. Mutation: remove the F6 block -> equal -> red.
function searchingFlow(): void {
  const run = (flowOn: boolean): [number, number, string] => {
    const s = caveFixture()
    const save = T.ai.flowStuckT
    if (!flowOn) T.ai.flowStuckT = 1e9
    try {
      const m = spawnMonster(s, 'lurker', WALL_TILE[0] * 32 + 16, WALL_TILE[1] * 32 + 16, lightRadius(s))
      m.awareness = 'searching'
      m.ai = 'ring'
      m.facing = 0 // look away from the player: the canSee cone fails and the shade stays searching
      m.lastKnownX = 174 * 32 + 16
      m.lastKnownY = 15 * 32 + 16 // (174,15): 143 px from the player (outside the light), behind the wall
      const d0 = Math.hypot(m.x - m.lastKnownX, m.y - m.lastKnownY)
      let minD = Infinity
      const tr: string[] = []
      for (let k = 0; k < 300; k++) {
        m.awareness = 'searching'
        m.searchT = T.ai.searchT // pin: searching never decays to unaware inside stepAwareness
        m.stuckT = 1
        stepMonsters(s, DT)
        const d = Math.hypot(m.x - m.lastKnownX, m.y - m.lastKnownY)
        if (d < minD) minD = d
        tr.push(m.x.toFixed(2) + ',' + m.y.toFixed(2))
      }
      return [d0, minD, tr.join(';')]
    } finally {
      T.ai.flowStuckT = save
    }
  }
  const [d0, flowMin, flowTr] = run(true)
  const [, seekMin] = run(false)
  ok(d0 - flowMin > 40, 'F7 search: the stuck searching shade must leave its spot (> 40 px toward lastKnown, got ' + (d0 - flowMin).toFixed(1) + ')')
  ok(flowMin < seekMin - 20, 'F7 search: flow must beat plain seek toward lastKnown by > 20 px (flow ' + flowMin.toFixed(1) + ' vs seek ' + seekMin.toFixed(1) + ')')
  ok(flowTr === run(true)[2], 'F7 search: two identical flow runs produce identical traces')
}

// AC7 regression (chunk 37 retrospect): a stuck, LIT, searching shade must flee the light, never be
// pulled toward the player by flow. Shade 60 px from the player (inside lightRadius 131.9), lastKnown
// 300 px on the far side (outside the light - the shade itself trips the guard), facing away (canSee
// cone fails), player still (canHear false). Measured over 120 steps: min distance 60.11 px (never
// shrinks), vx = +70 = lurker ringSpeedPxS (straight light-flee). Mutation: remove the light guard
// from the F6 condition in monsters.ts -> flow pulls it in -> min < 60 -> red.
function litSearchingFlees(): void {
  const run = (): [number, number, number] => {
    const s = caveFixture()
    const m = spawnMonster(s, 'lurker', s.player.x + 60, s.player.y, lightRadius(s))
    m.awareness = 'searching'
    m.ai = 'ring'
    m.facing = 0 // due east, away from the player
    m.lastKnownX = s.player.x - 300
    m.lastKnownY = s.player.y
    let minD = Infinity
    for (let k = 0; k < 120; k++) {
      m.awareness = 'searching'
      m.searchT = T.ai.searchT
      m.stuckT = 1
      stepMonsters(s, DT)
      const d = Math.hypot(m.x - s.player.x, m.y - s.player.y)
      if (d < minD) minD = d
    }
    return [minD, m.vx, m.vy]
  }
  const [minD, vx, vy] = run()
  ok(minD > 60, 'AC7: the lit searching shade must never approach (min distance ' + minD.toFixed(2) + ' px from 60)')
  ok(vx > T.monsters.lurker.ringSpeedPxS - 1 && Math.abs(vy) < 1, 'AC7: vx must match the straight light-flee direction (vx ' + vx.toFixed(2) + ', vy ' + vy.toFixed(2) + ')')
  ok(run()[0] === minD, 'AC7: two identical runs produce identical results')
}

// Open arena mirroring ai-tactics-2.check.ts stalkerArena (checks cannot import each other): every
// tile floor, player mid-map, director silenced, energy 50.
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

// E3 carry-over (chunk 34 rule 2): while the player looks at the stalker it holds - behindT stays 0 and
// no windup over 300 steps. Zone 4 so the lunge hazard rate is nonzero: a broken behind predicate
// would actually fire. The shade is repositioned to its ring distance after one step so the ring band
// is satisfied and isBehind is the ONLY thing keeping behindT at 0 (at 300 px the band alone would
// block it and the isBehind mutation would be invisible). Mutation: drop the isBehind condition from
// the behindT accumulation in ai-stalker.ts -> behindT grows while looked at -> windup -> red.
function windupHeldWhileLookedAt(): void {
  const s = stalkerArena()
  s.meta.zone = 4
  const m = spawnMonster(s, 'stalker', s.player.x + 300, s.player.y, lightRadius(s))
  m.awareness = 'hunting'
  m.ai = 'stalk'
  s.player.facing = 0 // the shade sits due east: the player looks straight at it
  stepMonsters(s, DT) // one step so the brain mirrors ringRadius before the reposition
  m.x = s.player.x + m.ringRadius
  m.y = s.player.y
  for (let k = 0; k < 300; k++) {
    stepMonsters(s, DT)
    ok(m.behindT === 0, 'E3(2): behindT stayed 0 while looked at (step ' + k + ': ' + m.behindT.toFixed(3) + ')')
    ok((m.ai as string) !== 'windup' && (m.ai as string) !== 'lunge', 'E3(2): no windup while looked at (step ' + k + ', ai ' + m.ai + ')') // cast: stepMonsters mutates m.ai; narrowing cannot see through the call
  }
}

// E3 carry-over (chunk 34 rule 3): with the player's back turned, at ring distance and lungeCd 0, the
// windup starts within stalkCommitT + 1 s (108 steps). The gameplay stream is pinned
// (s.rng.gameplay = 12345) so the hazard draw is deterministic; measured windup at step 51.
// Mutation: zero behindT in ai-stalker.ts -> eligible() never passes -> no windup -> red.
function windupStartsWhenUnseen(): void {
  const s = stalkerArena()
  s.meta.zone = 4
  const m = spawnMonster(s, 'stalker', s.player.x + 300, s.player.y, lightRadius(s))
  m.awareness = 'hunting'
  m.ai = 'stalk'
  s.player.facing = Math.PI // back turned: the shade due east is behind (off 180 deg > 110 deg)
  stepMonsters(s, DT) // one step so the brain mirrors ringRadius before the reposition
  m.x = s.player.x + m.ringRadius
  m.y = s.player.y
  m.lungeCd = 0
  s.rng.gameplay = 12345
  const budget = Math.round((T.ai.stalkCommitT + 1) / DT)
  let windupAt = -1
  for (let k = 1; k <= budget; k++) {
    stepMonsters(s, DT)
    if ((m.ai as string) === 'windup' || (m.ai as string) === 'lunge') { windupAt = k; break } // cast: stepMonsters mutates m.ai; narrowing cannot see through the call
  }
  ok(windupAt >= 1, 'E3(3): windup started within stalkCommitT + 1 s (' + budget + ' steps)')
  ok(m.lungeCd === 0, 'E3(3): the windup started with lungeCd 0 (' + m.lungeCd + ')')
}

export function run(): void {
  flowBeatsSeek()
  flowStuckBoundary()
  escapeUnchanged()
  searchingFlow()
  litSearchingFlees()
  windupHeldWhileLookedAt()
  windupStartsWhenUnseen()
}
