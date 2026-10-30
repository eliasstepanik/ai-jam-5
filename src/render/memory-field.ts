// Pure projected memory geometry: 16px samples preserve the 48px wall lift and 32px caps.
import { TILE } from '../core/state.ts'
export const MEMORY_PIXEL = TILE / 2, MEMORY_PAD = TILE
export const MEMORY_DARK = '#0a0806'
export const MEMORY_COLORS = [10, 8, 6, 32, 28, 23, 18, 15, 12] as const
export function memoryRect(w: number, h: number, lift: number) {
  return { w: (w * TILE + 2 * MEMORY_PAD) / MEMORY_PIXEL, h: (h * TILE + lift + 2 * MEMORY_PAD) / MEMORY_PIXEL,
    left: -MEMORY_PAD, top: -lift - MEMORY_PAD }
}
// Encoded owner = tile index * 2 + dark-cap flag; -1 is uniform off-map darkness.
export function memoryOwners(tiles: string, w: number, h: number, lift: number): Int32Array {
  const rect = memoryRect(w, h, lift), out = new Int32Array(rect.w * rect.h).fill(-1)
  const pad = MEMORY_PAD / MEMORY_PIXEL, raised = lift / MEMORY_PIXEL
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const owner = (y * w + x) * 2
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) out[(y * 2 + pad + raised + dy) * rect.w + x * 2 + pad + dx] = owner
  }
  // Same row order as the world: raised dark cap, then a brighter face only at an open south edge.
  // Faces share floor brightness; only the black rock cap forms the remembered wall silhouette.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (tiles[y * w + x] !== '#') continue
    const face = y + 1 < h && tiles[(y + 1) * w + x] !== '#'
    for (let dy = 0; dy < 2 + (face ? raised : 0); dy++) for (let dx = 0; dx < 2; dx++) {
      out[(y * 2 + pad + dy) * rect.w + x * 2 + pad + dx] = (y * w + x) * 2 + (dy < 2 ? 1 : 0)
    }
  }
  // Match the virtual solid rows beyond the southern boundary, whose raised caps cover this ground strip.
  const bottom = (h * TILE - lift - rect.top) / MEMORY_PIXEL
  for (let y = bottom; y < bottom + raised; y++) for (let x = pad; x < pad + w * 2; x++) out[y * rect.w + x] = -1
  return out
}
