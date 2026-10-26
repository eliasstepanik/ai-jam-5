import type { State } from '../core/types.ts'
import type { View } from './view.ts'
export function drawZonePalette(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const p = s.meta.palette
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = 'rgb(' + p.map(c => Math.round(c * 255)).join(',') + ')'
  ctx.fillRect(0, 0, v.cw, v.ch)
  ctx.restore()
}
