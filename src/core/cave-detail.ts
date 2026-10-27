// Pure deterministic decoration choices. All details are non-blocking overlays.
import { hash2 } from './noise.ts'
const series = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => prefix + '0' + (i + 1))
export const GROUND_DETAILS = [...series('ground_pebbles_', 3), ...series('ground_rubble_', 3), ...series('ground_moss_', 2), ...series('ground_vine_', 2)]
export const WALL_DETAILS = [...series('wall_vine_', 4), ...series('wall_roots_', 2), ...series('wall_moss_', 3)]
export const detailStage = (escape: boolean, seconds: number): number => escape ? 1 + Math.min(2, Math.floor(Math.max(0, seconds) / 20)) : 0
const unit = (d: number): number => d > 0 ? Math.min(1, d) : 0 // clamp to [0,1]; NaN -> 0
// ponytail: local copy of render/depth-tone.ts vineDensity (core must not import render), curve from
// projects/ai-jam-5/cave-overhaul-design-render.md §2. Keep both numerically identical.
const vineDensity = (d: number, wet: boolean): number => Math.pow(Math.max(0, 1 - d / (wet ? 0.7 : 0.55)), 1.5)
// Pick a family by cumulative weight; u in [0,1). Weights are non-negative and sum > 0.
function pickFamily(weights: readonly number[], u: number): number {
  let r = u * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < weights.length; i++) { if (r < weights[i]) return i; r -= weights[i] }
  return weights.length - 1
}
const frame = (names: readonly string[], from: number, n: number, u: number): string => names[from + Math.floor(u * n)]
// depth01 in [0,1] (0 = entrance, 1 = Beacon); wet = near water. Replaces the old zone integer.
export function floorDetail(tiles: string, w: number, h: number, x: number, y: number, seed: number, depth01: number, wet = false): string | null {
  const floor = (tx: number, ty: number) => tx >= 0 && tx < w && ty >= 0 && ty < h && tiles[ty * w + tx] !== '#'
  if (!floor(x, y) || !floor(x - 1, y) || !floor(x + 1, y) || !floor(x, y - 1) || !floor(x, y + 1)) return null
  const d = unit(depth01)
  if (hash2(x, y, seed ^ 0xdec0) >= 0.045 + 0.03 * d) return null
  let wallAdj = false
  for (let dy = -2; dy <= 2 && !wallAdj; dy++) for (let dx = -2; dx <= 2; dx++) {
    const tx = x + dx, ty = y + dy
    if (tx >= 0 && tx < w && ty >= 0 && ty < h && tiles[ty * w + tx] === '#') { wallAdj = true; break }
  }
  // families in GROUND_DETAILS order: pebbles(3), rubble(3), moss(2), vine(2)
  const fam = pickFamily([0.5, 0.2 + 1.6 * d + (wallAdj ? 0.6 : 0), 0.6 * (1 - d) + (wet ? 0.8 : 0), wallAdj ? 2.5 * vineDensity(d, wet) : 0], hash2(x, y, seed ^ 0xdec1))
  const u = hash2(x, y, seed ^ 0xdec4)
  return fam === 0 ? frame(GROUND_DETAILS, 0, 3, u) : fam === 1 ? frame(GROUND_DETAILS, 3, 3, u) : fam === 2 ? frame(GROUND_DETAILS, 6, 2, u) : frame(GROUND_DETAILS, 8, 2, u)
}
export function wallDetail(x: number, y: number, seed: number, depth01 = 1, wet = false): string | null {
  const d = unit(depth01), vd = vineDensity(d, wet)
  if (hash2(x, y, seed ^ 0xdec2) >= 0.1 + 0.12 * vd) return null
  // families in WALL_DETAILS order: vine(4), roots(2), moss(3)
  const fam = pickFamily([3 * vd, 0.3 + 0.5 * (1 - d), 0.4 + (wet ? 0.6 : 0)], hash2(x, y, seed ^ 0xdec3))
  const u = hash2(x, y, seed ^ 0xdec5)
  return fam === 0 ? frame(WALL_DETAILS, 0, 4, u) : fam === 1 ? frame(WALL_DETAILS, 4, 2, u) : frame(WALL_DETAILS, 6, 3, u)
}
