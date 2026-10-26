import { dressingFloor, dressingWallAt } from './dressing.ts'
import type { State } from '../core/types.ts'
import type { TileCache } from '../assets/resources.ts'
import { TILE } from '../core/state.ts'
import { hash2 } from '../core/noise.ts'
import { detailStage, floorDetail, wallDetail } from '../core/cave-detail.ts'
import { cleanCells } from './cracks.ts'
import type { Draw, Skip } from './cracks.ts'
import { blit, tilesetOf } from './tileset.ts'
import { currentQuality } from './quality.ts'
import type { View } from './view.ts'
export const damageStage = (s: State): number => detailStage(s.meta.phase === 'escape', s.director.escapeT)
export const detailsOn = (s: State): boolean => s.debug.caveDetails && currentQuality(s).decor
export function floorDetails(s: State, t: TileCache, cx: number, cy: number, ox: number, oy: number, draw: Draw): void {
  if (!detailsOn(s)) return
  dressingFloor(s, cx, cy, ox, oy, draw)
  const { w, h, tiles } = s.world, skip = cleanCells(s)
  // Wide vines straddle chunks. Visit neighboring anchors and let the destination clip to its chunk.
  for (let y = cy * 8 - 1; y <= (cy + 1) * 8; y++) for (let x = cx * 8 - 1; x <= (cx + 1) * 8; x++) {
    if (x < 1 || x >= w - 1 || y < 1 || y >= h - 1) continue
    if (skip(y * w + x) || skip(y * w + x - 1) || skip(y * w + x + 1)) continue
    const name = floorDetail(tiles, w, h, x, y, s.meta.seed, t.zone[y * w + x])
    if (name) draw(name, x * TILE + 16 - ox, y * TILE + 24 - oy)
  }
}
export function wallDetails(s: State, skip: Skip, tx: number, ty: number, x: number, y: number, draw: Draw): void {
  if (!detailsOn(s) || skip(ty * s.world.w + tx) || skip((ty + 1) * s.world.w + tx) || skip(ty * s.world.w + tx - 1) || skip(ty * s.world.w + tx + 1)) return
  dressingWallAt(s, tx, ty, x + 16, y + 56, draw)
  const name = wallDetail(tx, ty, s.meta.seed)
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
