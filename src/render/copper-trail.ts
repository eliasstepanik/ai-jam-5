// Sparse green pixel cubes hint along the Beacon route without tracing it as a dotted line.
import type { State } from '../core/types.ts'
import { COPPER_HINT_SLOTS, copperHint } from '../core/copper-hints.ts'
import { hash2 } from '../core/noise.ts'
import { trailAt } from '../systems/copper-trail.ts'
import { idx, inMap, isSolidAt, worldToTile } from '../world/grid.ts'
import { lineOfSightPx } from '../world/los.ts'
import { getResources } from '../assets/resources.ts'
import { ctx2d, newCanvas } from './light.ts'
import { eraseForeground } from './foreground-walls.ts'
import { currentQuality } from './quality.ts'
import type { View } from './view.ts'
import { inView, worldXf } from './view.ts'

export function drawCopperTrail(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const tr = s.trail
  if (!tr.on || tr.path.length < 2 || s.meta.screen !== 'playing') return
  const res = getResources(), quality = currentQuality(s).particles
  let canvas = res.light.get('copper-hint')
  if (!canvas) { canvas = newCanvas(4, 4); res.light.set('copper-hint', canvas) }
  const g = ctx2d(canvas), p = { x: 0, y: 0 }, ahead = { x: 0, y: 0 }
  ctx.save(); worldXf(ctx, v)
  ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false
  for (let slot = 0; slot < COPPER_HINT_SLOTS; slot++) {
    if (slot > 0 && hash2(slot, 0, s.meta.seed) > quality) continue
    const hint = copperHint(s.meta.seed, tr.t, slot)
    if (!hint) continue
    trailAt(s, hint.distance, p); trailAt(s, hint.distance + 12, ahead)
    let dx = ahead.x - p.x, dy = ahead.y - p.y
    if (Math.hypot(dx, dy) < .01) { dx = p.x - s.player.x; dy = p.y - s.player.y }
    const length = Math.hypot(dx, dy) || 1
    const x = Math.round(p.x - dy / length * hint.side), groundY = p.y + dx / length * hint.side
    const y = Math.round(groundY + hint.lift), tx = worldToTile(x), ty = worldToTile(groundY)
    if (!inView(v, x, y) || !inMap(s, tx, ty) || isSolidAt(s, idx(s, tx, ty)) ||
      !lineOfSightPx(s, s.player.x, s.player.y, x, groundY)) continue
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1
    g.clearRect(0, 0, 4, 4)
    g.fillStyle = '#33994b'; g.fillRect(0, 1, hint.size, hint.size)
    g.fillStyle = '#71dc7d'; g.fillRect(0, 0, hint.size, 1)
    g.fillStyle = '#196c32'; g.fillRect(hint.size, 1, 1, hint.size)
    eraseForeground(g, s, v, groundY, x, y, 4, 4)
    ctx.globalAlpha = hint.alpha * (s.settings.reducedFlash ? .75 : 1)
    ctx.drawImage(canvas, x, y)
  }
  ctx.restore()
}
