// Atlas eye/grey pixels remain visible in darkness, clipped by the same foreground wall art as the body.
import type { Monster, State } from '../core/types.ts'
import { getResources } from '../assets/resources.ts'
import { charFrame } from './charatlas.ts'
import { dirIndex } from '../core/grid.ts'
import { MON_FOOT, monsterDirection, monsterFrame } from './entities.ts'
import { eyeFlash } from './telegraph.ts'
import { snap } from './entities-player.ts'
import { eraseForeground } from './foreground-walls.ts'
import { ctx2d, newCanvas } from './light.ts'
import type { View } from './view.ts'

const REDUCED_FLASH = 0.3 // settings.reducedFlash scales every flash layer (same constant as glow.ts)

function atlasMask(s: State, m: Monster, eyes: boolean): HTMLCanvasElement | null {
  const res = getResources(), sheet = res.images.sheets[1]
  if (res.images.sheetState[1] !== 'ok' || !sheet) return null
  const [animation, frame] = monsterFrame(s, m), f = charFrame(m.kind, animation, dirIndex(monsterDirection(s, m)), frame)
  const key = `shade-v2|${eyes}|${res.images.gen}|${f.x}|${f.y}`
  let mask = res.swapped.get(key)
  if (!mask) {
    mask = newCanvas(64, 64)
    const g = ctx2d(mask)
    g.drawImage(sheet, f.x, f.y, 64, 64, 0, 0, 64, 64)
    const pixels = g.getImageData(0, 0, 64, 64), d = pixels.data
    for (let i = 0; i < d.length; i += 4) {
      const keep = eyes ? d[i] === 200 && d[i + 1] === 90 && d[i + 2] === 240
        : d[i] > 0 && d[i] === d[i + 1] && d[i] === d[i + 2]
      if (!keep) d[i + 3] = 0
    }
    g.putImageData(pixels, 0, 0)
    res.swapped.set(key, mask)
    if (res.swapped.size > 256) res.swapped.delete(res.swapped.keys().next().value as string)
  } else { res.swapped.delete(key); res.swapped.set(key, mask) }
  return mask
}

export function drawAtlasEyes(ctx: CanvasRenderingContext2D, s: State, m: Monster, v: View, alpha: number): void {
  const grey = atlasMask(s, m, false), eyes = atlasMask(s, m, true)
  if (!grey || !eyes) return
  // Reuse one small canvas. Erase with real wall-row alpha, preserving ragged edges and transparent cutouts.
  const res = getResources(), key = 'shade-occlusion-v2'
  let canvas = res.light.get(key)
  if (!canvas) { canvas = newCanvas(64, 64); res.light.set(key, canvas) }
  const g = ctx2d(canvas), x = snap(m.x, v.z) - 32, y = snap(m.y - MON_FOOT[m.kind], v.z) - 32
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1
  g.clearRect(0, 0, 64, 64)
  g.drawImage(grey, 0, 0)
  g.globalAlpha = alpha
  g.drawImage(eyes, 0, 0)
  // Windup flash: two extra additive eye draws inside the occlusion canvas, so foreground walls still clip them.
  const f = eyeFlash(m) * (s.settings.reducedFlash ? REDUCED_FLASH : 1)
  if (f > 0) {
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = f
    g.drawImage(eyes, 0, 0); g.drawImage(eyes, 0, 0)
    g.globalCompositeOperation = 'source-over'
  }
  g.globalAlpha = 1
  eraseForeground(g, s, v, m.y, x, y, 64, 64)
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1
  ctx.drawImage(canvas, x, y)
  if (f > 0) { // whitish-violet halo at the eye line, radius 10 + 8f px
    const hx = x + 32, hy = y + 32 - 6, r = 10 + 8 * f, h = ctx.createRadialGradient(hx, hy, 0, hx, hy, r)
    h.addColorStop(0, `rgba(244,232,255,${0.9 * f})`); h.addColorStop(1, 'rgba(244,232,255,0)')
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = h
    ctx.fillRect(hx - r, hy - r, 2 * r, 2 * r)
  }
  ctx.restore()
}
