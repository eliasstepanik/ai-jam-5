import { dressingFloor, dressingWallAt } from './dressing.ts'
import type { State } from '../core/types.ts'
import type { TileCache } from '../assets/resources.ts'
import { TILE } from '../core/state.ts'
import { hash2 } from '../core/noise.ts'
import { detailStage, floorDetail, wallDetail } from '../core/cave-detail.ts'
import { guideFields } from '../core/cave-guide.ts'
import type { GuideFields } from '../core/cave-guide.ts'
import { classAt } from '../core/cave-purpose.ts'
import { cleanCells } from './cracks.ts'
import type { Draw, Skip } from './cracks.ts'
import { depth01Field, wetField } from './depth-tone.ts'
import { blit, tilesetOf } from './tileset.ts'
import { currentQuality } from './quality.ts'
import type { View } from './view.ts'
export const damageStage = (s: State): number => detailStage(s.meta.phase === 'escape', s.director.escapeT)
export const detailsOn = (s: State): boolean => s.debug.caveDetails && currentQuality(s).decor
// Everything the detail pick reads per tile, resolved once per cave (not per tile): the continuous depth and wet fields from
// render/depth-tone.ts and the memoized purpose guide. Read-only derived data; the vine-sites chunk (A6) must use these same helpers.
export type DetailCtx = { tiles: string; w: number; h: number; seed: number; depth: Float32Array; wet: Uint8Array; g: GuideFields }
// ponytail: size-1 memo compared by number (no per-call string key). Derived only, so a hot swap just rebuilds; upgrade to an LRU
// if two caves are ever drawn in one frame.
let memo: DetailCtx & { run: number; hash: number; bd: number; ex: number; ey: number; bx: number; by: number } | null = null
export function detailCtx(s: State): DetailCtx {
  const { w, h, tiles, tilesHash, beaconDist, entrance: e, beacon: b } = s.world, seed = s.meta.seed, run = s.meta.runId
  const m = memo
  if (m && m.tiles === tiles && m.run === run && m.hash === tilesHash && m.w === w && m.h === h && m.seed === seed && m.bd === beaconDist
    && m.ex === e.tx && m.ey === e.ty && m.bx === b.tx && m.by === b.ty) return m
  memo = { tiles, w, h, seed, depth: depth01Field(s), wet: wetField(s), g: guideFields(tiles, w, h, e.ty * w + e.tx, b.ty * w + b.tx),
    run, hash: tilesHash, bd: beaconDist, ex: e.tx, ey: e.ty, bx: b.tx, by: b.ty }
  return memo
}
// The purpose class only changes WHICH frame a tile gets, never whether it gets one (the gate hash and floor tests ignore cls), so the
// cls-less call is a cheap pre-gate and the costly classAt runs only for the ~5-8 % of tiles that actually carry a detail.
export function floorDetailAt(c: DetailCtx, x: number, y: number): string | null {
  const i = y * c.w + x
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return null
  const d = c.depth[i], wet = c.wet[i] === 1
  if (!floorDetail(c.tiles, c.w, c.h, x, y, c.seed, d, wet)) return null
  return floorDetail(c.tiles, c.w, c.h, x, y, c.seed, d, wet, classAt(c.g, i, c.seed))
}
// Depth and wet come from the wall tile itself (depth01Field fills walls from the nearest floor). A wall tile is never reachable, so
// its own class is always 'none': the class is read from the floor tile below it, which is the face the detail is drawn on.
export function wallDetailAt(c: DetailCtx, tx: number, ty: number): string | null {
  const i = ty * c.w + tx
  if (tx < 0 || ty < 0 || tx >= c.w || ty >= c.h) return null
  const d = c.depth[i], wet = c.wet[i] === 1
  if (!wallDetail(tx, ty, c.seed, d, wet)) return null
  return wallDetail(tx, ty, c.seed, d, wet, classAt(c.g, ty + 1 < c.h ? i + c.w : i, c.seed))
}
export function floorDetails(s: State, _t: TileCache, cx: number, cy: number, ox: number, oy: number, draw: Draw): void {
  if (!detailsOn(s)) return
  dressingFloor(s, cx, cy, ox, oy, draw)
  const { w, h } = s.world, skip = cleanCells(s), c = detailCtx(s)
  // Wide vines straddle chunks. Visit neighboring anchors and let the destination clip to its chunk.
  for (let y = cy * 8 - 1; y <= (cy + 1) * 8; y++) for (let x = cx * 8 - 1; x <= (cx + 1) * 8; x++) {
    if (x < 1 || x >= w - 1 || y < 1 || y >= h - 1) continue
    if (skip(y * w + x) || skip(y * w + x - 1) || skip(y * w + x + 1)) continue
    const name = floorDetailAt(c, x, y)
    if (name) draw(name, x * TILE + 16 - ox, y * TILE + 24 - oy)
  }
}
export function wallDetails(s: State, skip: Skip, tx: number, ty: number, x: number, y: number, draw: Draw): void {
  if (!detailsOn(s) || skip(ty * s.world.w + tx) || skip((ty + 1) * s.world.w + tx) || skip(ty * s.world.w + tx - 1) || skip(ty * s.world.w + tx + 1)) return
  dressingWallAt(s, tx, ty, x + 16, y + 56, draw)
  const name = wallDetailAt(detailCtx(s), tx, ty)
  if (name) draw(name, x + 16, y + 56)
}
// Local fracture scars appear at quake impacts, under all actors. Capped and culled; no cache invalidation per falling rock.
export function drawQuakeScars(ctx: CanvasRenderingContext2D, s: State, v: View): void {
  if (s.meta.phase !== 'escape' || !detailsOn(s)) return
  const ts = tilesetOf()
  if (!ts) return
  const skip = cleanCells(s), { w, tiles } = s.world
  let used = 0
  for (const rock of s.rocks) {
    if (rock.x < v.x0 - 64 || rock.x > v.x1 + 64 || rock.y < v.y0 - 64 || rock.y > v.y1 + 64) continue
    const tx = Math.floor(rock.x / TILE), ty = Math.floor(rock.y / TILE)
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const x = tx + dx * (rock.size + 1), y = ty + dy * (rock.size + 1), i = y * w + x
      if (x < 0 || x >= w || y < 0 || y >= s.world.h || tiles[i] === '#' || skip(i)) continue
      const k = 1 + Math.floor(hash2(x, y, s.meta.seed ^ rock.id) * 4)
      blit(ctx, ts, 'ground_crack_0' + k, x * TILE + 16, y * TILE + 16)
      if (++used >= 48) return
    }
  }
}
