// L3 systems: lurker brain (orbit on the ring, flee from the light) and the Brain type shared by every ai-*.ts file.
// Spec: docs/architecture-monsters-ai.md §2 (ring radius, flee latch), §3.3 (orbit), §6 (lurker FSM); MS-11 (Brain type).
// A brain only returns the desired velocity and updates the ring/flee bookkeeping; windup, lunge and the rest live in monsters.ts.
import type { Monster, State } from '../core/types.ts'
import { wrapPi } from '../core/math.ts'
import { T } from '../core/tuning.ts'
import { seek } from '../entities/steer.ts'
import { lightRadius } from './light.ts'

// R-075 (binding): a brain gets no dt. GAP: the orbit of §3.3 advances by `orbitRadS * dt`; docs/architecture-systems.md says dt is
// always 1/60, so the brain uses that constant. ponytail: stepMonsters(s, dt) with another dt would orbit at the 1/60 rate;
// upgrade: widen R-075 to `(s, m, dt)` if a variable step is ever allowed.
export type Brain = (s: State, m: Monster) => [number, number]

const STEP_S = 1 / 60
const CHASE_BAND_PX = 80 // docs/architecture-monsters-ai.md §3.3: farther than this off the ring -> chase speed

// §2: preferred distance from the player, with a slow per-shade drift. Also mirrored into m.ringRadius by the brain.
export function ringRadius(s: State, m: Monster, R = lightRadius(s)): number {
  const K = T.monsters[m.kind]
  return R * K.ringFactor + K.ringMarginPx + K.driftAmpPx * Math.sin(2 * Math.PI * K.driftHz * s.meta.time + m.id)
}

export const lurkerBrain: Brain = (s, m) => {
  const p = s.player, K = T.monsters[m.kind]
  const R = lightRadius(s)
  m.ringRadius = ringRadius(s, m, R)
  const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy)
  // Latch: trigger at d < R, release at d >= R + half the margin (§2).
  // The devourer is exempt (it walks INTO the light, §2); until ai-devourer.ts (C1) it shares this brain, so it never latches.
  m.fleeing = m.kind !== 'devourer' && (m.fleeing ? d < R + 0.5 * K.ringMarginPx : d < R)
  if (m.fleeing) {
    m.ringAngle = Math.atan2(dy, dx) // keep the ring point under the shade so the orbit resumes without a jump
    const v = K.ringSpeedPxS * T.ai.fleeMul
    return [Math.cos(m.ringAngle) * v, Math.sin(m.ringAngle) * v]
  }
  m.ringAngle = wrapPi(m.ringAngle + m.orbitDir * K.orbitRadS * STEP_S)
  return seek(m.x, m.y, p.x + Math.cos(m.ringAngle) * m.ringRadius, p.y + Math.sin(m.ringAngle) * m.ringRadius,
    Math.abs(d - m.ringRadius) > CHASE_BAND_PX ? K.chaseSpeedPxS : K.ringSpeedPxS)
}
