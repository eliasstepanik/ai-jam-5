// Remove static foreground dressing from a pool mask so reflections cannot cover dry vines/cracks.
import type { State } from '../core/types.ts'
import { CAVE_DRESSING } from '../core/cave-props.ts'
import { getResources } from '../assets/resources.ts'
import { dressingCache } from './dressing.ts'
import type { DressingProp } from './dressing.ts'
import { waterMask } from './water-mask.ts'
import { floorDetails, damageStage } from './cave-details.ts'
import { groundCracks } from './cracks.ts'
import { tileCache } from './tiles.ts'
import { blit, tilesetOf } from './tileset.ts'
import { newCanvas, ctx2d } from './light.ts'
export function waterSurfaceMask(s: State, p: DressingProp): ReturnType<typeof waterMask> {
  const d = CAVE_DRESSING[p.def], native = waterMask(d.name), ts = tilesetOf(), t = tileCache(s)
  if (!native || !ts || !t) return native
  const res = getResources(), key = dressingCache(s).key + '|' + damageStage(s)
  const cache = res.waterSurfaceMasks ??= { key: '', entries: new Map() }
  if (cache.key !== key) {
    for (const m of cache.entries.values()) m.canvas.width = m.canvas.height = 0
    cache.entries.clear(); cache.key = key
  }
  const hit = cache.entries.get(p.tile)
  if (hit) { cache.entries.delete(p.tile); cache.entries.set(p.tile, hit); return hit }
  const canvas = newCanvas(d.w, d.h), g = ctx2d(canvas), left = p.x - d.ax, top = p.y - d.ay
  g.drawImage(native.canvas, 0, 0); g.globalCompositeOperation = 'destination-out'
  const seen = new Set<string>()
  const erase = (name: string, x: number, y: number): void => {
    const anchor = [name, x, y].join('|')
    if (seen.has(anchor)) return
    seen.add(anchor); blit(g, ts, name, x, y)
  }
  for (let cy = Math.floor(top / 256); cy <= Math.floor((top + d.h - 1) / 256); cy++) {
    for (let cx = Math.floor(left / 256); cx <= Math.floor((left + d.w - 1) / 256); cx++) {
      groundCracks(s, cx, cy, left, top, erase)
      floorDetails(s, t, cx, cy, left, top, erase)
    }
  }
  const pixels = g.getImageData(0, 0, d.w, d.h).data, bits = new Uint8Array(d.w * d.h)
  for (let i = 0; i < bits.length; i++) bits[i] = Number(pixels[i * 4 + 3] > 0)
  if (cache.entries.size >= 64) {
    const oldest = cache.entries.keys().next().value!
    const old = cache.entries.get(oldest)!
    old.canvas.width = old.canvas.height = 0; cache.entries.delete(oldest)
  }
  const result = { canvas, bits, w: d.w, h: d.h }; cache.entries.set(p.tile, result)
  return result
}
