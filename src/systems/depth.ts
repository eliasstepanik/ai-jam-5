// L3 systems: depth and zone tracking. Writes stats.maxPathDist/maxDepth/deepestZone and meta.zone.
// Spec: docs/architecture-scoring-and-save.md §1 (trackDepth). Runs every step in both phases.
import type { State } from '../core/types.ts'
import { depthOf, zoneOfDepth } from '../core/score.ts'
import { getDepthField } from '../world/caches.ts'
import { playerTile } from '../world/grid.ts'

export function trackDepth(s: State): void {
  const field = getDepthField(s), i = playerTile(s)
  // Off-map, empty world (title) or unreachable cell (-1): nothing to measure, keep stats and zone as they are.
  if (!(i >= 0 && i < field.length) || !(field[i] >= 0)) return
  const d = field[i], beaconDist = s.world.beaconDist, st = s.player.stats
  if (d > st.maxPathDist) {
    st.maxPathDist = d
    st.maxDepth = depthOf(d, beaconDist)
    st.deepestZone = zoneOfDepth(st.maxDepth)
  }
  s.meta.zone = zoneOfDepth(depthOf(d, beaconDist))
}
