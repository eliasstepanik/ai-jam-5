// L3 systems: patrol brain for unaware monsters (issue #113 step 2, plan B3).
// Returns the desired velocity only; monsters.ts (B4) dispatches awareness === 'unaware' here.
// Deterministic: patrol points come from hash2(m.id, s.meta.steps, salt), never rand() (no stream draws).
import type { Monster, State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { hash2 } from '../core/noise.ts'
import { seek } from '../entities/steer.ts'
import { circleHitsSolid } from '../world/collide.ts'
import { insideLight } from './light.ts'

// R-075 (binding): a brain gets no dt; the fixed step is 1/60 (as in ai-lurker.ts).
const STEP_S = 1 / 60
const CANDIDATES = 4 // patrol point candidates per pick; first acceptable wins
const ARRIVE_PX = 6 // px, close enough to the patrol point to count as arrived

// patrolT state machine: >0 pausing (counts down), <0 walking (counts up to 0), 0 = pick a new point.
export function patrolBrain(s: State, m: Monster): [number, number] {
  const K = T.monsters[m.kind]
  const speed = K.ringSpeedPxS * T.ai.patrolSpeedMul

  if (m.patrolT > 0) {
    m.patrolT -= STEP_S
    return [0, 0]
  }
  if (m.patrolT < 0) {
    m.patrolT += STEP_S
    const d = Math.hypot(m.patrolX - m.x, m.patrolY - m.y)
    if (m.patrolT >= 0 || d < ARRIVE_PX) {
      // arrived, or the walk budget expired (blocked path) -> pause, then pick again
      m.patrolT = T.ai.patrolPauseT
      return [0, 0]
    }
    return seek(m.x, m.y, m.patrolX, m.patrolY, speed)
  }

  // Pick: first candidate within patrolRadius of home that is unblocked AND unlit.
  // AC7: lit points are rejected so patrolling shades never walk into the player's light.
  // In the escape phase insideLight is true everywhere, so every candidate is rejected
  // and the monster stays home (patrolT = pauseT) instead of chasing a lit point.
  for (let k = 0; k < CANDIDATES; k++) {
    const a = hash2(m.id, s.meta.steps, k) * Math.PI * 2
    const r = hash2(m.id, s.meta.steps, 16 + k) * T.ai.patrolRadius
    const x = m.homeX + Math.cos(a) * r
    const y = m.homeY + Math.sin(a) * r
    if (circleHitsSolid(s, x, y, K.radiusPx)) continue
    if (insideLight(s, x, y)) continue
    m.patrolX = x
    m.patrolY = y
    // ponytail: +1 s slack covers wall-blocked paths (no pathfinding here); upgrade: flow field (step 6).
    m.patrolT = -(Math.hypot(x - m.x, y - m.y) / speed + 1)
    return seek(m.x, m.y, x, y, speed)
  }
  m.patrolT = T.ai.patrolPauseT // nothing acceptable -> wait at home and retry
  return [0, 0]
}
