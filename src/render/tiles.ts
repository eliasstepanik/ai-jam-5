// L4 render: tile pass (pass 5). Derived per-run maps (zone, wall mask, inner corners, floor variant) and the 8x8-tile chunk cache.
// Spec: docs/architecture-render-2.md §2.1-2.2, architecture-modules-render.md (tiles.ts row), C3 (4-argument signature).
// Maps and chunk canvases live in res.tiles (resources.ts); this module keeps no state and never writes State. No rng, no random calls.
// The caller (render/index.ts) sets worldXf before drawTiles. Decor decals are NOT drawn here (GAP: no task or file owns decor.ts yet).
import type { State, Zone } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { depthOf, zoneOfDepth } from '../core/score.ts'
import { hash2 } from '../core/noise.ts'
import { getDepthField } from '../world/caches.ts'
import { getResources } from '../assets/resources.ts'
import type { TileCache } from '../assets/resources.ts'
import { drawSprite } from '../assets/images.ts'
import type { SpriteId } from '../assets/sprites.ts'
import type { Quality } from './quality.ts'
import type { View } from './view.ts'
import { ctx2d, newCanvas } from './light.ts'
import { CHUNK_TILES, chunkKey, tileKey, variantOf } from './keys.ts'

const HASH = 35 // '#'
const CHUNK_PX = CHUNK_TILES * TILE // 256 world px per chunk side
const LRU_CAP = 40 // render-2 §2.2: 40 x 256 KB = 10 MB
const BUILD_QUOTA = 4 // chunks built per frame; the rest are painted straight into the main context
const FLOOR_ID: Record<Zone, SpriteId> = { 1: 'tile_z1_floor', 2: 'tile_z2_floor', 3: 'tile_z3_floor', 4: 'tile_z4_floor' }
const WALL_ID: Record<Zone, SpriteId> = { 1: 'tile_z1_wall', 2: 'tile_z2_wall', 3: 'tile_z3_wall', 4: 'tile_z4_wall' }
const INNER_ID: Record<Zone, SpriteId> = { 1: 'tile_z1_inner', 2: 'tile_z2_inner', 3: 'tile_z3_inner', 4: 'tile_z4_inner' }
// Neighbour offsets: wall mask bits N=1 E=2 S=4 W=8; inner bits NE=1 SE=2 SW=4 NW=8 (render-2 §2.1).
const ORTHO: readonly (readonly [number, number, number])[] = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]]
const DIAG: readonly (readonly [number, number])[] = [[1, -1], [1, 1], [-1, 1], [-1, -1]] // NE, SE, SW, NW

// Zone map: reachable floor from the path field, every other cell from the nearest reachable floor tile (4-neighbour multi-source BFS).
function zoneMap(s: State): Uint8Array {
  const { w, h, tiles, beaconDist } = s.world, n = w * h, d = getDepthField(s)
  const zone = new Uint8Array(n), queue = new Int32Array(n)
  let qn = 0
  for (let i = 0; i < n; i++) {
    if (tiles.charCodeAt(i) === HASH || d[i] < 0) continue
    zone[i] = zoneOfDepth(depthOf(d[i], beaconDist))
    queue[qn++] = i
  }
  for (let qi = 0; qi < qn; qi++) {
    const i = queue[qi], x = i % w, y = (i - x) / w
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const j = ny * w + nx
      if (zone[j] === 0) { zone[j] = zone[i]; queue[qn++] = j }
    }
  }
  for (let i = 0; i < n; i++) if (zone[i] === 0) zone[i] = 1 // no reachable floor at all: zone 1, never 0
  return zone
}

function buildMaps(s: State, key: string): TileCache {
  const { w, h, tiles } = s.world, n = w * h
  const mask = new Uint8Array(n), inner = new Uint8Array(n), variant = new Uint8Array(n)
  const floorAt = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && tiles.charCodeAt(y * w + x) !== HASH // off-map = wall
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (tiles.charCodeAt(i) !== HASH) { variant[i] = variantOf(Math.floor(hash2(x, y, s.meta.seed) * 16)); continue }
      for (const [dx, dy, bit] of ORTHO) if (floorAt(x + dx, y + dy)) mask[i] |= bit
      // Inner corner k (NE, SE, SW, NW): both orthogonals around it are wall and the diagonal is floor.
      for (let k = 0; k < 4; k++) {
        const [dx, dy] = DIAG[k]
        if (!floorAt(x + dx, y) && !floorAt(x, y + dy) && floorAt(x + dx, y + dy)) inner[i] |= 1 << k
      }
    }
  }
  return { key, zone: zoneMap(s), mask, inner, variant, chunks: new Map(), lru: [] }
}

