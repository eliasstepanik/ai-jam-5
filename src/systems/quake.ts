// L3 systems: quake driver (architecture-rocks-2 §5, architecture-rocks §2, architecture-systems-4 §2). Owns only the cadence:
// escape clock, telegraph countdowns, landings and the next-rock timer. Planning, committing and landing live in rocks.ts.
// director.ts and monsters.ts never import this file or rocks.ts.
import type { State } from '../core/types.ts'
import { randRange } from '../core/rng.ts'
import { T } from '../core/tuning.ts'
import { commitRock, cosmeticRockLand, landRock, planRockFall, rampOf } from './rocks.ts'

// rocks §2: rocks per second, linear from rateStart to rateEnd over the per-depth-class ramp (R-164, via rampOf), then flat.
const rate = (s: State): number => T.rocks.rateStart + (T.rocks.rateEnd - T.rocks.rateStart) * rampOf(s.director.escapeT, s.world.depthClass)

export function stepQuake(s: State, dt: number): void {
  const d = s.director
  d.escapeT += dt
  d.quakeT -= dt
  let bfs = 0
  for (const r of s.rocks.slice()) { // copy: landRock may splice a cancelled rock
    if (r.landed) continue
    r.t -= dt
    if (r.t - 1e-9 <= 0) bfs += landRock(s, r) // R-127 epsilon (countdown form): 60 float steps of 1/60 leave ~+1e-16, still land on step 60, not 61
  }
  if (d.quakeT > 0) return
  if (bfs > 0) { d.quakeT = dt; return } // amortise: never plan in a step that ran a landing BFS
  const plan = planRockFall(s)
  if (plan) {
    d.quakeT = Math.max(T.rocks.minIntervalS, randRange(s, 'gameplay', 0.75, 1.25) / rate(s))
    commitRock(s, plan)
    return
  }
  d.quakeT = T.rocks.retryS
  // ponytail: the landed count is rescanned here only on a null plan; cap reached still shows a cosmetic puff (rocks-2 §4).
  let landed = 0
  for (const r of s.rocks) if (r.landed) landed++
  if (landed >= T.escape.rocksMax) cosmeticRockLand(s)
}
