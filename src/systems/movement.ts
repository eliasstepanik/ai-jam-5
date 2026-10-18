// L3 systems: player velocity and circle-vs-tile collision (stepRoll is B8, not here).
// Spec: docs/architecture-systems.md §5.1-§5.2 (S5). moveCircle/isSolidTile live only in world/ (R-012): no re-export.
import type { State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { moveCircle } from '../world/collide.ts'
import type { Intent } from './intent.ts'

export function stepMovement(s: State, it: Intent, dt: number): void {
  const p = s.player
  if (p.roll.t <= 0) { // while rolling, stepRoll owns the velocity
    const esc = s.meta.phase === 'escape'
    const maxV = esc ? T.player.walkPxS * T.escape.sprintMul : T.player.walkPxS // 120 or 240
    const rate = it.moving
      ? (esc ? T.escape.accelPxS2 : T.player.accelPxS2)
      : T.player.frictionPxS2 * (esc ? T.escape.frictionMul : 1)
    const dvx = it.mx * maxV - p.vx, dvy = it.my * maxV - p.vy
    const dl = Math.hypot(dvx, dvy)
    const k = dl > rate * dt ? rate * dt / dl : 1 // move toward target velocity, never past it
    p.vx += dvx * k
    p.vy += dvy * k
  }
  // Collision runs while rolling too.
  // ponytail: a wall hit zeroes that axis only, so a slide runs at the axis component, not re-projected to full speed;
  // add projection along the wall if wall-hugging feels sticky.
  const res = moveCircle(s, p.x, p.y, p.vx * dt, p.vy * dt, T.player.radiusPx)
  p.x = res.x
  p.y = res.y
  if (res.hitX) p.vx = 0
  if (res.hitY) p.vy = 0
}
