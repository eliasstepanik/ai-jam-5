// L3 systems: explored-tile memory under the flame. Writes world.explored and world.exploreKey.
// Spec: docs/architecture-systems-4.md §1, R-145 (flameRadius, never LIGHT_ALL), docs/architecture-world-queries.md §5 (revealAround).
import type { State } from '../core/types.ts'
import { playerTile } from '../world/grid.ts'
import { revealAround } from '../world/explored.ts'
import { flameRadius } from './light.ts'

export function stepExplore(s: State): void {
  const p = s.player, w = s.world
  if (s.meta.phase !== 'descent') return // escape: the cave is fully lit, nothing to remember
  if (w.tiles.length !== w.w * w.h) return // title state: no cave, no explored bitset to write
  const R = flameRadius(s)
  // Key = tile * 1024 + floor(R). ponytail: valid while floor(R) < 1024 (max flameRadius is about 221 px);
  // a tuning that pushes flameRadius past 1023 must widen the factor.
  const key = playerTile(s) * 1024 + Math.floor(R)
  if (key === w.exploreKey) return
  revealAround(s, p.x, p.y, R)
  w.exploreKey = key
}
