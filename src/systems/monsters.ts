// L3 systems: monster step. Brain table, shared pipeline (ring/windup/lunge/recover/stunned/dying), separation, stuck handling.
// Spec: docs/architecture-monsters-ai.md §1, §3.4, §4, §5, §5.1; monsters-ai-2 §4; systems-3 §1. Rulings: R-004, R-013, R-064, R-073,
// R-127 (accumulated time compares x + EPS >= limit), R-129 (no float equality on contactS), R-130 (beat is a 0-based index), R-012.
// Layer rule: never import combat.ts, beacon.ts or quake.ts. The bite latch and damagePlayer live in combat.ts (A27 part 2);
// this file only sticks a latched shade to the player and handles the miss, the wall bonk and the recover.
// Escape phase (B3): escapeBrain steers every kind, the hazard draw is replaced by escapeStrike (constant lunges) and the lunge aims
// at p + v * escapeLeadS (ai-escape.ts); windup / lunge / recover stay in this shared pipeline.
import type { Monster, MonsterKind, State } from '../core/types.ts'
import { wrapPi } from '../core/math.ts'
import { rand, randRange } from '../core/rng.ts'
import { T, zt } from '../core/tuning.ts'
import { blend, seek } from '../entities/steer.ts'
import { moveCircle } from '../world/collide.ts'
import { lineOfSightPx } from '../world/los.ts'
import type { Brain } from './ai-lurker.ts'
import { escapeAim, escapeBrain, escapeStrike } from './ai-escape.ts'
import { flowSeek } from './ai-flow.ts'
import { patrolBrain } from './ai-patrol.ts'
import { retreatBrain, startRetreat } from './ai-retreat.ts'
import { devourerBrain } from './ai-devourer.ts'
import { lurkerBrain } from './ai-lurker.ts'
import { RING_BAND_PX, STALKER_BEHIND_S, stalkerBrain } from './ai-stalker.ts'
import { searchVelocity, stepAwareness } from './awareness.ts'
import { findSpawn } from './director.ts'
import { emit } from './fx.ts'
import { insideLight } from './light.ts'

const EPS = 1e-9 // R-127
const KIND_INDEX: Record<MonsterKind, number> = { lurker: 0, stalker: 1, devourer: 2 } // fx event `a` (systems-4 §4)
const NO_VELOCITY: readonly [number, number] = [0, 0]

// R-075: Brain = (s, m) => [vx, vy]. The brain runs in ring / stalk / recover (it owns the flee latch and m.ringRadius).
const BRAINS: Partial<Record<MonsterKind, Brain>> = { lurker: lurkerBrain, stalker: stalkerBrain, devourer: devourerBrain }

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
  if (m.awareness !== 'hunting') return false // #113 C4 retrospect: only shades that have noticed the player may lunge (escape forces hunting)
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

