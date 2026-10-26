// Native square fire and a true historical wisp trail; all mutable data lives in the resource registry.
import type { State } from '../core/types.ts'
import { MINERALS } from '../core/state.ts'
import { createPixelPool, pixelClock, PIXEL_CAP, samplePixels } from '../core/pixel-particles.ts'
import { getResources } from '../assets/resources.ts'
import { beaconPosition } from '../world/beacon-position.ts'
import { torchTip } from './entities-player.ts'
import { FLAME_COL } from './flame.ts'
import { currentQuality } from './quality.ts'
import { emitterPixels, emitterPoint } from './emitter-pixels.ts'
import { beaconName, tileFrame } from './tileset.ts'
import { inView } from './view.ts'
import type { View } from './view.ts'

export function drawPixelFire(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const res = getResources(), p = res.pixelFx ??= createPixelPool(), playing = s.meta.screen === 'playing'
  pixelClock(p, s.meta.runId, s.meta.time, playing)
  if (playing) {
    const q = currentQuality(s).particles, tip = torchTip(s), b = beaconPosition(s)
    const material = MINERALS.indexOf(s.player.activeMineral as typeof MINERALS[number]) + 1
    samplePixels(p, 0, tip.x, tip.y, s.meta.phase === 'descent' && s.player.energy > 0, q, material)
    samplePixels(p, 1, s.wisp.wx, s.wisp.wy + 4, s.meta.phase === 'escape' && s.wisp.on, q)
    const [fx, fy, fw, fh, ax, ay] = tileFrame(beaconName(true, s.meta.time))
    const points = s.world.beaconLit ? emitterPixels(0, fx, fy, fw, fh, true) : new Uint16Array(0)
    samplePixels(p, 2, b.x, b.y - 32, s.world.beaconLit, q, 0, points.length ? n => {
      const [x, y] = emitterPoint(points, fw, n, 0)
      return [b.x - ax + x, b.y - ay + y]
    } : undefined)
  }
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.imageSmoothingEnabled = false
  for (let i = 0; i < PIXEL_CAP; i++) {
    const age = p.clock - p.born[i], life = p.life[i]
    if (life <= 0 || age < 0 || age >= life) continue
    const x = Math.round(p.x[i] + p.vx[i] * age), y = Math.round(p.y[i] + p.vy[i] * age)
    if (!inView(v, x, y)) continue
    const f = age / life, size = Math.max(1, p.size[i] - Math.floor(f * p.size[i]))
    const col = p.source[i] === 1 ? { core: '#ffe394', mantle: '#f9cd60', fringe: '#d8ab35' }
      : FLAME_COL[p.source[i] === 0 ? MINERALS[p.material[i] - 1] ?? 'none' : 'none']
    ctx.fillStyle = f < 0.25 ? col.core : f < 0.65 ? col.mantle : col.fringe
    ctx.globalAlpha = Math.min(1, (1 - f) * 3)
    ctx.fillRect(x, y, size, size)
  }
  ctx.restore()
}
