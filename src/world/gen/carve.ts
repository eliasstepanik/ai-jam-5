import type { Rnd } from '../../core/rng.ts'

export const MAP_BORDER = 2
export const TUN_W = 2
export const isEdge = (x: number, y: number, w: number, h: number): boolean =>
  x < MAP_BORDER || y < MAP_BORDER || x >= w - MAP_BORDER || y >= h - MAP_BORDER

export function carveDisc(g: Uint8Array, w: number, h: number, c: number, R: number): number {
  const cx = c % w, cy = (c - cx) / w
  let n = 0
  for (let y = Math.max(MAP_BORDER, cy - R); y <= Math.min(h - MAP_BORDER - 1, cy + R); y++) {
    for (let x = Math.max(MAP_BORDER, cx - R); x <= Math.min(w - MAP_BORDER - 1, cx + R); x++) {
      const dx = x - cx, dy = y - cy, i = y * w + x
      if (dx * dx + dy * dy <= R * R + R && g[i]) { g[i] = 0; n++ }
    }
  }
  return n
}

export function brush(g: Uint8Array, w: number, h: number, x: number, y: number): number {
  let n = 0
  for (let dy = 0; dy < TUN_W; dy++) for (let dx = 0; dx < TUN_W; dx++) {
    if (isEdge(x + dx, y + dy, w, h)) continue
    const i = (y + dy) * w + x + dx
    if (g[i]) { g[i] = 0; n++ }
  }
  return n
}

export function carveTunnel(g: Uint8Array, w: number, h: number, u: number, v: number, rnd: Rnd): number {
  let x = u % w, y = (u - x) / w, n = 0
  const tx = v % w, ty = (v - tx) / w
  while (x !== tx || y !== ty) {
    const dx = tx - x, dy = ty - y
    const useX = dy === 0 || (dx !== 0 && rnd.next() < Math.abs(dx) / (Math.abs(dx) + Math.abs(dy)))
    if (useX) x += Math.sign(dx)
    else y += Math.sign(dy)
    n += brush(g, w, h, x, y)
  }
  return n
}
