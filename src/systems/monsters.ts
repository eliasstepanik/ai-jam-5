// L3 systems: monster step. Brain table, shared pipeline (ring/windup/lunge/recover/stunned/dying), separation, stuck handling.
// Spec: docs/architecture-monsters-ai.md §1, §3.4, §4, §5, §5.1; monsters-ai-2 §4; systems-3 §1. Rulings: R-004, R-013, R-064, R-073,
// R-127 (accumulated time compares x + EPS >= limit), R-129 (no float equality on contactS), R-130 (beat is a 0-based index), R-012.
// Layer rule: never import combat.ts, beacon.ts or quake.ts. The bite latch and damagePlayer live in combat.ts (A27 part 2);
// this file only sticks a latched shade to the player and handles the miss, the wall bonk and the recover.
// ponytail: escape phase is slice B3 (ai-escape.ts: intercept brain, constant lunges, aim lead). Today stepMonsters runs the descent
// pipeline in every phase; no escape director exists yet, so no shade is alive there.
import type { Monster, MonsterKind, State } from '../core/types.ts'
import { wrapPi } from '../core/math.ts'
import { rand, randRange } from '../core/rng.ts'
import { T, zt } from '../core/tuning.ts'
import { blend, seek } from '../entities/steer.ts'
import { moveCircle } from '../world/collide.ts'
import { lineOfSightPx } from '../world/los.ts'
import type { Brain } from './ai-lurker.ts'
import { lurkerBrain } from './ai-lurker.ts'
import { findSpawn } from './director.ts'
import { emit } from './fx.ts'
import { insideLight } from './light.ts'

const EPS = 1e-9 // R-127
const KIND_INDEX: Record<MonsterKind, number> = { lurker: 0, stalker: 1, devourer: 2 } // fx event `a` (systems-4 §4)
const RING_BAND_PX = 40 // §4: lurker/stalker may only start a windup this close to their ring
const STALKER_BEHIND_S = 0.25 // §4/§7: stalker needs this long behind the player (no T key; spec literal)
const NO_VELOCITY: readonly [number, number] = [0, 0]

// R-075: Brain = (s, m) => [vx, vy]. The brain runs in ring / stalk / recover (it owns the flee latch and m.ringRadius).
// ponytail: slice A holds only the lurker brain. Stalker (ai-stalker.ts, B3) and devourer (ai-devourer.ts, C1) fall back to it:
// they ring like lurkers with their own numbers, and a stalker never attacks because only its brain advances behindT.
const BRAINS: Partial<Record<MonsterKind, Brain>> = { lurker: lurkerBrain }

// R-073: the only writers of dying / recover. Combat, beacon and rocks call these, so events and timers are never skipped.
export function setDying(s: State, m: Monster): void {
  m.ai = 'dying'
  m.aiT = 0
  m.aiDur = T.monsters[m.kind].dyingS
  m.vx = 0
  m.vy = 0
  emit(s, 'monsterDie', m.x, m.y, KIND_INDEX[m.kind])
}

export function toRecover(s: State, m: Monster): void {
  const K = T.monsters[m.kind], esc = s.meta.phase === 'escape'
  m.ai = 'recover'
  m.aiT = 0
  m.aiDur = esc ? T.escape.recoverS : K.recoverS
  m.lungeCd = randRange(s, 'gameplay', ...(esc ? K.escapeLungeCdS : K.lungeCdS))
}

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
  if (m.kind !== 'devourer' && Math.abs(d - m.ringRadius) > RING_BAND_PX) return false
  if (m.kind === 'stalker' && m.behindT + EPS < STALKER_BEHIND_S) return false
  let used = 0
  for (const o of s.monsters) if (o.ai === 'windup' || o.ai === 'lunge') used += 1
  return used < zt(T.director.attackSlots, s.meta.zone) && lineOfSightPx(s, m.x, m.y, p.x, p.y) // R-013
}

function walk(s: State, m: Monster, dt: number): boolean { // true if a wall was hit
  const res = moveCircle(s, m.x, m.y, m.vx * dt, m.vy * dt, T.monsters[m.kind].radiusPx)
  m.x = res.x
  m.y = res.y
  return res.hitX || res.hitY
}

