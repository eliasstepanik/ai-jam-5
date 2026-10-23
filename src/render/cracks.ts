// L4 render: crack decor selection and placement (issue #85). Pure and DOM-free: a crack is a function of (tile, seed, special cells) only.
// No rng, no module state, so chunk canvases can be rebuilt in any order and always show the same cracks. The blit itself is a callback
// supplied by tiles-paint.ts, so checks can run the real placement loops with a recording callback.
// The tileset frames are `ground_crack_01..04`, `ground_crack_large_01..06` (overlay_ground) and `wall_crack_01..03` (overlay_wall).
import type { State } from '../core/types.ts'
import { TILE } from '../core/state.ts'
import { hash2 } from '../core/noise.ts'
import { getBeaconRoom } from '../world/caches.ts'
import { CHUNK_TILES } from './keys.ts'

const WALL_CH = 35 // '#'
const G_SALT = 0x6c61, G_KIND_SALT = 0x6c62, W_SALT = 0x7761 // DEFAULT: salts, distinct from FACE_SALT 0x9e37 and the floor hash

export const GROUND_P = 0.05 // share of floor tiles that ANCHOR a ground crack (large ones are dropped when they would not fit, so the drawn share is a little lower)
export const WALL_P = 0.08 // share of south-facing wall faces that carry a wall crack
export const LARGE_SHARE = 0.15 // share of ground cracks that are large (96x64 .. 128x96)
// A large frame is centred on its tile and spans at most 128 x 96 px: 5 x 3 tiles, all of which must be plain floor.
export const LARGE_RX = 2
export const LARGE_RY = 1

const nums = (p: string, n: number): string[] => Array.from({ length: n }, (_, i) => p + '0' + (i + 1))
export const GROUND_SMALL: readonly string[] = nums('ground_crack_', 4)
export const GROUND_LARGE: readonly string[] = nums('ground_crack_large_', 6)
export const WALL_CRACKS: readonly string[] = nums('wall_crack_', 3)
export const ALL_CRACK_FRAMES: readonly string[] = [...GROUND_SMALL, ...GROUND_LARGE, ...WALL_CRACKS]

// `skip(i)` marks tiles that must stay clean (entrance, exit, Beacon chamber): index into `tiles`, row-major.
export type Skip = (i: number) => boolean

const isFloor = (tiles: string, w: number, h: number, x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && tiles.charCodeAt(y * w + x) !== WALL_CH

// Ground crack frame anchored at floor tile (tx, ty), or null. Anchor = tile centre (drawn at tx*32+16, ty*32+16).
export function groundCrack(tiles: string, w: number, h: number, tx: number, ty: number, seed: number, skip: Skip): string | null {
  if (!isFloor(tiles, w, h, tx, ty) || hash2(tx, ty, seed ^ G_SALT) >= GROUND_P) return null
  const k = hash2(tx, ty, seed ^ G_KIND_SALT)
  if (k >= LARGE_SHARE) {
    if (skip(ty * w + tx)) return null
    return GROUND_SMALL[Math.floor(((k - LARGE_SHARE) / (1 - LARGE_SHARE)) * GROUND_SMALL.length)]
  }
  for (let y = ty - LARGE_RY; y <= ty + LARGE_RY; y++) {
    for (let x = tx - LARGE_RX; x <= tx + LARGE_RX; x++) if (!isFloor(tiles, w, h, x, y) || skip(y * w + x)) return null
  }
  return GROUND_LARGE[Math.floor((k / LARGE_SHARE) * GROUND_LARGE.length)]
}

// Wall crack frame for wall tile (tx, ty): only when the tile below is clean floor (the face is visible, bit S of the wall mask).
export function wallCrack(tiles: string, w: number, h: number, tx: number, ty: number, seed: number, skip: Skip): string | null {
  if (tx < 0 || ty < 0 || tx >= w || ty >= h || tiles.charCodeAt(ty * w + tx) !== WALL_CH) return null
  if (!isFloor(tiles, w, h, tx, ty + 1) || skip(ty * w + tx) || skip((ty + 1) * w + tx)) return null
  const u = hash2(tx, ty, seed ^ W_SALT)
  return u < WALL_P ? WALL_CRACKS[Math.floor((u / WALL_P) * WALL_CRACKS.length)] : null
}

// Draw callback: frame `name` with its anchor at (x, y) in the target canvas (tiles-paint.ts passes `blit`).
export type Draw = (name: string, x: number, y: number) => void

// Tiles that stay free of crack decor: entrance (= exit), the Beacon chamber and vein walls (their ore frame covers the face).
// Pickups and landed rocks are dynamic and not in the chunk cache key, so they are not excluded: cracks are flat decals below props.
export function cleanCells(s: State): Skip {
  const { w, entrance } = s.world, room = getBeaconRoom(s), ei = entrance.ty * w + entrance.tx, veins = new Set<number>()
  for (const v of s.veins) veins.add(v.tile)
  return (i) => i === ei || room[i] === 1 || veins.has(i)
}

// Ground cracks for chunk (cx, cy), canvas origin at world pixel (ox, oy). Large frames reach LARGE_RX / LARGE_RY tiles out, so anchors in the
// margin around the chunk are visited too; a neighbour chunk derives the same crack from the same tile, so the overdraw is identical.
export function groundCracks(s: State, cx: number, cy: number, ox: number, oy: number, draw: Draw): void {
  const { w, h, tiles } = s.world, seed = s.meta.seed, skip = cleanCells(s)
  const tx1 = (cx + 1) * CHUNK_TILES + LARGE_RX, ty1 = (cy + 1) * CHUNK_TILES + LARGE_RY
  for (let ty = cy * CHUNK_TILES - LARGE_RY; ty < ty1; ty++) {
    for (let tx = cx * CHUNK_TILES - LARGE_RX; tx < tx1; tx++) {
      const name = groundCrack(tiles, w, h, tx, ty, seed, skip)
      if (name) draw(name, tx * TILE - ox + TILE / 2, ty * TILE - oy + TILE / 2)
    }
  }
}

// Wall crack for wall tile (tx, ty), drawn with its anchor at (ax, ay) = the middle of the tile's south face (the caller knows the face height).
export function wallCrackAt(s: State, skip: Skip, tx: number, ty: number, ax: number, ay: number, draw: Draw): void {
  const { w, h, tiles } = s.world, name = wallCrack(tiles, w, h, tx, ty, s.meta.seed, skip)
  if (name) draw(name, ax, ay)
}
