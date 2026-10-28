// Deterministic render-only prop cache. Never changes cave tiles, collision or gameplay RNG.
import type { State } from '../core/types.ts'
import { CAVE_DRESSING, dressingAt, dressingJitter, dressingWall } from '../core/cave-props.ts'
import { guideFields } from '../core/cave-guide.ts'
import type { GuideFields } from '../core/cave-guide.ts'
import { purposeDef, purposeWall } from '../core/cave-purpose.ts'
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
// Derived per-cave data, keyed by the identity of the dressing cache entry (so by the cache key): the guide fields, a lazily filled
// purposeWall result per tile (WALL_UNSEEN = not computed, WALL_NONE = no prop, else a CAVE_DRESSING index; purposeWall runs classAt up to 58x)
// and the final purposed water anchors. A hot swap or a new cave just misses the WeakMap and refills it; nothing here touches State.
const WALL_UNSEEN = -2, WALL_NONE = -1
type Derived = { g: GuideFields; wall: Int8Array; water: DressingProp[] }
const DERIVED = new WeakMap<DressingCache, Derived>()
const guideOf = (s: State): GuideFields => {
  const { w, tiles, entrance, beacon } = s.world
  return guideFields(tiles, w, s.world.h, entrance.ty * w + entrance.tx, beacon.ty * w + beacon.tx)
}
const derive = (s: State, c: DressingCache, g: GuideFields): Derived => {
  const d: Derived = { g, wall: new Int8Array(s.world.w * s.world.h).fill(WALL_UNSEEN), water: c.props.filter(p => CAVE_DRESSING[p.def].water) }
  DERIVED.set(c, d)
  return d
}
export function dressingCache(s: State): DressingCache {
  const res = getResources()
  const key = [res.images.gen, s.world.exit.tx, s.world.exit.ty, s.meta.seed, s.world.tilesHash, s.world.w, s.world.h, s.world.entrance.tx, s.world.entrance.ty, s.world.beacon.tx, s.world.beacon.ty].join('|')
  if (res.dressing?.key === key) return res.dressing
  const props: DressingProp[] = [], cells = new Map<number, DressingProp>(), { w, h, tiles } = s.world, skip = cleanCells(s), g = guideOf(s)
  for (let y = 1; y < h - 1; y += 3) for (let x = 1; x < w - 1; x += 3) {
    if (dressingAt(tiles, w, h, x, y, s.meta.seed) < 0) continue // the slot gate stays; purposeDef decides what goes there, or rejects it
    const def = purposeDef(g, x, y, s.meta.seed)
    if (def < 0) continue
    let clear = true
    for (let dy = -1; clear && dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (skip((y + dy) * w + x + dx)) clear = false
    if (!clear) continue
    const [jx, jy] = dressingJitter(x, y, s.meta.seed), p = { tile: y * w + x, def, x: x * 32 + 16 + jx, y: y * 32 + 16 + jy }
    props.push(p); cells.set(p.tile, p)
  }
  const entry: DressingCache = { key, props, cells }
  derive(s, entry, g)
  return res.dressing = entry
}
const derivedOf = (s: State): Derived => {
  const c = dressingCache(s)
  return DERIVED.get(c) ?? derive(s, c, guideOf(s))
}
// Final purposed water props (class wet only), in lattice order, for later consumers (wetField). Read-only; rebuilt with the cache key.
export const purposedWater = (s: State): readonly DressingProp[] => derivedOf(s).water
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
  const { w, h } = s.world
  if (tx < 0 || ty < 0 || tx >= w || ty >= h || !dressingWall(tx, ty, s.meta.seed)) return // cheap hash gate first: most wall tiles never touch the cache
  const dv = derivedOf(s), i = ty * w + tx
  if (dv.wall[i] === WALL_UNSEEN) {
    const d = purposeWall(dv.g, tx, ty, s.meta.seed)
    dv.wall[i] = d ? CAVE_DRESSING.indexOf(d) : WALL_NONE
  }
  if (dv.wall[i] >= 0) draw(CAVE_DRESSING[dv.wall[i]].name, x, y)
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
