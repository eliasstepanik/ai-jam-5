// L0 core: stateless integer hash and 1D value noise. Pure, DOM-free, integer ops only.
// Spec: docs/architecture-render-2.md §1 (code verbatim), moved from src/render by R-008.
// Event noise `noise(e.seq, i)` (determinism §3) is not defined here: no spec assigns it to this file.

// Stateless integer hash -> [0, 1). Used for floor variants, shake, eye phase, flicker.
export function hash2(x: number, y: number, salt: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// 1D value noise in [-1, 1], smooth (cosine interpolation between integer lattice points).
export function vnoise(t: number, salt: number): number {
  const i = Math.floor(t)
  const f = t - i
  const a = hash2(i, 0, salt) * 2 - 1
  const b = hash2(i + 1, 0, salt) * 2 - 1
  const k = (1 - Math.cos(f * Math.PI)) / 2
  return a + (b - a) * k
}

export const quantAngle = (a: number): number => Math.round(a / (Math.PI / 8)) * (Math.PI / 8) // 16 steps
