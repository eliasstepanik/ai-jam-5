// Visual wall mount near the unchanged entrance interaction/spawn tile. No terrain or gameplay changes.
import type { State } from '../core/types.ts'

export function entranceWall(s: State): { tx: number; ty: number } | null {
  const { w, h, tiles, entrance: e } = s.world
  let best: { tx: number; ty: number } | null = null, distance = Infinity
  for (let ty = Math.max(0, e.ty - 8); ty <= Math.min(h - 2, e.ty); ty++) {
    for (let tx = Math.max(1, e.tx - 5); tx <= Math.min(w - 2, e.tx + 5); tx++) {
      let fits = true
      for (let dx = -1; dx <= 1; dx++) if (tiles[ty * w + tx + dx] !== '#' || tiles[(ty + 1) * w + tx + dx] === '#') fits = false
      const d = Math.abs(tx - e.tx) + Math.abs(ty + 1 - e.ty)
      if (fits && d < distance) { best = { tx, ty }; distance = d }
    }
  }
  return best
}
