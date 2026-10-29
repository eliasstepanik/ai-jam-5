// Brief clusters choose fixed world spots along the Beacon route, independent of player/camera motion.
import type { State } from '../core/types.ts'
import { COPPER_TWINKLE_PIXELS, copperPixel, createCopperHints, sampleCopperHints } from '../core/copper-hints.ts'
import { FLAME_COL } from './flame.ts'
import { inMap, isSolidAt, tileToWorld, worldToTile, idx } from '../world/grid.ts'
import { lineOfSightPx } from '../world/los.ts'
import { getResources } from '../assets/resources.ts'
import { ctx2d, newCanvas } from './light.ts'
import { eraseForeground } from './foreground-walls.ts'
import { currentQuality } from './quality.ts'
import type { View } from './view.ts'
import { inView, worldXf } from './view.ts'

function routeSpot(s: State, v: View, fraction: number): { x: number; y: number } | null {
  const spots: { x: number; y: number }[] = []
  for (const tile of s.trail.path.slice(1)) {
    const x = tileToWorld(tile % s.world.w), y = tileToWorld(Math.floor(tile / s.world.w))
    if (Math.hypot(x - s.player.x, y - s.player.y) >= 40 && !isSolidAt(s, tile) &&
      inView(v, x, y) && lineOfSightPx(s, s.player.x, s.player.y, x, y)) spots.push({ x, y })
  }
  return spots[Math.floor(fraction * spots.length)] ?? null
}
export function drawCopperTrail(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  if (s.meta.screen !== 'playing') return // paused clocks/cues remain frozen
  const tr = s.trail, res = getResources(), pool = res.copperFx ??= createCopperHints()
  sampleCopperHints(pool, s.meta.runId, tr.t, tr.on && tr.path.length >= 2, s.meta.seed, h => routeSpot(s, v, h))
  const b = pool.burst
  if (!b) return
  const col = FLAME_COL.copper, count = Math.max(2, Math.round(COPPER_TWINKLE_PIXELS * currentQuality(s).particles))
  let canvas = res.light.get('copper-hint')
  if (!canvas) { canvas = newCanvas(4, 4); res.light.set('copper-hint', canvas) }
  const g = ctx2d(canvas)
  ctx.save(); worldXf(ctx, v)
  ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false
  for (let i = 0; i < count; i++) {
    const p = copperPixel(b, s.meta.seed, tr.t, i)
    if (!p) continue
    const { x, y, size } = p, tx = worldToTile(x), ty = worldToTile(y + 2)
    if (!inView(v, x, y) || !inMap(s, tx, ty) || isSolidAt(s, idx(s, tx, ty)) ||
      !lineOfSightPx(s, s.player.x, s.player.y, x, y + 2)) continue
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1
    g.clearRect(0, 0, 4, 4)
    g.fillStyle = col.mantle; g.fillRect(0, 1, size, size)
    g.fillStyle = col.core; g.fillRect(0, 0, size, 1)
    g.fillStyle = col.fringe; g.fillRect(size, 1, 1, size)
    eraseForeground(g, s, v, y + 2, x, y, 4, 4)
    ctx.globalAlpha = p.alpha * (s.settings.reducedFlash ? .75 : 1)
    ctx.drawImage(canvas, x, y)
  }
  ctx.restore()
}
