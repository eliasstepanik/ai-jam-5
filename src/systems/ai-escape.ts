// L3 systems: escape-phase brain (no torch, no ring, shades hunt and lunge constantly) and its strike / aim helpers.
// Spec: docs/architecture-monsters-ai-2.md §2 (escapeBrain table), R-074 (T.escape.{chaseMul,interceptS,attackSlots}).
// Windup (0.4 / 0.4 / 0.8 s), lunge, no-delay bite and the 0.4 s recover are the shared pipeline in monsters.ts / combat.ts;
// this file owns only what is different: the intercept chase, the strike test and the lunge aim point.
import type { Monster, State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { seek } from '../entities/steer.ts'
import { lineOfSightPx } from '../world/los.ts'

const EPS = 1e-9 // R-127

// §2 ring row: seek the intercept point p + v * 0.3 at chaseSpeed * 1.3. No light test, no flee, no behind rule (one rule set).
export function escapeBrain(s: State, m: Monster): [number, number] {
  const p = s.player
  m.fleeing = false
  return seek(m.x, m.y, p.x + p.vx * T.escape.interceptS, p.y + p.vy * T.escape.interceptS,
    T.monsters[m.kind].chaseSpeedPxS * T.escape.chaseMul)
}

// §2 lunge row: the aim is locked at p + v * escapeLeadS (36 px at 240 px/s for a lurker).
export function escapeAim(s: State, m: Monster): [number, number] {
  const p = s.player, lead = T.monsters[m.kind].escapeLeadS
  return [p.x + p.vx * lead, p.y + p.vy * lead]
}

// §2 ring exit: constant lunges, no hazard draw. Close enough, cooldown over, a free attack slot and a clear line.
export function escapeStrike(s: State, m: Monster): boolean {
  const p = s.player
  if (m.lungeCd > EPS || Math.hypot(m.x - p.x, m.y - p.y) > T.monsters[m.kind].escapeStrikePx) return false
  let used = 0
  for (const o of s.monsters) if (o.ai === 'windup' || o.ai === 'lunge') used += 1
  return used < T.escape.attackSlots && lineOfSightPx(s, m.x, m.y, p.x, p.y)
}
