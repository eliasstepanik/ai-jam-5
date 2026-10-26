import { getResources } from '../assets/resources.ts'
import { waterInterior } from '../core/puddle-fx.ts'
import { tileFrame, tilesetOf } from './tileset.ts'
import { ctx2d, newCanvas } from './light.ts'
export function waterMask(name: string): { canvas: HTMLCanvasElement; bits: Uint8Array; w: number; h: number } | null {
  const ts = tilesetOf()
  if (!ts) return null
  const res = getResources(), cache = res.waterMasks ??= { gen: -1, entries: new Map() }
  if (cache.gen !== res.images.gen) {
    for (const m of cache.entries.values()) m.canvas.width = m.canvas.height = 0
    cache.entries.clear(); cache.gen = res.images.gen
  }
  const hit = cache.entries.get(name)
  if (hit) return hit
  const [x, y, w, h] = tileFrame(name), canvas = newCanvas(w, h), g = ctx2d(canvas)
  g.drawImage(ts.image, x, y, w, h, 0, 0, w, h)
  const pixels = g.getImageData(0, 0, w, h), bits = waterInterior(pixels.data)
  for (let i = 0; i < bits.length; i++) {
    pixels.data[i * 4] = pixels.data[i * 4 + 1] = pixels.data[i * 4 + 2] = 255
    pixels.data[i * 4 + 3] = bits[i] * 255
  }
  g.putImageData(pixels, 0, 0)
  const entry = { canvas, bits, w, h }; cache.entries.set(name, entry)
  return entry
}
