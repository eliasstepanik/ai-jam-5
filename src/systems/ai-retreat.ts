// L3 systems: retreat brain for the flame/near-cap retreat (issue #113 step 2, plan C3).
// Returns the desired velocity only; monsters.ts (C4) starts retreats and dispatches here.
// Retreat is orthogonal to awareness: this file never reads or writes m.awareness.
// Deterministic: no rand() draws, no wall avoidance (straight flee vector, see ponytail below).
import type { Monster, State } from '../core/types.ts'
import { T } from '../core/tuning.ts'

// R-075 (binding): a brain gets no dt; the fixed step is 1/60 (as in ai-lurker.ts).
const STEP_S = 1 / 60

// Called by the flame trigger, the recover-exit hook and the near-cap enforcement (C4/C5).
export function startRetreat(m: Monster): void {
  m.retreatT = T.ai.retreatT
}

// Flee straight away from the player at ring speed * retreatSpeedMul.
// Ends early once the monster is comfortably outside the near radius.
// ponytail: straight-line flee can wall-stick; upgrade: flow-field flee (step 6, ai-flow.ts).
export function retreatBrain(s: State, m: Monster): [number, number] {
  m.retreatT = Math.max(0, m.retreatT - STEP_S)
  const p = s.player
  const dx = m.x - p.x, dy = m.y - p.y
  const d = Math.hypot(dx, dy)
  if (d >= T.director.nearRadius + 120) m.retreatT = 0
  const v = T.monsters[m.kind].ringSpeedPxS * T.ai.retreatSpeedMul
  if (d < 1e-6) return [Math.cos(m.ringAngle) * v, Math.sin(m.ringAngle) * v]
  return [(dx / d) * v, (dy / d) * v]
}

// Monsters (excluding dying ones) within the director's near radius; C5 refuses spawns at the cap.
export function nearCount(s: State): number {
  const p = s.player
  let n = 0
  for (const m of s.monsters) {
    if (m.ai === 'dying') continue
    if (Math.hypot(m.x - p.x, m.y - p.y) <= T.director.nearRadius) n++
  }
  return n
}
