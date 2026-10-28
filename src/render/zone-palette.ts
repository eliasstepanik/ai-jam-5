import type { State } from '../core/types.ts'
import type { View } from './view.ts'
import { playerDepth01, toneOf } from './depth-tone.ts'
export function drawZonePalette(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const t = toneOf(playerDepth01(s))
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = 'rgb(' + Math.round(t.r * 255) + ',' + Math.round(t.g * 255) + ',' + Math.round(t.b * 255) + ')'
  ctx.fillRect(0, 0, v.cw, v.ch)
  ctx.restore()
}
