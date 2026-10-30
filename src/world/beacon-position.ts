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

// Rounded physical base: 92x44 world pixels, matching the delivered pedestal around its ground anchor.
export const BEACON_HALF_SPAN = 24, BEACON_BASE_RADIUS = 22
export type BeaconFootprint = { x0: number; x1: number; y: number; r: number }
export function beaconFootprint(s: State): BeaconFootprint | null {
  const w = s.world, b = w.beacon
  if (!w.w || w.tiles.length !== w.w * w.h || b.tx < 0 || b.ty < 0 || b.tx >= w.w || b.ty >= w.h || w.tiles[b.ty * w.w + b.tx] === '#') return null
  const p = beaconPosition(s)
  return { x0: p.x - BEACON_HALF_SPAN, x1: p.x + BEACON_HALF_SPAN, y: p.y, r: BEACON_BASE_RADIUS }
}
export function beaconBaseDistance(b: BeaconFootprint, x: number, y: number): number {
  const cx = Math.max(b.x0, Math.min(b.x1, x))
  return Math.hypot(x - cx, y - b.y) - b.r
}
// Reach is measured from the solid base, so all sides remain usable without walking through it.
// Keep the original generator landmark valid for existing runs as before.
export function beaconInReach(s: State, radius: number): boolean {
  const p = s.player, b = beaconPosition(s), old = s.world.beacon, base = beaconFootprint(s)
  return (base !== null && beaconBaseDistance(base, p.x, p.y) <= radius) ||
    Math.min(Math.hypot(p.x - b.x, p.y - b.y), Math.hypot(p.x - (old.tx + 0.5) * TILE, p.y - (old.ty + 0.5) * TILE)) <= radius
}
