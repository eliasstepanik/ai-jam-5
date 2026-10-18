// L0 shared maths. clamp (G1), wrapPi (MS-5) and segDist (MS-6, R-066) live here per R-016.
// ponytail: add more helpers only when two callers need them.
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

// Wrap an angle to [-PI, PI).
export const wrapPi = (a: number): number => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI))

// Distance from point (px, py) to the segment (ax, ay)-(bx, by).
export const segDist = (ax: number, ay: number, bx: number, by: number, px: number, py: number): number => {
  const dx = bx - ax
  const dy = by - ay
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / Math.max(1e-9, dx * dx + dy * dy), 0, 1)
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}
