import type { State } from '../core/types.ts'
import { idx, inMap, TILE, tileToWorld, worldToTile } from './grid.ts'
import { lineOfSight } from './los.ts'

export const isExplored = (e: readonly number[], i: number): boolean =>
  ((e[i >> 5] >>> (i & 31)) & 1) === 1

export function markExplored(e: number[], i: number): boolean {
  const m = 1 << (i & 31), old = e[i >> 5]
  if (old & m) return false
  e[i >> 5] = old | m // Signed int32 words are intentional and survive JSON.
  return true
}

export function revealAround(s: State, x: number, y: number, R: number): number {
  const tx = worldToTile(x), ty = worldToTile(y)
  if (!inMap(s, tx, ty) || !Number.isFinite(R) || R < 0) return 0
  const pt = idx(s, tx, ty), rt = Math.ceil(R / TILE), e = s.world.explored
  let count = 0
  for (let cy = Math.max(0, ty - rt); cy <= Math.min(s.world.h - 1, ty + rt); cy++) {
    for (let cx = Math.max(0, tx - rt); cx <= Math.min(s.world.w - 1, tx + rt); cx++) {
      const i = idx(s, cx, cy)
      if (isExplored(e, i)) continue
      if ((tileToWorld(cx) - x) ** 2 + (tileToWorld(cy) - y) ** 2 > R * R) continue
      if (lineOfSight(s, pt, i) && markExplored(e, i)) count++
    }
  }
  return count
}
