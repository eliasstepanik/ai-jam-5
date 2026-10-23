// L4 render: tile paint helpers for tiles.ts (2.5D, R-179/R-180/R-181/R-186). Spec: docs/architecture-render-2.md §2.2 (paintFloor, wall layer order),
// docs/notes/ai-jam-5-asset-formats-25d.md. Pure drawing into a given context: no state, no rng, never writes State.
// `ts === null` (tileset image not decoded) paints flat per-zone fills in the same geometry (placeholders, assets-sprites-2 §2.3-2.4).
import type { MineralId, State, Zone } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { hash2 } from '../core/noise.ts'
import { floorVariant } from '../core/grid.ts'
import type { TileCache } from '../assets/resources.ts'
import { CHUNK_TILES } from './keys.ts'
import { blit, capName, faceName, floorName, oreName } from './tileset.ts'
import type { Tileset } from './tileset.ts'

export const HASH = 35 // '#'
export const CHUNK_PX = CHUNK_TILES * TILE // 256
export const FACE_H = 48 // a wall face hangs 48 world px below its cap (R-178)
export const WALLS_H = CHUNK_PX + FACE_H // 304: walls canvas height, the south overhang of the last tile row (R-181)
const CELL = 24 // floor pattern cell (R-179)
const FACE_SALT = 0x9e37, CAP_SALT = 0x51ab // DEFAULT: salts for the face variant and the cap_fill pick

const FLOOR_FILL: Record<Zone, string> = { 1: '#2b2420', 2: '#262a2e', 3: '#222a22', 4: '#2a2230' }
const CAP_FILL: Record<Zone, string> = { 1: '#0c0a09', 2: '#0b0c0e', 3: '#0a0c0a', 4: '#0c0a0e' }
const FACE_FILL: Record<Zone, string> = { 1: '#3a2e26', 2: '#2f353b', 3: '#2c3a2c', 4: '#382e40' }
const ORE_FILL: Record<MineralId, string> = { copper: '#c97b3a', sodium: '#e8c14a', strontium: '#d94a4a' }

export const faceVariant = (x: number, y: number, seed: number): number => Math.floor(hash2(x, y, seed ^ FACE_SALT) * 4)

// Cap frame: the open-neighbour mask, except a fully closed cell (mask 0) swaps to `cap_fill_1..3` for hash < 0.3 (render-2 §2.2).
function capOf(mask: number, tx: number, ty: number, seed: number): string {
  if (mask === 0) {
    const h = hash2(tx, ty, seed ^ CAP_SALT)
    if (h < 0.3) return 'cap_fill_' + (1 + Math.floor(h / 0.1))
  }
  return capName(mask)
}

// Floor canvas content for chunk (cx, cy), top-left drawn at (-ox, -oy): cached chunks pass the chunk origin, the direct fallback 0, 0.
// Every 24 px cell touching the chunk is painted unconditionally (R-179): a cell may straddle a 32 px tile edge, and the opaque caps
// above hide it on wall cells. Neighbouring chunks derive the same variant for a shared cell, so overdraw is identical.
export function paintFloor(c: CanvasRenderingContext2D, s: State, t: TileCache, ts: Tileset | null, cx: number, cy: number, ox: number, oy: number): void {
  const { w, h } = s.world, seed = s.meta.seed
  const fx1 = Math.ceil(((cx + 1) * CHUNK_PX) / CELL), fy1 = Math.ceil(((cy + 1) * CHUNK_PX) / CELL)
  for (let fy = Math.floor((cy * CHUNK_PX) / CELL); fy < fy1; fy++) {
    for (let fx = Math.floor((cx * CHUNK_PX) / CELL); fx < fx1; fx++) {
      const x = fx * CELL - ox, y = fy * CELL - oy
      if (ts) { blit(c, ts, floorName(floorVariant(fx, fy, seed)), x, y); continue }
      const tx = Math.min(w - 1, Math.floor((fx * CELL + CELL / 2) / TILE)), ty = Math.min(h - 1, Math.floor((fy * CELL + CELL / 2) / TILE))
      c.fillStyle = FLOOR_FILL[(t.zone[ty * w + tx] || 1) as Zone]
      c.fillRect(x, y, CELL, CELL)
    }
  }
}

// Wall layer for the tiles [tx0, tx1) x [ty0, ty1) (clamped to the map), tile (tx, ty) at (tx * 32 - ox, ty * 32 - oy). Order per tile:
// cap, face (bit S set: floor to the south) into the south cell, then per inner bit k `inner_cutout_k` (destination-out) and `inner_rim_k`;
// south-facing ores last (R-186). `cut` false (direct fallback into the main context) skips the cutouts and rims: destination-out would
// erase the floor underneath. ponytail: inner corners look square for the few frames a chunk is over the build quota; a scratch canvas fixes it.
export function paintWalls(c: CanvasRenderingContext2D, s: State, t: TileCache, ts: Tileset | null,
  tx0: number, tx1: number, ty0: number, ty1: number, ox: number, oy: number, cut: boolean): void {
  const { w, h, tiles } = s.world
  const xa = Math.max(0, tx0), xb = Math.min(w, tx1), ya = Math.max(0, ty0), yb = Math.min(h, ty1)
  for (let ty = ya; ty < yb; ty++) {
    for (let tx = xa; tx < xb; tx++) {
      const i = ty * w + tx
      if (tiles.charCodeAt(i) !== HASH) continue
      const x = tx * TILE - ox, y = ty * TILE - oy, m = t.mask[i]
      if (!ts) {
        const z = (t.zone[i] || 1) as Zone
        c.fillStyle = CAP_FILL[z]
        c.fillRect(x, y, TILE, TILE)
        if (m & 4) { c.fillStyle = FACE_FILL[z]; c.fillRect(x, y + TILE, TILE, FACE_H) }
        continue
      }
      blit(c, ts, capOf(m, tx, ty, s.meta.seed), x, y)
      if (m & 4) blit(c, ts, faceName(m, (m & 8) !== 0, (m & 2) !== 0, t.variant[i]), x, y + TILE) // W bit 8, E bit 2
      if (!cut || !t.inner[i]) continue
      for (let k = 0; k < 4; k++) {
        if (!(t.inner[i] & (1 << k))) continue
        c.globalCompositeOperation = 'destination-out'
        blit(c, ts, 'inner_cutout_' + k, x, y)
        c.globalCompositeOperation = 'source-over'
        blit(c, ts, 'inner_rim_' + k, x, y)
      }
    }
  }
  // South-facing ores: vein wall tile with the stand tile directly south. The 32x48 frame (anchor 16,24) covers the face exactly.
  for (const v of s.veins) {
    const tx = v.tile % w, ty = (v.tile - tx) / w
    if (tx < xa || tx >= xb || ty < ya || ty >= yb || v.stand !== v.tile + w || !(t.mask[v.tile] & 4)) continue
    const x = tx * TILE - ox, y = ty * TILE - oy + TILE
    if (ts) { blit(c, ts, oreName(v.mineral, v.id), x + TILE / 2, y + FACE_H / 2); continue }
    c.fillStyle = ORE_FILL[v.mineral]
    c.fillRect(x + 10, y + 14, 12, 20)
  }
}
