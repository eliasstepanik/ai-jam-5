// L3 systems: combat, pure and self-contained part. Writes player.swing/hurtT/hitFlash/hp/stats.damageTaken, s.fx via emit/addShake.
// Spec: docs/architecture-systems-3.md §2 (stepSwing), §3.1 (parryLoss), §4.1 + R-148 (hurtPlayerHp), §5 (tickPlayerTimers);
// R-127 (accumulated-time thresholds compare x + 1e-9 >= limit).
// Status: this file holds parryLoss, hurtPlayerHp, tickPlayerTimers and stepSwing.
// resolveParries, resolveBites and damagePlayer follow in A27 part 2, after A28 adds setDying/toRecover in monsters.ts.
import type { FlameKind, MonsterKind, ParryGrade, State } from '../core/types.ts'
import type { Intent } from './intent.ts'
import { clamp } from '../core/math.ts'
import { T } from '../core/tuning.ts'
import { addShake, emit } from './fx.ts'

const EPS = 1e-9 // R-127: float slack for accumulated-time thresholds and the perfect band

// Energy lost by a parry at signed offset d (s, < 0 = early). Pure, exported for checks.
export function parryLoss(d: number, kind: MonsterKind, mineral: FlameKind): { grade: ParryGrade; loss: number } {
  const K = T.monsters[kind]
  const M = T.minerals.table[mineral]
  const P = T.parry.perfectS * M.perfectMul
  const W = Math.max(d < 0 ? T.parry.earlyMaxS : T.parry.lateMaxS, P + T.parry.minSpanS)
  if (Math.abs(d) <= P + EPS) return { grade: 'perfect', loss: 0 } // eps: 2/60 may be ...326 or ...37
  const u = clamp((Math.abs(d) - P) / (W - P), 0, 1)
  const frac = T.parry.lossMinFrac + (T.parry.lossMaxFrac - T.parry.lossMinFrac) * u ** T.parry.lossExp
  return { grade: u <= T.parry.goodSplit ? 'good' : 'poor', loss: K.energyHitE * frac * M.lossMul }
}

// The one HP-loss path for bites and rocks (R-148). Roll i-frames never apply here. Returns true if HP was lost.
export function hurtPlayerHp(s: State, src: 'bite' | 'rock'): boolean {
  const p = s.player
  if (s.debug.god || p.hurtT > 0) return false
  p.hp -= src === 'rock' ? T.rocks.damageHp : 1 // ponytail: bites are always 1 pip; add a T key if bites ever scale
  p.hurtT = T.hurt.hpInvulnS
  p.hitFlash = T.hurt.flashS
  p.stats.damageTaken += 1 // counts hits, not pips: equal while every source is 1 pip
  emit(s, 'hpHit', p.x, p.y)
  addShake(s, 'hpHit')
  return true
}

export function tickPlayerTimers(s: State, dt: number): void {
  const p = s.player
  p.hurtT = Math.max(0, p.hurtT - dt)
  p.hitFlash = Math.max(0, p.hitFlash - dt)
}

// Swing start, active time, cooldown and click buffer (R-068). Descent only. Swinging with the flame out is allowed.
export function stepSwing(s: State, it: Intent, dt: number): void {
  const p = s.player
  const sw = p.swing
  sw.cooldown = Math.max(0, sw.cooldown - dt)
  sw.buffer = Math.max(0, sw.buffer - dt)
  if (sw.active) {
    sw.t += dt
    if (sw.t + EPS >= T.swing.activeS) sw.active = false // R-127: 9 x 1/60 must end the swing on step 9
  }
  // R-127 on the countdowns too: 0.5 - 30 x 1/60 leaves ~1e-16, so a bare <= 0 would free the swing on step 31
  const want = it.swing || sw.buffer > EPS
  if (want && sw.cooldown <= EPS) {
    sw.active = true
    sw.t = 0
    sw.dir = p.facing
    sw.cooldown = T.swing.cooldownS
    sw.buffer = 0
    emit(s, 'swing', p.x, p.y, sw.dir)
  } else if (it.swing) {
    sw.buffer = T.swing.bufferS
  }
}
