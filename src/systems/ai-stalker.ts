// L3 systems: stalker brain (circle toward the spot behind the player, flee from the light, count the time spent behind).
// Spec: docs/architecture-monsters-ai.md §7 (behind predicate, FSM table, worked ring speed), §2 (flee latch), §3.3 (seek, chase band).
// Like every brain it only returns the desired velocity and updates ring / flee / behindT bookkeeping. The windup, lunge and recover
// numbers (0.55 / 0.24 / 0.54 s, retreat to ringRadius + 100 at 102 px/s, 1.2 s recover, lungeCd 2.5-4, start cd 3-5) are table values
// the shared pipeline in monsters.ts already reads from T.monsters.stalker and T.ai.
import type { Monster, State } from '../core/types.ts'
import { wrapPi } from '../core/math.ts'
import { deg, T } from '../core/tuning.ts'
import { seek } from '../entities/steer.ts'
import type { Brain } from './ai-lurker.ts'
import { ringRadius } from './ai-lurker.ts'
import { lightRadius } from './light.ts'

export const RING_BAND_PX = 40 // §4/§7: a windup (and behindT) needs the shade within this band of its ring
export const STALKER_BEHIND_S = 0.25 // §7: dwell behind the player before a windup is allowed (no T key; spec literal)
const STEP_S = 1 / 60 // R-075: a brain gets no dt (see ai-lurker.ts)
const CHASE_BAND_PX = 80 // §3.3: farther than this off the ring -> chase speed

// §7: off = |wrapPi(theta_m - facing)|, behind when beyond stalkerBehindDeg. Wrap-safe: facing 3.0 vs theta -3.0 is in FRONT.
export function isBehind(s: State, m: Monster): boolean {
  const p = s.player
  return Math.abs(wrapPi(Math.atan2(m.y - p.y, m.x - p.x) - p.facing)) > deg(T.ai.stalkerBehindDeg)
}

export const stalkerBrain: Brain = (s, m) => {
  const p = s.player, K = T.monsters[m.kind]
  const R = lightRadius(s)
  m.ringRadius = ringRadius(s, m, R)
  const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy)
  m.fleeing = m.fleeing ? d < R + 0.5 * K.ringMarginPx : d < R // same latch as the lurker (§2)
  if (m.ai === 'stalk') m.behindT = isBehind(s, m) && Math.abs(d - m.ringRadius) <= RING_BAND_PX ? m.behindT + STEP_S : 0
  if (m.fleeing) {
    m.ringAngle = Math.atan2(dy, dx) // keep the ring point under the shade so the chase resumes without a jump
    const v = K.ringSpeedPxS * T.ai.fleeMul
    return [Math.cos(m.ringAngle) * v, Math.sin(m.ringAngle) * v]
  }
  // chase the angle behind the player the short way round, at most ringSpeed / ringRadius rad/s
  const delta = wrapPi(p.facing + Math.PI - m.ringAngle), step = K.ringSpeedPxS / Math.max(m.ringRadius, 1) * STEP_S
  m.ringAngle = wrapPi(m.ringAngle + Math.sign(delta) * Math.min(Math.abs(delta), step))
  return seek(m.x, m.y, p.x + Math.cos(m.ringAngle) * m.ringRadius, p.y + Math.sin(m.ringAngle) * m.ringRadius,
    Math.abs(d - m.ringRadius) > CHASE_BAND_PX ? K.chaseSpeedPxS : K.ringSpeedPxS)
}
