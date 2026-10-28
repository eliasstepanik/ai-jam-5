// L3 systems: flow-field steering for stuck monsters (issue #113 step 6, plan F5).
// Returns a desired velocity only; monsters.ts (F6) decides when to engage it.
// flowDir lives here, not in src/world/flowfield.ts: flowfield.ts is imported by
// caches.ts, so importing getFlowField there would be a caches <-> flowfield cycle.
// Pure: no RNG, no clocks, no dt, no module-level state.
import type { Monster, State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { getFlowField } from '../world/caches.ts'
import { flowStep } from '../world/flowfield.ts'
import { tileToWorld, worldToTile } from '../world/grid.ts'
import { seek } from '../entities/steer.ts'

// Unit vector from the monster to the centre of the next tile on the way to the
// player tile, or null (no field, outside the window, unreachable, already at the source).
export function flowDir(s: State, m: Monster): [number, number] | null {
  const ff = getFlowField(s)
  if (!ff) return null
  const mtx = worldToTile(m.x), mty = worldToTile(m.y)
  const step = flowStep(ff.dist, ff.ptx, ff.pty, ff.win, mtx, mty)
  if (!step) return null
  const dx = tileToWorld(mtx + step[0]) - m.x, dy = tileToWorld(mty + step[1]) - m.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-6) return null
  return [dx / len, dy / len]
}

// Desired velocity toward (tx,ty) at up to vmax. Plain seek until the monster has been
// stuck longer than flowStuckT; then follow the flow gradient, falling back to plain seek
// when the flow gives no direction.
// ponytail: the field is rooted at the PLAYER tile, so a stuck searching monster follows
// the player gradient and (tx,ty) is only used by the seek fallback. Upgrade path: a
// second field rooted at lastKnown.
export function flowSeek(s: State, m: Monster, tx: number, ty: number, vmax: number): [number, number] {
  if (m.stuckT <= T.ai.flowStuckT) return seek(m.x, m.y, tx, ty, vmax)
  const d = flowDir(s, m)
  return d ? [d[0] * vmax, d[1] * vmax] : seek(m.x, m.y, tx, ty, vmax)
}
