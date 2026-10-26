// L3 cosmetic schedules, profiles and reference trajectories for shadow pixels.
// The painter uses the slot/cycle/age metadata to retain births inside actual sprite pixels.
// Pure: reads simulation time and AI mode, never writes gameplay state or consumes its RNG.
import type { Monster, MonsterKind, State } from '../core/types.ts'
import { hash2 } from '../core/noise.ts'

export type MistMode = 'idle' | 'move' | 'windup' | 'lunge' | 'dying'
// n wisps at rest, cap per monster, r wisp radius px, spread body radius px they start in, rise px climbed over one life, life s of
// one wisp, trail s of velocity a wisp lags behind a moving body, alpha peak opacity at rest.
export type MistProfile = { n: number; cap: number; r: number; spread: number; rise: number; life: number; trail: number; alpha: number }

// Per-kind tuning (DEFAULT, architect): lurker = small and quick, stalker = long thin trail, devourer = big and dense.
export const MIST: Record<MonsterKind, MistProfile> = {
  lurker: { n: 10, cap: 24, r: 7, spread: 8, rise: 4, life: 0.65, trail: 0.18, alpha: 0.22 },
  stalker: { n: 12, cap: 28, r: 9, spread: 11, rise: 5, life: 0.75, trail: 0.3, alpha: 0.2 },
  devourer: { n: 22, cap: 44, r: 16, spread: 22, rise: 6, life: 0.9, trail: 0.2, alpha: 0.28 },
}
export const MIST_GLOBAL_CAP = 96 // wisps drawn per frame over all monsters (the pool of particles.ts holds 512)
const DENSITY: Record<MistMode, number> = { idle: 1, move: 1.25, windup: 1.8, lunge: 2.2, dying: 1 } // x profile.n
const OPACITY: Record<MistMode, number> = { idle: 1, move: 1, windup: 1.3, lunge: 1.5, dying: 1 } // x profile.alpha
const MOVE_V = 5 // px/s, same threshold as render/entities.ts MON_MOVE_SPEED
const TRAIL_V = 240 // px/s, speed at which the trail stops growing
const FLAT = 0.6 // wisps spread flatter than tall: the 3/4 view squashes a ground-level circle
const BURST = 1.5 // dying: wisps fly this many spreads outward while they fade
const S_PHASE = 0x4d31, S_ANG = 0x4d32, S_RAD = 0x4d33 // DEFAULT: hash salts, distinct from the other cosmetic users of hash2

// What the mist does. Frozen AI (dev panel) holds every shade at rest, so its mist idles instead of following a stale lunge.
export function mistMode(s: State, m: Monster): MistMode {
  if (s.debug.freezeAi) return 'idle'
  if (m.ai === 'dying') return 'dying'
  if (m.ai === 'windup') return 'windup'
  if (m.ai === 'lunge') return 'lunge'
  return Math.hypot(m.vx, m.vy) > MOVE_V ? 'move' : 'idle'
}

// Wisps wanted for one monster: profile count x state density x quality tier, capped per monster. reducedFlash drops the thickening.
export function mistCount(s: State, m: Monster, qMul: number): number {
  const P = MIST[m.kind], mul = s.settings.reducedFlash ? 1 : DENSITY[mistMode(s, m)]
  return Math.min(P.cap, Math.max(0, Math.round(P.n * mul * qMul)))
}

// Reference x/y are relative to the body centre. Sprite painters use m/slot/cycle/age for precise retained birth sites.
export type MistEmit = (kind: MonsterKind, x: number, y: number, r: number, a: number, m: Monster, slot: number, cycle: number, age: number) => void

function wisp(s: State, m: Monster, k: number, mode: MistMode, emit: MistEmit): void {
  const P = MIST[m.kind], key = m.id * 64 + k
  const u = s.meta.time / P.life + hash2(key, 0, S_PHASE), cycle = Math.floor(u), f = u - cycle // f 0..1 age of this life of the wisp
  const ang = hash2(key, cycle, S_ANG) * Math.PI * 2, rad = P.spread * Math.sqrt(hash2(key, cycle, S_RAD))
  const calm = s.settings.reducedFlash
  let x = m.x + Math.cos(ang) * rad, y = m.y + Math.sin(ang) * rad * FLAT - P.rise * f
  let r = P.r * (1 - 0.8 * f), a = P.alpha * (calm ? 1 : OPACITY[mode]) * Math.sin(Math.PI * f) // fades in and out over its life
  if (mode === 'move' || mode === 'lunge') { // lags behind the body: the older the wisp, the further back along the velocity
    const sp = Math.hypot(m.vx, m.vy), g = sp > TRAIL_V ? TRAIL_V / sp : 1
    x -= m.vx * g * P.trail * f
    y -= m.vy * g * P.trail * f
  } else if (mode === 'dying') { // disperses: wisps fly outward and the whole cloud fades with the death animation
    const d = m.aiDur > 0 ? Math.min(1, Math.max(0, m.aiT / m.aiDur)) : 1
    x += Math.cos(ang) * P.spread * BURST * d
    y += Math.sin(ang) * P.spread * BURST * d * FLAT
    r *= 1 - d
    a *= 1 - d
  }
  emit(m.kind, x, y, r, a, m, k, cycle, f)
}

// Calls emit for every wisp of the monsters `visible` accepts, up to MIST_GLOBAL_CAP in s.monsters order; returns how many.
// Monsters the painter would cull do not use up the budget. ponytail: first come, first served; upgrade: sort by distance to the player.
export function eachMist(s: State, qMul: number, visible: (m: Monster) => boolean, emit: MistEmit): number {
  let used = 0
  for (const m of s.monsters) {
    if (used >= MIST_GLOBAL_CAP) break
    if (!visible(m)) continue
    const n = Math.min(mistCount(s, m, qMul), MIST_GLOBAL_CAP - used), mode = mistMode(s, m)
    for (let k = 0; k < n; k++) wisp(s, m, k, mode, emit)
    used += n
  }
  return used
}
