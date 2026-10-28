// Keep the large delivered Beacon inside its carved room instead of underneath a foreground wall.
// The original generator landmark still owns path length/scoring; presentation and interaction use this nearby floor anchor.
import type { State } from '../core/types.ts'
import { TILE } from '../core/state.ts'

export function beaconTile(s: State): { tx: number; ty: number } {
  const { beacon: b, w, h, tiles } = s.world
  if (tiles.length !== w * h || !w) return b
  for (let r = 0; r <= 4; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.abs(dx) + Math.abs(dy) !== r) continue
    const tx = b.tx + dx, ty = b.ty + dy
    let fits = true
    // 3x3 ground footprint plus clearance from the raised caps to its south.
    for (let y = ty - 1; y <= ty + 2 && fits; y++) for (let x = tx - 1; x <= tx + 1; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h || tiles[y * w + x] === '#') { fits = false; break }
    }
    if (fits) return { tx, ty }
  }
  return b
}

export const beaconPosition = (s: State): { x: number; y: number } => {
  const b = beaconTile(s)
  return { x: (b.tx + 0.5) * TILE, y: (b.ty + 0.5) * TILE }
}

// Keep the original interaction point valid too: existing runs and the generator's farthest-tile goal still work.
export function beaconInReach(s: State, radius: number): boolean {
  const p = s.player, b = beaconPosition(s), old = s.world.beacon
  return Math.min(Math.hypot(p.x - b.x, p.y - b.y), Math.hypot(p.x - (old.tx + 0.5) * TILE, p.y - (old.ty + 0.5) * TILE)) <= radius
}
