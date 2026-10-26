// Deterministic render-only prop cache. Never changes cave tiles, collision or gameplay RNG.
import type { State } from '../core/types.ts'
import { CAVE_DRESSING, dressingAt, dressingJitter, dressingWall } from '../core/cave-props.ts'
import { getResources } from '../assets/resources.ts'
import { cleanCells } from './cracks.ts'
import type { Draw } from './cracks.ts'
import type { View } from './view.ts'
import { currentQuality } from './quality.ts'
import { blit, tilesetOf } from './tileset.ts'
import { drawSprite } from '../assets/images.ts'
import type { DressingProp, DressingCache } from '../core/cave-props.ts'
export type { DressingProp, DressingCache } from '../core/cave-props.ts'
export const dressingOn = (s: State): boolean => s.debug.caveDetails && currentQuality(s).decor
export function dressingCache(s: State): DressingCache {
  const res = getResources()
  const key = [res.images.gen, s.world.exit.tx, s.world.exit.ty, s.meta.seed, s.world.tilesHash, s.world.w, s.world.h, s.world.entrance.tx, s.world.entrance.ty, s.world.beacon.tx, s.world.beacon.ty].join('|')
  if (res.dressing?.key === key) return res.dressing
  const props: DressingProp[] = [], cells = new Map<number, DressingProp>(), { w, h, tiles } = s.world, skip = cleanCells(s)
  for (let y = 1; y < h - 1; y += 3) for (let x = 1; x < w - 1; x += 3) {
    const def = dressingAt(tiles, w, h, x, y, s.meta.seed)
    if (def < 0) continue
    let clear = true
    for (let dy = -1; clear && dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (skip((y + dy) * w + x + dx)) clear = false
    if (!clear) continue
    const [jx, jy] = dressingJitter(x, y, s.meta.seed), p = { tile: y * w + x, def, x: x * 32 + 16 + jx, y: y * 32 + 16 + jy }
    props.push(p); cells.set(p.tile, p)
  }
  return res.dressing = { key, props, cells }
}
export function visibleDressing(s: State, v: View): DressingProp[] {
  if (!dressingOn(s)) return []
  const out: DressingProp[] = [], { cells } = dressingCache(s), { w } = s.world
  for (let y = Math.max(0, v.ty0 - 2); y <= Math.min(s.world.h - 1, v.ty1 + 2); y++) {
    for (let x = Math.max(0, v.tx0 - 2); x <= Math.min(w - 1, v.tx1 + 2); x++) {
      const p = cells.get(y * w + x)
      if (p) out.push(p)
    }
  }
  return out
}
export function dressingFloor(s: State, cx: number, cy: number, ox: number, oy: number, draw: Draw, water = false): void {
  if (!dressingOn(s)) return
  const { cells } = dressingCache(s), { w, h } = s.world
  for (let y = Math.max(0, cy * 8 - 2); y <= Math.min(h - 1, (cy + 1) * 8 + 2); y++) {
    for (let x = Math.max(0, cx * 8 - 2); x <= Math.min(w - 1, (cx + 1) * 8 + 2); x++) {
      const p = cells.get(y * w + x)
      if (p && CAVE_DRESSING[p.def].layer === 'surface' && CAVE_DRESSING[p.def].water === water) draw(CAVE_DRESSING[p.def].name, p.x - ox, p.y - oy)
    }
  }
}
export function dressingWallAt(s: State, tx: number, ty: number, x: number, y: number, draw: Draw): void {
  const d = dressingWall(tx, ty, s.meta.seed)
  if (d) draw(d.name, x, y)
}
export function drawDressingProp(ctx: CanvasRenderingContext2D, p: DressingProp): void {
  const d = CAVE_DRESSING[p.def], ts = tilesetOf()
  if (ts) blit(ctx, ts, d.name, p.x, p.y)
  else drawSprite(ctx, d.name.includes('stalagmite') ? 'prop_stalagmite' : d.name.includes('mushroom') ? 'prop_mushroom' : 'prop_roots', 'v', p.def % 2, p.x, p.y)
}

export function drawFallbackDressing(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  if (tilesetOf()) return
  for (const p of visibleDressing(s, v)) {
    const d = CAVE_DRESSING[p.def]
    if (d.layer === 'surface') drawSprite(ctx, d.water ? 'prop_puddle' : 'prop_roots', 'v', p.def % 2, p.x, p.y)
  }
}
