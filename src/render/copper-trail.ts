// Low-density torch-like fire along the route. Birth positions stay in world space through movement/re-routing.
import type { State } from '../core/types.ts'
import { createCopperHints, sampleCopperFire } from '../core/copper-hints.ts'
import { FLAME_COL } from './flame.ts'
import { inMap, isSolidAt, tileToWorld, worldToTile, idx } from '../world/grid.ts'
import { lineOfSightPx } from '../world/los.ts'
import { getResources } from '../assets/resources.ts'
import { ctx2d, newCanvas } from './light.ts'
import { eraseForeground } from './foreground-walls.ts'
import { currentQuality } from './quality.ts'
import type { View } from './view.ts'
import { inView, worldXf } from './view.ts'

export function drawCopperTrail(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  if (s.meta.screen !== 'playing') return
  const tr = s.trail, res = getResources(), material = s.player.activeMineral
  // The old cluster registry can survive HMR; replace its shape once, then retain fire history normally.
  if (res.copperFx?.version !== 2) res.copperFx = createCopperHints()
  const pool = res.copperFx, points = tr.path.slice(1).map(tile => ({ tile,
    x: tileToWorld(tile % s.world.w), y: tileToWorld(Math.floor(tile / s.world.w)) })).filter(p => inView(v, p.x, p.y))
  sampleCopperFire(pool, s.meta.runId, tr.t, tr.on && tr.path.length >= 2, material, s.meta.seed, points, currentQuality(s).particles)
  if (!pool.pixels.length) return
  const col = FLAME_COL[material]
  let canvas = res.light.get('copper-hint')
  if (!canvas) { canvas = newCanvas(4, 4); res.light.set('copper-hint', canvas) }
  const g = ctx2d(canvas)
  ctx.save(); worldXf(ctx, v)
  ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false
  for (const p of pool.pixels) {
    const age = tr.t - p.born, f = age / p.life
    if (f < 0 || f >= 1) continue
    const x = Math.round(p.x + p.vx * age), y = Math.round(p.y + p.vy * age)
    const tx = worldToTile(p.x), ty = worldToTile(p.y)
    if (!inView(v, x, y) || !inMap(s, tx, ty) || isSolidAt(s, idx(s, tx, ty)) ||
      !lineOfSightPx(s, s.player.x, s.player.y, p.x, p.y)) continue
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1
    g.clearRect(0, 0, 4, 4)
    const size = Math.max(1, p.size - Math.floor(f * p.size))
    g.fillStyle = f < .1 ? col.core : f < .7 ? col.mantle : col.fringe
    g.fillRect(0, 0, size, size)
    eraseForeground(g, s, v, p.y, x, y, 4, 4)
    ctx.globalAlpha = .7 * Math.min(1, age / .08, (1 - f) * 3) * (s.settings.reducedFlash ? .75 : 1)
    ctx.drawImage(canvas, x, y)
  }
  ctx.restore()
}
