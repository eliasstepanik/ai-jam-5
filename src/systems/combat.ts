// L3 systems: combat. Writes player.swing/parry/energy/hurtT/hitFlash/hp/stats, monster ai via setDying/toRecover, s.fx via emit/addShake.
// Spec: docs/architecture-systems-3.md §2 (stepSwing), §3 (resolveParries), §3.1 (parryLoss), §4 (resolveBites), §4.1 + R-148/R-149
// (damagePlayer, hurtPlayerHp), §5 (tickPlayerTimers); monsters-ai §5.1 + R-066 (swept bite latch); R-067 (hitstop);
// R-127 (accumulated-time thresholds compare x + 1e-9 >= limit), R-129 (the perfect moment is only tested through delta).
// Layer rule: imports monsters.ts (setDying, toRecover); monsters.ts never imports this file.
// Assumed per-step call order (systems.md §1.3, wired by A29): stepSwing -> stepMonsters -> resolveParries -> resolveBites -> tickPlayerTimers.
// So on the step a swing starts sw.t is 0 and m.aiT is already advanced; delta = (aiT - sw.t) - contactS is the lunge time at swing start.
import type { FlameKind, Monster, MonsterKind, ParryGrade, State } from '../core/types.ts'
import type { Intent } from './intent.ts'
import { clamp, segDist, wrapPi } from '../core/math.ts'
import { deg, T } from '../core/tuning.ts'
import { addShake, emit } from './fx.ts'
import { setDying, toRecover } from './monsters.ts'

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
  if (s.debug.god || s.debug.infiniteHp || p.hurtT > EPS) return false // R-127: hurtT counts down from 0.4 / 0.8 and keeps ~1e-16 residue
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

// §3. One swing can parry several lunging shades in the same step; the flame loss runs down shade by shade in array order.
export function resolveParries(s: State): void {
  const p = s.player
  const sw = p.swing
  if (s.meta.phase !== 'descent' || p.energy <= 0 || !sw.active) return
  for (const m of s.monsters) {
    if (m.ai !== 'lunge') continue
    const K = T.monsters[m.kind], rm = K.radiusPx
    const d = Math.hypot(m.x - p.x, m.y - p.y)
    if (d - rm > T.swing.reachPx) continue // 56 px reach to the shade's edge
    const off = Math.abs(wrapPi(Math.atan2(m.y - p.y, m.x - p.x) - sw.dir))
    if (off > deg(T.swing.arcDeg / 2) + Math.asin(Math.min(1, rm / Math.max(d, rm)))) continue // arc widened by body size
    const delta = (m.aiT - sw.t) - K.contactS // lunge time at swing start minus the perfect moment (R-129: never an equality test)
    if (delta + EPS < -T.parry.earlyMaxS) continue // R-127: exactly -earlyMaxS stays inside; swing far too early whiffs this shade
    const { grade, loss } = parryLoss(delta, m.kind, p.activeMineral)
    const applied = s.debug.freezeTorch ? 0 : Math.min(p.energy, loss)
    p.energy -= applied
    if (p.energy <= 0) {
      p.energy = 0
      if (applied > 0) emit(s, 'flameOut', p.x, p.y) // only on the lit -> out edge; a later shade of the same swing must not repeat it
    }
    setDying(s, m) // emits monsterDie; every graded parry kills
    const st = p.stats
    st.kills += 1
    st.parries += 1
    if (grade === 'perfect') st.perfectParries += 1
    st.energyLostToHits += applied
    p.parry = { lastGrade: grade, lastDelta: delta, lastAt: s.meta.steps, energyLost: applied }
    emit(s, grade === 'perfect' ? 'parryPerfect' : grade === 'good' ? 'parryGood' : 'parryPoor', m.x, m.y, delta)
    if (grade === 'perfect') {
      s.fx.flare = T.parry.flareS
      s.fx.hitstop = T.parry.hitstopS
      addShake(s, 'parryPerfect')
    }
  }
}

// §4 + R-066: latch on the swept capsule of this step, then bite after the late-parry span (descent) or at once (escape).
export function resolveBites(s: State): void {
  const p = s.player
  const delay = s.meta.phase === 'escape' ? 0 : T.parry.lateMaxS
  for (const m of s.monsters) {
    if (m.ai !== 'lunge') continue
    const K = T.monsters[m.kind]
    if (m.contactT < 0 && segDist(m.lastX, m.lastY, m.x, m.y, p.x, p.y) <= T.player.radiusPx + K.radiusPx + K.biteSlackPx) m.contactT = m.aiT
    if (m.contactT < 0) continue
    if (m.aiT + EPS >= m.contactT + delay) damagePlayer(s, m) // R-127; damagePlayer moves m out of 'lunge'
  }
}

// §4.1 rules 1-6 in table order. Always moves m out of 'lunge' (dying or recover), so a shade bites at most once per lunge.
export function damagePlayer(s: State, m: Monster): void {
  if (m.ai === 'dying') return // already dying: no energy, no recover (toRecover would revive it)
  const p = s.player
  const descent = s.meta.phase === 'descent'
  if (s.debug.god) return toRecover(s, m) // 1
  if (!descent && p.roll.invuln > 0) { // 2: dodge; i-frames protect against bites only
    emit(s, 'dodge', p.x, p.y)
    return toRecover(s, m)
  }
  if (p.hurtT > EPS) { // 3: R-127 epsilon, see hurtPlayerHp
    if (descent && p.energy > 0) setDying(s, m) // R-149: dies at the flame, NO kill credit
    else toRecover(s, m)
    return
  }
  if (descent && p.energy > 0) { // 4
    const applied = s.debug.freezeTorch ? 0 : Math.min(p.energy, T.monsters[m.kind].energyHitE)
    p.energy -= applied
    p.hurtT = T.flame.flameHitInvulnS
    p.hitFlash = T.hurt.flashS
    p.stats.energyLostToHits += applied
    p.stats.kills += 1
    setDying(s, m)
    emit(s, 'flameHit', p.x, p.y, applied)
    if (p.energy <= 0) {
      p.energy = 0
      emit(s, 'flameOut', p.x, p.y)
    }
    addShake(s, 'flameHit')
    return
  }
  hurtPlayerHp(s, 'bite') // 5 (descent, flame out) and 6 (escape, no roll): HP only if not hurt/god, the attacker survives
  toRecover(s, m)
}
