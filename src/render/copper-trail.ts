// Copper flame trail: a few faint additive sparks drifting along s.trail.path toward the Beacon (systems/copper-trail.ts).
// Stateless: positions follow s.trail.t, no particle pool, no RNG. Called inside the additive 'lighter' pass.
import type { State } from '../core/types.ts'
import { T } from '../core/tuning.ts'
import { trailAt, TRAIL_ALPHA, TRAIL_LEN_PX, TRAIL_MOTES, TRAIL_PERIOD_S, TRAIL_R_PX, TRAIL_START_PX } from '../systems/copper-trail.ts'
import type { View } from './view.ts'
import { inView, worldXf } from './view.ts'

const P = { x: 0, y: 0 } // scratch point (no per-frame allocation)

export function drawCopperTrail(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const tr = s.trail
  if (!tr.on || !tr.path.length || s.meta.screen !== 'playing') return
  ctx.save()
  worldXf(ctx, v)
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = T.minerals.table.copper.mantle
  for (let k = 0; k < TRAIL_MOTES; k++) {
    const ph = (tr.t / TRAIL_PERIOD_S + k / TRAIL_MOTES) % 1
    trailAt(s, TRAIL_START_PX + ph * TRAIL_LEN_PX, P)
    if (!inView(v, P.x, P.y)) continue
    ctx.globalAlpha = TRAIL_ALPHA * Math.sin(Math.PI * ph)
    ctx.beginPath()
    ctx.arc(P.x, P.y, TRAIL_R_PX, 0, Math.PI * 2) // world transform already scales by the view zoom
    ctx.fill()
  }
  ctx.restore()
}
