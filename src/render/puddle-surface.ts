// Cave overhaul A10: pure, stateless puddle surface helpers (shimmer, ambient drips, wet rim, depth tint).
// No DOM/canvas, no State, no rand(s, ..): everything derives from the pause-aware water clock and stateless hash2.
// puddles.ts (chunk A11) composes these; drips never touch fx.ripples (RIPPLE_CAP stays unaffected).
import { hash2 } from '../core/noise.ts'
import { RIPPLE_LIFE } from '../core/puddle-fx.ts'

export type PoolMask = { w: number; h: number; bits: Uint8Array }
export type Drip = { x: number; y: number; age: number; k: number }

const TAU = Math.PI * 2
// ponytail: salts stay local to this file (grep-verified unused elsewhere): 0xd819 shimmer phase (hash2 y=2) and drip timing (y=0,1), 0xd81a drip position.
// The brief forbids reusing 0x5e1a, so the shimmer phase uses 0xd819 with its own y lane instead of the design's 0x5e1a.
const TIME_SALT = 0xd819, POS_SALT = 0xd81a

// Final pool alpha: 0.34 +/- 0.06 so it never leaves [0.28, 0.40]; per-tile phase keeps pools out of step.
export function shimmerAlpha(clock: number, tile: number): number {
  const a = 0.34 + 0.06 * Math.sin(TAU * (0.25 * clock + hash2(tile, 2, TIME_SALT)))
  return Math.min(0.40, Math.max(0.28, a))
}

// Ambient drip ring for one pool at `clock`, or null. Period 1.6..4.0 s is longer than RIPPLE_LIFE (0.85 s),
// so a tile never has more than one ring alive. Position: first set mask bit among 4 tries per cycle, else no drip this cycle.
export function dripOf(tile: number, clock: number, mask: PoolMask): Drip | null {
  const n = mask.w * mask.h
  if (n <= 0) return null
  const period = 1.6 + 2.4 * hash2(tile, 0, TIME_SALT)
  const t = Math.max(0, clock) + hash2(tile, 1, TIME_SALT) * period
  const k = Math.floor(t / period), age = (t - k * period) / RIPPLE_LIFE
  if (age >= 1) return null
  for (let j = 0; j < 4; j++) {
    const i = Math.min(n - 1, Math.floor(hash2(tile, k * 4 + j, POS_SALT) * n))
    if (mask.bits[i]) return { x: i % mask.w, y: Math.floor(i / mask.w), age, k }
  }
  return null
}

// Rim = interior bits with a non-interior 4-neighbour (outside the mask counts as non-interior). Cached per mask object.
// ponytail: WeakMap keyed on the mask object; masks are immutable once built (waterSurfaceMask replaces them, never edits bits).
const rims = new WeakMap<object, Uint8Array>()
export function rimOf(mask: PoolMask): Uint8Array {
  const hit = rims.get(mask)
  if (hit) return hit
  const { w, h, bits } = mask, rim = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    if (!bits[i]) continue
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !bits[i - 1] || !bits[i + 1] || !bits[i - w] || !bits[i + w]) rim[i] = 1
  }
  rims.set(mask, rim)
  return rim
}

// Pool tint: the old muddy rgba(90,76,47,0.3) at the entrance, lerping to a cold dark rgba(34,42,54,0.42) at depth 1.
export function poolTint(d: number): string {
  const k = Number.isFinite(d) ? Math.min(1, Math.max(0, d)) : 0
  const lerp = (a: number, b: number): number => a + (b - a) * k
  return 'rgba(' + Math.round(lerp(90, 34)) + ',' + Math.round(lerp(76, 42)) + ',' + Math.round(lerp(47, 54)) + ',' + Number(lerp(0.3, 0.42).toFixed(3)) + ')'
}
