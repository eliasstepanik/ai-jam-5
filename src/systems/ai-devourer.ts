// L3 systems: devourer brain (slow orbit on a ring that sits inside the light, never flees).
// Spec: docs/architecture-monsters-ai.md §8 (devourer FSM: ring 0.85 / margin 30, orbit 0.15 rad/s, 35 px/s, chase 45), §2 (it walks INTO the light).
// Like every brain it returns only the desired velocity and the ring bookkeeping. The two-beat windup (0.4 + 0.4 s), the lunge
// (contactS 0.30, miss after 0.60 s), the recover (ring + 40 px at 42 px/s, 1.5 s, lungeCd 4-6) and dying (0.8 s) are the shared
// pipeline in monsters.ts reading T.monsters.devourer; the light push is devourerMul in entities/monster.ts.
import type { Monster, State } from '../core/types.ts'
import { wrapPi } from '../core/math.ts'
import { T } from '../core/tuning.ts'
import { seek } from '../entities/steer.ts'
import type { Brain } from './ai-lurker.ts'
import { ringRadius } from './ai-lurker.ts'

const STEP_S = 1 / 60 // R-075: a brain gets no dt (see ai-lurker.ts)
const CHASE_BAND_PX = 80 // §3.3: farther than this off the ring -> chase speed

export const devourerBrain: Brain = (s: State, m: Monster) => {
  const p = s.player, K = T.monsters.devourer
  m.ringRadius = ringRadius(s, m)
  m.fleeing = false // §2/§8: the devourer is exempt from the avoid rule
  m.ringAngle = wrapPi(m.ringAngle + m.orbitDir * K.orbitRadS * STEP_S)
  const d = Math.hypot(m.x - p.x, m.y - p.y)
  return seek(m.x, m.y, p.x + Math.cos(m.ringAngle) * m.ringRadius, p.y + Math.sin(m.ringAngle) * m.ringRadius,
    Math.abs(d - m.ringRadius) > CHASE_BAND_PX ? K.chaseSpeedPxS : K.ringSpeedPxS)
}
