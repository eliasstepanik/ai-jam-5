import type { State } from '../core/types.ts'
import { idx, inMap, isSolidAt, worldToTile } from './grid.ts'

export function lineOfSight(s: State, a: number, b: number): boolean {
  const w = s.world.w, n = w * s.world.h
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= n || b >= n) return false
  // Canonical direction also fixes Bresenham tie-breaking when endpoints reverse.
  if (a > b) [a, b] = [b, a]
  let x = a % w, y = Math.floor(a / w)
  const bx = b % w, by = Math.floor(b / w)
  const dx = Math.abs(bx - x), dy = -Math.abs(by - y)
  const sx = x < bx ? 1 : -1, sy = y < by ? 1 : -1
  let err = dx + dy
  // ponytail: tile Bresenham can see through diagonal wall gaps (memory only).
  // Upgrade reveal to shadowcasting if cosmetic corner leaks become distracting.
  while (x !== bx || y !== by) {
    const e = 2 * err
    if (e >= dy) { err += dy; x += sx }
    if (e <= dx) { err += dx; y += sy }
    if (x === bx && y === by) break
    if (isSolidAt(s, idx(s, x, y))) return false
  }
  return true
}

export function lineOfSightPx(s: State, x0: number, y0: number, x1: number, y1: number): boolean {
  const ax = worldToTile(x0), ay = worldToTile(y0), bx = worldToTile(x1), by = worldToTile(y1)
  return inMap(s, ax, ay) && inMap(s, bx, by) && lineOfSight(s, idx(s, ax, ay), idx(s, bx, by))
}
