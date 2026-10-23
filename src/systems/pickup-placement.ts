// Keep logical pickups on visible ground in the fixed-south view; no RNG, types/counts and fuel values are preserved.
import type { Pickup, State } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { getBeaconRoom, getDepthField, getZoneField } from '../world/caches.ts'

// Raised foreground caps cover the two floor rows immediately north of them (48 px wall height + 32 px cap).
export function pickupFloorVisible(s: State, i: number): boolean {
  const { w, h, tiles } = s.world, y = Math.floor(i / w)
  return i >= 0 && i < tiles.length && y + 2 < h &&
    tiles[i] !== '#' && tiles[i + w] !== '#' && tiles[i + 2 * w] !== '#'
}

export function placeVisiblePickups(s: State): void {
  const { w, h, tiles } = s.world, zone = getZoneField(s), depth = getDepthField(s), beaconRoom = getBeaconRoom(s)
  const tileOf = (p: Pickup): number => Math.floor(p.y / TILE) * w + Math.floor(p.x / TILE)
  const occupied = new Set(s.pickups.map(tileOf)), n = w * h
  for (const p of s.pickups) {
    const start = tileOf(p)
    if (pickupFloorVisible(s, start)) continue
    const queue = [start], seen = new Set(queue)
    let target = -1
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head], x = i % w
      if (!occupied.has(i) && pickupFloorVisible(s, i) && !beaconRoom[i] && depth[i] >= 6 && zone[i] === zone[start] &&
        (p.kind !== 'plant' || tiles[i] === ',')) { target = i; break }
      for (const j of [x > 0 ? i - 1 : -1, i - w, x + 1 < w ? i + 1 : -1, i + w]) {
        if (j < 0 || j >= n || seen.has(j) || tiles[j] === '#') continue
        seen.add(j); queue.push(j)
      }
    }
    if (target < 0) continue // A custom map may have no floor visible below its foreground walls.
    occupied.add(target)
    p.x = (target % w + 0.5) * TILE; p.y = (Math.floor(target / w) + 0.5) * TILE
  }
}
