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
import { drawGlowSprite } from './glow.ts'
import { FLAME_COL } from './flame.ts'
import { torchTip } from './entities.ts'
import { vineSites } from './vine-sites.ts'
import { depth01Field } from './depth-tone.ts'
import { shimmerAlpha, dripOf, rimOf, poolTint } from './puddle-surface.ts'
import { flameRadius } from '../systems/light.ts'
import { beaconPosition } from '../world/beacon-position.ts'
import { hash2 } from '../core/noise.ts'
const COLD = '#7f9096', VINE = '#6dffc4', BEACON = '#ffb347', STREAK_SALT = 0xd81b // salt grep-verified unused in src/
const TAU = Math.PI * 2
type Pool = { p: DressingProp; mask: NonNullable<ReturnType<typeof waterSurfaceMask>>; left: number; top: number }
function pixelRing(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const ry = r * 0.45
  for (let dx = -Math.ceil(r); dx <= r; dx++) {
    const dy = Math.round(ry * Math.sqrt(Math.max(0, 1 - dx * dx / (r * r))))
    g.fillRect(Math.round(x + dx), Math.round(y - dy), 1, 1)
    if (dy) g.fillRect(Math.round(x + dx), Math.round(y + dy), 1, 1)
  }
}
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x))
// Light reflection: the source mirrored about the pool's top edge, clamped into the mask (design-render §5).
function reflect(g: CanvasRenderingContext2D, pool: Pool, hex: string, wx: number, wy: number, alpha: number): void {
  drawGlowSprite(g, hex, clamp(wx - pool.left, 0, pool.mask.w - 1), clamp(pool.top - wy, 0, pool.mask.h - 1), 14, alpha)
}
function ring(g: CanvasRenderingContext2D, x: number, y: number, age: number): void {
  pixelRing(g, x, y, 1 + age * 12)
  if (age > 0.2) pixelRing(g, x, y, 1 + (age - 0.2) * 10)
}
// One pool's dynamic layer, drawn onto the shared scratch canvas before the mask clip. Reads only s / fx.clock; writes nothing but g.
function paintPool(g: CanvasRenderingContext2D, s: State, v: View, fx: ReturnType<typeof createWaterFx>, pool: Pool, props: DressingProp[]): void {
  const { w, h } = pool.mask, tile = pool.p.tile, clock = fx.clock, pl = s.player
  const cx = pool.left + w / 2, cy = pool.top + h / 2, R = flameRadius(s)
  const torch = s.meta.phase !== 'escape' && pl.energy > 0, dist = Math.hypot(cx - pl.x, cy - pl.y), lit = torch && dist < R
  const col = lit ? FLAME_COL[pl.activeMineral].mantle : COLD
  reflectActors(g, s, pool.left, pool.top, w, h, props)
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = poolTint(depth01Field(s)[tile] ?? 0); g.fillRect(0, 0, w, h)
  g.globalCompositeOperation = 'lighter'
  if (lit) reflect(g, pool, col, pl.x, torchTip(s).y, 0.5 * (1 - dist / R))
  if (s.world.beaconLit || pl.beaconHold > 0) {
    const b = beaconPosition(s), bd = Math.hypot(cx - b.x, cy - (b.y - 32))
    if (bd < 96) reflect(g, pool, BEACON, b.x, b.y - 32, 0.5 * (1 - bd / 96))
  }
  const sites = vineSites(s, v)
  let best = 64 * 64, bx = 0, by = 0, found = false
  for (let i = 0; i < sites.length; i += 3) {
    const d2 = (sites[i] - cx) ** 2 + (sites[i + 1] - cy) ** 2
    if (d2 < best) { best = d2; bx = sites[i]; by = sites[i + 1]; found = true }
  }
  if (found) reflect(g, pool, VINE, bx, by, 0.35)
  g.globalCompositeOperation = 'source-over'; g.fillStyle = col
  const phase = hash2(tile, 3, STREAK_SALT), f = 0.12 * clock + phase
  g.globalAlpha = 0.22; g.fillRect(0, Math.round(h * (0.25 + 0.5 * (f - Math.floor(f)))), w, 1) // 1-px specular streak
  const rim = rimOf(pool.mask)
  g.globalAlpha = 0.16 + 0.08 * Math.sin(TAU * (0.25 * clock + phase))
  // ponytail: one fillRect per horizontal run of rim bits, not per pixel; a per-mask cached rim canvas is the upgrade if pools get larger.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!rim[y * w + x]) continue
    let n = 1
    while (x + n < w && rim[y * w + x + n]) n++
    g.fillRect(x, y, n, 1); x += n
  }
  for (const ripple of fx.ripples) if (ripple.tile === tile) {
    const age = (clock - ripple.born) / RIPPLE_LIFE
    if (age < 0 || age >= 1) continue
    g.globalAlpha = (1 - age) * 0.8
    ring(g, ripple.x - pool.left, ripple.y - pool.top, age)
  }
  const drip = dripOf(tile, clock, pool.mask) // ambient: never enters fx.ripples
  if (drip && drip.age < 1) { g.globalAlpha = (1 - drip.age) * 0.5; pixelRing(g, drip.x + 0.5, drip.y + 0.5, 1 + drip.age * 12) } // exactly one ring
  g.globalAlpha = 1
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
    paintPool(g, s, v, fx, pool, props)
    g.globalCompositeOperation = 'destination-in'
    g.drawImage(pool.mask.canvas, 0, 0)
    ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = shimmerAlpha(fx.clock, pool.p.tile); ctx.imageSmoothingEnabled = false
    ctx.drawImage(canvas, 0, 0, w, h, pool.left, pool.top, w, h); ctx.restore()
  }
}