function startLunge(s: State, m: Monster): void {
  const p = s.player, K = T.monsters[m.kind]
  m.lungeDir = Math.atan2(p.y - m.y, p.x - m.x) // locked now
  const d0 = Math.hypot(m.x - p.x, m.y - p.y)
  const vL = Math.max(30, d0 - T.player.radiusPx - K.radiusPx) / K.contactS
  m.vx = Math.cos(m.lungeDir) * vL
  m.vy = Math.sin(m.lungeDir) * vL
  m.ai = 'lunge'
  m.aiT = 0
  m.aiDur = 0 // open-ended: bite, parry (combat) or the miss test below end it
  m.contactT = -1
  emit(s, 'lunge', m.x, m.y, KIND_INDEX[m.kind])
}

function recoverVelocity(s: State, m: Monster): [number, number] {
  const p = s.player, K = T.monsters[m.kind]
  m.ringAngle = Math.atan2(m.y - p.y, m.x - p.x) // resume the orbit in place after the back-off
  const r = m.ringRadius + T.ai.recoverBackPx + (m.kind === 'stalker' ? T.ai.stalkerRetreatPx : 0)
  return seek(m.x, m.y, p.x + Math.cos(m.ringAngle) * r, p.y + Math.sin(m.ringAngle) * r, K.ringSpeedPxS * 1.2)
}

// §5: one step of the state machine. `desired` is the brain's velocity (only used in ring / stalk).
function pipeline(s: State, m: Monster, desired: readonly [number, number], dt: number): void {
  const p = s.player, K = T.monsters[m.kind]
  switch (m.ai) {
    case 'dying': // no movement, no collision
      m.vx = 0
      m.vy = 0
      return
    case 'ring':
    case 'stalk':
      blend(m, desired[0], desired[1], K.steerPerS, dt)
      walk(s, m, dt)
      if (eligible(s, m) && rand(s, 'gameplay') < 1 - Math.exp(-lungeHazard(s, m) * dt)) { // draw only when eligible
        m.ai = 'windup'
        m.aiT = 0
        m.aiDur = K.telegraphS
        m.lungeDir = Math.atan2(p.y - m.y, p.x - m.x)
        m.beat = 0
        m.contactT = -1
        emit(s, 'windup', m.x, m.y, 0)
      }
      return
    case 'windup':
      blend(m, 0, 0, 12, dt)
      walk(s, m, dt)
      m.lungeDir = Math.atan2(p.y - m.y, p.x - m.x) // eyes track until the lock at lunge start
      if (m.beat + 1 < K.beats && m.aiT + EPS >= (m.beat + 1) * K.telegraphS / K.beats) { // devourer second beat
        m.beat += 1
        emit(s, 'windup', m.x, m.y, m.beat)
      }
      if (m.aiT + EPS >= m.aiDur) startLunge(s, m)
      return
    case 'lunge':
      if (m.contactT >= 0) { // latched by combat: stick to the player
        const dx = m.x - p.x, dy = m.y - p.y, L = Math.hypot(dx, dy)
        const ux = L < 1e-6 ? Math.cos(m.lungeDir + Math.PI) : dx / L, uy = L < 1e-6 ? Math.sin(m.lungeDir + Math.PI) : dy / L
        m.x = p.x + (T.player.radiusPx + K.radiusPx) * ux
        m.y = p.y + (T.player.radiusPx + K.radiusPx) * uy
        m.vx = 0
        m.vy = 0
      } else if (walk(s, m, dt)) { // wall bonk: the lunge was a miss
        m.ai = 'stunned'
        m.aiT = 0
        m.aiDur = T.ai.bonkS
        m.stunned = T.ai.bonkS
        m.vx = 0
        m.vy = 0
      } else if (m.aiT + EPS >= K.contactS + K.lungeOverrunS) { // miss: drop the lunge speed before backing off
        m.vx = 0
        m.vy = 0
        toRecover(s, m)
      }
      return
    case 'recover': {
      const v = m.fleeing ? desired : recoverVelocity(s, m)
      blend(m, v[0], v[1], K.steerPerS, dt)
      walk(s, m, dt)
      if (m.aiT + EPS >= m.aiDur) {
        m.ai = m.kind === 'stalker' ? 'stalk' : 'ring'
        m.aiT = 0
        m.aiDur = 0
        m.behindT = 0
      }
      return
    }
    case 'stunned':
      blend(m, 0, 0, 8, dt)
      walk(s, m, dt)
      if (m.aiT + EPS >= m.aiDur) toRecover(s, m)
  }
}

const pushable = (m: Monster): boolean => m.ai !== 'windup' && m.ai !== 'lunge' && m.ai !== 'dying'

