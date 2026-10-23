// L3 systems: player velocity, escape roll (stepRoll) and circle-vs-tile collision.
// Spec: docs/architecture-systems.md §5.1-§5.2 (S5). moveCircle/isSolidTile live only in world/ (R-012): no re-export.
import type { State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { moveCircle } from '../world/collide.ts'
import { clamp } from '../core/math.ts'
import { TILE } from '../core/state.ts'
import { emit } from './fx.ts'
import type { Intent } from './intent.ts'

export function stepMovement(s: State, it: Intent, dt: number): void {
  const p = s.player
  if (s.debug.noclip) {
    const speed = T.player.walkPxS * s.debug.speedMul
    p.vx = it.mx * speed; p.vy = it.my * speed
    p.x = clamp(p.x + p.vx * dt, T.player.radiusPx, s.world.w * TILE - T.player.radiusPx)
    p.y = clamp(p.y + p.vy * dt, T.player.radiusPx, s.world.h * TILE - T.player.radiusPx)
    return
  }
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

const EPS = 1e-9 // R-127: float slack for countdowns
// Countdown step: 0.3 - 18 x 1/60 leaves ~1e-17, which a bare `<= 0` would treat as time left (step 19 still i-framed).
const tick = (v: number, dt: number): number => (v - dt - EPS <= 0 ? 0 : v - dt)

// Escape roll (architecture-systems-3.md §6, R-127). Called at X3 before stepMovement, escape only. Owns p.vx/vy while roll.t > 0.
// Distance: the start step and 17 more run at speedPxS (18 x 7 px = 126 px), the step the timer ends already sprints.
export function stepRoll(s: State, it: Intent, dt: number): void {
  const p = s.player, r = p.roll
  r.cooldown = tick(r.cooldown, dt)
  r.invuln = tick(r.invuln, dt)
  if (r.t > 0) {
    r.t = tick(r.t, dt)
    const v = r.t > 0 ? T.roll.speedPxS : T.player.walkPxS * T.escape.sprintMul // exit at sprint speed, no stall
    p.vx = r.dirX * v
    p.vy = r.dirY * v
    return
  }
  if (!it.roll || r.cooldown > 0) return
  const dx = it.moving ? it.mx : Math.cos(p.facing), dy = it.moving ? it.my : Math.sin(p.facing)
  r.dirX = dx
  r.dirY = dy
  r.t = T.roll.durationS
  r.invuln = T.roll.invulnS
  r.cooldown = T.roll.cooldownS
  p.vx = dx * T.roll.speedPxS
  p.vy = dy * T.roll.speedPxS
  emit(s, 'roll', p.x, p.y, Math.atan2(dy, dx))
}
