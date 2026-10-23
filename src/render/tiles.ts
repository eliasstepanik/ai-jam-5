// L4 render: tile passes 5a/5b (2.5D, ADR-123). Derived per-run maps (zone, wall mask, inner corners, face variant) and the 8x8-tile
// chunk cache of TWO canvases per chunk: `floor` 256x256 and `walls` 256x304 (48 px south overhang), R-179/R-180/R-181.
// Spec: docs/architecture-render-2.md §2.1-2.2, architecture-modules-render.md (tiles.ts row). Paint helpers: tiles-paint.ts.
// Maps and chunk canvases live in res.tiles (resources.ts); this module keeps no state and never writes State. No rng, no random calls.
// The caller (render/index.ts) sets worldXf. Pass 5 is `drawFloor` + `drawWallRow` per row (the plan's `drawTileRow`).
// Ground and wall decor overlays are NOT drawn (GAP, as before: no task or file owns decor; `_q.decor` is reserved for that gate).
import type { State, Zone } from '../core/types.ts'
import { depthOf, zoneOfDepth } from '../core/score.ts'
import { getDepthField } from '../world/caches.ts'
import { getResources } from '../assets/resources.ts'
import type { Chunk, TileCache } from '../assets/resources.ts'
import type { Quality } from './quality.ts'
import type { View } from './view.ts'
import { ctx2d, newCanvas } from './light.ts'
import { CHUNK_TILES, chunkKey, tileKey } from './keys.ts'
import type { Tileset } from './tileset.ts'
import { CHUNK_PX, HASH, WALLS_H, faceVariant, paintFloor, paintWalls } from './tiles-paint.ts'

const LRU_CAP = 40 // render-2 §2.2: 40 x (256 + 304) x 256 x 4 B = 22 MB
const BUILD_QUOTA = 4 // chunks built per frame; the rest are painted straight into the main context
const TINT: readonly (string | null)[] = [null, null, '#b8c4d6', '#b4d0b0', '#c4b0d8'] // OD-D1 DEFAULT on: zone 1 none; index = zone
const TINT_ALPHA = 0.25
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

// Valid cache for the current world: maps rebuilt when tilesHash changed, chunks dropped when only the image generation changed.
// ponytail: null for a title/empty world. memory.ts reads the zone map through this too. Same tilesHash on a new run reuses the maps
// (same tiles give the same entrance and path field). Ceiling: the face variant uses the seed of the run that built the maps; a new
// seed with identical tiles keeps the old variants. Upgrade: put the seed in the key.
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

// DEFAULT: the tileset sheet is the first external sheet (`res.images.sheets[0]`, cave_tileset.png; charatlas.ts uses index 1). Until it
// has decoded (or when images.ts does not load it yet) the paint helpers draw flat per-zone fills; `images.gen` rebuilds chunks later.
function tilesetOf(): Tileset | null {
  const im = getResources().images, img = im.sheets[0]
  return img && im.sheetState[0] === 'ok' ? { image: img } : null
}

// Zone tint (OD-D1): the chunk's majority zone colour at alpha 0.25 over what is already painted. ponytail: 'source-atop' (a plain blend
// toward the colour that leaves the transparent walls canvas alone) instead of the spec's multiply, which would colour transparent
// pixels. Ceiling: lighter than a true multiply. Upgrade: multiply on the floor canvas only.
function tint(g: CanvasRenderingContext2D, s: State, t: TileCache, cx: number, cy: number): void {
  const { w, h } = s.world, n = [0, 0, 0, 0, 0]
  for (let ty = cy * CHUNK_TILES; ty < Math.min(h, (cy + 1) * CHUNK_TILES); ty++) {
    for (let tx = cx * CHUNK_TILES; tx < Math.min(w, (cx + 1) * CHUNK_TILES); tx++) n[t.zone[ty * w + tx]]++
  }
  let z = 1
  for (let k = 2; k <= 4; k++) if (n[k] > n[z]) z = k
  const col = TINT[z as Zone]
  if (!col) return
  g.globalCompositeOperation = 'source-atop'
  g.globalAlpha = TINT_ALPHA
  g.fillStyle = col
  g.fillRect(0, 0, g.canvas.width, g.canvas.height)
  g.globalAlpha = 1
  g.globalCompositeOperation = 'source-over'
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

// Builds chunk (cx, cy); a full cache recycles the evicted pair (no canvas allocation in steady state). The walls canvas paints the tile
// rows of the chunk plus the two rows above it: a face hangs 48 px = rows r+1 and 16 px of r+2, so those faces reach into this chunk's
// first rows and every band of `walls` is complete on its own (DEFAULT; render-2 §2.2 repaints only the chunk's own first-row faces).
// The bottom 48 px overhang holds the faces of the last rows as specified; drawWallRow never samples it.
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
  paintWalls(gw, s, t, ts, cx * CHUNK_TILES, (cx + 1) * CHUNK_TILES, cy * CHUNK_TILES - 2, (cy + 1) * CHUNK_TILES, ox, oy, true)
  tint(gf, s, t, cx, cy)
  tint(gw, s, t, cx, cy)
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

// Pass 5b, once per visible tile row `ty`: the band [ty * 32, ty * 32 + 32) of every visible chunk's walls canvas (caps, faces, ores),
// so the actors of that row interleave with it (R-180). A chunk without canvases is painted directly, clipped to the band, without the
// inner-corner cutouts (destination-out would erase the floor beneath).
// ponytail: those corners look square until the chunk is built (at most a few frames). Upgrade: build into a scratch canvas.
export function drawWallRow(ctx: CanvasRenderingContext2D, s: State, v: View, ty: number): void {
  const t = tileCache(s)
  if (!t || ty < 0 || ty >= s.world.h) return
  const ts = tilesetOf(), cy = ty >> 3, sy = (ty & 7) * 32
  ctx.imageSmoothingEnabled = false
  for (let cx = v.tx0 >> 3; cx <= v.tx1 >> 3; cx++) {
    const ch = t.chunks.get(chunkKey(cx, cy))
    if (ch) {
      ctx.drawImage(ch.walls, 0, sy, CHUNK_PX, 32, cx * CHUNK_PX, ty * 32, CHUNK_PX, 32)
      continue
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(cx * CHUNK_PX, ty * 32, CHUNK_PX, 32)
    ctx.clip()
    paintWalls(ctx, s, t, ts, cx * CHUNK_TILES, (cx + 1) * CHUNK_TILES, ty - 2, ty + 1, 0, 0, false)
    ctx.restore()
  }
}
