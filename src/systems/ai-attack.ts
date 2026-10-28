// L3 systems: when a ring / stalk shade starts its windup (descent). Moved out of monsters.ts (300-line cap).
// Spec: docs/architecture-monsters-ai.md §4 (hazard + eligibility), playtest-tuning-1b §5.2 (patience timer).
// Pure over State + Monster fields; the only RNG use is the one gameplay draw per eligible step. No module-level state.
import type { Monster, State } from '../core/types.ts'
import { rand } from '../core/rng.ts'
import { T, zt } from '../core/tuning.ts'
import { lineOfSightPx } from '../world/los.ts'
import { RING_BAND_PX, STALKER_BEHIND_S } from './ai-stalker.ts'

const EPS = 1e-9 // R-127: accumulated time compares x + EPS >= limit

// λ per second of §4. Pure; reused by the debug overlay.
export function lungeHazard(s: State, m: Monster): number {
  const p = s.player, z = s.meta.zone
  const A = T.minerals.table[p.activeMineral].attractMul
  return zt(T.monsters[m.kind].lungeChancePerS, z) * A * (1 + T.ai.darkLungeMul * (1 - p.energy / p.energyMax))
    * (p.energy <= 0 ? T.ai.flameOutLungeMul : 1)
}

function eligible(s: State, m: Monster): boolean {
  const p = s.player, K = T.monsters[m.kind]
  const d = Math.hypot(m.x - p.x, m.y - p.y)
  if (m.lungeCd > EPS || m.fleeing || m.stunned > EPS || d > K.lungeRangePx) return false
  if (m.awareness !== 'hunting') return false // #113 C4 retrospect: only shades that have noticed the player may lunge (escape forces hunting)
  if (m.kind !== 'devourer' && Math.abs(d - m.ringRadius) > RING_BAND_PX) return false
  if (m.kind === 'stalker' && m.behindT + EPS < STALKER_BEHIND_S) return false
  let used = 0
  for (const o of s.monsters) if (o.ai === 'windup' || o.ai === 'lunge') used += 1
  return used < zt(T.director.attackSlots, s.meta.zone) && lineOfSightPx(s, m.x, m.y, p.x, p.y) // R-013
}

// One gameplay draw per eligible step, as before (draw count unchanged); patience only overrides the outcome.
// patienceS 0 = no forced windup for that kind/zone (a spawned kind never has 0, so this is only a guard).
export function wantsWindup(s: State, m: Monster, dt: number): boolean {
  if (!eligible(s, m)) return false
  m.patience += dt
  const hit = rand(s, 'gameplay') < 1 - Math.exp(-lungeHazard(s, m) * dt)
  const limit = zt(T.monsters[m.kind].patienceS, s.meta.zone)
  return hit || (limit > 0 && m.patience + EPS >= limit)
}
