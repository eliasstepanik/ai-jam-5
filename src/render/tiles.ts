// L4 render: tile passes 5a/5b (2.5D, ADR-123). Derived per-run maps (zone, wall mask, inner corners, face variant) and the 8x8-tile
// chunk cache of TWO canvases per chunk: `floor` 256x256 and `walls` 256x896 (eight independent complete wall rows).
// Spec: docs/architecture-render-2.md §2.1-2.2, architecture-modules-render.md (tiles.ts row). Paint helpers: tiles-paint.ts.
// Maps and chunk canvases live in res.tiles (resources.ts); this module keeps no state and never writes State. No rng, no random calls.
// The caller (render/index.ts) sets worldXf. Pass 5 is `drawFloor` + `drawWallRow` per row (the plan's `drawTileRow`).
// Ground and wall decor overlays are NOT drawn (GAP, as before: no task or file owns decor; `_q.decor` is reserved for that gate).
import type { State } from '../core/types.ts'
import { depthOf, zoneOfDepth } from '../core/score.ts'
import { getDepthField } from '../world/caches.ts'
import { getResources } from '../assets/resources.ts'
import type { Chunk, TileCache } from '../assets/resources.ts'
import type { Quality } from './quality.ts'
import type { View } from './view.ts'
import { ctx2d, newCanvas } from './light.ts'
import { CHUNK_TILES, chunkKey, tileKey } from './keys.ts'
import { tilesetOf } from './tileset.ts'
import type { Tileset } from './tileset.ts'
import { CHUNK_PX, FACE_H, WALL_PAD, HASH, WALL_ROW_H, WALLS_H, faceVariant, paintFloor, paintWalls } from './tiles-paint.ts'

const LRU_CAP = 24 // 24 x (256 + 896) x 256 x 4 B = 28 MB; complete row strips preserve the cache budget
const BUILD_QUOTA = 4 // chunks built per frame; the rest are painted straight into the main context
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

