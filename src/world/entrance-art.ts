// Find a wall-mounted doorway with floor clearance for its aligned exit and three-tile spawn.
import type { State } from '../core/types.ts'

export function entranceWall(s: State): { tx: number; ty: number } | null {
  const { w, h, tiles, entrance: e } = s.world
  let best: { tx: number; ty: number } | null = null, distance = Infinity
  for (let ty = Math.max(0, e.ty - 8); ty <= Math.min(h - 2, e.ty); ty++) {
    for (let tx = Math.max(1, e.tx - 5); tx <= Math.min(w - 2, e.tx + 5); tx++) {
      let fits = true
      for (let dx = -1; dx <= 1; dx++) if (tiles[ty * w + tx + dx] !== '#' || tiles[(ty + 1) * w + tx + dx] === '#') fits = false
      for (let dy = 1; dy <= 4; dy++) if (ty + dy >= h || tiles[(ty + dy) * w + tx] === '#') fits = false
      const d = Math.abs(tx - e.tx) + Math.abs(ty + 1 - e.ty)
      if (fits && d < distance) { best = { tx, ty }; distance = d }
    }
  }
  return best
}

// First floor tile at the authored doorway base; the generator entrance remains the depth origin.
export function entranceExit(s: State): { tx: number; ty: number } {
  const wall = entranceWall(s)
  return wall ? { tx: wall.tx, ty: wall.ty + 1 } : s.world.exit
}

export function entranceSpawn(s: State): { tx: number; ty: number } {
  const wall = entranceWall(s)
  return wall ? { tx: wall.tx, ty: wall.ty + 4 } : s.world.entrance
}
