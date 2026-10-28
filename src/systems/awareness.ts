// L3 systems: issue #113 step 1 (A3) - perception state machine shared by every monster.
// Spec: KB plan note ai-jam-5-issue-113-plan-2-steps-1-3, chunk 14 (A3 row) + review-3 AC7 light correction.
// One shared function: brains stay untouched; A4 (monsters.ts) calls stepAwareness each step and
// searchVelocity when awareness === 'searching'. No RNG draws, no module-level mutable state (hot-reload
// contract): all state lives on the Monster fields added in M1/M4.
import type { Monster, MonsterAi, State } from '../core/types.ts'
import { wrapPi } from '../core/math.ts'
import { T } from '../core/tuning.ts'
import { seek } from '../entities/steer.ts'
import { insideLight, lightRadius } from './light.ts'
import { lineOfSightPx } from '../world/los.ts'

// ai states where perception is frozen (mid-attack / stunned / dying: awareness must not flip).
const FROZEN_AI: MonsterAi[] = ['windup', 'lunge', 'recover', 'stunned', 'dying']
const FACING_MIN_SPEED = 5 // px/s: below this the velocity direction is noise, keep the last facing
const SEARCH_ARRIVE_PX = 12 // px: closer than this to lastKnown counts as arrived -> wait

// Sight: range, then cone, then wall LOS (cheapest test first, LOS last). No LOS cache and no m.beat
// use (beat is the devourer windup index, not a cache slot) - plan ruling R1-1.
export function canSee(s: State, m: Monster): boolean {
  const p = s.player
  const dx = p.x - m.x
  const dy = p.y - m.y
  if (Math.hypot(dx, dy) > T.ai.viewRange) return false
  if (Math.abs(wrapPi(Math.atan2(dy, dx) - m.facing)) > T.ai.viewHalfAngle) return false
  return lineOfSightPx(s, m.x, m.y, p.x, p.y)
}

// Lit notice (playtest-tuning-1b §5.1): the torch is a beacon. A player within lightRadius + margin with wall LOS is seen
// from the dark, cone or not, so a standing player on the ring is noticed. At e = 0 the radius is small, so a dead torch can still slip past.
export function inLight(s: State, m: Monster): boolean {
  const p = s.player
  if (Math.hypot(p.x - m.x, p.y - m.y) > lightRadius(s) + T.ai.noticeLitMarginPx) return false
  return lineOfSightPx(s, m.x, m.y, p.x, p.y)
}

// Hearing: a moving player within hearRadius is heard.
// ponytail: sound passes through walls (no LOS test) - cheap and reads as "footsteps carry in a cave".
// Upgrade path: AND lineOfSightPx if muffled-through-wall matters.
export function canHear(s: State, m: Monster): boolean {
  const p = s.player
  if (Math.hypot(p.vx, p.vy) <= T.ai.hearSpeed) return false
  return Math.hypot(p.x - m.x, p.y - m.y) <= T.ai.hearRadius
}

// Perception tick, called once per monster per step with the fixed step dt (1/60).
// unaware/suspicious fill a detection meter; hunting drains it the other way (loseT);
// searching spends a searchT budget walking to lastKnown, then gives up home.
export function stepAwareness(s: State, m: Monster, dt: number): void {
  const p = s.player
  // facing runs FIRST, every step, even while frozen or in escape.
  if (Math.hypot(m.vx, m.vy) > FACING_MIN_SPEED) m.facing = Math.atan2(m.vy, m.vx)
  if (FROZEN_AI.includes(m.ai) || m.fleeing) return
  // escape phase: the hunt is on, perception is bypassed and forced (A5/director keeps spawns hunting too).
  if (s.meta.phase === 'escape') {
    m.awareness = 'hunting'
    return
  }
  if (m.awareness === 'unaware' || m.awareness === 'suspicious') {
    const see = canSee(s, m) || inLight(s, m)
    const hear = !see && canHear(s, m)
    if (see || hear) {
      m.detectionTimer += see ? dt : dt / 2 // hearing fills at half rate
      m.lastKnownX = p.x
      m.lastKnownY = p.y
    } else {
      m.detectionTimer = Math.max(0, m.detectionTimer - dt)
    }
    if (m.detectionTimer >= T.ai.noticeT) {
      m.awareness = 'hunting'
      m.detectionTimer = 0
      m.suspectT = 0
    } else {
      m.awareness = m.detectionTimer > 0 ? 'suspicious' : 'unaware'
      m.suspectT = m.awareness === 'suspicious' ? m.suspectT + dt : 0
      if (m.suspectT >= T.ai.suspectMaxS) { // bounded suspicion: a shade never stays suspicious forever (lastKnown set by the sense)
        m.awareness = 'hunting'
        m.detectionTimer = 0
        m.suspectT = 0
      }
    }
  } else if (m.awareness === 'hunting') {
    // hunting sees wider and cone-less (it knows where to look): range*1.5 + LOS, or hearing.
    const d = Math.hypot(p.x - m.x, p.y - m.y)
    const sensed = (d <= T.ai.viewRange * 1.5 && lineOfSightPx(s, m.x, m.y, p.x, p.y)) || canHear(s, m)
    if (sensed) {
      m.detectionTimer = 0
      m.lastKnownX = p.x
      m.lastKnownY = p.y
    } else {
      m.detectionTimer += dt
      if (m.detectionTimer >= T.ai.loseT) {
        m.awareness = 'searching'
        m.searchT = T.ai.searchT
        m.detectionTimer = 0
      }
    }
  } else {
    // searching: any sense re-acquires instantly; else burn the budget, then give up and settle at home.
    if (canSee(s, m) || canHear(s, m)) {
      m.awareness = 'hunting'
      m.lastKnownX = p.x
      m.lastKnownY = p.y
    } else {
      m.searchT -= dt
      if (m.searchT <= 0) {
        m.awareness = 'unaware'
        m.homeX = m.x
        m.homeY = m.y
        m.patrolT = 0
        m.detectionTimer = 0
      }
    }
  }
}

// Desired velocity while awareness === 'searching' (A4 dispatches here).
// AC7 (review-3 + review correction): the light still matters while searching. If the monster OR the
// search target is inside the player's light, back away from the light instead of loitering in it or
// walking into it. A6 asserts both directions (inside -> moves away; outside -> never ends inside).
export function searchVelocity(s: State, m: Monster): [number, number] {
  const p = s.player
  const K = T.monsters[m.kind]
  if (insideLight(s, m.x, m.y) || insideLight(s, m.lastKnownX, m.lastKnownY)) {
    const dx = m.x - p.x
    const dy = m.y - p.y
    const d = Math.hypot(dx, dy)
    if (d < 1e-6) return [Math.cos(m.ringAngle) * K.ringSpeedPxS, Math.sin(m.ringAngle) * K.ringSpeedPxS]
    return [(dx / d) * K.ringSpeedPxS, (dy / d) * K.ringSpeedPxS]
  }
  const d = Math.hypot(m.lastKnownX - m.x, m.lastKnownY - m.y)
  // ponytail: straight seek, no pathfinding around walls while searching (flow field is step 6, F5/F6).
  if (d > SEARCH_ARRIVE_PX) return seek(m.x, m.y, m.lastKnownX, m.lastKnownY, K.ringSpeedPxS)
  return [0, 0] // arrived at last known: wait in place for searchT to run out
}
