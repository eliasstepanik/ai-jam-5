// Emission consists only of coloured crystal texels from the mounted ore artwork.
import type { State } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { getResources } from '../assets/resources.ts'
import { blit, oreDirection, oreName, tileFrame, tilesetOf } from './tileset.ts'
import { ctx2d, newCanvas } from './light.ts'
import { drawWallRow } from './tiles.ts'
import { FACE_H, WALL_PAD } from './tiles-paint.ts'
import type { View } from './view.ts'

export function drawOreEmission(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const ts = tilesetOf()
  if (!ts || s.meta.phase === 'escape') return
  const res = getResources(), w = s.world.w
  for (const ore of s.veins) {
    const tx = ore.tile % w, ty = Math.floor(ore.tile / w)
    if (tx < v.tx0 - 1 || tx > v.tx1 + 1 || ty < v.ty0 || ty > v.ty1) continue
    const dir = oreDirection(ore.tile, ore.stand, w), name = oreName(ore.mineral, ore.id, dir)
    const f = tileFrame(name), key = 'ore:' + res.images.gen + ':' + name
    let mask = res.swapped.get(key)
    if (!mask) {
      mask = newCanvas(f[2], f[3])
      const g = ctx2d(mask)
      blit(g, ts, name, f[4], f[5])
      const im = g.getImageData(0, 0, f[2], f[3]), d = im.data
      for (let i = 0; i < d.length; i += 4) {
        const hi = Math.max(d[i], d[i + 1], d[i + 2]), lo = Math.min(d[i], d[i + 1], d[i + 2])
        if (hi < 65 || hi - lo < 28 || hi - lo < hi * 0.28) d[i + 3] = 0
      }
      g.putImageData(im, 0, 0)
      res.swapped.set(key, mask)
      if (res.swapped.size > 256) res.swapped.delete(res.swapped.keys().next().value!)
    }
    let scratch = res.light.get('ore-emission')
    if (!scratch) { scratch = newCanvas(48, 96); res.light.set('ore-emission', scratch) }
    const g = ctx2d(scratch), x = tx * TILE + (dir === 'south' ? 16 : 0) - f[4]
    const y = ty * TILE - FACE_H + (dir === 'south' ? TILE + FACE_H / 2 : 0) - f[5]
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'
    g.clearRect(0, 0, 48, 96); g.drawImage(mask, 0, 0)
    g.setTransform(1, 0, 0, 1, -x, -y); g.globalCompositeOperation = 'destination-out'
    const walls = { ...v, tx0: Math.max(0, Math.floor(x / TILE)), tx1: Math.min(w - 1, Math.floor((x + f[2] - 1) / TILE)) }
    for (let row = ty + 1; row <= Math.min(s.world.h - 1, Math.floor((y + f[3] + FACE_H + WALL_PAD) / TILE)); row++) drawWallRow(g, s, walls, row)
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.7
    ctx.drawImage(scratch, x, y); ctx.restore()
  }
}