// Valid cache for the current world: maps rebuilt when tilesHash changed, chunks dropped when only the image generation changed.
// ponytail: null for a title/empty world. memory.ts reads the zone map through this too. Same tilesHash on a new run reuses the maps
// (same tiles give the same entrance and path field).
export function tileCache(s: State): TileCache | null {
  const { w, h, tiles, tilesHash } = s.world
  if (tiles.length !== w * h || w === 0) return null
  const res = getResources(), key = tileKey(tilesHash, res.images.gen)
  let t = res.tiles
  if (!t || !t.key.startsWith(tilesHash + ':')) {
    t = buildMaps(s, key)
    res.tiles = t
  } else if (t.key !== key) {
    t.chunks.clear()
    t.lru.length = 0
    t.key = key
  }
  return t
}

// Paints chunk (cx, cy) with its top-left at (-ox, -oy) relative to the world origin: cached chunks pass the chunk origin, the
// direct fallback passes 0, 0. Order inside a tile: floor, or wall then inner frames NE, SE, SW, NW.
function paintChunk(c: CanvasRenderingContext2D, s: State, t: TileCache, cx: number, cy: number, ox: number, oy: number): void {
  const { w, h, tiles } = s.world
  for (let ty = cy * CHUNK_TILES; ty < cy * CHUNK_TILES + CHUNK_TILES && ty < h; ty++) {
    for (let tx = cx * CHUNK_TILES; tx < cx * CHUNK_TILES + CHUNK_TILES && tx < w; tx++) {
      const i = ty * w + tx, x = tx * TILE - ox, y = ty * TILE - oy, z = t.zone[i] as Zone
      if (tiles.charCodeAt(i) !== HASH) {
        drawSprite(c, FLOOR_ID[z], 'v', t.variant[i], x, y)
        continue
      }
      drawSprite(c, WALL_ID[z], 'v', t.mask[i], x, y)
      for (let k = 0; k < 4; k++) if (t.inner[i] & (1 << k)) drawSprite(c, INNER_ID[z], 'v', k, x, y)
    }
  }
}

// Draws into the evicted canvas when the cache is full (no canvas allocation in steady state).
function buildChunk(s: State, t: TileCache, cx: number, cy: number, k: number): HTMLCanvasElement {
  let cv: HTMLCanvasElement | undefined
  if (t.lru.length >= LRU_CAP) cv = t.chunks.get(t.lru[0])
  if (t.lru.length >= LRU_CAP) { t.chunks.delete(t.lru[0]); t.lru.shift() }
  if (!cv) cv = newCanvas(CHUNK_PX, CHUNK_PX)
  const g = ctx2d(cv)
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.clearRect(0, 0, CHUNK_PX, CHUNK_PX)
  g.imageSmoothingEnabled = false
  paintChunk(g, s, t, cx, cy, cx * CHUNK_PX, cy * CHUNK_PX)
  t.chunks.set(k, cv)
  t.lru.push(k)
  return cv
}

// Pass 5. `_q` is reserved for the decor gate (q.decor), see the header. World transform is set by the caller.
export function drawTiles(ctx: CanvasRenderingContext2D, s: State, v: View, _q: Quality): void {
  const t = tileCache(s)
  if (!t) return
  ctx.imageSmoothingEnabled = false // exact z x z texels per world px
  let budget = BUILD_QUOTA
  for (let cy = v.ty0 >> 3; cy <= v.ty1 >> 3; cy++) {
    for (let cx = v.tx0 >> 3; cx <= v.tx1 >> 3; cx++) {
      const k = chunkKey(cx, cy)
      let cv = t.chunks.get(k)
      if (cv) {
        const at = t.lru.indexOf(k) // most recently used goes to the end
        if (at >= 0) t.lru.splice(at, 1)
        t.lru.push(k)
      } else if (budget > 0) {
        budget--
        cv = buildChunk(s, t, cx, cy, k)
      }
      if (cv) ctx.drawImage(cv, cx * CHUNK_PX, cy * CHUNK_PX)
      else paintChunk(ctx, s, t, cx, cy, 0, 0)
    }
  }
}
