// Opaque pixel shadows born inside the sprite, retaining their birth site through animation/movement.
// Draw after darkness: screen visibility, rather than torch range, controls emission.
import type { State } from '../core/types.ts'
import { dirIndex } from '../core/grid.ts'
import { getResources } from '../assets/resources.ts'
import { currentQuality } from './quality.ts'
import { MON_FOOT, entityInView, monsterFrame, monsterDirection } from './entities.ts'
import { charFrame } from './charatlas.ts'
import { emitterPixels, emitterPoint } from './emitter-pixels.ts'
import type { View } from './view.ts'
import { eachMist, MIST } from '../systems/mist.ts'

export function drawMist(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const res = getResources(), fx = res.shadowFx ??= { runId: -1, at: -1, slots: new Map() }
  if (fx.runId !== s.meta.runId || s.meta.time < fx.at) fx.slots.clear()
  fx.runId = s.meta.runId; fx.at = s.meta.time
  const seen = new Set<number>()
  ctx.save()
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#000000'
  ctx.globalAlpha = 1
  eachMist(s, currentQuality(s).particles, m => entityInView(v, m.x, m.y),
    (kind, _x, _y, r, a, m, slot, cycle, age) => {
      const key = m.id * 64 + slot, profile = MIST[kind]
      seen.add(key)
      let birth = fx.slots.get(key)
      if (!birth || birth.cycle !== cycle) {
        const [anim, index] = monsterFrame(s, m), f = charFrame(kind, anim, dirIndex(monsterDirection(s, m)), index)
        const points = emitterPixels(1, f.x, f.y, 64, 64)
        if (!points.length) return
        const [x, y] = emitterPoint(points, 64, key, cycle)
        birth = { cycle, x: Math.round(m.x) - 32 + x, y: Math.round(m.y - MON_FOOT[kind]) - 32 + y }
        fx.slots.set(key, birth)
      }
      if (a <= 0) return
      const size = Math.max(1, Math.ceil((kind === 'devourer' ? 4 : 3) * r / profile.r))
      ctx.fillRect(birth.x, Math.round(birth.y - profile.rise * age), size, size)
    })
  for (const key of fx.slots.keys()) if (!seen.has(key)) fx.slots.delete(key)
  ctx.restore()
}
