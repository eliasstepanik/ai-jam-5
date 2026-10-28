// Cache opaque birth sites from the delivered art, never from its rectangular canvas bounds.
import { getResources } from '../assets/resources.ts'
import { hash2 } from '../core/noise.ts'

export function emitterPixels(sheet: number, x: number, y: number, w: number, h: number, flame = false): Uint16Array {
  const res = getResources(), im = res.images, image = im.sheets[sheet]
  if (!image || im.sheetState[sheet] !== 'ok') return new Uint16Array(0)
  const cache = res.emitterPixels ??= { gen: -1, frames: new Map() }
  if (cache.gen !== im.gen) { cache.frames.clear(); cache.gen = im.gen }
  const key = [sheet, x, y, w, h, flame].join('|'), hit = cache.frames.get(key)
  if (hit) return hit
  let c = res.light.get('emitter-readback')
  if (!c) { c = document.createElement('canvas'); res.light.set('emitter-readback', c) }
  c.width = w; c.height = h
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!g) return new Uint16Array(0)
  g.drawImage(image, x, y, w, h, 0, 0, w, h)
  const data = g.getImageData(0, 0, w, h).data, points: number[] = []
  const solid = (px: number, py: number): boolean => {
    const i = (py * w + px) * 4
    return data[i + 3] >= 240 && (flame
      ? px >= 54 && px <= 73 && py >= 60 && py <= 76 && data[i] >= 245 && data[i + 1] >= 210
      : data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100)
  }
  // Four-pixel birth squares fit inside the body; thin extremities do not emit.
  for (let py = 0; py < h - 3; py++) for (let px = 0; px < w - 3; px++) {
    let inside = solid(px, py)
    for (let dy = 0; inside && dy < 4; dy++) for (let dx = 0; inside && dx < 4; dx++) {
      if (flame) { if (data[((py + dy) * w + px + dx) * 4 + 3] < 240) inside = false }
      else if (!solid(px + dx, py + dy)) inside = false
    }
    if (inside) points.push(py * w + px)
  }
  const result = new Uint16Array(points)
  // ponytail: bounded FIFO of 96 animation frames; upgrade to an LRU if more actors are added.
  if (cache.frames.size >= 96) cache.frames.delete(cache.frames.keys().next().value!)
  cache.frames.set(key, result)
  return result
}

export function emitterPoint(points: Uint16Array, width: number, key: number, cycle: number): [number, number] {
  const p = points[Math.floor(hash2(key, cycle, 0x454d) * points.length)] ?? 0
  return [p % width, Math.floor(p / width)]
}
