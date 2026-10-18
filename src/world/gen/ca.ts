import type { Rnd } from '../../core/rng.ts'
import { isEdge } from './carve.ts'

export const FILL_WALL = 0.45
export const CA_ITERS = 5

export function noiseFill(g: Uint8Array, w: number, h: number, rnd: Rnd, M: Uint8Array, p = FILL_WALL): void {
  for (let i = 0; i < w * h; i++) {
    const x = i % w, r = rnd.next() // Always draw, including masked and border cells.
    g[i] = M[i] || isEdge(x, (i - x) / w, w, h) || r < p ? 1 : 0
  }
}

export function smooth(g: Uint8Array, w: number, h: number): Uint8Array {
  let a: Uint8Array = g, b: Uint8Array = new Uint8Array(w * h)
  for (let it = 0; it < CA_ITERS; it++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (isEdge(x, y, w, h)) { b[i] = 1; continue }
      let n = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += a[i + dy * w + dx]
      n -= a[i]
      b[i] = n >= (a[i] ? 4 : 5) ? 1 : 0
    }
    const t = a; a = b; b = t
  }
  return a
}

const BLOCKS: readonly (readonly [number, number])[] = [[0, 0], [-1, 0], [0, -1], [-1, -1]]

export function widen(g: Uint8Array, w: number, h: number): void {
  // ponytail: 2x2 cover, not a true 2-wide medial axis; dilate floor by 1 tile if devourers stall in playtests.
  for (let i = 0; i < w * h; i++) {
    if (g[i]) continue
    const x = i % w, y = (i - x) / w
    let best = -1, bestWalls = 5
    for (const [ox, oy] of BLOCKS) {
      const bx = x + ox, by = y + oy
      if (isEdge(bx, by, w, h) || isEdge(bx + 1, by + 1, w, h)) continue
      const j = by * w + bx, walls = g[j] + g[j + 1] + g[j + w] + g[j + w + 1]
      if (walls < bestWalls) { bestWalls = walls; best = j }
    }
    if (best < 0) g[i] = 1
    else if (bestWalls > 0) g[best] = g[best + 1] = g[best + w] = g[best + w + 1] = 0
  }
}

// Forward index order; carve the top wall of either diagonal-only 2x2 pattern.
export function fixDiagonals(g: Uint8Array, w: number, h: number): void {
  for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
    const i = y * w + x
    let wall = -1
    if (!g[i] && g[i + 1] && g[i + w] && !g[i + w + 1]) wall = i + 1
    else if (g[i] && !g[i + 1] && !g[i + w] && g[i + w + 1]) wall = i
    if (wall >= 0 && !isEdge(wall % w, Math.floor(wall / w), w, h)) g[wall] = 0
  }
}
