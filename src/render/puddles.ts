// Water effects stay under walls/actors and are clipped to the native muddy-water interior.
import type { State } from '../core/types.ts'
import { CAVE_DRESSING } from '../core/cave-props.ts'
import { createWaterFx, waterClock, sampleWaterFoot, RIPPLE_LIFE } from '../core/puddle-fx.ts'
import { getResources } from '../assets/resources.ts'
import { visibleDressing, dressingOn } from './dressing.ts'
import type { DressingProp } from './dressing.ts'
import type { View } from './view.ts'
import { waterSurfaceMask } from './water-surface-mask.ts'
import { reflectActors } from './water-reflection.ts'
import { ctx2d, newCanvas } from './light.ts'
type Pool = { p: DressingProp; mask: NonNullable<ReturnType<typeof waterSurfaceMask>>; left: number; top: number }
function pixelRing(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const ry = r * 0.45
  for (let dx = -Math.ceil(r); dx <= r; dx++) {
    const dy = Math.round(ry * Math.sqrt(Math.max(0, 1 - dx * dx / (r * r))))
    g.fillRect(Math.round(x + dx), Math.round(y - dy), 1, 1)
    if (dy) g.fillRect(Math.round(x + dx), Math.round(y + dy), 1, 1)
  }
}
export function drawPuddles(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  const res = getResources(), fx = res.waterFx ??= createWaterFx(), playing = s.meta.screen === 'playing'
  waterClock(fx, s.meta.runId, s.meta.time, playing)
  if (!dressingOn(s)) return
  const props = visibleDressing(s, v), pools: Pool[] = []
  // ponytail: nearest 16 visible pools receive dynamic effects; all pools retain their cached native surface.
  const waters = props.filter(p => CAVE_DRESSING[p.def].water).sort((a, b) =>
    Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y)).slice(0, 16)
  for (const p of waters) {
    const d = CAVE_DRESSING[p.def], mask = waterSurfaceMask(s, p)
    if (mask) pools.push({ p, mask, left: p.x - d.ax, top: p.y - d.ay })
  }
  const wetTile = (x: number, y: number): number | null => {
    for (const pool of pools) {
      const px = Math.floor(x - pool.left), py = Math.floor(y - pool.top), { w, h, bits } = pool.mask
      if (px >= 0 && py >= 0 && px < w && py < h && bits[py * w + px]) return pool.p.tile
    }
    return null
  }
  if (playing) {
    sampleWaterFoot(fx, -1, s.player.x, s.player.y, wetTile(s.player.x, s.player.y))
    const ids = new Set([-1])
    for (const m of s.monsters) { ids.add(m.id); sampleWaterFoot(fx, m.id, m.x, m.y, wetTile(m.x, m.y)) }
    for (const id of fx.feet.keys()) if (!ids.has(id)) fx.feet.delete(id)
  }
  let canvas = res.light.get('puddle-effects')
  if (!canvas) { canvas = newCanvas(72, 64); res.light.set('puddle-effects', canvas) }
  const g = ctx2d(canvas)
  for (const pool of pools) {
    const { w, h } = pool.mask
    if (canvas.width < w) canvas.width = w
    if (canvas.height < h) canvas.height = h
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1
    g.clearRect(0, 0, canvas.width, canvas.height); g.imageSmoothingEnabled = false
    reflectActors(g, s, pool.left, pool.top, w, h, props)
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(90,76,47,0.3)'; g.fillRect(0, 0, w, h)
    g.globalCompositeOperation = 'source-over'
    for (const ripple of fx.ripples) if (ripple.tile === pool.p.tile) {
      const age = (fx.clock - ripple.born) / RIPPLE_LIFE
      if (age < 0 || age >= 1) continue
      g.globalAlpha = (1 - age) * 0.8; g.fillStyle = '#c2b18b'
      pixelRing(g, ripple.x - pool.left, ripple.y - pool.top, 1 + age * 12)
      if (age > 0.2) pixelRing(g, ripple.x - pool.left, ripple.y - pool.top, 1 + (age - 0.2) * 10)
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in'
    g.drawImage(pool.mask.canvas, 0, 0)
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.38; ctx.imageSmoothingEnabled = false
    ctx.drawImage(canvas, 0, 0, w, h, pool.left, pool.top, w, h); ctx.restore()
  }
}
