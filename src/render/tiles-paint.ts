// L4 render: tile paint helpers for tiles.ts (2.5D, R-179/R-180/R-181/R-186). Spec: docs/architecture-render-2.md §2.2 (paintFloor, wall layer order),
// docs/notes/ai-jam-5-asset-formats-25d.md. Pure drawing into a given context: no state, no rng, never writes State.
// `ts === null` (tileset image not decoded) paints flat per-zone fills in the same geometry (placeholders, assets-sprites-2 §2.3-2.4).
import type { MineralId, State, Zone } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { hash2 } from '../core/noise.ts'
import { floorVariant } from '../core/grid.ts'
import type { TileCache } from '../assets/resources.ts'
import { entranceWall } from '../world/entrance-art.ts'
import { floorDetails, wallDetails } from './cave-details.ts'
import { cleanCells, groundCracks, wallCrackAt } from './cracks.ts'
import type { Skip } from './cracks.ts'
import { CHUNK_TILES } from './keys.ts'
import { blit, capName, cornerName, faceName, floorName, oreDirection, oreName } from './tileset.ts'
import type { Tileset } from './tileset.ts'

export const HASH = 35 // '#'
export const CHUNK_PX = CHUNK_TILES * TILE // 256
export const FACE_H = 48 // wall height above the collision ground plane
export const WALL_PAD = 16 // padded corners and the wall-mounted entrance extend beyond the old cap/face strip
export const WALL_ROW_H = TILE + FACE_H + 2 * WALL_PAD // complete cap + face; never split a wall around an actor
export const WALLS_H = CHUNK_TILES * WALL_ROW_H // 640: eight independent 80 px wall-row strips
const CELL = 24 // floor pattern cell (R-179)
const FACE_SALT = 0x9e37 // DEFAULT: salt for the face variant

const FLOOR_FILL: Record<Zone, string> = { 1: '#2b2420', 2: '#262a2e', 3: '#222a22', 4: '#2a2230' }
const CAP_FILL: Record<Zone, string> = { 1: '#0c0a09', 2: '#0b0c0e', 3: '#0a0c0a', 4: '#0c0a0e' }
const FACE_FILL: Record<Zone, string> = { 1: '#3a2e26', 2: '#2f353b', 3: '#2c3a2c', 4: '#382e40' }
const ORE_FILL: Record<MineralId, string> = { copper: '#c97b3a', sodium: '#e8c14a', strontium: '#d94a4a' }

export const faceVariant = (x: number, y: number, seed: number): number => Math.floor(hash2(x, y, seed ^ FACE_SALT) * 4)

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
  if (!ts) return
  // Ground cracks (issue #85): decals centred on their tile, drawn above the floor pattern (placement and exclusions: cracks.ts).
  groundCracks(s, cx, cy, ox, oy, (name, x, y) => blit(c, ts, name, x, y))
  floorDetails(s, t, cx, cy, ox, oy, (name, x, y) => blit(c, ts, name, x, y))
}

// Wall row raised FACE_H above the collision footprint. Corner composites replace cap/face per owning cell;
// directional ore and the wall-mounted entrance are layered last. The caller clips to a padded row strip.
export function paintWalls(c: CanvasRenderingContext2D, s: State, t: TileCache, ts: Tileset | null,
  tx0: number, tx1: number, ty0: number, ty1: number, ox: number, oy: number): void {
  const { w, h, tiles } = s.world
  const xa = Math.max(0, tx0), xb = Math.min(w, tx1), ya = Math.max(0, ty0), yb = Math.min(h, ty1)
  const skip: Skip = ts ? cleanCells(s) : () => false
  for (let ty = ya; ty < yb; ty++) {
    for (let tx = xa; tx < xb; tx++) {
      const i = ty * w + tx
      if (tiles.charCodeAt(i) !== HASH) continue
      const x = tx * TILE - ox, y = ty * TILE - oy - FACE_H, m = t.mask[i]
      if (!ts) {
        const z = (t.zone[i] || 1) as Zone
        c.fillStyle = CAP_FILL[z]
        c.fillRect(x, y, TILE, TILE)
        if (m & 4) { c.fillStyle = FACE_FILL[z]; c.fillRect(x, y + TILE, TILE, FACE_H) }
        continue
      }
      const corner = cornerName(m, t.inner[i], t.variant[i])
      if (corner) {
        // Connect the rounded crest to its solid northern neighbour; otherwise its transparent padding exposes floor inside rock.
        if (!(m & 1)) { c.fillStyle = '#000'; c.fillRect(x, y, TILE, 8) }
        // A padded crest must not paint a floating lip over the solid cap in the previous ground row.
        c.save(); c.beginPath(); c.rect(x - (m & 8 ? 8 : 0), y, TILE + (m & 8 ? 8 : 0) + (m & 2 ? 8 : 0), TILE + (m & 4 ? FACE_H : 0)); c.clip()
        blit(c, ts, corner, x, y)
        c.restore()
      }
      else {
        blit(c, ts, capName(m), x, y)
        if (m & 4) blit(c, ts, faceName(m, (m & 8) !== 0, (m & 2) !== 0, t.variant[i]), x, y + TILE)
      }
      if (m & 4) wallDetails(s, skip, tx, ty, x, y, (name, ax, ay) => blit(c, ts, name, ax, ay))
      if (m & 4) wallCrackAt(s, skip, tx, ty, x + TILE / 2, y + TILE + FACE_H / 2, (name, ax, ay) => blit(c, ts, name, ax, ay))
    }
  }
  // Authored directional ore overlays: no rotation. Each is mounted on its owning wall cell.
  for (const v of s.veins) {
    const tx = v.tile % w, ty = Math.floor(v.tile / w)
    if (tx < xa || tx >= xb || ty < ya || ty >= yb || tiles[v.tile] !== '#') continue
    const x = tx * TILE - ox, y = ty * TILE - oy - FACE_H, direction = oreDirection(v.tile, v.stand, w)
    if (ts) blit(c, ts, oreName(v.mineral, v.id, direction), direction === 'south' ? x + 16 : x, direction === 'south' ? y + TILE + FACE_H / 2 : y)
    else { c.fillStyle = ORE_FILL[v.mineral]; c.fillRect(x + 10, y + 46, 12, 20) }
  }
  const door = ts ? entranceWall(s) : null
  if (ts && door && door.ty >= ya && door.ty < yb && door.tx + 2 >= xa && door.tx - 2 < xb) {
    blit(c, ts, 'wall_cave_entrance_3wide', door.tx * TILE + 16 - ox, (door.ty + 1) * TILE - oy)
  }
}
