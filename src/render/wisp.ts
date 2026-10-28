// Native 32px, 20fps wisp; the three rows are eye looks, not compass directions.
import atlas from '../assets/characters.json'
import type { State } from '../core/types.ts'
import type { View } from './view.ts'
import { inView, worldXf } from './view.ts'
import { getResources } from '../assets/resources.ts'
const anim = atlas.animations.find(a => a.id === 'wisp/fire_loop')!
export function drawWispArt(ctx: CanvasRenderingContext2D, s: State, x: number, y: number): boolean {
  const im = getResources().images
  if (im.sheetState[1] !== 'ok' || !im.sheets[1]) return false
  const look = Math.abs(s.wisp.wvx) < 8 ? 'center' : s.wisp.wvx < 0 ? 'left' : 'right'
  const list = anim.directions[look as keyof typeof anim.directions]!
  const duration = list.reduce((sum, f) => sum + f.duration_ms, 0)
  let time = s.meta.time * 1000 % duration, f = list[0]
  for (const frame of list) { f = frame; if (time < frame.duration_ms) break; time -= frame.duration_ms }
  ctx.save()
  ctx.globalCompositeOperation = 'source-over' // preserve authored black eyes
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(im.sheets[1]!, f.rect.x, f.rect.y, f.rect.w, f.rect.h, Math.round(x) - f.anchor.x, Math.round(y) - f.anchor.y, f.rect.w, f.rect.h)
  ctx.restore()
  return true
}

// The guide body is independent of the quality-thinned/fading trail and always has its own clean draw state.
export function drawEscapeWisp(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const w = s.wisp
  if (!w.on || s.meta.screen !== 'playing' || s.meta.phase !== 'escape' || !inView(v, w.wx, w.wy)) return
  ctx.save()
  worldXf(ctx, v)
  ctx.globalAlpha = 1
  if (!drawWispArt(ctx, s, w.wx, w.wy)) {
    ctx.fillStyle = '#ffe394'
    ctx.fillRect(Math.round(w.wx) - 3, Math.round(w.wy) - 3, 6, 6)
  }
  ctx.restore()
}