export function startLunge(s: State, m: Monster): void {
  const K = T.monsters[m.kind]
  const [ax, ay] = s.meta.phase === 'escape' ? escapeAim(s, m) : [s.player.x, s.player.y] // escape: lead the moving player
  m.lungeDir = Math.atan2(ay - m.y, ax - m.x) // locked now
  const d0 = Math.hypot(m.x - ax, m.y - ay)
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
  if (s.meta.phase === 'escape') { // no ring in the dark-free cave: drift 40 px straight away from the player (monsters-ai-2 §2)
    return seek(m.x, m.y, m.x + Math.cos(m.ringAngle) * T.ai.recoverBackPx, m.y + Math.sin(m.ringAngle) * T.ai.recoverBackPx,
      K.ringSpeedPxS * 1.2)
  }
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
      // escape: constant lunges (no hazard draw); descent: draw only when eligible
      if (s.meta.phase === 'escape' ? escapeStrike(s, m) : eligible(s, m) && rand(s, 'gameplay') < 1 - Math.exp(-lungeHazard(s, m) * dt)) {
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

// §3.4. ponytail: O(n^2) pair loop (n <= T.director.monstersMax = 24), pushes summed per monster and collided once (moveCircle is O(n)). Ceiling: moveCircle clamps a large summed push, thin walls can leak; upgrade: per-pair sub-steps.
function separate(s: State, dt: number): void {
  const ms = s.monsters
  const px = new Float64Array(ms.length), py = new Float64Array(ms.length)
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
      px[i] -= ux
      py[i] -= uy
      px[j] += ux
      py[j] += uy
    }
  }
  for (let i = 0; i < ms.length; i++) {
    if (px[i] === 0 && py[i] === 0) continue
    const m = ms[i]
    const r = moveCircle(s, m.x, m.y, px[i], py[i], T.monsters[m.kind].radiusPx)
    m.x = r.x
    m.y = r.y
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
  for (const m of s.monsters) {
    m.lastX = m.x
    m.lastY = m.y
    const newlyDying = m.ai === 'dying' && m.aiT === 0 // setDying zeroes aiT (combat D13/D14 land after this loop) -> read before the increment
    m.aiT += dt
    m.lungeCd = Math.max(0, m.lungeCd - dt)
    m.stunned = Math.max(0, m.stunned - dt)
    stepAwareness(s, m, dt) // issue #113 step 1: perception first, it picks which desired velocity the pipeline gets
    // §2: the flee latch runs in ring / stalk / recover; the brain also steers ring / stalk, a fleeing recover takes its velocity
    const thinks = m.ai === 'ring' || m.ai === 'stalk' || m.ai === 'recover'
    const esc = s.meta.phase === 'escape', brain = esc ? escapeBrain : (BRAINS[m.kind] ?? lurkerBrain)
    // C4 (b): full flame scatters near hunting shades (strict >; devourers never flee; the escape phase stays relentless)
    if (!esc && m.kind !== 'devourer' && m.awareness === 'hunting' && m.retreatT <= 0
      && (m.ai === 'ring' || m.ai === 'stalk') && s.player.energy > T.ai.flameRetreat
      && Math.hypot(m.x - s.player.x, m.y - s.player.y) < T.director.nearRadius) startRetreat(m)
    // hunting (and the relentless escape phase) = kind brain; searching = walk to lastKnown (or flee the light);
    // unaware = patrol (B4), suspicious = hold. AC7: a lit unaware/suspicious monster flees the light -
    // ponytail: reuse searchVelocity's light branch as the flee vector (identical math, gated on the monster itself
    // being lit so a stale lastKnown never triggers it); upgrade: export a fleeLight helper from awareness.ts if a third caller appears.
    // C4 (a): a hunting shade with retreatT > 0 flees instead of orbiting (in this branch !esc implies hunting)
    const retreating = !esc && m.kind !== 'devourer' && m.retreatT > 0 && (m.ai === 'ring' || m.ai === 'stalk')
    let want = !thinks ? NO_VELOCITY : esc || m.awareness === 'hunting'
      ? retreating ? retreatBrain(s, m) : brain(s, m)
      : m.awareness === 'searching' || insideLight(s, m.x, m.y) ? searchVelocity(s, m)
      : m.awareness === 'unaware' ? patrolBrain(s, m) : NO_VELOCITY
    // F6 (#113 step 6): a stuck hunting/searching shade follows the windowed flow field instead of
    // straight seek (retreat keeps retreatBrain; field rooted at player tile - ponytail in ai-flow.ts).
    if (!esc && !retreating && (m.ai === 'ring' || m.ai === 'stalk') && m.stuckT > T.ai.flowStuckT
      && (m.awareness === 'hunting' || m.awareness === 'searching')
      // AC7: light-flee outranks flow. Hunting: the brain's flee latch ran this frame in the want ternary above
      // (devourerBrain pins fleeing false, so it is never skipped). Searching: mirrors searchVelocity's flee predicate.
      && !(m.awareness === 'hunting' ? m.fleeing
        : insideLight(s, m.x, m.y) || insideLight(s, m.lastKnownX, m.lastKnownY))) {
      const K = T.monsters[m.kind], hunt = m.awareness === 'hunting'
      want = flowSeek(s, m, hunt ? s.player.x : m.lastKnownX, hunt ? s.player.y : m.lastKnownY,
        hunt ? K.chaseSpeedPxS : K.ringSpeedPxS)
    }
    const prevAi = m.ai
    pipeline(s, m, want, dt)
    // C4 (c)/(d): encounter end in descent (recover exit, or newly dying) -> retreat + calm spawn floor (no new Director field)
    if (!esc && (newlyDying || (m.kind !== 'devourer' && prevAi === 'recover' && m.ai !== 'recover' && m.ai !== 'dying'))) {
      if (prevAi === 'recover' && m.ai !== 'recover' && m.ai !== 'dying') startRetreat(m)
      s.director.spawnT = Math.max(s.director.spawnT, T.director.calmS)
    }
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