// `variant` holds the wall face variant 0..3 only; floor variants are computed per 24 px cell at paint time (render-2 §2.1).
function buildMaps(s: State, key: string): TileCache {
  const { w, h, tiles } = s.world, n = w * h
  const mask = new Uint8Array(n), inner = new Uint8Array(n), variant = new Uint8Array(n)
  const floorAt = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && tiles.charCodeAt(y * w + x) !== HASH // off-map = wall
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (tiles.charCodeAt(i) !== HASH) continue
      variant[i] = faceVariant(x, y, s.meta.seed)
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

// Valid cache for the current world: maps rebuilt when tilesHash changed, chunks dropped when only the image generation or the vein generation (a vein was mined) changed.
// ponytail: null for a title/empty world. memory.ts reads the zone map through this too. Same tilesHash on a new run reuses the maps
// (same tiles give the same entrance and path field). Ceiling: the face variant uses the seed of the run that built the maps; a new
// seed with identical tiles keeps the old variants. Upgrade: put the seed in the key.
export function tileCache(s: State): TileCache | null {
  const { w, h, tiles, tilesHash } = s.world
  if (tiles.length !== w * h || w === 0) return null
  const res = getResources(), key = tileKey(tilesHash, res.images.gen, s.world.veinGen)
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

function reset(cv: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const g = ctx2d(cv)
  g.setTransform(1, 0, 0, 1, 0, 0)
  g.globalCompositeOperation = 'source-over'
  g.globalAlpha = 1
  g.clearRect(0, 0, w, h)
  g.imageSmoothingEnabled = false
  return g
}

// Builds independent cap+face strips for each tile row. A flattened wall canvas cannot be interleaved with actors:
// a foreground cap must hide the actor behind it, while a background face must stay behind the actor in front.
// A full cache recycles the evicted pair; chunk canvases remain bounded by LRU_CAP.
function buildChunk(s: State, t: TileCache, ts: Tileset | null, cx: number, cy: number, k: number): Chunk {
  let ch: Chunk | undefined
  if (t.lru.length >= LRU_CAP) {
    ch = t.chunks.get(t.lru[0])
    t.chunks.delete(t.lru[0])
    t.lru.shift()
  }
  const ox = cx * CHUNK_PX, oy = cy * CHUNK_PX
  const floor = ch?.floor ?? newCanvas(CHUNK_PX, CHUNK_PX), walls = ch?.walls ?? newCanvas(CHUNK_PX, WALLS_H)
  const gf = reset(floor, CHUNK_PX, CHUNK_PX), gw = reset(walls, CHUNK_PX, WALLS_H)
  paintFloor(gf, s, t, ts, cx, cy, ox, oy)
  for (let row = 0; row < CHUNK_TILES; row++) {
    const ty = cy * CHUNK_TILES + row
    gw.save(); gw.beginPath(); gw.rect(0, row * WALL_ROW_H, CHUNK_PX, WALL_ROW_H); gw.clip()
    paintWalls(gw, s, t, ts, cx * CHUNK_TILES - 2, (cx + 1) * CHUNK_TILES + 2, ty, ty + 1, ox, ty * 32 - FACE_H - WALL_PAD - row * WALL_ROW_H)
    gw.restore()
  }
  const made = { floor, walls }
  t.chunks.set(k, made)
  t.lru.push(k)
  return made
}

// Pass 5a: every visible chunk's floor canvas (24 px pattern, R-179) before the row loop. Builds up to BUILD_QUOTA chunks; a visible chunk
// without canvases is painted straight into the main context so the view is never incomplete. `_q` is reserved for the decor gate.
export function drawFloor(ctx: CanvasRenderingContext2D, s: State, v: View, _q: Quality): void {
  const t = tileCache(s)
  if (!t) return
  const ts = tilesetOf()
  ctx.imageSmoothingEnabled = false // exact z x z texels per world px
  let budget = BUILD_QUOTA
  for (let cy = v.ty0 >> 3; cy <= v.ty1 >> 3; cy++) {
    for (let cx = v.tx0 >> 3; cx <= v.tx1 >> 3; cx++) {
      const k = chunkKey(cx, cy)
      let ch = t.chunks.get(k)
      if (ch) {
        const at = t.lru.indexOf(k) // most recently used goes to the end
        if (at >= 0) t.lru.splice(at, 1)
        t.lru.push(k)
      } else if (budget > 0) {
        budget--
        ch = buildChunk(s, t, ts, cx, cy, k)
      }
      if (ch) ctx.drawImage(ch.floor, cx * CHUNK_PX, cy * CHUNK_PX)
      else paintFloor(ctx, s, t, ts, cx, cy, 0, 0)
    }
  }
}

// Pass 5b: draw the complete wall of ground row ty before that row's actors. Raising the wall by FACE_H aligns
// its south base with collision; drawing its full height here lets the next ground row's caps occlude actors to the north.
// Cold rows use the same padded strip as cached rows, including cross-chunk overhang.
export function drawWallRow(ctx: CanvasRenderingContext2D, s: State, v: View, ty: number): void {
  const t = tileCache(s)
  if (!t || ty < 0 || ty >= s.world.h) return
  const ts = tilesetOf(), cy = ty >> 3, sy = (ty & 7) * WALL_ROW_H
  ctx.imageSmoothingEnabled = false
  for (let cx = v.tx0 >> 3; cx <= v.tx1 >> 3; cx++) {
    const ch = t.chunks.get(chunkKey(cx, cy))
    if (ch) {
      ctx.drawImage(ch.walls, 0, sy, CHUNK_PX, WALL_ROW_H, cx * CHUNK_PX, ty * 32 - FACE_H - WALL_PAD, CHUNK_PX, WALL_ROW_H)
    } else {
      const res = getResources(), key = 'wall-row-v5'
      let canvas = res.light.get(key)
      if (!canvas) { canvas = newCanvas(CHUNK_PX, WALL_ROW_H); res.light.set(key, canvas) }
      const g = reset(canvas, CHUNK_PX, WALL_ROW_H), y = ty * 32 - FACE_H - WALL_PAD
      paintWalls(g, s, t, ts, cx * CHUNK_TILES - 2, (cx + 1) * CHUNK_TILES + 2, ty, ty + 1, cx * CHUNK_PX, y)
      ctx.drawImage(canvas, cx * CHUNK_PX, y)
    }
  }
}