// §3.4. ponytail: O(n^2) pair loop (n <= T.director.monstersMax = 24); a spatial hash is pointless below ~100 entities.
function separate(s: State, dt: number): void {
  const ms = s.monsters
  for (let i = 0; i < ms.length; i++) {
    const a = ms[i]
    if (!pushable(a)) continue
    for (let j = i + 1; j < ms.length; j++) {
      const b = ms[j]
      if (!pushable(b)) continue
      const ra = T.monsters[a.kind].radiusPx, rb = T.monsters[b.kind].radiusPx
      const gap = ra + rb + T.ai.separationPx, dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy)
      if (L >= gap || L < 1e-6) continue
      const push = T.ai.separationPxS * (1 - L / gap) * dt
      const ux = dx / L * push * 0.5, uy = dy / L * push * 0.5
      const ma = moveCircle(s, a.x, a.y, -ux, -uy, ra), mb = moveCircle(s, b.x, b.y, ux, uy, rb)
      a.x = ma.x
      a.y = ma.y
      b.x = mb.x
      b.y = mb.y
    }
  }
}

// monsters-ai-2 §4. Nudge when stuckT crosses stuckNudgeS upwards, relocate at stuckRelocateS (never while seen).
// The spec writes the crossing as `(stuckT - dt) < nudge`; the previous value is kept instead, so decay never fires a nudge.
function updateStuck(s: State, m: Monster, dt: number): void {
  const want = Math.hypot(m.vx, m.vy) * dt, moved = Math.hypot(m.x - m.lastX, m.y - m.lastY), prev = m.stuckT
  const walking = m.ai === 'ring' || m.ai === 'stalk' || m.ai === 'recover'
  if (walking && want > 0.5 && moved < T.ai.stuckFrac * want) m.stuckT += dt
  else m.stuckT = Math.max(0, m.stuckT - dt)
  if (m.stuckT + EPS >= T.ai.stuckRelocateS) {
    const pos = m.seen ? null : findSpawn(s, m.kind)
    if (pos) {
      m.x = m.lastX = pos.x
      m.y = m.lastY = pos.y
      m.ringAngle = Math.atan2(pos.y - s.player.y, pos.x - s.player.x) // ring point under the shade, as spawnMonster
      m.vx = 0
      m.vy = 0
      m.stuckT = 0
      s.director.relocates += 1
      return
    }
    m.stuckT = T.ai.stuckNudgeS // seen (no pop in view) or no spawn found: nudge again, retry later
    nudge(m)
  } else if (m.stuckT + EPS >= T.ai.stuckNudgeS && prev + EPS < T.ai.stuckNudgeS) nudge(m)
}

function nudge(m: Monster): void {
  m.orbitDir = -m.orbitDir
  m.ringAngle = wrapPi(m.ringAngle + m.orbitDir * Math.PI / 3)
  if (m.kind === 'stalker') m.behindT = 0
}

export function stepMonsters(s: State, dt: number): void {
  if (s.debug.freezeAi) return
  // ponytail: spec §1 wants devourerMul once per step, but lightRadius(s) takes no multiplier and re-evaluates it per query from
  // live positions. Only a devourer moving changes it (<= 6 px per step in a lunge), so the drift inside one step is tiny.
  // Upgrade: give light.ts an optional precomputed multiplier if C1 shows a visible pop.
  for (const m of s.monsters) {
    m.lastX = m.x
    m.lastY = m.y
    m.aiT += dt
    m.lungeCd = Math.max(0, m.lungeCd - dt)
    m.stunned = Math.max(0, m.stunned - dt)
    // §2: the flee latch runs in ring / stalk / recover; the brain also steers ring / stalk, a fleeing recover takes its velocity
    const thinks = m.ai === 'ring' || m.ai === 'stalk' || m.ai === 'recover'
    pipeline(s, m, thinks ? (BRAINS[m.kind] ?? lurkerBrain)(s, m) : NO_VELOCITY, dt)
  }
  separate(s, dt)
  for (const m of s.monsters) {
    m.seen = insideLight(s, m.x, m.y, 0.5 * T.monsters[m.kind].radiusPx)
    updateStuck(s, m, dt)
  }
  for (let i = s.monsters.length - 1; i >= 0; i--) {
    const m = s.monsters[i]
    if (m.ai === 'dying' && m.aiT + EPS >= m.aiDur) s.monsters.splice(i, 1)
  }
}
