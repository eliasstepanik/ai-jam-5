// Emissive eye pixels from the displayed atlas frame, aligned exactly with its body. No placeholder sheets or floating halos.
import type { Monster, State } from '../core/types.ts'
import { getResources } from '../assets/resources.ts'
import { charFrame } from './charatlas.ts'
import { dirIndex } from '../core/grid.ts'
import { MON_FOOT, monsterDirection, monsterFrame } from './entities.ts'
import { snap } from './entities-player.ts'

export function drawAtlasEyes(ctx: CanvasRenderingContext2D, s: State, m: Monster, zoom: number, alpha: number): void {
  const res = getResources(), sheet = res.images.sheets[1]
  if (res.images.sheetState[1] !== 'ok' || !sheet) return
  const [animation, frame] = monsterFrame(s, m), f = charFrame(m.kind, animation, dirIndex(monsterDirection(s, m)), frame)
  const key = `eyes|${res.images.gen}|${f.x}|${f.y}`
  let mask = res.swapped.get(key)
  if (!mask) {
    mask = document.createElement('canvas'); mask.width = mask.height = 64
    const g = mask.getContext('2d', { willReadFrequently: true })!
    g.drawImage(sheet, f.x, f.y, 64, 64, 0, 0, 64, 64)
    const pixels = g.getImageData(0, 0, 64, 64), d = pixels.data
    // The delivered enemy palette reserves this exact colour for eyes (and Devourer emissive markings).
    for (let i = 0; i < d.length; i += 4) if (d[i] !== 200 || d[i + 1] !== 90 || d[i + 2] !== 240) d[i + 3] = 0
    g.putImageData(pixels, 0, 0)
    res.swapped.set(key, mask)
    if (res.swapped.size > 256) res.swapped.delete(res.swapped.keys().next().value as string)
  } else { res.swapped.delete(key); res.swapped.set(key, mask) }
  ctx.globalAlpha = alpha
  ctx.drawImage(mask, snap(m.x, zoom) - 32, snap(m.y - MON_FOOT[m.kind], zoom) - 32)
  ctx.globalAlpha = 1
}
