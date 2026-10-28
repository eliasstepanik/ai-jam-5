// Pure-black shadows intentionally blend into unlit black terrain.
// Color is stable over the entire life, independent of torch distance; foreground walls still cover it.
import type { State } from '../core/types.ts'
import { getResources } from '../assets/resources.ts'
import { ctx2d, newCanvas } from './light.ts'
import { eraseForeground } from './foreground-walls.ts'
import type { View } from './view.ts'

export type ShadowPixel = { x: number; y: number; size: number; alpha: number }
export function paintShadowPixels(ctx: CanvasRenderingContext2D, s: State, v: View, footY: number, pixels: ShadowPixel[]): void {
  if (!pixels.length) return
  const x = Math.max(Math.floor(v.x0), Math.min(...pixels.map(p => p.x)))
  const y = Math.max(Math.floor(v.y0), Math.min(...pixels.map(p => p.y)))
  const right = Math.min(Math.ceil(v.x1), Math.max(...pixels.map(p => p.x + p.size)))
  const bottom = Math.min(Math.ceil(v.y1), Math.max(...pixels.map(p => p.y + p.size)))
  const w = right - x, h = bottom - y
  if (w <= 0 || h <= 0) return
  const res = getResources(), key = 'shadow-particle-occlusion'
  let canvas = res.light.get(key)
  if (!canvas) { canvas = newCanvas(w, h); res.light.set(key, canvas) }
  if (canvas.width !== w) canvas.width = w
  if (canvas.height !== h) canvas.height = h
  const g = ctx2d(canvas)
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1
  g.clearRect(0, 0, w, h)
  g.fillStyle = '#000000'
  for (const p of pixels) {
    g.globalAlpha = p.alpha
    g.fillRect(p.x - x, p.y - y, p.size, p.size)
  }
  eraseForeground(g, s, v, footY, x, y, w, h)
  ctx.drawImage(canvas, x, y)
}
