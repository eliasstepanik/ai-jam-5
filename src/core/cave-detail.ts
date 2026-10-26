// Pure deterministic decoration choices. All details are non-blocking overlays.
import { hash2 } from './noise.ts'
const series = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => prefix + '0' + (i + 1))
export const GROUND_DETAILS = [...series('ground_pebbles_', 3), ...series('ground_rubble_', 3), ...series('ground_moss_', 2), ...series('ground_vine_', 2)]
export const WALL_DETAILS = [...series('wall_vine_', 4), ...series('wall_roots_', 2), ...series('wall_moss_', 3)]
export const detailStage = (escape: boolean, seconds: number): number => escape ? 1 + Math.min(2, Math.floor(Math.max(0, seconds) / 20)) : 0
export function floorDetail(tiles: string, w: number, h: number, x: number, y: number, seed: number, zone: number): string | null {
  const floor = (tx: number, ty: number) => tx >= 0 && tx < w && ty >= 0 && ty < h && tiles[ty * w + tx] !== '#'
  if (!floor(x, y) || !floor(x - 1, y) || !floor(x + 1, y) || !floor(x, y - 1) || !floor(x, y + 1)) return null
  if (hash2(x, y, seed ^ 0xdec0) >= 0.055) return null
  const count = zone >= 3 ? GROUND_DETAILS.length : 6
  return GROUND_DETAILS[Math.floor(hash2(x, y, seed ^ 0xdec1) * count)]
}
export function wallDetail(x: number, y: number, seed: number): string | null {
  return hash2(x, y, seed ^ 0xdec2) < 0.1 ? WALL_DETAILS[Math.floor(hash2(x, y, seed ^ 0xdec3) * WALL_DETAILS.length)] : null
}
